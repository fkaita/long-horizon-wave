"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Hero from "@/components/Hero";
import SearchBar from "@/components/SearchBar";
import ResultCard from "@/components/ResultCard";
import LiveStrip from "@/components/LiveStrip";
import type { MediaSlot, WaveResult } from "@/lib/types";

const STEPS = ["Locating the coast", "Searching the live web · Nimble", "Reading the marine forecast", "Structuring conditions", "Logging to Tinybird", "Briefing Black Forest Labs"];

export default function Home() {
  const [result, setResult] = useState<WaveResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [liveKey, setLiveKey] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (location: string) => {
    setBusy(true);
    setError(null);
    setStepIdx(0);
    const ticker = setInterval(() => setStepIdx((i) => Math.min(i + 1, STEPS.length - 1)), 1600);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setResult(data);
      setLiveKey((k) => k + 1);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      clearInterval(ticker);
      setBusy(false);
    }
  }, []);

  // Poll pending BFL jobs until every slot settles
  useEffect(() => {
    if (!result) return;
    const pending = result.scenes.flatMap((s) => [s.image, s.video]).filter((m): m is MediaSlot => !!m?.jobId && m.status === "pending");
    if (!pending.length) return;
    const t = setTimeout(async () => {
      const updates = await Promise.all(
        pending.map((m) =>
          fetch(`/api/job/${m.jobId}`)
            .then((r) => r.json())
            .catch(() => null),
        ),
      );
      setResult((prev) => {
        if (!prev || prev.searchId !== result.searchId) return prev;
        const patch = (m?: MediaSlot) => {
          const u = m?.jobId && updates.find((x) => x?.id === m.jobId);
          return u && u.status !== "pending" ? { ...m, status: u.status, url: u.url, error: u.error ?? undefined } : m;
        };
        return { ...prev, scenes: prev.scenes.map((s) => ({ ...s, image: patch(s.image)!, video: patch(s.video) })) };
      });
    }, 3500);
    return () => clearTimeout(t);
  }, [result]);

  return (
    <main className="relative flex min-h-screen flex-col items-center px-4 pb-24">
      <Hero dim={!!result} />

      <header className={`flex w-full flex-col items-center text-center transition-all duration-1000 ${result ? "pt-12" : "pt-[26vh]"}`}>
        <h1 className={`font-serif tracking-tight text-white drop-shadow-lg transition-all duration-1000 ${result ? "text-5xl" : "text-7xl md:text-8xl"}`}>
          Long Horizon
        </h1>
        <p className="mt-3 mb-9 text-lg text-white/75 drop-shadow">See the waves anywhere in the world.</p>
        <SearchBar onSearch={search} busy={busy} />
      </header>

      {busy && (
        <div className="mt-10 w-full max-w-md rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
          <ol className="space-y-2 text-sm">
            {STEPS.map((s, i) => (
              <li key={s} className={`flex items-center gap-3 transition-opacity ${i <= stepIdx ? "opacity-100" : "opacity-30"}`}>
                <span className="w-4 text-center">{i < stepIdx ? "✓" : i === stepIdx ? <span className="inline-block h-2 w-2 animate-ping rounded-full bg-white" /> : "·"}</span>
                <span className="text-white/85">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {error && <div className="mt-8 rounded-xl border border-rose-400/30 bg-rose-950/40 px-4 py-3 text-sm text-rose-100 backdrop-blur">{error}</div>}

      <div ref={resultRef} className="mt-12 flex w-full scroll-mt-6 flex-col items-center gap-8">
        {result && !busy && <ResultCard key={result.searchId} result={result} />}
      </div>

      <div className={`${result ? "mt-10" : "fixed bottom-6 left-4 right-4 mx-auto"} flex justify-center`}>
        <LiveStrip refreshKey={liveKey} onPick={search} />
      </div>
    </main>
  );
}
