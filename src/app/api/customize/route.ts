import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { resolveTemplate, colorNameToHex } from "@/lib/fabric/templates";
import { BUCKETS, uploadDataUrl } from "@/lib/fabric/storage";
import { transformFrontNodes, clampTransform } from "@/lib/fabric/customize";
import type { DesignNode } from "@/lib/admin/design-node";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PLATFORM_TENANT_ID = getTenantId();

function publicUrl(ref: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${ref}`;
}

/**
 * POST /api/customize — save a shopper's PDP customization as a real
 * design the order flow already understands.
 *
 * Body: {
 *   source_design_id,            // a PUBLISHED design (the artwork)
 *   supplier_catalog_variant_id, // the exact variant being bought
 *   multiplier, offset_x, offset_y,
 *   print_file_data_url?,        // client-rendered transparent print PNG
 *   mockup_data_url?,            // client-rendered mockup JPEG
 *   customer_id?                 // signed-in buyer; guests omit it
 * }
 *
 * What lands in the database (the same shape a studio publish makes):
 *   designs             — a new design row whose canvas_state is the
 *                         source design's state with the shopper's
 *                         transform baked in (studio-openable)
 *   design_files        — the print file (client render when provided,
 *                         else the source design's own print file —
 *                         the snapshot resolver's documented chain)
 *   design_publications — design → the bought variant, with mockup
 * Returns { design_id, design_publication_id } for the cart add.
 * Prices are NEVER taken from the client — the cart resolves them
 * from the variant row, exactly like every other add.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sourceDesignId = String(body.source_design_id ?? "");
  const variantId = String(body.supplier_catalog_variant_id ?? "");
  if (!sourceDesignId || !variantId) {
    return NextResponse.json(
      { error: "source_design_id and supplier_catalog_variant_id are required" },
      { status: 400 },
    );
  }
  const transform = clampTransform({
    multiplier: Number(body.multiplier ?? 1),
    offsetX: Number(body.offset_x ?? 0),
    offsetY: Number(body.offset_y ?? 0),
  });

  const sb = createServerClient();

  // 1. The artwork must be a published design.
  const { data: source } = await sb
    .from("designs")
    .select("*")
    .eq("id", sourceDesignId)
    .eq("tenant_id", PLATFORM_TENANT_ID)
    .maybeSingle();
  if (!source) return NextResponse.json({ error: "design not found" }, { status: 404 });
  if (source.status !== "published") {
    return NextResponse.json({ error: "that artwork is not published" }, { status: 400 });
  }
  const baseId: string | null = source.supplier_catalog_product_id;
  if (!baseId) {
    return NextResponse.json({ error: "design has no base product" }, { status: 400 });
  }

  // 2. The variant must belong to the design's base product or to a
  //    storefront product published from that same base (the mirror).
  const { data: variant } = await sb
    .from("supplier_catalog_variants")
    .select("id, supplier_catalog_product_id, color, size, external_id, price_snapshot")
    .eq("id", variantId)
    .maybeSingle();
  if (!variant) return NextResponse.json({ error: "variant not found" }, { status: 404 });
  if (variant.supplier_catalog_product_id !== baseId) {
    const { data: mirror } = await sb
      .from("designs")
      .select("id")
      .eq("published_product_id", variant.supplier_catalog_product_id)
      .eq("supplier_catalog_product_id", baseId)
      .eq("status", "published")
      .limit(1)
      .maybeSingle();
    if (!mirror) {
      return NextResponse.json(
        { error: "that variant does not belong to this design's product" },
        { status: 400 },
      );
    }
  }

  // 3. Template (print grid + trim) from the BASE product, the same
  //    resolution the studio uses.
  const { data: baseProduct } = await sb
    .from("supplier_catalog_products")
    .select("name, image_url")
    .eq("id", baseId)
    .maybeSingle();
  if (!baseProduct) return NextResponse.json({ error: "base product not found" }, { status: 404 });
  const { data: baseVariants } = await sb
    .from("supplier_catalog_variants")
    .select("print_specs")
    .eq("supplier_catalog_product_id", baseId)
    .limit(24);
  const template = resolveTemplate(baseProduct, baseVariants ?? []);

  // 3b. design_publications.product_variant_id references the
  //     STOREFRONT product_variants (composite FK with tenant). The
  //     studio publish mapped those 1:1 from the supplier variants —
  //     sku carries the supplier external id — under the design's
  //     published product. Resolve the shopper's supplier variant to
  //     that row now (sku first, size+color fallback), before any
  //     writes, so a miss never orphans a design.
  let storefrontVariantId: string | null = null;
  if (source.published_product_id) {
    if (variant.external_id) {
      const { data: pv } = await sb
        .from("product_variants")
        .select("id")
        .eq("product_id", source.published_product_id)
        .eq("sku", variant.external_id)
        .maybeSingle();
      storefrontVariantId = pv?.id ?? null;
    }
    if (!storefrontVariantId && variant.size && variant.color) {
      const { data: pv } = await sb
        .from("product_variants")
        .select("id")
        .eq("product_id", source.published_product_id)
        .eq("size", variant.size)
        .eq("color", variant.color)
        .maybeSingle();
      storefrontVariantId = pv?.id ?? null;
    }
  }
  if (!storefrontVariantId) {
    return NextResponse.json(
      { error: "this design's product has no storefront variant for that option yet" },
      { status: 422 },
    );
  }

  // 4. Clone the source canvas state; bake the transform into Front.
  const sourceState: any = source.canvas_state ?? {};
  const front: DesignNode[] =
    sourceState.version === 2 && sourceState.surfaces
      ? (sourceState.surfaces.Front ?? [])
      : Array.isArray(sourceState.nodes)
        ? sourceState.nodes
        : [];
  const back: DesignNode[] =
    sourceState.version === 2 && sourceState.surfaces ? (sourceState.surfaces.Back ?? []) : [];
  const garmentColor = variant.color
    ? colorNameToHex(variant.color)
    : (source.garment_color ?? "#ffffff");
  const canvasState = {
    ...sourceState,
    app: "Fabric Design Studio",
    version: 2,
    garmentColor,
    supplierCatalogProductId: baseId,
    surfaces: {
      Front: transformFrontNodes(front, template.stage.trim, transform),
      Back: back.map((n: DesignNode) => ({ ...n })),
    },
    customization: {
      source_design_id: source.id,
      multiplier: transform.multiplier,
      offset_x: transform.offsetX,
      offset_y: transform.offsetY,
      variant_id: variantId,
      surface: "Front",
    },
  };

  // Owner: only a real profile id may land in owner_id (FK) — guests
  // and unknown ids save as ownerless, like the seed designs.
  let ownerId: string | null = null;
  if (typeof body.customer_id === "string" && body.customer_id) {
    const { data: profile } = await sb
      .from("profiles")
      .select("id")
      .eq("id", body.customer_id)
      .maybeSingle();
    if (profile) ownerId = profile.id;
  }

  const { data: created, error: insErr } = await sb
    .from("designs")
    .insert({
      tenant_id: PLATFORM_TENANT_ID,
      owner_id: ownerId,
      name: `${source.name} — customized`,
      status: "published",
      // designs_source_check allows konva | upload | ai_draft — a
      // shopper customization IS a Konva design; the canvas_state
      // `customization` block (written below) is what marks it as
      // shopper-made for filtering.
      source: "konva",
      canvas_state: canvasState,
      supplier_catalog_product_id: baseId,
      product_title: source.product_title ?? source.name,
      description: source.description ?? null,
      retail_price: variant.price_snapshot != null ? Number(variant.price_snapshot) : null,
      category_id: source.category_id ?? null,
      collection_id: source.collection_id ?? null,
      garment_color: garmentColor,
      product_type: source.product_type ?? template.productType,
    })
    .select("id")
    .single();
  if (insErr || !created) {
    return NextResponse.json({ error: insErr?.message ?? "could not save the design" }, { status: 500 });
  }
  const designId: string = created.id;

  // 5. Print file: the client's own render of THEIR placement when it
  //    arrives; otherwise the source design's print file (the snapshot
  //    resolver falls back the same way — design_files → mockup).
  let printUrl: string | null = null;
  let printW = template.spec.widthPx;
  let printH = template.spec.heightPx;
  if (typeof body.print_file_data_url === "string" && body.print_file_data_url.startsWith("data:image/png")) {
    try {
      const { ref } = await uploadDataUrl(
        sb,
        BUCKETS.print,
        `designs/${designId}/print-front.png`,
        body.print_file_data_url,
      );
      printUrl = publicUrl(ref);
      await sb.from("designs").update({ print_file_path: ref }).eq("id", designId);
    } catch {
      printUrl = null; // fall through to the source-file chain
    }
  }
  if (!printUrl) {
    const { data: srcFiles } = await sb
      .from("design_files")
      .select("file_url, width_px, height_px")
      .eq("design_id", source.id)
      .order("version", { ascending: false });
    const frontFile =
      (srcFiles ?? []).find((f: any) => f.file_url) ?? null;
    if (frontFile?.file_url) {
      const raw = String(frontFile.file_url);
      printUrl = raw.startsWith("http") || raw.startsWith("/")
        ? raw
        : publicUrl(raw.startsWith("design-files/") ? raw : `design-files/${raw}`);
      if (frontFile.width_px) printW = Number(frontFile.width_px);
      if (frontFile.height_px) printH = Number(frontFile.height_px);
    } else if (source.print_file_path) {
      printUrl = publicUrl(String(source.print_file_path));
    }
  }
  if (printUrl) {
    await sb.from("design_files").insert({
      design_id: designId,
      placement: "front",
      file_url: printUrl,
      width_px: printW,
      height_px: printH,
      dpi: template.spec.dpi,
      version: 1,
    });
  }

  // 6. Mockup: the client's composite when it arrives, else the print
  //    file (transparent artwork reads honestly in the cart), else the
  //    source design's published mockup.
  let mockupUrl: string | null = printUrl;
  if (typeof body.mockup_data_url === "string" && body.mockup_data_url.startsWith("data:image/")) {
    try {
      const { ref } = await uploadDataUrl(
        sb,
        BUCKETS.mockups,
        `designs/${designId}/mockup-front.jpg`,
        body.mockup_data_url,
      );
      mockupUrl = publicUrl(ref);
      await sb.from("designs").update({ mockup_path: ref }).eq("id", designId);
    } catch {
      /* keep the print-file fallback */
    }
  }
  if (!mockupUrl) {
    const { data: srcPub } = await sb
      .from("design_publications")
      .select("mockup_url")
      .eq("design_id", source.id)
      .eq("status", "published")
      .limit(1)
      .maybeSingle();
    mockupUrl = srcPub?.mockup_url ?? null;
  }

  // 7. The publication — the row the cart and checkout carry.
  const { data: pub, error: pubErr } = await sb
    .from("design_publications")
    .insert({
      // design_publications.id has no DB default — the studio's
      // publish path supplies it too.
      id: crypto.randomUUID(),
      tenant_id: PLATFORM_TENANT_ID,
      design_id: designId,
      product_variant_id: storefrontVariantId,
      collection_id: source.collection_id ?? null,
      status: "published",
      mockup_url: mockupUrl,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (pubErr || !pub) {
    // Don't leave an orphan design behind a failed publication.
    await sb.from("design_files").delete().eq("design_id", designId);
    await sb.from("designs").delete().eq("id", designId);
    return NextResponse.json({ error: pubErr?.message ?? "could not publish the customization" }, { status: 500 });
  }

  return NextResponse.json({
    design_id: designId,
    design_publication_id: pub.id,
    print_file_url: printUrl,
    mockup_url: mockupUrl,
  });
}
