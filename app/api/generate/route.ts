import { randomUUID } from "crypto";
import { forecast, geocode } from "@/lib/openmeteo";
import { allText, searchLocation, toSources, type NimbleResponse } from "@/lib/nimble";
import { beachTraits, conditionsFromText, planScenes, waterDescription } from "@/lib/structure";
import { editPrompt, imagePrompt, videoPrompt } from "@/lib/prompts";
import { findRealPhoto } from "@/lib/photo";
import { insert, rawtreeEnabled, stamp } from "@/lib/rawtree";
import { imageModel, submitImage, submitVideo, videoEnabled, videoModel, waitFor } from "@/lib/blackforest";
import { loadResult, saveJob, saveMedia, saveResult, slugify, type Job } from "@/lib/store";
import type { MediaSlot, RealPhoto, Scene, WaveResult } from "@/lib/types";

export const maxDuration = 120;

const CACHE_MS = Number(process.env.CACHE_HOURS || 12) * 60 * 60 * 1000;

export async function POST(req: Request) {
  const { location, fresh } = (await req.json().catch(() => ({}))) as { location?: string; fresh?: boolean };
  const query = location?.trim().slice(0, 120);
  if (!query) return Response.json({ error: "Enter a coastal location" }, { status: 400 });

  const slug = slugify(query);
  if (!fresh) {
    const cached = await loadResult(slug);
    if (cached && Date.now() - Date.parse(cached.createdAt) < CACHE_MS) return Response.json({ ...cached, cached: true });
  }

  const pipeline: WaveResult["pipeline"] = [];
  const step = async <T,>(name: string, fn: () => Promise<T>, detail?: (v: T) => string): Promise<T | null> => {
    const t = Date.now();
    try {
      const v = await fn();
      pipeline.push({ step: name, ok: true, ms: Date.now() - t, detail: detail?.(v) });
      return v;
    } catch (e) {
      pipeline.push({ step: name, ok: false, ms: Date.now() - t, detail: (e as Error).message });
      return null;
    }
  };

  // 1. Geocode + Nimble in parallel (Nimble only needs the text query)
  const [loc, nimble] = await Promise.all([
    step("Locate", () => geocode(query), (l) => (l ? `${l.displayName} (${l.latitude.toFixed(2)}, ${l.longitude.toFixed(2)})` : "not found")),
    step("Nimble search", () => {
      if (!process.env.NIMBLE_API_KEY) throw new Error("NIMBLE_API_KEY not set — skipped");
      return searchLocation(query);
    }, (n) => `${(n.surf?.results?.length ?? 0) + (n.beach?.results?.length ?? 0)} live web results`),
  ]);
  if (!loc) return Response.json({ error: `Couldn't find "${query}". Try adding a city or country.`, pipeline }, { status: 404 });

  // 2. Marine + weather forecast, and a verified real photo of the beach (in parallel)
  const [fc, photoSearch] = await Promise.all([
    step("Marine forecast", () => forecast(loc.latitude, loc.longitude), (f) =>
      f.marine ? "Open-Meteo marine + weather models" : "no marine data for this point",
    ),
    process.env.USE_REAL_PHOTO === "false"
      ? Promise.resolve(null)
      : step("Real photo", () => findRealPhoto(query, nimble?.surf ?? null, nimble?.beach ?? null), (r) =>
          r.best
            ? `${new URL(r.best.pageUrl).host} · beach ${r.best.beach.toFixed(2)} · ${r.checked.filter((c) => c.ok).length}/${r.checked.length} candidates passed`
            : `none of ${r.checked.length} candidates passed the beach check`,
        ),
  ]);
  const realPhoto = photoSearch?.best ?? null;

  // 3. Structure
  const surf: NimbleResponse | null = nimble?.surf ?? null;
  const beach: NimbleResponse | null = nimble?.beach ?? null;
  const text = allText(surf, beach);
  const plans = planScenes(fc ?? { marine: null, weather: null });
  const notes: string[] = [];
  const now = plans[0].conditions;
  if (now.wave_height_ft == null) {
    Object.assign(now, conditionsFromText(allText(surf)));
    notes.push(now.wave_height_ft != null ? "Wave height read from live surf reports (Nimble)." : "No wave data found for this spot; waves are unknown.");
  }
  const beachType = beachTraits(text);
  const water = waterDescription(now.water_temp_f, loc.latitude);
  const confidence: WaveResult["confidence"] =
    now.source === "open-meteo" && surf?.results?.length ? "high" : now.source !== "none" ? "medium" : "low";
  if (!beachType) notes.push("Beach character not found in search results.");
  pipeline.push({ step: "Structure", ok: true, ms: 0, detail: `confidence ${confidence}` });

  // 4. Prompts + submit generations
  const searchId = randomUUID();
  // Keep the user's words ("Ocean Beach") — the geocoder often only resolves the city
  const plain = (t: string) => t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const place = plain(query).includes(plain(loc.name)) ? `${query}${loc.country && !query.includes(loc.country) ? `, ${loc.country}` : ""}` : `${query} (${loc.displayName})`;
  const jobs: Job[] = [];
  const mkSlot = async (kind: Job["kind"], sceneId: string, prompt: string, submit: () => Promise<{ id: string; polling_url: string }>): Promise<MediaSlot> => {
    try {
      const s = await submit();
      const job: Job = { id: s.id, kind, pollingUrl: s.polling_url, slug, searchId, sceneId, prompt, model: kind === "video" ? videoModel() : imageModel(), createdAt: Date.now(), status: "pending" };
      jobs.push(job);
      await saveJob(job);
      return { jobId: s.id, status: "pending", url: null };
    } catch (e) {
      return { jobId: null, status: "failed", url: null, error: (e as Error).message };
    }
  };

  /** Wait for a still to finish, cache it locally, and return its BFL URL for use as the video keyframe. */
  const settle = async (image: MediaSlot): Promise<string | undefined> => {
    const imgJob = jobs.find((j) => j.id === image.jobId);
    if (!imgJob) return undefined;
    const r = await waitFor(imgJob.pollingUrl);
    if (r.status !== "ready" || !r.sample) return undefined;
    imgJob.file = await saveMedia(imgJob.id, "jpg", await (await fetch(r.sample)).arrayBuffer());
    imgJob.status = "ready";
    await saveJob(imgJob);
    Object.assign(image, { status: "ready", url: `/api/media/${imgJob.file}` });
    return r.sample;
  };

  let photo: RealPhoto | null = null;
  const t0 = Date.now();
  const scenes: Scene[] = await Promise.all(
    plans.map(async (p) => {
      const input = { location: place, conditions: p.conditions, timeOfDay: p.timeOfDay, beachType, water };
      let prompt = imagePrompt(input);
      let image: MediaSlot = { jobId: null, status: "skipped", url: null };
      let keyframe: string | undefined;

      if (realPhoto?.jpeg) {
        // Real photo → (optionally) re-light it to right now with FLUX.2 → animate
        const file = await saveMedia(`photo-${searchId}`, "jpg", new Uint8Array(realPhoto.jpeg).buffer);
        photo = {
          url: `/api/media/${file}`,
          pageUrl: realPhoto.pageUrl,
          host: new URL(realPhoto.pageUrl).host.replace(/^www\./, ""),
          origin: realPhoto.origin,
          beachScore: Math.round(realPhoto.beach * 100) / 100,
          edited: false,
        };
        if (process.env.PHOTO_EDIT !== "false") {
          prompt = editPrompt(input);
          image = await mkSlot("image", p.id, prompt, () => submitImage(prompt, realPhoto.jpeg));
          keyframe = await settle(image);
          photo.edited = Boolean(keyframe);
        }
        if (!keyframe) {
          // Edit disabled or failed: animate the untouched real photo
          image = { jobId: null, status: "ready", url: photo.url };
          keyframe = `data:image/jpeg;base64,${realPhoto.jpeg.toString("base64")}`;
        }
      } else {
        // No verified photo: generate the still from scratch
        image = await mkSlot("image", p.id, prompt, () => submitImage(prompt));
        keyframe = await settle(image);
      }

      const video = videoEnabled() ? await mkSlot("video", p.id, videoPrompt(input), () => submitVideo(videoPrompt(input), keyframe)) : undefined;
      return { ...p, prompt, image, video };
    }),
  );
  const submitted = scenes.flatMap((s) => [s.image, s.video]).filter((m) => m?.jobId).length;
  const firstErr = scenes.flatMap((s) => [s.image, s.video]).find((m) => m?.error)?.error;
  pipeline.push({ step: "Black Forest Labs", ok: submitted > 0, ms: Date.now() - t0, detail: submitted ? `${submitted} generations queued (${imageModel()}${videoEnabled() ? ` + ${videoModel()}` : ""})` : firstErr });

  const result: WaveResult = {
    searchId,
    slug,
    createdAt: new Date().toISOString(),
    location: loc,
    beach_type: beachType,
    water_description: water,
    confidence,
    notes,
    sources: toSources(surf, beach).slice(0, 6),
    scenes,
    photo,
    pipeline,
  };

  // 5. Log everything to RawTree
  await step("RawTree", async () => {
    if (!rawtreeEnabled()) throw new Error("RAWTREE_API_KEY not set — skipped");
    await Promise.all([
      insert("wave_searches", [
        {
          ...stamp(),
          search_id: searchId,
          query,
          location: place,
          country: loc.country ?? "",
          latitude: loc.latitude,
          longitude: loc.longitude,
          wave_height_ft: now.wave_height_ft,
          swell_period_sec: now.swell_period_sec,
          swell_direction: now.swell_direction,
          wind_mph: now.wind_mph,
          weather: now.weather,
          confidence,
          structured: { location: place, ...now, beach_type: beachType, water_description: water, confidence, forecast: plans },
          raw_nimble: JSON.stringify({ surf, beach }).slice(0, 500_000),
          raw_forecast: JSON.stringify(fc).slice(0, 500_000),
          photo_url: realPhoto?.imageUrl ?? null,
          photo_page: realPhoto?.pageUrl ?? null,
          photo_beach_score: realPhoto?.beach ?? null,
          photo_edited: photo?.edited ?? false,
          photo_candidates: (photoSearch?.checked ?? []).map((c) => ({ url: c.imageUrl, page: c.pageUrl, ok: c.ok, beach: c.beach, flat: c.flat, reason: c.reason ?? null })),
        },
      ]),
      insert(
        "wave_generations",
        jobs.map((j) => ({ ...stamp(), search_id: searchId, job_id: j.id, scene_id: j.sceneId, kind: j.kind, model: j.model, prompt: j.prompt, status: "submitted", duration_ms: 0 })),
      ),
    ]);
    return true;
  }, () => "search, raw data, structured JSON + prompts logged");

  await saveResult(result);
  return Response.json(result);
}
