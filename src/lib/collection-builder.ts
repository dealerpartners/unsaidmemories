/**
 * Collection Builder — shared types and supplier-conflict logic.
 *
 * Kim's rule: "Don't want a Gelato mug and a Printful shirt in the same
 * collection." Every design resolves to its supplier via
 * designs.supplier_catalog_product_id → supplier_catalog_products.supplier_id
 * → suppliers. The builder surfaces conflicts and recommends same-supplier
 * alternatives so collections ship together.
 */

export type BuilderDesign = {
  id: string;
  name: string;
  status: string;
  supplier_catalog_product_id: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_slug: string | null;
  catalog_product_name: string | null;
  catalog_category_id: string | null;
  image_url: string | null;
  updated_at: string;
};

export type SupplierGroup = {
  supplier_id: string;
  supplier_name: string;
  supplier_slug: string;
  design_ids: string[];
  design_names: string[];
};

export type ConflictReport = {
  /** true when selected designs span more than one supplier */
  hasConflict: boolean;
  supplierCount: number;
  groups: SupplierGroup[];
  /** designs with no resolvable supplier (no catalog product linked) */
  unknownSupplier: { id: string; name: string }[];
};

export type SameSupplierRecommendation = {
  id: string;
  name: string;
  supplier_id: string;
  supplier_name: string;
  category_id: string | null;
  category_name: string | null;
  image_url: string | null;
  variant_count: number | null;
};

/**
 * Build a conflict report from designs that already carry resolved
 * supplier info (see BuilderDesign). Pure function — safe to use
 * client- or server-side.
 */
export function buildConflictReport(designs: BuilderDesign[]): ConflictReport {
  const groups = new Map<string, SupplierGroup>();
  const unknownSupplier: { id: string; name: string }[] = [];

  for (const d of designs) {
    if (!d.supplier_id) {
      unknownSupplier.push({ id: d.id, name: d.name });
      continue;
    }
    let g = groups.get(d.supplier_id);
    if (!g) {
      g = {
        supplier_id: d.supplier_id,
        supplier_name: d.supplier_name ?? "Unknown supplier",
        supplier_slug: d.supplier_slug ?? "",
        design_ids: [],
        design_names: [],
      };
      groups.set(d.supplier_id, g);
    }
    g.design_ids.push(d.id);
    g.design_names.push(d.name);
  }

  const groupList = [...groups.values()];
  return {
    hasConflict: groupList.length > 1,
    supplierCount: groupList.length,
    groups: groupList,
    unknownSupplier,
  };
}

/** Slugify a collection name for the collections.slug column. */
export function slugifyCollectionName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}
