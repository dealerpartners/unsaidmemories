import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supplier identification for commerce lines.
 *
 * One resolution path, used by the cart, checkout, the Stripe webhook, and
 * the shipping estimator so a line's supplier can never differ between
 * what the customer saw and what fulfillment receives:
 *
 *   1. Line carries a supplier_catalog_variant_id → that variant's supplier.
 *   2. Line carries a product_variant_id → the winning ACTIVE route in
 *      variant_fulfillment_routes (lowest priority number wins); the route
 *      also names the supplier catalog variant fulfillment must order.
 *   3. Line carries only a design_publication_id → the publication's linked
 *      variant (product_variant_id / supplier_catalog_variant_id columns
 *      when present), then rules 1–2 apply.
 *
 * A line that resolves to no supplier is reported as unrouted — it is never
 * silently dropped and never guessed.
 */

export type CommerceLineRef = {
  product_variant_id?: string | null;
  supplier_catalog_variant_id?: string | null;
  design_publication_id?: string | null;
  quantity: number;
  /** Display name for notices; filled by callers when known. */
  label?: string | null;
};

export type ResolvedLine = CommerceLineRef & {
  supplier_id: string | null;
  supplier_name: string | null;
  route_id: string | null;
  /** The supplier catalog variant fulfillment will order for this line. */
  fulfillment_catalog_variant_id: string | null;
  technique: string | null;
  lead_time_days: number | null;
  unit_cost_snapshot: number | null;
  /** Catalog product family (Drinkware / Headwear / Posters / Apparel) —
   *  picks the right shipping rate card for the line. */
  family: string | null;
  /** Printify pair identity when the fulfillment variant carries it —
   *  selects that pair's exact harvested shipping card. */
  printify_blueprint_id: string | null;
  printify_provider_id: string | null;
  /** The fulfillment catalog variant's external id at the supplier
   *  (Printify's live shipping endpoint addresses variants by it). */
  fulfillment_variant_external_id: string | null;
};

/** Product family from a catalog product name — shipping cards are
 *  written per family, so the quote engine matches on this. */
export function familyFromName(name: string | null | undefined): string {
  const n = (name ?? "").toLowerCase();
  if (/mug|cup|tumbler|bottle|drinkware|glass/.test(n)) return "Drinkware";
  if (/hat|cap|beanie|headwear|visor/.test(n)) return "Headwear";
  if (/poster|print|canvas|wall art|art print/.test(n)) return "Posters";
  return "Apparel";
}

export type SupplierGroup = {
  supplier_id: string;
  supplier_name: string;
  lines: ResolvedLine[];
};

export type RoutingResult = {
  lines: ResolvedLine[];
  groups: SupplierGroup[];
  unrouted: ResolvedLine[];
  supplierCount: number;
  mixed: boolean;
};

async function supplierName(
  sb: SupabaseClient,
  cache: Map<string, string>,
  supplierId: string
): Promise<string> {
  const hit = cache.get(supplierId);
  if (hit) return hit;
  const { data } = await sb
    .from("suppliers")
    .select("name")
    .eq("id", supplierId)
    .maybeSingle();
  const name = data?.name ?? "Supplier";
  cache.set(supplierId, name);
  return name;
}

/** Read a catalog variant's shipping identity: its print-spec pair
 *  (Printify blueprint/provider when present) and its product family. */
async function catalogVariantShipInfo(
  sb: SupabaseClient,
  variantId: string
): Promise<{ family: string | null; blueprint: string | null; provider: string | null; externalId: string | null }> {
  const { data: v } = await sb
    .from("supplier_catalog_variants")
    .select("print_specs, supplier_catalog_product_id, external_id")
    .eq("id", variantId)
    .maybeSingle();
  if (!v) return { family: null, blueprint: null, provider: null, externalId: null };
  const specs: any = (v as any).print_specs ?? {};
  let family: string | null = null;
  if ((v as any).supplier_catalog_product_id) {
    const { data: p } = await sb
      .from("supplier_catalog_products")
      .select("name")
      .eq("id", (v as any).supplier_catalog_product_id)
      .maybeSingle();
    family = familyFromName(p?.name);
  }
  return {
    family,
    blueprint: specs?.blueprint_id != null ? String(specs.blueprint_id) : null,
    provider: specs?.provider_id != null ? String(specs.provider_id) : null,
    externalId: (v as any).external_id != null ? String((v as any).external_id) : null,
  };
}

export async function resolveLineSupplier(
  sb: SupabaseClient,
  line: CommerceLineRef,
  nameCache = new Map<string, string>()
): Promise<ResolvedLine> {
  const base: ResolvedLine = {
    ...line,
    supplier_id: null,
    supplier_name: null,
    route_id: null,
    fulfillment_catalog_variant_id: line.supplier_catalog_variant_id ?? null,
    technique: null,
    lead_time_days: null,
    unit_cost_snapshot: null,
    family: null,
    printify_blueprint_id: null,
    printify_provider_id: null,
    fulfillment_variant_external_id: null,
  };

  let productVariantId = line.product_variant_id ?? null;
  let catalogVariantId = line.supplier_catalog_variant_id ?? null;

  // Rule 3: design-only line → follow the publication to its variant.
  if (!productVariantId && !catalogVariantId && line.design_publication_id) {
    const { data: pub } = await sb
      .from("design_publications")
      .select("*")
      .eq("id", line.design_publication_id)
      .maybeSingle();
    if (pub) {
      productVariantId = (pub as any).product_variant_id ?? null;
      catalogVariantId = (pub as any).supplier_catalog_variant_id ?? null;
      base.product_variant_id = productVariantId;
      if (catalogVariantId) base.fulfillment_catalog_variant_id = catalogVariantId;
    }
  }

  // Rule 1: direct supplier catalog variant.
  if (catalogVariantId) {
    const { data: v } = await sb
      .from("supplier_catalog_variants")
      .select("supplier_id")
      .eq("id", catalogVariantId)
      .maybeSingle();
    if (v?.supplier_id) {
      base.supplier_id = v.supplier_id;
      base.supplier_name = await supplierName(sb, nameCache, v.supplier_id);
      const info = await catalogVariantShipInfo(sb, catalogVariantId);
      base.family = info.family;
      base.printify_blueprint_id = info.blueprint;
      base.printify_provider_id = info.provider;
      base.fulfillment_variant_external_id = info.externalId;
      return base;
    }
  }

  // Rule 2: curated variant → winning fulfillment route.
  if (productVariantId) {
    const { data: route } = await sb
      .from("variant_fulfillment_routes")
      .select(
        "id, supplier_id, supplier_catalog_variant_id, technique, cost_snapshot, lead_time_days"
      )
      .eq("product_variant_id", productVariantId)
      .eq("is_active", true)
      .order("priority", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (route?.supplier_id) {
      base.supplier_id = route.supplier_id;
      base.supplier_name = await supplierName(sb, nameCache, route.supplier_id);
      base.route_id = route.id;
      base.fulfillment_catalog_variant_id =
        route.supplier_catalog_variant_id ?? base.fulfillment_catalog_variant_id;
      base.technique = route.technique ?? null;
      base.lead_time_days = route.lead_time_days ?? null;
      base.unit_cost_snapshot =
        route.cost_snapshot != null ? Number(route.cost_snapshot) : null;
      if (base.fulfillment_catalog_variant_id) {
        const info = await catalogVariantShipInfo(sb, base.fulfillment_catalog_variant_id);
        base.family = info.family;
        base.printify_blueprint_id = info.blueprint;
        base.printify_provider_id = info.provider;
        base.fulfillment_variant_external_id = info.externalId;
      }
      return base;
    }
  }

  return base;
}

export async function resolveCartRouting(
  sb: SupabaseClient,
  lines: CommerceLineRef[]
): Promise<RoutingResult> {
  const cache = new Map<string, string>();
  const resolved: ResolvedLine[] = [];
  for (const line of lines) {
    resolved.push(await resolveLineSupplier(sb, line, cache));
  }
  const groups = new Map<string, SupplierGroup>();
  const unrouted: ResolvedLine[] = [];
  for (const line of resolved) {
    if (!line.supplier_id) {
      unrouted.push(line);
      continue;
    }
    let g = groups.get(line.supplier_id);
    if (!g) {
      g = {
        supplier_id: line.supplier_id,
        supplier_name: line.supplier_name ?? "Supplier",
        lines: [],
      };
      groups.set(line.supplier_id, g);
    }
    g.lines.push(line);
  }
  const groupList = [...groups.values()];
  return {
    lines: resolved,
    groups: groupList,
    unrouted,
    supplierCount: groupList.length,
    mixed: groupList.length > 1,
  };
}

/**
 * Separate-packages notice for customers. Every cart line is made to
 * order and ships as its own package (a shirt and a hat are two
 * packages even when they come from the same place), and the customer
 * is never told where an item is made — no supplier names, counts, or
 * the word "supplier" appear in anything this returns.
 */
export function mixedSupplierCopy(routing: RoutingResult) {
  const lines = routing.lines;
  if (lines.length < 2) return null;
  return {
    title: `Arrives in ${lines.length} packages`,
    body: "Each item is made to order and ships on its own. Shipping is charged per package — you'll see each package's cost before you pay.",
    package_count: lines.length,
    packages: lines.map((l, i) => ({
      index: i,
      label: l.label ?? "Item",
    })),
  };
}
