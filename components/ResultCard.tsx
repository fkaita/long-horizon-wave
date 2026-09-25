"use client";

import type { WaveResult } from "@/lib/types";

export default function ResultCard({ result }: { result: WaveResult }) {
  const scene = result.scenes[0];
  const c = scene.conditions;
  const video = scene.video?.status === "ready" ? scene.video.url : null;
  const poster = scene.image.url;
  const failed = scene.image.status === "failed" && scene.video?.status !== "pending" && !video;

  const rows = [
    ["Wave height", c.wave_height_ft != null ? `${c.wave_height_ft} ft` : null],
    ["Swell period", c.swell_period_sec != null ? `${c.swell_period_sec} sec` : null],
    ["Swell direction", c.swell_direction],
    ["Wind", c.wind],
    ["Weather", c.weather],
    ["Confidence", result.confidence],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <section className="rise w-full max-w-4xl">
      <div className="mb-3 text-sm text-white/60">
        Now showing <span className="text-white">{result.location.query}</span>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
        {video ? (
          <video src={video} poster={poster ?? undefined} autoPlay muted loop playsInline controls className="h-full w-full object-cover" />
        ) : poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt={result.location.query} className="kenburns h-full w-full object-cover" />
        ) : (
          <div className="shimmer h-full w-full" />
        )}
        {!video && !failed && (
          <div className="absolute bottom-4 left-4 rounded-full bg-black/50 px-3 py-1.5 text-xs text-white/80 backdrop-blur">Generating video…</div>
        )}
        {failed && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">{scene.image.error ?? "Generation failed"}</div>
        )}
      </div>

      <ul className="mt-5 space-y-1 text-sm">
        {rows.map(([k, v]) => (
          <li key={k}>
            <span className="text-white/50">{k}:</span> <span className="text-white">{v}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
