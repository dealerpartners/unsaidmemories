import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";
import {
  listCases, getCaseWithGates, displayCase, caseFlags,
  CASE_STATES, APPLICANT_TYPES,
} from "./_shared";
import type { CaseState, ApplicantType } from "@/lib/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/onboarding — the engine case queue. Filters: ?state=,
// ?type=. Cases come from the engine contract (listCases); gate progress
// + flags are read-model computed from onboarding_gates (failed/blocked
// gates, expired evidence, insurance below the POLICY floors).
export async function GET(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  try {
    const { searchParams } = new URL(req.url);
    const state = searchParams.get("state") || undefined;
    const type = searchParams.get("type") || undefined;
    if (state && !CASE_STATES.includes(state as CaseState)) {
      return NextResponse.json({ error: `Unknown state "${state}"` }, { status: 400 });
    }
    if (type && !APPLICANT_TYPES.includes(type as ApplicantType)) {
      return NextResponse.json({ error: `Unknown type "${type}"` }, { status: 400 });
    }
    const cases = await listCases({
      state: state as CaseState | undefined,
      type: type as ApplicantType | undefined,
      limit: 200,
    });

    // Gate rows for progress/flags: listCases returns cases only, so this
    // route fetches each case's gates via the contract getter. Bounded by
    // the 200-case page; flagged as a scale gap in admin-review.md (the
    // contract has no bulk gates read).
    const out: Record<string, unknown>[] = [];
    for (const c of cases) {
      const withGates = await getCaseWithGates(c.id);
      const gates = withGates?.gates ?? [];
      const d = displayCase(c, gates);
      const required = gates.filter((g) => g.status !== "not_applicable");
      out.push({
        ...d,
        gates_total: required.length,
        gates_passed: required.filter((g) => g.status === "passed" || g.status === "waived").length,
        flags: caseFlags(d, gates),
      });
    }
    return NextResponse.json({ cases: out, states: CASE_STATES, types: APPLICANT_TYPES });
  } catch (e) {
    console.error("[GET /api/admin/onboarding]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load cases" }, { status: 500 });
  }
}
