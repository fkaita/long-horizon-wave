import { randomUUID } from "crypto";
import { forecast, geocode } from "@/lib/openmeteo";
import { allText, searchLocation, toSources, type NimbleResponse } from "@/lib/nimble";
import { beachTraits, conditionsFromText, planScenes, waterDescription } from "@/lib/structure";
import { imagePrompt, videoPrompt } from "@/lib/prompts";
import { insert, rawtreeEnabled, stamp } from "@/lib/rawtree";
import { imageModel, submitImage, submitVideo, videoEnabled, videoModel } from "@/lib/blackforest";
import { loadResult, saveJob, saveResult, slugify, type Job } from "@/lib/store";
import type { MediaSlot, Scene, WaveResult } from "@/lib/types";

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

  // 2. Marine + weather forecast
  const fc = await step("Marine forecast", () => forecast(loc.latitude, loc.longitude), (f) =>
    f.marine ? "Open-Meteo marine + weather models" : "no marine data for this point",
  );

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
  pipeline.push({ step: "Structure", ok: true, ms: 0, detail: `${plans.length} moments, confidence ${confidence}` });

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

  const seed = Math.floor(Math.random() * 1e6);
  const t0 = Date.now();
  const scenes: Scene[] = await Promise.all(
    plans.map(async (p) => {
      const input = { location: place, conditions: p.conditions, timeOfDay: p.timeOfDay, beachType, water };
      const prompt = imagePrompt(input);
      const [image, video] = await Promise.all([
        mkSlot("image", p.id, prompt, () => submitImage(prompt, seed)),
        p.id === "now" && videoEnabled()
          ? mkSlot("video", p.id, videoPrompt(input), () => submitVideo(videoPrompt(input)))
          : Promise.resolve(undefined),
      ]);
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
