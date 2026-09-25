# Long Horizon

**See the waves anywhere in the world.** Search any coastline. Long Horizon reads the live web and the marine forecast, then uses Black Forest Labs to generate a short video of the waves right now.

```
search → geocode + marine/weather forecast (Open-Meteo, keyless)
       → live web context (Nimble Search: surf reports, beach character)
       → real beach photo: og:image of Nimble result pages + Wikimedia Commons,
         verified locally with CLIP ("is this a beach photo?") + a flatness check that rejects text cards
       → FLUX.2 klein edit: same place, re-lit to current waves / sky / time of day
       → structured conditions JSON (nulls, never invented)
       → RawTree (raw Nimble + forecast, structured JSON, prompts, generation lifecycle)
       → FLUX 3 image-to-video (real-time, static camera)
```

## Run

```bash
npm install
cp .env.example .env.local   # fill in NIMBLE_API_KEY, BFL_API_KEY, RAWTREE_API_KEY (tables auto-create)
node --env-file=.env.local scripts/make-hero.mjs        # optional: FLUX 3 landing video → public/hero.mp4
npm run dev
```

The first server start downloads the CLIP model (~90 MB, ~30 s) in the background.

Results and media are cached in `.data/` for `CACHE_HOURS` (default 12), so presets replay instantly during a demo. POST `{"location": "...", "fresh": true}` to `/api/generate` to force a regeneration.

## Code map

| | |
|---|---|
| `app/api/generate/route.ts` | orchestrates the whole pipeline, returns the "now" scene with pending BFL jobs |
| `app/api/job/[id]` | polls BFL, downloads the finished media, logs completion to RawTree |
| `lib/photo.ts` | real-photo search + CLIP beach check |
| `lib/structure.ts` | forecast → conditions, Nimble text → fallback wave height + beach traits |
| `lib/prompts.ts` | conditions → image / video prompts |
| `lib/nimble.ts`, `lib/rawtree.ts`, `lib/blackforest.ts`, `lib/openmeteo.ts` | API wrappers |
