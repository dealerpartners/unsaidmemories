import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { ensureDeveloperContext } from "@/lib/devportal-server";
import { ensureAdAccount } from "@/lib/ads-server";
import { loadOwnedCampaign } from "@/lib/ads/advertiser";
import { MASTER_TENANT_ID } from "@/lib/site-tenant";

export const dynamic = "force-dynamic";

/**
 * /api/ads/rebates — the rebate offer system (ad_rebates, Y11). The
 * table existed live with zero code references; the create-flow rebate
 * step rendered a fabricated template. Rebates belong to the ad
 * account, optionally scoped to one of its campaigns; the billing desk
 * reads the same rows (billing/rebates renders this API). Status is the
 * lifecycle the advertiser controls here: draft → active → paused/ended.
 * Campaign scoping is split by engine (20261169): campaign_v2_id for
 * v2 campaigns (ownership via the caller's advertiser), the legacy
 * uuid campaign_id for historical ones (org ownership, name resolved
 * through ad_legacy_campaigns).
 */
async function accountFor(user: Parameters<typeof ensureDeveloperContext>[0]) {
  const ctx = await ensureDeveloperContext(user);
  const account = await ensureAdAccount(
    ctx.organizationId,
    ctx.tenantId ?? MASTER_TENANT_ID,
    ctx.organizationName,
  );
  return { ctx, account };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const { account } = await accountFor(user);
    const rebates = await pgQueryStrict(
      `SELECT r.id, r.account_id, r.campaign_id, r.campaign_v2_id,
              COALESCE(r.campaign_v2_id::text, r.campaign_id::text) AS campaign_ref,
              (r.campaign_id IS NOT NULL) AS legacy,
              r.name, r.rebate_type, r.amount,
              r.percent, r.conditions, r.status, r.starts_at, r.ends_at,
              r.created_at, r.updated_at,
              COALESCE(cv.name, cl.name) AS campaign_name
         FROM public.ad_rebates r
         LEFT JOIN public.ad_campaigns cv ON cv.id = r.campaign_v2_id
         LEFT JOIN public.ad_legacy_campaigns cl ON cl.id = r.campaign_id
        WHERE r.account_id = $1
        ORDER BY r.created_at DESC
        LIMIT 100`,
      [account.id],
    );
    return NextResponse.json({ rebates });
  } catch {
    return NextResponse.json({ error: "rebates_unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const name = String(body.name ?? "").trim();
  const rebateType = String(body.rebate_type ?? "percent_off");
  const percent = body.percent == null ? null : Number(body.percent);
  const amount = body.amount == null ? null : Number(body.amount);
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
  if (!["percent_off", "fixed_credit", "bonus_impressions"].includes(rebateType))
    return NextResponse.json({ error: "invalid_rebate_type" }, { status: 400 });
  if (rebateType === "percent_off" && !(percent && percent > 0 && percent <= 100))
    return NextResponse.json({ error: "percent_required" }, { status: 400 });
  if (rebateType !== "percent_off" && !(amount && amount > 0))
    return NextResponse.json({ error: "amount_required" }, { status: 400 });
  try {
    const { ctx, account } = await accountFor(user);
    let campaignId: string | null = null;
    let campaignV2Id: string | null = null;
    const campaignRef = body.campaign_v2_id ?? body.campaign_id;
    if (campaignRef) {
      const ref = String(campaignRef);
      if (/^\d+$/.test(ref)) {
        const owned = await loadOwnedCampaign(user.id, ref);
        if (!owned) return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
        campaignV2Id = ref;
      } else {
        const owned = await pgQueryStrict<{ id: string }>(
          `SELECT id FROM public.ad_legacy_campaigns WHERE id = $1 AND organization_id = $2`,
          [ref, ctx.organizationId],
        );
        if (!owned[0]) return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
        campaignId = owned[0].id;
      }
    }
    const rows = await pgQueryStrict(
      `INSERT INTO public.ad_rebates
         (account_id, campaign_id, campaign_v2_id, name, rebate_type, amount, percent, conditions, status, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'draft', $9, $10)
       RETURNING id, account_id, campaign_id, campaign_v2_id, name, rebate_type, amount, percent, conditions, status, starts_at, ends_at, created_at, updated_at`,
      [
        account.id,
        campaignId,
        campaignV2Id,
        name,
        rebateType,
        amount,
        percent,
        JSON.stringify(body.conditions ?? {}),
        body.starts_at ? String(body.starts_at) : null,
        body.ends_at ? String(body.ends_at) : null,
      ],
    );
    return NextResponse.json({ rebate: rows[0] });
  } catch {
    return NextResponse.json({ error: "rebate_create_unavailable" }, { status: 503 });
  }
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const id = String(body.id ?? "");
  const status = String(body.status ?? "");
  if (!id || !["draft", "active", "paused", "ended"].includes(status))
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  try {
    const { account } = await accountFor(user);
    const rows = await pgQueryStrict(
      `UPDATE public.ad_rebates SET status = $3, updated_at = now()
        WHERE id = $1 AND account_id = $2
        RETURNING id, status`,
      [id, account.id, status],
    );
    if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ rebate: rows[0] });
  } catch {
    return NextResponse.json({ error: "rebate_update_unavailable" }, { status: 503 });
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  try {
    const { account } = await accountFor(user);
    const rows = await pgQueryStrict(
      `DELETE FROM public.ad_rebates WHERE id = $1 AND account_id = $2 RETURNING id`,
      [id, account.id],
    );
    if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "rebate_delete_unavailable" }, { status: 503 });
  }
}
