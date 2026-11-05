// Shared helpers for customer reviews & questions (ugc_posts /
// ugc_comments). Sunny's model (2026-11-03): customers post reviews and
// questions from the PRODUCT page; posts publish immediately — no
// moderation, no purchase gate. Verified purchase is a badge, computed
// honestly from delivered orders. The portal only READS what the
// customer posted.
//
// Catalog linkage: ugc_posts.product_id / ugc_comments.product_id FK
// into native `products` only. Catalog items link through
// supplier_catalog_product_id once that column is applied (prepared
// migration: notes/ugc-catalog-link-migration.sql). Until then the
// probe below reports false and catalog posting answers an honest 501.

let columnProbe: { at: number; ok: boolean } | null = null;
const PROBE_TTL_MS = 5 * 60 * 1000;

export async function hasUgcCatalogColumn(supabase: any): Promise<boolean> {
  if (columnProbe && Date.now() - columnProbe.at < PROBE_TTL_MS) {
    return columnProbe.ok;
  }
  const { error } = await supabase
    .from("ugc_posts")
    .select("supplier_catalog_product_id")
    .limit(0);
  const ok = !error;
  columnProbe = { at: Date.now(), ok };
  return ok;
}

/** The name a customer's posts appear under — their display name when
 *  set, else their account name, else a neutral label. NEVER an email. */
export async function displayNameFor(supabase: any, user: any): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  return (
    profile?.display_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.display_name ||
    "Unsaid customer"
  );
}

export type UgcProductTarget =
  | { kind: "native"; id: string }
  | { kind: "catalog"; id: string }
  | null;

/** Resolve a PDP product id to its store: native `products` first,
 *  then the supplier catalog. */
export async function resolveUgcProduct(
  supabase: any,
  productId: string,
): Promise<UgcProductTarget> {
  const { data: native } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();
  if (native) return { kind: "native", id: productId };
  const { data: catalog } = await supabase
    .from("supplier_catalog_products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();
  if (catalog) return { kind: "catalog", id: productId };
  return null;
}

/** Honest verified-purchase check: the customer has a DELIVERED order
 *  containing this product (native or catalog). Badge only — never a
 *  gate on posting. */
export async function verifiedPurchase(
  supabase: any,
  userId: string,
  target: { kind: "native" | "catalog"; id: string },
): Promise<boolean> {
  const { data: orders } = await supabase
    .from("orders")
    .select("id")
    .eq("customer_id", userId)
    .limit(200);
  const orderIds = (orders || []).map((o: any) => o.id);
  if (!orderIds.length) return false;

  const delivered = new Set<string>();
  const { data: fuls } = await supabase
    .from("fulfillment_orders")
    .select("order_id, status")
    .in("order_id", orderIds);
  for (const f of fuls || []) {
    if ((f as any).status === "delivered") delivered.add((f as any).order_id);
  }
  if (delivered.size < orderIds.length) {
    const { data: twins } = await supabase
      .from("erp_orders")
      .select("id, source_order_id")
      .in("source_order_id", orderIds);
    const twinIds = (twins || []).map((t: any) => t.id);
    if (twinIds.length) {
      const { data: twinFuls } = await supabase
        .from("erp_fulfillment_orders")
        .select("id, order_id")
        .in("order_id", twinIds);
      const fulIds = (twinFuls || []).map((f: any) => f.id);
      if (fulIds.length) {
        const { data: ships } = await supabase
          .from("erp_shipments")
          .select("fulfillment_id, delivered_at")
          .in("fulfillment_id", fulIds);
        const deliveredFul = new Set(
          (ships || []).filter((s: any) => s.delivered_at).map((s: any) => s.fulfillment_id),
        );
        for (const f of twinFuls || []) {
          if (deliveredFul.has((f as any).id)) {
            const twin = (twins || []).find((t: any) => t.id === (f as any).order_id);
            if (twin) delivered.add((twin as any).source_order_id);
          }
        }
      }
    }
  }
  const deliveredIds = [...delivered];
  if (!deliveredIds.length) return false;

  const { data: items } = await supabase
    .from("order_items")
    .select("id, product_variant_id, supplier_catalog_variant_id")
    .in("order_id", deliveredIds);
  const rows = (items || []) as any[];
  if (!rows.length) return false;

  if (target.kind === "catalog") {
    const variantIds = [...new Set(rows.map((r) => r.supplier_catalog_variant_id).filter(Boolean))];
    if (!variantIds.length) return false;
    const { data: variants } = await supabase
      .from("supplier_catalog_variants")
      .select("id, supplier_catalog_product_id")
      .in("id", variantIds);
    return (variants || []).some(
      (v: any) => v.supplier_catalog_product_id === target.id,
    );
  }
  const variantIds = [...new Set(rows.map((r) => r.product_variant_id).filter(Boolean))];
  if (!variantIds.length) return false;
  const { data: variants } = await supabase
    .from("product_variants")
    .select("id, product_id")
    .in("id", variantIds);
  return (variants || []).some((v: any) => v.product_id === target.id);
}

/** Names follow the profile: when a customer sets (or changes) their
 *  display name, their posts show the new name — nobody stays stuck
 *  with the placeholder from before they set one. The stamped
 *  author_display_name remains the fallback (e.g. deleted accounts).
 *  Mutates the rows' author_display_name in place. */
export async function applyLiveDisplayNames(
  supabase: any,
  rows: Record<string, any>[],
): Promise<void> {
  const ids = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))];
  if (!ids.length) return;
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", ids as string[]);
  const names = new Map(
    ((data ?? []) as any[]).map((p) => [String(p.id), p.display_name]),
  );
  for (const r of rows) {
    const live = r.customer_id ? names.get(String(r.customer_id)) : null;
    if (live) r.author_display_name = live;
  }
}
