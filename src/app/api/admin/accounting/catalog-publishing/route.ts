import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/catalog-publishing
//
// Product Design & Publishing (owner's product_design_publishing.html)
// — the accounting-side view: every design publication the studio has
// made, with the product it sells as, the retail price, the supplier
// behind it and that supplier's catalog cost, so the margin on each
// published design is visible. Sources: design_publications →
// designs → product_variants/products, and the design's supplier
// catalog product → suppliers + supplier_catalog_variants snapshots.
//
// CP2 adds the pre-publish pipeline: `projects` — one row per
// non-archived design with a stage DERIVED server-side from status +
// readiness fields (no stage column exists; see the derivation below).
// The stage tab counts are computed from the same derivation, so the
// tabs and the lists can never disagree.

// Pipeline stage keys — the stage routes under
// /admin/accounting/catalog/publishing/[stage] use these verbatim.
type PublishingStage = "concept" | "sourcing" | "prototype" | "ready" | "published";

// Derive a design's pipeline stage from its lifecycle status and
// readiness fields (plan §4):
//   Concept & CAD      — draft, no supplier blank chosen yet
//   Material Sourcing  — draft, blank chosen, artwork not print-ready
//   Prototype Testing  — draft with a print file, or in review
//   Ready to Publish   — approved through the preflight/review gate
//   Published          — live (shown in All Projects; not a stage tab)
// Anything else (e.g. the legacy `approved` status the current state
// machine never emits) returns null: the design stays in All Projects
// under its real status label, unbucketed — never silently reclassified.
function deriveStage(
  status: string,
  hasSupplier: boolean,
  hasPrintFile: boolean,
): PublishingStage | null {
  if (status === "ready_to_publish") return "ready";
  if (status === "needs_review") return "prototype";
  if (status === "published") return "published";
  if (status === "draft") {
    if (!hasSupplier) return "concept";
    if (!hasPrintFile) return "sourcing";
    return "prototype";
  }
  return null;
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const rows = await pgQuery<{
      id: string; status: string | null; published_at: string | null; created_at: string;
      design_name: string | null; design_retail: string | null;
      product_name: string | null; variant_sku: string | null; variant_price: string | null;
      collection_name: string | null; supplier_name: string | null;
      catalog_name: string | null; supplier_cost: string | null;
    }>(
      `SELECT pub.id::text AS id, pub.status, pub.published_at::text AS published_at,
              pub.created_at::text AS created_at,
              COALESCE(d.product_title, d.name) AS design_name,
              d.retail_price::text AS design_retail,
              p.name AS product_name, pv.sku AS variant_sku, pv.price::text AS variant_price,
              col.name AS collection_name,
              s.name AS supplier_name, scp.name AS catalog_name,
              (SELECT AVG(price_snapshot)::text FROM public.supplier_catalog_variants
                WHERE supplier_catalog_product_id = scp.id AND price_snapshot IS NOT NULL) AS supplier_cost
         FROM public.design_publications pub
         LEFT JOIN public.designs d ON d.id = pub.design_id
         LEFT JOIN public.product_variants pv ON pv.id = pub.product_variant_id
         LEFT JOIN public.products p ON p.id = pv.product_id
         LEFT JOIN public.collections col ON col.id = pub.collection_id
         LEFT JOIN public.supplier_catalog_products scp ON scp.id = d.supplier_catalog_product_id
         LEFT JOIN public.suppliers s ON s.id = scp.supplier_id
        WHERE pub.tenant_id = $1
        ORDER BY pub.published_at DESC NULLS LAST, pub.created_at DESC
        LIMIT 500`,
      [tenant],
    );
    const totals = await pgQuery<{ designs: number; with_print_file: number }>(
      `SELECT COUNT(*)::int AS designs,
              COUNT(*) FILTER (WHERE print_file_path IS NOT NULL)::int AS with_print_file
         FROM public.designs WHERE tenant_id = $1`,
      [tenant],
    );
    // Pipeline feed: one row per non-archived design. Supplier cost
    // uses the exact same snapshot-average subquery (and the margin
    // formula below) as the publications rows — one cost math, two
    // views. DPI is the design's print file of record: the
    // highest-version row in design_files.
    const projectRows = await pgQuery<{
      id: string; name: string | null; status: string | null;
      retail_price: string | null; print_file_path: string | null;
      has_supplier: boolean; updated_at: string | null;
      collection_name: string | null; supplier_name: string | null;
      catalog_name: string | null; supplier_cost: string | null;
      print_dpi: string | null;
    }>(
      `SELECT d.id::text AS id,
              COALESCE(d.product_title, d.name) AS name,
              d.status, d.retail_price::text AS retail_price,
              d.print_file_path,
              (d.supplier_catalog_product_id IS NOT NULL) AS has_supplier,
              d.updated_at::text AS updated_at,
              col.name AS collection_name,
              s.name AS supplier_name, scp.name AS catalog_name,
              (SELECT AVG(price_snapshot)::text FROM public.supplier_catalog_variants
                WHERE supplier_catalog_product_id = scp.id AND price_snapshot IS NOT NULL) AS supplier_cost,
              (SELECT df.dpi::text FROM public.design_files df
                WHERE df.design_id = d.id
                ORDER BY df.version DESC NULLS LAST, df.created_at DESC
                LIMIT 1) AS print_dpi
         FROM public.designs d
         LEFT JOIN public.collections col ON col.id = d.collection_id
         LEFT JOIN public.supplier_catalog_products scp ON scp.id = d.supplier_catalog_product_id
         LEFT JOIN public.suppliers s ON s.id = scp.supplier_id
        WHERE d.tenant_id = $1 AND COALESCE(d.status, 'draft') <> 'archived'
        ORDER BY d.updated_at DESC NULLS LAST
        LIMIT 500`,
      [tenant],
    );
    const projects = projectRows.map((r) => {
      const status = r.status || "draft";
      const retail = r.retail_price != null ? Number(r.retail_price) : null;
      const cost = r.supplier_cost != null ? Number(r.supplier_cost) : null;
      const dpi = r.print_dpi != null ? Number(r.print_dpi) : null;
      return {
        id: r.id,
        name: r.name || "Untitled design",
        status,
        stage: deriveStage(status, r.has_supplier, r.print_file_path != null),
        supplierName: r.supplier_name,
        catalogName: r.catalog_name,
        collectionName: r.collection_name,
        retail,
        supplierCost: cost,
        margin: retail != null && retail > 0 && cost != null ? (retail - cost) / retail : null,
        hasPrintFile: r.print_file_path != null,
        printDpi: dpi != null && Number.isFinite(dpi) ? dpi : null,
        updatedAt: r.updated_at,
      };
    });
    const stageCounts = {
      all: projects.length,
      concept: projects.filter((p) => p.stage === "concept").length,
      sourcing: projects.filter((p) => p.stage === "sourcing").length,
      prototype: projects.filter((p) => p.stage === "prototype").length,
      ready: projects.filter((p) => p.stage === "ready").length,
    };
    return NextResponse.json({
      publications: rows.map((r) => {
        const retail = r.variant_price != null ? Number(r.variant_price) : r.design_retail != null ? Number(r.design_retail) : null;
        const cost = r.supplier_cost != null ? Number(r.supplier_cost) : null;
        return {
          id: r.id,
          status: r.status || "draft",
          publishedAt: r.published_at,
          designName: r.design_name || "Untitled design",
          productName: r.product_name,
          variantSku: r.variant_sku,
          collectionName: r.collection_name,
          supplierName: r.supplier_name,
          catalogName: r.catalog_name,
          retail,
          supplierCost: cost,
          margin: retail != null && retail > 0 && cost != null ? (retail - cost) / retail : null,
        };
      }),
      totals: { designs: Number(totals[0]?.designs || 0), withPrintFile: Number(totals[0]?.with_print_file || 0) },
      projects,
      stageCounts,
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/catalog-publishing]", e);
    return NextResponse.json({ error: e?.message || "Failed to load publishing" }, { status: 500 });
  }
}
