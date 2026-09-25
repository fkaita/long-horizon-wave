"use client";

import { useCallback, useEffect, useState } from "react";
import Hero from "@/components/Hero";
import SearchBar from "@/components/SearchBar";
import ResultCard from "@/components/ResultCard";
import type { MediaSlot, WaveResult } from "@/lib/types";

export default function Home() {
  const [result, setResult] = useState<WaveResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (location: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  // Poll pending BFL jobs until the still + video settle
  useEffect(() => {
    if (!result) return;
    const pending = result.scenes.flatMap((s) => [s.image, s.video]).filter((m): m is MediaSlot => !!m?.jobId && m.status === "pending");
    if (!pending.length) return;
    const t = setTimeout(async () => {
      const updates = await Promise.all(pending.map((m) => fetch(`/api/job/${m.jobId}`).then((r) => r.json()).catch(() => null)));
      setResult((prev) => {
        if (!prev || prev.searchId !== result.searchId) return prev;
        const patch = (m?: MediaSlot) => {
          const u = m?.jobId && updates.find((x) => x?.id === m.jobId);
          return u && u.status !== "pending" ? { ...m, status: u.status, url: u.url, error: u.error ?? undefined } : m;
        };
        return { ...prev, scenes: prev.scenes.map((s) => ({ ...s, image: patch(s.image)!, video: patch(s.video) })) };
      });
    }, 3000);
    return () => clearTimeout(t);
  }, [result]);

  return (
    <main className="relative flex min-h-screen flex-col items-center px-4 pb-24">
      <Hero dim={!!result} />

      <header className={`flex w-full flex-col items-center text-center transition-all duration-1000 ${result ? "pt-12" : "pt-[28vh]"}`}>
        <h1 className={`font-serif tracking-tight text-white drop-shadow-lg transition-all duration-1000 ${result ? "text-5xl" : "text-7xl md:text-8xl"}`}>
          Long Horizon
        </h1>
        <p className="mt-3 mb-9 text-lg text-white/75 drop-shadow">See the waves anywhere in the world.</p>
        <SearchBar onSearch={search} busy={busy} />
      </header>

      {error && <div className="mt-8 text-sm text-rose-200">{error}</div>}

      <div className="mt-12 flex w-full justify-center">{result && !busy && <ResultCard key={result.searchId} result={result} />}</div>
    </main>
  );
}
