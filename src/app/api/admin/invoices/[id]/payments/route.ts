import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { platformAudit, writeCommercePayment } from "@/lib/crm/enterprise";
import { pgQuery } from "@/lib/pg";
import { postBalancedJournalEntry } from "@/lib/accounting/journal";
import { acctStatusToLegacy } from "@/lib/accounting/invoice-store";
import pg from "pg";
import { pgConnectionString, toTransactionPooler } from "@/lib/pg";

// ---------------------------------------------------------------------------
// POST /api/admin/invoices/[id]/payments — take a payment against an invoice.
//   { amount: number, method: 'cash'|'card'|'check'|'other', reference? }
//
// One pg transaction:
//   1. Lock the invoice row (SELECT … FOR UPDATE) and re-read the balance —
//      never trust a client-computed balance.
//   2. Validate amount (0 < amount ≤ balanceDue + half-cent slack).
//   3. Update amount_paid / status / paid_at on acct_ar_invoices (the
//      single invoice record; balance is derived: total − amount_paid
//      − amount_credited − deposit_paid).
//   4. Record the ledger row via writeCommercePayment (manual payment method,
//      deterministic PAY-<invoice>-<n> number, crm customer resolved by email
//      when one exists — NULL otherwise; the column is nullable).
//   5. platform_audit_log entry. Audit failures never roll back the payment.
// ---------------------------------------------------------------------------

const POOLER = () => toTransactionPooler(process.env.SUPABASE_SESSION_POOLER || process.env.SUPABASE_DIRECT_CONNECTION || pgConnectionString);

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("invoices", "write");
  if (gate) return gate;

  const { id } = await ctx.params;
  // Invoice ids are acct_ar_invoices uuids.
  if (!id || id.length < 8 || id.length > 64 || !/^[0-9a-zA-Z-]+$/.test(id)) {
    return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
  }
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const amount = Math.round((parseFloat(String(body?.amount ?? 0)) || 0) * 100) / 100;
  const method = String(body?.method || "cash").trim().toLowerCase();
  const reference = String(body?.reference || "").trim() || null;
  const note = String(body?.note || "").trim() || null;

  if (!(amount > 0)) {
    return NextResponse.json({ error: "Payment amount must be greater than $0." }, { status: 400 });
  }
  if (!["cash", "card", "check", "venmo", "other"].includes(method)) {
    return NextResponse.json({ error: "Method must be one of: cash, card, check, venmo, other." }, { status: 400 });
  }

  const cs = POOLER();
  if (!cs) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    await client.query("BEGIN");
    const tenant = resolveTenantId(req);

    const locked = await client.query(
      `SELECT i.id::text AS id, i.invoice_number AS number, i.total, i.amount_paid,
              i.amount_credited, i.deposit_paid, i.paid_at, i.source_customer_id,
              c.email AS customer_email
       FROM public.acct_ar_invoices i
       LEFT JOIN public.customers c ON i.source_customer_id = c.id
       WHERE i.id = $1::uuid AND i.tenant_id = $2
       FOR UPDATE OF i`,
      [id, tenant],
    );
    if (!locked.rows[0]) {
      await client.query("ROLLBACK").catch(() => {});
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    const inv = locked.rows[0];

    const total = parseFloat(String(inv.total ?? "0")) || 0;
    const depositPaid = parseFloat(String(inv.deposit_paid ?? "0")) || 0;
    const amountPaid = parseFloat(String(inv.amount_paid ?? "0")) || 0;
    const amountCredited = parseFloat(String(inv.amount_credited ?? "0")) || 0;
    const balanceDue = Math.max(0, Math.round((total - amountPaid - amountCredited - depositPaid) * 100) / 100);

    if (amount > balanceDue + 0.005) {
      await client.query("ROLLBACK").catch(() => {});
      return NextResponse.json(
        { error: `Payment of $${money(amount)} exceeds the outstanding balance of $${money(balanceDue)}.` },
        { status: 400 },
      );
    }

    const newPaid = Math.round((amountPaid + amount) * 100) / 100;
    const settled = newPaid + amountCredited + depositPaid;
    const fullyPaid = settled >= total - 0.005;
    const newStatus = fullyPaid ? "paid" : settled > 0 ? "partially_paid" : "posted";

    const updated = await client.query(
      `UPDATE public.acct_ar_invoices SET
         amount_paid = $2,
         status = $3::public.acct_document_status,
         paid_at = CASE WHEN $3 = 'paid' THEN now() ELSE paid_at END,
         updated_at = now()
       WHERE id = $1::uuid
       RETURNING id::text AS id, invoice_number AS number, total, amount_paid,
                 amount_credited, deposit_paid, status::text AS status, paid_at`,
      [id, money(newPaid), newStatus],
    );
    const invoiceRow = updated.rows[0];

    // Ledger row — payment number keyed to the INVOICE's unique id (not the
    // display number): PAY-<id8>-<n>. The id never gets reused, so a deleted
    // invoice can never free a number that collides with a future one.
    const count = await client.query(
      `SELECT count(*)::int AS n FROM public.commerce_payments
       WHERE tenant_id = $1 AND external_reference = $2`,
      [tenant, id],
    );
    const paymentNumber = `PAY-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}-${(count.rows[0]?.n || 0) + 1}`;

    let crmCustomerId: string | null = null;
    if (inv.customer_email) {
      const crm = await client.query(
        `SELECT id::text FROM public.crm_customers WHERE tenant_id = $1 AND lower(email) = lower($2) LIMIT 1`,
        [tenant, inv.customer_email],
      );
      crmCustomerId = crm.rows[0]?.id || null;
    }

    await writeCommercePayment(client, {
      paymentNumber,
      amount,
      status: "succeeded",
      customerId: crmCustomerId,
      methodType: "manual",
      manualMethodName: method,
      externalReference: id,
      processorTransactionId: reference,
    });

    // Audit the payment. Wrapped in a SAVEPOINT so an audit-table failure
    // (CHECK on action enum, trigger, NOT NULL) can NEVER abort the payment
    // write — without this, any audit INSERT failure silently rolls back the
    // entire transaction even though the route still returns 200/201 with
    // the in-memory invoiceRow from the UPDATE's RETURNING * clause.
    try {
      await client.query("SAVEPOINT audit_sp");
      await platformAudit(client, {
        action: "invoice.payment_recorded",
        targetType: "invoice",
        targetId: id,
        actorRole: "admin",
        metadata: {
          invoiceNumber: inv.number,
          amount: money(amount),
          method,
          reference,
          note,
          fullyPaid,
          balanceAfter: money(Math.max(0, total - newPaid - amountCredited - depositPaid)),
        },
      });
      await client.query("RELEASE SAVEPOINT audit_sp");
    } catch (auditErr: any) {
      await client.query("ROLLBACK TO SAVEPOINT audit_sp").catch(() => {});
      console.warn("[POST /api/admin/invoices/:id/payments] audit non-fatal:", auditErr?.message);
    }

    await client.query("COMMIT");

    // GL posting (best-effort, after commit — a GL failure never un-takes
    // a payment the ledger already recorded): debit cash/checking, credit
    // AR, for THIS payment's amount. Partial payments each post their own
    // entry; fin_mark_paid posts only the remainder it collects, so the
    // two paths compose without double-counting.
    let journalEntryId: string | null = null;
    try {
      const q = async (text: string, params?: unknown[]) => {
        const r = await pgQuery(text, params);
        return { rows: r as Record<string, unknown>[] };
      };
      journalEntryId = await postBalancedJournalEntry(q, tenant, {
        source: "invoice_paid",
        sourceId: id,
        reference: paymentNumber,
        memo: `Payment recorded on invoice ${inv.number} — $${money(amount)} via ${method}`,
        lines: [
          { accountCode: method === "cash" || method === "check" ? "1000" : "1010", debit: amount, credit: 0, memo: `Payment (${method})` },
          { accountCode: "1200", debit: 0, credit: amount, memo: "Accounts receivable" },
        ],
      });
    } catch (e) {
      console.error("[POST /api/admin/invoices/:id/payments] GL post failed (non-blocking):", e);
    }

    return NextResponse.json({
      ok: true,
      paymentNumber,
      journalEntryId,
      invoice: {
        dbId: String(invoiceRow.id),
        id: invoiceRow.number,
        total: parseFloat(String(invoiceRow.total ?? "0")) || 0,
        amountPaid: parseFloat(String(invoiceRow.amount_paid ?? "0")) || 0,
        depositPaid: parseFloat(String(invoiceRow.deposit_paid ?? "0")) || 0,
        balanceDue: Math.max(0, Math.round(((parseFloat(String(invoiceRow.total ?? "0")) || 0) - (parseFloat(String(invoiceRow.amount_paid ?? "0")) || 0) - (parseFloat(String(invoiceRow.amount_credited ?? "0")) || 0) - (parseFloat(String(invoiceRow.deposit_paid ?? "0")) || 0)) * 100) / 100),
        status: acctStatusToLegacy(invoiceRow.status || "posted"),
        paidAt: invoiceRow.paid_at,
      },
    });
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[POST /api/admin/invoices/:id/payments]", e);
    return NextResponse.json({ error: e.message || "Failed to record payment" }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }
}
