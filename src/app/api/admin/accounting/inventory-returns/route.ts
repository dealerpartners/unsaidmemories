import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/inventory-returns
//
// Returns / RMA register (owner's returns.html) over the REAL
// returns storage: erp_return_authorizations + erp_return_lines,
// joined to the ERP order, the first line's product for display, and
// line quantities/dispositions. Actions are executed by the existing
// ERP returns endpoint (approve / receive / complete) — receive
// restocks non-damaged lines through the ERP movement pipeline.

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Pending review",
  approved: "Approved — awaiting package",
  received: "Received — in review",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const rows = await pgQuery<{
      id: string; rma_number: string; order_id: string; order_number: string | null;
      customer: string | null; reason_code: string | null; status: string;
      requested_at: string; approved_at: string | null; received_at: string | null; completed_at: string | null;
      product_name: string | null; sku: string | null; qty_requested: string; refund_total: string;
      dispositions: string | null;
    }>(
      `SELECT ra.id::text AS id, ra.rma_number, ra.order_id::text AS order_id,
              o.order_number, o.customer_email AS customer,
              ra.reason_code, ra.status,
              ra.requested_at::text AS requested_at, ra.approved_at::text AS approved_at,
              ra.received_at::text AS received_at, ra.completed_at::text AS completed_at,
              (SELECT p.name FROM public.erp_return_lines rl
                 JOIN public.product_variants pv ON pv.id = rl.sku_id
                 JOIN public.products p ON p.id = pv.product_id
                WHERE rl.rma_id = ra.id ORDER BY rl.line_no ASC LIMIT 1) AS product_name,
              (SELECT pv.sku FROM public.erp_return_lines rl
                 JOIN public.product_variants pv ON pv.id = rl.sku_id
                WHERE rl.rma_id = ra.id ORDER BY rl.line_no ASC LIMIT 1) AS sku,
              (SELECT COALESCE(SUM(quantity_requested), 0)::text FROM public.erp_return_lines WHERE rma_id = ra.id) AS qty_requested,
              (SELECT COALESCE(SUM(COALESCE(refund_amount, 0)), 0)::text FROM public.erp_return_lines WHERE rma_id = ra.id) AS refund_total,
              (SELECT STRING_AGG(DISTINCT disposition, ', ') FROM public.erp_return_lines WHERE rma_id = ra.id AND disposition IS NOT NULL) AS dispositions
         FROM public.erp_return_authorizations ra
         LEFT JOIN public.erp_orders o ON o.id = ra.order_id
        WHERE ra.tenant_id = $1
        ORDER BY ra.requested_at DESC
        LIMIT 200`,
      [tenant],
    );
    const counts = await pgQuery<{ status: string; n: number }>(
      `SELECT status, COUNT(*)::int AS n FROM public.erp_return_authorizations
        WHERE tenant_id = $1 GROUP BY status`,
      [tenant],
    );
    const byStatus = new Map(counts.map((c) => [c.status, Number(c.n)]));
    return NextResponse.json({
      rmas: rows.map((r) => ({
        id: r.id, rmaNumber: r.rma_number, orderId: r.order_id, orderNumber: r.order_number,
        customer: r.customer, reason: r.reason_code, status: r.status,
        statusLabel: STATUS_LABEL[r.status] || r.status.replace(/_/g, " "),
        requestedAt: r.requested_at, approvedAt: r.approved_at,
        receivedAt: r.received_at, completedAt: r.completed_at,
        productName: r.product_name, sku: r.sku,
        qtyRequested: Number(r.qty_requested || 0),
        refundTotal: Number(r.refund_total || 0),
        dispositions: r.dispositions,
      })),
      summary: {
        pendingReview: byStatus.get("pending_review") || 0,
        approved: byStatus.get("approved") || 0,
        received: byStatus.get("received") || 0,
        completed: byStatus.get("completed") || 0,
        total: [...byStatus.values()].reduce((a, b) => a + b, 0),
      },
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/inventory-returns]", e);
    return NextResponse.json({ error: e?.message || "Failed to load returns" }, { status: 500 });
  }
}
