import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser, isAdmin } from "@/lib/auth/server";
import {
  loadCampaign,
  loadOwnedCampaign,
} from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * /api/ads/campaigns/:id — Ads v2 campaign detail + update.
 *
 * GET returns the full working record: tier, placements (codes),
 * category targeting (taxonomy node ids + their names/slugs),
 * the compact targeting row, groups with their creatives, and the
 * launch rate snapshots.
 *
 * PATCH updates fields and walks the P3 lifecycle:
 *   advertiser moves: draft -> scheduled, scheduled -> preflight
 *   (submit), -> ended (owner ends their own campaign);
 *   preflight -> approved is the ADMIN review act (W9) and requires
 *   an admin session; activation itself is POST /:id/launch.
 * Structural edits (placements / categories / targeting) are
 * accepted only before approval (draft / scheduled / preflight);
 * name and budgets may change any time before 'ended'.
 * A suspended advertiser's campaigns cannot advance status.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OWNER_TRANSITIONS: Record<string, string[]> = {
  draft: ["scheduled", "ended"],
  scheduled: ["preflight", "ended"],
  preflight: ["ended"],
  approved: ["ended"],
  active: ["ended"],
  paused: ["ended"],
  ended: [],
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const owned = await loadOwnedCampaign(user.id, id);
    const campaign =
      owned?.campaign ??
      ((await isAdmin()) ? await loadCampaign(id) : null);
    if (!campaign) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const [placements, categories, targeting, groups, rates, creatives] =
      await Promise.all([
        pgQueryStrict(
          `SELECT p.id, p.code, p.name FROM public.ad_campaign_placements cp
            JOIN public.ad_placements p ON p.id = cp.placement_id
            WHERE cp.campaign_id = $1 ORDER BY p.code`,
          [id],
        ),
        pgQueryStrict(
          `SELECT n.id::text AS category_id, n.name, n.slug, n.depth
             FROM public.ad_campaign_categories cc
             JOIN public.taxonomy_nodes n ON n.id = cc.category_id
            WHERE cc.campaign_id = $1 ORDER BY n.depth, n.name`,
          [id],
        ),
        pgQueryStrict(
          `SELECT device_mask, language_codes, state_codes,
                  include_logged_in, include_anonymous
             FROM public.ad_campaign_targeting WHERE campaign_id = $1`,
          [id],
        ),
        pgQueryStrict(
          `SELECT g.id::text AS id, g.name, g.status,
                  COALESCE(jsonb_agg(
                    jsonb_build_object(
                      'id', cr.id::text, 'name', cr.name, 'status', cr.status,
                      'asset_url', cr.asset_url, 'click_url', cr.click_url,
                      'headline', cr.headline, 'body', cr.body, 'cta', cr.cta,
                      'width', cr.width, 'height', cr.height)
                    ORDER BY cr.id) FILTER (WHERE cr.id IS NOT NULL), '[]'::jsonb)
                    AS creatives
             FROM public.ad_campaign_groups g
             LEFT JOIN public.ad_creatives cr ON cr.group_id = g.id
            WHERE g.campaign_id = $1
            GROUP BY g.id ORDER BY g.id`,
          [id],
        ),
        pgQueryStrict(
          `SELECT placement_id, cpm_cents, rate_card_item_id::text AS rate_card_item_id
             FROM public.ad_campaign_rates WHERE campaign_id = $1`,
          [id],
        ),
        pgQueryStrict(
          `SELECT cr.id::text AS id, cr.group_id::text AS group_id,
                  cr.name, cr.status, cr.asset_url, cr.click_url,
                  cr.headline, cr.body, cr.cta, cr.width, cr.height
             FROM public.ad_creatives cr
             JOIN public.ad_campaign_groups g ON g.id = cr.group_id
            WHERE g.campaign_id = $1
            ORDER BY cr.id`,
          [id],
        ),
      ]);
    return NextResponse.json({
      campaign,
      placements,
      categories,
      targeting: targeting[0] ?? null,
      groups,
      rates,
      creatives,
    });
  } catch {
    return NextResponse.json({ error: "campaign_unavailable" }, { status: 503 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const owned = await loadOwnedCampaign(user.id, id);
    const campaign =
      owned?.campaign ??
      ((await isAdmin()) ? await loadCampaign(id) : null);
    if (!campaign) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const adminAct = !owned;

    // --- lifecycle transitions -------------------------------------
    if (body.status !== undefined) {
      const to = String(body.status);
      if (to === "approved") {
        // The review act (P3/W9): admin-only, only from preflight.
        if (!(await isAdmin())) {
          return NextResponse.json(
            { error: "approval_requires_admin" },
            { status: 403 },
          );
        }
        if (campaign.status !== "preflight") {
          return NextResponse.json(
            { error: "invalid_transition", from: campaign.status, to },
            { status: 409 },
          );
        }
      } else {
        if (adminAct) {
          return NextResponse.json({ error: "forbidden" }, { status: 403 });
        }
        const allowed = OWNER_TRANSITIONS[campaign.status] ?? [];
        if (!allowed.includes(to)) {
          return NextResponse.json(
            { error: "invalid_transition", from: campaign.status, to },
            { status: 409 },
          );
        }
        if (owned && owned.advertiser.status !== "active" && to !== "ended") {
          return NextResponse.json(
            { error: "advertiser_not_active" },
            { status: 403 },
          );
        }
      }
      await pgQueryStrict(
        `UPDATE public.ad_campaigns SET status = $2, updated_at = now()
          WHERE id = $1`,
        [id, to],
      );
      return NextResponse.json({ campaign_id: id, status: to });
    }

    // --- field updates (owner only) --------------------------------
    if (!owned) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const structural =
      body.placements !== undefined ||
      body.category_ids !== undefined ||
      body.targeting !== undefined;
    if (
      structural &&
      !["draft", "scheduled", "preflight"].includes(campaign.status)
    ) {
      return NextResponse.json(
        { error: "campaign_locked", status: campaign.status },
        { status: 409 },
      );
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (col: string, v: unknown) => {
      values.push(v);
      sets.push(`${col} = $${values.length}`);
    };
    if (body.name !== undefined) set("name", String(body.name).trim());
    if (body.special_category !== undefined) {
      set(
        "special_category",
        body.special_category != null && String(body.special_category).trim()
          ? String(body.special_category).trim()
          : null,
      );
    }
    if (body.category_match_mode !== undefined) {
      set(
        "category_match_mode",
        body.category_match_mode === "descendants" ? "descendants" : "exact",
      );
    }
    if (body.starts_at !== undefined) set("starts_at", String(body.starts_at));
    if (body.ends_at !== undefined) set("ends_at", String(body.ends_at));
    if (body.daily_budget_cents !== undefined) {
      set("daily_budget_cents", Math.max(0, Math.floor(Number(body.daily_budget_cents) || 0)));
    }
    if (body.lifetime_budget_cents !== undefined) {
      set("lifetime_budget_cents", Math.max(0, Math.floor(Number(body.lifetime_budget_cents) || 0)));
    }
    if (body.tier_code !== undefined) {
      const code = String(body.tier_code).toLowerCase();
      if (code === "house") {
        return NextResponse.json({ error: "house_tier_reserved" }, { status: 403 });
      }
      const t = await pgQueryStrict<{ id: number }>(
        `SELECT id FROM public.ad_tiers WHERE code = $1 AND active = true`,
        [code],
      );
      if (!t[0]) {
        return NextResponse.json({ error: "invalid_tier" }, { status: 400 });
      }
      set("tier_id", t[0].id);
    }
    if (sets.length) {
      values.push(id);
      await pgQueryStrict(
        `UPDATE public.ad_campaigns SET ${sets.join(", ")}, updated_at = now()
          WHERE id = $${values.length}`,
        values,
      );
    }

    if (Array.isArray(body.placements)) {
      const codes = [...new Set(body.placements.map((p) => String(p)))];
      const rows = await pgQueryStrict<{ id: number; code: string }>(
        `SELECT id, code FROM public.ad_placements
          WHERE code = ANY($1) AND active = true`,
        [codes],
      );
      if (rows.length !== codes.length) {
        return NextResponse.json({ error: "unknown_placement" }, { status: 400 });
      }
      await pgQueryStrict(
        `DELETE FROM public.ad_campaign_placements WHERE campaign_id = $1`,
        [id],
      );
      for (const r of rows) {
        await pgQueryStrict(
          `INSERT INTO public.ad_campaign_placements (campaign_id, placement_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, r.id],
        );
      }
    }
    if (Array.isArray(body.category_ids)) {
      const ids = [...new Set(body.category_ids.map((c) => String(c)))];
      if (ids.some((c) => !UUID_RE.test(c))) {
        return NextResponse.json({ error: "invalid_category_id" }, { status: 400 });
      }
      await pgQueryStrict(
        `DELETE FROM public.ad_campaign_categories WHERE campaign_id = $1`,
        [id],
      );
      for (const c of ids) {
        await pgQueryStrict(
          `INSERT INTO public.ad_campaign_categories (campaign_id, category_id)
           VALUES ($1, $2::uuid) ON CONFLICT DO NOTHING`,
          [id, c],
        );
      }
    }
    if (body.targeting !== undefined) {
      const tg = (body.targeting ?? {}) as Record<string, unknown>;
      const mask = Number(tg.device_mask ?? 7);
      await pgQueryStrict(
        `INSERT INTO public.ad_campaign_targeting
           (campaign_id, device_mask, language_codes, state_codes,
            include_logged_in, include_anonymous)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (campaign_id) DO UPDATE SET
           device_mask = EXCLUDED.device_mask,
           language_codes = EXCLUDED.language_codes,
           state_codes = EXCLUDED.state_codes,
           include_logged_in = EXCLUDED.include_logged_in,
           include_anonymous = EXCLUDED.include_anonymous`,
        [
          id,
          Number.isFinite(mask) ? Math.min(7, Math.max(0, Math.floor(mask))) : 7,
          Array.isArray(tg.language_codes)
            ? tg.language_codes.map((l) => String(l).split("-")[0].toLowerCase())
            : null,
          Array.isArray(tg.state_codes)
            ? tg.state_codes.map((s) => String(s).toUpperCase().slice(0, 2))
            : null,
          tg.include_logged_in !== false,
          tg.include_anonymous !== false,
        ],
      );
    }

    const updated = await loadCampaign(id);
    return NextResponse.json({ campaign: updated });
  } catch {
    return NextResponse.json({ error: "campaign_update_unavailable" }, { status: 503 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const owned = await loadOwnedCampaign(user.id, id);
    if (!owned) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (owned.campaign.status === "active") {
      return NextResponse.json(
        { error: "campaign_active", detail: "pause or end the campaign first" },
        { status: 409 },
      );
    }
    await pgQueryStrict(`DELETE FROM public.ad_campaigns WHERE id = $1`, [id]);
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "campaign_delete_unavailable" }, { status: 503 });
  }
}
