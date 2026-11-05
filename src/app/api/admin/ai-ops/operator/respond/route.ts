import { NextRequest, NextResponse } from "next/server";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { resolveTenantId } from "@/lib/admin-api";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { applyResponseToTask, OperatorRefusal } from "@/lib/ai-ops/operator";
import { RESPONSE_KINDS, type ResponseInput } from "@/lib/ai-ops/operator-core";

// ---------------------------------------------------------------------------
// POST /api/admin/ai-ops/operator/respond — apply a governed response to
// a fraud-scan detection (ai_tasks row). The acts: open_case ·
// freeze_payout · notify · suspend_seller_temporary.
//
// HARD GATE (the brief's, enforced in the lib): a response always needs
// a reason; the consequential acts (open_case, freeze_payout,
// suspend_seller_temporary) need a cited policy that RESOLVES to a
// recorded policy in its seat (seller_policies / site policies / an
// applied brand opt-out). A citation that doesn't resolve refuses the
// response — nothing is written.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const taskId = typeof body?.task_id === "string" ? body.task_id : "";
  const response = typeof body?.response === "string" ? body.response : "";
  if (!taskId) {
    return NextResponse.json({ error: "task_id is required." }, { status: 400 });
  }
  if (!(RESPONSE_KINDS as readonly string[]).includes(response)) {
    return NextResponse.json(
      { error: `response must be one of: ${RESPONSE_KINDS.join(", ")}.` },
      { status: 400 },
    );
  }
  const input: ResponseInput = {
    response: response as ResponseInput["response"],
    reason: typeof body?.reason === "string" ? body.reason : "",
    citation:
      body?.citation && typeof body.citation === "object"
        ? {
            source: body.citation.source,
            id: body.citation.id ?? null,
            title: body.citation.title ?? null,
            version:
              typeof body.citation.version === "number"
                ? body.citation.version
                : null,
          }
        : null,
    case_id: typeof body?.case_id === "string" ? body.case_id : undefined,
    audience:
      body?.audience === "seller" || body?.audience === "staff" || body?.audience === "customer"
        ? body.audience
        : undefined,
  };
  const actorId = await getActorIdFromRequest(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  try {
    const result = await withPg(async (c) => {
      const tenant = await resolveTenantId(c as any);
      return applyResponseToTask(c as any, tenant, actorId, ip, taskId, input);
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof OperatorRefusal) {
      const status = e.kind === "missing" ? 404 : e.kind === "state" ? 409 : 400;
      return NextResponse.json({ error: e.message }, { status });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Response failed." },
      { status: 500 },
    );
  }
}
