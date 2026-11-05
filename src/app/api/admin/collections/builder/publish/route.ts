import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { requireAdmin } from "@/lib/admin/gate";
import { slugifyCollectionName } from "@/lib/collection-builder";
import { resolveBuilderDesigns } from "@/lib/fabric/builder-designs";

export const dynamic = "force-dynamic";

const PLATFORM_TENANT_ID = getTenantId();

/**
 * POST /api/admin/collections/builder/publish
 * Body: {
 *   name: string;               // e.g. "KIN Score"
 *   framing_copy?: string;
 *   type?: string;              // default "theme"
 *   designIds: string[];        // designs to include
 *   forceMultiSupplier?: boolean; // acknowledge the supplier conflict
 * }
 *
 * One action: creates the collection, ensures every design has a live
 * product (creating products + variants from the design's catalog product
 * when needed), links them via product_collections, and sets every
 * product to 'published'.
 *
 * Refuses to publish a multi-supplier collection unless
 * forceMultiSupplier is true — Kim's rule: no Gelato mug + Printful
 * shirt shipping separately without an explicit override.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const name: string = (body?.name ?? "").trim();
    const framingCopy: string | null = body?.framing_copy ?? null;
    const type: string = body?.type ?? "theme";
    const designIds: string[] = body?.designIds ?? [];
    const forceMultiSupplier: boolean = body?.forceMultiSupplier === true;

    if (!name) {
      return NextResponse.json({ error: "Collection name is required" }, { status: 400 });
    }
    if (!designIds.length) {
      return NextResponse.json(
        { error: "Select at least one design" },
        { status: 400 },
      );
    }

    // ── 1. Resolve designs + suppliers for the conflict gate ──
    // Separate lookups, not PostgREST embeds — the embed path does
    // not exist in the real schema (see builder-designs.ts).
    const { data: designRows, error: designsError } = await supabase
      .from("designs")
      .select("id, name, status, supplier_catalog_product_id, updated_at")
      .in("id", designIds);
    if (designsError) throw designsError;
    if (!designRows?.length) {
      return NextResponse.json({ error: "No designs found" }, { status: 404 });
    }
    const designs = await resolveBuilderDesigns(supabase, designRows);

    const supplierIds = new Set(
      designs.map((d) => d.supplier_id).filter(Boolean),
    );
    if (supplierIds.size > 1 && !forceMultiSupplier) {
      return NextResponse.json(
        {
          error: "multi_supplier_conflict",
          message: `These designs span ${supplierIds.size} suppliers — customers would get separate shipments. Pass forceMultiSupplier:true to publish anyway, or swap items for same-supplier alternatives.`,
          supplierCount: supplierIds.size,
        },
        { status: 409 },
      );
    }

    // ── 2. Create the collection ──
    let slug = slugifyCollectionName(name);
    // Ensure slug uniqueness.
    const { data: existing } = await supabase
      .from("collections")
      .select("id")
      .eq("slug", slug)
      .limit(1);
    if (existing?.length) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const { data: collection, error: collectionError } = await supabase
      .from("collections")
      .insert({
        tenant_id: PLATFORM_TENANT_ID,
        type,
        name,
        slug,
        framing_copy: framingCopy,
        is_active: true,
      })
      .select("id, name, slug")
      .single();
    if (collectionError) throw collectionError;

    // ── 3. Ensure a published product per design ──
    const results: { designId: string; productId: string; created: boolean }[] = [];

    for (const d of designs as any[]) {
      // Already published via an earlier design_publication?
      const { data: pub } = await supabase
        .from("design_publications")
        .select("id, product_variant_id")
        .eq("design_id", d.id)
        .eq("status", "published")
        .limit(1)
        .maybeSingle();

      let productId: string | null = null;
      if (pub?.product_variant_id) {
        const { data: variantRow } = await supabase
          .from("product_variants")
          .select("product_id")
          .eq("id", pub.product_variant_id)
          .single();
        productId = variantRow?.product_id ?? null;
      }
      let created = false;

      if (!productId) {
        const cp = {
          category_id: d.catalog_category_id,
          name: d.catalog_product_name,
        };
        const productSlugBase = slugifyCollectionName(d.name) || `design-${d.id.slice(0, 8)}`;
        let productSlug = productSlugBase;
        const { data: slugTaken } = await supabase
          .from("products")
          .select("id")
          .eq("slug", productSlug)
          .limit(1);
        if (slugTaken?.length) productSlug = `${productSlugBase}-${d.id.slice(0, 8)}`;

        const { data: product, error: productError } = await supabase
          .from("products")
          .insert({
            tenant_id: PLATFORM_TENANT_ID,
            category_id: cp?.category_id ?? null,
            name: d.name,
            slug: productSlug,
            description: cp?.name
              ? `Designed in the UnSaid studio on ${cp.name}.`
              : null,
            status: "published",
          })
          .select("id")
          .single();
        if (productError) throw productError;
        productId = product.id;
        created = true;

        // Minimal variant row so the product is purchasable structure-wise.
        const { data: variant, error: variantError } = await supabase
          .from("product_variants")
          .insert({
            tenant_id: PLATFORM_TENANT_ID,
            product_id: productId!,
            sku: `UNSAID-${productId!.slice(0, 8).toUpperCase()}`,
            is_active: true,
          })
          .select("id")
          .single();
        if (variantError) throw variantError;

        const { error: pubError } = await supabase
          .from("design_publications")
          .insert({
            tenant_id: PLATFORM_TENANT_ID,
            design_id: d.id,
            product_variant_id: variant.id,
            collection_id: collection.id,
            status: "published",
            published_at: new Date().toISOString(),
          });
        if (pubError) throw pubError;
      } else {
        // Product exists — make sure it's published and linked.
        await supabase
          .from("products")
          .update({ status: "published" })
          .eq("id", productId);
      }

      // ── 4. Link product → collection (idempotent) ──
      const { data: linkExists } = await supabase
        .from("product_collections")
        .select("product_id")
        .eq("product_id", productId)
        .eq("collection_id", collection.id)
        .limit(1);
      if (!linkExists?.length) {
        const { error: linkError } = await supabase
          .from("product_collections")
          .insert({
            product_id: productId,
            tenant_id: PLATFORM_TENANT_ID,
            collection_id: collection.id,
          });
        if (linkError) throw linkError;
      }

      results.push({ designId: d.id, productId: productId!, created });
    }

    return NextResponse.json({
      ok: true,
      collection,
      items: results,
      supplierCount: supplierIds.size,
      multiSupplier: supplierIds.size > 1,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to publish collection" },
      { status: 500 },
    );
  }
}
