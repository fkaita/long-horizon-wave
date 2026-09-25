import sharp from "sharp";
import type { NimbleResponse } from "./nimble";

// Find a real photo of the beach: og:image from Nimble's result pages, then Wikimedia Commons.
// Every candidate must pass a local CLIP check ("is this a beach photo?") + a flatness check (rejects text cards).

const BEACH_LABELS = ["a photo of a beach and the ocean", "a photo of ocean waves and a coastline"];
const OTHER_LABELS = [
  "a graphic with text",
  "a website banner with a title and numbers",
  "a logo",
  "a screenshot of a web page",
  "a map",
  "a city street or buildings",
  "a portrait of people",
  "food",
  "an indoor room",
  "a mountain or forest without sea",
];
const MIN_BEACH = 0.8;
const MAX_FLAT = 0.7;
const MAX_WATERMARK = 0.6;
const STYLE_LABELS = ["a real photograph", "an AI-generated image", "a digital illustration or painting", "a photo with a watermark"];
// AI-image galleries and watermarked stock sites: never real, usable photos
const BLOCKED = /tripadvisor|facebook|instagram|youtube|pinterest|kupi\.com|shutterstock|gettyimages|istockphoto|alamy|dreamstime|depositphotos|123rf|stock\.adobe|freepik|vecteezy|midjourney|lexica|openart|nightcafe|playground\.com/i;
const UA = "LongHorizon/0.1 (hackathon demo; https://github.com/fkaita/long-horizon-wave)";

export interface Candidate {
  imageUrl: string;
  pageUrl: string;
  origin: "nimble" | "wikimedia";
}

export interface CheckedPhoto extends Candidate {
  ok: boolean;
  beach: number;
  watermark: number;
  flat: number;
  width: number;
  height: number;
  reason?: string;
  jpeg?: Buffer; // 16:9 crop, ready for BFL
}

// ---------- CLIP (loaded once per server process) ----------
type Classifier = (img: unknown, labels: string[]) => Promise<{ label: string; score: number }[]>;
const g = globalThis as unknown as { __clip?: Promise<Classifier> };

export function loadClassifier(): Promise<Classifier> {
  g.__clip ??= (async () => {
    const { pipeline } = await import("@huggingface/transformers");
    return (await pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32")) as unknown as Classifier;
  })();
  return g.__clip;
}

/** CLIP scores: how "beach photo" it is, and how likely it carries a watermark. */
async function clipScores(buf: Buffer): Promise<{ beach: number; watermark: number }> {
  const { RawImage } = await import("@huggingface/transformers");
  const clf = await loadClassifier();
  const px = await sharp(buf).resize(224, 224, { fit: "cover" }).removeAlpha().raw().toBuffer();
  const img = new RawImage(new Uint8ClampedArray(px), 224, 224, 3);
  const [content, style] = [await clf(img, [...BEACH_LABELS, ...OTHER_LABELS]), await clf(img, STYLE_LABELS)];
  return {
    beach: content.filter((o) => BEACH_LABELS.includes(o.label)).reduce((a, o) => a + o.score, 0),
    watermark: style.find((o) => o.label === "a photo with a watermark")?.score ?? 0,
  };
}

/** Share of neighbouring pixels that are identical. Graphics/text cards ≈ 0.85, photos ≈ 0.05–0.5. */
async function flatness(buf: Buffer): Promise<number> {
  const { data, info } = await sharp(buf).resize(256, 256, { fit: "cover" }).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  let flat = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width - 1; x++) if (data[y * info.width + x] === data[y * info.width + x + 1]) flat++;
  return flat / (info.height * (info.width - 1));
}

// ---------- candidates ----------
const OG_RE = [
  /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]*content=["']([^"']+)/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)/i,
];

async function ogImage(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000), redirect: "follow" });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 400_000);
    for (const re of OG_RE) {
      const m = html.match(re);
      if (m) return new URL(m[1].replace(/&amp;/g, "&"), pageUrl).toString();
    }
  } catch {}
  return null;
}

async function wikimedia(query: string): Promise<Candidate[]> {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=6" +
    `&gsrsearch=${encodeURIComponent(`${query} beach filetype:bitmap`)}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1600`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
    const json = await res.json();
    const pages = Object.values(json.query?.pages ?? {}) as { index: number; imageinfo?: { thumburl?: string; url: string; descriptionurl: string; width: number; height: number }[] }[];
    return pages
      .sort((a, b) => a.index - b.index)
      .map((p) => p.imageinfo?.[0])
      .filter((i): i is NonNullable<typeof i> => !!i && i.width > i.height)
      .map((i) => ({ imageUrl: i.thumburl ?? i.url, pageUrl: i.descriptionurl, origin: "wikimedia" as const }));
  } catch {
    return [];
  }
}

async function check(c: Candidate): Promise<CheckedPhoto> {
  const base = { ...c, ok: false, beach: 0, watermark: 0, flat: 1, width: 0, height: 0 };
  if (BLOCKED.test(c.imageUrl) || BLOCKED.test(c.pageUrl)) return { ...base, reason: "blocked source (AI / stock)" };
  try {
    const res = await fetch(c.imageUrl, { headers: { "User-Agent": c.origin === "wikimedia" ? UA : "Mozilla/5.0" }, signal: AbortSignal.timeout(7000) });
    if (!res.ok) return { ...base, reason: `http ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const sized = { ...base, width, height };
    if (width < 700 || height < 380) return { ...sized, reason: "too small" };
    const aspect = width / height;
    if (aspect < 1.2 || aspect > 2.6) return { ...sized, reason: "not landscape" };
    const [{ beach, watermark }, flat] = await Promise.all([clipScores(buf), flatness(buf)]);
    const checked = { ...sized, beach, watermark, flat };
    if (flat > MAX_FLAT) return { ...checked, reason: "looks like a graphic" };
    if (watermark >= MAX_WATERMARK) return { ...checked, reason: "watermarked" };
    if (beach < MIN_BEACH) return { ...checked, reason: "not a beach photo" };
    const jpeg = await sharp(buf).resize(1456, 816, { fit: "cover", position: "attention" }).jpeg({ quality: 90 }).toBuffer();
    return { ...checked, ok: true, jpeg };
  } catch (e) {
    return { ...base, reason: (e as Error).message.slice(0, 80) };
  }
}

/** Returns the best verified beach photo (or null) and every candidate's verdict. */
export async function findRealPhoto(query: string, ...nimble: (NimbleResponse | null)[]) {
  const pages = [...new Set(nimble.flatMap((r) => r?.results ?? []).map((r) => r.url))].filter((u) => !BLOCKED.test(u)).slice(0, 8);
  const [og, wiki] = await Promise.all([
    Promise.all(pages.map(async (p) => ({ imageUrl: await ogImage(p), pageUrl: p }))),
    wikimedia(query.split(",")[0]),
  ]);
  const seen = new Set<string>();
  const candidates: Candidate[] = [
    ...og.filter((c): c is { imageUrl: string; pageUrl: string } => !!c.imageUrl).map((c) => ({ ...c, origin: "nimble" as const })),
    ...wiki,
  ].filter((c) => !seen.has(c.imageUrl) && seen.add(c.imageUrl));

  const checked = await Promise.all(candidates.map(check));
  // Prefer the most confidently-beach photo; web pages first on ties (they tend to be hero shots of the exact spot)
  const best = checked.filter((c) => c.ok).sort((a, b) => b.beach - a.beach || (a.origin === "nimble" ? -1 : 1))[0] ?? null;
  return { best, checked };
}
