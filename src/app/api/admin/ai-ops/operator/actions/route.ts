import { NextRequest, NextResponse } from "next/server";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { resolveTenantId } from "@/lib/admin-api";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import {
  createCategory,
  OperatorRefusal,
} from "@/lib/ai-ops/operator";

// ---------------------------------------------------------------------------
// POST /api/admin/ai-ops/operator/actions — DIRECTED ACTIONS. A click
// executes a governed act, recorded as an ai_tasks directed_action:
//
//   act "create_category"  { name, parent_id, subcategory_name? }
//     Builds the node (and its subcategory, in the same act) on the
//     canonical taxonomy (taxonomy_nodes) through §G's write shapes.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const act = typeof body?.act === "string" ? body.act : "";
  const actorId = await getActorIdFromRequest(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  try {
    if (act === "create_category") {
      const result = await withPg(async (c) => {
        const tenant = await resolveTenantId(c as any);
        return createCategory(c as any, tenant, actorId, ip, {
          name: typeof body?.name === "string" ? body.name : "",
          parent_id: typeof body?.parent_id === "string" ? body.parent_id : "",
          subcategory_name:
            typeof body?.subcategory_name === "string"
              ? body.subcategory_name
              : null,
        });
      });
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json(
      { error: "act must be 'create_category'." },
      { status: 400 },
    );
  } catch (e) {
    if (e instanceof OperatorRefusal) {
      const status = e.kind === "missing" ? 404 : e.kind === "state" ? 409 : 400;
      return NextResponse.json({ error: e.message }, { status });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Action failed." },
      { status: 500 },
    );
  }
}
