/**
 * GET /api/admin/studio/product-stage — the REAL product stage for the
 * Design Studio (owner order 2026-10-30): the supplier's own mockup
 * template frame + print-area geometry and the captured print specs
 * for one product, read from our database (canonical_products /
 * supplier_print_specs / supplier_mockup_templates). No live supplier
 * call is ever made here — captures happen in
 * scripts/capture-printful-stage.mjs.
 *
 * Identify the product ONE of three ways:
 *   ?canonical=bella-canvas-3001[&supplier=printful]
 *   ?supplierCatalogId=71&supplier=printful   (the supplier-side id)
 *   ?catalogProductId=<uuid>                  (supplier_catalog_products id —
 *                                              the id designs bind to)
 *
 * `supplier` defaults to "printful" (the only captured supplier so
 * far). A product with no captured stage gets a 404 with a plain
 * reason — the studio then keeps its standard stage; a missing
 * capture must never break the editor.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/gate";
import {
  loadProductStage,
  loadProductStageByBlueprint,
  loadProductStageForCatalogProduct,
  type ProductStage,
} from "@/lib/fabric/product-stage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STAGE =
  "No captured stage for this product yet — the editor will use its standard stage.";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const { searchParams } = new URL(req.url);
  const canonical = searchParams.get("canonical");
  const supplierCatalogId = searchParams.get("supplierCatalogId");
  const catalogProductId = searchParams.get("catalogProductId");
  const supplier = searchParams.get("supplier") ?? "printful";

  if (!canonical && !supplierCatalogId && !catalogProductId) {
    return NextResponse.json(
      {
        error:
          "Say which product: pass canonical=<slug>, supplierCatalogId=<supplier product id>, or catalogProductId=<catalog row id>.",
      },
      { status: 400 },
    );
  }

  try {
    let stage: ProductStage | null = null;
    if (canonical) {
      stage = await loadProductStage(canonical, supplier);
    } else if (catalogProductId) {
      stage = await loadProductStageForCatalogProduct(catalogProductId);
    } else if (supplierCatalogId) {
      stage = await loadProductStageByBlueprint(supplier, supplierCatalogId);
    }

    if (!stage) {
      return NextResponse.json({ error: NO_STAGE }, { status: 404 });
    }
    return NextResponse.json(stage);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Stage lookup failed." },
      { status: 500 },
    );
  }
}
