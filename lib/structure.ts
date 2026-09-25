import type { Forecast } from "./openmeteo";
import type { Conditions, TimeOfDay } from "./types";

const M_TO_FT = 3.28084;

export function compass(deg: number | null | undefined): string | null {
  if (deg == null || Number.isNaN(deg)) return null;
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown): number | null => (typeof v === "number" && !Number.isNaN(v) ? v : null);

// WMO weather interpretation codes
export function weatherText(code: number | null): string | null {
  if (code == null) return null;
  if (code === 0) return "clear sky";
  if (code <= 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code <= 48) return "foggy";
  if (code <= 57) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "rain showers";
  if (code <= 86) return "snow showers";
  return "thunderstorm";
}

export function windText(mph: number | null, dir: string | null): string | null {
  if (mph == null) return null;
  const strength = mph < 5 ? "calm" : mph < 12 ? "light" : mph < 20 ? "moderate" : mph < 30 ? "strong" : "gale-force";
  return dir ? `${strength} ${dir} wind (${Math.round(mph)} mph)` : `${strength} wind (${Math.round(mph)} mph)`;
}

type Series = Record<string, (number | string | null)[]> | undefined;
type Point = Record<string, number | string | null> | undefined;

function pick(series: Series, time: string): Point {
  const idx = (series?.time as string[] | undefined)?.indexOf(time) ?? -1;
  if (!series || idx < 0) return undefined;
  return Object.fromEntries(Object.entries(series).map(([k, v]) => [k, v[idx]]));
}

function build(marine: Point, weather: Point): Conditions {
  const wave = num(marine?.wave_height);
  const swell = num(marine?.swell_wave_height);
  const period = num(marine?.swell_wave_period) ?? num(marine?.wave_period);
  const sst = num(marine?.sea_surface_temperature);
  const windMph = num(weather?.wind_speed_10m);
  const windDir = compass(num(weather?.wind_direction_10m));
  return {
    wave_height_ft: wave != null ? round1(wave * M_TO_FT) : null,
    swell_height_ft: swell != null ? round1(swell * M_TO_FT) : null,
    swell_period_sec: period != null ? round1(period) : null,
    swell_direction: compass(num(marine?.swell_wave_direction) ?? num(marine?.wave_direction)),
    wind_mph: windMph != null ? Math.round(windMph) : null,
    wind_direction: windDir,
    wind: windText(windMph, windDir),
    weather: weatherText(num(weather?.weather_code)),
    cloud_cover_pct: num(weather?.cloud_cover),
    water_temp_f: sst != null ? Math.round(sst * 1.8 + 32) : null,
    source: wave != null ? "open-meteo" : "none",
  };
}

export interface ScenePlan {
  id: string;
  label: string;
  time: string;
  timeOfDay: TimeOfDay;
  conditions: Conditions;
}

const hourOf = (t: string) => t.slice(0, 13) + ":00"; // "2026-09-26T06:58" → "2026-09-26T06:00"
const hourNum = (t: string) => Number(t.slice(11, 13)) + Number(t.slice(14, 16)) / 60;

/** Now + three forecast moments (dawn, midday, sunset on the next three days). */
export function planScenes(f: Forecast): ScenePlan[] {
  const w = f.weather;
  const m = f.marine;
  const nowTime = (w?.current?.time as string) ?? (m?.current?.time as string) ?? new Date().toISOString().slice(0, 16);
  const sunrises = (w?.daily?.sunrise as string[]) ?? [];
  const sunsets = (w?.daily?.sunset as string[]) ?? [];
  const days = (w?.daily?.time as string[]) ?? [];

  const nowHour = hourNum(nowTime);
  const sr = sunrises[0] ? hourNum(sunrises[0]) : 6.5;
  const ss = sunsets[0] ? hourNum(sunsets[0]) : 19;
  const nowTod: TimeOfDay =
    nowHour < sr - 0.5 || nowHour > ss + 0.5 ? "night" : nowHour < sr + 1.5 ? "dawn" : nowHour > ss - 1.5 ? "sunset" : "midday";

  const scenes: ScenePlan[] = [
    { id: "now", label: "Now", time: nowTime, timeOfDay: nowTod, conditions: build(m?.current, w?.current) },
  ];

  const future: { day: number; tod: TimeOfDay }[] = [
    { day: 1, tod: "dawn" },
    { day: 2, tod: "midday" },
    { day: 3, tod: "sunset" },
  ];
  for (const { day, tod } of future) {
    const date = days[day];
    if (!date) continue;
    const t =
      tod === "dawn" && sunrises[day]
        ? hourOf(sunrises[day])
        : tod === "sunset" && sunsets[day]
          ? `${date}T${String(Math.max(0, Math.floor(hourNum(sunsets[day])) - 1)).padStart(2, "0")}:00`
          : `${date}T12:00`;
    const weekday = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
    scenes.push({
      id: `d${day}-${tod}`,
      label: `${day === 1 ? "Tomorrow" : weekday} · ${tod}`,
      time: t,
      timeOfDay: tod,
      conditions: build(pick(m?.hourly, t), pick(w?.hourly, t)),
    });
  }
  return scenes;
}

/** Fallback when the marine model has no cell here: pull "4-6 ft" / "12 s" out of Nimble surf-report text. */
export function conditionsFromText(text: string): Partial<Conditions> {
  const out: Partial<Conditions> = {};
  const range = text.match(/(\d{1,2}(?:\.\d)?)\s*(?:-|–|to)\s*(\d{1,2}(?:\.\d)?)\s*(?:ft|feet|foot)\b/i);
  const single = text.match(/\b(\d{1,2}(?:\.\d)?)\s*(?:ft|feet)\b/i);
  if (range) out.wave_height_ft = round1((Number(range[1]) + Number(range[2])) / 2);
  else if (single) out.wave_height_ft = Number(single[1]);
  const period = text.match(/(\d{1,2})\s*(?:s|sec|secs|seconds)\b[^.\n]{0,20}period|period[^.\n]{0,20}?(\d{1,2})\s*(?:s|sec|secs|seconds)\b/i);
  if (period) out.swell_period_sec = Number(period[1] ?? period[2]);
  if (out.wave_height_ft != null) out.source = "nimble";
  return out;
}

const TRAITS: [RegExp, string][] = [
  [/black sand|volcanic/i, "black volcanic sand"],
  [/white sand/i, "white sand"],
  [/sandy beach|wide beach|long beach|sand dunes?|dunes/i, "wide sandy beach"],
  [/reef/i, "shallow reef"],
  [/point break/i, "point break"],
  [/cliffs?|bluffs?/i, "tall cliffs"],
  [/rocky|rocks|boulders/i, "rocky outcrops"],
  [/pier/i, "a pier"],
  [/lighthouse/i, "a lighthouse"],
  [/headland|promontory/i, "a headland"],
  [/palm/i, "palm trees"],
  [/jetty|breakwater/i, "a jetty"],
  [/skyline|high-?rise|hotels?/i, "hotels along the shore"],
  [/fog/i, "coastal fog"],
];

/** Pick the 3 most-mentioned beach features from Nimble text. No LLM: frequency of known traits. */
export function beachTraits(text: string): string | null {
  const scored = TRAITS.map(([re, label]) => ({ label, n: (text.match(new RegExp(re.source, "gi")) ?? []).length }))
    .filter((t) => t.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((t) => t.label);
  return scored.length ? scored.join(", ") : null;
}

export function waterDescription(tempF: number | null, lat: number): string | null {
  const t = tempF ?? (Math.abs(lat) < 23 ? 80 : Math.abs(lat) < 35 ? 68 : Math.abs(lat) < 50 ? 57 : 45);
  if (t < 52) return "cold dark steel-gray water";
  if (t < 62) return "cold gray-blue water";
  if (t < 72) return "cool deep-blue water";
  if (t < 79) return "warm blue-green water";
  return "warm clear turquoise water";
}
