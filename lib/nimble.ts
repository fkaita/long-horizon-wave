import type { NimbleSource } from "./types";

export interface NimbleResult {
  title: string;
  description: string;
  url: string;
  content?: string;
}

export interface NimbleResponse {
  total_results?: number;
  results?: NimbleResult[];
  request_id?: string;
}

async function search(query: string, maxResults = 5): Promise<NimbleResponse | null> {
  const key = process.env.NIMBLE_API_KEY;
  if (!key) return null;
  const res = await fetch("https://sdk.nimbleway.com/v2/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, max_results: maxResults, search_depth: "standard" }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`Nimble ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Two searches in parallel: live surf conditions, and what the beach itself looks like. */
export async function searchLocation(location: string) {
  const [surf, beach] = await Promise.all([
    search(`${location} surf report wave height swell today`, 6),
    search(`${location} beach description coastline`, 4),
  ]);
  return { surf, beach };
}

export function toSources(...responses: (NimbleResponse | null)[]): NimbleSource[] {
  const seen = new Set<string>();
  const out: NimbleSource[] = [];
  for (const r of responses) {
    for (const item of r?.results ?? []) {
      if (!item.url || seen.has(item.url)) continue;
      seen.add(item.url);
      out.push({ title: item.title, url: item.url, snippet: (item.description || item.content || "").slice(0, 240) });
    }
  }
  return out;
}

export function allText(...responses: (NimbleResponse | null)[]): string {
  return responses
    .flatMap((r) => r?.results ?? [])
    .map((i) => `${i.title}\n${i.description}\n${(i.content ?? "").slice(0, 4000)}`)
    .join("\n\n");
}
