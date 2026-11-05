import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { ensureDeveloperContext } from "@/lib/devportal-server";
import { ensureAdAccount } from "@/lib/ads-server";
import { MASTER_TENANT_ID } from "@/lib/site-tenant";

export const dynamic = "force-dynamic";

/**
 * /api/ads/marketplace — the Direct Ad Marketplace listings
 * (ad_marketplace_listings, U17 redefined in the Ads v2 node map:
 * direct deals replace the programmatic engine). Accounts publish
 * inventory (placement codes at a floor price); every active listing
 * is visible to signed-in advertisers, own listings flagged `mine`
 * and editable. Placement keys are the v2 placement CODES
 * (ad_placements.code — the same strings the legacy keys used for
 * every surviving placement; shop_grid_top is retired and no longer
 * validates).
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
    const listings = await pgQueryStrict(
      `SELECT id, account_id, title, description, placement_keys, price_model,
              floor_price, status, created_at, updated_at,
              (account_id = $1) AS mine
         FROM public.ad_marketplace_listings
        WHERE status = 'active' OR account_id = $1
        ORDER BY created_at DESC
        LIMIT 200`,
      [account.id],
    );
    return NextResponse.json({ listings });
  } catch {
    return NextResponse.json({ error: "marketplace_unavailable" }, { status: 503 });
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
  const title = String(body.title ?? "").trim();
  const keys = Array.isArray(body.placement_keys)
    ? body.placement_keys.map((k) => String(k)).filter(Boolean)
    : [];
  if (!title || keys.length === 0)
    return NextResponse.json({ error: "title_and_placements_required" }, { status: 400 });
  try {
    const { account } = await accountFor(user);
    const valid = await pgQueryStrict<{ key: string }>(
      `SELECT code AS key FROM public.ad_placements WHERE active = true AND code = ANY($1)`,
      [keys],
    );
    if (valid.length !== keys.length)
      return NextResponse.json({ error: "unknown_placement_key" }, { status: 400 });
    const rows = await pgQueryStrict(
      `INSERT INTO public.ad_marketplace_listings
         (account_id, title, description, placement_keys, price_model, floor_price, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft')
       RETURNING id, account_id, title, description, placement_keys, price_model, floor_price, status, created_at, updated_at`,
      [
        account.id,
        title,
        body.description ? String(body.description) : null,
        keys,
        body.price_model ? String(body.price_model) : "cpm",
        body.floor_price == null ? null : Number(body.floor_price),
      ],
    );
    return NextResponse.json({ listing: rows[0] });
  } catch {
    return NextResponse.json({ error: "listing_create_unavailable" }, { status: 503 });
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
      `UPDATE public.ad_marketplace_listings SET status = $3, updated_at = now()
        WHERE id = $1 AND account_id = $2
        RETURNING id, status`,
      [id, account.id, status],
    );
    if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ listing: rows[0] });
  } catch {
    return NextResponse.json({ error: "listing_update_unavailable" }, { status: 503 });
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
      `DELETE FROM public.ad_marketplace_listings WHERE id = $1 AND account_id = $2 RETURNING id`,
      [id, account.id],
    );
    if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "listing_delete_unavailable" }, { status: 503 });
  }
}
