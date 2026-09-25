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

/** "Ocean Beach, San Francisco" → try full string, then the parts, preferring hits matching the qualifiers. */
export async function geocode(query: string): Promise<LocationInfo | null> {
  const parts = query.split(",").map((p) => p.trim()).filter(Boolean);
  const qualifiers = parts.slice(1).map((p) => p.toLowerCase());
  const candidates = [query, ...parts];

  const matches = (h: GeoHit) =>
    qualifiers.length === 0 ||
    qualifiers.some((q) =>
      [h.country, h.admin1, h.admin2, h.name].some((f) => f && (f.toLowerCase().includes(q) || q.includes(f.toLowerCase()))),
    );

  let fallback: GeoHit | null = null;
  for (const c of candidates) {
    const hits = await searchName(c);
    const good = hits.find(matches);
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
