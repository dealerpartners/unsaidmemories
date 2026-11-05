import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { orgIdForUser } from "@/lib/ads-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/insights — audience insights (Z3). Computed from the
 * org's real saved audiences (ad_audiences: stored size/reach plus the
 * targeting documents — the retained audience store) and the caller's
 * Ads v2 delivery totals (ad_campaign_daily for impressions/clicks,
 * ad_events for reach; the v2 ledger has no conversion event type, so
 * conversions report an honest 0). Facet counts describe the audiences
 * the advertiser built — how many target each location/language/
 * device — never invented panel data.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const organizationId = await orgIdForUser(user.id);
    if (!organizationId) return NextResponse.json({ audiences: [], delivery: null, facets: {} });
    const [audiences, delivery] = await Promise.all([
      pgQueryStrict(
        `SELECT id, name, targeting, criteria, size, reach, created_at
           FROM public.ad_audiences
          WHERE organization_id = $1
          ORDER BY created_at DESC
          LIMIT 100`,
        [organizationId],
      ),
      pgQueryStrict<{ impressions: number; clicks: number; reach: number; conversions: number }>(
        `SELECT COALESCE((SELECT sum(d.impressions) FROM public.ad_campaign_daily d
                           JOIN public.ad_campaigns c ON c.id = d.campaign_id
                           JOIN public.ad_advertisers a ON a.id = c.advertiser_id
                          WHERE a.user_id = $1), 0)::float AS impressions,
                COALESCE((SELECT sum(d.clicks) FROM public.ad_campaign_daily d
                           JOIN public.ad_campaigns c ON c.id = d.campaign_id
                           JOIN public.ad_advertisers a ON a.id = c.advertiser_id
                          WHERE a.user_id = $1), 0)::float AS clicks,
                (SELECT count(DISTINCT e.ad_uid) FROM public.ad_events e
                   JOIN public.ad_campaigns c ON c.id = e.campaign_id
                   JOIN public.ad_advertisers a ON a.id = c.advertiser_id
                  WHERE a.user_id = $1 AND e.event_type = 'impression')::float AS reach,
                0::float AS conversions`,
        [user.id],
      ),
    ]);
    const facets: Record<string, Record<string, number>> = {
      locations: {},
      languages: {},
      devices: {},
      genders: {},
    };
    const bump = (bucket: Record<string, number>, key: string) => {
      bucket[key] = (bucket[key] ?? 0) + 1;
    };
    for (const a of audiences) {
      const t = (a.targeting ?? a.criteria ?? {}) as Record<string, unknown>;
      for (const loc of (t.locations as string[]) ?? []) bump(facets.locations, String(loc));
      for (const lang of (t.languages as string[]) ?? []) bump(facets.languages, String(lang));
      for (const dev of (t.devices as string[]) ?? []) bump(facets.devices, String(dev));
      if (t.gender) bump(facets.genders, String(t.gender));
    }
    return NextResponse.json({ audiences, delivery: delivery[0] ?? null, facets });
  } catch {
    return NextResponse.json({ error: "insights_unavailable" }, { status: 503 });
  }
}
