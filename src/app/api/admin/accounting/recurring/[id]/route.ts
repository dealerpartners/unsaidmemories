import { guard, ctx, ok, fail, body } from "../../_shared";
import { nextNumber, postJournal, todayISO } from "@/lib/accounting";

export const dynamic = "force-dynamic";

function advance(dateISO: string, frequency: string) {
  const d = new Date(dateISO + "T12:00:00");
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "quarterly") d.setMonth(d.getMonth() + 3);
  else if (frequency === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const { id } = await params;
    const b = await body(req);
    const { data: tpl } = await db.from("acct_recurring_invoices").select("*").eq("id", id).eq("tenant_id", tenant).single();
    if (!tpl) throw new Error("Template not found");
    switch (b.action) {
      case "pause":
        await db.from("acct_recurring_invoices").update({ status: "paused" }).eq("id", id);
        return ok();
      case "resume":
        await db.from("acct_recurring_invoices").update({ status: "active" }).eq("id", id);
        return ok();
      case "end":
        await db.from("acct_recurring_invoices").update({ status: "ended" }).eq("id", id);
        return ok();
      case "generate": {
        if (tpl.status !== "active") throw new Error("Template is not active");
        const number = await nextNumber(db, "acct_ar_invoices", "invoice_number", "INV", tenant);
        const { data: inv, error } = await db.from("acct_ar_invoices").insert({
          tenant_id: tenant, entity_id: tpl.entity_id, customer_id: tpl.customer_id,
          invoice_number: number, invoice_date: todayISO(), due_date: todayISO(),
          currency: "USD", subtotal: tpl.subtotal, tax_total: tpl.tax_total, discount_total: 0,
          total: tpl.total, amount_paid: 0, amount_credited: 0, status: "sent",
          terms: "Net 30", notes: `Recurring: ${tpl.name}`, sent_at: new Date().toISOString(),
        }).select("id").single();
        if (error) throw new Error(error.message);
        const lines = Array.isArray(tpl.lines) ? tpl.lines : [];
        if (lines.length) {
          await db.from("acct_ar_invoice_lines").insert(lines.map((l: any, i: number) => ({
            invoice_id: inv.id, line_no: i + 1, description: l.description, quantity: l.quantity,
            unit_price: l.unit_price, discount_amount: 0, line_subtotal: l.line_subtotal,
            tax_amount: 0, tenant_id: tenant, dimensions: {},
          })));
        }
        const journalId = await postJournal(db, {
          source: "recurring", sourceId: inv.id, memo: `Recurring invoice ${number} (${tpl.name})`,
          lines: [
            { accountCode: "1200", debit: Number(tpl.total), credit: 0 },
            { accountCode: "4000", debit: 0, credit: Number(tpl.subtotal) },
            ...(Number(tpl.tax_total) > 0 ? [{ accountCode: "2100", debit: 0, credit: Number(tpl.tax_total) }] : []),
          ],
        });
        await db.from("acct_ar_invoices").update({ posted_journal_id: journalId }).eq("id", inv.id);
        const next = advance(tpl.next_run_date, tpl.frequency);
        const ended = tpl.end_date && next > tpl.end_date;
        await db.from("acct_recurring_invoices").update({
          last_invoice_id: inv.id, last_run_at: new Date().toISOString(),
          run_count: (tpl.run_count || 0) + 1, next_run_date: next, status: ended ? "ended" : "active",
        }).eq("id", id);
        return ok({ invoice_id: inv.id, invoice_number: number, journal_id: journalId });
      }
      default:
        throw new Error("Unknown action");
    }
  } catch (e) { return fail(e); }
}
