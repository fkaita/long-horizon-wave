import { query, rawtreeEnabled } from "@/lib/rawtree";

export const dynamic = "force-dynamic";

export interface LiveRow {
  location: string;
  searches: number;
  wave_height_ft: number | null;
}

// Columns are Dynamic in RawTree, so cast explicitly.
const LOC = "toString(query)";
const WAVE = "toFloat64OrNull(toString(wave_height_ft))";
const TS = "toInt64OrZero(toString(ts))";

// Aliases must not shadow column names (ClickHouse resolves WHERE against aliases)
interface DbRow {
  loc: string;
  searches: number | string;
  wave: number | null;
}
const toLive = (r: DbRow): LiveRow => ({ location: r.loc, searches: Number(r.searches), wave_height_ft: r.wave == null ? null : Number(r.wave) });

export async function GET() {
  if (!rawtreeEnabled()) return Response.json({ enabled: false, recent: [], biggest: [], total: 0 });
  try {
    const [recent, biggest, total] = await Promise.all([
      query<DbRow>(
        `SELECT ${LOC} AS loc, count() AS searches, argMax(${WAVE}, ${TS}) AS wave, max(${TS}) AS last_seen
         FROM wave_searches GROUP BY loc ORDER BY last_seen DESC LIMIT 8`,
      ),
      query<DbRow>(
        `SELECT ${LOC} AS loc, count() AS searches, max(${WAVE}) AS wave
         FROM wave_searches WHERE ${TS} > toUnixTimestamp(now()) - 86400 AND ${WAVE} IS NOT NULL
         GROUP BY loc ORDER BY wave DESC LIMIT 5`,
      ),
      query<{ n: number }>(`SELECT count() AS n FROM wave_searches`),
    ]);
    return Response.json({ enabled: true, recent: recent.map(toLive), biggest: biggest.map(toLive), total: Number(total[0]?.n ?? 0) });
  } catch (e) {
    // Table doesn't exist until the first search — that's fine
    return Response.json({ enabled: true, error: (e as Error).message, recent: [], biggest: [], total: 0 });
  }
}
