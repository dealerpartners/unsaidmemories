import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";
import { requireSupabase } from "@/lib/supabase/guard";

/**
 * GET /api/dashboard/stats — overview numbers for the dashboard home page.
 *
 * Schema (after 2026-08-16 migration):
 *   - api_keys.revoked is BOOLEAN (not revoked_at timestamp)
 *   - webhooks table is now webhook_subscriptions
 *   - usage_daily columns are snake_case (request_count, error_count)
 */
export async function GET() {
  const __sb = requireSupabase(); if (__sb) return __sb;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createServerClient();

  const [
    { count: totalKeys },
    { count: activeKeys },
    { count: revokedKeys },
    { count: webhookCount },
  ] = await Promise.all([
    supabase.from("api_keys").select("*", { count: "exact", head: true }),
    supabase
      .from("api_keys")
      .select("*", { count: "exact", head: true })
      .eq("revoked", false),
    supabase
      .from("api_keys")
      .select("*", { count: "exact", head: true })
      .eq("revoked", true),
    supabase.from("webhook_subscriptions").select("*", { count: "exact", head: true }),
  ]);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

  const { data: usageRows } = await supabase
    .from("usage_daily")
    .select("day, request_count")
    .gte("day", thirtyDaysAgo.toISOString().slice(0, 10));

  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);
  const todayKey = todayUTC.toISOString().slice(0, 10);

  let requestsToday = 0;
  let requests30d = 0;
  if (usageRows) {
    for (const r of usageRows) {
      const cnt = r.request_count ?? 0;
      requests30d += cnt;
      const dayStr = typeof r.day === "string" ? r.day.slice(0, 10) : String(r.day).slice(0, 10);
      if (dayStr >= todayKey) {
        requestsToday += cnt;
      }
    }
  }

  return NextResponse.json({
    totalKeys: totalKeys ?? 0,
    activeKeys: activeKeys ?? 0,
    revokedKeys: revokedKeys ?? 0,
    webhookCount: webhookCount ?? 0,
    requestsToday,
    requests30d,
  });
}
