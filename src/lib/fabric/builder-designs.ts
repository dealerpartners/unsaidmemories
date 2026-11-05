import type { createServerClient } from "@/lib/supabase";
import type { BuilderDesign } from "@/lib/collection-builder";

type Db = ReturnType<typeof createServerClient>;

/**
 * Resolve BuilderDesign rows from plain `designs` rows.
 *
 * The collection builder originally resolved suppliers through a
 * PostgREST embed (designs → supplier_catalog_products → suppliers).
 * That embed cannot work against the real schema:
 *  - designs.supplier_catalog_product_id has no FK to
 *    supplier_catalog_products ("could not find a relationship"), and
 *  - supplier_catalog_products has multiple FKs to suppliers, so the
 *    nested embed is ambiguous (PGRST201).
 * Separate keyed lookups are the only reliable path.
 */
export async function resolveBuilderDesigns(
  db: Db,
  rows: any[],
): Promise<BuilderDesign[]> {
  const catalogIds = [
    ...new Set(rows.map((d) => d.supplier_catalog_product_id).filter(Boolean)),
  ];
  const { data: catalogRows } = catalogIds.length
    ? await db
        .from("supplier_catalog_products")
        .select("id, name, supplier_id, category_id, image_url")
        .in("id", catalogIds)
    : { data: [] };
  const catalogById = new Map((catalogRows ?? []).map((c) => [c.id, c]));

  const supplierIds = [
    ...new Set((catalogRows ?? []).map((c) => c.supplier_id).filter(Boolean)),
  ];
  const { data: supplierRows } = supplierIds.length
    ? await db.from("suppliers").select("id, name, slug").in("id", supplierIds)
    : { data: [] };
  const supplierById = new Map((supplierRows ?? []).map((s) => [s.id, s]));

  return rows.map((d) => {
    const cp: any = catalogById.get(d.supplier_catalog_product_id);
    const s: any = cp ? supplierById.get(cp.supplier_id) : null;
    return {
      id: d.id,
      name: d.name,
      status: d.status,
      supplier_catalog_product_id: d.supplier_catalog_product_id,
      supplier_id: s?.id ?? cp?.supplier_id ?? null,
      supplier_name: s?.name ?? null,
      supplier_slug: s?.slug ?? null,
      catalog_product_name: cp?.name ?? null,
      catalog_category_id: cp?.category_id ?? null,
      image_url: cp?.image_url ?? null,
      updated_at: d.updated_at,
    } as BuilderDesign;
  });
}

/** Catalog product row for one designs row (name/category/supplier_id). */
export async function resolveCatalogForDesign(
  db: Db,
  supplierCatalogProductId: string | null,
): Promise<{
  id: string;
  name: string | null;
  supplier_id: string | null;
  category_id: string | null;
  image_url: string | null;
} | null> {
  if (!supplierCatalogProductId) return null;
  const { data } = await db
    .from("supplier_catalog_products")
    .select("id, name, supplier_id, category_id, image_url")
    .eq("id", supplierCatalogProductId)
    .single();
  return (data as any) ?? null;
}
