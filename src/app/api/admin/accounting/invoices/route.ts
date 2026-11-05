import { NextRequest, NextResponse } from "next/server";
import { adminCreate, resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "acct_ar_invoices";
const SCHEMA = "public";

// GET /api/admin/accounting/invoices
//
// Invoices & Billing register (Batch 2 rebuild of the owner's
// invoices_billing.html): every acct_ar_invoices row with the
// customer name resolved across the AR twin (acct_customers) and
// the CRM record, the live balance (total − paid − credited −
// deposit), and an overdue flag computed from due_date. Summary
// counts feed the page's status tabs (All / Needs Attention /
// Drafts / Unpaid / Paid).

const BALANCE = `(i.total - i.amount_paid - i.amount_credited - i.deposit_paid)`;

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const rows = await pgQuery<{
      id: string; invoice_number: string; customer_name: string; customer_email: string | null;
      invoice_date: string | null; due_date: string | null; terms: string | null; currency: string;
      total: string; amount_paid: string; amount_credited: string; deposit_paid: string;
      balance_due: string; status: string; sent_at: string | null; overdue: boolean; days_overdue: number;
    }>(
      `SELECT i.id::text AS id, i.invoice_number,
              COALESCE(ac.legal_name,
                       NULLIF(TRIM(COALESCE(cc.company_name, '')), ''),
                       NULLIF(TRIM(CONCAT(COALESCE(cc.first_name, ''), ' ', COALESCE(cc.last_name, ''))), ''),
                       acx.legal_name, '—') AS customer_name,
              COALESCE(ac.email, cc.email) AS customer_email,
              i.invoice_date::text AS invoice_date, i.due_date::text AS due_date,
              i.terms, COALESCE(i.currency, 'USD') AS currency,
              i.total::text AS total, i.amount_paid::text AS amount_paid,
              i.amount_credited::text AS amount_credited, i.deposit_paid::text AS deposit_paid,
              ${BALANCE}::text AS balance_due, i.status, i.sent_at::text AS sent_at,
              (i.status NOT IN ('paid','void','cancelled','draft') AND ${BALANCE} > 0
                AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS overdue,
              CASE WHEN i.due_date IS NOT NULL THEN GREATEST(0, (CURRENT_DATE - i.due_date)) ELSE 0 END::int AS days_overdue
         FROM public.acct_ar_invoices i
         LEFT JOIN public.acct_customers ac ON ac.id = i.customer_id
         LEFT JOIN public.crm_customers cc ON cc.id = i.customer_id
         LEFT JOIN public.acct_customers acx ON acx.external_customer_id = i.customer_id::text AND acx.tenant_id = i.tenant_id
        WHERE i.tenant_id = $1
        ORDER BY i.invoice_date DESC NULLS LAST, i.created_at DESC
        LIMIT 500`,
      [tenant],
    );
    const invoices = rows.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoice_number,
      customerName: r.customer_name,
      customerEmail: r.customer_email,
      invoiceDate: r.invoice_date,
      dueDate: r.due_date,
      terms: r.terms,
      currency: r.currency || "USD",
      total: Number(r.total || 0),
      amountPaid: Number(r.amount_paid || 0),
      amountCredited: Number(r.amount_credited || 0),
      depositPaid: Number(r.deposit_paid || 0),
      balanceDue: Number(r.balance_due || 0),
      status: r.status,
      sentAt: r.sent_at,
      overdue: Boolean(r.overdue),
      daysOverdue: Number(r.days_overdue || 0),
    }));
    const isOpen = (v: (typeof invoices)[number]) => !["paid", "void", "cancelled"].includes(v.status);
    return NextResponse.json({
      invoices,
      total: invoices.length,
      summary: {
        drafts: invoices.filter((v) => v.status === "draft").length,
        unpaid: invoices.filter((v) => isOpen(v) && v.status !== "draft" && v.balanceDue > 0).length,
        paid: invoices.filter((v) => v.status === "paid").length,
        needsAttention: invoices.filter((v) => v.overdue).length,
        openBalance: invoices.filter((v) => isOpen(v) && v.status !== "draft").reduce((s, v) => s + Math.max(0, v.balanceDue), 0),
        overdueBalance: invoices.filter((v) => v.overdue).reduce((s, v) => s + Math.max(0, v.balanceDue), 0),
      },
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/invoices]", e);
    return NextResponse.json({ error: e?.message || "Failed to load invoices" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return adminCreate(TABLE, body, { tenantId: resolveTenantId(req), schema: SCHEMA });
}
