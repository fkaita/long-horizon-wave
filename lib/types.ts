export type TimeOfDay = "dawn" | "midday" | "sunset" | "night";

/** Structured wave conditions for one moment in time. null = unknown, never invented. */
export interface Conditions {
  wave_height_ft: number | null;
  swell_height_ft: number | null;
  swell_period_sec: number | null;
  swell_direction: string | null;
  wind_mph: number | null;
  wind_direction: string | null;
  wind: string | null;
  weather: string | null;
  cloud_cover_pct: number | null;
  water_temp_f: number | null;
  source: "open-meteo" | "nimble" | "none";
}

export interface Scene {
  id: string;
  label: string; // "Now", "Tomorrow · dawn"
  time: string; // local ISO-ish timestamp
  timeOfDay: TimeOfDay;
  conditions: Conditions;
  prompt: string;
  image: MediaSlot;
  video?: MediaSlot;
}

export interface MediaSlot {
  jobId: string | null;
  status: "pending" | "ready" | "failed" | "skipped";
  url: string | null;
  error?: string;
}

export interface LocationInfo {
  query: string;
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  country: string | null;
  timezone: string | null;
}

export interface NimbleSource {
  title: string;
  url: string;
  snippet: string;
}

export interface WaveResult {
  searchId: string;
  slug: string;
  createdAt: string;
  location: LocationInfo;
  beach_type: string | null;
  water_description: string | null;
  confidence: "high" | "medium" | "low";
  notes: string[];
  sources: NimbleSource[];
  scenes: Scene[];
  photo: RealPhoto | null;
  pipeline: { step: string; ok: boolean; ms: number; detail?: string }[];
}

export interface RealPhoto {
  url: string; // our cached copy
  pageUrl: string;
  host: string;
  origin: "nimble" | "wikimedia";
  beachScore: number;
  edited: boolean; // re-lit to current conditions with FLUX.2
}
