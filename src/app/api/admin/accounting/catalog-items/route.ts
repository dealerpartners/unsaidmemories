import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/catalog-items
//
// Catalog & Item Records (owner's catalog_item_records.html): one row
// per storefront product variant — SKU & barcode, category, on
// hand / reserved and weighted-average unit cost from
// erp_inventory_balances, retail from the variant, margin derived
// when a cost is known, and the inventory GL account code from
// commerce_accounting_mappings where a mapping exists. Below the
// item records: the canonical print items (canonical_products) with
// their supplier print-spec coverage, and a per-supplier catalog
// summary from supplier_catalog_products.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const items = await pgQuery<{
      variant_id: string; sku: string | null; gtin: string | null; variant_title: string | null;
      size: string | null; color: string | null; retail: string | null; variant_active: boolean;
      product_id: string; product_name: string; product_status: string | null;
      category_name: string | null; on_hand: string; reserved: string; unit_cost: string | null;
      gl_code: string | null;
    }>(
      `SELECT pv.id::text AS variant_id, pv.sku, pv.gtin, pv.variant_title,
              pv.size, pv.color, pv.price::text AS retail, pv.is_active AS variant_active,
              p.id::text AS product_id, p.name AS product_name, p.status AS product_status,
              cat.name AS category_name,
              COALESCE(b.on_hand, 0)::text AS on_hand, COALESCE(b.reserved, 0)::text AS reserved,
              b.unit_cost::text AS unit_cost,
              m.code AS gl_code
         FROM public.product_variants pv
         JOIN public.products p ON p.id = pv.product_id
         LEFT JOIN public.categories cat ON cat.id = p.category_id
         LEFT JOIN (
           SELECT sku_id, SUM(on_hand) AS on_hand, SUM(reserved) AS reserved,
                  SUM(on_hand * unit_cost) / NULLIF(SUM(on_hand) FILTER (WHERE unit_cost IS NOT NULL), 0) AS unit_cost
             FROM public.erp_inventory_balances WHERE tenant_id = $1 GROUP BY sku_id
         ) b ON b.sku_id = pv.id
         LEFT JOIN LATERAL (
           SELECT coa.code FROM public.commerce_accounting_mappings cam
             JOIN public.acct_chart_of_accounts coa ON coa.id = cam.inventory_account_id
            WHERE cam.catalog_item_id = p.id AND cam.tenant_id = $1 AND cam.active
            ORDER BY cam.created_at LIMIT 1
         ) m ON true
        WHERE pv.tenant_id = $1
        ORDER BY p.name ASC, pv.sku ASC NULLS LAST
        LIMIT 500`,
      [tenant],
    );
    const canonical = await pgQuery<{
      id: string; sku_slug: string; name: string; category: string | null;
      suppliers: number; placements: number;
    }>(
      `SELECT cp.id::text AS id, cp.sku_slug, cp.name, cp.category,
              COUNT(DISTINCT sps.supplier_name)::int AS suppliers,
              COUNT(sps.id)::int AS placements
         FROM public.canonical_products cp
         LEFT JOIN public.supplier_print_specs sps ON sps.canonical_product_id = cp.id
        GROUP BY cp.id
        ORDER BY cp.name ASC`,
    );
    const suppliers = await pgQuery<{ name: string; slug: string | null; products: number; variants: number }>(
      `SELECT s.name, s.slug, COUNT(p.id)::int AS products,
              COALESCE(SUM(p.variant_count), 0)::int AS variants
         FROM public.suppliers s
         LEFT JOIN public.supplier_catalog_products p ON p.supplier_id = s.id
        GROUP BY s.id
        ORDER BY products DESC`,
    );
    return NextResponse.json({
      items: items.map((r) => {
        const retail = r.retail != null ? Number(r.retail) : null;
        const unitCost = r.unit_cost != null ? Number(r.unit_cost) : null;
        return {
          variantId: r.variant_id,
          sku: r.sku,
          barcode: r.gtin,
          variantTitle: r.variant_title || [r.size, r.color].filter(Boolean).join(" / ") || null,
          productId: r.product_id,
          productName: r.product_name,
          category: r.category_name,
          onHand: Number(r.on_hand || 0),
          reserved: Number(r.reserved || 0),
          unitCost,
          retail,
          margin: retail != null && retail > 0 && unitCost != null ? (retail - unitCost) / retail : null,
          glCode: r.gl_code,
          status: r.product_status || (r.variant_active ? "active" : "inactive"),
        };
      }),
      canonical,
      suppliers,
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/catalog-items]", e);
    return NextResponse.json({ error: e?.message || "Failed to load catalog items" }, { status: 500 });
  }
}
