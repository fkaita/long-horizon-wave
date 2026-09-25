"use client";

import { useEffect, useState } from "react";

interface Row {
  location: string;
  searches: number;
  wave_height_ft: number | null;
}
interface Live {
  enabled: boolean;
  recent: Row[];
  biggest: Row[];
  total: number;
  error?: string;
}

/** "Live on Long Horizon" — straight from RawTree SQL. */
export default function LiveStrip({ refreshKey, onPick }: { refreshKey: number; onPick: (q: string) => void }) {
  const [live, setLive] = useState<Live | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/live")
        .then((r) => r.json())
        .then((d) => alive && setLive(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [refreshKey]);

  if (!live?.enabled || (!live.recent.length && !live.biggest.length)) return null;

  return (
    <div className="w-full max-w-5xl rounded-2xl border border-white/10 bg-black/30 px-5 py-3 text-xs backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="flex items-center gap-2 font-mono uppercase tracking-widest text-white/50">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Live · {live.total} searches · RawTree
        </span>
        {live.biggest.length > 0 && (
          <span className="flex flex-wrap items-center gap-2 text-white/70">
            <span className="text-white/40">Biggest today</span>
            {live.biggest.slice(0, 3).map((r) => (
              <button key={r.location} onClick={() => onPick(r.location)} className="rounded-full bg-white/5 px-2.5 py-1 hover:bg-white/15">
                {short(r.location)} <b className="text-white">{r.wave_height_ft?.toFixed(1)} ft</b>
              </button>
            ))}
          </span>
        )}
        {live.recent.length > 0 && (
          <span className="flex flex-wrap items-center gap-2 text-white/70">
            <span className="text-white/40">Recent</span>
            {live.recent.slice(0, 5).map((r) => (
              <button key={r.location} onClick={() => onPick(r.location)} className="rounded-full bg-white/5 px-2.5 py-1 hover:bg-white/15">
                {short(r.location)}
              </button>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

const short = (s: string) => s.split(",")[0];
