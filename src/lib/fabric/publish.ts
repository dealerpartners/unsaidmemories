import { getTenantId } from "@/lib/tenant";
/**
 * Fabric studio — publish pipeline (server-side).
 *
 * publishDesign: the explicit admin action that turns a reviewed design
 * into a real storefront product:
 *   products row (title/slug/description/category/price from the design)
 *   product_variants rows mapped 1:1 from the supplier catalog variants
 *     (SKU carries the supplier's external variant id, so fulfillment
 *     routing can find the provider variant again)
 *   design_publications rows linking design → each variant (this is the
 *     link order_items.design_publication_id resolves through)
 *   designs.published_product_id + status='published'
 *   provider_jobs audit row for the whole operation
 *   supplier_catalog_products/supplier_catalog_variants MIRROR rows
 *     (id = the storefront product id) — this is what makes publishing
 *     create the product page by default: the PDP and the shop grid
 *     read the supplier catalog, so the mirror IS the product page.
 *     Unpublishing deletes the mirror (it is a pure projection).
 *
 * Idempotent: re-publishing a design updates its existing product and
 * variants instead of creating duplicates.
 *
 * publishCollection: creates/uses a collections row, publishes every
 * member design through publishDesign, links products via
 * product_collections, and enforces Kim's single-supplier rule unless
 * forceMultiSupplier is set.
 */

import { randomUUID } from "node:crypto";
import type { createServerClient } from "@/lib/supabase";
import { slugifyCollectionName } from "@/lib/collection-builder";

type Db = ReturnType<typeof createServerClient>;

export const PLATFORM_TENANT_ID = getTenantId();

export interface PublishResult {
  productId: string;
  slug: string;
  url: string;
  pdpUrl: string;
  variantCount: number;
  created: boolean;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "product"
  );
}

async function uniqueProductSlug(db: Db, base: string, exceptId?: string): Promise<string> {
  let slug = base;
  for (let i = 0; i < 5; i++) {
    const { data } = await db.from("products").select("id").eq("slug", slug).limit(1);
    const taken = data?.length && data[0].id !== exceptId;
    if (!taken) return slug;
    slug = `${base}-${Date.now().toString(36)}${i || ""}`;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export async function publishDesign(
  db: Db,
  designId: string,
): Promise<PublishResult> {
  const { data: design, error: designError } = await db
    .from("designs")
    .select("*")
    .eq("id", designId)
    .single();
  if (designError || !design) throw new Error("Design not found");
  if (!design.supplier_catalog_product_id) {
    throw new Error("Design has no supplier catalog product — cannot publish.");
  }
  const title: string = (design.product_title || design.name || "").trim();
  if (!title) throw new Error("Design has no product title — cannot publish.");
  const price = Number(design.retail_price ?? 0);
  if (!price || price <= 0) {
    throw new Error("Design has no retail price — cannot publish.");
  }

  // No PostgREST embed of suppliers here: supplier_catalog_products
  // has multiple FKs to suppliers, so embedding is ambiguous (PGRST201).
  const { data: catalog } = await db
    .from("supplier_catalog_products")
    .select("id, name, supplier_id, category_id, image_url")
    .eq("id", design.supplier_catalog_product_id)
    .single();
  let supplierSlug = "supplier";
  if (catalog?.supplier_id) {
    const { data: supplier } = await db
      .from("suppliers")
      .select("slug")
      .eq("id", catalog.supplier_id)
      .single();
    if (supplier?.slug) supplierSlug = supplier.slug;
  }

  const { data: catalogVariants } = await db
    .from("supplier_catalog_variants")
    .select("id, external_id, size, color, price_snapshot, print_specs")
    .eq("supplier_catalog_product_id", design.supplier_catalog_product_id)
    .order("price_snapshot", { ascending: true })
    .limit(2000);

  // A silent truncation at this fetch once published a tee with
  // entire colors missing (White among them). If a catalog product
  // ever outgrows the fetch bound, fail the publish loudly instead
  // of shipping a partial variant set.
  if ((catalogVariants ?? []).length >= 2000) {
    throw new Error(
      "This product has more variants than one publish can carry (2000). It needs a split publish — nothing was published.",
    );
  }

  // Variant SKUs are unique TENANT-wide (product_variants_tenant_id_
  // sku_key), and the storefront may already carry this catalog
  // product (e.g. imported earlier). Resolve existing variants by SKU
  // up front: publish reuses those rows (and adopts their product)
  // instead of colliding with the unique key.
  const sourceSkus = (catalogVariants ?? [])
    .map((cv: any) =>
      cv.external_id ? `${supplierSlug.toUpperCase()}-${cv.external_id}` : null,
    )
    .filter(Boolean) as string[];
  const { data: tenantVariants } = sourceSkus.length
    ? await db
        .from("product_variants")
        .select("id, sku, product_id")
        .in("sku", [...new Set(sourceSkus)])
    : { data: [] };
  const tenantBySku = new Map(
    (tenantVariants ?? []).map((v: any) => [v.sku, v]),
  );

  const { data: job } = await db
    .from("provider_jobs")
    .insert({
      tenant_id: PLATFORM_TENANT_ID,
      design_id: designId,
      provider: supplierSlug,
      job_type: "publish",
      status: "running",
      request_payload: { title, price, catalogProductId: design.supplier_catalog_product_id },
    })
    .select("id")
    .single();

  // Declared outside the try so the catch can roll back a product
  // this attempt created (see the catch block).
  let productId: string | null = design.published_product_id ?? null;
  let created = false;

  try {
    const categoryId: string | null =
      design.category_id ?? catalog?.category_id ?? null;
    const description: string | null =
      design.description ??
      `Designed in the UnSaid studio on ${catalog?.name ?? "a premium base product"}.`;

    // Retry convergence: a previous attempt may have created the
    // product + variants and then failed before designs.
    // published_product_id was set. Adopt that product via this
    // design's existing publications instead of creating a duplicate
    // (whose variant SKUs would collide tenant-wide).
    if (!productId) {
      const { data: pubs } = await db
        .from("design_publications")
        .select("product_variant_id")
        .eq("design_id", designId)
        .limit(1);
      const vid = (pubs as any)?.[0]?.product_variant_id;
      if (vid) {
        const { data: vrow } = await db
          .from("product_variants")
          .select("product_id")
          .eq("id", vid)
          .single();
        if (vrow?.product_id) productId = vrow.product_id;
      }
    }
    if (!productId) {
      // Orphaned by an attempt that died before publications were
      // written: the product carries this design's base slug.
      const { data: bySlug } = await db
        .from("products")
        .select("id")
        .eq("slug", slugify(title))
        .limit(1);
      if ((bySlug as any)?.length) productId = (bySlug as any)[0].id;
    }
    if (!productId && tenantBySku.size) {
      // The storefront already carries this catalog product under
      // its supplier SKUs — that product is this design's product.
      productId = (tenantBySku.values().next().value as any)?.product_id ?? null;
    }

    if (productId) {
      const { error } = await db
        .from("products")
        .update({
          name: title,
          description,
          category_id: categoryId,
          status: "published",
        })
        .eq("id", productId);
      if (error) throw error;
    } else {
      const slug = await uniqueProductSlug(db, slugify(title));
      const { data: product, error } = await db
        .from("products")
        .insert({
          id: randomUUID(),
          tenant_id: PLATFORM_TENANT_ID,
          category_id: categoryId,
          name: title,
          slug,
          description,
          status: "published",
        })
        .select("id, slug")
        .single();
      if (error) throw error;
      productId = product.id;
      created = true;
    }

    let { data: productRow } = await db
      .from("products")
      .select("slug")
      .eq("id", productId!)
      .single();

    // Variants: map supplier catalog variants 1:1. SKU carries the
    // supplier prefix + external variant id so the fulfillment router
    // can recover the provider variant from the storefront variant.
    const { data: existingVariants } = await db
      .from("product_variants")
      .select("id, sku")
      .eq("product_id", productId!);
    const bySku = new Map((existingVariants ?? []).map((v: any) => [v.sku, v.id]));
    // Tenant-wide SKU matches that belong to the adopted product are
    // the same rows; matches on any other product would collide, so
    // surface them as reuse only when they are this product's.
    for (const [sku, v] of tenantBySku) {
      if ((v as any).product_id === productId && !bySku.has(sku)) {
        bySku.set(sku, (v as any).id);
      }
    }

    const variantIds: string[] = [];
    const mirrorVariants: { sku: string; size: string | null; color: string | null; print_specs: unknown }[] = [];
    // Variants reused from another product (tenant SKU collision) —
    // if every variant resolves there, that product is adopted below.
    const foreignVariantProducts = new Map<string, string>();
    const sourceVariants =
      catalogVariants && catalogVariants.length
        ? catalogVariants
        : [{ external_id: null, size: null, color: null, price_snapshot: null }];

    for (const cv of sourceVariants as any[]) {
      const sku = cv.external_id
        ? `${supplierSlug.toUpperCase()}-${cv.external_id}`
        : `UNSAID-${productId!.slice(0, 8).toUpperCase()}`;
      mirrorVariants.push({ sku, size: cv.size ?? null, color: cv.color ?? null, print_specs: (cv as any).print_specs ?? {} });
      const existingId = bySku.get(sku);
      if (existingId) {
        await db
          .from("product_variants")
          .update({ price, size: cv.size, color: cv.color, is_active: true })
          .eq("id", existingId);
        if (!variantIds.includes(existingId)) variantIds.push(existingId);
      } else {
        const { data: v, error: vErr } = await db
          .from("product_variants")
          .insert({
            id: randomUUID(),
            tenant_id: PLATFORM_TENANT_ID,
            product_id: productId,
            sku,
            size: cv.size,
            color: cv.color,
            price,
            is_active: true,
          })
          .select("id")
          .single();
        if (vErr) {
          // Tenant-wide SKU already exists on another product (the
          // storefront carried this catalog product before the
          // studio published it). Reuse that variant row for the
          // publication link instead of failing the whole publish.
          const { data: tv } = await db
            .from("product_variants")
            .select("id, product_id")
            .eq("sku", sku)
            .single();
          if (!tv) throw vErr;
          bySku.set(sku, tv.id);
          foreignVariantProducts.set(tv.id, tv.product_id);
          if (!variantIds.includes(tv.id)) variantIds.push(tv.id);
          continue;
        }
        // The staged catalog can contain duplicate external_ids for
        // one product; track this run's inserts so a repeated SKU
        // reuses the row instead of violating the tenant SKU key.
        bySku.set(sku, v.id);
        variantIds.push(v.id);
      }
    }

    // If every variant actually lives on a pre-existing product,
    // designs.published_product_id must point at THAT product — the
    // one customers can buy — not at an empty shell created here or
    // a slug-adopted product that carries none of the variants.
    // A shell created by this attempt is removed; an adopted
    // pre-existing product is left in place, just not referenced.
    if (foreignVariantProducts.size) {
      const ownCount = variantIds.filter(
        (id) => !foreignVariantProducts.has(id),
      ).length;
      if (ownCount === 0) {
        const adoptId = foreignVariantProducts.values().next().value as string;
        if (created) {
          await db.from("products").delete().eq("id", productId!);
        }
        productId = adoptId;
        created = false;
        await db
          .from("products")
          .update({ status: "published" })
          .eq("id", productId);
        const { data: adoptedRow } = await db
          .from("products")
          .select("slug")
          .eq("id", productId)
          .single();
        productRow = adoptedRow;
      }
    }

    // Publications: one row per variant, replacing this design's prior
    // publication rows so the design → variant link set stays exact.
    await db.from("design_publications").delete().eq("design_id", designId);
    const now = new Date().toISOString();
    const pubRows = variantIds.map((variantId) => ({
      id: randomUUID(),
      tenant_id: PLATFORM_TENANT_ID,
      design_id: designId,
      product_variant_id: variantId,
      collection_id: design.collection_id ?? null,
      status: "published",
      published_at: now,
    }));
    if (pubRows.length) {
      const { error: pubErr } = await db.from("design_publications").insert(pubRows);
      if (pubErr) throw pubErr;
    }

    await db
      .from("designs")
      .update({ status: "published", published_product_id: productId })
      .eq("id", designId);

    // ── Product-page mirror ──────────────────────────────────────
    // The PDP (/product/[id]) and the shop grid read
    // supplier_catalog_products, NOT the storefront products table.
    // Publishing therefore also upserts a catalog mirror keyed by the
    // SAME id as the storefront product, so the product page exists
    // the moment the product card does. Gallery prefers the design's
    // own mockup (public design-files bucket) and falls back to the
    // source catalog product's image.
    let pdpMirrored = false;
    if (catalog?.supplier_id) {
      const supabaseUrl =
        process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
      // designs.mockup_path stores a `bucket/path` ref (storage.ts) — it
      // already carries the bucket name. Strip it before re-prefixing so
      // the public URL never doubles the segment (the doubled form 400s
      // from Storage and renders as a broken storefront image).
      const mockupRef = String((design as any).mockup_path).replace(/^design-files\//, "");
      const mockupUrl = (design as any).mockup_path
        ? `${supabaseUrl}/storage/v1/object/public/design-files/${mockupRef}`
        : null;
      const imageUrl = mockupUrl || (catalog as any).image_url || null;
      const { error: mirrorErr } = await db
        .from("supplier_catalog_products")
        .upsert(
          {
            id: productId,
            supplier_id: catalog.supplier_id,
            external_id: `studio-${designId}`,
            external_id_type: "studio",
            name: title,
            brand_name: "UnSaid",
            category_id: categoryId,
            image_url: imageUrl,
            images: imageUrl ? [imageUrl] : [],
            slug: productRow?.slug ?? null,
            variant_count: mirrorVariants.length,
            is_hidden: false,
          },
          { onConflict: "id" },
        );
      if (mirrorErr) throw mirrorErr;
      // Refresh this product's mirror variants with STABLE ids, then
      // upsert on the (supplier_id, external_id) key — the same
      // tenant-SKU adoption semantics as product_variants above.
      // Orders and Rule C mappings reference mirror variants by id:
      // minting fresh ids (or blanket-deleting the set) violates
      // their foreign keys the moment a design has sold or been
      // mapped — that is what blocked republishing the seed designs
      // on 2026-10-30. Existing rows are adopted by SKU; only
      // genuinely new SKUs mint an id.
      const { data: existingMirror } = await db
        .from("supplier_catalog_variants")
        .select("id, external_id")
        .eq("supplier_catalog_product_id", productId!);
      const existingBySku = new Map<string, string>(
        (existingMirror ?? []).map((v: any) => [v.external_id, v.id] as [string, string]),
      );
      const newSkus = new Set(mirrorVariants.map((mv) => mv.sku));
      // Retire SKUs that left the source set — only when nothing
      // references them. A referenced row is order history; it stays.
      const leftovers = (existingMirror ?? []).filter((v: any) => !newSkus.has(v.external_id));
      if (leftovers.length) {
        const leftoverIds = leftovers.map((v: any) => v.id);
        const [{ data: mappedRefs }, { data: orderedRefs }] = await Promise.all([
          db.from("supplier_product_mappings").select("supplier_catalog_variant_id").in("supplier_catalog_variant_id", leftoverIds),
          db.from("order_items").select("supplier_catalog_variant_id").in("supplier_catalog_variant_id", leftoverIds),
        ]);
        const referenced = new Set([
          ...(mappedRefs ?? []).map((r: any) => r.supplier_catalog_variant_id),
          ...(orderedRefs ?? []).map((r: any) => r.supplier_catalog_variant_id),
        ]);
        const deletable = leftoverIds.filter((id: string) => !referenced.has(id));
        if (deletable.length) {
          await db.from("supplier_catalog_variants").delete().in("id", deletable);
        }
      }
      if (mirrorVariants.length) {
        const mirrorRows = mirrorVariants.map((mv) => ({
          id: existingBySku.get(mv.sku) ?? randomUUID(),
          supplier_id: catalog.supplier_id,
          supplier_catalog_product_id: productId,
          external_id: mv.sku,
          name: [mv.size, mv.color].filter(Boolean).join(" / ") || title,
          size: mv.size,
          color: mv.color,
          print_specs: mv.print_specs ?? {},
          price_snapshot: price,
        }));
        const { error: mvErr } = await db
          .from("supplier_catalog_variants")
          .upsert(mirrorRows, { onConflict: "supplier_id,external_id" });
        if (mvErr) throw mvErr;

        // Rule C: every published variant gets its payload mapping at
        // publish time, keyed on the MIRROR variant (the one orders
        // actually carry). The supplier SKU is the source variant's
        // external id — Gelato productUid / Prodigi sku / Printful
        // catalog variant id.
        const sourceBySku = new Map<string, any>(
          sourceVariants.map((cv: any) => [
            cv.external_id
              ? `${supplierSlug.toUpperCase()}-${cv.external_id}`
              : `UNSAID-${productId!.slice(0, 8).toUpperCase()}`,
            cv,
          ] as [string, any]),
        );
        const mappingRows = mirrorRows.map((mr) => {
          const src: any = sourceBySku.get(mr.external_id);
          return {
            tenant_id: PLATFORM_TENANT_ID,
            supplier_id: catalog.supplier_id,
            supplier_catalog_variant_id: mr.id,
            product_sku: mr.external_id,
            supplier_sku: src?.external_id ?? mr.external_id,
            print_job_config: {
              print_area_id: "front",
              placement: "front",
              catalog_variant_id: src?.external_id ?? null,
            },
          };
        });
        const { error: mapErr } = await db
          .from("supplier_product_mappings")
          .upsert(mappingRows, { onConflict: "tenant_id,product_sku" });
        if (mapErr) throw mapErr;
      }
      pdpMirrored = true;
    }

    if (job) {
      await db
        .from("provider_jobs")
        .update({
          status: "succeeded",
          product_id: productId,
          response_payload: {
            productId,
            slug: productRow?.slug,
            variantCount: variantIds.length,
            created,
            pdpUrl: `/product/${productId}`,
            pdpMirrored,
          },
          finished_at: now,
        })
        .eq("id", job.id);
    }

    return {
      productId: productId!,
      slug: productRow?.slug ?? "",
      // The shopper PDP route is /product/[id] — there is no
      // /products/[slug] route, so the old slug form 404'd wherever
      // the studio showed its "Live at" link (found 2026-10-30).
      url: `/product/${productId}`,
      pdpUrl: `/product/${productId}`,
      variantCount: variantIds.length,
      created,
    };
  } catch (e) {
    // Roll back a product this attempt created so a retry starts
    // clean: an orphan product would hold this design's variant SKUs
    // hostage (tenant-wide unique key) and every retry would fail
    // with a duplicate-SKU error. Only the attempt's own product is
    // removed — an adopted/pre-existing product is never touched.
    if (created && productId) {
      const { data: ownVariants } = await db
        .from("supplier_catalog_variants")
        .select("id")
        .eq("supplier_catalog_product_id", productId);
      if (ownVariants?.length) {
        await db
          .from("supplier_product_mappings")
          .delete()
          .in("supplier_catalog_variant_id", ownVariants.map((v: any) => v.id));
      }
      await db.from("supplier_catalog_variants").delete().eq("supplier_catalog_product_id", productId);
      await db.from("supplier_catalog_products").delete().eq("id", productId);
      await db.from("design_publications").delete().eq("design_id", designId);
      await db.from("product_variants").delete().eq("product_id", productId);
      await db.from("products").delete().eq("id", productId);
    }
    await db
      .from("designs")
      .update({ status: "publish_failed" })
      .eq("id", designId);
    if (job) {
      await db
        .from("provider_jobs")
        .update({
          status: "failed",
          error_message: e instanceof Error ? e.message : "Publish failed",
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
    throw e;
  }
}

export async function unpublishDesign(db: Db, designId: string): Promise<void> {
  const { data: design } = await db
    .from("designs")
    .select("published_product_id")
    .eq("id", designId)
    .single();
  if (design?.published_product_id) {
    await db
      .from("products")
      .update({ status: "draft" })
      .eq("id", design.published_product_id);
    // The catalog mirror is never deleted once it exists: orders
    // and Rule C mappings reference its variants by id, and deleting
    // them violates those keys (the deletes used to fail silently
    // here, leaving "unpublished" products buyable). Unpublishing
    // HIDES the mirror instead — PDP, PLP, search and the store API
    // all honor is_hidden; republishing un-hides it.
    await db
      .from("supplier_catalog_products")
      .update({ is_hidden: true })
      .eq("id", design.published_product_id);
  }
  await db
    .from("design_publications")
    .update({ status: "draft" })
    .eq("design_id", designId);
  await db
    .from("designs")
    .update({ status: "ready_to_publish" })
    .eq("id", designId);
}

export interface CollectionPublishResult {
  collection: { id: string; name: string; slug: string };
  items: { designId: string; productId: string; created: boolean }[];
  supplierCount: number;
  multiSupplier: boolean;
}

export class MultiSupplierConflict extends Error {
  supplierCount: number;
  constructor(count: number) {
    super(
      `These designs span ${count} suppliers — customers would get separate shipments. Pass forceMultiSupplier:true to publish anyway, or swap items for same-supplier alternatives.`,
    );
    this.supplierCount = count;
  }
}

export async function publishCollection(
  db: Db,
  input: {
    collectionId?: string;
    name: string;
    framing_copy?: string | null;
    type?: string;
    designIds: string[];
    forceMultiSupplier?: boolean;
    ownerId?: string | null;
  },
): Promise<CollectionPublishResult> {
  const { designIds } = input;
  if (!designIds.length) throw new Error("Select at least one design");

  const { data: designs, error } = await db
    .from("designs")
    .select("id, name, supplier_catalog_product_id")
    .in("id", designIds);
  if (error) throw error;
  if (!designs?.length) throw new Error("No designs found");

  // Supplier per design via separate lookups (PostgREST embeds of
  // suppliers under supplier_catalog_products are ambiguous, PGRST201).
  const catalogIds = [...new Set(designs.map((d) => d.supplier_catalog_product_id).filter(Boolean))];
  const { data: catalogRows } = catalogIds.length
    ? await db
        .from("supplier_catalog_products")
        .select("id, supplier_id")
        .in("id", catalogIds)
    : { data: [] };
  const supplierByCatalog = new Map(
    (catalogRows ?? []).map((c) => [c.id, c.supplier_id]),
  );
  const supplierIds = new Set(
    designs
      .map((d) => supplierByCatalog.get(d.supplier_catalog_product_id))
      .filter(Boolean),
  );
  if (supplierIds.size > 1 && !input.forceMultiSupplier) {
    throw new MultiSupplierConflict(supplierIds.size);
  }

  // Collection row: reuse when an id is given (folder-first flow),
  // otherwise create from the name (builder flow).
  let collection: { id: string; name: string; slug: string } | null = null;
  if (input.collectionId) {
    const { data } = await db
      .from("collections")
      .select("id, name, slug")
      .eq("id", input.collectionId)
      .single();
    if (!data) throw new Error("Collection not found");
    collection = data;
  } else {
    let slug = slugifyCollectionName(input.name);
    const { data: existing } = await db
      .from("collections")
      .select("id")
      .eq("slug", slug)
      .limit(1);
    if (existing?.length) slug = `${slug}-${Date.now().toString(36)}`;
    const { data, error: cErr } = await db
      .from("collections")
      .insert({
        tenant_id: PLATFORM_TENANT_ID,
        type: input.type ?? "theme",
        name: input.name,
        slug,
        framing_copy: input.framing_copy ?? null,
        is_active: true,
      })
      .select("id, name, slug")
      .single();
    if (cErr) throw cErr;
    collection = data;
  }

  const items: CollectionPublishResult["items"] = [];
  for (const d of designs as any[]) {
    const result = await publishDesign(db, d.id);
    await db
      .from("designs")
      .update({ collection_id: collection!.id })
      .eq("id", d.id);

    const { data: linkExists } = await db
      .from("product_collections")
      .select("product_id")
      .eq("product_id", result.productId)
      .eq("collection_id", collection!.id)
      .limit(1);
    if (!linkExists?.length) {
      const { error: linkError } = await db.from("product_collections").insert({
        product_id: result.productId,
        tenant_id: PLATFORM_TENANT_ID,
        collection_id: collection!.id,
      });
      if (linkError) throw linkError;
    }
    items.push({
      designId: d.id,
      productId: result.productId,
      created: result.created,
    });
  }

  return {
    collection: collection!,
    items,
    supplierCount: supplierIds.size,
    multiSupplier: supplierIds.size > 1,
  };
}
