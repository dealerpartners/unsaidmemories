import { NextRequest, NextResponse } from "next/server";
import { getIntegrationKey } from "@/lib/integrations/keys";
import {
  applySupplierShipment,
  type SupplierShipment,
} from "@/lib/fulfillment/supplier-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/webhooks/printful — Printful shipment notifications.
//
// Printful does not sign webhook payloads, so the posture matches the
// Shippo discipline in lib/fulfillment/tracking.ts: the payload is a
// HINT. On package_shipped the handler re-reads the order from
// Printful's API and applies what the API says; the payload's own
// shipment block is used only when the re-read cannot run. Either
// source is safe — the applier (supplier-tracking) is monotonic and
// dedupes notifications. Verified-format events always answer 200.
//
// Registration note: Printful configures webhooks per store
// (POST /webhooks?store_id=…). The connected Printful account
// currently reports ZERO stores, so registration stays a plug-in step
// until a store exists on the account — the receiver is ready for it.
export async function POST(req: NextRequest) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ received: true, ignored: "unparseable body" });
  }

  const type = String(body?.type || "");
  if (type !== "package_shipped") {
    return NextResponse.json({ received: true, ignored: type || "no type" });
  }

  const data = body?.data ?? {};
  const externalOrderId = String(data?.order?.id ?? data?.order_id ?? "");
  if (!externalOrderId) {
    return NextResponse.json({ received: true, ignored: "no order reference" });
  }

  const shipments: SupplierShipment[] = [];

  // Authoritative re-read first.
  const key = await getIntegrationKey("PRINTFUL_API_KEY");
  if (key) {
    try {
      const res = await fetch(
        `https://api.printful.com/orders/${encodeURIComponent(externalOrderId)}`,
        { headers: { Authorization: `Bearer ${key}` } }
      );
      if (res.ok) {
        const order = (await res.json())?.result;
        for (const s of (order?.shipments as any[]) || []) {
          if (!s?.tracking_number && !s?.tracking_url) continue;
          shipments.push({
            carrier: s.carrier ?? null,
            trackingNumber: s.tracking_number ?? null,
            trackingUrl: s.tracking_url ?? null,
            delivered: false,
          });
        }
      }
    } catch {
      // Fall through to the payload.
    }
  }

  // Payload fallback — Printful's package_shipped carries the shipment.
  if (!shipments.length && data?.shipment) {
    const s = data.shipment;
    if (s.tracking_number || s.tracking_url) {
      shipments.push({
        carrier: s.carrier ?? null,
        trackingNumber: s.tracking_number ?? null,
        trackingUrl: s.tracking_url ?? null,
        delivered: false,
      });
    }
  }

  if (!shipments.length) {
    return NextResponse.json({
      received: true,
      matched: 0,
      updated: 0,
      notified: 0,
      skipped: "no shipment data",
    });
  }

  const total = { matched: 0, updated: 0, notified: 0 };
  for (const shipment of shipments) {
    const r = await applySupplierShipment({
      supplierName: "Printful",
      externalOrderId,
      shipment,
    });
    total.matched = Math.max(total.matched, r.matched);
    total.updated += r.updated;
    total.notified += r.notified;
  }
  return NextResponse.json({ received: true, type, ...total });
}
