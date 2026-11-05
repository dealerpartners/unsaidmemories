import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"

export const dynamic = "force-dynamic"

const PAGE = 50

// In-store = stocked on our shelves. Stock truth is the movement ledger
// (erp_inventory_movements): quantities are stored positive and direction
// lives in movement_type — reads subtract the outbound types
// ('sale','damage','scrap','ship'). erp_inventory_balances has NO live
// writer and zero rows for the master tenant; the old GET read on_hand
// from it, so every stocked product showed 0 forever.
// Dropship = the supplier ships it; we hold no stock.
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("inventory", "read")
  if (denied) return denied
  const sp = req.nextUrl.searchParams
  const tabParam = sp.get("tab") || "instore"
  const tab =
    tabParam === "dropship" || tabParam === "marketplace" || tabParam === "partners"
      ? tabParam
      : "instore"
  const q = (sp.get("q") || "").trim()
  const page = Math.max(0, Number(sp.get("page") || 0) || 0)
  const tenant = resolveTenantId(req)
  const warehouseParam = (sp.get("warehouse_id") || "").trim()

  const out = await withPg(async (c) => {
    // "In store" membership: flagged in_store (the Stock-in-store action)
    // OR stocked in fact — the product has movement-ledger history. The
    // opening stock load wrote 'opening' movements for the 1,526 shelf
    // products without setting the metadata flag, so a flag-only filter
    // showed an empty store while the ledger held the real stock.
    const counts = (
      await c.query(
        `SELECT
           count(*) FILTER (WHERE p.metadata->>'fulfillment_type' = 'in_store'
                              OR p.id IN (SELECT s.product_id FROM public.erp_product_skus s
                                           JOIN public.erp_inventory_movements m
                                             ON m.sku_id = s.id AND m.tenant_id = s.tenant_id
                                          WHERE s.tenant_id = $1))::int AS instore,
           count(*) FILTER (WHERE p.metadata->>'fulfillment_type' = 'supplier_dropship' AND p.is_active)::int AS dropship,
           (SELECT count(*)::int FROM public.seller_listings l WHERE l.tenant_id = $1) AS marketplace
         FROM public.erp_products p WHERE p.tenant_id = $1`,
        [tenant],
      )
    ).rows[0]
    const like = `%${q.replace(/[%_]/g, "")}%`

    if (tab === "marketplace") {
      // §2.4 directive (iv)+(v): the marketplace feed lands in this same
      // monitored place — every seller listing, searchable by seller /
      // SKU / product name, with seller + status filters. Decisions
      // (approve / reject / suppress / unsuppress) are written by the
      // ONE listings writer (/api/admin/listings) and trust-center cases
      // by the ONE investigations writer; this surface monitors and
      // acts through those same writers, never a parallel store.
      const sellerFilter = (sp.get("seller") || "").trim()
      const statusFilter = (sp.get("status") || "").trim()
      const { rows } = await c.query(
        `SELECT l.id::text AS id, l.seller_id::text AS seller_id,
                s.display_name AS seller_name,
                l.product_id::text AS product_id, ci.name AS product_name,
                l.sku, l.title, l.description, l.brand,
                l.price::float AS price, l.stock,
                l.status, l.suppression_reason,
                l.health_score::float AS health_score,
                l.category_id::text AS category_id,
                (SELECT count(*)::int FROM public.seller_listing_media m
                  WHERE m.listing_id = l.id AND m.tenant_id = l.tenant_id) AS media_count,
                (SELECT m.url FROM public.seller_listing_media m
                  WHERE m.listing_id = l.id AND m.tenant_id = l.tenant_id
                  ORDER BY m.is_primary DESC, m.sort_order ASC NULLS LAST LIMIT 1) AS image,
                l.created_at::text AS created_at, l.updated_at::text AS updated_at
           FROM public.seller_listings l
           JOIN public.sellers s ON s.id = l.seller_id AND s.tenant_id = l.tenant_id
           LEFT JOIN public.commerce_catalog_items ci
             ON ci.id = l.product_id AND ci.tenant_id = l.tenant_id
          WHERE l.tenant_id = $1
            AND ($2 = '%%' OR l.title ILIKE $2 OR l.sku ILIKE $2
                 OR s.display_name ILIKE $2 OR ci.name ILIKE $2)
            AND ($3 = '' OR l.seller_id::text = $3 OR s.display_name ILIKE '%' || $3 || '%')
            AND ($4 = '' OR l.status = $4)
          ORDER BY CASE WHEN l.status = 'pending_review' THEN 0
                        WHEN l.status = 'draft' THEN 1 ELSE 2 END,
                   l.created_at DESC
          LIMIT ${PAGE} OFFSET ${page * PAGE}`,
        [tenant, like, sellerFilter, statusFilter],
      )
      const total = (
        await c.query(
          `SELECT count(*)::int AS n
             FROM public.seller_listings l
             JOIN public.sellers s ON s.id = l.seller_id AND s.tenant_id = l.tenant_id
             LEFT JOIN public.commerce_catalog_items ci
               ON ci.id = l.product_id AND ci.tenant_id = l.tenant_id
            WHERE l.tenant_id = $1
              AND ($2 = '%%' OR l.title ILIKE $2 OR l.sku ILIKE $2
                   OR s.display_name ILIKE $2 OR ci.name ILIKE $2)
              AND ($3 = '' OR l.seller_id::text = $3 OR s.display_name ILIKE '%' || $3 || '%')
              AND ($4 = '' OR l.status = $4)`,
          [tenant, like, sellerFilter, statusFilter],
        )
      ).rows[0]?.n ?? rows.length
      const byStatusRes = await c.query(
        `SELECT status, count(*)::int AS n FROM public.seller_listings
          WHERE tenant_id = $1 GROUP BY status`,
        [tenant],
      )
      const byStatus: Record<string, number> = {}
      for (const r of byStatusRes.rows as { status: string; n: number }[]) {
        byStatus[String(r.status)] = Number(r.n)
      }
      const suppressed = (
        await c.query(
          `SELECT count(*)::int AS n FROM public.seller_listings
            WHERE tenant_id = $1 AND COALESCE(suppression_reason, '') <> ''`,
          [tenant],
        )
      ).rows[0]?.n ?? 0
      return { counts, rows, total, byStatus, suppressedCount: Number(suppressed) }
    }

    if (tab === "partners") {
      // §2.4 directive (vii): the partner directory behind the
      // quick-action modal — one search per partner type over that
      // type's own store (sellers / grooming applications / the
      // pharmacy partner record / vet applications). Read-only here;
      // the modal's actions write through each type's own admin API.
      const partnerType = (sp.get("type") || "seller").trim()
      const typeQueries: Record<string, string> = {
        seller: `SELECT id::text AS id, display_name AS name, status,
                        'seller' AS partner_type, NULL::text AS sub
                   FROM public.sellers
                  WHERE tenant_id = $1 AND ($2 = '%%' OR display_name ILIKE $2)
                  ORDER BY display_name LIMIT 50`,
        groomer: `SELECT id::text AS id, business_name AS name, status,
                         'groomer' AS partner_type, partner_type AS sub
                    FROM public.grooming_partner_applications
                   WHERE tenant_id = $1 AND status <> 'draft'
                     AND ($2 = '%%' OR business_name ILIKE $2)
                   ORDER BY created_at DESC LIMIT 50`,
        pharmacy: `SELECT id::text AS id, pharmacy_name AS name, status,
                          'pharmacy' AS partner_type, license_state AS sub
                     FROM clinical.pharmacy_profiles
                    WHERE tenant_id = $1 AND ($2 = '%%' OR pharmacy_name ILIKE $2)
                    ORDER BY pharmacy_name LIMIT 50`,
        vet: `SELECT id::text AS id, practice_name AS name, status,
                     'vet' AS partner_type, partner_type AS sub
                FROM clinical.vet_partner_applications
               WHERE tenant_id = $1 AND ($2 = '%%' OR practice_name ILIKE $2)
               ORDER BY created_at DESC LIMIT 50`,
      }
      const sql = typeQueries[partnerType] ?? typeQueries.seller
      const { rows } = await c.query(sql, [tenant, like])
      return { counts, partners: rows, partnerType, total: rows.length }
    }

    if (tab === "instore") {
      // Per-location stock (20261021): quantities derive from
      // erp_stock_levels (the movement-ledger view) scoped to ONE
      // warehouse — the caller's warehouse_id, defaulting to the
      // tenant's MAIN. Every movement resolves to MAIN today, so the
      // default numbers match the old global derivation exactly.
      const whRow = (
        await c.query(
          `SELECT id FROM public.erp_warehouses
            WHERE tenant_id = $1 AND is_active AND ($2 = '' OR id::text = $2)
            ORDER BY (code = 'MAIN') DESC, created_at LIMIT 1`,
          [tenant, warehouseParam],
        )
      ).rows[0]
      const whId = whRow?.id ?? null
      const { rows } = await c.query(
        `SELECT p.id AS product_id, s.id AS sku_id, s.sku, p.name, p.brand, s.unit_price::float AS unit_price,
                COALESCE(mv.on_hand, 0)::float AS on_hand,
                COALESCE(mv.reserved, 0)::float AS reserved,
                p.reorder_point::float AS reorder_point,
                p.metadata->>'supplier_product_type' AS type,
                mv.bin_locations AS bin_locations,
                cat.catalog_item_id, cat.slug, cat.image, cat.media, cat.published, cat.seller_id, cat.seller_name
           FROM public.erp_products p
           JOIN public.erp_product_skus s ON s.product_id = p.id AND s.tenant_id = p.tenant_id
           LEFT JOIN LATERAL (
             SELECT SUM(sl.on_hand) AS on_hand, SUM(sl.reserved) AS reserved,
                    string_agg(DISTINCT loc.code, ', ' ORDER BY loc.code)
                      FILTER (WHERE sl.on_hand <> 0) AS bin_locations
               FROM public.erp_stock_levels sl
               LEFT JOIN public.erp_warehouse_locations loc
                 ON loc.id = sl.location_id AND loc.tenant_id = sl.tenant_id
              WHERE sl.sku_id = s.id AND sl.tenant_id = s.tenant_id
                AND sl.warehouse_id = $3::uuid
           ) mv ON true
           LEFT JOIN LATERAL (
             SELECT ci.id AS catalog_item_id, ci.ecommerce_enabled AS published,
                    ci.metadata->>'slug' AS slug,
                    ci.metadata->>'seller_id' AS seller_id,
                    (SELECT s2.display_name FROM public.sellers s2
                      WHERE s2.id::text = ci.metadata->>'seller_id') AS seller_name,
                    (SELECT m.url FROM public.commerce_product_media m
                      WHERE m.catalog_item_id = ci.id
                      ORDER BY m.is_primary DESC, m.sort_order ASC NULLS LAST LIMIT 1) AS image,
                    COALESCE(jsonb_agg(jsonb_build_object(
                      'id', m.id, 'url', m.url, 'altText', m.alt_text,
                      'sortOrder', m.sort_order, 'isPrimary', m.is_primary)
                      ORDER BY m.is_primary DESC, m.sort_order ASC NULLS LAST)
                      FILTER (WHERE m.id IS NOT NULL), '[]'::jsonb) AS media
               FROM public.commerce_catalog_items ci
               LEFT JOIN public.commerce_product_media m ON m.catalog_item_id = ci.id
              WHERE ci.sku_id = s.id AND ci.tenant_id = s.tenant_id
              GROUP BY ci.id
              LIMIT 1
           ) cat ON true
          WHERE p.tenant_id = $1
            AND (p.metadata->>'fulfillment_type' = 'in_store' OR mv.on_hand IS NOT NULL)
            AND ($2 = '%%' OR p.name ILIKE $2 OR s.sku ILIKE $2 OR p.brand ILIKE $2
              OR EXISTS (SELECT 1 FROM public.commerce_catalog_items ci2
                           JOIN public.sellers sel ON sel.id::text = ci2.metadata->>'seller_id'
                          WHERE ci2.sku_id = s.id AND ci2.tenant_id = p.tenant_id
                            AND sel.display_name ILIKE $2))
          ORDER BY p.name LIMIT ${PAGE} OFFSET ${page * PAGE}`,
        [tenant, like, whId],
      )
      const total = (
        await c.query(
          `SELECT count(*)::int AS n
             FROM public.erp_products p
             JOIN public.erp_product_skus s ON s.product_id = p.id AND s.tenant_id = p.tenant_id
             LEFT JOIN LATERAL (
               SELECT SUM(sl.on_hand) AS on_hand
                 FROM public.erp_stock_levels sl
                WHERE sl.sku_id = s.id AND sl.tenant_id = s.tenant_id AND sl.warehouse_id = $3::uuid
             ) mv ON true
            WHERE p.tenant_id = $1
              AND (p.metadata->>'fulfillment_type' = 'in_store' OR mv.on_hand IS NOT NULL)
              AND ($2 = '%%' OR p.name ILIKE $2 OR s.sku ILIKE $2 OR p.brand ILIKE $2
              OR EXISTS (SELECT 1 FROM public.commerce_catalog_items ci2
                           JOIN public.sellers sel ON sel.id::text = ci2.metadata->>'seller_id'
                          WHERE ci2.sku_id = s.id AND ci2.tenant_id = p.tenant_id
                            AND sel.display_name ILIKE $2))`,
          [tenant, like, whId],
        )
      ).rows[0]?.n ?? rows.length
      // Bin locations are real erp_warehouse_locations codes now
      // (the bins holding nonzero stock for that SKU at this warehouse). per-location/bin stock
      // does not exist in the movements model (single MAIN warehouse), so
      // the column reads null and the UI shows '—' until the per-location
      // stock build lands (Sunny's decision, flagged in B.2.4).
      return { counts, rows, warehouseId: whId, total }
    }

    const { rows } = await c.query(
      `SELECT p.id AS product_id, s.id AS sku_id, s.sku, p.name, p.brand, s.unit_price::float AS unit_price,
              s.standard_cost::float AS cost, 'Supplier direct' AS supplier, p.metadata->>'supplier_product_type' AS type,
              cat.catalog_item_id, cat.slug, cat.image, cat.media, cat.published, cat.seller_id, cat.seller_name
         FROM public.erp_products p
         JOIN public.erp_product_skus s ON s.product_id = p.id AND s.tenant_id = p.tenant_id
         LEFT JOIN LATERAL (
           SELECT ci.id AS catalog_item_id, ci.ecommerce_enabled AS published,
                  ci.metadata->>'slug' AS slug,
                    ci.metadata->>'seller_id' AS seller_id,
                    (SELECT s2.display_name FROM public.sellers s2
                      WHERE s2.id::text = ci.metadata->>'seller_id') AS seller_name,
                  (SELECT m.url FROM public.commerce_product_media m
                    WHERE m.catalog_item_id = ci.id
                    ORDER BY m.is_primary DESC, m.sort_order ASC NULLS LAST LIMIT 1) AS image,
                  COALESCE(jsonb_agg(jsonb_build_object(
                    'id', m.id, 'url', m.url, 'altText', m.alt_text,
                    'sortOrder', m.sort_order, 'isPrimary', m.is_primary)
                    ORDER BY m.is_primary DESC, m.sort_order ASC NULLS LAST)
                    FILTER (WHERE m.id IS NOT NULL), '[]'::jsonb) AS media
             FROM public.commerce_catalog_items ci
             LEFT JOIN public.commerce_product_media m ON m.catalog_item_id = ci.id
            WHERE ci.sku_id = s.id AND ci.tenant_id = s.tenant_id
            GROUP BY ci.id
            LIMIT 1
         ) cat ON true
        WHERE p.tenant_id = $1 AND p.metadata->>'fulfillment_type' = 'supplier_dropship' AND p.is_active
          AND ($2 = '%%' OR p.name ILIKE $2 OR s.sku ILIKE $2 OR p.brand ILIKE $2
              OR EXISTS (SELECT 1 FROM public.commerce_catalog_items ci2
                           JOIN public.sellers sel ON sel.id::text = ci2.metadata->>'seller_id'
                          WHERE ci2.sku_id = s.id AND ci2.tenant_id = p.tenant_id
                            AND sel.display_name ILIKE $2))
        ORDER BY p.name LIMIT ${PAGE} OFFSET ${page * PAGE}`,
      [tenant, like],
    )
    const dropshipTotal = (
      await c.query(
        `SELECT count(*)::int AS n
           FROM public.erp_products p
           JOIN public.erp_product_skus s ON s.product_id = p.id AND s.tenant_id = p.tenant_id
          WHERE p.tenant_id = $1 AND p.metadata->>'fulfillment_type' = 'supplier_dropship' AND p.is_active
            AND ($2 = '%%' OR p.name ILIKE $2 OR s.sku ILIKE $2 OR p.brand ILIKE $2
              OR EXISTS (SELECT 1 FROM public.commerce_catalog_items ci2
                           JOIN public.sellers sel ON sel.id::text = ci2.metadata->>'seller_id'
                          WHERE ci2.sku_id = s.id AND ci2.tenant_id = p.tenant_id
                            AND sel.display_name ILIKE $2))`,
        [tenant, like],
      )
    ).rows[0]?.n ?? rows.length
    return { counts, rows, total: dropshipTotal }
  })
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  return NextResponse.json({ tab, page, pageSize: PAGE, ...out })
}

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("inventory", "write")
  if (denied) return denied
  const b = await req.json().catch(() => ({}))
  const tenant = resolveTenantId(req)
  const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null)

  const result = await withPg(async (c) => {
    if (b.action === "publish" || b.action === "unpublish") {
      // §2.4 directive (i): this surface is the publish place. Publishing
      // writes the SAME store the shop reads — commerce_catalog_items,
      // gated on active + ecommerce_enabled (+ sellable/purchasable),
      // in the exact shape the enterprise catalog writer inserts
      // (lib/enterprise/catalog.ts). A first publish also lands the
      // RETAIL price row at the SKU's unit price, as that writer does;
      // unpublishing withdraws the ecommerce flag only — the item, its
      // POS life, and its review state are untouched.
      const sku = (await c.query(
        `SELECT s.id, s.sku, s.unit_price::float AS unit_price,
                s.standard_cost::float AS standard_cost,
                p.id AS product_id, p.name, p.description, p.brand,
                p.metadata->>'slug' AS slug
           FROM public.erp_product_skus s
           JOIN public.erp_products p ON p.id = s.product_id AND p.tenant_id = s.tenant_id
          WHERE s.tenant_id = $1 AND s.id = $2`,
        [tenant, b.skuId],
      )).rows[0]
      if (!sku) return { error: "SKU not found" }
      const existing = (await c.query(
        `SELECT id FROM public.commerce_catalog_items
          WHERE tenant_id = $1 AND sku_id = $2 LIMIT 1`,
        [tenant, sku.id],
      )).rows[0]
      if (b.action === "unpublish") {
        if (!existing) return { error: "Product is not published to ecommerce" }
        await c.query(
          `UPDATE public.commerce_catalog_items SET ecommerce_enabled = false
            WHERE tenant_id = $1 AND id = $2`,
          [tenant, existing.id],
        )
        return { ok: true, catalogItemId: existing.id, published: false }
      }
      if (existing) {
        await c.query(
          `UPDATE public.commerce_catalog_items
              SET ecommerce_enabled = true, active = true,
                  sellable = true, purchasable = true
            WHERE tenant_id = $1 AND id = $2`,
          [tenant, existing.id],
        )
        return { ok: true, catalogItemId: existing.id, published: true }
      }
      const slug =
        sku.slug ||
        `${String(sku.name || "product").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-${String(sku.sku || "").toLowerCase()}`
      const created = (await c.query(
        `INSERT INTO public.commerce_catalog_items
           (tenant_id, sku_id, item_type, sku, name, description, short_description,
            brand, unit_of_measure, taxable, tax_code_id, active, ecommerce_enabled,
            pos_enabled, purchasable, sellable, metadata)
         VALUES ($1, $2, 'product', $3, $4, $5, NULL,
                 $6, 'each', true, NULL, true, true,
                 false, true, true, $7)
         RETURNING id`,
        [
          tenant, sku.id, sku.sku, sku.name, sku.description, sku.brand,
          JSON.stringify({ slug, product_id: sku.product_id, erp_product_id: sku.product_id, sort_order: 99 }),
        ],
      )).rows[0]
      const priceList = (await c.query(
        `SELECT id FROM public.commerce_price_lists
          WHERE tenant_id = $1 AND code = 'RETAIL' AND active = true LIMIT 1`,
        [tenant],
      )).rows[0]
      if (priceList) {
        await c.query(
          `INSERT INTO public.commerce_prices
             (tenant_id, price_list_id, catalog_item_id, price, compare_at_price, cost_price, valid_from, valid_to, shipping_cost)
           VALUES ($1, $2, $3, $4, NULL, $5, now(), NULL, 0)`,
          [tenant, priceList.id, created.id, sku.unit_price, sku.standard_cost],
        )
      }
      return { ok: true, catalogItemId: created.id, published: true }
    }
    if (b.action === "add_in_store") {
      const r = await c.query(
        `UPDATE public.erp_products SET metadata = jsonb_set(metadata, '{fulfillment_type}', '"in_store"'), updated_at = now()
          WHERE tenant_id = $1 AND id = $2 RETURNING id`,
        [tenant, b.productId],
      )
      return r.rowCount ? { ok: true } : { error: "Product not found" }
    }
    if (b.action === "make_dropship") {
      const r = await c.query(
        `UPDATE public.erp_products SET metadata = jsonb_set(metadata, '{fulfillment_type}', '"supplier_dropship"'), updated_at = now()
          WHERE tenant_id = $1 AND id = $2 AND metadata ? 'supplier_id' RETURNING id`,
        [tenant, b.productId],
      )
      return r.rowCount ? { ok: true } : { error: "Only supplier products can return to dropship" }
    }
    if (b.action === "set_stock") {
      // Set stock = a count correction against the movement ledger (the
      // ONLY stock system: POS, catalog, and exports all derive from it).
      // The old body upserted erp_inventory_balances — a table nothing
      // else reads — so the edit appeared to save and changed nothing
      // anywhere stock is actually shown. Now: compute the derived
      // on-hand, write ONE movement for the delta (positive delta as
      // 'count_adjustment'; negative delta as a positive-quantity removal
      // under 'sale', the adjustInventory convention — movements.quantity
      // has CHECK > 0 and direction lives in movement_type).
      const onHand = num(b.onHand)
      const reorder = b.reorderPoint === undefined ? undefined : num(b.reorderPoint)
      if (onHand === null || reorder === null) return { error: "Quantities must be 0 or more" }
      const sku = (await c.query(`SELECT id, product_id FROM public.erp_product_skus WHERE tenant_id = $1 AND id = $2`, [tenant, b.skuId])).rows[0]
      if (!sku) return { error: "SKU not found" }
      const wh = (await c.query(
        `SELECT id FROM public.erp_warehouses
          WHERE tenant_id = $1 AND is_active AND ($2::text IS NULL OR id::text = $2)
          ORDER BY (code = 'MAIN') DESC, created_at LIMIT 1`,
        [tenant, b.warehouseId ? String(b.warehouseId) : null],
      )).rows[0]
      if (!wh) return { error: "No active warehouse for this tenant" }
      const whBin = (await c.query(
        `SELECT id FROM public.erp_warehouse_locations
          WHERE tenant_id = $1 AND warehouse_id = $2 AND code = 'DEFAULT' AND is_active LIMIT 1`,
        [tenant, wh.id],
      )).rows[0]
      await c.query("BEGIN")
      try {
        const cur = (await c.query(
          `SELECT COALESCE(SUM(on_hand), 0)::float AS qty
             FROM public.erp_stock_levels
            WHERE tenant_id = $1 AND sku_id = $2 AND warehouse_id = $3`,
          [tenant, sku.id, wh.id],
        )).rows[0]
        const delta = Math.round((onHand - Number(cur?.qty || 0)) * 1000) / 1000
        if (delta !== 0) {
          const removal = delta < 0
          await c.query(
            `INSERT INTO public.erp_inventory_movements
               (tenant_id, movement_type, sku_id, warehouse_id, from_location_id, to_location_id, quantity, unit_cost, source_type, reason, occurred_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'admin', $8, now())`,
            [
              tenant,
              removal ? "sale" : "count_adjustment",
              sku.id, wh.id,
              removal ? (whBin?.id ?? null) : null,
              removal ? null : (whBin?.id ?? null),
              Math.abs(delta),
              removal
                ? "Stock count correction (set_stock): negative count_adjustment recorded as a sale-type removal — quantity is always positive, direction lives in movement_type"
                : "Stock count correction (set_stock)",
            ],
          )
        }
        await c.query(
          `SELECT public.erp_rebuild_stock_balances($1::uuid, $2::uuid, $3::uuid)`,
          [tenant, sku.id, wh.id],
        )
        if (reorder !== undefined) {
          await c.query(`UPDATE public.erp_products SET reorder_point = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2`, [tenant, sku.product_id, reorder])
        }
        await c.query("COMMIT")
      } catch (e) {
        await c.query("ROLLBACK")
        throw e
      }
      return { ok: true }
    }
    return { error: "Unknown action" }
  })
  if (!result) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  return NextResponse.json(result, { status: "error" in result ? 400 : 200 })
}
