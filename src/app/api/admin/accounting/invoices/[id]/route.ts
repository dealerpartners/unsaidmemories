import { guard, ctx, ok, fail, body } from "../../_shared";
import { round2, postJournal, todayISO, nextNumber } from "@/lib/accounting";

export const dynamic = "force-dynamic";

async function load(db: any, tenant: string, id: string) {
  const { data } = await db.from("acct_ar_invoices").select("*").eq("id", id).eq("tenant_id", tenant).single();
  if (!data) throw new Error("Invoice not found");
  return data;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const { id } = await params;
    const b = await body(req);
    const inv = await load(db, tenant, id);
    const balance = round2(Number(inv.total) - Number(inv.amount_paid) - Number(inv.amount_credited));

    switch (b.action) {
      case "send": {
        if (inv.status !== "draft") throw new Error("Only draft invoices can be sent");
        const journalId = await postJournal(db, {
          source: "invoice", sourceId: inv.id, memo: `Invoice ${inv.invoice_number} issued`,
          entryDate: inv.invoice_date,
          lines: [
            { accountCode: "1200", debit: Number(inv.total), credit: 0, memo: inv.invoice_number },
            { accountCode: "4000", debit: 0, credit: Number(inv.subtotal), memo: "Product sales" },
            ...(Number(inv.tax_total) > 0 ? [{ accountCode: "2100", debit: 0, credit: Number(inv.tax_total), memo: "Sales tax" }] : []),
          ],
        });
        await db.from("acct_ar_invoices").update({ status: "sent", sent_at: new Date().toISOString(), posted_journal_id: journalId }).eq("id", id);
        return ok({ journal_id: journalId });
      }
      case "resend": {
        await db.from("acct_ar_invoices").update({ resent_count: (inv.resent_count || 0) + 1, sent_at: new Date().toISOString() }).eq("id", id);
        return ok();
      }
      case "remind": {
        await db.from("acct_ar_invoices").update({ reminder_count: (inv.reminder_count || 0) + 1, last_reminder_at: new Date().toISOString() }).eq("id", id);
        return ok();
      }
      case "mark_paid": {
        const amount = Math.min(round2(Number(b.amount) || balance), balance);
        if (amount <= 0) throw new Error("Nothing to pay on this invoice");
        const bankCode = b.bank_code || "1000";
        const journalId = await postJournal(db, {
          source: "invoice_paid", sourceId: inv.id, memo: `Payment on ${inv.invoice_number}`,
          lines: [
            { accountCode: bankCode, debit: amount, credit: 0 },
            { accountCode: "1200", debit: 0, credit: amount },
          ],
        });
        const receiptNumber = await nextNumber(db, "acct_ar_receipts", "receipt_number", "RCT", tenant);
        const { entityId } = await (await import("@/lib/accounting")).bookContext(db, tenant);
        const { data: bankAcct } = await db.from("acct_bank_accounts").select("id").eq("tenant_id", tenant).limit(1).single();
        await db.from("acct_ar_receipts").insert({
          tenant_id: tenant, entity_id: entityId, customer_id: inv.customer_id,
          receipt_number: receiptNumber, receipt_date: todayISO(), currency: "USD",
          amount, payment_method: b.payment_method || "card", status: "posted",
          deposit_account_id: bankAcct?.id || null, reference: inv.invoice_number,
          processor: b.payment_method === "card" ? "stripe" : null, posted_journal_id: journalId,
        });
        const newPaid = round2(Number(inv.amount_paid) + amount);
        await db.from("acct_ar_invoices").update({
          amount_paid: newPaid,
          status: newPaid >= round2(Number(inv.total) - Number(inv.amount_credited)) ? "paid" : "partially_paid",
          paid_at: newPaid >= round2(Number(inv.total) - Number(inv.amount_credited)) ? new Date().toISOString() : inv.paid_at,
        }).eq("id", id);
        return ok({ journal_id: journalId, receipt_number: receiptNumber });
      }
      case "void": {
        if (inv.posted_journal_id) {
          await postJournal(db, {
            source: "credit_memo", sourceId: inv.id, memo: `Void of ${inv.invoice_number}: ${b.reason || "voided"}`,
            lines: [
              { accountCode: "4000", debit: Number(inv.subtotal), credit: 0 },
              ...(Number(inv.tax_total) > 0 ? [{ accountCode: "2100", debit: Number(inv.tax_total), credit: 0 }] : []),
              { accountCode: "1200", debit: 0, credit: Number(inv.total) },
            ],
          });
        }
        await db.from("acct_ar_invoices").update({
          status: "voided", voided_at: new Date().toISOString(), void_reason: b.reason || "Voided",
        }).eq("id", id);
        return ok();
      }
      case "duplicate": {
        const number = await nextNumber(db, "acct_ar_invoices", "invoice_number", "INV", tenant);
        const { data: copy, error } = await db.from("acct_ar_invoices").insert({
          tenant_id: tenant, entity_id: inv.entity_id, customer_id: inv.customer_id,
          invoice_number: number, invoice_date: todayISO(), due_date: inv.due_date,
          currency: inv.currency, subtotal: inv.subtotal, tax_total: inv.tax_total,
          discount_total: inv.discount_total, total: inv.total, amount_paid: 0, amount_credited: 0,
          status: "draft", terms: inv.terms, notes: inv.notes,
        }).select("id").single();
        if (error) throw new Error(error.message);
        const { data: lines } = await db.from("acct_ar_invoice_lines").select("*").eq("invoice_id", id);
        if (lines?.length) {
          await db.from("acct_ar_invoice_lines").insert(lines.map((l: any) => ({
            invoice_id: copy.id, line_no: l.line_no, description: l.description, quantity: l.quantity,
            unit_price: l.unit_price, discount_amount: l.discount_amount, line_subtotal: l.line_subtotal,
            tax_amount: l.tax_amount, revenue_account_id: l.revenue_account_id, tenant_id: tenant, dimensions: {},
          })));
        }
        return ok({ id: copy.id, invoice_number: number });
      }
      case "delete": {
        if (inv.status !== "draft") throw new Error("Only draft invoices can be deleted");
        await db.from("acct_ar_invoice_lines").delete().eq("invoice_id", id);
        await db.from("acct_ar_invoices").delete().eq("id", id);
        return ok();
      }
      default:
        throw new Error("Unknown action");
    }
  } catch (e) { return fail(e); }
}
