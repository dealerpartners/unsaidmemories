import { NextResponse } from "next/server";
import { getPgWithRetry, pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import {
  activateAdvertiser,
  getAdvertiserForUser,
} from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * /api/ads/campaigns — Ads v2 campaign collection (spec section 24).
 *
 * Campaigns belong to an ADVERTISER (ad_advertisers, one per user) —
 * not to an organization. Creating the first campaign activates the
 * advertiser row (K1), so the journey never dead-ends on a missing
 * account; /api/ads/account POST is the explicit form of the same act.
 *
 * POST creates a DRAFT with everything the spec's wizard collects in
 * one transaction: tier, placements (real ad_placements codes),
 * category targeting (taxonomy_nodes ids by reference — never
 * descendant rows), the compact targeting row, schedule, budgets,
 * special-category declaration (Y3), one default ad group, and any
 * creatives supplied inline. Paid tiers only: 'house' is reserved to
 * the platform's system advertiser.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cents(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const advertiser = await getAdvertiserForUser(user.id);
    if (!advertiser) return NextResponse.json({ campaigns: [] });
    const campaigns = await pgQueryStrict(
      `SELECT c.id::text AS id, c.name, c.status, c.special_category,
              c.category_match_mode, c.starts_at, c.ends_at,
              c.daily_budget_cents::text AS daily_budget_cents,
              c.lifetime_budget_cents::text AS lifetime_budget_cents,
              c.lifetime_spend_millicents::text AS lifetime_spend_millicents,
              ROUND(c.lifetime_spend_millicents / 1000.0)::text AS lifetime_spend_cents,
              t.code AS tier_code, c.created_at, c.updated_at,
              (SELECT count(*)::int FROM public.ad_creatives cr
                WHERE cr.campaign_id = c.id) AS creative_count,
              (SELECT count(*)::int FROM public.ad_campaign_groups g
                WHERE g.campaign_id = c.id) AS group_count,
              (SELECT COALESCE(impressions, 0)::text FROM public.ad_campaign_daily d
                WHERE d.campaign_id = c.id
                  AND d.delivery_date = CURRENT_DATE) AS impressions_today
         FROM public.ad_campaigns c
         JOIN public.ad_tiers t ON t.id = c.tier_id
        WHERE c.advertiser_id = $1
        ORDER BY c.created_at DESC
        LIMIT 100`,
      [advertiser.id],
    );
    return NextResponse.json({ campaigns });
  } catch {
    return NextResponse.json({ error: "campaigns_unavailable" }, { status: 503 });
  }
}

interface CreativeInput {
  name?: unknown;
  group_name?: unknown;
  asset_url?: unknown;
  click_url?: unknown;
  headline?: unknown;
  body?: unknown;
  cta?: unknown;
  width?: unknown;
  height?: unknown;
  assets?: Array<{ kind?: unknown; asset_url?: unknown; meta?: unknown }>;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }
  const tierCode = String(body.tier_code ?? body.tier ?? "silver")
    .trim()
    .toLowerCase();
  if (tierCode === "house") {
    return NextResponse.json(
      { error: "house_tier_reserved" },
      { status: 403 },
    );
  }
  const matchMode =
    body.category_match_mode === "descendants" ? "descendants" : "exact";
  const dailyBudget = cents(body.daily_budget_cents) ?? 0;
  const lifetimeBudget = cents(body.lifetime_budget_cents) ?? 0;
  const startsAt = body.starts_at ? new Date(String(body.starts_at)) : new Date();
  const endsAt = body.ends_at
    ? new Date(String(body.ends_at))
    : new Date(Date.now() + 30 * 24 * 3600 * 1000);
  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json({ error: "invalid_flight" }, { status: 400 });
  }

  // Placements: real inventory only (active ad_placements codes).
  const placementCodes = Array.isArray(body.placements)
    ? [...new Set(body.placements.map((p) => String(p).trim()).filter(Boolean))]
    : [];
  // Categories: taxonomy node ids, validated to exist.
  const categoryIds = Array.isArray(body.category_ids)
    ? [...new Set(body.category_ids.map((c) => String(c).trim()))]
    : [];
  if (categoryIds.some((c) => !UUID_RE.test(c))) {
    return NextResponse.json({ error: "invalid_category_id" }, { status: 400 });
  }

  // Validation + activation run on the pool; the client is acquired
  // only for the transactional writes below.
  const advertiser = await activateAdvertiser(user).catch(() => null);
  if (!advertiser) {
    return NextResponse.json({ error: "activation_unavailable" }, { status: 503 });
  }
  if (advertiser.status !== "active") {
    return NextResponse.json({ error: "advertiser_not_active" }, { status: 403 });
  }
  const tierRows = await pgQueryStrict<{ id: number }>(
    `SELECT id FROM public.ad_tiers WHERE code = $1 AND active = true`,
    [tierCode],
  ).catch(() => [] as { id: number }[]);
  if (!tierRows[0]) {
    return NextResponse.json({ error: "invalid_tier" }, { status: 400 });
  }
  let placements: { id: number; code: string }[] = [];
  if (placementCodes.length) {
    placements = await pgQueryStrict<{ id: number; code: string }>(
      `SELECT id, code FROM public.ad_placements
        WHERE code = ANY($1) AND active = true`,
      [placementCodes],
    );
    if (placements.length !== placementCodes.length) {
      return NextResponse.json({ error: "unknown_placement" }, { status: 400 });
    }
  }
  if (categoryIds.length) {
    const found = await pgQueryStrict<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.taxonomy_nodes
        WHERE id = ANY($1::uuid[])`,
      [categoryIds],
    );
    if ((found[0]?.n ?? 0) !== categoryIds.length) {
      return NextResponse.json({ error: "unknown_category" }, { status: 400 });
    }
  }

  const client = await getPgWithRetry();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO public.ad_campaigns
         (advertiser_id, tier_id, name, status, special_category,
          category_match_mode, starts_at, ends_at,
          daily_budget_cents, lifetime_budget_cents)
       VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9)
       RETURNING id::text AS id`,
      [
        advertiser.id,
        tierRows[0].id,
        name,
        body.special_category != null && String(body.special_category).trim()
          ? String(body.special_category).trim()
          : null,
        matchMode,
        startsAt.toISOString(),
        endsAt.toISOString(),
        dailyBudget,
        lifetimeBudget,
      ],
    );
    const campaignId = inserted.rows[0].id;

    // The default group; creatives live under groups (Y12).
    const groupRows = await client.query<{ id: string }>(
      `INSERT INTO public.ad_campaign_groups (campaign_id, name, status)
       VALUES ($1, $2, 'active') RETURNING id::text AS id`,
      [campaignId, String(body.group_name ?? "Group 1")],
    );
    const defaultGroupId = groupRows.rows[0].id;

    for (const p of placements) {
      await client.query(
        `INSERT INTO public.ad_campaign_placements (campaign_id, placement_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [campaignId, p.id],
      );
    }
    for (const cat of categoryIds) {
      await client.query(
        `INSERT INTO public.ad_campaign_categories (campaign_id, category_id)
         VALUES ($1, $2::uuid) ON CONFLICT DO NOTHING`,
        [campaignId, cat],
      );
    }

    const tg = (body.targeting ?? {}) as Record<string, unknown>;
    const hasTargeting =
      tg.device_mask != null ||
      Array.isArray(tg.language_codes) ||
      Array.isArray(tg.state_codes) ||
      tg.include_logged_in != null ||
      tg.include_anonymous != null;
    if (hasTargeting) {
      const mask = Number(tg.device_mask ?? 7);
      await client.query(
        `INSERT INTO public.ad_campaign_targeting
           (campaign_id, device_mask, language_codes, state_codes,
            include_logged_in, include_anonymous)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          campaignId,
          Number.isFinite(mask) ? Math.min(7, Math.max(0, Math.floor(mask))) : 7,
          Array.isArray(tg.language_codes)
            ? tg.language_codes.map((l) =>
                String(l).split("-")[0].toLowerCase(),
              )
            : null,
          Array.isArray(tg.state_codes)
            ? tg.state_codes.map((s) => String(s).toUpperCase().slice(0, 2))
            : null,
          tg.include_logged_in !== false,
          tg.include_anonymous !== false,
        ],
      );
    }

    const creativesIn = Array.isArray(body.creatives)
      ? (body.creatives as CreativeInput[])
      : [];
    const creatives: any[] = [];
    for (const c of creativesIn) {
      const assetUrl = String(c.asset_url ?? "").trim();
      const clickUrl = String(c.click_url ?? "").trim();
      if (!assetUrl || !clickUrl) continue;
      const width = Number(c.width ?? 1200);
      const height = Number(c.height ?? 628);
      const row = await client.query(
        `INSERT INTO public.ad_creatives
           (campaign_id, group_id, name, status, asset_url, click_url,
            headline, body, cta, width, height)
         VALUES ($1, $2, $3, 'pending_review', $4, $5, $6, $7, $8, $9, $10)
         RETURNING id::text AS id, name, status, asset_url, click_url,
                   headline, body, cta, width, height`,
        [
          campaignId,
          defaultGroupId,
          String(c.name ?? "Creative 1"),
          assetUrl,
          clickUrl,
          c.headline != null ? String(c.headline) : null,
          c.body != null ? String(c.body) : null,
          c.cta != null ? String(c.cta) : null,
          Number.isFinite(width) && width > 0 ? Math.floor(width) : 1200,
          Number.isFinite(height) && height > 0 ? Math.floor(height) : 628,
        ],
      );
      creatives.push(row.rows[0]);
      // Z7 companion assets ride along under the creative.
      for (const a of c.assets ?? []) {
        const kind = String(a.kind ?? "");
        const url = String(a.asset_url ?? "").trim();
        if (
          !["audio", "video", "companion_image", "captions", "logo"].includes(kind) ||
          !url
        ) {
          continue;
        }
        await client.query(
          `INSERT INTO public.ad_creative_assets (creative_id, kind, asset_url, meta)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [
            (row.rows[0] as { id: string }).id,
            kind,
            url,
            a.meta != null ? JSON.stringify(a.meta) : null,
          ],
        );
      }
    }

    await client.query("COMMIT");
    return NextResponse.json({
      campaign_id: campaignId,
      status: "draft",
      creatives,
    });
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return NextResponse.json(
      { error: "campaign_create_unavailable" },
      { status: 503 },
    );
  } finally {
    client.release();
  }
}
