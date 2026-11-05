import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// G3 · Bundle definition detail + component lines (see ../route.ts header).
// GET    -> bundle + components with per-line price/stock from real rows
// PATCH  -> { name?, description?, status? } or
//           { action: "set_component_qty", component_id, quantity }
// POST   -> { catalog_item_id, sku_id?, quantity? } add a component line
//           (sku defaults to the catalog item's own SKU bridge)
// DELETE -> ?component_id= removes a line; without it, deletes the bundle
//           (components cascade).

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

async function loadBundle(c: { query: (t: string, p?: unknown[]) => Promise<{ rows: any[] }> }, tenant: string, id: string) {
  const { rows } = await c.query(
    `SELECT ${BUNDLE_COLS}, ${ROLLUP_SQL} FROM public.catalog_bundles b ${ROLLUP_JOIN}
      WHERE b.tenant_id = $1 AND b.id = $2::uuid`,
    [tenant, id]
  );
  return rows[0] || null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireModuleApi("products_services", "read");
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const bundle = await loadBundle(c, tenant, id);
      if (!bundle) return null;
      const { rows: components } = await c.query(
        `SELECT c.id, c.catalog_item_id, c.sku_id, c.quantity, c.sort_order,
                ci.name AS item_name, ci.active AS item_active,
                s.sku AS sku_code,
                COALESCE(cp.price, s.unit_price)::float AS unit_price,
                COALESCE(stk.qty, 0)::int AS stock_on_hand,
                FLOOR(COALESCE(stk.qty, 0) / c.quantity)::int AS bundles_supported
           FROM public.catalog_bundle_components c
           JOIN public.commerce_catalog_items ci ON ci.id = c.catalog_item_id AND ci.tenant_id = c.tenant_id
           LEFT JOIN public.erp_product_skus s ON s.id = c.sku_id AND s.tenant_id = c.tenant_id
           LEFT JOIN public.commerce_prices cp ON cp.catalog_item_id = c.catalog_item_id
             AND cp.price_list_id = (SELECT id FROM public.commerce_price_lists
                                      WHERE tenant_id = c.tenant_id AND code = 'RETAIL' AND active = true LIMIT 1)
             AND (cp.valid_to IS NULL OR cp.valid_to >= now())
           LEFT JOIN LATERAL (SELECT SUM(quantity) AS qty FROM public.erp_inventory_movements
                       WHERE sku_id = c.sku_id) stk ON true
          WHERE c.tenant_id = $1 AND c.bundle_id = $2::uuid
          ORDER BY c.sort_order, ci.name`,
        [tenant, id]
      );
      return { bundle, components };
    });
    if (!out) return NextResponse.json({ error: "Bundle not found in this tenant" }, { status: 404 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: "bundle load failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireModuleApi("products_services", "write");
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const itemId = String(b.catalog_item_id || "");
  const skuId = b.sku_id ? String(b.sku_id) : null;
  const quantity = b.quantity == null || b.quantity === "" ? 1 : Number(b.quantity);
  if (!UUID_RE.test(itemId)) return NextResponse.json({ error: "catalog_item_id must be a uuid" }, { status: 400 });
  if (skuId && !UUID_RE.test(skuId)) return NextResponse.json({ error: "sku_id must be a uuid" }, { status: 400 });
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "quantity must be a positive integer" }, { status: 400 });
  }
  try {
    const out = await withPg(async (c) => {
      const bundle = await loadBundle(c, tenant, id);
      if (!bundle) return { kind: "missing" as const };
      const { rows: items } = await c.query(
        `SELECT id, sku_id FROM public.commerce_catalog_items WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, itemId]
      );
      if (items.length === 0) return { kind: "no_item" as const };
      const effectiveSku = skuId || (items[0].sku_id ? String(items[0].sku_id) : null);
      if (effectiveSku) {
        const { rows: skuRows } = await c.query(
          `SELECT id FROM public.erp_product_skus WHERE tenant_id = $1 AND id = $2::uuid`,
          [tenant, effectiveSku]
        );
        if (skuRows.length === 0) return { kind: "no_sku" as const };
      }
      const { rows } = await c.query(
        `INSERT INTO public.catalog_bundle_components
           (tenant_id, bundle_id, catalog_item_id, sku_id, quantity, sort_order)
         VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5,
                 (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM public.catalog_bundle_components
                   WHERE bundle_id = $2::uuid AND tenant_id = $1))
         RETURNING id`,
        [tenant, id, itemId, effectiveSku, quantity]
      );
      await c.query(`UPDATE public.catalog_bundles SET updated_at = now() WHERE tenant_id = $1 AND id = $2::uuid`, [tenant, id]);
      return { kind: "ok" as const, component_id: rows[0].id };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (out.kind === "missing") return NextResponse.json({ error: "Bundle not found in this tenant" }, { status: 404 });
    if (out.kind === "no_item") return NextResponse.json({ error: "Catalog item not found in this tenant" }, { status: 404 });
    if (out.kind === "no_sku") return NextResponse.json({ error: "SKU not found in this tenant" }, { status: 404 });
    return NextResponse.json({ component_id: out.component_id }, { status: 201 });
  } catch (e: any) {
    if (String(e?.code) === "23505") {
      return NextResponse.json({ error: "That catalog item is already a component of this bundle — adjust its quantity instead." }, { status: 409 });
    }
    return NextResponse.json({ error: "component add failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireModuleApi("products_services", "write");
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const bundle = await loadBundle(c, tenant, id);
      if (!bundle) return { kind: "missing" as const };
      if (String(b.action || "") === "set_component_qty") {
        const componentId = String(b.component_id || "");
        const quantity = Number(b.quantity);
        if (!UUID_RE.test(componentId)) return { kind: "bad" as const, error: "component_id must be a uuid" };
        if (!Number.isInteger(quantity) || quantity <= 0) {
          return { kind: "bad" as const, error: "quantity must be a positive integer" };
        }
        const { rows } = await c.query(
          `UPDATE public.catalog_bundle_components SET quantity = $3
            WHERE tenant_id = $1 AND bundle_id = $2::uuid AND id = $4::uuid RETURNING id`,
          [tenant, id, quantity, componentId]
        );
        if (rows.length === 0) return { kind: "bad" as const, error: "Component not found on this bundle" };
        await c.query(`UPDATE public.catalog_bundles SET updated_at = now() WHERE tenant_id = $1 AND id = $2::uuid`, [tenant, id]);
        return { kind: "ok" as const };
      }
      const status = b.status ? String(b.status).trim().toLowerCase() : null;
      if (status && !(STATUSES as readonly string[]).includes(status)) {
        return { kind: "bad" as const, error: `status must be one of: ${STATUSES.join(", ")}` };
      }
      await c.query(
        `UPDATE public.catalog_bundles
            SET name = COALESCE($3, name), description = COALESCE($4, description),
                status = COALESCE($5, status), updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, id,
         b.name ? String(b.name).trim().slice(0, 200) : null,
         b.description !== undefined && b.description !== null ? String(b.description).slice(0, 4000) : null,
         status]
      );
      return { kind: "ok" as const };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (out.kind === "missing") return NextResponse.json({ error: "Bundle not found in this tenant" }, { status: 404 });
    if (out.kind === "bad") return NextResponse.json({ error: out.error }, { status: 400 });
    return NextResponse.json({ updated: true });
  } catch (e: any) {
    return NextResponse.json({ error: "bundle update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireModuleApi("products_services", "write");
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  const tenant = resolveTenantId(req);
  const componentId = (req.nextUrl.searchParams.get("component_id") || "").trim();
  if (componentId && !UUID_RE.test(componentId)) {
    return NextResponse.json({ error: "component_id must be a uuid" }, { status: 400 });
  }
  try {
    const out = await withPg(async (c) => {
      if (componentId) {
        const { rows } = await c.query(
          `DELETE FROM public.catalog_bundle_components
            WHERE tenant_id = $1 AND bundle_id = $2::uuid AND id = $3::uuid RETURNING id`,
          [tenant, id, componentId]
        );
        if (rows.length === 0) return { kind: "missing" as const };
        await c.query(`UPDATE public.catalog_bundles SET updated_at = now() WHERE tenant_id = $1 AND id = $2::uuid`, [tenant, id]);
        return { kind: "ok" as const, removed: "component" as const };
      }
      const { rows } = await c.query(
        `DELETE FROM public.catalog_bundles WHERE tenant_id = $1 AND id = $2::uuid RETURNING id`,
        [tenant, id]
      );
      if (rows.length === 0) return { kind: "missing" as const };
      return { kind: "ok" as const, removed: "bundle" as const };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (out.kind === "missing") return NextResponse.json({ error: "Not found in this tenant" }, { status: 404 });
    return NextResponse.json({ deleted: true, removed: out.removed });
  } catch (e: any) {
    return NextResponse.json({ error: "bundle delete failed" }, { status: 500 });
  }
}
