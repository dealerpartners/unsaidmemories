import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";
import { requireSupabase } from "@/lib/supabase/guard";

/**
 * GET /api/dashboard/usage — last 30 days of per-day usage aggregates.
 *
 * Schema (after 2026-08-16 migration): usage_daily columns are snake_case
 *   (day, request_count, error_count, p50_ms, p95_ms, p99_ms)
 *   NO top_endpoint column — derived separately from api_key_events.
 */
export async function GET() {
  const __sb = requireSupabase(); if (__sb) return __sb;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createServerClient();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

  const { data: rows, error } = await supabase
    .from("usage_daily")
    .select(
      "day, request_count, error_count, p50_ms, p95_ms, p99_ms",
    )
    .gte("day", thirtyDaysAgo.toISOString().slice(0, 10))
    .order("day", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = rows ?? [];

  const byDay = new Map<
    string,
    {
      day: string;
      requestCount: number;
      errorCount: number;
      p50Max: number;
      p99Max: number;
      topEndpoint: string | null;
    }
  >();

  for (const r of list) {
    const rawDay = r.day;
    const dayKey = typeof rawDay === "string" ? rawDay.slice(0, 10) : String(rawDay).slice(0, 10);
    const entry = byDay.get(dayKey) ?? {
      day: dayKey,
      requestCount: 0,
      errorCount: 0,
      p50Max: 0,
      p99Max: 0,
      topEndpoint: null,
    };
    entry.requestCount += r.request_count ?? 0;
    entry.errorCount += r.error_count ?? 0;
    entry.p50Max = Math.max(entry.p50Max, r.p50_ms ?? 0);
    entry.p99Max = Math.max(entry.p99Max, r.p99_ms ?? 0);
    byDay.set(dayKey, entry);
  }

  const aggregated = Array.from(byDay.values());
  const totalRequests = aggregated.reduce((s, r) => s + r.requestCount, 0);
  const totalErrors = aggregated.reduce((s, r) => s + r.errorCount, 0);
  const daysWithTraffic = aggregated.filter((r) => r.requestCount > 0);
  const avgP50 = daysWithTraffic.length
    ? Math.round(
        daysWithTraffic.reduce((s, r) => s + r.p50Max, 0) /
          daysWithTraffic.length,
      )
    : 0;
  const avgP99 = daysWithTraffic.length
    ? Math.round(
        daysWithTraffic.reduce((s, r) => s + r.p99Max, 0) /
          daysWithTraffic.length,
      )
    : 0;

  // Top endpoints — derive from api_key_events for the last 30 days
  const { data: eventRows } = await supabase
    .from("api_key_events")
    .select("path")
    .gte("created_at", thirtyDaysAgo.toISOString());

  const endpointCounts = new Map<string, number>();
  if (eventRows) {
    for (const e of eventRows) {
      const p = e.path ?? "unknown";
      endpointCounts.set(p, (endpointCounts.get(p) ?? 0) + 1);
    }
  }
  const topEndpoints = Array.from(endpointCounts.entries())
    .map(([endpoint, count]) => ({ endpoint, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return NextResponse.json({
    rows: aggregated.map((r) => ({
      day: r.day,
      requestCount: r.requestCount,
      errorCount: r.errorCount,
      p50Ms: r.p50Max,
      p99Ms: r.p99Max,
      topEndpoint: r.topEndpoint,
    })),
    totalRequests,
    totalErrors,
    avgP50,
    avgP99,
    topEndpoints,
  });
}
