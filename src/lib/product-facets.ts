/**
 * Taxonomy facets for shop filtering.
 *
 * Every product carries taxonomy membership in public.product_taxonomy_links
 * (path = static-taxonomy slug chain). The shop's facet panel needs those
 * memberships grouped the way a gift shopper thinks:
 *   collections-and-occasions/collections/<leaf>    -> "Collection"
 *   collections-and-occasions/unsaid-holidays/<leaf> -> "Occasion"
 *   collections-and-occasions/relationships/<leaf>   -> "Relationship"
 *   any other root tree                              -> "Product type"
 *     (label = the leaf node's display name)
 *
 * Labels resolve against the static taxonomy's display names; a slug with
 * no static node falls back to a title-cased slug. Defensive like the rest
 * of the catalog layer: any failure reads as "no facets".
 */
import { createServerClient } from "./supabase";
import { flattenTaxonomy } from "./taxonomy";

export type ProductFacet = { group: string; label: string };

export const FACET_GROUP_ORDER = [
  "Product type",
  "Occasion",
  "Relationship",
  "Collection",
] as const;

const nameBySlug = new Map<string, string>();
for (const f of flattenTaxonomy()) {
  const slug = f.path[f.path.length - 1];
  if (slug && !nameBySlug.has(slug)) {
    nameBySlug.set(slug, f.names[f.names.length - 1]);
  }
}

function titleize(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function facetForPath(path: string): ProductFacet | null {
  const segs = path.split("/").filter(Boolean);
  if (!segs.length) return null;
  if (segs[0] === "collections-and-occasions") {
    const leaf = segs[2];
    if (!leaf) return null;
    const group =
      segs[1] === "unsaid-holidays"
        ? "Occasion"
        : segs[1] === "relationships"
          ? "Relationship"
          : segs[1] === "collections"
            ? "Collection"
            : null;
    if (!group) return null;
    return { group, label: nameBySlug.get(leaf) ?? titleize(leaf) };
  }
  const leaf = segs[segs.length - 1];
  return { group: "Product type", label: nameBySlug.get(leaf) ?? titleize(leaf) };
}

/** Facets per product id, from product_taxonomy_links. */
export async function fetchProductFacets(
  ids: string[],
): Promise<Map<string, ProductFacet[]>> {
  const out = new Map<string, ProductFacet[]>();
  if (!ids.length) return out;
  try {
    const supabase = createServerClient();
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data, error } = await supabase
        .from("product_taxonomy_links")
        .select("product_id, path")
        .in("product_id", chunk);
      if (error || !data) continue;
      for (const row of data as { product_id: string; path: string }[]) {
        const facet = facetForPath(row.path);
        if (!facet) continue;
        const list = out.get(row.product_id) ?? [];
        if (!list.some((f) => f.group === facet.group && f.label === facet.label)) {
          list.push(facet);
          out.set(row.product_id, list);
        }
      }
    }
  } catch {
    return out;
  }
  return out;
}
