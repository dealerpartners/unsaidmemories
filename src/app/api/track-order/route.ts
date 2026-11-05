import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/track-order — the public order lookup behind /track-order.
 *
 * Accepts the order reference a customer actually holds — the ERP
 * order number from their confirmation (UNS-…) or the storefront
 * order id — plus the email used at checkout. The order is revealed
 * ONLY on an exact email match against the email recorded on the
 * order (checkout shipping email, or the ERP twin's customer email).
 * Every failure — unknown reference, wrong email — returns the same
 * { found: false } shape, so the endpoint cannot be used to enumerate
 * orders. On a match it returns status + per-supplier shipments
 * (status, carrier tracking number / URL) plus the twin's warehouse
 * shipments (erp_shipments) and ERP status, and nothing else: no names,
 * no addresses, no line-item or payment detail. An ERP-only UNS-…
 * order (twin with no storefront source) is trackable on its own by
 * exact match against the twin's customer email, returning warehouse
 * shipments and no supplier shipments.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const reference = String(body?.reference ?? "").trim().slice(0, 80);
  const email = String(body?.email ?? "").trim().toLowerCase().slice(0, 200);

  if (!reference || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json(
      { error: "Enter your order reference and the email you used at checkout." },
      { status: 400 },
    );
  }

  const sb = createServerClient();
  const tenantId = getTenantId();
  const NOT_FOUND = NextResponse.json({ found: false });

  // Resolve the reference: UNS-… is the ERP twin's order number; the
  // twin points back at the storefront order via source_order_id.
  // A twin with NO storefront source is an ERP-only (manual/admin)
  // order: it is trackable on its own, by exact email match against
  // the twin's customer email, without any storefront row.
  let orderId: string | null = null;
  let orderNumber: string | null = null;
  let twinEmail: string | null = null;
  let erpOnlyTwin: any | null = null;

  if (/^UNS-/i.test(reference)) {
    const { data: twin } = await sb
      .from("erp_orders")
      .select("id, order_number, source_order_id, customer_email, status, order_date, total")
      .eq("tenant_id", tenantId)
      .ilike("order_number", reference)
      .limit(1)
      .maybeSingle();
    if (!twin) return NOT_FOUND;
    if (!twin.source_order_id) {
      // ERP-only order: the email gate is the twin's customer email.
      twinEmail = twin.customer_email ? String(twin.customer_email).toLowerCase() : null;
      if (email !== twinEmail) return NOT_FOUND;
      erpOnlyTwin = twin;
    } else {
      orderId = String(twin.source_order_id);
      orderNumber = String(twin.order_number);
      twinEmail = twin.customer_email ? String(twin.customer_email).toLowerCase() : null;
    }
  } else {
    orderId = reference;
  }

  // ERP-only path: warehouse fulfillment + shipments for the twin itself.
  // Same customer-safe shape as below (status + tracking only).
  if (erpOnlyTwin) {
    const { data: erpFuls } = await sb
      .from("erp_fulfillment_orders")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("order_id", erpOnlyTwin.id);
    const fulIds = (erpFuls ?? []).map((f: any) => String(f.id));
    let warehouseShipments: any[] = [];
    if (fulIds.length) {
      const { data: erpShips } = await sb
        .from("erp_shipments")
        .select("shipment_number, status, tracking_number, tracking_url, shipped_at, delivered_at")
        .in("fulfillment_id", fulIds);
      warehouseShipments = (erpShips ?? []).map((s: any) => ({
        shipmentNumber: s.shipment_number ?? null,
        status: String(s.status),
        trackingNumber: s.tracking_number ?? null,
        trackingUrl: s.tracking_url ?? null,
        shippedAt: s.shipped_at ?? null,
        deliveredAt: s.delivered_at ?? null,
      }));
    }
    return NextResponse.json({
      found: true,
      order: {
        reference: String(erpOnlyTwin.order_number),
        status: String(erpOnlyTwin.status),
        placedAt: erpOnlyTwin.order_date ?? null,
        total: Number(erpOnlyTwin.total) || 0,
      },
      erpStatus: String(erpOnlyTwin.status),
      shipments: [],
      warehouseShipments,
    });
  }

  const { data: order } = await sb
    .from("orders")
    .select("id, status, total, created_at, shipping_address")
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .limit(1)
    .maybeSingle();
  if (!order) return NOT_FOUND;

  const shipEmail = String(
    (order.shipping_address as Record<string, unknown> | null)?.email ?? "",
  ).toLowerCase();
  if (email !== shipEmail && email !== twinEmail) return NOT_FOUND;

  // The twin also gives us the human order number for id-based lookups.
  if (!orderNumber) {
    const { data: twin } = await sb
      .from("erp_orders")
      .select("order_number")
      .eq("tenant_id", tenantId)
      .eq("source_order_id", order.id)
      .limit(1)
      .maybeSingle();
    if (twin?.order_number) orderNumber = String(twin.order_number);
  }

  const { data: fulfillments } = await sb
    .from("fulfillment_orders")
    .select("status, tracking_number, tracking_url, supplier_id, created_at")
    .eq("tenant_id", tenantId)
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });

  const supplierIds = [...new Set((fulfillments ?? []).map((f) => f.supplier_id).filter(Boolean))];
  const supplierNames = new Map<string, string>();
  if (supplierIds.length) {
    const { data: suppliers } = await sb
      .from("suppliers")
      .select("id, name")
      .in("id", supplierIds);
    for (const s of suppliers ?? []) supplierNames.set(String(s.id), String(s.name));
  }

  // Warehouse shipments for the ERP twin (erp_shipments via
  // erp_fulfillment_orders), additive: the supplier `shipments` shape above
  // is unchanged. A twin lookup by id misses nothing — the UNS-… branch
  // already resolved the twin, and id lookups resolve it here.
  let warehouseShipments: any[] = [];
  let erpStatus: string | null = null;
  const { data: twinForShip } = await sb
    .from("erp_orders")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("source_order_id", order.id)
    .limit(1)
    .maybeSingle();
  if (twinForShip) {
    erpStatus = String(twinForShip.status);
    const { data: erpFuls } = await sb
      .from("erp_fulfillment_orders")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("order_id", twinForShip.id);
    const fulIds = (erpFuls ?? []).map((f: any) => String(f.id));
    if (fulIds.length) {
      const { data: erpShips } = await sb
        .from("erp_shipments")
        .select("shipment_number, status, tracking_number, tracking_url, shipped_at, delivered_at")
        .in("fulfillment_id", fulIds);
      warehouseShipments = (erpShips ?? []).map((s: any) => ({
        shipmentNumber: s.shipment_number ?? null,
        status: String(s.status),
        trackingNumber: s.tracking_number ?? null,
        trackingUrl: s.tracking_url ?? null,
        shippedAt: s.shipped_at ?? null,
        deliveredAt: s.delivered_at ?? null,
      }));
    }
  }

  return NextResponse.json({
    found: true,
    order: {
      reference: orderNumber ?? order.id,
      status: String(order.status),
      placedAt: order.created_at,
      total: Number(order.total),
    },
    erpStatus,
    shipments: (fulfillments ?? []).map((f) => ({
      supplier: supplierNames.get(String(f.supplier_id)) ?? "Our maker",
      status: String(f.status),
      trackingNumber: f.tracking_number ?? null,
      trackingUrl: f.tracking_url ?? null,
    })),
    warehouseShipments,
  });
}
