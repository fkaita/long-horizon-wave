"use client";

import { useState } from "react";

export const PRESETS = ["Ocean Beach, San Francisco", "Waikiki, Hawaii", "Nazaré, Portugal"];

export default function SearchBar({ onSearch, busy, initial = "" }: { onSearch: (q: string) => void; busy: boolean; initial?: string }) {
  const [q, setQ] = useState(initial);
  const go = (value: string) => {
    if (!value.trim() || busy) return;
    setQ(value);
    onSearch(value.trim());
  };
  return (
    <div className="w-full max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
        className="flex items-center gap-2 rounded-full border border-white/20 bg-black/35 p-1.5 pl-6 shadow-2xl backdrop-blur-xl focus-within:border-white/50"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a beach or coastal location…"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-base text-white placeholder:text-white/50 focus:outline-none"
          aria-label="Coastal location"
        />
        <button
          type="submit"
          disabled={busy || !q.trim()}
          className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white/85 disabled:opacity-40"
        >
          {busy ? "Reading the ocean…" : "Generate"}
        </button>
      </form>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => go(p)}
            disabled={busy}
            className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs text-white/80 backdrop-blur transition hover:border-white/40 hover:text-white disabled:opacity-40"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
