import type { LocationInfo } from "./types";

// Open-Meteo: free, keyless geocoding + marine + weather forecasts.

interface GeoHit {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  admin2?: string;
  timezone?: string;
}

async function searchName(name: string): Promise<GeoHit[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  return json.results ?? [];
}

/** Free-text geocoding: OpenStreetMap Nominatim first (understands "Ocean Beach San Francisco", "Kamakura japan"), Open-Meteo as fallback. */
export async function geocode(query: string): Promise<LocationInfo | null> {
  const hit = await geocodeNominatim(query);
  if (hit) return hit;
  // "Pipeline Oahu": nickname + area — try the area on its own
  const words = query.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    await new Promise((r) => setTimeout(r, 1000)); // Nominatim policy: max 1 req/s
    const area = await geocodeNominatim(words.slice(1).join(" "));
    if (area) return { ...area, query };
  }
  return geocodeOpenMeteo(query);
}

async function geocodeNominatim(query: string): Promise<LocationInfo | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=en&q=${encodeURIComponent(query)}`,
      { headers: { "User-Agent": "LongHorizon/0.1 (hackathon demo; https://github.com/fkaita/long-horizon-wave)" }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const [hit] = (await res.json()) as { name: string; lat: string; lon: string; address?: Record<string, string> }[];
    if (!hit) return null;
    const a = hit.address ?? {};
    const region = a.state ?? a.province ?? a.region ?? a.county ?? null;
    const name = hit.name || a.city || a.town || query;
    return {
      query,
      name,
      displayName: [name, region, a.country].filter(Boolean).join(", "),
      latitude: Number(hit.lat),
      longitude: Number(hit.lon),
      country: a.country ?? null,
      timezone: null,
    };
  } catch {
    return null;
  }
}

const plain = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * "Ocean Beach, San Francisco" / "Kamakura japan" / "Waikiki Beach Hawaii" → try the full string, the comma parts,
 * then shorter word prefixes with the dropped words used as qualifiers (country / region), preferring matching hits.
 */
async function geocodeOpenMeteo(query: string): Promise<LocationInfo | null> {
  const parts = query.split(",").map((p) => p.trim()).filter(Boolean);
  const commaQualifiers = parts.slice(1);
  // regionOnly: qualifiers taken from dropped words may only match country/region, not the place name ("Beach")
  const attempts: { name: string; qualifiers: string[]; regionOnly?: boolean }[] = [
    { name: query, qualifiers: commaQualifiers },
    ...parts.map((p) => ({ name: p, qualifiers: parts.filter((x) => x !== p) })),
  ];
  const words = parts[0]?.split(/\s+/) ?? [];
  for (let k = words.length - 1; k >= 1; k--) {
    const rest = words.slice(k);
    attempts.push({ name: words.slice(0, k).join(" "), qualifiers: [...commaQualifiers, rest.join(" "), ...rest], regionOnly: true });
  }

  const matches = (h: GeoHit, a: (typeof attempts)[number]) =>
    a.qualifiers.length === 0 ||
    a.qualifiers.map(plain).some((q) =>
      [h.country, h.admin1, h.admin2, a.regionOnly ? undefined : h.name].some((f) => f && (plain(f).includes(q) || q.includes(plain(f)))),
    );

  const seen = new Set<string>();
  let fallback: GeoHit | null = null;
  for (const a of attempts) {
    const key = `${a.name}|${a.qualifiers.join("|")}`;
    if (!a.name || seen.has(key)) continue;
    seen.add(key);
    const hits = await searchName(a.name);
    const good = hits.find((h) => matches(h, a));
    if (good) return toInfo(query, good);
    fallback ??= hits[0] ?? null;
  }
  return fallback ? toInfo(query, fallback) : null;
}

function toInfo(query: string, h: GeoHit): LocationInfo {
  return {
    query,
    name: h.name,
    displayName: [h.name, h.admin1, h.country].filter(Boolean).join(", "),
    latitude: h.latitude,
    longitude: h.longitude,
    country: h.country ?? null,
    timezone: h.timezone ?? null,
  };
}

export interface Forecast {
  marine: MarineResponse | null;
  weather: WeatherResponse | null;
}

export interface MarineResponse {
  current?: Record<string, number | string | null>;
  hourly?: Record<string, (number | string | null)[]>;
}

export interface WeatherResponse {
  current?: Record<string, number | string | null>;
  hourly?: Record<string, (number | string | null)[]>;
  daily?: Record<string, (number | string | null)[]>;
  timezone?: string;
}

const MARINE_VARS = "wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction,sea_surface_temperature";
const WEATHER_VARS = "weather_code,wind_speed_10m,wind_direction_10m,cloud_cover,is_day";

export async function forecast(lat: number, lon: number): Promise<Forecast> {
  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&current=${MARINE_VARS}&timezone=auto&forecast_days=1&cell_selection=sea`;
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=${WEATHER_VARS}&daily=sunrise,sunset&timezone=auto&forecast_days=1&wind_speed_unit=mph`;

  const [marine, weather] = await Promise.all([getJson<MarineResponse>(marineUrl), getJson<WeatherResponse>(weatherUrl)]);
  return { marine, weather };
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
