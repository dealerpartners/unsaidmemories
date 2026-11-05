import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery, pgExec } from "@/lib/pg";
import { resolveEntityId } from "@/lib/accounting/invoice-store";
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit";

// ============================================================================
// POST /api/admin/accounting/bills/[id]/pay — record a payment against
// a bill (purchase order).
//
// §3.9 gap: bills were a read-only list; acct_ap_payments existed with
// zero writers from the bills surface ("payment_id exists only on
// deposits"). This is the missing leg:
//   erp_purchase_orders (the bill) → acct_ap_payments (the payment,
//   reference = PO number, cash account resolved from the tenant's own
//   chart of accounts) → PO status 'closed' when the balance reaches
//   zero. Guards: cancelled bills can't be paid; a payment that would
//   exceed the bill total is rejected (no silent overpayment); a
//   missing chart cash account or accounting entity is an honest 422,
//   never a fabricated row.
// ============================================================================

const sql = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
  pgQuery<T>(text, params);

async function resolveCashAccountId(tenantId: string): Promise<string | null> {
  const rows = await sql<{ id: string }>(
    `SELECT id::text AS id FROM public.acct_chart_of_accounts
      WHERE tenant_id = $1
        AND (code IN ('1000', '1010', '1020')
             OR (account_type = 'asset' AND (name ILIKE '%cash%' OR name ILIKE '%bank%' OR name ILIKE '%checking%')))
      ORDER BY (code = '1000') DESC, code
      LIMIT 1`,
    [tenantId],
  );
  return rows[0]?.id ?? null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const tenantId = resolveTenantId(req);
  const { id } = await ctx.params;

  let body: { amount?: number; method?: string; notes?: string } = {};
  try { body = await req.json(); } catch { /* amount defaults to the balance */ }

  try {
    const pos = await sql<{ id: string; po_number: string; vendor_id: string | null; total: string; status: string; currency: string }>(
      `SELECT id::text AS id, po_number, vendor_id::text AS vendor_id, total::text AS total, status, currency
         FROM public.erp_purchase_orders WHERE tenant_id = $1 AND id = $2::uuid LIMIT 1`,
      [tenantId, id],
    );
    const po = pos[0];
    if (!po) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    if (po.status === "cancelled") {
      return NextResponse.json({ error: "A cancelled bill cannot be paid" }, { status: 422 });
    }

    const paidRows = await sql<{ paid: string; n: number }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS paid, COUNT(*)::int AS n
         FROM public.acct_ap_payments
        WHERE tenant_id = $1 AND reference = $2 AND status::text <> 'void'`,
      [tenantId, po.po_number],
    );
    const alreadyPaid = Number(paidRows[0]?.paid) || 0;
    const total = Number(po.total) || 0;
    const remaining = Math.max(0, total - alreadyPaid);
    const amount = body.amount !== undefined && body.amount !== null ? Number(body.amount) : remaining;
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Payment amount must be greater than zero" }, { status: 400 });
    }
    if (amount > remaining + 0.005) {
      return NextResponse.json(
        { error: `Payment of $${amount.toFixed(2)} exceeds the remaining balance of $${remaining.toFixed(2)} on ${po.po_number}` },
        { status: 422 },
      );
    }

    const entityId = await resolveEntityId(sql, tenantId);
    if (!entityId) {
      return NextResponse.json({ error: "No accounting entity is configured for this tenant — set up accounting before recording payments" }, { status: 422 });
    }
    const cashAccountId = await resolveCashAccountId(tenantId);
    if (!cashAccountId) {
      return NextResponse.json({ error: "No cash/bank account exists in the chart of accounts — add one before recording payments" }, { status: 422 });
    }

    const countRows = await sql<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM public.acct_ap_payments WHERE tenant_id = $1`,
      [tenantId],
    );
    const paymentNumber = `AP-${String((countRows[0]?.n ?? 0) + 1).padStart(5, "0")}`;
    const method = (body.method || "bank_transfer").trim() || "bank_transfer";

    const inserted = await sql<{ id: string }>(
      `INSERT INTO public.acct_ap_payments
         (tenant_id, entity_id, vendor_id, payment_number, payment_date, currency,
          amount, payment_method, status, cash_account_id, reference)
       VALUES ($1, $2::uuid, $3::uuid, $4, CURRENT_DATE, $5, $6, $7, 'completed', $8::uuid, $9)
       RETURNING id::text AS id`,
      [tenantId, entityId, po.vendor_id, paymentNumber, po.currency || "USD", amount, method, cashAccountId, po.po_number],
    );

    const newPaid = alreadyPaid + amount;
    const settled = newPaid >= total - 0.005;
    let poStatus = po.status;
    if (settled && po.status !== "closed") {
      await pgExec(
        `UPDATE public.erp_purchase_orders SET status = 'closed', updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenantId, id],
      );
      poStatus = "closed";
    }

    const actorId = await getActorIdFromRequest(req).catch(() => null);
    await auditAction({
      action: "fin_pay_bill", domain: "acct", tableName: "acct_ap_payments",
      recordId: inserted[0]?.id ?? null, actorUserId: actorId,
      ipAddress: req.headers.get("x-forwarded-for"),
      afterData: { po_number: po.po_number, payment_number: paymentNumber, amount, method, settled },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      paymentId: inserted[0]?.id ?? null,
      paymentNumber,
      paidTotal: newPaid,
      remaining: Math.max(0, total - newPaid),
      poStatus,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to record payment" },
      { status: 500 },
    );
  }
}
