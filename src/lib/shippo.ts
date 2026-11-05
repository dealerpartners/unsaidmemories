// Shippo rate quotes + label purchases. The key is read from SHIPPO_API_KEY
// (live) or SHIPPO_TEST_API (test), so going live is an env swap — no code
// change.
//
// The ship-from (return) address is NOT defined here: it is resolved per
// order from ship_from_addresses (lib/shipping/ship-from.ts) — the seller's
// own address for a seller's order, the tenant's for a house order. An
// unset/incomplete address throws ReturnAddressError; labels and quotes are
// never computed against a platform placeholder address.

const BASE = "https://api.goshippo.com"

import { getShippingSettings } from "@/lib/shipping/settings"
import { resolveShipFromForLabel, type ShipFromAddress } from "@/lib/shipping/ship-from"

function toShippoFrom(from: ShipFromAddress) {
  return {
    name: from.name,
    street1: from.street,
    city: from.city,
    state: from.state,
    zip: from.zip,
    country: "US",
    phone: from.phone || undefined,
    email: from.email || undefined,
  }
}

export const shippoKey = () => process.env.SHIPPO_API_KEY || process.env.SHIPPO_TEST_API || ""
export const shippoIsTest = () => !process.env.SHIPPO_API_KEY

/** Settings-aware key: admin-configured key (app_settings) wins, env is fallback. */
async function resolveShippoKey(): Promise<string> {
  const s = await getShippingSettings()
  return s.shippoApiKey || shippoKey()
}

export type ShippoRate = { provider: string; service: string; cents: number; days: number | null }

export type ShippoLabel = {
  labelUrl: string;
  trackingNumber: string;
  trackingUrl: string;
  rateCents: number;
  provider: string;
  service: string;
  testMode: boolean;
};

export type ShippoAddress = {
  name: string; street1: string; street2?: string;
  city: string; state: string; zip: string; country?: string;
  phone?: string; email?: string;
};

/**
 * Purchase a real shipping label via Shippo.
 * Creates a shipment, picks the cheapest rate (or the requested rate),
 * then buys the label. Throws "shippo_not_configured" when no API key.
 */
export async function shippoBuyLabel(input: {
  to: ShippoAddress;
  weightLb: number;
  lengthIn?: number; widthIn?: number; heightIn?: number;
  carrier?: string; // e.g. "usps" — optional filter
  service?: string;  // e.g. "Priority" — optional filter
  // Return-address scope: orderId resolves the order's seller (or house);
  // tenantId/sellerId for direct calls.
  orderId?: string; tenantId?: string; sellerId?: string;
}): Promise<ShippoLabel> {
  // Admin-configured key (app_settings) first, env fallback. Honest failure — no fake label.
  const key = await resolveShippoKey();
  if (!key) throw new Error("shippo_not_configured");
  const headers = { Authorization: `ShippoToken ${key}`, "Content-Type": "application/json" };

  // The label prints THIS order's shipper as the return address — resolved
  // per order, never a platform default. Throws ReturnAddressError when the
  // seller/tenant has not set a complete address.
  const from = await resolveShipFromForLabel({
    orderId: input.orderId, tenantId: input.tenantId, sellerId: input.sellerId,
  });

  // 1. Create shipment
  const shipRes = await fetch(`${BASE}/shipments/`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      address_from: toShippoFrom(from),
      address_to: { ...input.to, country: input.to.country || "US" },
      parcels: [{
        length: String(input.lengthIn ?? 12), width: String(input.widthIn ?? 9), height: String(input.heightIn ?? 4),
        distance_unit: "in", weight: (Math.round(Math.max(0.1, input.weightLb) * 100) / 100).toFixed(2), mass_unit: "lb",
      }],
      async: false,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!shipRes.ok) throw new Error(`shippo_shipment_${shipRes.status}`);
  const shipment = await shipRes.json();

  let rates: any[] = shipment.rates || [];
  if (input.carrier) rates = rates.filter((r) => String(r.provider || "").toLowerCase().includes(input.carrier!.toLowerCase()));
  if (input.service) rates = rates.filter((r) => String(r.servicelevel?.name || "").toLowerCase().includes(input.service!.toLowerCase()));
  rates = rates
    .filter((r) => Number.isFinite(Number(r.amount)) && Number(r.amount) > 0)
    .sort((a, b) => Number(a.amount) - Number(b.amount));
  if (rates.length === 0) throw new Error("shippo_no_rates");

  // 2. Buy the label on the cheapest matching rate
  const rate = rates[0];
  const txRes = await fetch(`${BASE}/transactions/`, {
    method: "POST",
    headers,
    body: JSON.stringify({ rate: rate.object_id, label_file_type: "PDF", async: false }),
    signal: AbortSignal.timeout(30000),
  });
  if (!txRes.ok) throw new Error(`shippo_transaction_${txRes.status}`);
  const tx = await txRes.json();
  if (tx.status !== "SUCCESS") throw new Error(`shippo_label_failed:${tx.messages?.[0]?.text || tx.status || "unknown"}`);

  return {
    labelUrl: tx.label_url,
    trackingNumber: tx.tracking_number,
    trackingUrl: tx.tracking_url_provider || "",
    rateCents: Math.round(Number(rate.amount) * 100),
    provider: rate.provider,
    service: rate.servicelevel?.name || "",
    testMode: (await getShippingSettings()).shippoTestMode,
  };
}

export async function shippoRates(input: { toZip: string; weightLb: number; lengthIn?: number; widthIn?: number; heightIn?: number; tenantId?: string; sellerId?: string }): Promise<ShippoRate[]> {
  const key = await resolveShippoKey()
  if (!key) throw new Error("shippo_not_configured")
  // Quotes price from the scoped return address (house tenant by default) —
  // the same address a label would print. Throws ReturnAddressError when unset.
  const from = await resolveShipFromForLabel({ tenantId: input.tenantId, sellerId: input.sellerId })
  const res = await fetch(`${BASE}/shipments/`, {
    method: "POST",
    headers: { Authorization: `ShippoToken ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      address_from: toShippoFrom(from),
      address_to: { name: "Customer", street1: "1 Main St", zip: input.toZip, country: "US" },
      parcels: [{
        length: String(input.lengthIn ?? 12), width: String(input.widthIn ?? 9), height: String(input.heightIn ?? 4),
        distance_unit: "in", weight: (Math.round(Math.max(0.1, input.weightLb) * 100) / 100).toFixed(2), mass_unit: "lb",
      }],
      async: false,
    }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`shippo_${res.status}`)
  const j = await res.json()
  return ((j.rates || []) as any[])
    .map((r) => ({ provider: r.provider, service: r.servicelevel?.name || "", cents: Math.round(Number(r.amount) * 100), days: r.estimated_days ?? null }))
    .filter((r) => Number.isFinite(r.cents) && r.cents > 0)
    .sort((a, b) => a.cents - b.cents)
}
