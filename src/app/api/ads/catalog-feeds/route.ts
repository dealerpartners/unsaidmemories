import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { ensureDeveloperContext } from "@/lib/devportal-server";
import { ensureAdAccount } from "@/lib/ads-server";
import { MASTER_TENANT_ID } from "@/lib/site-tenant";

export const dynamic = "force-dynamic";

/**
 * /api/ads/catalog-feeds — catalog manager feeds (ad_catalog_feeds,
 * AC1/AC2). The table existed live with zero code references; every
 * catalog page was a static shell. A feed is one catalog source for
 * the ad account: 'manual' (products entered in the catalog UI),
 * 'feed_url' (a hosted product feed), or 'shopify' (a connected
 * store). Status + item_count + last_sync_at are the sync record;
 * `source` is the setup method the onboarding offers.
 */
const SOURCES = ["manual", "feed_url", "shopify"];

async function accountFor(user: Parameters<typeof ensureDeveloperContext>[0]) {
  const ctx = await ensureDeveloperContext(user);
  return ensureAdAccount(ctx.organizationId, ctx.tenantId ?? MASTER_TENANT_ID, ctx.organizationName);
}

const SELECT =
  "id, account_id, name, source, status, item_count, last_sync_at, settings, created_at, updated_at";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const account = await accountFor(user);
    const feeds = await pgQueryStrict(
      `SELECT ${SELECT} FROM public.ad_catalog_feeds
        WHERE account_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [account.id],
    );
    return NextResponse.json({ feeds });
  } catch {
    return NextResponse.json({ error: "catalog_feeds_unavailable" }, { status: 503 });
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
  const source = String(body.source ?? "manual");
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
  if (!SOURCES.includes(source))
    return NextResponse.json({ error: "invalid_source" }, { status: 400 });
  const settings = (body.settings ?? {}) as Record<string, unknown>;
  if (source === "feed_url" && !String(settings.feed_url ?? ""))
    return NextResponse.json({ error: "feed_url_required" }, { status: 400 });
  if (source === "shopify" && !String(settings.store_domain ?? ""))
    return NextResponse.json({ error: "store_domain_required" }, { status: 400 });
  try {
    const account = await accountFor(user);
    const rows = await pgQueryStrict(
      `INSERT INTO public.ad_catalog_feeds (account_id, name, source, status, settings)
       VALUES ($1, $2, $3, 'draft', $4::jsonb)
       RETURNING ${SELECT}`,
      [account.id, name, source, JSON.stringify(settings)],
    );
    return NextResponse.json({ feed: rows[0] });
  } catch {
    return NextResponse.json({ error: "catalog_feed_create_unavailable" }, { status: 503 });
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
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  const sets: string[] = [];
  const values: unknown[] = [];
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!["draft", "active", "paused", "error"].includes(status))
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    values.push(status);
    sets.push(`status = $${values.length}`);
    if (status === "active") sets.push("last_sync_at = now()");
  }
  if (body.name !== undefined) {
    values.push(String(body.name));
    sets.push(`name = $${values.length}`);
  }
  if (!sets.length) return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  try {
    const account = await accountFor(user);
    values.push(id, account.id);
    const rows = await pgQueryStrict(
      `UPDATE public.ad_catalog_feeds SET ${sets.join(", ")}, updated_at = now()
        WHERE id = $${values.length - 1} AND account_id = $${values.length}
        RETURNING ${SELECT}`,
      values,
    );
    if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ feed: rows[0] });
  } catch {
    return NextResponse.json({ error: "catalog_feed_update_unavailable" }, { status: 503 });
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  try {
    const account = await accountFor(user);
    const rows = await pgQueryStrict(
      `DELETE FROM public.ad_catalog_feeds WHERE id = $1 AND account_id = $2 RETURNING id`,
      [id, account.id],
    );
    if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "catalog_feed_delete_unavailable" }, { status: 503 });
  }
}
