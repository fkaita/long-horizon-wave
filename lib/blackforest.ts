// Black Forest Labs: FLUX.2 images + FLUX 3 video. Submit returns a polling_url; poll until Ready.

const BASE = "https://api.bfl.ai/v1";
const key = () => process.env.BFL_API_KEY;

export const imageModel = () => process.env.BFL_IMAGE_MODEL || "flux-2-pro";
export const videoModel = () => process.env.BFL_VIDEO_MODEL || "flux-3-video";
export const videoEnabled = () => Boolean(key()) && process.env.ENABLE_VIDEO !== "false";

export interface Submitted {
  id: string;
  polling_url: string;
}

async function submit(model: string, body: Record<string, unknown>): Promise<Submitted> {
  if (!key()) throw new Error("BFL_API_KEY not set");
  const res = await fetch(`${BASE}/${model}`, {
    method: "POST",
    headers: { "x-key": key()!, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`BFL ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export function submitImage(prompt: string, seed?: number) {
  // 1440x816 ≈ 16:9, ~1.2 MP
  return submit(imageModel(), { prompt, width: 1440, height: 816, output_format: "jpeg", ...(seed != null && { seed }) });
}

/** With a keyframe (i2v) the still becomes the first frame, which pins sky + light so the clip plays in real time. */
export function submitVideo(prompt: string, keyframe?: string) {
  return submit(videoModel(), {
    mode: keyframe ? "i2v" : "t2v",
    ...(keyframe && { keyframes: [keyframe] }),
    prompt,
    duration: Number(process.env.BFL_VIDEO_SECONDS || 5),
    aspect_ratio: "16:9",
    resolution: "hd",
    generate_audio: true,
    draft: process.env.BFL_VIDEO_DRAFT === "true",
  });
}

export type PollStatus = "pending" | "ready" | "failed";

export async function poll(pollingUrl: string): Promise<{ status: PollStatus; sample?: string; raw: string }> {
  const res = await fetch(pollingUrl, { headers: { "x-key": key()!, accept: "application/json" }, cache: "no-store" });
  if (!res.ok) return { status: "pending", raw: `http ${res.status}` };
  const json = await res.json();
  const s: string = json.status;
  if (s === "Ready") return { status: "ready", sample: json.result?.sample, raw: s };
  if (["Request Moderated", "Content Moderated", "Error", "Task not found", "Failed"].includes(s)) return { status: "failed", raw: s };
  return { status: "pending", raw: s };
}

export async function waitFor(pollingUrl: string, timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const r = await poll(pollingUrl);
    if (r.status !== "pending") return r;
    await new Promise((res) => setTimeout(res, 1500));
  }
  return { status: "pending" as const, raw: "timeout" };
}
