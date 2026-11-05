import { createServerClient, fetchMinPricesBatch } from "@/lib/supabase";
import { fetchProductFacets } from "@/lib/product-facets";
import type { CatalogProduct } from "@/components/catalog-card";

/**
 * Products of a curated DB collection (the `collections` +
 * `product_collections` tables), shaped for ShopApp. Returns null when
 * no collection row exists for the slug. Shared by /collections/[slug]
 * and the /relationships/[slug] fallback: relationship pages that are
 * not taxonomy children (a-little-encouragement, i-see-you,
 * thank-you-for-showing-up, ride-or-die) live as DB collections.
 *
 * Membership ids reference the canonical `products` table (the FK on
 * product_collections points there) — the owner's own published line.
 * Their cards resolve price from product_variants and imagery from
 * design_publications mockups (variant -> publication). Ids that also
 * exist in the supplier catalog keep the catalog card (price/image
 * from the catalog side).
 */
export async function fetchDbCollectionProducts(
  slug: string,
): Promise<{ name: string; products: CatalogProduct[]; total: number } | null> {
  const sb = createServerClient();
  const { data: col } = await sb
    .from("collections")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!col) return null;

  const { data: links } = await sb
    .from("product_collections")
    .select("product_id")
    .eq("collection_id", col.id);
  const ids = [...new Set((links ?? []).map((l) => String(l.product_id)))];
  if (!ids.length) return { name: col.name as string, products: [], total: 0 };

  const byId = new Map<string, CatalogProduct>();

  // Supplier-catalog members (price/image from the catalog side).
  const { data: rows } = await sb
    .from("supplier_catalog_products")
    .select("id, name, image_url, images, brand_name, variant_count")
    .eq("is_hidden", false)
    .in("id", ids);
  const catalogIds = (rows ?? []).map((p) => p.id as string);
  if (catalogIds.length) {
    const [pricing, facetMap] = await Promise.all([
      fetchMinPricesBatch(catalogIds),
      fetchProductFacets(catalogIds),
    ]);
    for (const p of rows ?? []) {
      const pr = pricing.get(p.id as string);
      byId.set(p.id as string, {
        id: p.id as string,
        name: p.name as string,
        brand: p.brand_name as string | null,
        image: (p.image_url as string | null) || (p.images as string[] | null)?.[0] || null,
        images: p.images as string[] | null,
        variantCount: pr?.variantCount ?? (p.variant_count as number | null) ?? 0,
        minPrice: pr?.minPrice ?? null,
        sizes: pr?.sizes ?? [],
        colors: pr?.colors ?? [],
        facets: facetMap.get(p.id as string) ?? [],
      });
    }
  }

  // Canonical-products members (the owner's published line).
  const ownIds = ids.filter((id) => !byId.has(id));
  if (ownIds.length) {
    const { data: prods } = await sb
      .from("products")
      .select("id, name, brand")
      .in("id", ownIds);
    const { data: vars } = await sb
      .from("product_variants")
      .select("id, product_id, price")
      .in("product_id", ownIds);
    const minPrice = new Map<string, number>();
    const varCount = new Map<string, number>();
    const varProduct = new Map<string, string>();
    for (const v of vars ?? []) {
      const pid = v.product_id as string;
      varProduct.set(v.id as string, pid);
      varCount.set(pid, (varCount.get(pid) ?? 0) + 1);
      const price = Number(v.price);
      if (!Number.isNaN(price) && (minPrice.get(pid) === undefined || price < minPrice.get(pid)!)) {
        minPrice.set(pid, price);
      }
    }
    const mockup = new Map<string, string>();
    const varIds = (vars ?? []).map((v) => v.id as string);
    if (varIds.length) {
      const { data: pubs } = await sb
        .from("design_publications")
        .select("product_variant_id, mockup_url, status")
        .in("product_variant_id", varIds);
      for (const pub of pubs ?? []) {
        const pid = varProduct.get(pub.product_variant_id as string);
        const url = pub.mockup_url as string | null;
        if (pid && url && (pub.status === "published" || !mockup.has(pid))) {
          mockup.set(pid, url);
        }
      }
    }
    for (const p of prods ?? []) {
      const pid = p.id as string;
      const img = mockup.get(pid) ?? null;
      byId.set(pid, {
        id: pid,
        name: p.name as string,
        brand: (p.brand as string | null) ?? null,
        image: img,
        images: img ? [img] : null,
        variantCount: varCount.get(pid) ?? 0,
        minPrice: minPrice.get(pid) ?? null,
        sizes: [],
        colors: [],
      });
    }
  }

  const products = ids.map((id) => byId.get(id)).filter((p): p is CatalogProduct => !!p);
  return { name: col.name as string, products, total: products.length };
}

/** The collection's display name for a slug, without fetching its
 *  products — used for page metadata on collection/relationship pages. */
export async function fetchCollectionName(slug: string): Promise<string | null> {
  const sb = createServerClient();
  const { data } = await sb
    .from("collections")
    .select("name")
    .eq("slug", slug)
    .maybeSingle();
  return (data?.name as string | undefined) ?? null;
}
