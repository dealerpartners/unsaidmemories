import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery, pgExec, pgQueryStrict } from "@/lib/pg";
import {
  ensureAcctCustomer,
  resolveEntityId,
  resolveRevenueAccountId,
  type SqlFn,
} from "@/lib/accounting/invoice-store";
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/accounting/estimates/[id]/convert
//
// §3.2 Estimates — the convert-to-invoice write. Until now "converted"
// was only a status flag on acct_estimates: no invoice was ever created.
// This route performs the real conversion:
//   1. resolves the tenant's accounting entity, AR customer (via
//      ensureAcctCustomer on the estimate's CRM customer) and revenue
//      account — the same placement the invoices POST performs;
//   2. mints the next INV-#### number and inserts acct_ar_invoices
//      (status 'posted', due = today + the AR customer's terms);
//   3. copies acct_estimate_lines into acct_ar_invoice_lines (or, for
//      a totals-only estimate, a single line carrying the subtotal);
//   4. stamps the estimate: status 'converted' + converted_invoice_id.
// Idempotent: an estimate that already carries converted_invoice_id
// returns that invoice instead of minting a second one.

const q: SqlFn = async (text, params) => pgQuery(text, params as any);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const { id } = await ctx.params;
  const tenant = resolveTenantId(req);
  try {
    const est = await pgQuery<any>(
      `SELECT id::text AS id, estimate_number, customer_id::text AS customer_id,
              issue_date::text AS issue_date, currency, subtotal::text AS subtotal,
              tax_total::text AS tax_total, discount_total::text AS discount_total,
              total::text AS total, status::text AS status, notes,
              converted_invoice_id::text AS converted_invoice_id
         FROM public.acct_estimates
        WHERE id = $1::uuid AND tenant_id = $2`,
      [id, tenant],
    );
    if (!est[0]) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    const e = est[0];
    if (e.converted_invoice_id) {
      return NextResponse.json({ ok: true, invoiceId: e.converted_invoice_id, idempotent: true, message: `Estimate ${e.estimate_number} was already converted` });
    }
    if (["declined", "void", "expired"].includes(String(e.status))) {
      return NextResponse.json({ error: `Estimate ${e.estimate_number} is ${e.status} — it cannot be converted` }, { status: 422 });
    }
    if (!e.customer_id) {
      return NextResponse.json({ error: "Estimate has no customer — assign a customer before converting" }, { status: 422 });
    }

    const entityId = await resolveEntityId(q, tenant);
    if (!entityId) return NextResponse.json({ error: "No accounting entity configured for this tenant" }, { status: 500 });
    const cust = await pgQuery<{ first_name: string | null; last_name: string | null; email: string | null; payment_terms_days: number | null }>(
      `SELECT cc.first_name, cc.last_name, cc.email, ac.payment_terms_days
         FROM public.crm_customers cc
         LEFT JOIN public.acct_customers ac
           ON ac.tenant_id = cc.tenant_id AND ac.external_customer_id = cc.id::text
        WHERE cc.id = $1::uuid AND cc.tenant_id = $2 LIMIT 1`,
      [e.customer_id, tenant],
    );
    const legalName = [cust[0]?.first_name, cust[0]?.last_name].filter(Boolean).join(" ").trim() || null;
    const acctCustomerId = await ensureAcctCustomer(q, tenant, {
      sourceId: String(e.customer_id),
      legalName,
      email: cust[0]?.email || null,
    });
    const revenueAccountId = await resolveRevenueAccountId(q, tenant);
    if (!revenueAccountId) return NextResponse.json({ error: "No revenue account configured for this tenant" }, { status: 500 });
    const termsDays = Number(cust[0]?.payment_terms_days || 30) || 30;

    const seq = await pgQuery<{ next: string }>(
      `SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '\\D', '', 'g'), '')::bigint), 0) + 1 AS next
         FROM public.acct_ar_invoices WHERE tenant_id = $1 AND invoice_number LIKE 'INV-%'`,
      [tenant],
    );
    const number = `INV-${String((seq as any)[0]?.next ?? 1).padStart(4, "0")}`;

    const subtotal = Number(e.subtotal || 0);
    const total = Number(e.total || 0);
    const inv = await pgQueryStrict<{ id: string }>(
      `INSERT INTO public.acct_ar_invoices
         (tenant_id, entity_id, customer_id, source_customer_id,
          invoice_number, status, invoice_date, due_date,
          subtotal, tax_total, discount_total, total,
          amount_paid, amount_credited, deposit_paid, currency, notes)
       VALUES ($1, $2, $3::uuid, $4, $5, 'posted',
               COALESCE($6::date, CURRENT_DATE), CURRENT_DATE + $7::int,
               $8, $9, $10, $11, 0, 0, 0, $12, $13)
       RETURNING id::text AS id`,
      [tenant, entityId, acctCustomerId, e.customer_id, number,
       e.issue_date || null, termsDays,
       subtotal, Number(e.tax_total || 0), Number(e.discount_total || 0), total,
       e.currency || "USD",
       [`Converted from estimate ${e.estimate_number}`, e.notes].filter(Boolean).join(" — ")],
    );
    const invoiceId = inv[0]?.id;
    if (!invoiceId) return NextResponse.json({ error: "Invoice insert did not land" }, { status: 500 });

    let copied = await pgExec(
      `INSERT INTO public.acct_ar_invoice_lines
         (invoice_id, line_no, description, quantity, unit_price, discount_amount, line_subtotal, tax_amount, revenue_account_id)
       SELECT $1::uuid, line_number, description, quantity, unit_price, discount_amount, line_total, tax_amount, $2::uuid
         FROM public.acct_estimate_lines WHERE estimate_id = $3::uuid`,
      [invoiceId, revenueAccountId, id],
    );
    if (!copied) {
      // Totals-only estimate (the create form carries no line editor):
      // one line carrying the subtotal so the invoice's lines sum to it.
      const lineAmount = subtotal > 0 ? subtotal : total;
      const fallback = await pgExec(
        `INSERT INTO public.acct_ar_invoice_lines
           (invoice_id, line_no, description, quantity, unit_price, discount_amount, line_subtotal, tax_amount, revenue_account_id)
         VALUES ($1::uuid, 1, $2, 1, $3, 0, $3, 0, $4::uuid)`,
        [invoiceId, `Estimate ${e.estimate_number}`, lineAmount, revenueAccountId],
      );
      // A failed fallback insert must surface as an error, never a 201
      // for an invoice with no lines (pgExec returns 0 on failure).
      if (!fallback) return NextResponse.json({ error: "Invoice line insert did not land" }, { status: 500 });
      copied = fallback;
    }

    const updated = await pgExec(
      `UPDATE public.acct_estimates
          SET status = 'converted', converted_invoice_id = $1::uuid, updated_at = now()
        WHERE id = $2::uuid AND tenant_id = $3`,
      [invoiceId, id, tenant],
    );
    // A failed status stamp must surface as an error, never a 201
    // claiming the estimate was converted.
    if (!updated) return NextResponse.json({ error: "Estimate status update did not land" }, { status: 500 });

    const actorId = await getActorIdFromRequest(req).catch(() => null);
    await auditAction({
      action: "fin_convert_estimate", domain: "acct", tableName: "acct_ar_invoices",
      recordId: invoiceId, actorUserId: actorId,
      ipAddress: req.headers.get("x-forwarded-for"),
      afterData: { estimateId: id, invoiceNumber: number, linesCopied: copied || 0 },
    }).catch(() => {});
    return NextResponse.json({ ok: true, invoiceId, invoiceNumber: number, estimateId: id, linesCopied: copied || 0 }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/admin/accounting/estimates/[id]/convert]", err);
    return NextResponse.json({ error: err?.message || "Conversion failed" }, { status: 500 });
  }
}
