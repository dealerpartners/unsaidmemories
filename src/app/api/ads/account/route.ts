import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import {
  activateAdvertiser,
  getAdvertiserForUser,
} from "@/lib/ads/advertiser";

export const dynamic = "force-dynamic";

/**
 * /api/ads/account — the Ads v2 advertiser account (K1 / AB1-AB3).
 *
 * K1: the ad_advertisers row IS the "Account Upgrade to Business".
 *   GET   — the signed-in user's advertiser (or { advertiser: null });
 *           never provisions. Campaign counts ride along for the
 *           account surface.
 *   POST  — activate: get-or-create the row, one per user,
 *           idempotent. This is the moment a marketplace user becomes
 *           an advertiser; onboarding then collects business profile
 *           details on top of the row (a profile experience, not an
 *           eligibility gate).
 *   PATCH — { display_name }: rename the business.
 *
 * (This route previously served the org-keyed ad_accounts model; the
 * account portal pages that read that shape are named remainders in
 * supabase/ads-v2/INVENTORY-MAP.md.)
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const advertiser = await getAdvertiserForUser(user.id);
    if (!advertiser) return NextResponse.json({ advertiser: null });
    const counts = await pgQueryStrict<{ status: string; n: number }>(
      `SELECT status, count(*)::int AS n FROM public.ad_campaigns
        WHERE advertiser_id = $1 GROUP BY status`,
      [advertiser.id],
    );
    return NextResponse.json({
      advertiser,
      campaigns: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    });
  } catch {
    return NextResponse.json({ error: "account_unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    body = {};
  }
  try {
    const before = await getAdvertiserForUser(user.id);
    const advertiser = await activateAdvertiser(
      user,
      body.display_name != null ? String(body.display_name) : null,
    );
    return NextResponse.json({ advertiser, created: !before });
  } catch {
    return NextResponse.json({ error: "activation_unavailable" }, { status: 503 });
  }
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const displayName = String(body.display_name ?? body.name ?? "").trim();
  if (!displayName) {
    return NextResponse.json({ error: "display_name_required" }, { status: 400 });
  }
  try {
    const rows = await pgQueryStrict(
      `UPDATE public.ad_advertisers
          SET display_name = $2, updated_at = now()
        WHERE user_id = $1
        RETURNING id::text AS id, user_id, display_name, is_system, status,
                  created_at, updated_at`,
      [user.id, displayName],
    );
    if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ advertiser: rows[0] });
  } catch {
    return NextResponse.json({ error: "account_update_unavailable" }, { status: 503 });
  }
}
