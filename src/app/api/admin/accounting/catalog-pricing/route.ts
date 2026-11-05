import { NextRequest, NextResponse } from "next/server";
import { adminCreate, resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/catalog-pricing
//
// Pricing, Bundles & Units (owner's pricing_bundles_units.html):
// commercial price books (acct_price_books + lines), product bundles
// (catalog_bundles + components), and the variant cost picture the
// margin guard works from (variant price vs the winning fulfillment
// route's cost snapshot). No unit-of-measure conversion table exists
// in the catalog data — the page says so rather than inventing one.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const books = await pgQuery<{
      id: string; code: string; title: string; method: string | null; qualifying_terms: string | null;
      catalog_scope: string | null; is_active: boolean; lines: number; channels: string | null;
    }>(
      `SELECT b.id::text AS id, b.code, b.title, b.method, b.qualifying_terms,
              b.catalog_scope, b.is_active,
              COUNT(l.id)::int AS lines,
              string_agg(DISTINCT l.channel, ', ') AS channels
         FROM public.acct_price_books b
         LEFT JOIN public.acct_price_book_lines l ON l.price_book_id = b.id
        WHERE b.tenant_id = $1
        GROUP BY b.id
        ORDER BY b.code ASC`,
      [tenant],
    );
    const lines = await pgQuery<{
      id: string; price_book_id: string; sku: string | null; channel: string | null;
      base_price: string | null; override_price: string | null; product_name: string | null;
    }>(
      `SELECT l.id::text AS id, l.price_book_id::text AS price_book_id, l.sku, l.channel,
              l.base_price::text AS base_price, l.override_price::text AS override_price,
              p.name AS product_name
         FROM public.acct_price_book_lines l
         LEFT JOIN public.products p ON p.id = l.catalog_product_id
        WHERE l.tenant_id = $1
        ORDER BY l.created_at ASC`,
      [tenant],
    );
    const bundles = await pgQuery<{
      id: string; name: string; slug: string; status: string | null; description: string | null;
      components: number; component_detail: string | null;
    }>(
      `SELECT b.id::text AS id, b.name, b.slug, b.status, b.description,
              COUNT(comp.id)::int AS components,
              string_agg(concat_ws(' ', p.name, concat('×', comp.quantity)), ' · ') AS component_detail
         FROM public.catalog_bundles b
         LEFT JOIN public.catalog_bundle_components comp ON comp.bundle_id = b.id
         LEFT JOIN public.products p ON p.id = comp.catalog_item_id
        WHERE b.tenant_id = $1
        GROUP BY b.id
        ORDER BY b.name ASC`,
      [tenant],
    );
    const guard = await pgQuery<{
      variant_id: string; sku: string | null; product_name: string; price: string | null; cost: string | null;
    }>(
      `SELECT pv.id::text AS variant_id, pv.sku, p.name AS product_name,
              pv.price::text AS price, r.cost_snapshot::text AS cost
         FROM public.product_variants pv
         JOIN public.products p ON p.id = pv.product_id
         LEFT JOIN LATERAL (
           SELECT cost_snapshot FROM public.variant_fulfillment_routes
            WHERE product_variant_id = pv.id AND is_active AND cost_snapshot IS NOT NULL
            ORDER BY priority LIMIT 1) r ON true
        WHERE pv.tenant_id = $1 AND pv.price IS NOT NULL
        ORDER BY p.name ASC, pv.sku ASC NULLS LAST
        LIMIT 200`,
      [tenant],
    );
    const products = await pgQuery<{ id: string; name: string }>(
      `SELECT id::text AS id, name FROM public.products WHERE tenant_id = $1 ORDER BY name ASC LIMIT 200`,
      [tenant],
    );
    return NextResponse.json({
      books: books.map((b) => ({ ...b, lines: Number(b.lines || 0) })),
      priceLines: lines.map((l) => ({
        id: l.id, priceBookId: l.price_book_id, sku: l.sku, channel: l.channel,
        basePrice: l.base_price != null ? Number(l.base_price) : null,
        overridePrice: l.override_price != null ? Number(l.override_price) : null,
        productName: l.product_name,
      })),
      bundles: bundles.map((b) => ({ ...b, components: Number(b.components || 0) })),
      guardVariants: guard.map((g) => ({
        variantId: g.variant_id, sku: g.sku, productName: g.product_name,
        price: g.price != null ? Number(g.price) : null,
        cost: g.cost != null ? Number(g.cost) : null,
      })),
      products,
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/catalog-pricing]", e);
    return NextResponse.json({ error: e?.message || "Failed to load pricing" }, { status: 500 });
  }
}

// POST /api/admin/accounting/catalog-pricing
// { action: "create_book" | "add_line" | "create_bundle" | "add_component", ... }

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const body = await req.json().catch(() => null);
    if (!body?.action) return NextResponse.json({ error: "action is required" }, { status: 400 });

    if (body.action === "create_book") {
      if (!body.code || !body.title) return NextResponse.json({ error: "code and title are required" }, { status: 400 });
      return adminCreate("acct_price_books", {
        code: String(body.code), title: String(body.title),
        method: body.method || null, qualifying_terms: body.qualifying_terms || null,
        catalog_scope: body.catalog_scope || null, is_active: true,
      }, { preGated: true, tenantId: tenant, schema: "public" });
    }
    if (body.action === "add_line") {
      if (!body.price_book_id) return NextResponse.json({ error: "price_book_id is required" }, { status: 400 });
      return adminCreate("acct_price_book_lines", {
        price_book_id: String(body.price_book_id),
        catalog_product_id: body.catalog_product_id || null,
        sku: body.sku || null, channel: body.channel || null,
        base_price: body.base_price === "" || body.base_price == null ? null : Number(body.base_price),
        override_price: body.override_price === "" || body.override_price == null ? null : Number(body.override_price),
      }, { preGated: true, tenantId: tenant, schema: "public" });
    }
    if (body.action === "create_bundle") {
      if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });
      const slug = String(body.name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      return adminCreate("catalog_bundles", {
        name: String(body.name), slug: slug || `bundle-${Date.now().toString(36)}`,
        description: body.description || null, status: "draft",
      }, { preGated: true, tenantId: tenant, schema: "public" });
    }
    if (body.action === "add_component") {
      if (!body.bundle_id || !body.catalog_item_id) {
        return NextResponse.json({ error: "bundle_id and catalog_item_id are required" }, { status: 400 });
      }
      return adminCreate("catalog_bundle_components", {
        bundle_id: String(body.bundle_id), catalog_item_id: String(body.catalog_item_id),
        sku_id: body.sku_id || null, quantity: body.quantity ? Number(body.quantity) : 1,
      }, { preGated: true, tenantId: tenant, schema: "public" });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e: any) {
    console.error("[POST /api/admin/accounting/catalog-pricing]", e);
    return NextResponse.json({ error: e?.message || "Failed to save pricing record" }, { status: 500 });
  }
}
