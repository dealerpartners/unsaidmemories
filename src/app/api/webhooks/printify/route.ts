import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getIntegrationKey } from "@/lib/integrations/keys";
import { syncPrintifyOrder } from "@/lib/fulfillment/supplier-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/webhooks/printify — Printify shipment notifications, the
// wire that carries tracking back from the supplier on its own.
//
// Signature verification is MANDATORY, same discipline as the Stripe
// and Authorize.net webhooks: no PRINTIFY_WEBHOOK_SECRET configured →
// 500, bad X-Pfy-Signature → 401, no unauthenticated fallback.
//
// The payload is treated as a HINT: on order:shipment:created,
// order:shipment:delivered and order:updated the handler re-reads the
// order from Printify's API and applies what the API says
// (lib/fulfillment/supplier-tracking) — tracking lands on
// fulfillment_orders and the customer is notified once per real
// transition. Verified events always answer 200, including no-ops for
// orders this store does not own: Printify retries non-200s three
// times and then blocks the hook for an hour.
export async function POST(req: NextRequest) {
  const secret = await getIntegrationKey("PRINTIFY_WEBHOOK_SECRET");
  if (!secret) {
    return NextResponse.json(
      { error: "PRINTIFY_WEBHOOK_SECRET is not configured — webhook refused" },
      { status: 500 }
    );
  }

  const rawBody = await req.text();
  const provided = (req.headers.get("x-pfy-signature") || "").replace(/^sha256=/, "");
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: any = null;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ received: true, ignored: "unparseable body" });
  }

  const topic = String(body?.type || body?.topic || "");
  const data = body?.data ?? {};
  const watched = [
    "order:shipment:created",
    "order:shipment:delivered",
    "order:updated",
  ];
  if (!watched.includes(topic)) {
    return NextResponse.json({ received: true, ignored: topic || "no topic" });
  }

  // Shipment resources reference their order; order resources are the
  // order. Either way the API re-read decides what is true.
  const externalOrderId = String(
    data?.order_id ?? data?.id ?? body?.resource_id ?? ""
  );
  if (!externalOrderId) {
    return NextResponse.json({ received: true, ignored: "no order reference" });
  }

  const result = await syncPrintifyOrder(
    externalOrderId,
    topic === "order:shipment:delivered"
  );
  return NextResponse.json({ received: true, topic, ...result });
}
