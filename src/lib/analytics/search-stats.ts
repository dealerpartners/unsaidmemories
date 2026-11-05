// I2/I3 · Search statistics over public.search_events (migration
// 20261090), recorded by POST /api/shop/search/events from the header
// search. Returns null when the store is unavailable (migration not yet
// applied) — callers then keep serving the stated absence rather than
// invented numbers. When the store exists but holds no events yet, the
// stats are real zeros with empty lists (recorded: true, total: 0).

type PgClientLike = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

export interface SearchStats {
  recorded: true;
  windowDays: 30;
  totalSearches: number;
  searchesWithResults: number;
  zeroResultSearches: number;
  clicks: number;
  clickThroughPct: number | null;
  topQueries: { query: string; searches: number }[];
  zeroResultQueries: { query: string; searches: number }[];
  derivation: string;
}

export async function searchStats(
  client: PgClientLike,
  tenant: string,
): Promise<SearchStats | null> {
  try {
    const { rows: totals } = await client.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE result_count IS NOT NULL AND result_count > 0)::int AS with_results,
              count(*) FILTER (WHERE result_count = 0)::int AS zero_result,
              count(*) FILTER (WHERE clicked_ref IS NOT NULL)::int AS clicks
         FROM public.search_events
        WHERE tenant_id = $1 AND created_at >= now() - interval '30 days'`,
      [tenant],
    );
    const { rows: top } = await client.query(
      `SELECT lower(query) AS query, count(*)::int AS searches
         FROM public.search_events
        WHERE tenant_id = $1 AND created_at >= now() - interval '30 days'
        GROUP BY lower(query) ORDER BY searches DESC, query ASC LIMIT 10`,
      [tenant],
    );
    const { rows: zero } = await client.query(
      `SELECT lower(query) AS query, count(*)::int AS searches
         FROM public.search_events
        WHERE tenant_id = $1 AND created_at >= now() - interval '30 days' AND result_count = 0
        GROUP BY lower(query) ORDER BY searches DESC, query ASC LIMIT 10`,
      [tenant],
    );
    const t = totals[0] ?? { total: 0, with_results: 0, zero_result: 0, clicks: 0 };
    return {
      recorded: true,
      windowDays: 30,
      totalSearches: t.total,
      searchesWithResults: t.with_results,
      zeroResultSearches: t.zero_result,
      clicks: t.clicks,
      clickThroughPct: t.total > 0 ? Math.round((t.clicks / t.total) * 1000) / 10 : null,
      topQueries: top.map((r: any) => ({ query: String(r.query), searches: Number(r.searches) })),
      zeroResultQueries: zero.map((r: any) => ({ query: String(r.query), searches: Number(r.searches) })),
      derivation:
        "Recorded by the shop search itself: the header search beacons each submitted search and each result click to /api/shop/search/events, stored in public.search_events. Figures cover the last 30 days of recorded events; before the store existed, nothing was recorded (the prior stated absence).",
    };
  } catch {
    return null;
  }
}
