import { NextRequest, NextResponse } from "next/server";
import { createServerClient, fetchVariantsForProduct } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/gate";
import { resolveTemplate } from "@/lib/fabric/templates";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/studio/catalog/[id] — one catalog product with its
 * variants and the RESOLVED template: real print dimensions from the
 * variants' print_specs, stage guide zones, surfaces, mockup. This is
 * what the editor loads when a product is chosen — the template is the
 * supplier's, not a hardcoded silhouette label.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const db = createServerClient();
    // No PostgREST embeds on supplier_catalog_products: the table has
    // more than one FK to suppliers, so embedding is ambiguous
    // (PGRST201). Supplier/category are fetched as separate lookups.
    const { data: product, error } = await db
      .from("supplier_catalog_products")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !product) {
      return NextResponse.json({ error: "Catalog product not found" }, { status: 404 });
    }
    const { data: supplier } = await db
      .from("suppliers")
      .select("id, name, slug")
      .eq("id", product.supplier_id)
      .single();
    const { data: category } = product.category_id
      ? await db
          .from("categories")
          .select("id, name, slug")
          .eq("id", product.category_id)
          .single()
      : { data: null };

    const variants = await fetchVariantsForProduct(id);
    let template = resolveTemplate(
      { name: product.name, image_url: product.image_url },
      variants,
    );

    // Structural Asset Registry override (product_canvas_templates):
    // when a registered blueprint exists for this product, its
    // normalized geometry + physical inches become the template —
    // spec = physical inches x 300 DPI, trim = normalized x stage
    // (420x500). WRAPAROUND serves the Front surface when no FRONT
    // row exists (mug wraps). All angles ride along in the response.
    let canvasTemplates: any[] = [];
    {
      const variantIds = variants.map((v: any) => v.id).filter(Boolean);
      if (variantIds.length) {
        const { data: maps } = await db
          .from("supplier_product_mappings")
          .select("id")
          .in("supplier_catalog_variant_id", variantIds);
        const mapIds = (maps ?? []).map((m: any) => m.id);
        if (mapIds.length) {
          const { data: rows } = await db
            .from("product_canvas_templates")
            .select("*")
            .in("product_mapping_id", mapIds)
            .eq("is_active", true);
          canvasTemplates = rows ?? [];
        }
      }
      const frontRow =
        canvasTemplates.find((r: any) => r.view_angle === "FRONT") ??
        canvasTemplates.find((r: any) => r.view_angle === "WRAPAROUND");
      if (frontRow) {
        const specW = Math.round(Number(frontRow.physical_width_inches) * 300);
        const specH = Math.round(Number(frontRow.physical_height_inches) * 300);
        const trim = {
          x: Math.round(Number(frontRow.normalized_x) * 420),
          y: Math.round(Number(frontRow.normalized_y) * 500),
          width: Math.round(Number(frontRow.normalized_width) * 420),
          height: Math.round(Number(frontRow.normalized_height) * 500),
        };
        const bleedPx = Math.round(0.125 * 300);
        const safePx = Math.round(0.25 * 300);
        const bleed = {
          x: trim.x - (trim.width * bleedPx) / specW,
          y: trim.y - (trim.height * bleedPx) / specH,
          width: trim.width * (1 + (2 * bleedPx) / specW),
          height: trim.height * (1 + (2 * bleedPx) / specH),
        };
        const safe = {
          x: trim.x + (trim.width * safePx) / specW,
          y: trim.y + (trim.height * safePx) / specH,
          width: trim.width * (1 - (2 * safePx) / specW),
          height: trim.height * (1 - (2 * safePx) / specH),
        };
        template = {
          ...template,
          spec: { widthPx: specW, heightPx: specH, dpi: 300, bleedPx, safePx, source: "registry" },
          stage: { trim, bleed, safe },
          mockupUrl: frontRow.mockup_image_url ?? template.mockupUrl,
        };
      }
    }

    return NextResponse.json({
      product: {
        id: product.id,
        name: product.name,
        brand_name: product.brand_name,
        supplier_id: product.supplier_id,
        supplier_name: supplier?.name ?? null,
        supplier_slug: supplier?.slug ?? null,
        category_id: product.category_id,
        category_name: category?.name ?? null,
        image_url: product.image_url,
        images: product.images,
      },
      variants: variants.map((v) => ({
        id: v.id,
        external_id: v.external_id,
        name: v.name,
        size: v.size,
        color: v.color,
        price_snapshot: v.price_snapshot,
        has_print_specs: Boolean(v.print_specs),
      })),
      template,
      canvasTemplates: canvasTemplates.map((r: any) => ({
        view_angle: r.view_angle,
        archetype_class: r.archetype_class,
        mockup_image_url: r.mockup_image_url,
        displacement_map_url: r.displacement_map_url,
        physical_width_inches: Number(r.physical_width_inches),
        physical_height_inches: Number(r.physical_height_inches),
        normalized: {
          x: Number(r.normalized_x), y: Number(r.normalized_y),
          width: Number(r.normalized_width), height: Number(r.normalized_height),
        },
        hardware_modifiers: r.hardware_modifiers,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
