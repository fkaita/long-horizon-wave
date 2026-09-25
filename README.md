# 🌊 Long Horizon

**See the waves anywhere in the world, right now.**

Type any beach. An agent finds a real photo of it on the live web, checks the current wave forecast, adjusts the photo to match right now, and turns it into a short video.

![Demo](docs/demo.gif)

<sub>The app searching "Ocean Beach, San Francisco" · [MP4](docs/demo.mp4) · Source photo: sanfranciscojeeptours.com</sub>

---

## How it works

```mermaid
flowchart LR
    A[🔎 Beach name] --> B[📍 Locate<br/>OpenStreetMap]
    B --> C[🌐 Nimble<br/>live web search]
    B --> D[🌊 Wave forecast<br/>Open-Meteo]
    C --> E[🖼️ Real photo<br/>+ CLIP beach check]
    D --> F[🧱 Structured<br/>conditions]
    E --> G[🎨 FLUX.2<br/>re-light to now]
    F --> G
    G --> H[🎬 FLUX 3<br/>real-time video]
    F -.log.-> R[(🌳 RawTree)]
    H -.log.-> R
```

1. **Locate** the beach from free text: "Kamakura japan" → coordinates.
2. **Search the live web** with Nimble for surf reports, beach descriptions and pages with photos.
3. **Read the current waves** (height, swell period, wind, weather) from the marine forecast.
4. **Find a real photo** from Nimble's pages or Wikimedia, and **verify it's a beach photo** with a local CLIP model. Logos, text cards and maps are rejected.
5. **Re-light the photo** to the current conditions with FLUX.2. The place stays exactly the same.
6. **Animate it** with FLUX 3: real speed, static camera, only the water moves.
7. **Log everything** to RawTree: raw web data, structured conditions, prompts and generation results.

## Sponsor tools

| Tool | What we use it for |
|---|---|
| **Nimble** | Live web search: surf reports, beach character, and source pages for real photos |
| **Black Forest Labs** | FLUX.2 [klein] to re-light the real photo, FLUX 3 to turn it into video (image → video) |
| **RawTree** | Stores every search: raw Nimble + forecast data, structured JSON, prompts, generation status |

Free helpers: Open-Meteo (marine forecast), OpenStreetMap Nominatim (geocoding), Wikimedia Commons (fallback photos), CLIP via transformers.js (local image check).

## Run it

```bash
npm install
cp .env.example .env.local   # add NIMBLE_API_KEY, BFL_API_KEY, RAWTREE_API_KEY
npm run dev                   # http://localhost:3000
```

The first start downloads the CLIP model (about 90 MB). Results are cached in `.data/` for 12 hours.

## Code map

| File | Job |
|---|---|
| `app/api/generate/route.ts` | The agent: runs the whole pipeline |
| `app/api/job/[id]/route.ts` | Polls BFL and saves finished media |
| `lib/nimble.ts` · `lib/blackforest.ts` · `lib/rawtree.ts` | Sponsor API wrappers |
| `lib/photo.ts` | Real photo search + CLIP beach check |
| `lib/openmeteo.ts` · `lib/structure.ts` | Geocoding, forecast → structured conditions |
| `lib/prompts.ts` | Conditions → image / video prompts |
| `app/page.tsx` · `components/*` | One-page UI |
