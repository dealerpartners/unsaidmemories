import { NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

// ============================================================================
// GET /api/admin/accounting/bills — paid amounts per purchase order.
//
// §3.9 (Bills) gap: the bills list rendered purchase orders read-only
// with no payment state at all — acct_ap_payments (the AP payment
// ledger) was never joined to the bills it settles. Payments recorded
// against a bill carry reference = the PO number (the vendor-facing
// bill reference); this endpoint aggregates them per PO so the list can
// show Paid / Remaining and the Record Payment control can guard
// against overpayment. Read-only.
// ============================================================================

export async function GET() {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  const tenantId = resolveTenantId();
  try {
    const rows = await pgQuery<{ po_id: string; po_number: string; paid: string; payment_count: number }>(
      `SELECT po.id::text AS po_id, po.po_number,
              COALESCE(SUM(p.amount), 0)::text AS paid,
              COUNT(p.id)::int AS payment_count
         FROM public.erp_purchase_orders po
         LEFT JOIN public.acct_ap_payments p
           ON p.tenant_id = po.tenant_id AND p.reference = po.po_number
          AND p.status::text <> 'void'
        WHERE po.tenant_id = $1
        GROUP BY po.id, po.po_number`,
      [tenantId],
    );
    const paidByPo: Record<string, { paid: number; paymentCount: number }> = {};
    for (const r of rows) paidByPo[r.po_id] = { paid: Number(r.paid) || 0, paymentCount: r.payment_count };
    return NextResponse.json({ ok: true, paidByPo });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load bill payments" },
      { status: 500 },
    );
  }
}
