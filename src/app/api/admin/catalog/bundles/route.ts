import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// G3 · Bundle definitions — admin definition layer ONLY (no storefront
// change; nothing here makes a bundle purchasable). Store: migration
// 20261081 — public.catalog_bundles + public.catalog_bundle_components
// (components reference commerce_catalog_items, optionally the exact
// erp_product_skus row). Rollups are computed at read from real rows:
// price = Σ quantity × RETAIL commerce_prices price (fallback SKU
// unit_price), stock = MIN over components of floor(on-hand / quantity)
// — the number of complete bundles the components can actually make.
//
// Gate: "products_services". Tenancy: tenant_id predicate everywhere.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["draft", "active", "archived"] as const;

const BUNDLE_COLS = `
  b.id, b.name, b.slug, b.description, b.status, b.created_at, b.updated_at
`;

const ROLLUP_SQL = `
  COALESCE(comp.component_count, 0)::int AS component_count,
  COALESCE(comp.price_rollup, 0)::float AS price_rollup,
  comp.stock_rollup::int AS stock_rollup
`;

const ROLLUP_JOIN = `
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS component_count,
           SUM(c.quantity * COALESCE(cp.price, s.unit_price, 0)) AS price_rollup,
           MIN(FLOOR(COALESCE(stk.qty, 0) / c.quantity)) AS stock_rollup
      FROM public.catalog_bundle_components c
      LEFT JOIN public.erp_product_skus s ON s.id = c.sku_id AND s.tenant_id = c.tenant_id
      LEFT JOIN public.commerce_prices cp ON cp.catalog_item_id = c.catalog_item_id
        AND cp.price_list_id = (SELECT id FROM public.commerce_price_lists
                                 WHERE tenant_id = c.tenant_id AND code = 'RETAIL' AND active = true LIMIT 1)
        AND (cp.valid_to IS NULL OR cp.valid_to >= now())
      LEFT JOIN LATERAL (SELECT SUM(quantity) AS qty FROM public.erp_inventory_movements
                  WHERE sku_id = c.sku_id) stk ON true
     WHERE c.bundle_id = b.id AND c.tenant_id = b.tenant_id
  ) comp ON true
`;

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}

// GET /api/admin/catalog/bundles?item_id= — list with read-computed rollups.
// item_id filters to bundles containing that catalog item (the product
// admin view's resolution path).
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("products_services", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const itemId = (req.nextUrl.searchParams.get("item_id") || "").trim();
  if (itemId && !UUID_RE.test(itemId)) {
    return NextResponse.json({ error: "item_id must be a uuid" }, { status: 400 });
  }
  try {
    const out = await withPg(async (c) => {
      const params: unknown[] = [tenant];
      let where = `b.tenant_id = $1`;
      if (itemId) {
        params.push(itemId);
        where += ` AND EXISTS (SELECT 1 FROM public.catalog_bundle_components c
                                 WHERE c.bundle_id = b.id AND c.tenant_id = b.tenant_id
                                   AND c.catalog_item_id = $2::uuid)`;
      }
      const { rows } = await c.query(
        `SELECT ${BUNDLE_COLS}, ${ROLLUP_SQL}
           FROM public.catalog_bundles b ${ROLLUP_JOIN}
          WHERE ${where}
          ORDER BY b.updated_at DESC LIMIT 200`,
        params
      );
      return { bundles: rows };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    if (String(e?.message || "").includes("catalog_bundles")) {
      return NextResponse.json(
        { error: "Bundle store not set up yet — apply migration 20261085.", bundles: [] },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "bundles list failed" }, { status: 500 });
  }
}

// POST { name, description?, status? } — create a bundle definition.
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("products_services", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const name = String(b.name || "").trim().slice(0, 200);
  const status = b.status ? String(b.status).trim().toLowerCase() : "draft";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${STATUSES.join(", ")}` }, { status: 400 });
  }
  const slug = slugify(String(b.slug || name));
  if (!slug) return NextResponse.json({ error: "name must produce a slug" }, { status: 400 });
  const actorId = await getActorIdFromRequest(req);
  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO public.catalog_bundles (tenant_id, name, slug, description, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6::uuid) RETURNING id`,
        [tenant, name, slug, b.description ? String(b.description).slice(0, 4000) : null, status,
         actorId && UUID_RE.test(actorId) ? actorId : null]
      );
      const { rows: full } = await c.query(
        `SELECT ${BUNDLE_COLS}, ${ROLLUP_SQL} FROM public.catalog_bundles b ${ROLLUP_JOIN}
          WHERE b.tenant_id = $1 AND b.id = $2::uuid`,
        [tenant, rows[0].id]
      );
      return { bundle: full[0] };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out, { status: 201 });
  } catch (e: any) {
    if (String(e?.code) === "23505") {
      return NextResponse.json({ error: "A bundle with this slug already exists in this tenant." }, { status: 409 });
    }
    return NextResponse.json({ error: "bundle create failed" }, { status: 500 });
  }
}
