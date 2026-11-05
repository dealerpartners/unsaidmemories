// ---------------------------------------------------------------------------
// kole-sync.ts — Kole Imports feed sync + order push (database side).
//
// runKoleFeedSync mirrors the enterprise upsert path the other supplier
// feeds use (erp_products → erp_product_variants → erp_product_skus →
// commerce_catalog_items → commerce_product_media), with three Kole-specific
// behaviors:
//
//   • Category mapping goes through supplier_category_mapping (the table
//     every supplier uses) keyed by the normalized subcategory group, and
//     taxonomy node ids are resolved from the mapping's category names.
//     Unmapped/unclassified items go to `quarantine`, exactly like the
//     other feeds — never silently dropped, never force-fit.
//   • Writes are select-then-insert/update against the LIVE unique
//     constraints (verified 2026-10-13: erp_product_variants has no
//     (product,name) unique and erp_product_skus' unique is (tenant,sku),
//     so PostgREST-style onConflict upserts from the older edge-function
//     copy do not apply here).
//   • Vanished SKUs: a Kole product that was active but is absent from a
//     fresh feed run is deactivated (closeouts are never restocked).
//     Scoped strictly to source 'koleimports'. A run that parses to zero
//     items REFUSES to sync — an empty/broken feed must never wipe the
//     Kole catalog.
//
// Sync-job enqueue (Stripe/Algolia triangle) is attempted per item via the
// enqueue_sync_job RPC the edge pipeline uses; that RPC is not live yet
// (the sync-jobs migration is still pending), so failures are swallowed
// and the count honestly reports 0 until it lands.
// ---------------------------------------------------------------------------

import { withPg } from "@/lib/crm/enterprise"
import { parseShipTo } from "@/lib/orders/lifecycle"
import {
  createKoleOrder,
  fetchKoleFeedXml,
  KoleApiError,
  type KoleOrderInput,
} from "./kole"
import {
  KOLE_SUPPLIER_ID,
  normalizeKoleFeed,
  parseKoleFeed,
  type KoleNormalizedProduct,
} from "./kole-feed"

type PgClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>
}

export type KoleSyncResult = {
  fetched: number
  imported: number
  updated: number
  deactivated: number
  skipped: number
  quarantined: number
  syncJobsEnqueued: number
  skipReasons: Record<string, number>
}

const SOURCE_PREFIX = `${KOLE_SUPPLIER_ID}:`

async function resolveNodeIds(c: PgClient, tenantId: string, names: string[]): Promise<string[]> {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  if (!wanted.length) return []
  const { rows } = await c.query(
    `SELECT id::text AS id FROM public.taxonomy_nodes WHERE tenant_id = $1 AND name = ANY($2::text[])`,
    [tenantId, wanted],
  )
  return rows.map((r: any) => String(r.id))
}

async function quarantine(
  c: PgClient,
  tenantId: string,
  p: { sku: string; title: string; brand: string; subcategory: string },
  reason: string,
): Promise<boolean> {
  const { rows } = await c.query(
    `SELECT id FROM public.quarantine
      WHERE tenant_id = $1 AND supplier = $2 AND source_product_id = $3 AND resolved = false
      LIMIT 1`,
    [tenantId, KOLE_SUPPLIER_ID, p.sku],
  )
  if (rows.length) return false
  await c.query(
    `INSERT INTO public.quarantine
       (tenant_id, source_product_id, title, brand, supplier, supplier_product_type, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [tenantId, p.sku, p.title, p.brand, KOLE_SUPPLIER_ID, p.subcategory, reason],
  )
  return true
}

/** Upsert one normalized product through the enterprise chain.
 *  Returns "imported" | "updated" | "collision". */
async function upsertKoleProduct(
  c: PgClient,
  tenantId: string,
  p: KoleNormalizedProduct,
  nodeIds: string[],
): Promise<{ outcome: "imported" | "updated" | "collision"; catalogItemId: string | null }> {
  const sourceProductId = `${SOURCE_PREFIX}${p.source_product_id}`
  const v = p.variants[0]
  const now = new Date().toISOString()
  const erpMeta = {
    fulfillment_type: "supplier_dropship",
    supplier_id: KOLE_SUPPLIER_ID,
    slug: p.handle,
    taxonomy_node_ids: nodeIds,
    is_professional: false,
    // Case-pack truth (Tier Pack 1 = minimum dropship quantity).
    pack_qty: p.kole.pack_qty,
    price_tiers: p.kole.tiers,
    case_pack: p.kole.case_pack,
    unit_cost: p.kole.unit_cost,
    upc: p.kole.upc || null,
    colors: p.kole.colors,
    materials: p.kole.materials,
    attributes: p.kole.attributes,
    is_closeout: p.kole.is_closeout,
    on_sale: p.kole.on_sale,
    kole_md5: p.kole.md5 || null,
    kole_category: p.kole.category,
    kole_subcategory: p.kole.subcategory,
  }

  // 1. erp_products — UNIQUE(tenant_id, source_product_id) verified live.
  // Metadata is MERGED on update, never wholesale-replaced: corrections
  // made outside this sync (e.g. taxonomy repairs that add nodes) must
  // survive a re-sync. Taxonomy is the union of existing + mapped nodes.
  const existing = await c.query(
    `SELECT id, metadata FROM public.erp_products WHERE tenant_id = $1 AND source_product_id = $2`,
    [tenantId, sourceProductId],
  )
  let erpProductId: string
  let outcome: "imported" | "updated"
  if (existing.rows.length) {
    erpProductId = String(existing.rows[0].id)
    outcome = "updated"
    const prevMeta: Record<string, unknown> =
      existing.rows[0].metadata && typeof existing.rows[0].metadata === "object" ? existing.rows[0].metadata : {}
    const mergedMeta = {
      ...prevMeta,
      ...erpMeta,
      taxonomy_node_ids: Array.from(new Set([
        ...(Array.isArray(prevMeta.taxonomy_node_ids) ? (prevMeta.taxonomy_node_ids as string[]) : []),
        ...nodeIds,
      ])),
    }
    await c.query(
      `UPDATE public.erp_products
          SET name = $3, description = $4, brand = $5, product_type = 'supplier_dropship',
              is_active = true, standard_cost = $6, default_unit_price = $7,
              metadata = $8::jsonb, updated_at = $9
        WHERE tenant_id = $1 AND id = $2`,
      [tenantId, erpProductId, p.title, p.description, p.vendor, p.kole.unit_cost, v.price, JSON.stringify(mergedMeta), now],
    )
  } else {
    const ins = await c.query(
      `INSERT INTO public.erp_products
         (tenant_id, source_product_id, product_type, name, description, brand,
          is_inventory_item, is_sellable, is_purchasable, base_uom, is_active,
          standard_cost, default_unit_price, metadata, updated_at)
       VALUES ($1, $2, 'supplier_dropship', $3, $4, $5, false, true, true, 'EA', true, $6, $7, $8::jsonb, $9)
       RETURNING id`,
      [tenantId, sourceProductId, p.title, p.description, p.vendor, p.kole.unit_cost, v.price, JSON.stringify(erpMeta), now],
    )
    erpProductId = String(ins.rows[0].id)
    outcome = "imported"
  }

  // 2. erp_product_variants — no (product,name) unique live → select-then-write.
  const variantAttrs = {
    sku: v.sku,
    price: v.price,
    compare_at_price: v.compare_at_price,
    in_stock: v.in_stock,
    stock_quantity: v.stock_quantity,
    option_size: v.option_size,
    option_color: v.option_color,
    weight_lb: v.weight,
    pack_qty: p.kole.pack_qty,
  }
  const vExisting = await c.query(
    `SELECT id FROM public.erp_product_variants WHERE tenant_id = $1 AND product_id = $2 AND name = $3`,
    [tenantId, erpProductId, v.title],
  )
  let variantId: string
  if (vExisting.rows.length) {
    variantId = String(vExisting.rows[0].id)
    await c.query(
      `UPDATE public.erp_product_variants
          SET attributes = $3::jsonb, is_active = true, updated_at = $4
        WHERE tenant_id = $1 AND id = $2`,
      [tenantId, variantId, JSON.stringify(variantAttrs), now],
    )
  } else {
    const ins = await c.query(
      `INSERT INTO public.erp_product_variants (tenant_id, product_id, name, attributes, is_active, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, true, $5) RETURNING id`,
      [tenantId, erpProductId, v.title, JSON.stringify(variantAttrs), now],
    )
    variantId = String(ins.rows[0].id)
  }

  // 3. erp_product_skus — UNIQUE(tenant_id, sku). A sku already owned by a
  //    DIFFERENT product is a collision: never hijack another product's row.
  const sExisting = await c.query(
    `SELECT id, product_id FROM public.erp_product_skus WHERE tenant_id = $1 AND sku = $2`,
    [tenantId, v.sku],
  )
  if (sExisting.rows.length && String(sExisting.rows[0].product_id) !== erpProductId) {
    return { outcome: "collision", catalogItemId: null }
  }
  let skuId: string
  if (sExisting.rows.length) {
    skuId = String(sExisting.rows[0].id)
    await c.query(
      `UPDATE public.erp_product_skus
          SET variant_id = $3, unit_price = $4, standard_cost = $5, barcode = $6,
              weight = $7, weight_uom = 'lb', is_active = $8, updated_at = $9
        WHERE tenant_id = $1 AND id = $2`,
      [tenantId, skuId, variantId, v.price, p.kole.unit_cost, p.kole.upc || null, v.weight, v.price > 0, now],
    )
  } else {
    const ins = await c.query(
      `INSERT INTO public.erp_product_skus
         (tenant_id, product_id, variant_id, sku, barcode, uom, unit_price,
          standard_cost, weight, weight_uom, is_active, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'EA', $6, $7, $8, 'lb', $9, $10) RETURNING id`,
      [tenantId, erpProductId, variantId, v.sku, p.kole.upc || null, v.price, p.kole.unit_cost, v.weight, v.price > 0, now],
    )
    skuId = String(ins.rows[0].id)
  }

  // 4. commerce_catalog_items — UNIQUE(tenant_id, sku). Brand lands on the
  //    real brand column (never metadata).
  const catMeta = {
    erp_product_id: erpProductId,
    fulfillment_type: "supplier_dropship",
    supplier_id: KOLE_SUPPLIER_ID,
    source_product_id: sourceProductId,
    slug: p.handle,
    taxonomy_node_ids: nodeIds,
    pack_qty: p.kole.pack_qty,
    price_tiers: p.kole.tiers,
    case_pack: p.kole.case_pack,
    upc: p.kole.upc || null,
    colors: p.kole.colors,
    materials: p.kole.materials,
    attributes: p.kole.attributes,
    is_closeout: p.kole.is_closeout,
  }
  const ciExisting = await c.query(
    `SELECT id, metadata FROM public.commerce_catalog_items WHERE tenant_id = $1 AND sku = $2`,
    [tenantId, v.sku],
  )
  let catalogItemId: string
  if (ciExisting.rows.length) {
    catalogItemId = String(ciExisting.rows[0].id)
    const prevCiMeta: Record<string, unknown> =
      ciExisting.rows[0].metadata && typeof ciExisting.rows[0].metadata === "object" ? ciExisting.rows[0].metadata : {}
    const mergedCatMeta = {
      ...prevCiMeta,
      ...catMeta,
      taxonomy_node_ids: Array.from(new Set([
        ...(Array.isArray(prevCiMeta.taxonomy_node_ids) ? (prevCiMeta.taxonomy_node_ids as string[]) : []),
        ...nodeIds,
      ])),
    }
    await c.query(
      `UPDATE public.commerce_catalog_items
          SET sku_id = $3, name = $4, description = $5, short_description = $6, brand = $7,
              active = $8, sellable = $8, purchasable = true, ecommerce_enabled = true,
              metadata = $9::jsonb, updated_at = $10
        WHERE tenant_id = $1 AND id = $2`,
      [
        tenantId, catalogItemId, skuId, p.title, p.description,
        (p.description || "").substring(0, 150), p.vendor, v.price > 0,
        JSON.stringify(mergedCatMeta), now,
      ],
    )
  } else {
    const ins = await c.query(
      `INSERT INTO public.commerce_catalog_items
         (tenant_id, sku_id, item_type, sku, name, description, short_description,
          brand, unit_of_measure, taxable, active, pos_enabled, ecommerce_enabled,
          purchasable, sellable, metadata, updated_at)
       VALUES ($1, $2, 'dropship', $3, $4, $5, $6, $7, 'EA', true, $8, false, true, true, $8, $9::jsonb, $10)
       RETURNING id`,
      [
        tenantId, skuId, v.sku, p.title, p.description,
        (p.description || "").substring(0, 150), p.vendor, v.price > 0,
        JSON.stringify(catMeta), now,
      ],
    )
    catalogItemId = String(ins.rows[0].id)
  }

  // 5. commerce_product_media — select-then-insert per image URL.
  for (let i = 0; i < p.images.length; i++) {
    const mExisting = await c.query(
      `SELECT id FROM public.commerce_product_media WHERE tenant_id = $1 AND catalog_item_id = $2 AND url = $3`,
      [tenantId, catalogItemId, p.images[i]],
    )
    if (!mExisting.rows.length) {
      await c.query(
        `INSERT INTO public.commerce_product_media (tenant_id, catalog_item_id, media_type, url, sort_order, is_primary)
         VALUES ($1, $2, 'image', $3, $4, $5)`,
        [tenantId, catalogItemId, p.images[i], i, i === 0],
      )
    }
  }

  return { outcome, catalogItemId }
}

export async function runKoleFeedSync(
  tenantId: string,
  opts: { xml?: string } = {},
): Promise<KoleSyncResult> {
  const xml = opts.xml ?? (await fetchKoleFeedXml())
  const items = parseKoleFeed(xml)
  if (items.length === 0) {
    // Safety: an empty/broken feed must never trigger mass deactivation.
    throw new Error("Kole feed returned 0 items — sync refused (deactivation guard)")
  }
  const { products, excluded } = normalizeKoleFeed(items)
  const result: KoleSyncResult = {
    fetched: items.length,
    imported: 0,
    updated: 0,
    deactivated: 0,
    skipped: 0,
    quarantined: 0,
    syncJobsEnqueued: 0,
    skipReasons: {},
  }
  const bump = (reason: string) => {
    result.skipped++
    result.skipReasons[reason] = (result.skipReasons[reason] || 0) + 1
  }
  for (const e of excluded) bump(e.reason)

  const done = await withPg(async (c) => {
    const seenSkus = new Set<string>()
    for (const p of products) {
      seenSkus.add(p.source_product_id)
      // Category mapping — the same table every supplier feed uses.
      const { rows: mapRows } = await c.query(
        `SELECT primary_category, categories FROM public.supplier_category_mapping
          WHERE supplier = $1 AND lookup_key = $2 LIMIT 1`,
        [KOLE_SUPPLIER_ID, p.product_type],
      )
      const mapping = mapRows[0]
      const nodeIds = mapping
        ? await resolveNodeIds(c, tenantId, [
            String(mapping.primary_category || ""),
            ...((mapping.categories as string[] | null) ?? []),
          ])
        : []
      if (!mapping || nodeIds.length === 0) {
        const inserted = await quarantine(
          c, tenantId,
          { sku: p.source_product_id, title: p.title, brand: p.vendor, subcategory: p.kole.subcategory },
          mapping ? "no_taxonomy_node" : "no_category_mapping",
        )
        if (inserted) result.quarantined++
        bump(mapping ? "no_taxonomy_node" : "no_category_mapping")
        continue
      }
      const { outcome, catalogItemId } = await upsertKoleProduct(c, tenantId, p, nodeIds)
      if (outcome === "collision") {
        bump("sku_collision")
        continue
      }
      if (outcome === "imported") result.imported++
      else result.updated++
      if (catalogItemId) {
        try {
          await c.query(`SELECT enqueue_sync_job($1::uuid, $2::uuid, 'both', 'upsert')`, [
            tenantId, catalogItemId,
          ])
          result.syncJobsEnqueued++
        } catch {
          // enqueue_sync_job is not live yet (sync-jobs migration pending) —
          // the catalog write stands; the count stays honest at 0.
        }
      }
    }

    // Deactivate Kole products that vanished from this feed run.
    const { rows: activeRows } = await c.query(
      `SELECT id, source_product_id FROM public.erp_products
        WHERE tenant_id = $1 AND source_product_id LIKE $2 AND is_active = true`,
      [tenantId, `${SOURCE_PREFIX}%`],
    )
    for (const row of activeRows) {
      const sku = String(row.source_product_id).slice(SOURCE_PREFIX.length)
      if (seenSkus.has(sku)) continue
      const now = new Date().toISOString()
      await c.query(`UPDATE public.erp_products SET is_active = false, updated_at = $3 WHERE tenant_id = $1 AND id = $2`, [tenantId, row.id, now])
      await c.query(`UPDATE public.erp_product_skus SET is_active = false, updated_at = $3 WHERE tenant_id = $1 AND product_id = $2`, [tenantId, row.id, now])
      await c.query(
        `UPDATE public.commerce_catalog_items SET active = false, sellable = false, updated_at = $3
          WHERE tenant_id = $1 AND sku_id IN (SELECT id FROM public.erp_product_skus WHERE product_id = $2)`,
        [tenantId, row.id, now],
      )
      result.deactivated++
    }
    return result
  })
  if (!done) throw new Error("Database unavailable")
  return done
}

// ---------------------------------------------------------------------------
// Order push — a paid platform order's Kole supplier-order row → Kole API.
//
// The established pipeline (Stripe webhook → createSupplierOrders) already
// creates commerce_supplier_orders rows with supplier_id 'koleimports';
// staff work them at the Supplier Orders desk. This function is the
// transmit step for those rows. HOOK POINT: call it from the desk's
// mark_ordered flow (or a future auto-transmit toggle) — it is exposed
// today via POST /api/admin/suppliers/kole/push-order. It is deliberately
// NOT auto-fired from the webhook: a human confirms before money moves,
// same as every other supplier on the desk.
// ---------------------------------------------------------------------------

export type KolePushResult = {
  supplierOrderId: string
  koleOrderRef: string
  items: { sku: string; packs: number; pieces: number; packQty: number | null }[]
  warnings: string[]
}

export async function pushKoleSupplierOrder(
  supplierOrderId: string,
  tenantId: string,
  placedBy: string,
): Promise<KolePushResult> {
  const loaded = await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT * FROM public.commerce_supplier_orders WHERE id = $1 AND tenant_id = $2`,
      [supplierOrderId, tenantId],
    )
    const row = rows[0]
    if (!row) return { error: "Supplier order not found", status: 404 } as const
    if (String(row.supplier_id) !== KOLE_SUPPLIER_ID) {
      return { error: `Supplier order belongs to '${row.supplier_id}', not Kole Imports`, status: 400 } as const
    }
    if (String(row.status) !== "to_order") {
      return { error: `Supplier order is already '${row.status}' — refusing to push twice`, status: 409 } as const
    }
    const { rows: orderRows } = await c.query(
      `SELECT id, shipping_address, customer_email, customer_id FROM public.commerce_orders
        WHERE id::text = $1 AND tenant_id = $2`,
      [String(row.order_id), tenantId],
    )
    const order = orderRows[0] || {}
    let customerName = ""
    let phone: string | undefined
    if (order.customer_id) {
      const { rows: custRows } = await c.query(`SELECT * FROM public.customers WHERE id::text = $1`, [
        String(order.customer_id),
      ]).catch(() => ({ rows: [] as any[] }))
      const cust = custRows[0]
      if (cust) {
        customerName = [cust.firstName, cust.lastName].filter(Boolean).join(" ").trim() || String(cust.name || "")
        phone = cust.phone || cust.phoneNumber || cust.mobile || undefined
      }
    }
    return { row, order, customerName, phone } as const
  })
  if (!loaded) throw new Error("Database unavailable")
  if ("error" in loaded) {
    const err = new Error(loaded.error) as Error & { status?: number }
    err.status = loaded.status
    throw err
  }
  const { row, order, customerName, phone } = loaded

  const shipTo =
    parseShipTo(order.shipping_address, customerName || "Customer") ??
    parseShipTo(row.ship_to, customerName || "Customer")
  if (!shipTo) {
    throw new Error(
      "No parseable ship-to address with a ZIP on this order — refusing to push a guessed address to Kole",
    )
  }
  const [firstName, ...rest] = shipTo.name.trim().split(/\s+/)
  const zipParts = shipTo.zip.split("-")

  // Items: platform quantities are PACKS (the variant is the pack); Kole
  // orders by PIECE at tier-pack multiples → pieces = packs × pack_qty.
  const warnings: string[] = []
  const lines: KolePushResult["items"] = []
  const rawItems: any[] = Array.isArray(row.items) ? row.items : []
  const packInfo = await withPg(async (c) => {
    const map = new Map<string, number | null>()
    for (const li of rawItems) {
      const sku = String(li?.sku || "")
      if (!sku || map.has(sku)) continue
      const { rows } = await c.query(
        `SELECT (metadata ->> 'pack_qty') AS pack_qty FROM public.commerce_catalog_items
          WHERE tenant_id = $1 AND sku = $2 LIMIT 1`,
        [tenantId, sku],
      )
      const pq = rows[0]?.pack_qty
      map.set(sku, pq != null && Number(pq) > 0 ? Number(pq) : null)
    }
    return map
  })
  const apiItems: { sku: string; quantity: number }[] = []
  for (const li of rawItems) {
    const sku = String(li?.sku || "")
    const packs = Math.max(0, Math.trunc(Number(li?.quantity) || 0))
    if (!sku || packs === 0) continue
    const packQty = packInfo?.get(sku) ?? null
    if (packQty == null) {
      warnings.push(`SKU ${sku}: no pack_qty on the catalog item — quantity sent as-is (pieces assumed)`)
    }
    const pieces = packs * (packQty ?? 1)
    lines.push({ sku, packs, pieces, packQty })
    apiItems.push({ sku, quantity: pieces })
  }
  if (!apiItems.length) throw new Error("Supplier order has no items with SKUs to push")

  const input: KoleOrderInput = {
    po_number: String(row.order_id),
    first_name: firstName || "Customer",
    last_name: rest.join(" ") || "Customer",
    address1: shipTo.street1,
    city: shipTo.city,
    state: shipTo.state,
    zipcode: zipParts[0],
    ...(zipParts[1] ? { ext_zipcode: zipParts[1] } : {}),
    ...(phone ? { phone } : {}),
    items: apiItems,
  }
  // Throws KoleNotConfiguredError before any network call when env is unset,
  // and KoleApiError on a non-2xx — no fake "ordered" state is ever written.
  const created = await createKoleOrder(input)
  const refRaw = (created as any)?.order_id ?? (created as any)?.id
  const ref = refRaw != null ? String(refRaw) : ""
  if (!ref) {
    await withPg(async (c) => {
      await c.query(
        `UPDATE public.commerce_supplier_orders
            SET notes = $2, updated_at = now() WHERE id = $1 AND tenant_id = $3`,
        [
          supplierOrderId,
          `Kole accepted a push at ${new Date().toISOString()} but returned no order id. Raw: ${JSON.stringify(created).slice(0, 400)}`,
          tenantId,
        ],
      )
    }).catch(() => {})
    throw new KoleApiError(
      502,
      "Kole accepted the order push but returned no order id — the row was NOT marked ordered; verify in the Kole portal before pushing again",
    )
  }

  await withPg(async (c) => {
    await c.query(
      `UPDATE public.commerce_supplier_orders
          SET status = 'ordered', supplier_order_ref = $2, placed_by = $3,
              placed_at = now(), updated_at = now()
        WHERE id = $1 AND tenant_id = $4`,
      [supplierOrderId, ref.slice(0, 120), placedBy, tenantId],
    )
  })
  return { supplierOrderId, koleOrderRef: ref, items: lines, warnings }
}
