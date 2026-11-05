import { guard, ctx, ok, fail, body } from "../_shared";
import { round2, postJournal, nextNumber, bookContext, todayISO, attachCustomerNames } from "@/lib/accounting";

export const dynamic = "force-dynamic";

export async function GET() {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const [{ data: refunds }, { data: policy }, { data: creditMemos }] = await Promise.all([
      db.from("acct_refunds").select("*").eq("tenant_id", tenant)
        .order("created_at", { ascending: false }).limit(300),
      db.from("acct_refund_policies").select("*").eq("tenant_id", tenant).limit(1).single(),
      db.from("acct_ar_credit_memos").select("*").eq("tenant_id", tenant)
        .order("memo_date", { ascending: false }).limit(300),
    ]);
    return ok({
      refunds: await attachCustomerNames(db, refunds),
      creditMemos: await attachCustomerNames(db, creditMemos),
      policy: policy || null,
    });
  } catch (e) { return fail(e, 500); }
}

export async function POST(req: Request) {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const b = await body(req);
    const { entityId } = await bookContext(db, tenant);

    if (b.action === "policy") {
      const { error } = await db.from("acct_refund_policies").upsert({
        tenant_id: tenant, window_days: Number(b.window_days) || 30,
        restocking_fee_percent: Number(b.restocking_fee_percent) || 0,
        require_approval_above: Number(b.require_approval_above) || 100,
        auto_approve_below: Number(b.auto_approve_below) || 25,
        notes: b.notes || null, updated_at: new Date().toISOString(),
      }, { onConflict: "tenant_id" });
      if (error) throw new Error(error.message);
      return ok();
    }

    if (b.action === "issue") {
      const amount = round2(Number(b.amount));
      if (!amount) throw new Error("Amount required");
      const { data: policy } = await db.from("acct_refund_policies").select("*").eq("tenant_id", tenant).limit(1).single();
      const needsApproval = policy ? amount > Number(policy.auto_approve_below) : amount > 25;
      const number = await nextNumber(db, "acct_refunds", "refund_number", "RFD", tenant);
      const { data, error } = await db.from("acct_refunds").insert({
        tenant_id: tenant, entity_id: entityId, refund_number: number,
        customer_id: b.customer_id || null, invoice_id: b.invoice_id || null,
        order_ref: b.order_ref || null, refund_type: b.refund_type || "refund",
        reason: b.reason || null, amount, currency: "USD",
        status: needsApproval ? "requested" : "approved",
        payment_method: b.payment_method || "card", processor: "stripe", notes: b.notes || null,
      }).select("id").single();
      if (error) throw new Error(error.message);
      if (!needsApproval) {
        const journalId = await postJournal(db, {
          source: "refund", sourceId: data.id, memo: `Refund ${number} issued`,
          lines: [
            { accountCode: "4020", debit: amount, credit: 0 },
            { accountCode: "1010", debit: 0, credit: amount },
          ],
        });
        await db.from("acct_refunds").update({ status: "issued", issued_at: new Date().toISOString(), posted_journal_id: journalId }).eq("id", data.id);
        return ok({ id: data.id, refund_number: number, journal_id: journalId, auto_issued: true });
      }
      return ok({ id: data.id, refund_number: number, auto_issued: false });
    }

    const { data: refund } = await db.from("acct_refunds").select("*").eq("id", b.id).eq("tenant_id", tenant).single();
    if (!refund) throw new Error("Refund not found");
    switch (b.action) {
      case "approve": {
        const amount = round2(Number(refund.amount));
        const journalId = await postJournal(db, {
          source: "refund", sourceId: refund.id, memo: `Refund ${refund.refund_number} approved & issued`,
          lines: [
            { accountCode: "4020", debit: amount, credit: 0 },
            { accountCode: "1010", debit: 0, credit: amount },
          ],
        });
        await db.from("acct_refunds").update({
          status: "issued", approved_at: new Date().toISOString(), issued_at: new Date().toISOString(), posted_journal_id: journalId,
        }).eq("id", refund.id);
        return ok({ journal_id: journalId });
      }
      case "reject":
        await db.from("acct_refunds").update({ status: "rejected" }).eq("id", refund.id);
        return ok();
      case "void":
        await db.from("acct_refunds").update({ status: "voided" }).eq("id", refund.id);
        return ok();
      default:
        throw new Error("Unknown action");
    }
  } catch (e) { return fail(e); }
}
