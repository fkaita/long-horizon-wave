import { query, tinybirdEnabled } from "@/lib/tinybird";

export const dynamic = "force-dynamic";

export interface LiveRow {
  location: string;
  searches: number;
  wave_height_ft: number | null;
  last_seen: string;
}

export async function GET() {
  if (!tinybirdEnabled()) return Response.json({ enabled: false, recent: [], biggest: [], total: 0 });
  try {
    const [recent, biggest, total] = await Promise.all([
      query<LiveRow>(
        `SELECT location, count() AS searches, argMax(wave_height_ft, timestamp) AS wave_height_ft, max(timestamp) AS last_seen
         FROM wave_searches GROUP BY location ORDER BY last_seen DESC LIMIT 8`,
      ),
      query<LiveRow>(
        `SELECT location, count() AS searches, max(wave_height_ft) AS wave_height_ft, max(timestamp) AS last_seen
         FROM wave_searches WHERE timestamp > now() - INTERVAL 1 DAY AND wave_height_ft IS NOT NULL
         GROUP BY location ORDER BY wave_height_ft DESC LIMIT 5`,
      ),
      query<{ n: number }>(`SELECT count() AS n FROM wave_searches`),
    ]);
    return Response.json({ enabled: true, recent, biggest, total: total[0]?.n ?? 0 });
  } catch (e) {
    return Response.json({ enabled: true, error: (e as Error).message, recent: [], biggest: [], total: 0 });
  }
}
