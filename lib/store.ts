import { promises as fs } from "fs";
import path from "path";
import type { WaveResult } from "./types";

// Tiny on-disk store so generated media outlives the 2h BFL URLs and presets replay instantly.
const ROOT = path.join(process.cwd(), ".data");
const dir = async (sub: string) => {
  const d = path.join(ROOT, sub);
  await fs.mkdir(d, { recursive: true });
  return d;
};

export interface Job {
  id: string;
  kind: "image" | "video";
  pollingUrl: string;
  slug: string;
  searchId: string;
  sceneId: string;
  model: string;
  prompt: string;
  createdAt: number;
  status: "pending" | "ready" | "failed";
  file?: string;
  error?: string;
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "unknown";

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function saveResult(r: WaveResult) {
  await fs.writeFile(path.join(await dir("results"), `${r.slug}.json`), JSON.stringify(r, null, 2));
}

export async function loadResult(slug: string) {
  return readJson<WaveResult>(path.join(await dir("results"), `${slug}.json`));
}

export async function saveJob(j: Job) {
  await fs.writeFile(path.join(await dir("jobs"), `${j.id}.json`), JSON.stringify(j, null, 2));
}

export async function loadJob(id: string) {
  if (!/^[\w-]+$/.test(id)) return null;
  return readJson<Job>(path.join(await dir("jobs"), `${id}.json`));
}

export async function saveMedia(id: string, ext: string, data: ArrayBuffer) {
  const file = `${id}.${ext}`;
  await fs.writeFile(path.join(await dir("media"), file), Buffer.from(data));
  return file;
}

export async function readMedia(file: string) {
  if (!/^[\w-]+\.(jpg|jpeg|png|webp|mp4)$/.test(file)) return null;
  try {
    return await fs.readFile(path.join(await dir("media"), file));
  } catch {
    return null;
  }
}

/** Patch one scene slot in a cached result once its job finishes. */
export async function updateSlot(job: Job) {
  const r = await loadResult(job.slug);
  if (!r || r.searchId !== job.searchId) return;
  const scene = r.scenes.find((s) => s.id === job.sceneId);
  const slot = job.kind === "video" ? scene?.video : scene?.image;
  if (!slot) return;
  slot.status = job.status;
  slot.url = job.file ? `/api/media/${job.file}` : null;
  if (job.error) slot.error = job.error;
  await saveResult(r);
}
