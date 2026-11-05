import { NextRequest, NextResponse } from "next/server";
import { adminList, adminQuery, resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery, pgQueryStrict } from "@/lib/pg";

const TABLE = "acct_customer_statements";
const SCHEMA = "public";
const SEARCH_COLS = ["statement_number", "status"];

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  const q = adminQuery(req);
  return adminList(TABLE, {
    preGated: true,
    tenantId: resolveTenantId(req),
    schema: SCHEMA,
    search: q.search,
    searchCols: SEARCH_COLS,
    limit: q.limit,
    offset: q.offset,
    filters: q.filters,
    ...(q.order ? { order: q.order } : {}),
  });
}

/**
 * POST /api/admin/accounting/statements
 * Generate a customer statement for a period from live invoices + payments.
 * Body: { customer_id, period_start (YYYY-MM-DD), period_end (YYYY-MM-DD) }
 */
export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);

  const body = await req.json().catch(() => null);
  const customerId = body?.customer_id ? String(body.customer_id) : "";
  const periodStart = body?.period_start ? String(body.period_start) : "";
  const periodEnd = body?.period_end ? String(body.period_end) : "";
  if (!customerId || !periodStart || !periodEnd) {
    return NextResponse.json(
      { error: "customer_id, period_start, and period_end are required" },
      { status: 400 },
    );
  }
  if (periodEnd < periodStart) {
    return NextResponse.json(
      { error: "period_end must be on or after period_start" },
      { status: 400 },
    );
  }

  try {
    // Customer match (single invoice record, acct_ar_invoices): the
    // caller's id is a source-space customer id — match it directly on
    // source_customer_id, or through the AR customer carrying it as
    // external_customer_id.
    const customerMatch = `(source_customer_id = $2
         OR customer_id IN (SELECT id FROM public.acct_customers
                             WHERE tenant_id = $1 AND external_customer_id = $2))`;

    // Charges: invoices issued in the period (excluding void)
    const chargeRows = await pgQuery<{ total: string }>(
      `SELECT COALESCE(SUM(total), 0)::text AS total
       FROM public.acct_ar_invoices
       WHERE tenant_id = $1 AND ${customerMatch}
         AND invoice_date >= $3 AND invoice_date <= $4
         AND status <> 'void'`,
      [tenant, customerId, periodStart, periodEnd],
    );
    const chargesTotal = Number(chargeRows[0]?.total || 0);

    // Payments: completed payments in the period
    const payRows = await pgQuery<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
       FROM public.commerce_payments
       WHERE tenant_id = $1 AND customer_id = $2
         AND created_at::date >= $3 AND created_at::date <= $4
         AND status IN ('PAID', 'COMPLETED', 'completed', 'paid', 'succeeded')`,
      [tenant, customerId, periodStart, periodEnd],
    );
    const paymentsTotal = Number(payRows[0]?.total || 0);

    // Opening balance: unpaid invoice balances from before the period
    // (balance derived: total − paid − credited − deposit)
    const bal = `(total - amount_paid - amount_credited - deposit_paid)`;
    const openRows = await pgQuery<{ total: string }>(
      `SELECT COALESCE(SUM(${bal}), 0)::text AS total
       FROM public.acct_ar_invoices
       WHERE tenant_id = $1 AND ${customerMatch}
         AND invoice_date < $3
         AND status NOT IN ('paid', 'void')`,
      [tenant, customerId, periodStart],
    );
    const openingBalance = Number(openRows[0]?.total || 0);

    // Aging buckets on currently unpaid invoices (aged by invoice_date —
    // the consolidation preserved it as the legacy creation date)
    const agingRows = await pgQuery<{
      current: string; d1_30: string; d31_60: string; d61_90: string; over90: string;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN invoice_date > CURRENT_DATE - interval '30 days' THEN ${bal} ELSE 0 END), 0)::text AS current,
         COALESCE(SUM(CASE WHEN invoice_date <= CURRENT_DATE - interval '30 days' AND invoice_date > CURRENT_DATE - interval '60 days' THEN ${bal} ELSE 0 END), 0)::text AS d1_30,
         COALESCE(SUM(CASE WHEN invoice_date <= CURRENT_DATE - interval '60 days' AND invoice_date > CURRENT_DATE - interval '90 days' THEN ${bal} ELSE 0 END), 0)::text AS d31_60,
         COALESCE(SUM(CASE WHEN invoice_date <= CURRENT_DATE - interval '90 days' AND invoice_date > CURRENT_DATE - interval '120 days' THEN ${bal} ELSE 0 END), 0)::text AS d61_90,
         COALESCE(SUM(CASE WHEN invoice_date <= CURRENT_DATE - interval '120 days' THEN ${bal} ELSE 0 END), 0)::text AS over90
       FROM public.acct_ar_invoices
       WHERE tenant_id = $1 AND ${customerMatch} AND status NOT IN ('paid', 'void')`,
      [tenant, customerId],
    );
    const ag = agingRows[0] || { current: "0", d1_30: "0", d31_60: "0", d61_90: "0", over90: "0" };

    const closingBalance =
      Math.round((openingBalance + chargesTotal - paymentsTotal) * 100) / 100;
    const statementNumber = `STMT-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

    const inserted = await pgQueryStrict<{ id: string }>(
      `INSERT INTO public.acct_customer_statements
         (tenant_id, customer_id, statement_number, period_start, period_end,
          opening_balance, charges_total, payments_total, credits_total, closing_balance,
          aging_current, aging_1_30, aging_31_60, aging_61_90, aging_over_90, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12, $13, $14, 'generated')
       RETURNING id::text`,
      [
        tenant, customerId, statementNumber, periodStart, periodEnd,
        openingBalance, chargesTotal, paymentsTotal, closingBalance,
        Number(ag.current || 0), Number(ag.d1_30 || 0), Number(ag.d31_60 || 0),
        Number(ag.d61_90 || 0), Number(ag.over90 || 0),
      ],
    );

    if (!inserted[0]?.id) return NextResponse.json({ error: "Statement insert did not land" }, { status: 500 });
    return NextResponse.json(
      {
        data: {
          id: inserted[0]?.id,
          statement_number: statementNumber,
          opening_balance: openingBalance,
          charges_total: chargesTotal,
          payments_total: paymentsTotal,
          closing_balance: closingBalance,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Statement generation failed: ${msg}` }, { status: 500 });
  }
}
