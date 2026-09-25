// RawTree: schemaless JSON ingest (tables auto-create on first insert) + read-only SQL.

const BASE = "https://api.rawtree.com/v1";
const key = () => process.env.RAWTREE_API_KEY;

export const rawtreeEnabled = () => Boolean(key());

const headers = () => ({
  Authorization: `Bearer ${key()}`,
  "Content-Type": "application/json",
  ...(process.env.RAWTREE_DATABASE && { "x-rawtree-database": process.env.RAWTREE_DATABASE }),
});

export async function insert(table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (!key() || rows.length === 0) return;
  const res = await fetch(`${BASE}/tables/${table}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`RawTree ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  if (!key()) return [];
  const res = await fetch(`${BASE}/query`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ sql }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RawTree ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).data as T[];
}

/** Every row carries an ISO timestamp plus unix seconds (columns are Dynamic, so ts is easiest to filter on). */
export const stamp = () => ({ timestamp: new Date().toISOString(), ts: Math.floor(Date.now() / 1000) });
