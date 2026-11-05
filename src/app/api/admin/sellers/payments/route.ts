import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";
import { generateSellerStatements } from "@/lib/sellers/accrual";
import {
  readReservePolicy,
  resolveReservePercent,
  writeReservePercent,
} from "@/lib/sellers/reserve";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// A5 · Seller Payments — the per-seller payment-standing face.
// Tree leaves (admin-portal-tree.md §A5): Payout holds · Reserve management
// · Fee schedules · Statements · 1099 issuance. Data-graph contract A5:
// admin writes `payouts`, `seller_wallets`; the seller reads own payouts.
//
// Where a seller's standing actually reads from (every store verified
// firsthand via information_schema + pg_constraint, 2026-10-14; each of
// these tables carries ONLY its primary key — no CHECKs, no FKs):
//   sellers                  status, commission_rate (0..1 CHECK), tax_id_last4
//   seller_wallets           balance (available), pending_balance (the held /
//                            reserve bucket), currency. One row per seller.
//   seller_wallet_transactions  the ledger behind the wallet (type, amount,
//                            balance_after, notes).
//   seller_payouts           payout records (E1 desk writes review state).
//   seller_fee_schedules     fee config (written at /api/admin/fees — E2).
//   seller_statements        period statements (gross / fees / net).
//   seller_tax_documents     W-9 / 1099-K register (E3 desk).
//   seller_payment_methods   payout destinations (last4 only, by design).
// commerce_payments carries NO seller_id (verified) — it is the shop's own
// sale money and cannot express a seller's standing; it is not read here.
//
// Earnings state, honestly: at build time every one of these stores is
// EMPTY — balances are zero because no seller money has ever been
// recorded, not because a surface hides it. The writer now exists
// (lib/sellers/accrual, run from the E1 desk): it converts paid +
// delivered seller orders into payout records, wallet credits, and
// statements. It has nothing to convert yet — no commerce order
// carries a seller attribution, and none is both paid and delivered —
// so the stores stay empty until real seller orders flow. Holds and
// reserves are the buildable A5/E1 actions on
// this schema: a hold MOVES an amount between the seller's own two wallet
// buckets (available -> pending) and writes the ledger row; a release
// moves it back. That is a record inside the designed ledger — no money
// leaves the platform, so it does not touch disbursement (decided model:
// agency + Stripe Connect Express destination charges, executed from the
// Admin Trust Center follow-on module, production-side only). The wallet
// row is born on the first hold if none exists yet.
//
// Gate: "sellers". Tenancy: tenant_id is a predicate in every statement.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function money(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

// GET /api/admin/sellers/payments             -> standing list (all sellers)
// GET /api/admin/sellers/payments?seller_id=  -> one seller's full standing
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const sellerId = (req.nextUrl.searchParams.get("seller_id") || "").trim();
  if (sellerId && !UUID_RE.test(sellerId)) {
    return NextResponse.json({ error: "seller_id must be a uuid" }, { status: 400 });
  }
  try {
    const out = await withPg(async (c) => {
      if (!sellerId) {
        const { rows } = await c.query(
          `SELECT s.id, s.display_name, s.legal_name, s.seller_type, s.status,
                  s.commission_rate::float AS commission_rate,
                  (s.tax_id_last4 IS NOT NULL) AS tax_id_on_file,
                  COALESCE(w.balance, 0)::float AS available_balance,
                  COALESCE(w.pending_balance, 0)::float AS held_balance,
                  COALESCE(w.currency, 'USD') AS currency,
                  (SELECT count(*)::int FROM public.seller_payouts p
                    WHERE p.tenant_id = s.tenant_id AND p.seller_id = s.id
                      AND p.status IN ('pending', 'approved', 'on_hold')) AS payouts_outstanding,
                  (SELECT count(*)::int FROM public.seller_payouts p
                    WHERE p.tenant_id = s.tenant_id AND p.seller_id = s.id
                      AND p.status = 'failed') AS payouts_failed,
                  (SELECT count(*)::int FROM public.seller_fee_schedules f
                    WHERE f.tenant_id = s.tenant_id AND f.seller_id = s.id) AS fee_schedules_own,
                  (SELECT count(*)::int FROM public.seller_fee_schedules f
                    WHERE f.tenant_id = s.tenant_id AND f.seller_id IS NULL) AS fee_schedules_default,
                  (SELECT count(*)::int FROM public.seller_payment_methods m
                    WHERE m.tenant_id = s.tenant_id AND m.seller_id = s.id
                      AND m.status = 'active') AS payout_methods_active
             FROM public.sellers s
             LEFT JOIN public.seller_wallets w
               ON w.tenant_id = s.tenant_id AND w.seller_id = s.id
            WHERE s.tenant_id = $1
            ORDER BY s.display_name`,
          [tenant]
        );
        return { sellers: rows };
      }

      const { rows: sellerRows } = await c.query(
        `SELECT id, display_name, legal_name, seller_type, status, email,
                commission_rate::float AS commission_rate, tax_id_last4,
                approved_at, created_at
           FROM public.sellers
          WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, sellerId]
      );
      if (sellerRows.length === 0) return { missing: true as const };
      const seller = sellerRows[0];

      const [wallet, transactions, payouts, schedules, statements, taxDocs, methods] =
        await Promise.all([
          c.query(
            `SELECT id, balance::float AS balance, pending_balance::float AS pending_balance,
                    currency, updated_at
               FROM public.seller_wallets
              WHERE tenant_id = $1 AND seller_id = $2::uuid`,
            [tenant, sellerId]
          ),
          c.query(
            `SELECT id, transaction_type, amount::float AS amount,
                    balance_after::float AS balance_after, notes, created_at
               FROM public.seller_wallet_transactions
              WHERE tenant_id = $1 AND seller_id = $2::uuid
              ORDER BY created_at DESC LIMIT 20`,
            [tenant, sellerId]
          ),
          c.query(
            `SELECT id, amount::float AS amount, status, scheduled_at, paid_at, created_at
               FROM public.seller_payouts
              WHERE tenant_id = $1 AND seller_id = $2::uuid
              ORDER BY created_at DESC LIMIT 20`,
            [tenant, sellerId]
          ),
          c.query(
            `SELECT id, seller_id, category_id, fee_type, rate::float AS rate,
                    flat_amount::float AS flat_amount, effective_from, effective_to, created_at
               FROM public.seller_fee_schedules
              WHERE tenant_id = $1 AND (seller_id = $2::uuid OR seller_id IS NULL)
              ORDER BY seller_id NULLS LAST, created_at DESC LIMIT 50`,
            [tenant, sellerId]
          ),
          c.query(
            `SELECT id, period_start, period_end, gross::float AS gross,
                    fees::float AS fees, net::float AS net, status, statement_url, created_at
               FROM public.seller_statements
              WHERE tenant_id = $1 AND seller_id = $2::uuid
              ORDER BY period_end DESC NULLS LAST, created_at DESC LIMIT 12`,
            [tenant, sellerId]
          ),
          c.query(
            `SELECT id, doc_type, tax_year, status, document_url, created_at
               FROM public.seller_tax_documents
              WHERE tenant_id = $1 AND seller_id = $2::uuid
              ORDER BY created_at DESC LIMIT 20`,
            [tenant, sellerId]
          ),
          c.query(
            `SELECT id, method_type, last4, brand, is_default, status, created_at
               FROM public.seller_payment_methods
              WHERE tenant_id = $1 AND seller_id = $2::uuid
              ORDER BY is_default DESC, created_at DESC`,
            [tenant, sellerId]
          ),
        ]);

      const reservePolicy = await readReservePolicy(c, tenant);
      return {
        seller,
        reserve_percent: resolveReservePercent(reservePolicy, sellerId),
        wallet: wallet.rows[0] ?? null,
        wallet_transactions: transactions.rows,
        payouts: payouts.rows,
        fee_schedules: schedules.rows,
        statements: statements.rows,
        tax_documents: taxDocs.rows,
        payment_methods: methods.rows,
      };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if ("missing" in out) {
      return NextResponse.json({ error: "Seller not found in this tenant" }, { status: 404 });
    }
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: "seller standing failed" }, { status: 500 });
  }
}

// POST /api/admin/sellers/payments { action: 'place_hold' | 'release_hold',
// seller_id, amount, note? } -> move money between the seller's own wallet
// buckets with a ledger row + audit. place_hold: available -> held
// (pending_balance — the reserve pool). release_hold: held -> available.
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const action = String(b.action || "").trim().toLowerCase();

  // Statement generation (A5 · Statements): one seller_statements row
  // per seller for the period, aggregated from the orders the accrual
  // stamped in it (lib/sellers/accrual). Sellers already holding a
  // statement for the exact period are skipped — never duplicated.
  if (action === "generate_statements") {
    const periodStart = String(b.period_start || "").trim();
    const periodEnd = String(b.period_end || "").trim();
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    if (!DATE_RE.test(periodStart) || !DATE_RE.test(periodEnd) || periodStart > periodEnd) {
      return NextResponse.json(
        { error: "period_start and period_end must be dates (YYYY-MM-DD), start on or before end" },
        { status: 400 }
      );
    }
    const actorId = await getActorIdFromRequest(req);
    const ipAddress = requestIp(req);
    const out = await withPg(async (c) => {
      await c.query("BEGIN");
      try {
        const summary = await generateSellerStatements(c as any, tenant, periodStart, periodEnd, {
          actorId,
          ipAddress,
        });
        await c.query("COMMIT");
        return summary;
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      }
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json({ statements: out }, { status: 201 });
  }

  // Reserve policy (A5/E1 · Reserve management): set or clear the
  // percentage the accrual withholds into the wallet's held bucket —
  // the tenant default, or one seller's override when seller_id is
  // given. percent: null clears. The policy store is policy_settings
  // scope "payout_reserve" (lib/sellers/reserve); application happens
  // in the accrual, release through release_hold above.
  if (action === "set_reserve_policy") {
    const targetSeller = b.seller_id ? String(b.seller_id) : null;
    if (targetSeller && !UUID_RE.test(targetSeller)) {
      return NextResponse.json({ error: "seller_id must be a uuid" }, { status: 400 });
    }
    const percent =
      b.percent === null || b.percent === undefined || b.percent === ""
        ? null
        : Number(b.percent);
    if (percent !== null && (!Number.isFinite(percent) || percent < 0 || percent > 100)) {
      return NextResponse.json({ error: "percent must be a number between 0 and 100, or null to clear" }, { status: 400 });
    }
    const actorId = await getActorIdFromRequest(req).catch(() => null);
    const ipAddress = requestIp(req);
    const out = await withPg(async (c) => {
      await c.query("BEGIN");
      try {
        const before = resolveReservePercent(await readReservePolicy(c, tenant), targetSeller ?? "");
        await writeReservePercent(c, tenant, targetSeller, percent, actorId);
        await writeSellerAudit(c, {
          tenantId: tenant,
          sellerId: targetSeller,
          actorId,
          ipAddress,
          action: "payout.reserve_policy_set",
          entityType: "policy_settings",
          entityId: null,
          beforeState: { seller_id: targetSeller, reserve_percent: before },
          afterState: { seller_id: targetSeller, reserve_percent: percent },
        });
        const policy = await readReservePolicy(c, tenant);
        await c.query("COMMIT");
        return {
          default_percent: policy.defaultPercent,
          per_seller: Object.fromEntries(policy.perSeller),
        };
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      }
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json({ reserve_policy: out });
  }

  const sellerId = String(b.seller_id || "");
  const amount = money(Number(b.amount));
  const note = b.note ? String(b.note).slice(0, 500) : null;

  if (action !== "place_hold" && action !== "release_hold") {
    return NextResponse.json(
      { error: 'Unknown action. This desk records: "place_hold", "release_hold", "generate_statements", "set_reserve_policy". Payout disbursement runs on the decided Connect model from the Admin Trust Center follow-on module — not from this desk.' },
      { status: 400 }
    );
  }
  if (!UUID_RE.test(sellerId)) {
    return NextResponse.json({ error: "seller_id must be a uuid" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);
  const placing = action === "place_hold";

  try {
    const out = await withPg(async (c) => {
      const { rows: sellerRows } = await c.query(
        `SELECT id FROM public.sellers WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, sellerId]
      );
      if (sellerRows.length === 0) return { kind: "no_seller" as const };

      // The wallet is born on first use; the schema carries no unique
      // (tenant, seller) constraint, so create-if-absent is explicit.
      await c.query(
        `INSERT INTO public.seller_wallets (tenant_id, seller_id)
         SELECT $1, $2::uuid
          WHERE NOT EXISTS (
            SELECT 1 FROM public.seller_wallets
             WHERE tenant_id = $1 AND seller_id = $2::uuid)`,
        [tenant, sellerId]
      );
      const { rows: walletRows } = await c.query(
        `SELECT id, balance::float AS balance, pending_balance::float AS pending_balance
           FROM public.seller_wallets
          WHERE tenant_id = $1 AND seller_id = $2::uuid
          ORDER BY id LIMIT 1`,
        [tenant, sellerId]
      );
      const wallet = walletRows[0];
      const available = money(wallet.balance);
      const held = money(wallet.pending_balance);
      if (placing && available < amount) {
        return { kind: "insufficient" as const, bucket: "available", balance: available };
      }
      if (!placing && held < amount) {
        return { kind: "insufficient" as const, bucket: "held", balance: held };
      }

      const { rows: updated } = await c.query(
        placing
          ? `UPDATE public.seller_wallets
                SET balance = balance - $3, pending_balance = pending_balance + $3,
                    updated_at = now()
              WHERE tenant_id = $1 AND id = $2::uuid AND balance >= $3
              RETURNING balance::float AS balance, pending_balance::float AS pending_balance`
          : `UPDATE public.seller_wallets
                SET balance = balance + $3, pending_balance = pending_balance - $3,
                    updated_at = now()
              WHERE tenant_id = $1 AND id = $2::uuid AND pending_balance >= $3
              RETURNING balance::float AS balance, pending_balance::float AS pending_balance`,
        [tenant, wallet.id, amount]
      );
      if (updated.length === 0) {
        return {
          kind: "insufficient" as const,
          bucket: placing ? "available" : "held",
          balance: placing ? available : held,
        };
      }
      const after = updated[0];
      const { rows: txnRows } = await c.query(
        `INSERT INTO public.seller_wallet_transactions
           (tenant_id, seller_id, wallet_id, transaction_type, amount, balance_after, notes)
         VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7)
         RETURNING id`,
        [
          tenant,
          sellerId,
          wallet.id,
          placing ? "hold" : "hold_release",
          placing ? -amount : amount,
          after.balance,
          note || (placing ? "Admin payout hold (A5)" : "Admin hold release (A5)"),
        ]
      );
      await writeSellerAudit(c, {
        tenantId: tenant,
        sellerId,
        actorId,
        ipAddress,
        action: placing ? "payout.hold_placed" : "payout.hold_released",
        entityType: "seller_wallet",
        entityId: String(wallet.id),
        beforeState: { balance: available, pending_balance: held },
        afterState: {
          balance: after.balance,
          pending_balance: after.pending_balance,
          amount,
          wallet_transaction_id: txnRows[0]?.id ?? null,
          note,
        },
      });
      return {
        kind: "ok" as const,
        wallet: {
          id: wallet.id,
          balance: after.balance,
          pending_balance: after.pending_balance,
        },
        transaction_id: txnRows[0]?.id ?? null,
      };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (out.kind === "no_seller") {
      return NextResponse.json({ error: "Seller not found in this tenant" }, { status: 404 });
    }
    if (out.kind === "insufficient") {
      return NextResponse.json(
        {
          error: `Insufficient ${out.bucket} balance: $${out.balance.toFixed(2)} available for this action.`,
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ wallet: out.wallet, transaction_id: out.transaction_id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: "wallet hold action failed" }, { status: 500 });
  }
}
