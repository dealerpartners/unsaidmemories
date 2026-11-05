import { guard, ctx, ok, fail, body } from "../_shared";
import { round2, postJournal, nextNumber, bookContext, todayISO, attachCustomerNames } from "@/lib/accounting";

export const dynamic = "force-dynamic";

// GET /api/admin/accounting/disputes — the dispute register with
// CRM customer names attached (same resolution the refunds GET
// uses; acct_disputes.customer_id lives in CRM id space).

export async function GET() {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const { data: disputes } = await db.from("acct_disputes").select("*").eq("tenant_id", tenant)
      .order("created_at", { ascending: false }).limit(300);
    return ok({ disputes: await attachCustomerNames(db, disputes) });
  } catch (e) { return fail(e, 500); }
}

export async function POST(req: Request) {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const b = await body(req);
    const { entityId } = await bookContext(db, tenant);

    if (b.action === "create") {
      const number = await nextNumber(db, "acct_disputes", "dispute_number", "DSP", tenant);
      const { data, error } = await db.from("acct_disputes").insert({
        tenant_id: tenant, entity_id: entityId, dispute_number: number,
        customer_id: b.customer_id || null, invoice_id: b.invoice_id || null,
        order_ref: b.order_ref || null, processor: b.processor || "stripe",
        processor_dispute_id: b.processor_dispute_id || null,
        kind: b.kind || "chargeback", reason: b.reason || null,
        amount: round2(Number(b.amount)), currency: "USD", status: "open",
        evidence_due_at: b.evidence_due_at || null,
      }).select("id").single();
      if (error) throw new Error(error.message);
      return ok({ id: data.id, dispute_number: number });
    }

    const { data: dispute } = await db.from("acct_disputes").select("*").eq("id", b.id).eq("tenant_id", tenant).single();
    if (!dispute) throw new Error("Dispute not found");
    switch (b.action) {
      case "accept": {
        // Accepting a chargeback concedes the funds: DR chargeback expense / CR clearing.
        const amount = round2(Number(dispute.amount));
        const journalId = await postJournal(db, {
          source: "expense", sourceId: dispute.id, memo: `Chargeback ${dispute.dispute_number} accepted`,
          lines: [
            { accountCode: "6040", debit: amount, credit: 0 },
            { accountCode: "1010", debit: 0, credit: amount },
          ],
        });
        await db.from("acct_disputes").update({ status: "accepted", posted_journal_id: journalId }).eq("id", dispute.id);
        return ok({ journal_id: journalId });
      }
      case "submit_evidence":
        await db.from("acct_disputes").update({
          status: "evidence_submitted", evidence_notes: b.notes || dispute.evidence_notes,
        }).eq("id", dispute.id);
        return ok();
      case "won":
        await db.from("acct_disputes").update({ status: "won" }).eq("id", dispute.id);
        return ok();
      case "lost": {
        const amount = round2(Number(dispute.amount));
        const journalId = await postJournal(db, {
          source: "expense", sourceId: dispute.id, memo: `Chargeback ${dispute.dispute_number} lost`,
          lines: [
            { accountCode: "6040", debit: amount, credit: 0 },
            { accountCode: "1010", debit: 0, credit: amount },
          ],
        });
        await db.from("acct_disputes").update({ status: "lost", posted_journal_id: journalId }).eq("id", dispute.id);
        return ok({ journal_id: journalId });
      }
      default:
        throw new Error("Unknown action");
    }
  } catch (e) { return fail(e); }
}
