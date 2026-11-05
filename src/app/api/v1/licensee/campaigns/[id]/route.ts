import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import {
  authenticateLicensee,
  hasScope,
} from "@/lib/licensee/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = new Set(["draft", "active", "paused", "ended"]);

async function ownedCampaign(authAdvertiserId: string, id: string) {
  const rows = await pgQueryStrict<{ id: string; status: string }>(
    `SELECT id::text AS id, status FROM public.ad_campaigns
      WHERE id = $1 AND advertiser_id = $2 LIMIT 1`,
    [id, authAdvertiserId],
  );
  return rows[0] ?? null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateLicensee(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const rows = await pgQueryStrict(
    `SELECT c.id::text AS id, c.name, c.status, t.code AS tier_code,
            c.starts_at, c.ends_at, c.daily_budget_cents,
            c.lifetime_budget_cents, c.lifetime_spend_millicents,
            p.code AS placement_code, r.cpm_cents
       FROM public.ad_campaigns c
       JOIN public.ad_tiers t ON t.id = c.tier_id
       LEFT JOIN public.ad_campaign_placements cp ON cp.campaign_id = c.id
       LEFT JOIN public.ad_placements p ON p.id = cp.placement_id
       LEFT JOIN public.ad_campaign_rates r
         ON r.campaign_id = c.id AND r.placement_id = cp.placement_id
      WHERE c.id = $1 AND c.advertiser_id = $2`,
    [id, auth.adAdvertiserId],
  );
  if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ campaign: rows[0] });
}

// PATCH — publish (status 'active'), pause, end, or re-flight a campaign.
// Publishing requires a flight window: serve eligibility is
// starts_at <= now < ends_at, so an active campaign with no window
// would silently never serve — refused here instead.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateLicensee(req);
  if (!auth || !hasScope(auth, "ads:write")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const owned = await ownedCampaign(auth.adAdvertiserId, id);
  if (!owned) return NextResponse.json({ error: "not_found" }, { status: 404 });
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const sets: string[] = [];
  const vals: unknown[] = [];
  const push = (sql: string, v: unknown) => {
    vals.push(v);
    sets.push(`${sql} $${vals.length}`);
  };
  if (body.status != null) {
    const status = String(body.status);
    if (!STATUSES.has(status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }
    if (status === "active") {
      const cur = await pgQueryStrict<{ starts_at: string | null; ends_at: string | null }>(
        `SELECT starts_at, ends_at FROM public.ad_campaigns WHERE id = $1`,
        [id],
      );
      const starts = body.starts_at != null ? String(body.starts_at) : cur[0]?.starts_at;
      const ends = body.ends_at != null ? String(body.ends_at) : cur[0]?.ends_at;
      if (!starts || !ends) {
        return NextResponse.json(
          { error: "publishing requires starts_at and ends_at" },
          { status: 400 },
        );
      }
    }
    push("status =", status);
  }
  if (body.name != null) push("name =", String(body.name));
  if (body.starts_at != null) push("starts_at =", String(body.starts_at));
  if (body.ends_at != null) push("ends_at =", String(body.ends_at));
  if (body.daily_budget_cents != null)
    push("daily_budget_cents =", Number(body.daily_budget_cents));
  if (body.lifetime_budget_cents != null)
    push("lifetime_budget_cents =", Number(body.lifetime_budget_cents));
  if (!sets.length) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }
  vals.push(id);
  await pgQueryStrict(
    `UPDATE public.ad_campaigns SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $${vals.length}`,
    vals,
  );
  return NextResponse.json({ ok: true });
}
