import { NextRequest, NextResponse } from "next/server";
import { adminCreate, resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "acct_ar_receipts";
const SCHEMA = "public";

// GET /api/admin/accounting/payments
//
// Payments & Settlements register (Batch 2 rebuild of the owner's
// payments_settlements.html): two live views in one payload —
//   receipts: every acct_ar_receipts row (money in from customers)
//     with the customer name resolved across acct_customers /
//     crm_customers and the invoices each receipt was applied to
//     (acct_ar_receipt_applications -> acct_ar_invoices).
//   payouts: acct_payouts settlement rows, which are where fee
//     deductions and net settlement actually live (gross, fee,
//     refund and chargeback amounts are stored per payout).
// Receipts carry no fee columns in the schema, so fee/net are
// shown on the settlements table only — never invented per receipt.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const receiptRows = await pgQuery<{
      id: string; receipt_number: string; receipt_date: string | null; customer_name: string;
      amount: string; payment_method: string | null; processor: string | null;
      status: string; reference: string | null; applied: string | null;
    }>(
      `SELECT r.id::text AS id, r.receipt_number, r.receipt_date::text AS receipt_date,
              COALESCE(ac.legal_name,
                       NULLIF(TRIM(COALESCE(cc.company_name, '')), ''),
                       NULLIF(TRIM(CONCAT(COALESCE(cc.first_name, ''), ' ', COALESCE(cc.last_name, ''))), ''),
                       acx.legal_name, '—') AS customer_name,
              r.amount::text AS amount, r.payment_method, r.processor, r.status, r.reference,
              (SELECT STRING_AGG(DISTINCT i.invoice_number, ', ')
                 FROM public.acct_ar_receipt_applications a
                 JOIN public.acct_ar_invoices i ON i.id = a.invoice_id
                WHERE a.receipt_id = r.id) AS applied
         FROM public.acct_ar_receipts r
         LEFT JOIN public.acct_customers ac ON ac.id = r.customer_id
         LEFT JOIN public.crm_customers cc ON cc.id = r.customer_id
         LEFT JOIN public.acct_customers acx ON acx.external_customer_id = r.customer_id::text AND acx.tenant_id = r.tenant_id
        WHERE r.tenant_id = $1
        ORDER BY r.receipt_date DESC NULLS LAST, r.receipt_number DESC
        LIMIT 500`,
      [tenant],
    );
    const payoutRows = await pgQuery<{
      id: string; payout_number: string | null; provider: string | null;
      period_start: string | null; period_end: string | null;
      gross_amount: string; fee_amount: string; refund_amount: string; chargeback_amount: string; net_amount: string;
      status: string; scheduled_for: string | null; arrived_at: string | null;
      destination_type: string | null; destination_last4: string | null;
    }>(
      `SELECT id::text AS id, payout_number, provider,
              period_start::text AS period_start, period_end::text AS period_end,
              gross_amount::text AS gross_amount, fee_amount::text AS fee_amount,
              refund_amount::text AS refund_amount, chargeback_amount::text AS chargeback_amount,
              net_amount::text AS net_amount, status, scheduled_for::text AS scheduled_for,
              arrived_at::text AS arrived_at, destination_type, destination_last4
         FROM public.acct_payouts
        WHERE tenant_id = $1
        ORDER BY COALESCE(arrived_at, created_at) DESC
        LIMIT 300`,
      [tenant],
    );
    const receipts = receiptRows.map((r) => ({
      id: r.id,
      receiptNumber: r.receipt_number,
      receiptDate: r.receipt_date,
      customerName: r.customer_name,
      amount: Number(r.amount || 0),
      paymentMethod: r.payment_method,
      processor: r.processor,
      channel: channelOf(r.payment_method, r.processor),
      status: r.status,
      reference: r.reference,
      appliedInvoices: r.applied,
    }));
    const payouts = payoutRows.map((p) => ({
      id: p.id,
      payoutNumber: p.payout_number,
      provider: p.provider,
      periodStart: p.period_start,
      periodEnd: p.period_end,
      gross: Number(p.gross_amount || 0),
      fees: Number(p.fee_amount || 0),
      refunds: Number(p.refund_amount || 0),
      chargebacks: Number(p.chargeback_amount || 0),
      net: Number(p.net_amount || 0),
      status: p.status,
      scheduledFor: p.scheduled_for,
      arrivedAt: p.arrived_at,
      destination: [p.destination_type, p.destination_last4 ? `••${p.destination_last4}` : null].filter(Boolean).join(" ") || null,
    }));
    return NextResponse.json({
      receipts,
      payouts,
      summary: {
        receiptsTotal: receipts.reduce((s, r) => s + r.amount, 0),
        receiptsCount: receipts.length,
        settlementsGross: payouts.reduce((s, p) => s + p.gross, 0),
        settlementsFees: payouts.reduce((s, p) => s + p.fees, 0),
        settlementsNet: payouts.reduce((s, p) => s + p.net, 0),
      },
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/payments]", e);
    return NextResponse.json({ error: e?.message || "Failed to load payments" }, { status: 500 });
  }
}

function channelOf(method: string | null, processor: string | null): string {
  const m = String(method || "").toLowerCase();
  const p = String(processor || "").toLowerCase();
  if (m.includes("ach")) return "ACH Inbound";
  if (m.includes("wire") || m.includes("bank_transfer")) return "Wire / Bank Transfer";
  if (m.includes("card") && p.includes("stripe")) return "Stripe CC";
  if (m.includes("card")) return "Card";
  if (m.includes("store_credit")) return "Store Credit";
  if (m.includes("cash")) return "Cash";
  if (m.includes("check")) return "Check";
  return method || "Other";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return adminCreate(TABLE, body, { tenantId: resolveTenantId(req), schema: SCHEMA });
}
