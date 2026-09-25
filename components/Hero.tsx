"use client";

import { useState } from "react";

/** Full-bleed calm ocean. Uses /hero.mp4 if present, otherwise an animated CSS horizon. */
export default function Hero({ dim = false }: { dim?: boolean }) {
  const [videoOk, setVideoOk] = useState(true);
  return (
    <div className="fixed inset-0 -z-10">
      <div className="ocean">
        <div className="sun" />
        <div className="sea" />
      </div>
      {videoOk && (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src="/hero.mp4"
          autoPlay
          muted
          loop
          playsInline
          onError={() => setVideoOk(false)}
        />
      )}
      <div
        className={`absolute inset-0 transition-colors duration-1000 ${dim ? "bg-black/85" : "bg-gradient-to-b from-black/40 via-transparent to-black/60"}`}
      />
    </div>
  );
}
