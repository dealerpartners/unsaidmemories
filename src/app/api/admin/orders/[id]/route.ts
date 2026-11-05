import { NextRequest, NextResponse } from "next/server";
import { adminUpdate, adminDelete, resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { loadOrder, loadOrderItems, parseMoney } from "@/lib/orders/lifecycle";
import { pgQueryStrict } from "@/lib/pg";
import { rollupSplitParentFulfillmentSafe } from "@/lib/sellers/order-split";
import { listOrderSettlements } from "@/lib/settlement/settlement";

const TABLE = "commerce_orders";
const SCHEMA = "public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/orders/[id] — the order detail the lifecycle screen runs on:
// order + resolved customer (shop customers OR crm_customers) + real line
// items + purchased labels + fulfillment event history + open case count.
// Money is returned as NUMBERS (the columns are "$25.27" text).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("orders", "read");
  if (gate) return gate;

  const { id } = await params;
  const tenant = resolveTenantId(req);

  const result = await withPg(async (client) => {
    const o = await loadOrder(client, tenant, id);
    if (!o) return null;

    const items = await loadOrderItems(client, id);

    let labels: any[] = [];
    if (o.tracking_number) {
      const lr = await client.query(
        `SELECT id::text AS id, carrier, tracking_number, label_type, label_uri,
                postage_amount, printed_at::text AS printed_at, created_at::text AS created_at
           FROM public.commerce_shipping_labels
          WHERE tenant_id = $1 AND tracking_number = $2
          ORDER BY created_at DESC`,
        [tenant, o.tracking_number],
      ).catch(() => ({ rows: [] as any[] }));
      labels = lr.rows;
    }

    const ev = await client.query(
      `SELECT event_type, old_status, new_status, payload, created_at::text AS created_at
         FROM public.commerce_fulfillment_events
        WHERE tenant_id = $1 AND payload->>'commerce_order_id' = $2
        ORDER BY created_at DESC
        LIMIT 30`,
      [tenant, id],
    ).catch(() => ({ rows: [] as any[] }));

    const cc = await client.query(
      `SELECT count(*)::int AS open_cases FROM public.order_cases
        WHERE tenant_id = $1 AND order_id = $2 AND status = 'open'`,
      [tenant, id],
    ).catch(() => ({ rows: [{ open_cases: 0 }] as any[] }));

    // Per-seller settlements for this order (contract step 11):
    // every seller's gross / commission / net and settlement state,
    // admin-side. Probe-guarded in the reader — [] until migration
    // 20261197 is applied. Amounts are named *_cents.
    const settlements = await listOrderSettlements(client as any, tenant, id).catch(() => []);

    const metadata = o.metadata && typeof o.metadata === "object" ? o.metadata : {};
    return {
      // snake_case order fields (the detail view's vocabulary)
      id: o.id,
      email: o.email,
      customer_email: o.customer_email_resolved,
      customer_id: o.customer_id,
      crm_customer_id: o.crm_customer_id || null,
      customer_name: o.customer_name,
      customer_phone: o.customer_phone,
      status: o.status,
      payment_status: o.payment_status,
      fulfillment_status: o.fulfillment_status,
      fulfillment_method: o.fulfillment_method,
      subtotal: parseMoney(o.subtotal),
      total_amount: parseMoney(o.total_amount),
      shipping_address: o.shipping_address,
      notes: o.notes,
      metadata,
      tracking_number: o.tracking_number,
      carrier: o.carrier,
      tracking_status: o.tracking_status,
      stripe_checkout_id: o.stripe_checkout_id,
      stripe_payment_intent_id: o.stripe_payment_intent_id,
      created_at: o.created_at,
      updated_at: o.updated_at,
      items,
      labels,
      settlements,
      fulfillmentEvents: ev.rows,
      openCases: cc.rows[0]?.open_cases ?? 0,
    };
  });

  if (!result) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  return NextResponse.json({ data: result, order: result });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const res = await adminUpdate(TABLE, id, body, { tenantId: resolveTenantId(req), schema: SCHEMA, legacyKey: "order" });
  // The orders-page Edit writes fulfillment_status through this
  // generic path — when it moved a checkout-split child, the
  // parent's roll-up follows (a no-op for every other order).
  if (res.ok && body && typeof body === "object" && "fulfillment_status" in body) {
    await rollupSplitParentFulfillmentSafe(
      (sql, qparams) => pgQueryStrict<Record<string, unknown>>(sql, qparams),
      id,
    );
  }
  return res;
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminDelete(TABLE, id, { tenantId: resolveTenantId(req), schema: SCHEMA });
}
