import { NextResponse } from "next/server";
import { getPgWithRetry, pgQueryStrict } from "@/lib/pg";
import {
  authenticateLicensee,
  hasScope,
} from "@/lib/licensee/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the caller's campaigns with their placement + direct-cost rate.
export async function GET(req: Request) {
  const auth = await authenticateLicensee(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rows = await pgQueryStrict(
    `SELECT c.id::text AS id, c.name, c.status, t.code AS tier_code,
            c.starts_at, c.ends_at,
            c.daily_budget_cents, c.lifetime_budget_cents,
            c.lifetime_spend_millicents,
            p.code AS placement_code, p.name AS placement_name,
            r.cpm_cents
       FROM public.ad_campaigns c
       JOIN public.ad_tiers t ON t.id = c.tier_id
       LEFT JOIN public.ad_campaign_placements cp ON cp.campaign_id = c.id
       LEFT JOIN public.ad_placements p ON p.id = cp.placement_id
       LEFT JOIN public.ad_campaign_rates r
         ON r.campaign_id = c.id AND r.placement_id = cp.placement_id
      WHERE c.advertiser_id = $1
      ORDER BY c.created_at DESC`,
    [auth.adAdvertiserId],
  );
  return NextResponse.json({ campaigns: rows });
}

// POST — build a campaign (starts as 'draft'; publish via PATCH).
// Body: { name, tier_code?, starts_at?, ends_at?, daily_budget_cents?,
//   lifetime_budget_cents?, placement_code, cpm_cents?, rate_card_item_id? }
// The direct cost is the campaign's rate: an explicit cpm_cents, or the
// cpm of the chosen rate-card item. No auction exists anywhere here.
export async function POST(req: Request) {
  const auth = await authenticateLicensee(req);
  if (!auth || !hasScope(auth, "ads:write")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  const placementCode = String(body.placement_code ?? "").trim();
  if (!name || !placementCode) {
    return NextResponse.json(
      { error: "name and placement_code are required" },
      { status: 400 },
    );
  }
  const tierCode = String(body.tier_code ?? "silver").trim().toLowerCase();
  const client = await getPgWithRetry();
  try {
    await client.query("BEGIN");
    const tier = await client.query<{ id: number }>(
      `SELECT id FROM public.ad_tiers WHERE code = $1 AND active = true LIMIT 1`,
      [tierCode],
    );
    const placement = await client.query<{ id: number }>(
      `SELECT id FROM public.ad_placements WHERE code = $1 AND active = true LIMIT 1`,
      [placementCode],
    );
    if (!tier.rows[0] || !placement.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "unknown_tier_or_placement" },
        { status: 400 },
      );
    }
    let cpmCents: number | null =
      body.cpm_cents != null ? Number(body.cpm_cents) : null;
    let rateCardItemId: number | null =
      body.rate_card_item_id != null ? Number(body.rate_card_item_id) : null;
    if (cpmCents == null && rateCardItemId != null) {
      const item = await client.query<{ cpm_cents: number }>(
        `SELECT cpm_cents FROM public.ad_rate_card_items
          WHERE id = $1 AND placement_id = $2 AND active = true LIMIT 1`,
        [rateCardItemId, placement.rows[0].id],
      );
      cpmCents = item.rows[0] ? Number(item.rows[0].cpm_cents) : null;
    }
    if (cpmCents == null || !Number.isFinite(cpmCents) || cpmCents < 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "cpm_cents or a matching rate_card_item_id is required" },
        { status: 400 },
      );
    }
    const camp = await client.query<{ id: string }>(
      `INSERT INTO public.ad_campaigns
         (advertiser_id, tier_id, name, status, starts_at, ends_at,
          daily_budget_cents, lifetime_budget_cents, lifetime_spend_millicents)
       VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, 0)
       RETURNING id::text AS id`,
      [
        auth.adAdvertiserId,
        tier.rows[0].id,
        name,
        body.starts_at != null ? String(body.starts_at) : null,
        body.ends_at != null ? String(body.ends_at) : null,
        body.daily_budget_cents != null ? Number(body.daily_budget_cents) : 0,
        body.lifetime_budget_cents != null
          ? Number(body.lifetime_budget_cents)
          : 0,
      ],
    );
    const campaignId = camp.rows[0].id;
    await client.query(
      `INSERT INTO public.ad_campaign_groups (campaign_id, name, status)
       VALUES ($1, 'Default', 'active')`,
      [campaignId],
    );
    await client.query(
      `INSERT INTO public.ad_campaign_placements (campaign_id, placement_id)
       VALUES ($1, $2)`,
      [campaignId, placement.rows[0].id],
    );
    await client.query(
      `INSERT INTO public.ad_campaign_rates
         (campaign_id, placement_id, cpm_cents, rate_card_item_id)
       VALUES ($1, $2, $3, $4)`,
      [campaignId, placement.rows[0].id, Math.round(cpmCents), rateCardItemId],
    );
    await client.query("COMMIT");
    return NextResponse.json(
      {
        id: campaignId,
        name,
        status: "draft",
        tier_code: tierCode,
        placement_code: placementCode,
        cpm_cents: Math.round(cpmCents),
      },
      { status: 201 },
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("licensee campaign create failed", err);
    return NextResponse.json({ error: "campaign_create_failed" }, { status: 503 });
  } finally {
    client.release();
  }
}
