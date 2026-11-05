import type { SupplierProduct } from "@/lib/supabase";

/**
 * MarketplaceCardData — the card-ready view of a supplier product.
 * (Originally imported from @/components/marketplace-card; that
 * component was removed during the portal simplification, but this
 * mapper is kept as a pure-data helper so the type is defined inline
 * here rather than dropped.)
 */
export type MarketplaceCardData = {
  id: string;
  name: string;
  brandName: string;
  image: string;
  images: string[];
  price: number;
  supplierCost: number | null;
  color: string;
  colors: string[];
  sizes: string[];
  variantCount: number;
  desc: string;
};

export const RETAIL_MARKUP = 1.4; // supplier cost × 1.4 = retail price
export const PER_PAGE = 24;

/**
 * Build the card-ready view of a supplier product from its row + the batched
 * pricing entry. `price` is the retail price (supplier cost × 1.4); the
 * original supplier cost is kept for the "list" display in the modal.
 */
export function toCardData(
  product: SupplierProduct,
  pricing:
    | { minPrice: number | null; variantCount: number; sizes: string[]; colors: string[] }
    | undefined,
): MarketplaceCardData {
  const supplierCost = pricing?.minPrice ?? null;
  const retailPrice =
    supplierCost != null && supplierCost > 0
      ? Math.round(supplierCost * RETAIL_MARKUP * 100) / 100
      : 0; // 0 → card shows "—" (no price yet)
  const images =
    product.images && product.images.length > 0
      ? product.images
      : product.image_url
        ? [product.image_url]
        : [];
  const colors = pricing?.colors ?? [];
  const color = colors[0] ?? "Multiple options";
  const variantCount =
    pricing?.variantCount && pricing.variantCount > 0
      ? pricing.variantCount
      : (product.variant_count ?? 0);
  const sizes = (pricing?.sizes ?? []).slice(0, 12);
  const brandName = product.brand_name ?? "UnSaid Edit";

  return {
    id: product.id,
    name: product.name,
    brandName,
    image: product.image_url ?? images[0] ?? "",
    images,
    price: retailPrice,
    supplierCost,
    color,
    colors,
    sizes,
    variantCount,
    desc: `An everyday piece from ${brandName} — ${variantCount} ${
      variantCount === 1 ? "variant" : "variants"
    } available across sizes and colors.`,
  };
}
