import { guard, ctx, ok, fail, body } from "../../_shared";
import { round2, postJournal, todayISO, nextNumber, bookContext } from "@/lib/accounting";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const { id } = await params;
    const b = await body(req);
    const { data: bill } = await db.from("acct_ap_bills").select("*").eq("id", id).eq("tenant_id", tenant).single();
    if (!bill) throw new Error("Bill not found");
    if (b.action !== "pay") throw new Error("Unknown action");
    const balance = round2(Number(bill.total) - Number(bill.amount_paid) - Number(bill.amount_credited));
    const amount = Math.min(round2(Number(b.amount) || balance), balance);
    if (amount <= 0) throw new Error("Nothing to pay on this bill");
    const journalId = await postJournal(db, {
      source: "vendor_payment", sourceId: bill.id, memo: `Payment on bill ${bill.bill_number}`,
      lines: [
        { accountCode: "2050", debit: amount, credit: 0 },
        { accountCode: b.bank_code || "1000", debit: 0, credit: amount },
      ],
    });
    const { entityId } = await bookContext(db, tenant);
    const { data: bankAcct } = await db.from("acct_bank_accounts").select("id").eq("tenant_id", tenant).limit(1).single();
    const paymentNumber = await nextNumber(db, "acct_ap_payments", "payment_number", "PAY", tenant);
    const { data: pay, error } = await db.from("acct_ap_payments").insert({
      tenant_id: tenant, entity_id: entityId, vendor_id: bill.vendor_id,
      payment_number: paymentNumber, payment_date: todayISO(), currency: "USD",
      amount, payment_method: b.payment_method || "ach", status: "posted",
      cash_account_id: bankAcct?.id || null, reference: bill.bill_number, posted_journal_id: journalId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    const newPaid = round2(Number(bill.amount_paid) + amount);
    await db.from("acct_ap_bills").update({
      amount_paid: newPaid,
      status: newPaid >= round2(Number(bill.total) - Number(bill.amount_credited)) ? "paid" : "partially_paid",
    }).eq("id", id);
    return ok({ payment_id: pay.id, payment_number: paymentNumber, journal_id: journalId });
  } catch (e) { return fail(e); }
}
