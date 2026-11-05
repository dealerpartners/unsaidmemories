/**
 * Catalog listing overrides — the owner's edits of supplier-catalog
 * listings (name, description, price, category), persisted in
 * `catalog_listing_overrides` and applied by the joined catalog read.
 *
 * Why a separate table: supplier_catalog_products is a supplier MIRROR.
 * A supplier re-sync rewrites the mirror's name/category from the feed,
 * so edits written onto the mirror row are silently erased (that is what
 * the old admin name editor did). Her edits live here instead; the sync
 * never touches this table, and the joined read (lib/supabase.ts)
 * prefers these values over the mirrored supplier values everywhere the
 * read runs — the storefront feed and the admin catalog alike.
 *
 * Every field is nullable: NULL = "keep the supplier's value". Deleting
 * the row resets the listing to the supplier values entirely.
 */
import { createServerClient, type SupplierProduct } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";

export type ListingOverride = {
  supplier_catalog_product_id: string;
  name: string | null;
  description: string | null;
  price: number | null;
  category_id: string | null;
};

const COLUMNS = "supplier_catalog_product_id, name, description, price, category_id";

function toOverride(row: any): ListingOverride {
  return {
    supplier_catalog_product_id: row.supplier_catalog_product_id,
    name: row.name ?? null,
    description: row.description ?? null,
    price: row.price != null ? Number(row.price) : null,
    category_id: row.category_id ?? null,
  };
}

/** Overrides for one set of catalog products, keyed by catalog product id. */
export async function fetchListingOverrides(
  catalogProductIds: string[],
): Promise<Map<string, ListingOverride>> {
  const out = new Map<string, ListingOverride>();
  if (!catalogProductIds.length) return out;
  const supabase = createServerClient();
  const { data } = await supabase
    .from("catalog_listing_overrides")
    .select(COLUMNS)
    .eq("tenant_id", getTenantId())
    .in("supplier_catalog_product_id", catalogProductIds);
  for (const row of data ?? []) out.set(row.supplier_catalog_product_id, toOverride(row));
  return out;
}

/** The override for a single catalog product, if the owner has edited it. */
export async function fetchListingOverride(
  catalogProductId: string,
): Promise<ListingOverride | null> {
  const map = await fetchListingOverrides([catalogProductId]);
  return map.get(catalogProductId) ?? null;
}

/**
 * Every override that MOVES a product to a different category. The table
 * only ever holds the owner's own edits, so this set stays small; the
 * joined read uses it to fix category membership (a product she moved
 * into a shelf belongs to that shelf even though the supplier mirror
 * still points at the supplier's shelf, and vice versa).
 */
export async function fetchCategoryOverrides(): Promise<ListingOverride[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("catalog_listing_overrides")
    .select(COLUMNS)
    .eq("tenant_id", getTenantId())
    .not("category_id", "is", null);
  return (data ?? []).map(toOverride);
}

/**
 * Catalog product ids whose OVERRIDE name matches a search word — so a
 * product she renamed is findable by its new name in the joined read,
 * whose SQL search runs against the mirrored supplier name.
 */
export async function fetchOverrideIdsByNameWord(
  words: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!words.length) return out;
  const supabase = createServerClient();
  await Promise.all(
    words.map(async (word) => {
      const { data } = await supabase
        .from("catalog_listing_overrides")
        .select("supplier_catalog_product_id")
        .eq("tenant_id", getTenantId())
        .ilike("name", `%${word}%`);
      if (data?.length) out.set(word, data.map((r: any) => r.supplier_catalog_product_id));
    }),
  );
  return out;
}

/**
 * Merge overrides into joined-read rows (mutates and returns the rows):
 * her name wins, her shelf (category_id) wins, and her description +
 * price ride along as `description` / `listing_price` for consumers
 * (the storefront feed prefers listing_price for the card's price).
 * The supplier's own name is preserved on `original_name` when replaced.
 */
export function applyListingOverrides<T extends SupplierProduct>(
  rows: T[],
  overrides: Map<string, ListingOverride>,
): T[] {
  for (const row of rows) {
    const o = overrides.get(row.id);
    if (!o) continue;
    if (o.name) {
      row.original_name = row.name;
      row.name = o.name;
    }
    if (o.category_id) row.category_id = o.category_id;
    row.description = o.description;
    row.listing_price = o.price;
    row.edited = true;
  }
  return rows;
}

/** Create or update the owner's edit of one listing. */
export async function upsertListingOverride(input: {
  catalogProductId: string;
  name?: string | null;
  description?: string | null;
  price?: number | null;
  categoryId?: string | null;
}): Promise<ListingOverride> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("catalog_listing_overrides")
    .upsert(
      {
        tenant_id: getTenantId(),
        supplier_catalog_product_id: input.catalogProductId,
        name: input.name ?? null,
        description: input.description ?? null,
        price: input.price ?? null,
        category_id: input.categoryId ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,supplier_catalog_product_id" },
    )
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return toOverride(data);
}

/** Reset a listing to the supplier's values (removes the owner's edit). */
export async function deleteListingOverride(catalogProductId: string): Promise<void> {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("catalog_listing_overrides")
    .delete()
    .eq("tenant_id", getTenantId())
    .eq("supplier_catalog_product_id", catalogProductId);
  if (error) throw new Error(error.message);
}
