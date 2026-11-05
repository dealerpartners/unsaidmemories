/**
 * GET /api/admin/studio/supplier-options?catalogProductId=<uuid> — the
 * supplier options for one catalog product (New Design wizard, Step 4).
 *
 * Thin route over loadSupplierOptionsForCatalogProduct in
 * lib/fabric/product-stage — the SAME resolution path the product
 * stage uses (catalog row → supplier + external_id → canonical blank
 * → captured specs / templates / costs). No live supplier call is
 * ever made here. Costs come from a captured row when one exists,
 * else from the product's own variant prices (owner ruling
 * 2026-11-02); null only when the listing carries no price — never
 * a guess. Each option also carries the catalog product it
 * represents, so the wizard can show the garment.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/gate";
import { loadSupplierOptionsForCatalogProduct } from "@/lib/fabric/product-stage";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const catalogProductId = new URL(req.url).searchParams.get("catalogProductId");
  if (!catalogProductId) {
    return NextResponse.json(
      { error: "Say which product: pass catalogProductId=<catalog row id>." },
      { status: 400 },
    );
  }

  try {
    const result = await loadSupplierOptionsForCatalogProduct(catalogProductId);
    if (!result) {
      return NextResponse.json({ error: "Catalog product not found" }, { status: 404 });
    }
    // The store's default margin for the recommended price (blank +
    // shipping, margin on top — owner ruling 2026-11-03). Stored in
    // app_settings as pricing.default_margin_pct; 40% until the owner
    // changes it in store settings.
    let marginPct = 0.4;
    try {
      const db = createServerClient();
      const { data } = await db
        .from("app_settings")
        .select("value")
        .eq("key", "pricing.default_margin_pct")
        .maybeSingle();
      const parsed = Number((data as { value?: unknown } | null)?.value);
      if (Number.isFinite(parsed) && parsed > 0 && parsed < 0.95) marginPct = parsed;
    } catch {
      // The default stands when the setting cannot be read.
    }
    return NextResponse.json({ ...result, pricing: { marginPct } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Supplier lookup failed." },
      { status: 500 },
    );
  }
}
