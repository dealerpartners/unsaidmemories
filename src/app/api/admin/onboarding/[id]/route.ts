import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";
import {
  adminActor, getCaseWithGates, getCaseEvents, transitionCase, setGateStatus,
  applyGateFailure, recordDetermination, displayCase, displayGate,
  getCapabilities, setCapabilityStatus, activateCapabilities, checkInsurance,
  requiredGateKeysForReview,
  type OnboardingGate,
} from "../_shared";
import type { GateKey, GateStatus } from "@/lib/onboarding";
import {
  provisionActivation, setPortalAssignmentActive, sendDecisionEmail, ROLE_FOR_TYPE,
} from "../_provision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ===========================================================================
// /api/admin/onboarding/[id] — case detail + review actions (G13/G14).
//
// Every state/gate write goes through the engine contract
// (transitionCase / setGateStatus / applyGateFailure / recordDetermination)
// with actor = the acting admin, so each lands in the append-only
// onboarding_events log. Vocabulary reconciliation with the telemedicine
// credentialing desk (no competing vocabulary for the same decisions):
// the desk's begin_review IS this console's begin_review; its
// begin_credentialing / verify_license / verify_credential /
// reject_credential decisions are this console's gate_decision on G6/G8 —
// the same human decisions recorded on the engine case — and its
// create_veterinarian + activate are this console's activate action,
// which creates/links the roster row WITH user_id (the desk leaves it
// NULL when no portal_users email match exists).
// ===========================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MANUAL_GATES = ["G4", "G5", "G6", "G7", "G8"] as const;

const TYPE_LABEL: Record<string, string> = {
  individual_seller: "individual seller",
  business_seller: "business seller",
  manufacturer: "manufacturer / supplier",
  groomer: "grooming",
  pharmacy: "pharmacy",
  veterinarian: "veterinary",
  franchise: "franchise",
};

async function load(id: string) {
  const withGates = await getCaseWithGates(id);
  if (!withGates) return null;
  const { gates, ...c } = withGates;
  const [events, capabilities] = await Promise.all([getCaseEvents(id), getCapabilities(id)]);
  const d = displayCase(c, gates);
  const determinations = Array.isArray(c.metadata?.determinations) ? c.metadata.determinations : [];
  return {
    case: d,
    gates: gates.map(displayGate),
    capabilities,
    // Engine returns oldest-first; the console timeline reads newest-first.
    events: [...events].reverse().map((e) => ({
      id: e.id, from: e.fromState, to: e.toState, actor: e.actor,
      reason: e.reason, evidence_ref: e.evidenceRef, created_at: e.createdAt,
    })),
    determinations,
    insurance: checkInsurance(c.type, gates.find((g) => g.gateKey === "G7")),
    _raw: { c, gates },
  };
}

type Loaded = NonNullable<Awaited<ReturnType<typeof load>>>;

function pub(detail: Loaded) {
  const { _raw, ...rest } = detail;
  return rest;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
  try {
    const detail = await load(id);
    if (!detail) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    return NextResponse.json(pub(detail));
  } catch (e) {
    console.error("[GET /api/admin/onboarding/[id]]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load case" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid case id" }, { status: 400 });
  const body = await req.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";
  if (!action) return NextResponse.json({ error: "action is required" }, { status: 400 });
  const actor = await adminActor();
  const reason = typeof body?.reason === "string" ? body.reason.trim() || null : null;
  const evidenceRef = typeof body?.evidence_ref === "string" ? body.evidence_ref.trim() || null : null;

  try {
    const detail = await load(id);
    if (!detail) return NextResponse.json({ error: "Case not found" }, { status: 404 });
    const { c, gates } = detail._raw;
    const d = detail.case;
    const typeLabel = TYPE_LABEL[c.type] || c.type;
    const emailOpts = { to: d.applicant_email, name: d.applicant_name, typeLabel };
    const gateOf = (k: string): OnboardingGate | undefined => gates.find((g) => g.gateKey === k);

    switch (action) {
      case "begin_review": {
        await transitionCase(id, "UNDER_REVIEW", { actor, reason: reason || "review begun" });
        break;
      }

      case "gate_decision": {
        const gateKey = String(body?.gate_key || "");
        const decision = String(body?.decision || "");
        if (!(MANUAL_GATES as readonly string[]).includes(gateKey)) {
          return NextResponse.json({ error: `gate_key must be one of ${MANUAL_GATES.join(", ")}` }, { status: 400 });
        }
        if (!["pass", "fail", "needs_info"].includes(decision)) {
          return NextResponse.json({ error: "decision must be pass | fail | needs_info" }, { status: 400 });
        }
        const key = gateKey as GateKey;
        // Insurance pass enforces the POLICY floors from the gate's own
        // currency answers — below floor, the only honest outcome is
        // NEEDS_INFO (spec G7: below limits → NEEDS_INFO). No override.
        if (key === "G7" && decision === "pass") {
          const ins = checkInsurance(c.type, gateOf("G7"));
          if (ins.belowFloor) {
            return NextResponse.json(
              { error: `Insurance is below the POLICY floor (${ins.detail}). Record needs_info instead, or update the gate's currency answers when a compliant COI arrives.` },
              { status: 422 },
            );
          }
          if (!ins.checked && (ins.floorAggregate !== null || ins.floorPerOccurrence !== null)) {
            return NextResponse.json(
              { error: "G7 carries no currency answers to check against the POLICY floors — record the COI limits on the gate before passing it." },
              { status: 422 },
            );
          }
        }
        if (decision === "fail") {
          // applyGateFailure carries the spec §2 case semantics for the
          // gate (G5/G6 → BLOCKED_PENDING, G4/G8 → NEEDS_INFO manual
          // review, G7 → NEEDS_INFO) — one atomic record, no hand-rolled
          // case move here.
          await applyGateFailure(id, key, {
            actor,
            evidenceRef: evidenceRef || undefined,
            data: reason ? { decision_reason: reason } : {},
          });
        } else {
          const status: GateStatus = decision === "pass" ? "passed" : "needs_info";
          await setGateStatus(id, key, status, {
            actor,
            evidenceRef: evidenceRef || undefined,
            data: reason ? { decision_reason: reason } : {},
          });
          if (decision === "needs_info" && !["NEEDS_INFO", "APPROVED", "ACTIVE", "RESTRICTED", "SUSPENDED", "OFFBOARDED", "REJECTED"].includes(c.state)) {
            await transitionCase(id, "NEEDS_INFO", { actor, reason: reason || `${key} needs more information` });
          }
        }
        break;
      }

      case "request_info": {
        const message = typeof body?.message === "string" ? body.message.trim() : "";
        if (!message) return NextResponse.json({ error: "message is required — tell the applicant what is missing" }, { status: 400 });
        await transitionCase(id, "NEEDS_INFO", { actor, reason: message });
        await sendDecisionEmail({ kind: "needs_info", ...emailOpts, message });
        break;
      }

      case "reject": {
        if (!reason) return NextResponse.json({ error: "reason is required for a rejection" }, { status: 400 });
        await transitionCase(id, "REJECTED", { actor, reason });
        await sendDecisionEmail({ kind: "rejected", ...emailOpts, reason });
        break;
      }

      case "approve": {
        // G13: every REQUIRED gate for the type must be passed/waived
        // (not_applicable counts for conditional gates) before approval.
        const required = requiredGateKeysForReview(c.type);
        const blockers = required.filter((k) => {
          const g = gateOf(k);
          return !g || !["passed", "waived", "not_applicable"].includes(g.status);
        });
        if (blockers.length) {
          return NextResponse.json(
            { error: `Cannot approve — required gates not yet passed: ${blockers.join(", ")}` },
            { status: 422 },
          );
        }
        if (c.state === "READY_FOR_REVIEW") {
          await transitionCase(id, "UNDER_REVIEW", { actor, reason: "review begun (approve path)" });
        }
        await setGateStatus(id, "G13", "passed", { actor, data: reason ? { decision_reason: reason } : {} });
        await transitionCase(id, "APPROVED", { actor, reason: reason || "approved at G13 risk review" });
        await sendDecisionEmail({ kind: "approved", ...emailOpts });
        break;
      }

      case "activate": {
        if (c.state !== "APPROVED") {
          return NextResponse.json({ error: `Case must be APPROVED before activation (currently ${c.state})` }, { status: 422 });
        }
        if (!ROLE_FOR_TYPE[c.type]) {
          return NextResponse.json({ error: `No activation provisioning mapped for type "${c.type}"` }, { status: 422 });
        }
        // G14 provisioning: auth user → portal_users (WITH user_id) →
        // own-data records → capabilities VERIFIED → ACTIVE_*.
        const provision = await provisionActivation(d, gates, detail.capabilities, actor);
        // Leashed business tenants (engine type "franchise" — the SaaS
        // intake): the legacy franchise branch inside provisionActivation
        // stamps a bare tenant row and nothing else. The tenant is not
        // real until the Leashed sequence runs: Stripe customer +
        // subscription, sellers face, organizations bridge, owner
        // membership + business module grants. It runs HERE — on the
        // activation act, after approval (G13) and completed onboarding
        // — and it is idempotent, so re-activation completes gaps
        // instead of duplicating. A NOT_CONFIGURED outcome (no Leashed
        // Stripe price in app_settings, or Stripe unconfigured) refuses
        // activation with the named error BEFORE the case goes ACTIVE:
        // no free, half-provisioned tenant. Approval and completion are
        // separate admin acts today (approve at G13, then activate at
        // G14); provisioning hangs on activation, the completion act.
        let tenantProvision: unknown = null;
        if (c.type === "franchise") {
          const { provisionBusinessTenant } = await import("@/lib/tenants/provision");
          const tp = await provisionBusinessTenant({
            caseId: id,
            businessName: d.business_name || d.applicant_name || "",
            ownerName: d.applicant_name,
            ownerEmail: d.applicant_email,
            ownerPhone: d.applicant_phone,
            actor,
            answers: (d.answers || {}) as Record<string, unknown>,
          });
          if (!tp.ok) {
            return NextResponse.json(
              { error: tp.error, code: tp.code },
              { status: tp.code === "INVALID_INPUT" ? 422 : 503 },
            );
          }
          tenantProvision = tp;
        }
        const caps = await activateCapabilities(c.type, detail.capabilities, actor);
        await setGateStatus(id, "G14", "passed", {
          actor,
          data: { provision: JSON.parse(JSON.stringify(provision)) as Record<string, unknown> },
        });
        await transitionCase(id, "ACTIVE", { actor, reason: reason || "activated (G14)" });
        await sendDecisionEmail({ kind: "activated", ...emailOpts });
        const after = await load(id);
        return NextResponse.json({ ok: true, provision, tenantProvision, capabilities: caps, ...(after ? pub(after) : {}) });
      }

      case "restrict": {
        await transitionCase(id, "RESTRICTED", { actor, reason: reason || "restricted by admin" });
        await sendDecisionEmail({ kind: "restricted", ...emailOpts, reason });
        break;
      }

      case "suspend": {
        await transitionCase(id, "SUSPENDED", { actor, reason: reason || "suspended by admin" });
        await setPortalAssignmentActive(c.userId, d.applicant_email, false);
        await sendDecisionEmail({ kind: "suspended", ...emailOpts, reason });
        break;
      }

      case "offboard": {
        await transitionCase(id, "OFFBOARDED", { actor, reason: reason || "offboarded by admin" });
        await setPortalAssignmentActive(c.userId, d.applicant_email, false);
        await sendDecisionEmail({ kind: "offboarded", ...emailOpts, reason });
        break;
      }

      case "reinstate": {
        // Engine machine: RESTRICTED → ACTIVE; SUSPENDED → RESTRICTED
        // (cure step) — from SUSPENDED this lands at RESTRICTED and the
        // admin reinstates once more when cured.
        const target = c.state === "SUSPENDED" ? "RESTRICTED" : "ACTIVE";
        await transitionCase(id, target, { actor, reason: reason || `reinstated to ${target} by admin` });
        await setPortalAssignmentActive(c.userId, d.applicant_email, true);
        break;
      }

      case "capability_restrict":
      case "capability_restore": {
        const capId = String(body?.capability_id || "");
        if (!UUID_RE.test(capId)) return NextResponse.json({ error: "capability_id is required" }, { status: 400 });
        const cap = detail.capabilities.find((x) => x.id === capId);
        if (!cap) return NextResponse.json({ error: "Capability not found on this case" }, { status: 404 });
        // Per-capability control (the monitoring job's manual counterpart):
        // a vet loses ONE state's standing, nowhere else (spec §4/§6).
        // The audit note rides the capability's data jsonb (the engine lib
        // writes capabilities directly too — see _shared header).
        const next = action === "capability_restrict" ? "RESTRICTED" : "VERIFIED";
        await setCapabilityStatus(capId, next, {
          [`${action}_by`]: actor,
          [`${action}_at`]: new Date().toISOString(),
          [`${action}_reason`]: reason,
        });
        break;
      }

      case "determination": {
        // V31: the PLATFORM records its employment-classification
        // determination + basis from the facts of the relationship
        // (engine recordDetermination → case metadata.determinations[]).
        // A record with two required text fields — never a checkbox.
        const determination = typeof body?.determination === "string" ? body.determination.trim() : "";
        const basis = typeof body?.basis === "string" ? body.basis.trim() : "";
        if (!determination) return NextResponse.json({ error: "determination is required" }, { status: 400 });
        if (!basis) return NextResponse.json({ error: "basis is required — the facts the determination rests on" }, { status: 400 });
        await recordDetermination(id, {
          kind: "employment_classification",
          determination,
          basis,
          decidedBy: actor,
        });
        const after = await load(id);
        return NextResponse.json({ ok: true, ...(after ? pub(after) : {}) });
      }

      default:
        return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
    }

    const after = await load(id);
    return NextResponse.json({ ok: true, ...(after ? pub(after) : {}) });
  } catch (e) {
    console.error("[POST /api/admin/onboarding/[id]]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Action failed" }, { status: 500 });
  }
}
