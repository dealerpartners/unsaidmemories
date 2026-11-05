import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/inventory-fulfillment
//
// Dropship / Supplier Fulfillment (owner's
// dropship_supplier_fulfillment.html) — the Option A queue: supplier
// fulfillment drafts created by the checkout flow
// (fulfillment_orders + fulfillment_items on the storefront order),
// presented grouped by supplier, ready to send. Each ERP order joins
// to its storefront twin via erp_orders.source_order_id =
// orders.id::text. Dispatch runs through the EXISTING endpoint
// POST /api/admin/erp/orders/[id]/push — orders with no draft show
// their true state instead of a pretend queue row.

type Fulfillment = {
  id: string; supplierId: string; supplierName: string | null; supplierSlug: string | null;
  status: string; cost: number | null; externalId: string | null;
  trackingNumber: string | null; trackingUrl: string | null; items: number;
};

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const orders = await pgQuery<{
      id: string; order_number: string; source_order_id: string | null;
      status: string; total: string; customer_email: string | null; order_date: string;
      lines: number; first_product: string | null;
    }>(
      `SELECT eo.id::text AS id, eo.order_number, eo.source_order_id, eo.status,
              eo.total::text AS total, eo.customer_email, eo.order_date::text AS order_date,
              (SELECT COUNT(*)::int FROM public.erp_order_lines l WHERE l.order_id = eo.id) AS lines,
              (SELECT l.description FROM public.erp_order_lines l WHERE l.order_id = eo.id ORDER BY l.line_no ASC LIMIT 1) AS first_product
         FROM public.erp_orders eo
        WHERE eo.tenant_id = $1
        ORDER BY eo.order_date DESC
        LIMIT 100`,
      [tenant],
    );
    const storefrontIds = orders.map((o) => o.source_order_id).filter(Boolean) as string[];
    let fuls: (Fulfillment & { order_id: string })[] = [];
    if (storefrontIds.length) {
      const rows = await pgQuery<any>(
        `SELECT fo.id::text AS id, fo.order_id::text AS order_id, fo.supplier_id::text AS supplierId,
                s.name AS supplierName, s.slug AS supplierSlug, fo.status,
                fo.cost::text AS cost, fo.supplier_order_external_id AS externalId,
                fo.tracking_number AS trackingNumber, fo.tracking_url AS trackingUrl,
                (SELECT COUNT(*)::int FROM public.fulfillment_items fi WHERE fi.fulfillment_order_id = fo.id) AS items
           FROM public.fulfillment_orders fo
           LEFT JOIN public.suppliers s ON s.id = fo.supplier_id
          WHERE fo.order_id = ANY($1::uuid[])
          ORDER BY fo.created_at ASC`,
        [storefrontIds],
      );
      fuls = rows.map((r) => ({
        id: r.id, order_id: r.order_id, supplierId: r.supplierId,
        supplierName: r.supplierName, supplierSlug: r.supplierSlug, status: r.status,
        cost: r.cost != null ? Number(r.cost) : null, externalId: r.externalId,
        trackingNumber: r.trackingNumber, trackingUrl: r.trackingUrl, items: Number(r.items || 0),
      }));
    }
    const byOrder = new Map<string, Fulfillment[]>();
    for (const f of fuls) {
      const list = byOrder.get(f.order_id) || [];
      list.push(f);
      byOrder.set(f.order_id, list);
    }
    const queue = orders.map((o) => {
      const list = o.source_order_id ? byOrder.get(o.source_order_id) || [] : [];
      const state = list.some((f) => f.status === "failed") ? "Needs attention"
        : list.some((f) => f.status === "draft") ? "Ready to send"
        : list.some((f) => f.status === "submitted" || f.status === "in_production") ? "With supplier"
        : list.some((f) => f.status === "shipped") ? "Shipped"
        : list.some((f) => f.status === "delivered") ? "Delivered"
        : list.length > 0 ? "Closed with supplier"
        : "No supplier draft yet";
      return {
        erpOrderId: o.id, orderNumber: o.order_number, erpStatus: o.status,
        total: Number(o.total || 0), customer: o.customer_email,
        orderDate: o.order_date, lines: Number(o.lines || 0),
        firstProduct: o.first_product, state, fulfillments: list,
      };
    });
    const groups = new Map<string, { supplier: string; drafts: number; orders: Set<string> }>();
    for (const q of queue) for (const f of q.fulfillments) {
      if (f.status !== "draft") continue;
      const key = f.supplierName || "Unrouted";
      const g = groups.get(key) || { supplier: key, drafts: 0, orders: new Set<string>() };
      g.drafts += 1; g.orders.add(q.erpOrderId);
      groups.set(key, g);
    }
    return NextResponse.json({
      queue,
      supplierGroups: [...groups.values()].map((g) => ({ supplier: g.supplier, drafts: g.drafts, orders: g.orders.size })),
      summary: {
        readyToSend: queue.filter((q) => q.state === "Ready to send").length,
        needsAttention: queue.filter((q) => q.state === "Needs attention").length,
        withSupplier: queue.filter((q) => q.state === "With supplier").length,
        noDraft: queue.filter((q) => q.state === "No supplier draft yet").length,
      },
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/inventory-fulfillment]", e);
    return NextResponse.json({ error: e?.message || "Failed to load fulfillment queue" }, { status: 500 });
  }
}
