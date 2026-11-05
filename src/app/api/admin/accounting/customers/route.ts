import { NextRequest, NextResponse } from "next/server";
import { adminCreate, adminUpdate, resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/customers
//
// §3.2 Accounting → Customers: the AR customer ledger as its own
// surface. One row per acct_customers record (the AR twin that
// ensureAcctCustomer maintains for every invoiced CRM customer), with
// the customer's live receivables position aggregated from
// acct_ar_invoices: open balance, open invoice count, lifetime
// invoiced, and last invoice date. Balance arithmetic matches the
// invoices list: total − amount_paid − amount_credited − deposit_paid.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const rows = await pgQuery<{
      id: string; customer_number: string; legal_name: string | null; email: string | null;
      phone: string | null; credit_limit: string | null; is_active: boolean;
      currency: string; payment_terms_days: number | null; external_customer_id: string | null;
      open_balance: string; open_invoices: number; total_invoiced: string; last_invoice_date: string | null;
      overdue_balance: string; overdue_invoices: number; max_days_overdue: number; oldest_open_invoice_id: string | null;
    }>(
      `SELECT c.id::text AS id, c.customer_number, c.legal_name, c.email,
              c.phone, c.credit_limit::text AS credit_limit, c.is_active,
              c.currency, c.payment_terms_days, c.external_customer_id,
              COALESCE(SUM(i.total - i.amount_paid - i.amount_credited - i.deposit_paid)
                FILTER (WHERE i.status IN ('posted','partially_paid','approved','sent')
                          AND (i.total - i.amount_paid - i.amount_credited - i.deposit_paid) > 0), 0)::text AS open_balance,
              COUNT(i.id) FILTER (WHERE i.status IN ('posted','partially_paid','approved','sent')
                          AND (i.total - i.amount_paid - i.amount_credited - i.deposit_paid) > 0)::int AS open_invoices,
              COALESCE(SUM(i.total) FILTER (WHERE i.status <> 'void'), 0)::text AS total_invoiced,
              MAX(i.invoice_date)::text AS last_invoice_date,
              COALESCE(SUM(i.total - i.amount_paid - i.amount_credited - i.deposit_paid)
                FILTER (WHERE i.status IN ('posted','partially_paid','approved','sent')
                          AND (i.total - i.amount_paid - i.amount_credited - i.deposit_paid) > 0
                          AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE), 0)::text AS overdue_balance,
              COUNT(i.id) FILTER (WHERE i.status IN ('posted','partially_paid','approved','sent')
                          AND (i.total - i.amount_paid - i.amount_credited - i.deposit_paid) > 0
                          AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE)::int AS overdue_invoices,
              COALESCE(MAX(CURRENT_DATE - i.due_date) FILTER (WHERE i.status IN ('posted','partially_paid','approved','sent')
                          AND (i.total - i.amount_paid - i.amount_credited - i.deposit_paid) > 0
                          AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE), 0)::int AS max_days_overdue,
              (ARRAY_AGG(i.id::text ORDER BY i.due_date ASC NULLS LAST) FILTER (WHERE i.status IN ('posted','partially_paid','approved','sent')
                          AND (i.total - i.amount_paid - i.amount_credited - i.deposit_paid) > 0))[1] AS oldest_open_invoice_id
         FROM public.acct_customers c
         LEFT JOIN public.acct_ar_invoices i
           ON (i.customer_id = c.id OR i.customer_id::text = c.external_customer_id) AND i.tenant_id = c.tenant_id
        WHERE c.tenant_id = $1
        GROUP BY c.id
        ORDER BY open_balance DESC, c.legal_name ASC`,
      [tenant],
    );
    return NextResponse.json({
      customers: rows.map((r) => {
        const openBalance = Number(r.open_balance || 0);
        const creditLimit = r.credit_limit != null ? Number(r.credit_limit) : null;
        const overdueInvoices = Number(r.overdue_invoices || 0);
        const maxDaysOverdue = Number(r.max_days_overdue || 0);
        const health = !r.is_active
          ? "Inactive"
          : overdueInvoices === 0
            ? "Good standing"
            : maxDaysOverdue > 30
              ? "At risk"
              : "Watch";
        return {
          id: r.id,
          customerNumber: r.customer_number,
          name: r.legal_name || "Customer",
          email: r.email,
          phone: r.phone,
          isActive: r.is_active !== false,
          currency: r.currency || "USD",
          paymentTermsDays: r.payment_terms_days,
          sourceCustomerId: r.external_customer_id,
          creditLimit,
          availableCredit: creditLimit != null && creditLimit > 0 ? Math.max(0, creditLimit - openBalance) : null,
          openBalance,
          openInvoices: Number(r.open_invoices || 0),
          totalInvoiced: Number(r.total_invoiced || 0),
          lastInvoiceDate: r.last_invoice_date,
          overdueBalance: Number(r.overdue_balance || 0),
          overdueInvoices,
          maxDaysOverdue,
          health,
          oldestOpenInvoiceId: r.oldest_open_invoice_id,
        };
      }),
      total: rows.length,
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/customers]", e);
    return NextResponse.json({ error: e?.message || "Failed to load AR customers" }, { status: 500 });
  }
}

// POST /api/admin/accounting/customers
// { action: "set_credit_limit", id, credit_limit } — updates the AR
// customer's credit limit (drives the Available Credit column).
// Any other body is treated as a new acct_customers record; the
// customer_number is assigned here (next CUS-#### in sequence).

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    if (body.action === "set_credit_limit") {
      if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const limit = body.credit_limit === null || body.credit_limit === "" ? null : Number(body.credit_limit);
      if (limit !== null && (!Number.isFinite(limit) || limit < 0)) {
        return NextResponse.json({ error: "credit_limit must be a non-negative number" }, { status: 400 });
      }
      return adminUpdate("acct_customers", String(body.id), { credit_limit: limit }, { preGated: true, tenantId: tenant, schema: "public" });
    }

    if (!body.legal_name) return NextResponse.json({ error: "legal_name is required" }, { status: 400 });
    const seq = await pgQuery<{ next_num: number }>(
      `SELECT COALESCE(MAX(NULLIF(regexp_replace(customer_number, '^.*-([0-9]+)$', '\\1'), '')::int), 2000) + 1 AS next_num
         FROM public.acct_customers WHERE tenant_id = $1`,
      [tenant],
    );
    const customerNumber = `CUS-${seq[0]?.next_num ?? 2001}`;
    return adminCreate("acct_customers", {
      customer_number: customerNumber,
      legal_name: String(body.legal_name),
      email: body.email || null,
      phone: body.phone || null,
      currency: "USD",
      payment_terms_days: body.payment_terms_days ? Number(body.payment_terms_days) : 30,
      credit_limit: body.credit_limit ? Number(body.credit_limit) : null,
      is_active: true,
    }, { preGated: true, tenantId: tenant, schema: "public" });
  } catch (e: any) {
    console.error("[POST /api/admin/accounting/customers]", e);
    return NextResponse.json({ error: e?.message || "Failed to save AR customer" }, { status: 500 });
  }
}
