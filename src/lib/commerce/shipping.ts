import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveCartRouting,
  type CommerceLineRef,
  type ResolvedLine,
  type RoutingResult,
} from "./supplier-routing";
import { getIntegrationKey } from "@/lib/integrations/keys";

/**
 * Shipping estimates — per-PACKAGE quoting.
 *
 * The model (Sunny's ruling, 2026-11-03): in print-on-demand every cart
 * line ships as its own package — a shirt and a hat are two shipping
 * charges even when they come from the same place. So a quote is one
 * package per line, each with its own method options; the order's
 * shipping total is the sum of the customer's per-package picks.
 *
 * The customer is never told where a package comes from: the public
 * quote shape (publicQuote) carries package indexes and item labels
 * only — no supplier ids, names, or the word "supplier".
 *
 * Rate sources, in order:
 *   1. Printify lines with a known (blueprint, provider, variant):
 *      Printify's live shipping endpoint prices the actual package to
 *      the actual destination. Delivery windows come from the pair's
 *      harvested rate card (their published tables).
 *   2. shipping_profiles rate cards — per supplier, per family, with
 *      Printify's harvested per-pair cards (profile_name PFY-<b>-<p>-<CC>)
 *      selected exactly when the line carries that pair.
 * Cost from a card = first_item_cost + additional_item_cost × (qty − 1).
 */

export type ShippingMethodOption = {
  profile_id: string | null;
  method_name: string;
  cost: number;
  currency: string;
  min_days: number | null;
  max_days: number | null;
};

export type ShippingPackage = {
  index: number;
  label: string;
  item_count: number;
  /** Internal only — fulfillment + estimate persistence. Never sent
   *  to the browser (see publicQuote). */
  supplier_id: string | null;
  supplier_name: string | null;
  methods: ShippingMethodOption[];
};

export type ShippingQuote = {
  packages: ShippingPackage[];
  unrouted_labels: string[];
  /** Cheapest possible combined total (one method per package). */
  cheapest_total: number;
  currency: string;
};

/** The customer-facing shape: packages without any supplier identity. */
export function publicQuote(q: ShippingQuote) {
  return {
    packages: q.packages.map((p) => ({
      index: p.index,
      label: p.label,
      item_count: p.item_count,
      methods: p.methods,
    })),
    unrouted_labels: q.unrouted_labels,
    cheapest_total: q.cheapest_total,
    currency: q.currency,
  };
}

type ProfileRow = Record<string, any>;

async function loadProfiles(
  sb: SupabaseClient,
  tenantId: string,
  supplierId: string,
  country: string
): Promise<ProfileRow[]> {
  const { data } = await sb.from("shipping_profiles").select("*");
  const rows = (data ?? []) as ProfileRow[];
  const matches = rows.filter((p) => {
    if (p.tenant_id && p.tenant_id !== tenantId) return false;
    if (p.supplier_id && p.supplier_id !== supplierId) return false;
    const dest: string[] | null = p.destination_countries ?? null;
    if (Array.isArray(dest) && dest.length > 0) {
      if (!dest.map((d) => String(d).toUpperCase()).includes(country.toUpperCase())) return false;
    }
    return true;
  });
  const specific = matches.filter((p) => p.supplier_id === supplierId);
  return specific.length ? specific : matches;
}

/**
 * Pick the representative card per method for one line. Priority:
 * the line's exact Printify pair card > family card > default card,
 * with exact-country cards ahead of rest-of-world cards; cheapest
 * first-item breaks ties.
 */
function lineMethods(
  profiles: ProfileRow[],
  line: ResolvedLine,
  country: string
): ShippingMethodOption[] {
  const qty = Math.max(1, line.quantity || 1);
  const pairNames = new Set<string>();
  if (line.printify_blueprint_id && line.printify_provider_id) {
    pairNames.add(
      `PFY-${line.printify_blueprint_id}-${line.printify_provider_id}-${country.toUpperCase()}`
    );
    pairNames.add(
      `PFY-${line.printify_blueprint_id}-${line.printify_provider_id}-ROW`
    );
  }
  const score = (p: ProfileRow): number => {
    let s = 0;
    const name = String(p.profile_name ?? "");
    if (pairNames.has(name)) s += 100;
    const dest: string[] = p.destination_countries ?? [];
    if (Array.isArray(dest) && dest.map((d) => String(d).toUpperCase()).includes(country.toUpperCase())) s += 10;
    if (line.family && name.toLowerCase().includes(line.family.toLowerCase())) s += 40;
    if (p.is_default) s += 20;
    return s;
  };
  const byMethod = new Map<string, ProfileRow[]>();
  for (const p of profiles) {
    const key = String(p.method_name ?? "Standard");
    if (!byMethod.has(key)) byMethod.set(key, []);
    byMethod.get(key)!.push(p);
  }
  const options: ShippingMethodOption[] = [];
  for (const [method, cards] of byMethod) {
    const rep = [...cards].sort((a, b) => {
      const d = score(b) - score(a);
      if (d !== 0) return d;
      return Number(a.first_item_cost ?? 0) - Number(b.first_item_cost ?? 0);
    })[0];
    const first = Number(rep.first_item_cost ?? 0);
    const additional = Number(rep.additional_item_cost ?? 0);
    options.push({
      profile_id: rep.id,
      method_name: method,
      cost: Math.round((first + additional * (qty - 1)) * 100) / 100,
      currency: String(rep.currency ?? "USD"),
      min_days: rep.min_days ?? null,
      max_days: rep.max_days ?? null,
    });
  }
  return options.sort((a, b) => a.cost - b.cost);
}

/* ------------------------------------------------------------------ */
/* Printify live shipping quotes                                       */
/* ------------------------------------------------------------------ */

const liveCache = new Map<string, { at: number; methods: ShippingMethodOption[] }>();
let printifyShopId: string | null = null;

async function printifyLiveMethods(
  line: ResolvedLine,
  dest: { country: string; region?: string | null; postalCode?: string | null },
  cardMethods: ShippingMethodOption[]
): Promise<ShippingMethodOption[] | null> {
  if (!line.printify_blueprint_id || !line.printify_provider_id || !line.fulfillment_variant_external_id) {
    return null;
  }
  const qty = Math.max(1, line.quantity || 1);
  const cacheKey = [
    line.printify_blueprint_id,
    line.printify_provider_id,
    line.fulfillment_variant_external_id,
    qty,
    dest.country.toUpperCase(),
    dest.postalCode ?? "",
  ].join("|");
  const hit = liveCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.methods;
  try {
    const key = await getIntegrationKey("PRINTIFY_API_KEY");
    if (!key) return null;
    if (!printifyShopId) {
      const shopsRes = await fetch("https://api.printify.com/v1/shops.json", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!shopsRes.ok) return null;
      const shops: any[] = await shopsRes.json();
      printifyShopId = shops?.[0]?.id != null ? String(shops[0].id) : null;
      if (!printifyShopId) return null;
    }
    const res = await fetch(
      `https://api.printify.com/v1/shops/${printifyShopId}/orders/shipping.json`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          line_items: [
            {
              print_provider_id: Number(line.printify_provider_id),
              blueprint_id: Number(line.printify_blueprint_id),
              variant_id: Number(line.fulfillment_variant_external_id),
              quantity: qty,
            },
          ],
          address_to: {
            country: dest.country.toUpperCase(),
            ...(dest.region ? { region: dest.region } : {}),
            ...(dest.postalCode ? { zip: dest.postalCode } : {}),
          },
        }),
      }
    );
    if (!res.ok) return null;
    const body: any = await res.json();
    const methods: ShippingMethodOption[] = [];
    for (const [rawName, rawVal] of Object.entries(body ?? {})) {
      const cents =
        typeof rawVal === "number" ? rawVal : Number((rawVal as any)?.amount);
      if (!Number.isFinite(cents)) continue;
      const methodName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      const card = cardMethods.find(
        (m) => m.method_name.toLowerCase() === rawName.toLowerCase()
      );
      methods.push({
        profile_id: card?.profile_id ?? null,
        method_name: methodName,
        cost: Math.round(cents) / 100,
        currency: "USD",
        min_days: card?.min_days ?? null,
        max_days: card?.max_days ?? null,
      });
    }
    if (!methods.length) return null;
    methods.sort((a, b) => a.cost - b.cost);
    liveCache.set(cacheKey, { at: Date.now(), methods });
    return methods;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Smart-cart free-shipping promo                                      */
/* ------------------------------------------------------------------ */

export type FreeShippingPromo = {
  code: string;
  name: string;
  minimum_subtotal: number;
  /** True when the subtotal qualifies — shipping charges drop to $0. */
  applied: boolean;
  /** What the customer saves when applied (the shipping that would
   *  have been charged). */
  savings: number;
};

/**
 * The automatic free-shipping promotion (Sunny's smart-cart rule):
 * when the merchandise subtotal reaches the promotion's threshold,
 * the promo applies itself — shipping is $0 — and the customer SEES
 * the code and the saving. The promotion lives in commerce_promotions
 * (code SHIPFREE, type free_shipping, is_automatic) so the store can
 * retune or retire it from the promotions data, not from code.
 */
export async function freeShippingPromo(
  sb: SupabaseClient,
  tenantId: string,
  subtotal: number,
  shippingTotal: number
): Promise<FreeShippingPromo | null> {
  try {
    const { data } = await sb
      .from("commerce_promotions")
      .select("code, name, minimum_subtotal")
      .eq("tenant_id", tenantId)
      .eq("promotion_type", "free_shipping")
      .eq("is_automatic", true)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const min = Number((data as any).minimum_subtotal ?? 0);
    const applied = min > 0 && subtotal >= min;
    return {
      code: String((data as any).code ?? "SHIPFREE"),
      name: String((data as any).name ?? "Free shipping"),
      minimum_subtotal: min,
      applied,
      savings: applied ? Math.round(shippingTotal * 100) / 100 : 0,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */

export async function quoteShipping(
  sb: SupabaseClient,
  opts: {
    tenantId: string;
    lines: CommerceLineRef[];
    country: string;
    region?: string | null;
    postalCode?: string | null;
    routing?: RoutingResult;
  }
): Promise<ShippingQuote> {
  const routing = opts.routing ?? (await resolveCartRouting(sb, opts.lines));
  const packages: ShippingPackage[] = [];
  let cheapest = 0;
  let currency = "USD";

  for (let i = 0; i < routing.lines.length; i++) {
    const line = routing.lines[i];
    let methods: ShippingMethodOption[] = [];
    if (line.supplier_id) {
      const profiles = await loadProfiles(sb, opts.tenantId, line.supplier_id, opts.country);
      const cardMethods = lineMethods(profiles, line, opts.country);
      const live = await printifyLiveMethods(line, opts, cardMethods);
      methods = live ?? cardMethods;
    }
    if (methods.length) {
      cheapest += methods[0].cost;
      currency = methods[0].currency;
    }
    packages.push({
      index: i,
      label: line.label ?? "Item",
      item_count: Math.max(1, line.quantity || 1),
      supplier_id: line.supplier_id,
      supplier_name: line.supplier_name,
      methods,
    });
  }

  return {
    packages,
    unrouted_labels: routing.unrouted.map((l) => l.label ?? "Item"),
    cheapest_total: Math.round(cheapest * 100) / 100,
    currency,
  };
}

/**
 * Persist a quote as order_shipping_estimates rows and mark the
 * customer's chosen method per package as selected. selections maps
 * package index (as a string) → shipping_profile_id; a live-quoted
 * method carries its harvested card's id when one exists, else null,
 * in which case the selection is matched by method name. Returns the
 * combined shipping total. Labels never name a supplier.
 */
export async function persistOrderEstimates(
  sb: SupabaseClient,
  opts: {
    tenantId: string;
    orderId: string;
    quote: ShippingQuote;
    country: string;
    postalCode?: string | null;
    selections: Record<string, string>;
  }
): Promise<{ shipping_total: number; method_label: string }> {
  const rows: any[] = [];
  let total = 0;
  const labels: string[] = [];

  for (const pkg of opts.quote.packages) {
    const chosenId = opts.selections[String(pkg.index)];
    const chosen =
      pkg.methods.find((m) => m.profile_id && m.profile_id === chosenId) ??
      pkg.methods.find((m) => m.method_name === chosenId) ??
      pkg.methods[0];
    for (const m of pkg.methods) {
      const isSelected = chosen ? m === chosen : false;
      rows.push({
        tenant_id: opts.tenantId,
        order_id: opts.orderId,
        supplier_id: pkg.supplier_id,
        shipping_profile_id: m.profile_id,
        method_name: m.method_name,
        destination_country: opts.country,
        destination_zip: opts.postalCode ?? null,
        estimated_cost: m.cost,
        currency: m.currency,
        min_days: m.min_days,
        max_days: m.max_days,
        item_count: pkg.item_count,
        selected: isSelected,
      });
      if (isSelected && chosen) {
        total += m.cost;
        labels.push(`Package ${pkg.index + 1}: ${m.method_name}`);
      }
    }
  }

  if (rows.length) {
    const { error } = await sb.from("order_shipping_estimates").insert(rows);
    if (error) throw new Error(`shipping estimates persist failed: ${error.message}`);
  }
  return {
    shipping_total: Math.round(total * 100) / 100,
    method_label: labels.join(" · "),
  };
}
