import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { isAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ads/events — the W9 event-ledger audit read over
 * ad_events (the partitioned ledger POST /api/ads/events writes and the
 * click redirect records into). Every served impression and click lives
 * here, joined to its campaign, creative and placement for the desk.
 * Filters: ?campaign_id= (bigint v2 id), ?creative_id=, ?placement_id=,
 * ?type=impression|click, ?since= (ISO ts, default now-24h), ?limit=
 * (default 200, max 1000). Newest first. This is the read the licensee
 * side has never exposed — the advertiser sees rolled counters, the
 * admin sees the raw ledger. Admin only.
 */
function parseSince(v: string | null): Date {
  if (!v) {
    return new Date(Date.now() - 24 * 3600 * 1000);
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date(Date.now() - 24 * 3600 * 1000) : d;
}

export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaign_id");
  const creativeId = url.searchParams.get("creative_id");
  const placementId = url.searchParams.get("placement_id");
  const type = url.searchParams.get("type");
  const since = parseSince(url.searchParams.get("since"));
  const limitRaw = Number(url.searchParams.get("limit") ?? 200);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 1000
    ? limitRaw
    : 200;

  const conds: string[] = ["e.event_time >= $1"];
  const params: unknown[] = [since.toISOString()];
  const add = (v: unknown, col: string, numeric = false) => {
    if (v == null) return;
    const s = String(v).trim();
    if (!s) return;
    if (numeric && !/^\d+$/.test(s)) return;
    params.push(numeric ? Number(s) : s);
    conds.push(`${col} = $${params.length}`);
  };
  add(campaignId, "e.campaign_id", true);
  add(creativeId, "e.creative_id", true);
  add(placementId, "e.placement_id", true);
  if (type === "impression" || type === "click") {
    params.push(type);
    conds.push(`e.event_type = $${params.length}`);
  }

  try {
    const [events, counts] = await Promise.all([
      pgQueryStrict(
        `SELECT e.id::text AS id, e.event_time, e.event_type,
                e.tracking_id, e.campaign_id::text AS campaign_id,
                e.creative_id::text AS creative_id,
                e.placement_id::text AS placement_id,
                e.ad_uid, e.device_type, e.language_code, e.state_code,
                e.cpm_cents, e.page_id, e.category_id,
                c.name AS campaign_name,
                a.display_name AS advertiser_name,
                p.code AS placement_code
           FROM public.ad_events e
           LEFT JOIN public.ad_campaigns c ON c.id = e.campaign_id
           LEFT JOIN public.ad_advertisers a ON a.id = c.advertiser_id
           LEFT JOIN public.ad_placements p ON p.id = e.placement_id
          WHERE ${conds.join(" AND ")}
          ORDER BY e.event_time DESC
          LIMIT $${params.length + 1}`,
        [...params, limit],
      ),
      pgQueryStrict<{ event_type: string; n: number }>(
        `SELECT event_type, count(*)::bigint AS n
           FROM public.ad_events e
          WHERE ${conds.join(" AND ")}
          GROUP BY event_type`,
        params,
      ),
    ]);
    const summary: Record<string, number> = {};
    for (const r of counts) summary[r.event_type] = Number(r.n);
    return NextResponse.json({ events, summary, since: since.toISOString() });
  } catch {
    return NextResponse.json({ error: "events_unavailable" }, { status: 503 });
  }
}
