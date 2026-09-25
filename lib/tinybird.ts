// Tinybird: Events API for ingestion, Query API for the "live" strip.

const host = () => (process.env.TINYBIRD_HOST || "https://api.tinybird.co").replace(/\/$/, "");
const token = () => process.env.TINYBIRD_TOKEN;

export const tinybirdEnabled = () => Boolean(token());

export async function ingest(datasource: string, rows: Record<string, unknown>[]): Promise<void> {
  if (!token() || rows.length === 0) return;
  const res = await fetch(`${host()}/v0/events?name=${datasource}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}` },
    body: rows.map((r) => JSON.stringify(r)).join("\n"),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Tinybird ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  if (!token()) return [];
  const res = await fetch(`${host()}/v0/sql?q=${encodeURIComponent(sql + " FORMAT JSON")}`, {
    headers: { Authorization: `Bearer ${token()}` },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Tinybird ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).data as T[];
}

/** Tinybird DateTime64 wants "YYYY-MM-DD hh:mm:ss.sss" */
export const tbNow = () => new Date().toISOString().replace("T", " ").replace("Z", "");
