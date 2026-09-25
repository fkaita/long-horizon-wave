# Long Horizon

**See the waves anywhere in the world.** Search any coastline. Long Horizon reads the live web and the marine forecast, then uses Black Forest Labs to paint the waves right now and over the next three days.

```
search → geocode + marine/weather forecast (Open-Meteo, keyless)
       → live web context (Nimble Search: surf reports, beach character)
       → structured conditions JSON (nulls, never invented)
       → Tinybird (raw Nimble + forecast, structured JSON, prompts, generation lifecycle)
       → Black Forest Labs: FLUX 3 video for "now" + FLUX.2 stills for dawn / midday / sunset forecast
       → cinematic timeline player
```

## Run

```bash
npm install
cp .env.example .env.local   # fill in NIMBLE_API_KEY, BFL_API_KEY, TINYBIRD_TOKEN, TINYBIRD_HOST
node --env-file=.env.local scripts/setup-tinybird.mjs   # creates wave_searches + wave_generations
node --env-file=.env.local scripts/make-hero.mjs        # optional: FLUX 3 landing video → public/hero.mp4
npm run dev
```

Results and media are cached in `.data/` for 3 hours, so presets replay instantly during a demo. POST `{"location": "...", "fresh": true}` to `/api/generate` to force a regeneration.

## Code map

| | |
|---|---|
| `app/api/generate/route.ts` | orchestrates the whole pipeline, returns scenes with pending BFL jobs |
| `app/api/job/[id]` | polls BFL, downloads the finished media, logs completion to Tinybird |
| `app/api/live` | Tinybird SQL → "Live" strip (recent + biggest waves today) |
| `lib/structure.ts` | forecast → conditions, Nimble text → fallback wave height + beach traits |
| `lib/prompts.ts` | conditions → image / video prompts |
| `lib/nimble.ts`, `lib/tinybird.ts`, `lib/blackforest.ts`, `lib/openmeteo.ts` | API wrappers |
