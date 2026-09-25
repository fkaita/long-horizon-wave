"use client";

import { useEffect, useRef, useState } from "react";
import type { Conditions, Scene, WaveResult } from "@/lib/types";

const fmt = (v: number | null, unit: string) => (v == null ? "—" : `${v} ${unit}`);

export default function ResultCard({ result }: { result: WaveResult }) {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [muted, setMuted] = useState(true);
  const scenes = result.scenes;
  const scene = scenes[active];

  // Auto-advance through the forecast. Linger on "Now" while its video plays.
  useEffect(() => {
    if (!auto) return;
    const hasVideo = scene.video?.status === "ready";
    const t = setTimeout(() => setActive((i) => (i + 1) % scenes.length), hasVideo ? 12_000 : 7_000);
    return () => clearTimeout(t);
  }, [auto, active, scene.video?.status, scenes.length]);

  const pick = (i: number) => {
    setAuto(false);
    setActive(i);
  };

  return (
    <section className="rise w-full max-w-5xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/50">Now showing</div>
          <h2 className="font-serif text-4xl leading-tight text-white md:text-5xl">{result.location.query}</h2>
          <div className="text-sm text-white/50">{result.location.displayName}</div>
        </div>
        <div className="font-mono text-[11px] text-white/45">
          {result.location.latitude.toFixed(3)}, {result.location.longitude.toFixed(3)} · confidence{" "}
          <span className={result.confidence === "high" ? "text-emerald-300" : result.confidence === "medium" ? "text-amber-300" : "text-rose-300"}>
            {result.confidence}
          </span>
        </div>
      </div>

      {/* Stage */}
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)]">
        {scenes.map((s, i) => (
          <Frame key={s.id} scene={s} visible={i === active} muted={muted} />
        ))}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="pointer-events-none absolute bottom-4 left-5 text-white">
          <div className="font-serif text-3xl italic">{scene.label}</div>
          <div className="font-mono text-xs text-white/70">{prettyTime(scene.time)}</div>
        </div>
        <div className="absolute right-4 top-4 flex gap-2">
          {scene.video?.status === "ready" && (
            <button onClick={() => setMuted((m) => !m)} className="rounded-full bg-black/50 px-3 py-1.5 text-xs text-white backdrop-blur hover:bg-black/70">
              {muted ? "🔇 Sound off" : "🔊 Sound on"}
            </button>
          )}
          <span className="rounded-full bg-black/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-white/80 backdrop-blur">
            {scene.video?.status === "ready" ? "FLUX 3 video" : scene.video?.status === "pending" ? "FLUX 3 video rendering…" : "FLUX.2 still"}
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        {scenes.map((s, i) => (
          <button
            key={s.id}
            onClick={() => pick(i)}
            className={`group relative overflow-hidden rounded-xl border text-left transition ${i === active ? "border-white/60 bg-white/10" : "border-white/10 bg-white/[0.03] hover:border-white/30"}`}
          >
            <div className="relative h-16 w-full overflow-hidden">
              {s.image.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image.url} alt="" className="h-full w-full object-cover opacity-80 group-hover:opacity-100" />
              ) : (
                <div className={`h-full w-full ${s.image.status === "pending" ? "shimmer" : "bg-white/5"}`} />
              )}
              {i === active && auto && <div key={active} className="absolute bottom-0 left-0 h-0.5 bg-white" style={{ animation: `grow ${s.video?.status === "ready" ? 12 : 7}s linear forwards` }} />}
            </div>
            <div className="px-3 py-2">
              <div className="truncate text-xs font-medium text-white">{s.label}</div>
              <div className="font-mono text-[11px] text-white/55">
                {fmt(s.conditions.wave_height_ft, "ft")} · {fmt(s.conditions.swell_period_sec, "s")}
              </div>
            </div>
          </button>
        ))}
      </div>
      <style>{`@keyframes grow{from{width:0}to{width:100%}}`}</style>

      <div className="mt-6 grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <ConditionsPanel c={scene.conditions} result={result} label={scene.label} />
        <div className="flex flex-col gap-4">
          <Pipeline result={result} />
          {result.sources.length > 0 && (
            <Panel title="Live web sources · Nimble">
              <ul className="space-y-1.5">
                {result.sources.slice(0, 5).map((s) => (
                  <li key={s.url} className="truncate">
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-white/75 underline decoration-white/20 underline-offset-2 hover:text-white">
                      {s.title || s.url}
                    </a>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      <details className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4 text-xs text-white/60 backdrop-blur">
        <summary className="cursor-pointer font-mono uppercase tracking-widest text-white/50">Prompt sent to Black Forest Labs</summary>
        <p className="mt-3 leading-relaxed">{scene.prompt}</p>
      </details>
    </section>
  );
}

function Frame({ scene, visible, muted }: { scene: Scene; visible: boolean; muted: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const videoUrl = scene.video?.status === "ready" ? scene.video.url : null;

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (visible) {
      v.currentTime = 0;
      v.play().catch(() => {});
    } else v.pause();
  }, [visible, videoUrl]);

  return (
    <div className={`absolute inset-0 transition-opacity duration-[1400ms] ${visible ? "opacity-100" : "opacity-0"}`}>
      {videoUrl ? (
        <video ref={ref} src={videoUrl} muted={muted} loop playsInline className="h-full w-full object-cover" />
      ) : scene.image.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={visible ? "on" : "off"} src={scene.image.url} alt={scene.label} className={`h-full w-full object-cover ${visible ? "kenburns" : ""}`} />
      ) : (
        <div className="shimmer flex h-full w-full items-center justify-center">
          <div className="text-center">
            <div className="font-serif text-2xl italic text-white/70">
              {scene.image.status === "failed" ? "Couldn't paint this moment" : `Painting ${scene.label.toLowerCase()}…`}
            </div>
            <div className="mt-2 font-mono text-[11px] text-white/40">
              {scene.image.status === "failed" ? scene.image.error : "FLUX.2 · usually ~10–20 s"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConditionsPanel({ c, result, label }: { c: Conditions; result: WaveResult; label: string }) {
  const rows: [string, string][] = [
    ["Wave height", fmt(c.wave_height_ft, "ft")],
    ["Swell", c.swell_height_ft == null ? "—" : `${c.swell_height_ft} ft ${c.swell_direction ?? ""}`],
    ["Swell period", fmt(c.swell_period_sec, "sec")],
    ["Wind", c.wind ?? "—"],
    ["Weather", c.weather ?? "—"],
    ["Water", c.water_temp_f == null ? (result.water_description ?? "—") : `${c.water_temp_f}°F · ${result.water_description}`],
    ["Coast", result.beach_type ?? "—"],
  ];
  return (
    <Panel title={`Conditions used · ${label}`}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-white/45">{k}</dt>
            <dd className="text-white">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 font-mono text-[11px] text-white/40">
        source: {c.source === "open-meteo" ? "Open-Meteo marine model" : c.source === "nimble" ? "Nimble live surf reports" : "no data (not invented)"}
      </div>
      {result.notes.map((n) => (
        <div key={n} className="mt-1 text-[11px] text-amber-200/70">
          {n}
        </div>
      ))}
    </Panel>
  );
}

function Pipeline({ result }: { result: WaveResult }) {
  return (
    <Panel title="Pipeline">
      <ol className="space-y-1.5 text-xs">
        {result.pipeline.map((p) => (
          <li key={p.step} className="flex gap-2">
            <span className={p.ok ? "text-emerald-300" : "text-rose-300"}>{p.ok ? "✓" : "✗"}</span>
            <span className="w-32 shrink-0 text-white/80">{p.step}</span>
            <span className="truncate text-white/45" title={p.detail}>
              {p.detail}
              {p.ms > 0 && <span className="text-white/30"> · {(p.ms / 1000).toFixed(1)}s</span>}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-5 backdrop-blur-xl">
      <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">{title}</div>
      {children}
    </div>
  );
}

function prettyTime(t: string) {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} local`;
}
