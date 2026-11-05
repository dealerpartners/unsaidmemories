/**
 * Rule C dispatch — sends one supplier group of an order to Gelato or
 * Prodigi using the payload factory + supplier_product_mappings.
 *
 * Discipline (same as the Printful path in lib/suppliers/push.ts):
 *   • A group with ANY line missing its mapping is refused by name —
 *     partial blind pushes never happen.
 *   • A fulfillment row is `submitted` ONLY with a real provider order
 *     id in the response; failures are recorded `failed` with the
 *     provider's error, never dressed up as success.
 *   • Every attempt is written to order_fulfillment_logs (audit).
 */

import {
  createGelatoPayload,
  createProdigiPayload,
  type PayloadLine,
  type ShipTo,
} from "./payload-factory";

/**
 * F7 (DB wiring audit): the Stripe webhook creates one DRAFT
 * fulfillment row per supplier at payment time. Pushes must
 * TRANSITION that row — inserting a parallel row leaves a stale
 * draft the customer's tracking view also reads. Claims the
 * latest open (draft/failed) row for (order, supplier) and applies
 * the patch; returns its id, or null when no open row exists
 * (caller falls back to inserting).
 */
export async function claimDraftFulfillment(
  sb: any,
  tenantId: string,
  orderId: string,
  supplierId: string,
  patch: Record<string, unknown>,
): Promise<string | null> {
  const { data: rows } = await sb
    .from("fulfillment_orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("order_id", orderId)
    .eq("supplier_id", supplierId)
    .in("status", ["draft", "failed"])
    .order("created_at", { ascending: false })
    .limit(1);
  const id = rows?.[0]?.id as string | undefined;
  if (!id) return null;
  await sb.from("fulfillment_orders").update(patch).eq("id", id);
  return id;
}

export interface DispatchLine {
  itemId: string;
  quantity: number;
  catalogVariantId: string | null;
  externalVariantId: string | null;
  designFileUrl: string | null;
  /** Frozen design data from the order line — carried onto
   *  fulfillment_items with the file URL. */
  designSnapshot?: unknown;
}

export interface DispatchOutcome {
  status: "ordered" | "push_failed" | "refused";
  providerOrderId?: string;
  error?: string;
}

interface ErpShipTo {
  name: string;
  street1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

const ENDPOINTS: Record<string, { url: string; keyEnv: string; auth: (key: string) => Record<string, string> }> = {
  gelato: {
    url: "https://order.gelatoapis.com/v3/orders",
    keyEnv: "GELATO_API_KEY",
    auth: (key) => ({ "X-API-KEY": key }),
  },
  prodigi: {
    url: "https://api.prodigi.com/v4.0/Orders",
    keyEnv: "PRODIGI_API_KEY",
    auth: (key) => ({ "X-API-Key": key }),
  },
};

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: parts[0] ?? "Customer", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export async function dispatchMappedGroup(args: {
  sb: any;
  tenantId: string;
  slug: "gelato" | "prodigi";
  supplierId: string;
  lines: DispatchLine[];
  storefrontOrderId: string;
  orderNumber: string;
  customerId: string | null;
  customerEmail: string;
  shipTo: ErpShipTo | null;
}): Promise<DispatchOutcome> {
  const { sb, tenantId, slug, lines } = args;
  const endpoint = ENDPOINTS[slug];

  const log = async (status: string, payload: unknown, response: unknown, error?: string, sku?: string) => {
    await sb
      .from("order_fulfillment_logs")
      .insert({
        tenant_id: tenantId,
        order_id: args.storefrontOrderId,
        order_item_id: lines.length === 1 ? lines[0].itemId : null,
        sku: sku ?? null,
        supplier: slug.toUpperCase(),
        status,
        payload: payload ?? null,
        response: response ?? null,
        error: error ?? null,
      })
      .then(undefined, () => undefined);
  };

  // 1. Resolve every line's Rule C mapping — all or nothing.
  const payloadLines: PayloadLine[] = [];
  for (const line of lines) {
    if (!line.catalogVariantId) {
      return { status: "refused", error: `line ${line.itemId.slice(0, 8)} has no supplier catalog variant — no mapping possible` };
    }
    const { data: mapping } = await sb
      .from("supplier_product_mappings")
      .select("supplier_sku, print_job_config")
      .eq("supplier_catalog_variant_id", line.catalogVariantId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!mapping) {
      return {
        status: "refused",
        error: `no supplier_product_mappings row for catalog variant ${line.catalogVariantId.slice(0, 8)} — Rule C mapping missing, group held`,
      };
    }
    payloadLines.push({
      itemId: line.itemId,
      quantity: line.quantity,
      supplierSku: mapping.supplier_sku,
      printFileUrl: line.designFileUrl,
      printJobConfig: (mapping.print_job_config ?? {}) as Record<string, unknown>,
    });
  }

  if (!args.shipTo) {
    return { status: "refused", error: "shipping address cannot be parsed to a carrier address (no ZIP) — refusing to push" };
  }
  const { getIntegrationKey } = await import("@/lib/integrations/keys");
  const apiKey = await getIntegrationKey(endpoint.keyEnv);
  if (!apiKey) {
    return { status: "push_failed", error: `${slug} not configured (missing ${endpoint.keyEnv})` };
  }

  const { firstName, lastName } = splitName(args.shipTo.name);
  const shipTo: ShipTo = {
    firstName,
    lastName,
    line1: args.shipTo.street1,
    city: args.shipTo.city,
    postalCode: args.shipTo.zip,
    countryCode: args.shipTo.country,
    stateCode: args.shipTo.state,
    email: args.customerEmail,
  };

  const payload =
    slug === "gelato"
      ? createGelatoPayload({
          orderReferenceId: args.orderNumber,
          customerReferenceId: args.customerId ?? "",
          shipTo,
          lines: payloadLines,
        })
      : createProdigiPayload({
          orderReferenceId: args.orderNumber,
          shipTo,
          lines: payloadLines,
        });

  // 2. Dispatch + bookkeeping. Submitted ONLY with a provider order id.
  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...endpoint.auth(apiKey) },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });
    const data: any = await res.json().catch(() => null);
    const providerOrderId = String(data?.orderId ?? data?.order?.id ?? data?.id ?? "");
    if (!res.ok || !providerOrderId) {
      throw new Error(
        !res.ok
          ? `${slug} API ${res.status}: ${JSON.stringify(data)?.slice(0, 300) ?? res.statusText}`
          : `${slug} returned no order id — not marking ordered`,
      );
    }
    const claimed = await claimDraftFulfillment(sb, tenantId, args.storefrontOrderId, args.supplierId, {
      supplier_order_external_id: providerOrderId,
      status: "submitted",
    });
    const fo = claimed
      ? { id: claimed }
      : await sb
          .from("fulfillment_orders")
          .insert({
            tenant_id: tenantId,
            order_id: args.storefrontOrderId,
            supplier_id: args.supplierId,
            supplier_order_external_id: providerOrderId,
            status: "submitted",
            cost: null,
          })
          .select("id")
          .single()
          .then((r: any) => {
            if (r.error) throw new Error(r.error.message);
            return r.data;
          });
    await sb.from("fulfillment_items").insert(
      lines.map((l) => ({
        fulfillment_order_id: fo.id,
        tenant_id: tenantId,
        order_item_id: l.itemId,
        supplier_catalog_variant_external_id: l.externalVariantId,
        placement_file_urls: l.designFileUrl ? [l.designFileUrl] : [],
        design_snapshot: l.designSnapshot ?? null,
      })),
    );
    await log("DISPATCHED_TO_PRODUCTION", payload, data);
    return { status: "ordered", providerOrderId };
  } catch (e: any) {
    const message = e?.message || String(e);
    const claimedFail = await claimDraftFulfillment(sb, tenantId, args.storefrontOrderId, args.supplierId, {
      status: "failed",
    }).catch(() => null);
    if (!claimedFail) {
      await sb
        .from("fulfillment_orders")
        .insert({
          tenant_id: tenantId,
          order_id: args.storefrontOrderId,
          supplier_id: args.supplierId,
          supplier_order_external_id: null,
          status: "failed",
          cost: null,
        })
        .then(undefined, () => undefined);
    }
    await log("DISPATCH_FAILED", payload, null, message);
    return { status: "push_failed", error: message };
  }
}
