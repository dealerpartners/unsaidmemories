import { NextRequest, NextResponse } from "next/server";
import { adminCreate, resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/catalog-collections
//
// Product Catalog Collections (owner's product_catalog_collections.html):
// one row per collections record with member products
// (product_collections), SKU (variant) count, month-to-date GMV from
// paid storefront order_items, a margin rollup from the winning
// fulfillment-route cost of member variants, the channels member
// products are actually listed on (commerce_channel_products), and
// sync health from those listings' real sync_status values. Every
// figure is a per-collection subquery so join fan-out can never
// inflate a number.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const rows = await pgQuery<{
      id: string; name: string; slug: string; type: string | null; is_active: boolean;
      starts_on: string | null; ends_on: string | null;
      products: number; skus: number; mtd_gmv: string; margin_rollup: string | null;
      channels: string | null; listings: number; sync_bad: number; members: string | null;
    }>(
      `SELECT c.id::text AS id, c.name, c.slug, c.type, c.is_active,
              c.starts_on::text AS starts_on, c.ends_on::text AS ends_on,
              (SELECT COUNT(*)::int FROM public.product_collections pc
                WHERE pc.collection_id = c.id AND pc.tenant_id = c.tenant_id) AS products,
              (SELECT COUNT(*)::int FROM public.product_collections pc
                 JOIN public.product_variants pv ON pv.product_id = pc.product_id
                WHERE pc.collection_id = c.id) AS skus,
              (SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0)::text
                 FROM public.order_items oi
                 JOIN public.orders o ON o.id = oi.order_id AND o.status = 'paid'
                  AND o.created_at >= date_trunc('month', now())
                 JOIN public.product_variants pv ON pv.id = oi.product_variant_id
                 JOIN public.product_collections pc ON pc.product_id = pv.product_id
                WHERE pc.collection_id = c.id) AS mtd_gmv,
              (SELECT AVG((pv.price - r.cost_snapshot) / NULLIF(pv.price, 0))::text
                 FROM public.product_collections pc
                 JOIN public.product_variants pv ON pv.product_id = pc.product_id AND pv.price > 0
                 JOIN LATERAL (
                   SELECT cost_snapshot FROM public.variant_fulfillment_routes
                    WHERE product_variant_id = pv.id AND is_active AND cost_snapshot IS NOT NULL
                    ORDER BY priority LIMIT 1) r ON true
                WHERE pc.collection_id = c.id) AS margin_rollup,
              (SELECT string_agg(DISTINCT ch.name, ', ') FROM public.commerce_channel_products ccp
                 JOIN public.commerce_order_channels ch ON ch.id = ccp.channel_id
                 JOIN public.product_collections pc ON pc.product_id = ccp.catalog_item_id
                WHERE pc.collection_id = c.id) AS channels,
              (SELECT COUNT(*)::int FROM public.commerce_channel_products ccp
                 JOIN public.product_collections pc ON pc.product_id = ccp.catalog_item_id
                WHERE pc.collection_id = c.id) AS listings,
              (SELECT COUNT(*)::int FROM public.commerce_channel_products ccp
                 JOIN public.product_collections pc ON pc.product_id = ccp.catalog_item_id
                WHERE pc.collection_id = c.id AND ccp.sync_status IS NOT NULL
                  AND ccp.sync_status NOT IN ('synced','ok','in_sync')) AS sync_bad,
              (SELECT string_agg(pn.name, ' · ') FROM (
                 SELECT p.name FROM public.product_collections pc
                   JOIN public.products p ON p.id = pc.product_id
                  WHERE pc.collection_id = c.id ORDER BY p.name LIMIT 8) pn) AS members
         FROM public.collections c
        WHERE c.tenant_id = $1
        ORDER BY c.name ASC`,
      [tenant],
    );
    return NextResponse.json({
      collections: rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        engineType: r.type || "manual",
        isActive: r.is_active !== false,
        startsOn: r.starts_on,
        endsOn: r.ends_on,
        products: Number(r.products || 0),
        skuCount: Number(r.skus || 0),
        mtdGmv: Number(r.mtd_gmv || 0),
        marginRollup: r.margin_rollup != null ? Number(r.margin_rollup) : null,
        channels: r.channels,
        listings: Number(r.listings || 0),
        syncHealth: Number(r.listings || 0) === 0 ? "Not syndicated" : Number(r.sync_bad || 0) > 0 ? "Sync errors" : "In sync",
        members: r.members,
      })),
      computedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/catalog-collections]", e);
    return NextResponse.json({ error: e?.message || "Failed to load collections" }, { status: 500 });
  }
}

// POST /api/admin/accounting/catalog-collections
// { action: "refresh" } — figures are computed live from orders on
// every read; a refresh simply recomputes and reports the time.
// Any other body creates a collections record (name required).

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    if (body.action === "refresh") {
      return NextResponse.json({ ok: true, computedAt: new Date().toISOString() });
    }
    if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    const slug = String(body.name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return adminCreate("collections", {
      name: String(body.name),
      slug: slug || `collection-${Date.now().toString(36)}`,
      type: body.type ? String(body.type) : "manual",
      is_active: true,
    }, { preGated: true, tenantId: tenant, schema: "public" });
  } catch (e: any) {
    console.error("[POST /api/admin/accounting/catalog-collections]", e);
    return NextResponse.json({ error: e?.message || "Failed to save collection" }, { status: 500 });
  }
}
