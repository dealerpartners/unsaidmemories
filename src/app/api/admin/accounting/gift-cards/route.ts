import { guard, ctx, ok, fail, body } from "../_shared";
import { round2, postJournal, bookContext } from "@/lib/accounting";

export const dynamic = "force-dynamic";

// GET /api/admin/accounting/gift-cards
//
// Gift Cards & Store Credit payload (Batch 2): the card register
// (acct_gift_cards) with each card's last activity from
// acct_gift_card_transactions, the recent transaction ledger,
// and the ASC 606 breakage schedule. Breakage here is an
// ESTIMATE with its assumption stated, never a posted number:
// balances still owed on cards with no activity for
// BREAKAGE_WINDOW_MONTHS or more. Recognized breakage is the
// separate, real figure — the sum of 'expire' transactions,
// which is where the expire action actually posted it.

const BREAKAGE_WINDOW_MONTHS = 12;

export async function GET() {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const [{ data: cards }, { data: txns }] = await Promise.all([
      db.from("acct_gift_cards").select("*").eq("tenant_id", tenant)
        .order("created_at", { ascending: false }).limit(500),
      db.from("acct_gift_card_transactions").select("*").eq("tenant_id", tenant)
        .order("created_at", { ascending: false }).limit(1000),
    ]);
    const lastActivity = new Map<string, string>();
    for (const t of (txns || []) as any[]) {
      if (!lastActivity.has(t.gift_card_id)) lastActivity.set(t.gift_card_id, t.created_at);
    }
    const now = Date.now();
    const ageMonths = (iso: string) => (now - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
    const enriched = ((cards || []) as any[]).map((c) => {
      const last = lastActivity.get(c.id) || c.updated_at || c.created_at;
      return { ...c, last_activity_at: last, months_inactive: Math.round(ageMonths(last) * 10) / 10 };
    });
    const active = enriched.filter((c) => c.status === "active");
    const outstanding = round2(active.reduce((s, c) => s + Number(c.balance || 0), 0));
    const buckets = { current: 0, aging: 0, breakage: 0 };
    for (const c of active) {
      const bal = Number(c.balance || 0);
      if (bal <= 0) continue;
      if (c.months_inactive >= BREAKAGE_WINDOW_MONTHS) buckets.breakage += bal;
      else if (c.months_inactive >= 6) buckets.aging += bal;
      else buckets.current += bal;
    }
    const recognizedBreakage = round2(((txns || []) as any[])
      .filter((t) => t.txn_type === "expire")
      .reduce((s, t) => s + Number(t.amount || 0), 0));
    return ok({
      cards: enriched,
      transactions: txns || [],
      breakage: {
        windowMonths: BREAKAGE_WINDOW_MONTHS,
        outstanding,
        current: round2(buckets.current),
        aging6to12: round2(buckets.aging),
        estimatedBreakage: round2(buckets.breakage),
        recognizedBreakage,
      },
      summary: {
        total: enriched.length,
        active: active.length,
        funded: active.filter((c) => Number(c.balance || 0) > 0).length,
        zeroBalance: enriched.filter((c) => Number(c.balance || 0) === 0).length,
        expired: enriched.filter((c) => c.status === "expired").length,
        outstanding,
      },
    });
  } catch (e) { return fail(e, 500); }
}

const LIABILITY = (kind: string) => (kind === "store_credit" ? "2310" : "2300");

function newCode() {
  const seg = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `UNS-${seg()}-${seg()}-${seg()}`;
}

async function logTxn(db: any, tenant: string, card: any, type: string, amount: number, balanceAfter: number, journalId?: string, notes?: string, reference?: string) {
  await db.from("acct_gift_card_transactions").insert({
    tenant_id: tenant, gift_card_id: card.id, txn_type: type,
    amount, balance_after: balanceAfter, posted_journal_id: journalId || null,
    notes: notes || null, reference: reference || null,
  });
}

export async function POST(req: Request) {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const b = await body(req);
    const { entityId } = await bookContext(db, tenant);

    if (b.action === "issue") {
      const amount = round2(Number(b.amount));
      if (!amount) throw new Error("Amount required");
      const kind = b.kind || "gift_card";
      const code = b.code || newCode();
      const journalId = await postJournal(db, {
        source: kind === "store_credit" ? "credit_memo" : "customer_receipt",
        memo: kind === "store_credit" ? "Store credit issued" : `Gift card ${code} sold`,
        lines: kind === "store_credit"
          ? [{ accountCode: "6110", debit: amount, credit: 0 }, { accountCode: "2310", debit: 0, credit: amount }]
          : [{ accountCode: b.bank_code || "1000", debit: amount, credit: 0 }, { accountCode: "2300", debit: 0, credit: amount }],
      });
      const { data: card, error } = await db.from("acct_gift_cards").insert({
        tenant_id: tenant, entity_id: entityId, code, kind, status: "active",
        initial_amount: amount, balance: amount, currency: "USD",
        customer_id: b.customer_id || null, issued_to_email: b.email || null,
        issued_reason: b.reason || null, expires_at: b.expires_at || null,
        posted_journal_id: journalId,
      }).select("*").single();
      if (error) throw new Error(error.message);
      await logTxn(db, tenant, card, "issue", amount, amount, journalId, b.reason);
      return ok({ id: card.id, code, journal_id: journalId });
    }

    if (b.action === "check_balance") {
      const { data } = await db.from("acct_gift_cards").select("*").eq("tenant_id", tenant).eq("code", b.code).single();
      if (!data) throw new Error("No card with that code");
      return ok({ card: data });
    }

    const { data: card } = await db.from("acct_gift_cards").select("*").eq("id", b.id).eq("tenant_id", tenant).single();
    if (!card) throw new Error("Card not found");
    const amount = round2(Number(b.amount));
    const liab = LIABILITY(card.kind);

    switch (b.action) {
      case "add_value": {
        const journalId = await postJournal(db, {
          source: "customer_receipt", memo: `Value added to ${card.code}`,
          lines: [{ accountCode: b.bank_code || "1000", debit: amount, credit: 0 }, { accountCode: liab, debit: 0, credit: amount }],
        });
        const bal = round2(Number(card.balance) + amount);
        await db.from("acct_gift_cards").update({ balance: bal, status: "active" }).eq("id", card.id);
        await logTxn(db, tenant, card, "add_value", amount, bal, journalId);
        return ok({ journal_id: journalId, balance: bal });
      }
      case "redeem": {
        if (amount > Number(card.balance)) throw new Error("Amount exceeds card balance");
        if (card.status !== "active") throw new Error("Card is not active");
        const journalId = await postJournal(db, {
          source: "invoice", memo: `${card.kind === "store_credit" ? "Store credit" : "Gift card"} ${card.code} redeemed`,
          lines: [{ accountCode: liab, debit: amount, credit: 0 }, { accountCode: "4000", debit: 0, credit: amount }],
        });
        const bal = round2(Number(card.balance) - amount);
        await db.from("acct_gift_cards").update({ balance: bal, status: bal === 0 ? "redeemed" : "active" }).eq("id", card.id);
        await logTxn(db, tenant, card, "redeem", amount, bal, journalId, undefined, b.reference);
        return ok({ journal_id: journalId, balance: bal });
      }
      case "transfer": {
        const { data: target } = await db.from("acct_gift_cards").select("*").eq("tenant_id", tenant).eq("code", b.to_code).single();
        if (!target) throw new Error("Target card not found");
        const move = Math.min(amount || Number(card.balance), Number(card.balance));
        const fromBal = round2(Number(card.balance) - move);
        const toBal = round2(Number(target.balance) + move);
        await db.from("acct_gift_cards").update({ balance: fromBal, status: fromBal === 0 ? "redeemed" : card.status }).eq("id", card.id);
        await db.from("acct_gift_cards").update({ balance: toBal, status: "active" }).eq("id", target.id);
        await logTxn(db, tenant, card, "transfer_out", move, fromBal, undefined, `To ${target.code}`);
        await logTxn(db, tenant, target, "transfer_in", move, toBal, undefined, `From ${card.code}`);
        return ok({ balance: fromBal });
      }
      case "convert": {
        if (card.kind !== "gift_card") throw new Error("Only gift cards convert to store credit");
        const journalId = await postJournal(db, {
          source: "credit_memo", memo: `Gift card ${card.code} converted to store credit`,
          lines: [{ accountCode: "2300", debit: Number(card.balance), credit: 0 }, { accountCode: "2310", debit: 0, credit: Number(card.balance) }],
        });
        await db.from("acct_gift_cards").update({ kind: "store_credit" }).eq("id", card.id);
        await logTxn(db, tenant, card, "convert", Number(card.balance), Number(card.balance), journalId);
        return ok({ journal_id: journalId });
      }
      case "deactivate":
        await db.from("acct_gift_cards").update({ status: "deactivated" }).eq("id", card.id);
        return ok();
      case "reactivate":
        await db.from("acct_gift_cards").update({ status: "active" }).eq("id", card.id);
        await logTxn(db, tenant, card, "reactivate", 0, Number(card.balance));
        return ok();
      case "expire": {
        const bal = Number(card.balance);
        let journalId: string | undefined;
        if (bal > 0) {
          journalId = await postJournal(db, {
            source: "revenue_recognition", memo: `Expired card ${card.code} breakage recognized`,
            lines: [{ accountCode: liab, debit: bal, credit: 0 }, { accountCode: "4900", debit: 0, credit: bal }],
          });
        }
        await db.from("acct_gift_cards").update({ status: "expired", balance: 0 }).eq("id", card.id);
        await logTxn(db, tenant, card, "expire", bal, 0, journalId);
        return ok({ journal_id: journalId });
      }
      case "void":
        await db.from("acct_gift_cards").update({ status: "voided" }).eq("id", card.id);
        await logTxn(db, tenant, card, "void", Number(card.balance), Number(card.balance));
        return ok();
      case "replace": {
        const code = newCode();
        await db.from("acct_gift_cards").update({ status: "voided" }).eq("id", card.id);
        const { data: fresh, error } = await db.from("acct_gift_cards").insert({
          tenant_id: tenant, entity_id: entityId, code, kind: card.kind, status: "active",
          initial_amount: card.initial_amount, balance: card.balance, currency: "USD",
          customer_id: card.customer_id, issued_to_email: card.issued_to_email,
          issued_reason: `Replacement for ${card.code}`, expires_at: card.expires_at,
        }).select("*").single();
        if (error) throw new Error(error.message);
        await logTxn(db, tenant, fresh, "issue", Number(card.balance), Number(card.balance), undefined, `Replacement for ${card.code}`);
        return ok({ id: fresh.id, code });
      }
      default:
        throw new Error("Unknown action");
    }
  } catch (e) { return fail(e); }
}
