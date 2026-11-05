import { guard, ctx, ok, fail, body } from "../_shared";
import { round2, postJournal, todayISO, nextNumber, bookContext, attachCustomerNames } from "@/lib/accounting";

export const dynamic = "force-dynamic";

// GET /api/admin/accounting/deposits
//
// Deposits & Clearing payload (Batch 2). Three real views:
//   awaiting: received payments not yet marked deposited
//     (acct_ar_receipts with status posted/settled/pending and
//     no DEPOSIT: reference — those are customer deposits, a
//     different thing, returned separately as heldDeposits).
//   deposited: receipts whose status is 'deposited'. NOTE: the
//     schema has no deposit-batch id and acct_ar_receipts has no
//     updated_at, so a "batch" is the set of payments marked in
//     one mark_deposited call; on read they are a flat list —
//     no grouping is fabricated.
//   payouts: acct_payouts rows — the processors' own finalized
//     batches, the only place per-batch fee/net figures exist.

export async function GET() {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const [{ data: receipts }, { data: payouts }] = await Promise.all([
      db.from("acct_ar_receipts").select("*").eq("tenant_id", tenant)
        .order("receipt_date", { ascending: false }).limit(500),
      db.from("acct_payouts").select("*").eq("tenant_id", tenant)
        .order("created_at", { ascending: false }).limit(200),
    ]);
    const withNames = await attachCustomerNames(db, receipts);
    const isHeldDeposit = (r: any) => String(r.reference || "").startsWith("DEPOSIT");
    const awaiting = withNames.filter((r: any) => !isHeldDeposit(r) && ["posted", "settled", "pending"].includes(r.status));
    const deposited = withNames.filter((r: any) => !isHeldDeposit(r) && r.status === "deposited");
    const heldDeposits = withNames.filter((r: any) => isHeldDeposit(r));
    return ok({ awaiting, deposited, heldDeposits, payouts: payouts || [] });
  } catch (e) { return fail(e, 500); }
}

/** Deposits are receipts whose reference starts with DEPOSIT, held in GL 2350 (Customer Deposits). */
export async function POST(req: Request) {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const b = await body(req);
    const { entityId } = await bookContext(db, tenant);

    if (b.action === "mark_deposited") {
      // Batch deposit: mark the selected received payments as
      // deposited. The schema has no batch table/id — the batch
      // is exactly the set marked in this call.
      const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
      if (!ids.length) throw new Error("Select at least one payment to deposit");
      const { data, error } = await db.from("acct_ar_receipts")
        .update({ status: "deposited" })
        .in("id", ids).eq("tenant_id", tenant)
        .in("status", ["posted", "settled", "pending"])
        .select("id");
      if (error) throw new Error(error.message);
      return ok({ deposited: (data || []).length });
    }

    if (b.action === "collect") {
      const amount = round2(Number(b.amount));
      if (!amount) throw new Error("Amount required");
      const journalId = await postJournal(db, {
        source: "customer_receipt", memo: `Deposit collected${b.invoice_id ? ` for invoice ${b.invoice_id}` : ""}`,
        lines: [
          { accountCode: b.bank_code || "1000", debit: amount, credit: 0 },
          { accountCode: "2350", debit: 0, credit: amount },
        ],
      });
      const { data: bankAcct } = await db.from("acct_bank_accounts").select("id").eq("tenant_id", tenant).limit(1).single();
      const receiptNumber = await nextNumber(db, "acct_ar_receipts", "receipt_number", "RCT", tenant);
      const { data, error } = await db.from("acct_ar_receipts").insert({
        tenant_id: tenant, entity_id: entityId, customer_id: b.customer_id || null,
        receipt_number: receiptNumber, receipt_date: todayISO(), currency: "USD",
        amount, payment_method: b.payment_method || "card", status: "held",
        deposit_account_id: bankAcct?.id || null,
        reference: `DEPOSIT:${b.invoice_id || "unapplied"}`, posted_journal_id: journalId,
      }).select("id").single();
      if (error) throw new Error(error.message);
      if (b.invoice_id) {
        const { data: inv } = await db.from("acct_ar_invoices").select("deposit_paid").eq("id", b.invoice_id).single();
        await db.from("acct_ar_invoices").update({ deposit_paid: round2(Number(inv?.deposit_paid || 0) + amount) }).eq("id", b.invoice_id);
      }
      return ok({ id: data.id, receipt_number: receiptNumber });
    }

    // All other actions operate on an existing deposit receipt.
    const { data: dep } = await db.from("acct_ar_receipts").select("*").eq("id", b.id).eq("tenant_id", tenant).single();
    if (!dep) throw new Error("Deposit not found");
    const amount = round2(Number(dep.amount));

    switch (b.action) {
      case "apply": {
        const invoiceId = b.invoice_id || String(dep.reference || "").replace("DEPOSIT:", "");
        const { data: inv } = await db.from("acct_ar_invoices").select("*").eq("id", invoiceId).single();
        if (!inv) throw new Error("Target invoice not found");
        const journalId = await postJournal(db, {
          source: "customer_receipt", sourceId: inv.id, memo: `Deposit applied to ${inv.invoice_number}`,
          lines: [
            { accountCode: "2350", debit: amount, credit: 0 },
            { accountCode: "1200", debit: 0, credit: amount },
          ],
        });
        const newPaid = round2(Number(inv.amount_paid) + amount);
        await db.from("acct_ar_invoices").update({
          amount_paid: newPaid,
          status: newPaid >= round2(Number(inv.total) - Number(inv.amount_credited)) ? "paid" : "partially_paid",
        }).eq("id", inv.id);
        await db.from("acct_ar_receipts").update({ status: "applied", reference: `DEPOSIT-APPLIED:${inv.id}`, posted_journal_id: journalId }).eq("id", dep.id);
        return ok({ journal_id: journalId });
      }
      case "release": case "refund_deposit": {
        const journalId = await postJournal(db, {
          source: "credit_memo", memo: b.action === "release" ? "Deposit released back to customer" : "Deposit refunded to customer",
          lines: [
            { accountCode: "2350", debit: amount, credit: 0 },
            { accountCode: b.bank_code || "1000", debit: 0, credit: amount },
          ],
        });
        await db.from("acct_ar_receipts").update({ status: "released", posted_journal_id: journalId }).eq("id", dep.id);
        return ok({ journal_id: journalId });
      }
      case "forfeit": {
        const journalId = await postJournal(db, {
          source: "revenue_recognition", memo: "Deposit forfeited — recognized as revenue",
          lines: [
            { accountCode: "2350", debit: amount, credit: 0 },
            { accountCode: "4900", debit: 0, credit: amount },
          ],
        });
        await db.from("acct_ar_receipts").update({ status: "forfeited", posted_journal_id: journalId }).eq("id", dep.id);
        return ok({ journal_id: journalId });
      }
      case "transfer": {
        if (!b.to_invoice_id) throw new Error("Target invoice required");
        await db.from("acct_ar_receipts").update({ reference: `DEPOSIT:${b.to_invoice_id}` }).eq("id", dep.id);
        return ok();
      }
      default:
        throw new Error("Unknown action");
    }
  } catch (e) { return fail(e); }
}
