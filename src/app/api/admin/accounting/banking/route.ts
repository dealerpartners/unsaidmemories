import { guard, ctx, ok, fail, body } from "../_shared";
import { round2, bookContext } from "@/lib/accounting";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const b = await body(req);
    const { entityId } = await bookContext(db, tenant);

    switch (b.action) {
      case "add_account": {
        const { data, error } = await db.from("acct_bank_accounts").insert({
          tenant_id: tenant, entity_id: entityId, name: b.name,
          institution_name: b.institution_name || null, account_type: b.account_type || "checking",
          masked_account_number: b.masked_account_number || null, currency: "USD",
          gl_account_id: b.gl_account_id || null, is_active: true, metadata: {},
        }).select("id").single();
        if (error) throw new Error(error.message);
        return ok({ id: data.id });
      }
      case "add_transaction": {
        const { data, error } = await db.from("acct_bank_transactions").insert({
          tenant_id: tenant, bank_account_id: b.bank_account_id,
          transaction_date: b.transaction_date, amount: round2(Number(b.amount)),
          currency: "USD", description: b.description || null, payee: b.payee || null,
          reference: b.reference || null, match_status: "unmatched",
        }).select("id").single();
        if (error) throw new Error(error.message);
        return ok({ id: data.id });
      }
      case "match": {
        // Match a bank transaction to a journal line on the account's GL account (explicit id, or auto by amount).
        const { data: txn } = await db.from("acct_bank_transactions").select("*").eq("id", b.id).eq("tenant_id", tenant).single();
        if (!txn) throw new Error("Transaction not found");
        let lineId = b.journal_line_id as string | undefined;
        if (!lineId) {
          const { data: acct } = await db.from("acct_bank_accounts").select("gl_account_id").eq("id", txn.bank_account_id).single();
          const { data: lines } = await db.from("acct_journal_lines")
            .select("id, debit, credit").eq("tenant_id", tenant).eq("account_id", acct?.gl_account_id || "")
            .limit(200);
          const target = Math.abs(Number(txn.amount));
          const hit = (lines || []).find((l: any) => Math.abs(Number(l.debit) - Number(l.credit)) === target);
          if (!hit) throw new Error("No journal line with a matching amount on this bank account's GL account");
          lineId = hit.id;
        }
        const { error } = await db.from("acct_bank_transactions")
          .update({ match_status: "matched", matched_journal_line_id: lineId }).eq("id", txn.id);
        if (error) throw new Error(error.message);
        return ok({ journal_line_id: lineId });
      }
      case "unmatch": {
        const { error } = await db.from("acct_bank_transactions")
          .update({ match_status: "unmatched", matched_journal_line_id: null }).eq("id", b.id).eq("tenant_id", tenant);
        if (error) throw new Error(error.message);
        return ok();
      }
      case "reconcile": {
        const { error } = await db.from("acct_bank_transactions")
          .update({ match_status: "reconciled" })
          .eq("bank_account_id", b.bank_account_id).eq("tenant_id", tenant).eq("match_status", "matched");
        if (error) throw new Error(error.message);
        return ok();
      }
      default:
        throw new Error("Unknown action");
    }
  } catch (e) { return fail(e); }
}
