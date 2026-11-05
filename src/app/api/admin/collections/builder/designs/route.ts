import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/gate";
import type { BuilderDesign } from "@/lib/collection-builder";
import { resolveBuilderDesigns } from "@/lib/fabric/builder-designs";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/collections/builder/designs?q=&limit=&offset=
 *
 * Lists designs with their supplier resolved through
 * designs.supplier_catalog_product_id → supplier_catalog_products →
 * suppliers. Powers the collection builder's design picker.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "48", 10) || 48, 200);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10) || 0;

    let query = supabase
      .from("designs")
      .select("id, name, status, supplier_catalog_product_id, updated_at", {
        count: "exact",
      })
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (q) {
      query = query.ilike("name", `%${q}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    // Suppliers resolve via separate lookups — the PostgREST embed
    // path does not exist in the real schema (see builder-designs.ts).
    const designs: BuilderDesign[] = await resolveBuilderDesigns(
      supabase,
      data ?? [],
    );

    return NextResponse.json({ designs, total: count ?? designs.length });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to load designs" },
      { status: 500 },
    );
  }
}
