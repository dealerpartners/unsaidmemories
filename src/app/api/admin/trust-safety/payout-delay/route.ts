import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";
import {
  PAYOUT_DELAY_SCOPE,
  readPayoutDelayPolicy,
  deriveDelayFromRecord,
  CONNECTED_ACCOUNT_NOTE,
} from "@/lib/sellers/payout-delay";
import {
  isPayoutDelayDays,
  buildPayoutScheduleUpdatePayload,
  buildCaseFreezeCall,
  buildCaseReleaseCall,
  buildCaseRefundCall,
  buildCaseReverseCall,
  type CaseActionInput,
} from "@/lib/stripe-connect-payloads";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// TRUST CENTER · Payout delay + buyer-Case payout locks — the control
// surface for the DECIDED Connect money model (Sunny, 2026-10-14: agency
// model; Stripe Connect Express; destination charges; payouts.schedule
// .delay_days of 3, 5, or 7 keyed to the seller's tier; a buyer-filed
// Case locks that transaction's payout window; execution's home is the
// Admin Trust Center — Sunny's single-pane ruling).
//
// NO LIVE STRIPE CALLS ARE MADE HERE. Keys exist only in the production
// env. This desk RECORDS the policy, the tier assignments, and the case
// actions — each case action's audit row carries the exact Stripe call
// descriptor (src/lib/stripe-connect-payloads.ts) that production-side
// execution will send. The payload shapes are the contract.
//
// THE TWO SCENARIOS (Sunny's diagram):
//   Scenario A (smooth order) — the delay window lapses and the payout
//     releases automatically to the seller's bank. The mechanism is the
//     connected account's payout schedule itself; this desk's job is
//     keeping the schedule's delay_days equal to the tier's policy.
//   Scenario B (dispute filed) — the Case freezes that transaction's
//     payout, the case works in the in-app resolution portal, and the
//     platform INTERVENES: release / refund / reverse, recorded here
//     against the case (public.seller_disputes).
//
// CASE PAYOUT STATES — the words THIS control writes into
// seller_disputes.status (the table carries only its PK — no CHECK —
// and had zero writers on this lineage before this desk):
//   'frozen'    — Scenario B open: the transaction's payout is locked.
//   'released'  — intervention: frozen net re-sent to the seller.
//   'refunded'  — intervention: buyer made whole from the charge.
//   'reversed'  — intervention: the transfer reversal stands permanent.
// Freeze applies from any other status; interventions apply ONLY from
// 'frozen'. The dispute's prior status is preserved in every audit
// row's before_state. These are the case's PAYOUT states, recorded
// alongside whatever lifecycle the seller-facing surfaces keep.
//
// CONNECTED ACCOUNTS: public.seller_stripe_accounts (migration
// 20261082) is the seller-keyed store; its writer is the seller-facing
// Connect onboarding in src/lib/sellers/connect.ts (BL-1, 2026-10-23),
// and Stripe's account.updated webhook keeps the flags current. The
// pane below reads the store per seller — recorded = false means that
// seller has not connected yet. The schedule payload recorded on a
// tier assignment is addressed to the seller's recorded account.
//
// Gate: "trust_safety" — the Trust Center's own module. Tenancy:
// tenant_id is a predicate in every statement.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CASE_TERMINAL = new Set(["released", "refunded", "reversed"]);

const SELLER_COLS = `
  s.id, s.display_name, s.legal_name, s.status, s.seller_type,
  s.commission_rate::float AS commission_rate,
  cap.pro_tier AS recorded_tier, cap.status AS capabilities_status,
  sa.stripe_account_id AS connect_account_id,
  sa.charges_enabled AS connect_charges_enabled,
  sa.payouts_enabled AS connect_payouts_enabled,
  sa.onboarding_complete AS connect_onboarding_complete,
  (SELECT count(*)::int FROM public.seller_disputes d
    WHERE d.tenant_id = s.tenant_id AND d.seller_id = s.id
      AND d.status IS DISTINCT FROM 'released'
      AND d.status IS DISTINCT FROM 'refunded'
      AND d.status IS DISTINCT FROM 'reversed') AS open_cases,
  (SELECT count(*)::int FROM public.seller_disputes d
    WHERE d.tenant_id = s.tenant_id AND d.seller_id = s.id
      AND d.status = 'frozen') AS frozen_cases
`;

const CASE_COLS = `
  d.id, d.seller_id, s.display_name AS seller_name, d.order_id, d.return_id,
  d.status, d.dispute_type, d.notes, d.created_at, d.updated_at,
  o.stripe_payment_intent_id AS order_payment_intent_id
`;

const CASE_FROM = `
  FROM public.seller_disputes d
  JOIN public.sellers s ON s.id = d.seller_id AND s.tenant_id = d.tenant_id
  LEFT JOIN public.commerce_orders o ON o.id = d.order_id::text AND o.tenant_id = d.tenant_id
`;

// GET /api/admin/trust-safety/payout-delay -> the pane: the tenant's
// tier->delay policy, every seller with their recorded tier + derived
// delay + connected-account state, and the tenant's cases.
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const policy = await readPayoutDelayPolicy(c, tenant);
      const { rows: sellerRows } = await c.query(
        `SELECT ${SELLER_COLS}
           FROM public.sellers s
           LEFT JOIN public.seller_capabilities cap
             ON cap.tenant_id = s.tenant_id AND cap.seller_id = s.id
           LEFT JOIN public.seller_stripe_accounts sa
             ON sa.tenant_id = s.tenant_id AND sa.seller_id = s.id
          WHERE s.tenant_id = $1
          ORDER BY s.display_name ASC
          LIMIT 200`,
        [tenant]
      );
      const sellers = sellerRows.map((r) => {
        const recordedTier = r.recorded_tier ? String(r.recorded_tier) : null;
        const { delayDays, source } = deriveDelayFromRecord(policy, recordedTier);
        return {
          id: String(r.id),
          display_name: r.display_name,
          legal_name: r.legal_name,
          status: r.status,
          seller_type: r.seller_type,
          commission_rate: r.commission_rate,
          recorded_tier: recordedTier,
          capabilities_status: r.capabilities_status ?? null,
          delay_days: delayDays,
          delay_source: source,
          connected_account: r.connect_account_id
            ? {
                recorded: true,
                stripe_account_id: String(r.connect_account_id),
                charges_enabled: Boolean(r.connect_charges_enabled),
                payouts_enabled: Boolean(r.connect_payouts_enabled),
                onboarding_complete: Boolean(r.connect_onboarding_complete),
                note: "Connected account recorded in seller_stripe_accounts.",
              }
            : { recorded: false, note: CONNECTED_ACCOUNT_NOTE },
          open_cases: r.open_cases ?? 0,
          frozen_cases: r.frozen_cases ?? 0,
        };
      });
      const { rows: cases } = await c.query(
        `SELECT ${CASE_COLS} ${CASE_FROM}
          WHERE d.tenant_id = $1
          ORDER BY d.created_at DESC
          LIMIT 200`,
        [tenant]
      );
      return {
        policy: {
          tiers: policy.tiers.map((t) => ({ tier: t.tier, delay_days: t.delayDays })),
          default_tier: policy.defaultTier,
        },
        sellers,
        cases,
        model: {
          scenario_a:
            "Scenario A (smooth order): the delay window lapses and Stripe releases automatically to the seller's bank — the connected account's payout schedule (delay_days) is the mechanism; this desk keeps the schedule equal to the tier policy.",
          scenario_b:
            "Scenario B (dispute filed): the Case freezes that transaction's payout; after the in-app resolution portal, the platform intervenes — release, refund, or reverse — recorded against the case with the exact Stripe call production-side execution will send.",
          execution:
            "No live Stripe calls are made from this desk (keys live only in the production env). Actions recorded here carry their payload descriptors in seller_audit_log.",
          connected_account_gap: CONNECTED_ACCOUNT_NOTE,
        },
      };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: "payout-delay pane failed" }, { status: 500 });
  }
}

// POST /api/admin/trust-safety/payout-delay { action, ... } ->
//   set_tier_band   { tier, delay_days }  — upsert one policy band.
//   set_default_tier{ tier|null }         — the unassigned seller's band.
//   assign_tier     { seller_id, tier|null } — record the seller's tier
//                     on seller_capabilities.pro_tier (upsert).
//   case_freeze     { dispute_id }        — Scenario B opens.
//   case_intervene  { dispute_id, intervention: release|refund|reverse }
// Every action is status/rule-guarded and audited via writeSellerAudit.
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const action = String(b.action || "").trim();
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);

  try {
    const out = await withPg(async (c) => {
      // ---------------------------------------------------------------
      if (action === "set_tier_band") {
        const tier = String(b.tier || "").trim();
        const days = Number(b.delay_days);
        if (!tier || tier.length > 40 || tier.includes(":")) {
          return { kind: "bad" as const, error: "tier must be a band name (1-40 chars, no ':')" };
        }
        if (!isPayoutDelayDays(days)) {
          return { kind: "bad" as const, error: "delay_days must be one of the ruling's values: 3, 5, or 7" };
        }
        const key = `tier:${tier}`;
        const { rows: before } = await c.query(
          `SELECT value FROM public.policy_settings WHERE tenant_id = $1 AND scope = $2 AND key = $3`,
          [tenant, PAYOUT_DELAY_SCOPE, key]
        );
        await c.query(
          `INSERT INTO public.policy_settings (tenant_id, scope, key, value, updated_at, updated_by)
           VALUES ($1, $2, $3, $4, now(), $5::uuid)
           ON CONFLICT (tenant_id, scope, key)
           DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
          [tenant, PAYOUT_DELAY_SCOPE, key, String(days), actorId]
        );
        await writeSellerAudit(c, {
          tenantId: tenant,
          actorId,
          ipAddress,
          action: "payout_delay.tier_band_set",
          entityType: "policy_settings",
          beforeState: { tier, delay_days: before[0] ? Number(before[0].value) : null },
          afterState: { tier, delay_days: days },
        });
        return { kind: "ok" as const, policy: await readPayoutDelayPolicy(c, tenant) };
      }

      // ---------------------------------------------------------------
      if (action === "set_default_tier") {
        const raw = b.tier;
        const tier = raw === null || raw === undefined || raw === "" ? null : String(raw).trim();
        const policy = await readPayoutDelayPolicy(c, tenant);
        if (tier !== null && !policy.tiers.some((t) => t.tier === tier)) {
          return {
            kind: "bad" as const,
            error: `Default tier "${tier}" is not a configured band. Configure the band first (set_tier_band).`,
          };
        }
        if (tier === null) {
          await c.query(
            `DELETE FROM public.policy_settings WHERE tenant_id = $1 AND scope = $2 AND key = 'default_tier'`,
            [tenant, PAYOUT_DELAY_SCOPE]
          );
        } else {
          await c.query(
            `INSERT INTO public.policy_settings (tenant_id, scope, key, value, updated_at, updated_by)
             VALUES ($1, $2, 'default_tier', $3, now(), $4::uuid)
             ON CONFLICT (tenant_id, scope, key)
             DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
            [tenant, PAYOUT_DELAY_SCOPE, tier, actorId]
          );
        }
        await writeSellerAudit(c, {
          tenantId: tenant,
          actorId,
          ipAddress,
          action: "payout_delay.default_tier_set",
          entityType: "policy_settings",
          beforeState: { default_tier: policy.defaultTier },
          afterState: { default_tier: tier },
        });
        return { kind: "ok" as const, policy: await readPayoutDelayPolicy(c, tenant) };
      }

      // ---------------------------------------------------------------
      if (action === "assign_tier") {
        const sellerId = String(b.seller_id || "");
        const raw = b.tier;
        const tier = raw === null || raw === undefined || raw === "" ? null : String(raw).trim();
        if (!UUID_RE.test(sellerId)) {
          return { kind: "bad" as const, error: "seller_id must be a uuid" };
        }
        const policy = await readPayoutDelayPolicy(c, tenant);
        if (tier !== null && !policy.tiers.some((t) => t.tier === tier)) {
          return {
            kind: "bad" as const,
            error: `Tier "${tier}" is not a configured band in this tenant's payout-delay policy. Configure the band first, then assign it.`,
          };
        }
        const { rows: sellerRows } = await c.query(
          `SELECT id FROM public.sellers WHERE tenant_id = $1 AND id = $2::uuid`,
          [tenant, sellerId]
        );
        if (sellerRows.length === 0) return { kind: "missing" as const, what: "Seller" };
        const { rows: capBefore } = await c.query(
          `SELECT pro_tier FROM public.seller_capabilities WHERE tenant_id = $1 AND seller_id = $2::uuid`,
          [tenant, sellerId]
        );
        // Upsert on the verified unique (tenant_id, seller_id). A fresh
        // row takes the permissions writer's own defaults for the flags
        // it owns; on conflict ONLY pro_tier changes — the flags are
        // the permissions surface's, never this desk's to reset.
        await c.query(
          `INSERT INTO public.seller_capabilities
             (tenant_id, seller_id, is_pro, pro_tier, can_advertise, can_bulk_import, status)
           VALUES ($1, $2::uuid, false, $3, false, false, 'active')
           ON CONFLICT (tenant_id, seller_id)
           DO UPDATE SET pro_tier = EXCLUDED.pro_tier, updated_at = now()`,
          [tenant, sellerId, tier]
        );
        const { delayDays, source } = deriveDelayFromRecord(policy, tier);
        // The schedule change is addressed to the seller's recorded
        // connected account when one exists (seller_stripe_accounts —
        // the writer landed with BL-1), so the recorded call is
        // executable as-is; target stays null for an unconnected
        // seller, whose account is born with its window at onboarding.
        const { rows: acctRows } = await c.query(
          `SELECT stripe_account_id FROM public.seller_stripe_accounts
            WHERE tenant_id = $1 AND seller_id = $2::uuid LIMIT 1`,
          [tenant, sellerId]
        );
        const connectAccountId = acctRows[0]?.stripe_account_id
          ? String(acctRows[0].stripe_account_id)
          : null;
        await writeSellerAudit(c, {
          tenantId: tenant,
          sellerId,
          actorId,
          ipAddress,
          action: "seller.tier_assigned",
          entityType: "seller_capabilities",
          beforeState: { pro_tier: capBefore[0]?.pro_tier ?? null },
          afterState: {
            pro_tier: tier,
            derived_delay_days: delayDays,
            delay_source: source,
            // The schedule change production-side execution sends to
            // the seller's connected account when the tier changes.
            stripe_call: delayDays
              ? {
                  api: "accounts.update",
                  target: connectAccountId,
                  params: buildPayoutScheduleUpdatePayload({ delayDays }),
                }
              : null,
          },
        });
        return {
          kind: "ok" as const,
          assignment: { seller_id: sellerId, pro_tier: tier, delay_days: delayDays, delay_source: source },
        };
      }

      // ---------------------------------------------------------------
      if (action === "case_freeze" || action === "case_intervene") {
        const disputeId = String(b.dispute_id || "");
        if (!UUID_RE.test(disputeId)) {
          return { kind: "bad" as const, error: "dispute_id must be a uuid" };
        }
        const { rows } = await c.query(
          `SELECT ${CASE_COLS} ${CASE_FROM} WHERE d.tenant_id = $1 AND d.id = $2::uuid`,
          [tenant, disputeId]
        );
        if (rows.length === 0) return { kind: "missing" as const, what: "Case" };
        const row = rows[0];
        const status = row.status ? String(row.status) : null;
        const callInput: CaseActionInput = {
          disputeId,
          tenantId: tenant,
          sellerId: String(row.seller_id),
          orderId: row.order_id ? String(row.order_id) : null,
          paymentIntentId: row.order_payment_intent_id
            ? String(row.order_payment_intent_id)
            : null,
        };

        if (action === "case_freeze") {
          if (status === "frozen") {
            return { kind: "state" as const, error: "Case payout is already frozen." };
          }
          if (status && CASE_TERMINAL.has(status)) {
            return {
              kind: "state" as const,
              error: `Case already closed by intervention ("${status}") — a closed case cannot be frozen.`,
            };
          }
          const { rows: updated } = await c.query(
            `UPDATE public.seller_disputes
                SET status = 'frozen', updated_at = now()
              WHERE tenant_id = $1 AND id = $2::uuid AND status IS NOT DISTINCT FROM $3
              RETURNING id`,
            [tenant, disputeId, status]
          );
          if (updated.length === 0) return { kind: "state" as const, error: "Case changed underneath — retry." };
          const call = buildCaseFreezeCall(callInput);
          await writeSellerAudit(c, {
            tenantId: tenant,
            sellerId: String(row.seller_id),
            actorId,
            ipAddress,
            action: "case.payout_frozen",
            entityType: "seller_dispute",
            entityId: disputeId,
            beforeState: { status },
            afterState: { status: "frozen", stripe_call: call },
          });
          return { kind: "ok" as const, case_status: "frozen", stripe_call: call };
        }

        // case_intervene — only from 'frozen'.
        const intervention = String(b.intervention || "").trim();
        const MAP: Record<
          string,
          { to: string; audit: string; build: (i: CaseActionInput) => unknown }
        > = {
          release: { to: "released", audit: "case.intervention_release", build: buildCaseReleaseCall },
          refund: { to: "refunded", audit: "case.intervention_refund", build: buildCaseRefundCall },
          reverse: { to: "reversed", audit: "case.intervention_reverse", build: buildCaseReverseCall },
        };
        const spec = MAP[intervention];
        if (!spec) {
          return {
            kind: "bad" as const,
            error: `Unknown intervention "${intervention}". The platform's action set: release, refund, reverse.`,
          };
        }
        if (status !== "frozen") {
          return {
            kind: "state" as const,
            error: `Case payout is "${status ?? "not frozen"}"; interventions apply only to a frozen case (Scenario B).`,
          };
        }
        const { rows: updated } = await c.query(
          `UPDATE public.seller_disputes
              SET status = $3, updated_at = now()
            WHERE tenant_id = $1 AND id = $2::uuid AND status = 'frozen'
            RETURNING id`,
          [tenant, disputeId, spec.to]
        );
        if (updated.length === 0) return { kind: "state" as const, error: "Case changed underneath — retry." };
        const call = spec.build(callInput);
        await writeSellerAudit(c, {
          tenantId: tenant,
          sellerId: String(row.seller_id),
          actorId,
          ipAddress,
          action: spec.audit,
          entityType: "seller_dispute",
          entityId: disputeId,
          beforeState: { status: "frozen" },
          afterState: { status: spec.to, stripe_call: call },
        });
        return { kind: "ok" as const, case_status: spec.to, stripe_call: call };
      }

      return {
        kind: "bad" as const,
        error: `Unknown action "${action}". Actions: set_tier_band, set_default_tier, assign_tier, case_freeze, case_intervene.`,
      };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (out.kind === "bad") return NextResponse.json({ error: out.error }, { status: 400 });
    if (out.kind === "missing") {
      return NextResponse.json({ error: `${out.what} not found in this tenant` }, { status: 404 });
    }
    if (out.kind === "state") return NextResponse.json({ error: out.error }, { status: 409 });
    const { kind: _kind, ...rest } = out;
    return NextResponse.json(rest);
  } catch (e: any) {
    return NextResponse.json({ error: "payout-delay action failed" }, { status: 500 });
  }
}
