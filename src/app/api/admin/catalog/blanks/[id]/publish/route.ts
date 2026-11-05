import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { renderAssetUrl } from "@/lib/fabric/blanks";
import { publishDesign } from "@/lib/fabric/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/catalog/blanks/[id]/publish { designId }
 * The review approval from the play, as one action:
 *  1. the platform's one publish pipeline (lib/fabric/publish) turns
 *     the design into a real storefront product on the blank's source
 *     supplier product — products + product_variants + mirror +
 *     design_publications, the rows the cart and PDP actually read
 *     (design_publications.product_variant_id references the
 *     STOREFRONT product_variants, never supplier variants);
 *  2. the batch's renders become the product's gallery: the mirror's
 *     images are OUR front renders per color, and each publication's
 *     mockup_url is set from the render of its variant's color;
 *  3. the blank's lifecycle walks designed → ready and visibility
 *     flips through apply_bulk's publish, whose guard requires
 *     lifecycle = ready AND render_ready.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { designId?: string };
  if (!body.designId) {
    return NextResponse.json({ error: "Pick a design first." }, { status: 400 });
  }
  const sb = createServerClient();

  const { data: design } = await sb
    .from("designs")
    .select("id, tenant_id, name, product_title, retail_price, supplier_catalog_product_id")
    .eq("id", body.designId)
    .single();
  if (!design) return NextResponse.json({ error: "Design not found." }, { status: 404 });

  const { data: renders } = await sb
    .from("renders")
    .select("view, color, storage_path")
    .eq("blank_id", id)
    .eq("design_id", body.designId)
    .eq("purpose", "publish")
    .eq("status", "rendered");
  const frontByColor = new Map<string, string>();
  for (const r of renders ?? []) {
    const url = renderAssetUrl(r.storage_path);
    if (url && r.view === "front" && r.color) frontByColor.set(r.color, url);
  }
  if (!frontByColor.size) {
    return NextResponse.json(
      { error: "No finished renders for this design on this blank yet — generate them first." },
      { status: 422 }
    );
  }

  // The design publishes on ONE source supplier product of this blank:
  // its own binding when that binding belongs to the blank, else the
  // blank's primary linked product (Printful first — it carries the
  // persisted assets and geometry — then Printify, then any other).
  const { data: linked } = await sb
    .from("supplier_catalog_products")
    .select("id, supplier_id")
    .eq("canonical_product_id", id);
  const linkedIds = (linked ?? []).map((p) => p.id);
  if (!linkedIds.length) {
    return NextResponse.json(
      { error: "This blank has no linked supplier products to publish from." },
      { status: 422 }
    );
  }
  let sourceId: string | null =
    design.supplier_catalog_product_id && linkedIds.includes(design.supplier_catalog_product_id)
      ? design.supplier_catalog_product_id
      : null;
  if (!sourceId) {
    const { data: suppliers } = await sb.from("suppliers").select("id, slug");
    const slugById = new Map((suppliers ?? []).map((s) => [s.id, s.slug]));
    const bySupplier = new Map<string, string>();
    for (const p of linked ?? []) {
      const slug = slugById.get(p.supplier_id);
      if (slug && !bySupplier.has(slug)) bySupplier.set(slug, p.id);
    }
    sourceId = bySupplier.get("printful") ?? bySupplier.get("printify") ?? linkedIds[0];
    const { error: bindErr } = await sb
      .from("designs")
      .update({ supplier_catalog_product_id: sourceId })
      .eq("id", design.id);
    if (bindErr) {
      return NextResponse.json(
        { error: "Could not bind the design to this blank's source product." },
        { status: 502 }
      );
    }
  }
  if (!design.retail_price || Number(design.retail_price) <= 0) {
    return NextResponse.json(
      { error: "Set this design's retail price before publishing — publish prices every variant from it." },
      { status: 422 }
    );
  }

  let product: { productId: string; slug: string; variantCount: number };
  try {
    product = await publishDesign(sb, design.id);
  } catch (e) {
    return NextResponse.json(
      { error: `Publish failed: ${e instanceof Error ? e.message : "unknown error"}` },
      { status: 502 }
    );
  }

  // Gallery: our renders replace the mirror's imagery, and each
  // publication carries the render for its variant's color.
  const frontUrls = [...frontByColor.values()];
  await sb
    .from("supplier_catalog_products")
    .update({ image_url: frontUrls[0], images: frontUrls })
    .eq("id", product.productId);
  const { data: pubs } = await sb
    .from("design_publications")
    .select("id, product_variant_id")
    .eq("design_id", design.id);
  const { data: pvars } = await sb
    .from("product_variants")
    .select("id, color")
    .eq("product_id", product.productId);
  const colorByVariant = new Map((pvars ?? []).map((v) => [v.id, v.color]));
  let publicationsUpdated = 0;
  for (const pub of pubs ?? []) {
    const color = colorByVariant.get(pub.product_variant_id);
    const url = color ? frontByColor.get(color) : undefined;
    if (!url) continue;
    const { error } = await sb
      .from("design_publications")
      .update({ mockup_url: url })
      .eq("id", pub.id);
    if (!error) publicationsUpdated++;
  }

  await sb.from("canonical_products").update({ lifecycle: "designed" }).eq("id", id).in("lifecycle", ["imported", "categorized"]);
  await sb.from("canonical_products").update({ lifecycle: "ready" }).eq("id", id).eq("lifecycle", "designed");
  const { data: bulk, error: bulkErr } = await sb.rpc("apply_bulk", {
    r: { field: "id", op: "eq", value: id },
    action: "publish",
    params: {},
    dry_run: false,
    actor: "admin-ui",
  });
  if (bulkErr) {
    return NextResponse.json(
      { error: "Product published, but the blank's visibility step failed — the blank may not be render-ready." },
      { status: 502 }
    );
  }
  return NextResponse.json({
    product: { id: product.productId, slug: product.slug, variants: product.variantCount },
    publicationsUpdated,
    publish: bulk,
  });
}
