import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";
import { accrueSellerEarnings } from "@/lib/sellers/accrual";
import { notifySeller } from "@/lib/sellers/notify";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// E1 · Payout Management — the ADMIN oversight desk over seller payouts.
// Tree leaves (admin-portal-tree.md §E1): Payout schedule · Holds · Reserves
// · Final settlement · Failed payouts. Data-graph contract E1: admin writes
// `payouts`; the seller portal reads "Seller sees own payouts".
//
// Real store (columns verified firsthand via information_schema +
// pg_constraint, 2026-10-14): public.seller_payouts — id, tenant_id,
// seller_id, amount (numeric, dollars), status (text, default 'pending'),
// payout_method_id, scheduled_at, paid_at, created_at, updated_at. The
// table carries ONLY its primary key — no CHECK, no FK — so the status
// vocabulary is the one written here, stated plainly:
//   'pending'   — the store's own default; a payout recorded, not reviewed.
//   'approved'  — an admin RECORD that the payout is reviewed and cleared
//                 for disbursement. No money has moved.
//   'on_hold'   — an admin RECORD that disbursement is held.
//   'cancelled' — an admin RECORD that the payout will not be disbursed.
//   'paid' / 'failed' are processor outcomes. THIS DESK NEVER WRITES THEM:
//   marking a payout 'paid' would assert money left the platform.
//
// THE MONEY MODEL IS DECIDED (Sunny, 2026-10-14): agency model — the
// Master ToS appoint the platform as the seller's legal agent to receive
// payments, so the platform is Merchant of Record (the buyer's card
// statement shows the platform; the buyer's obligation is satisfied at
// checkout). Stripe Connect Express with DESTINATION CHARGES: money
// lands in the platform balance first, the platform strips its fees, and
// the net passes to the seller's connected account. Payout delay is a
// policy lever — payouts.schedule.delay_days of 3, 5, or 7 keyed to the
// seller's performance score — and a buyer-filed Case automatically
// locks that transaction's payout window. Execution (destination-charge
// payloads, connected-account schedule control, the case->payout lock)
// is a DECIDED FOLLOW-ON module seated in the Admin Trust Center; it is
// not built here, and live processor calls happen production-side only
// (keys live only in the production env). The execute action below
// therefore still refuses — now pointing at its decided home.
// Score census for the delay tiers (firsthand, 2026-10-14): NO
// performance score exists to key on yet — seller_kpi_definitions,
// seller_kpi_snapshots, seller_metric_definitions, seller_metric_facts
// and seller_insights all hold 0 rows, and sellers carries no score or
// connected-account column. The nearest designed value is
// seller_capabilities.pro_tier (a tier label, also 0 rows). Defining the
// score is the follow-on module's first census item, not invented here.
// Reserves (the held pool) live on the seller's wallet — see the A5 route
// (api/admin/sellers/payments): seller_wallets.pending_balance is the
// held/reserve bucket, moved only by audited ledger records.
//
// Gate: "sellers" — the module every seller-money route uses (fees writer,
// seller activity read). Tenancy: tenant_id is a predicate in every
// statement.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PAYOUT_COLS = `
  p.id, p.seller_id, s.display_name AS seller_name, s.status AS seller_status,
  p.amount::float AS amount, p.status, p.payout_method_id,
  p.scheduled_at, p.paid_at, p.created_at, p.updated_at,
  p.execution_error, p.stripe_transfer_id
`;

const FROM = `
  FROM public.seller_payouts p
  JOIN public.sellers s ON s.id = p.seller_id AND s.tenant_id = p.tenant_id
`;

// Record actions: action -> { from: statuses it may act on, to, audit }.
// 'execute' / 'mark_paid' are deliberately absent — they are the gated act.
const ACTIONS: Record<string, { from: string[]; to: string; audit: string }> = {
  approve: { from: ["pending", "on_hold"], to: "approved", audit: "payout.approved" },
  hold: { from: ["pending", "approved"], to: "on_hold", audit: "payout.held" },
  release: { from: ["on_hold"], to: "pending", audit: "payout.hold_released" },
  cancel: { from: ["pending", "approved", "on_hold"], to: "cancelled", audit: "payout.cancelled" },
};

const GATED_ACTIONS = new Set(["execute", "mark_paid", "disburse", "pay"]);

// GET /api/admin/payouts?status=&seller_id= -> the oversight queue:
// every payout in the tenant (schedule order), counts by status, and the
// final-settlement section (closed sellers with payouts still outstanding).
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const status = (req.nextUrl.searchParams.get("status") || "").trim();
  const sellerId = (req.nextUrl.searchParams.get("seller_id") || "").trim();
  if (sellerId && !UUID_RE.test(sellerId)) {
    return NextResponse.json({ error: "seller_id must be a uuid" }, { status: 400 });
  }
  try {
    const out = await withPg(async (c) => {
      const clauses: string[] = ["p.tenant_id = $1"];
      const params: unknown[] = [tenant];
      if (status) {
        params.push(status);
        clauses.push(`p.status = $${params.length}`);
      }
      if (sellerId) {
        params.push(sellerId);
        clauses.push(`p.seller_id = $${params.length}::uuid`);
      }
      const { rows: payouts } = await c.query(
        `SELECT ${PAYOUT_COLS} ${FROM}
          WHERE ${clauses.join(" AND ")}
          ORDER BY p.scheduled_at ASC NULLS LAST, p.created_at DESC
          LIMIT 200`,
        params
      );
      const { rows: countRows } = await c.query(
        `SELECT status, count(*)::int AS n, COALESCE(SUM(amount), 0)::float AS total
           FROM public.seller_payouts
          WHERE tenant_id = $1
          GROUP BY status`,
        [tenant]
      );
      const counts: Record<string, { n: number; total: number }> = {};
      for (const r of countRows) counts[String(r.status)] = { n: r.n, total: r.total };
      // Final settlement: sellers whose account is closed while payout
      // records remain outstanding (not paid, not cancelled). Approving one
      // is the settlement RECORD; disbursing it stays gated like all payouts.
      const { rows: finalSettlement } = await c.query(
        `SELECT ${PAYOUT_COLS} ${FROM}
          WHERE p.tenant_id = $1 AND s.status = 'closed'
            AND p.status IN ('pending', 'approved', 'on_hold')
          ORDER BY p.created_at ASC`,
        [tenant]
      );
      // Failed payouts (E1): the repair queue — payouts the Connect
      // execution (lib/sellers/payout-execution) recorded a failure
      // against, WITH the recorded failure and transfer id, so the
      // desk works the failure instead of filtering a bare status.
      // A failure the repair path already cleared (execution_error
      // back to NULL, status advanced) leaves this queue on its own.
      const { rows: failedPayouts } = await c.query(
        `SELECT ${PAYOUT_COLS} ${FROM}
          WHERE p.tenant_id = $1
            AND (p.status = 'failed' OR p.execution_error IS NOT NULL)
          ORDER BY p.updated_at DESC
          LIMIT 100`,
        [tenant]
      );
      // Payout schedule (E1): the forward calendar — every payout not
      // yet terminal, grouped by its scheduled date, so the desk sees
      // what falls due when (amounts + counts per day, next 90 days
      // of scheduled dates plus the unscheduled tail, which exists
      // when a seller's delay policy was unconfigured at accrual).
      const { rows: schedule } = await c.query(
        `SELECT (p.scheduled_at AT TIME ZONE 'UTC')::date::text AS day,
                count(*)::int AS n,
                COALESCE(SUM(p.amount), 0)::float AS total,
                count(DISTINCT p.seller_id)::int AS sellers
           FROM public.seller_payouts p
          WHERE p.tenant_id = $1
            AND p.status IN ('pending', 'approved', 'on_hold')
          GROUP BY 1
          ORDER BY 1 ASC NULLS LAST`,
        [tenant]
      );
      return {
        payouts,
        counts,
        failed_payouts: failedPayouts,
        schedule,
        final_settlement: finalSettlement,
        disbursement_gated:
          "Payout execution runs on the decided money model (agency model, Stripe Connect Express, destination charges; delay_days 3/5/7 by performance score) from the Admin Trust Center follow-on module — production-side only. This desk records review state only; it never marks a payout paid.",
      };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: "payout queue failed" }, { status: 500 });
  }
}

// POST /api/admin/payouts { action: "accrue_earnings" } -> run the
// earnings accrual (lib/sellers/accrual): every paid + delivered seller
// order not yet accrued becomes, per seller, one pending payout record
// (scheduled by the Trust Center delay policy), a wallet credit, and a
// ledger row — atomically, in one transaction. This is the writer that
// feeds this desk's queue; running it when nothing is earnable is a
// no-op the summary reports honestly (zero orders, zero sellers).
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const action = String(b.action || "").trim().toLowerCase();
  if (action !== "accrue_earnings") {
    return NextResponse.json(
      { error: `Unknown action "${action}". This desk's run action: "accrue_earnings".` },
      { status: 400 }
    );
  }
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);
  const out = await withPg(async (c) => {
    await c.query("BEGIN");
    try {
      const summary = await accrueSellerEarnings(c as any, tenant, { actorId, ipAddress });
      await c.query("COMMIT");
      return summary;
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      throw e;
    }
  });
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  return NextResponse.json({ accrual: out }, { status: 201 });
}

// PATCH /api/admin/payouts { id, action } -> a RECORD transition on one
// payout row (approve / hold / release / cancel), status-guarded and
// audited. Execution actions refuse with the Connect gate, in writing.
export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const id = String(b.id || "");
  const action = String(b.action || "").trim().toLowerCase();

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "id must be a payout uuid" }, { status: 400 });
  }
  if (GATED_ACTIONS.has(action)) {
    return NextResponse.json(
      {
        error:
          "Payout execution is not performed at this desk. The money model is decided (agency model; Stripe Connect Express with destination charges; the platform strips its fees from the platform balance and the net passes to the seller's connected account after the score-keyed delay window of 3, 5, or 7 days). Execution — destination-charge payloads, connected-account payout-schedule control, and the buyer-Case payout lock — is the Admin Trust Center follow-on module, production-side only. This desk records review state only.",
        gated: "connect_execution_trust_center_module",
      },
      { status: 409 }
    );
  }
  const spec = ACTIONS[action];
  if (!spec) {
    return NextResponse.json(
      { error: `Unknown action "${action}". Record actions: ${Object.keys(ACTIONS).join(", ")}.` },
      { status: 400 }
    );
  }
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);

  try {
    const out = await withPg(async (c) => {
      const { rows: before } = await c.query(
        `SELECT ${PAYOUT_COLS} ${FROM} WHERE p.tenant_id = $1 AND p.id = $2::uuid`,
        [tenant, id]
      );
      if (before.length === 0) return { kind: "missing" as const };
      const row = before[0];
      if (!spec.from.includes(String(row.status))) {
        return { kind: "state" as const, status: String(row.status) };
      }
      const { rows: updated } = await c.query(
        `UPDATE public.seller_payouts
            SET status = $3, updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid AND status = ANY($4)
          RETURNING id`,
        [tenant, id, spec.to, spec.from]
      );
      if (updated.length === 0) return { kind: "state" as const, status: String(row.status) };
      await writeSellerAudit(c, {
        tenantId: tenant,
        sellerId: String(row.seller_id),
        actorId,
        ipAddress,
        action: spec.audit,
        entityType: "seller_payout",
        entityId: id,
        beforeState: { status: row.status, amount: row.amount },
        afterState: { status: spec.to, amount: row.amount },
      });
      // The seller hears every recorded payout decision through the
      // comms layer (event "payments" — their preferences decide the
      // channels). Failure-isolated inside notifySeller; it rides this
      // client so the notice exists exactly when the transition does.
      const amountLabel = `$${Number(row.amount).toFixed(2)}`;
      const payoutCopy: Record<string, { title: string; body: string }> = {
        approved: {
          title: "Payout approved",
          body: `Your payout of ${amountLabel} has been approved and cleared for disbursement.`,
        },
        on_hold: {
          title: "Payout placed on hold",
          body: `Your payout of ${amountLabel} has been placed on hold. It will not be disbursed while the hold stands — check your governance surface or contact support if you need the reason.`,
        },
        pending: {
          title: "Payout hold released",
          body: `The hold on your payout of ${amountLabel} has been released. It is back in the review queue.`,
        },
        cancelled: {
          title: "Payout cancelled",
          body: `Your payout of ${amountLabel} has been cancelled and will not be disbursed.`,
        },
      };
      const copy = payoutCopy[spec.to];
      if (copy) {
        await notifySeller(
          {
            tenantId: tenant,
            sellerId: String(row.seller_id),
            event: "payments",
            type: "payout_status",
            title: copy.title,
            body: copy.body,
            link: "/seller/payments/overview",
          },
          c,
        );
      }
      const { rows: full } = await c.query(
        `SELECT ${PAYOUT_COLS} ${FROM} WHERE p.tenant_id = $1 AND p.id = $2::uuid`,
        [tenant, id]
      );
      return { kind: "ok" as const, payout: full[0] };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (out.kind === "missing") {
      return NextResponse.json({ error: "Payout not found in this tenant" }, { status: 404 });
    }
    if (out.kind === "state") {
      return NextResponse.json(
        { error: `Payout is "${out.status}"; "${action}" applies to: ${spec.from.join(", ")}.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ payout: out.payout });
  } catch (e: any) {
    return NextResponse.json({ error: "payout action failed" }, { status: 500 });
  }
}
