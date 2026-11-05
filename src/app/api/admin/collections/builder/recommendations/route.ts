import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/gate";
import type { SameSupplierRecommendation } from "@/lib/collection-builder";
import { resolveCatalogForDesign } from "@/lib/fabric/builder-designs";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/collections/builder/recommendations?designId=&excludeIds=
 *
 * For a selected design, recommend alternative catalog products from the
 * SAME supplier in DIFFERENT categories — e.g. she picked a Gelato mug,
 * we suggest Gelato shirts / posters / tote bags instead of a Printful
 * shirt, so the whole collection ships together.
 *
 * excludeIds: comma-separated catalog product IDs already in the builder
 * (so we don't recommend what's already selected).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(req.url);
    const designId = searchParams.get("designId");
    const excludeIds = (searchParams.get("excludeIds") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "12", 10) || 12, 48);

    if (!designId) {
      return NextResponse.json(
        { error: "designId is required" },
        { status: 400 },
      );
    }

    // Resolve the design's supplier + category via separate lookups —
    // the PostgREST embed path does not exist in the real schema
    // (see builder-designs.ts).
    const { data: design, error: designError } = await supabase
      .from("designs")
      .select("id, name, supplier_catalog_product_id")
      .eq("id", designId)
      .single();

    if (designError) throw designError;
    const cp = await resolveCatalogForDesign(
      supabase,
      (design as any)?.supplier_catalog_product_id ?? null,
    );
    const supplierId: string | null = cp?.supplier_id ?? null;
    if (!supplierId) {
      return NextResponse.json({
        recommendations: [],
        reason: "Design has no resolvable supplier",
      });
    }
    const { data: supplierRow } = await supabase
      .from("suppliers")
      .select("name")
      .eq("id", supplierId)
      .single();
    const supplierName: string = supplierRow?.name ?? "supplier";
    const ownCategoryId: string | null = cp?.category_id ?? null;
    const ownCatalogId: string | null = cp?.id ?? null;

    // Same supplier, different category, has images preferred.
    let query = supabase
      .from("supplier_catalog_products")
      .select("id, name, supplier_id, category_id, image_url, variant_count")
      .eq("supplier_id", supplierId)
      .neq("id", ownCatalogId ?? "")
      .order("image_url", { ascending: false, nullsFirst: false })
      .limit(limit * 3);

    if (ownCategoryId) {
      query = query.neq("category_id", ownCategoryId);
    }
    if (excludeIds.length) {
      const quoted = excludeIds.map((id) => `"${id}"`).join(",");
      query = query.not("id", "in", `(${quoted})`);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Prefer products with images, then trim to limit.
    const sorted = [...(data ?? [])].sort((a: any, b: any) =>
      a.image_url && !b.image_url ? -1 : !a.image_url && b.image_url ? 1 : 0,
    );
    const picked = sorted.slice(0, limit);

    // Category names via a separate lookup (no embeds — see above).
    const catIds = [...new Set(picked.map((p: any) => p.category_id).filter(Boolean))];
    const { data: catRows } = catIds.length
      ? await supabase.from("categories").select("id, name").in("id", catIds)
      : { data: [] };
    const catNameById = new Map((catRows ?? []).map((c: any) => [c.id, c.name]));

    const recommendations: SameSupplierRecommendation[] = picked.map((p: any) => ({
      id: p.id,
      name: p.name,
      supplier_id: p.supplier_id,
      supplier_name: supplierName,
      category_id: p.category_id,
      category_name: catNameById.get(p.category_id) ?? null,
      image_url: p.image_url,
      variant_count: p.variant_count,
    }));

    return NextResponse.json({
      recommendations,
      supplier_id: supplierId,
      supplier_name: supplierName,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to load recommendations" },
      { status: 500 },
    );
  }
}
