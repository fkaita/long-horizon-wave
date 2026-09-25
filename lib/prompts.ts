import type { Conditions, TimeOfDay } from "./types";

function waveSize(ft: number | null): string {
  if (ft == null) return "moderate waves of uncertain size";
  if (ft < 1) return "an almost flat ocean with tiny lapping ripples at the shoreline";
  if (ft < 3) return `small gentle waves about ${ft} feet high, knee to waist high`;
  if (ft < 6) return `medium waves about ${ft} feet high, chest to head high`;
  if (ft < 10) return `solid overhead waves about ${ft} feet high`;
  if (ft < 16) return `large powerful double-overhead waves about ${ft} feet high with heavy whitewater`;
  if (ft < 25) return `huge heavy waves about ${ft} feet high exploding into thick whitewater`;
  return `giant towering big-wave surf over ${Math.round(ft)} feet high, mountains of water and massive spray`;
}

function swellShape(period: number | null): string | null {
  if (period == null) return null;
  if (period >= 13) return `long-period groundswell (${period} s): clean, evenly spaced lines of swell stacking to the horizon`;
  if (period >= 9) return `organized mid-period swell (${period} s) with defined sets`;
  return `short-period wind swell (${period} s): bumpy, disorganized, closely spaced waves`;
}

function surface(mph: number | null): string | null {
  if (mph == null) return null;
  if (mph < 5) return "glassy, mirror-smooth water surface";
  if (mph < 12) return "lightly textured water surface";
  if (mph < 20) return "choppy surface with scattered whitecaps";
  return "wind-torn surface, whitecaps everywhere, spray blowing off the wave crests";
}

const LIGHT: Record<TimeOfDay, string> = {
  dawn: "early dawn light, pastel pink and pale blue sky, the sun just rising over the land behind the camera, soft cool tones",
  midday: "bright midday sun high overhead, sparkling light on the water",
  sunset: "golden hour, low warm sun near the horizon backlighting the waves, long shadows",
  night: "night, moonlight casting a silver path across the water, deep blue darkness, faint stars",
};

function sky(weather: string | null): string {
  if (!weather) return "natural sky";
  if (weather.includes("thunder")) return "dark dramatic storm clouds";
  if (weather.includes("rain") || weather.includes("drizzle")) return "gray rainy sky with curtains of rain";
  if (weather.includes("fog")) return "thick marine fog softening the horizon";
  if (weather.includes("overcast")) return "flat overcast sky";
  if (weather.includes("partly")) return "partly cloudy sky";
  if (weather.includes("clear")) return "clear sky";
  return `${weather} sky`;
}

export interface PromptInput {
  location: string;
  conditions: Conditions;
  timeOfDay: TimeOfDay;
  beachType: string | null;
  water: string | null;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function light(tod: TimeOfDay, weather: string | null): string {
  const dull = weather != null && /overcast|rain|drizzle|fog|thunder|snow/.test(weather);
  if (dull && tod === "midday") return "soft diffuse daylight";
  if (dull && tod === "sunset") return "dim late-afternoon light glowing faintly through the clouds";
  return LIGHT[tod];
}

function sceneLines(p: PromptInput): string[] {
  const c = p.conditions;
  const lines = [
    `Show ${waveSize(c.wave_height_ft)}.`,
    swellShape(c.swell_period_sec) && `${swellShape(c.swell_period_sec)}.`,
    surface(c.wind_mph) && `${surface(c.wind_mph)}.`,
    p.water && `${p.water}.`,
    p.beachType && `The coastline: ${p.beachType}.`,
    `${sky(c.weather)}, ${light(p.timeOfDay, c.weather)}.`,
    c.wave_height_ft != null && c.wave_height_ft >= 3 && p.timeOfDay !== "night" ? "A lone surfer paddling out, tiny in the frame for scale." : null,
  ].filter(Boolean) as string[];
  return lines.map(cap);
}

export function imagePrompt(p: PromptInput): string {
  return [
    `A realistic wide cinematic photograph of the ocean at ${p.location}, taken from shore level looking out at a long, unbroken ocean horizon.`,
    ...sceneLines(p),
    "The waves must visually match these conditions exactly. Natural, documentary, 35mm film look, subtle grain. No text, no watermark.",
  ].join(" ");
}

export function videoPrompt(p: PromptInput): string {
  return [
    `A short realistic video of the ocean at ${p.location}, filmed in real time at natural 1x speed.`,
    "One continuous unedited shot of a single moment: NOT a time-lapse, NOT fast motion, NOT slow motion.",
    "Static tripod camera on the sand at shore level, no camera movement, a long ocean horizon across the frame.",
    ...sceneLines(p),
    "Waves roll in and break at their true real-world speed, with physically accurate motion that reflects the swell size and period.",
    "Only the water moves. The sky, clouds, sun or moon and lighting stay exactly as in the first frame for the whole clip, like a still photograph; nothing appears or disappears.",
    "Audio: only natural ambient sound of the waves breaking and wind, no music, no voices.",
    "Looks like raw documentary footage from a live surf webcam.",
  ].join(" ");
}
