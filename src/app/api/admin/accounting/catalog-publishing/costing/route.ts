import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";
import { resolveCanonicalSlug } from "@/lib/fabric/product-stage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/catalog-publishing/costing
//
// BOM Cost Rollup — the read side. No bill of materials exists in
// this data (no materials table anywhere): a print-on-demand
// design's "materials" are the supplier's blank + print, costed by
// the supplier. What this endpoint rolls up, per design, is the
// supplier cost stack of record:
//   - supplierCost — AVG(supplier_catalog_variants.price_snapshot)
//     for the supplier catalog product the design was built on: the
//     EXACT subquery and margin formula the catalog-publishing feed
//     and publications table already use. No second margin formula.
//   - captured — the per-variant base costs harvested into
//     supplier_product_costs for the design's blank + supplier,
//     resolved through the studio's own canonical-product path
//     (resolveCanonicalSlug, the same one the New Design wizard's
//     supplier options use). Null when nothing has been captured —
//     a cost is never derived or guessed.
// Read-only: no writes.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);

    const rows = await pgQuery<{
      id: string; name: string | null; status: string | null;
      retail_price: string | null; external_id: string | null;
      supplier_slug: string | null; supplier_name: string | null;
      catalog_name: string | null; supplier_cost: string | null;
      snapshot_count: number; snapshot_min: string | null; snapshot_max: string | null;
    }>(
      `SELECT d.id::text AS id,
              COALESCE(d.product_title, d.name) AS name,
              d.status, d.retail_price::text AS retail_price,
              scp.external_id,
              s.slug AS supplier_slug, s.name AS supplier_name,
              scp.name AS catalog_name,
              (SELECT AVG(price_snapshot)::text FROM public.supplier_catalog_variants
                WHERE supplier_catalog_product_id = scp.id AND price_snapshot IS NOT NULL) AS supplier_cost,
              (SELECT COUNT(*)::int FROM public.supplier_catalog_variants
                WHERE supplier_catalog_product_id = scp.id AND price_snapshot IS NOT NULL) AS snapshot_count,
              (SELECT MIN(price_snapshot)::text FROM public.supplier_catalog_variants
                WHERE supplier_catalog_product_id = scp.id AND price_snapshot IS NOT NULL) AS snapshot_min,
              (SELECT MAX(price_snapshot)::text FROM public.supplier_catalog_variants
                WHERE supplier_catalog_product_id = scp.id AND price_snapshot IS NOT NULL) AS snapshot_max
         FROM public.designs d
         LEFT JOIN public.supplier_catalog_products scp ON scp.id = d.supplier_catalog_product_id
         LEFT JOIN public.suppliers s ON s.id = scp.supplier_id
        WHERE d.tenant_id = $1 AND COALESCE(d.status, 'draft') <> 'archived'
        ORDER BY d.updated_at DESC NULLS LAST
        LIMIT 500`,
      [tenant],
    );

    // Captured per-variant base costs (supplier_product_costs),
    // resolved per design through the studio's canonical path and
    // aggregated in one batched query.
    type Captured = {
      minBaseCost: number; avgBaseCost: number; variantCount: number;
      anyInStock: boolean; lastCheckedAt: string | null;
    };
    const canonicalByDesign = new Map<string, string>();
    const pairs = new Map<string, { canonicalSlug: string; supplierName: string }>();
    for (const r of rows) {
      if (!r.supplier_slug || !r.external_id) continue;
      const slug = await resolveCanonicalSlug(r.supplier_slug, r.external_id);
      if (!slug) continue;
      canonicalByDesign.set(r.id, slug);
      pairs.set(`${slug}::${r.supplier_slug.toLowerCase()}`, {
        canonicalSlug: slug,
        supplierName: r.supplier_slug.toLowerCase(),
      });
    }
    const capturedByPair = new Map<string, Captured>();
    if (pairs.size > 0) {
      const pairList = [...pairs.values()];
      const capRows = await pgQuery<{
        canonical_slug: string; supplier_name: string;
        min_cost: string; avg_cost: string; variant_count: number;
        any_in_stock: boolean; last_checked_at: string | null;
      }>(
        `SELECT cp.sku_slug AS canonical_slug,
                lower(spc.supplier_name) AS supplier_name,
                MIN(spc.base_cost_usd)::text AS min_cost,
                AVG(spc.base_cost_usd)::text AS avg_cost,
                COUNT(*)::int AS variant_count,
                BOOL_OR(spc.is_in_stock) AS any_in_stock,
                MAX(spc.last_checked_at)::text AS last_checked_at
           FROM public.supplier_product_costs spc
           JOIN public.canonical_products cp ON cp.id = spc.canonical_product_id
          WHERE (cp.sku_slug, lower(spc.supplier_name)) IN (
                  SELECT p.slug, p.supplier FROM (SELECT unnest($1::text[]) AS slug, unnest($2::text[]) AS supplier) p
                )
          GROUP BY cp.sku_slug, lower(spc.supplier_name)`,
        [pairList.map((p) => p.canonicalSlug), pairList.map((p) => p.supplierName)],
      );
      for (const c of capRows) {
        capturedByPair.set(`${c.canonical_slug}::${c.supplier_name}`, {
          minBaseCost: Number(c.min_cost),
          avgBaseCost: Number(c.avg_cost),
          variantCount: Number(c.variant_count),
          anyInStock: Boolean(c.any_in_stock),
          lastCheckedAt: c.last_checked_at,
        });
      }
    }

    const designs = rows.map((r) => {
      const retail = r.retail_price != null ? Number(r.retail_price) : null;
      const cost = r.supplier_cost != null ? Number(r.supplier_cost) : null;
      const canonical = canonicalByDesign.get(r.id);
      const captured = canonical && r.supplier_slug
        ? capturedByPair.get(`${canonical}::${r.supplier_slug.toLowerCase()}`) ?? null
        : null;
      return {
        id: r.id,
        name: r.name || "Untitled design",
        status: r.status || "draft",
        supplierName: r.supplier_name,
        catalogName: r.catalog_name,
        retail,
        supplierCost: cost,
        snapshotVariantCount: Number(r.snapshot_count || 0),
        snapshotMin: r.snapshot_min != null ? Number(r.snapshot_min) : null,
        snapshotMax: r.snapshot_max != null ? Number(r.snapshot_max) : null,
        // Same margin math as the publishing feed: fraction of retail.
        margin: retail != null && retail > 0 && cost != null ? (retail - cost) / retail : null,
        marginDollars: retail != null && cost != null ? retail - cost : null,
        captured,
      };
    });

    const costed = designs.filter((d) => d.retail != null && d.supplierCost != null);
    const totalRetail = costed.reduce((a, d) => a + (d.retail ?? 0), 0);
    const totalSupplierCost = costed.reduce((a, d) => a + (d.supplierCost ?? 0), 0);

    return NextResponse.json({
      designs,
      totals: {
        designs: designs.length,
        withCost: costed.length,
        totalRetail,
        totalSupplierCost,
        totalMarginDollars: totalRetail - totalSupplierCost,
        margin: totalRetail > 0 ? (totalRetail - totalSupplierCost) / totalRetail : null,
      },
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/catalog-publishing/costing]", e);
    return NextResponse.json({ error: e?.message || "Failed to load the cost rollup" }, { status: 500 });
  }
}
