import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Display label for a cart or order line. One rule set, shared by the
 * order-status endpoint (and mirroring /api/cart's detail enrichment):
 *   - supplier catalog line → the catalog variant's name
 *   - product variant line  → "Product name · size · color" (SKU fallback)
 *   - anything else         → "Item"
 * Lines are returned as new objects with `label` added; inputs are not
 * mutated.
 */
export type LabelableLine = {
  product_variant_id?: string | null;
  supplier_catalog_variant_id?: string | null;
  [key: string]: unknown;
};

export async function resolveItemLabels<T extends LabelableLine>(
  sb: SupabaseClient,
  rows: T[]
): Promise<(T & { label: string })[]> {
  const out: (T & { label: string })[] = [];
  for (const item of rows) {
    let label: string | null = null;
    if (item.product_variant_id) {
      const { data: v } = await sb
        .from("product_variants")
        .select("sku, size, color, products(name)")
        .eq("id", item.product_variant_id)
        .maybeSingle();
      const pname = (v as any)?.products?.name ?? null;
      const productLabel =
        [pname, v?.size, v?.color].filter(Boolean).join(" · ") || v?.sku || null;
      // Prefer the product label when it carries a product name. An order
      // line can carry BOTH ids (routing writes the catalog variant onto
      // the line at payment time), and some suppliers name their catalog
      // variants with a bare size ("11.69″×16.54″") — the product name is
      // the label a customer recognizes.
      if (pname || !item.supplier_catalog_variant_id) label = productLabel;
    }
    if (!label && item.supplier_catalog_variant_id) {
      const { data: v } = await sb
        .from("supplier_catalog_variants")
        .select("name")
        .eq("id", item.supplier_catalog_variant_id)
        .maybeSingle();
      label = v?.name ?? null;
    }
    out.push({ ...item, label: label ?? "Item" });
  }
  return out;
}
