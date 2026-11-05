import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// GET /api/admin/trust-safety/fraud-queue -> the F1 Fraud queue inside
// Trust & Safety: the OPERATOR's fraud detections (ai_tasks,
// function='fraud_scan' — the same records the AI Ops operator desk
// reads; no forked store, no second copy) with the governance cases
// their responses opened (seller_disputes, linked by the case_id each
// response recorded on the detection's output.responses).
//
// This face is the queue's home in §F; the governed RESPONSES (open
// case, freeze payout, notify, temporary suspension) remain the
// operator desk's acts — this route writes nothing.
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);

  try {
    const out = await withPg(async (c) => {
      const { rows: detections } = await c.query(
        `SELECT t.id, t.subject_type, t.subject_id, t.state, t.created_at,
                t.output->>'signal' AS signal, t.output->>'severity' AS severity,
                t.output->'evidence' AS evidence, t.output->'citation' AS citation,
                t.output->'responses' AS responses,
                s.display_name AS seller_name
           FROM public.ai_tasks t
           LEFT JOIN public.sellers s ON s.id = t.subject_id AND s.tenant_id = t.tenant_id
          WHERE t.tenant_id = $1 AND t.function = 'fraud_scan'
            AND t.subject_type <> 'scan_run' AND t.input->>'response_to' IS NULL
          ORDER BY t.created_at DESC LIMIT 200`,
        [tenant]
      );

      // Cases linked from the detections' recorded responses.
      const caseIds = new Set<string>();
      for (const d of detections) {
        const responses = Array.isArray(d.responses) ? d.responses : [];
        for (const r of responses) {
          const cid = r?.result?.case_id;
          if (typeof cid === "string" && cid) caseIds.add(cid);
        }
      }
      const caseById = new Map<string, any>();
      if (caseIds.size > 0) {
        const { rows: cases } = await c.query(
          `SELECT id, seller_id, status, dispute_type, created_at
             FROM public.seller_disputes
            WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
          [tenant, [...caseIds]]
        );
        for (const cs of cases) caseById.set(String(cs.id), cs);
      }

      return {
        detections: detections.map((d: any) => {
          const responses = Array.isArray(d.responses) ? d.responses : [];
          const cases = responses
            .map((r: any) => r?.result?.case_id)
            .filter((cid: any) => typeof cid === "string" && caseById.has(cid))
            .map((cid: string) => caseById.get(cid));
          return {
            id: d.id,
            subject_type: d.subject_type,
            subject_id: d.subject_id,
            seller_name: d.seller_name ?? null,
            signal: d.signal,
            severity: d.severity,
            state: d.state,
            evidence: d.evidence ?? null,
            citation: d.citation ?? null,
            responses_applied: responses.length,
            cases,
            created_at: d.created_at,
          };
        }),
      };
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "fraud queue failed" }, { status: 500 });
  }
}
