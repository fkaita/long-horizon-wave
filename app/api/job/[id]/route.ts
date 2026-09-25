import { poll } from "@/lib/blackforest";
import { loadJob, saveJob, saveMedia, updateSlot } from "@/lib/store";
import { ingest, tbNow } from "@/lib/tinybird";

const inflight = new Map<string, Promise<unknown>>();

export async function GET(_req: Request, ctx: RouteContext<"/api/job/[id]">) {
  const { id } = await ctx.params;
  const job = await loadJob(id);
  if (!job) return Response.json({ error: "unknown job" }, { status: 404 });

  if (job.status === "pending" && !inflight.has(id)) {
    const work = (async () => {
      const r = await poll(job.pollingUrl);
      if (r.status === "pending") return;
      if (r.status === "ready" && r.sample) {
        const media = await fetch(r.sample);
        const ext = job.kind === "video" ? "mp4" : "jpg";
        job.file = await saveMedia(job.id, ext, await media.arrayBuffer());
        job.status = "ready";
      } else {
        job.status = "failed";
        job.error = r.raw;
      }
      await saveJob(job);
      await updateSlot(job);
      await ingest("wave_generations", [
        { timestamp: tbNow(), search_id: job.searchId, job_id: job.id, scene_id: job.sceneId, kind: job.kind, model: job.model, prompt: job.prompt, status: job.status, duration_ms: Date.now() - job.createdAt },
      ]).catch(() => {});
    })().finally(() => inflight.delete(id));
    inflight.set(id, work);
    await work.catch(() => {});
  } else if (inflight.has(id)) {
    await inflight.get(id)!.catch(() => {});
  }

  const latest = (await loadJob(id))!;
  return Response.json({
    id,
    status: latest.status,
    url: latest.file ? `/api/media/${latest.file}` : null,
    error: latest.error ?? null,
  });
}
