import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, withPgStrict } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";
import { AI_FUNCTIONS, aiFunction } from "@/lib/ai-ops/functions";

export const dynamic = "force-dynamic";

// J · AI Ops FUNCTIONS — public.ai_tasks (created live, migration record
// 20261061): one row per AI check / proposal / draft across the seven
// operational functions (Sunny's definition, 2026-10-14). The AI proposes;
// the human at the function's desk decides (see the PATCH route). Recording
// a task takes NO consequential act: nothing is sent, published, approved,
// or decided by this write — it files the AI's output for the desk.

const COLS = `t.id, t.function, t.subject_type, t.subject_id, t.model_id, t.prompt_id,
  t.input, t.output, t.output_text, t.state, t.decided_by, t.decided_at,
  t.created_at, t.updated_at, m.name AS model_name, p.name AS prompt_name`;

const FROM = `FROM public.ai_tasks t
  LEFT JOIN public.ai_models m ON m.id = t.model_id
  LEFT JOIN public.ai_prompts p ON p.id = t.prompt_id`;

type Row = Record<string, unknown>;

/** Human-readable subject labels, resolved per subject type from the real
 *  subject stores (tenant-scoped). Missing subjects label as such — the
 *  task record stands on its own either way. */
async function subjectLabels(c: any, tenant: string, tasks: Row[]): Promise<Map<string, string>> {
  const byType = new Map<string, string[]>();
  for (const t of tasks) {
    if (!t.subject_id || !t.subject_type) continue;
    const arr = byType.get(String(t.subject_type)) ?? [];
    arr.push(String(t.subject_id));
    byType.set(String(t.subject_type), arr);
  }
  const labels = new Map<string, string>();
  const fill = (rows: Row[], fmt: (r: Row) => string) => {
    for (const r of rows) labels.set(String(r.id), fmt(r));
  };
  for (const [type, ids] of byType) {
    if (type === "support_ticket") {
      const { rows } = await c.query(
        `SELECT id, ticket_ref, subject FROM public.support_tickets WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenant, ids],
      );
      fill(rows, (r) => `${r.ticket_ref ?? "ticket"} — ${r.subject ?? ""}`.trim());
    } else if (type === "seller_application") {
      const { rows } = await c.query(
        `SELECT id, business_name, status FROM public.seller_partner_applications WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenant, ids],
      );
      fill(rows, (r) => `${r.business_name ?? "application"} (${r.status ?? "—"})`);
    } else if (type === "verification_task") {
      const { rows } = await c.query(
        `SELECT id, task_type, status FROM public.verification_tasks WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenant, ids],
      );
      fill(rows, (r) => `${r.task_type ?? "task"} (${r.status ?? "—"})`);
    } else if (type === "brand_opt_out") {
      const { rows } = await c.query(
        `SELECT o.id, o.strength, o.status, b.name AS brand_name
           FROM public.brand_opt_outs o LEFT JOIN public.brands b ON b.id = o.brand_id
          WHERE o.tenant_id = $1 AND o.id = ANY($2::uuid[])`,
        [tenant, ids],
      );
      fill(rows, (r) => `${r.brand_name ?? "brand"} opt-out (${r.strength ?? "—"}, ${r.status ?? "—"})`);
    } else if (type === "catalog_item") {
      const { rows } = await c.query(
        `SELECT id, name FROM public.commerce_catalog_items WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenant, ids],
      );
      fill(rows, (r) => String(r.name ?? "catalog item"));
    } else if (type === "review") {
      const { rows } = await c.query(
        `SELECT r.id, r.rating, r.title, i.name AS item_name
           FROM public.reviews r LEFT JOIN public.commerce_catalog_items i ON i.id = r.product_id
          WHERE r.tenant_id = $1 AND r.id = ANY($2::uuid[])`,
        [tenant, ids],
      );
      fill(rows, (r) => `${r.rating ?? "—"}★ review${r.item_name ? ` on ${r.item_name}` : ""}${r.title ? ` — ${r.title}` : ""}`);
    } else if (type === "chat_session") {
      const { rows } = await c.query(
        `SELECT id, title FROM public.kinnect_chat_sessions WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenant, ids],
      ).catch((e: any) => {
        // kinnect_chat_sessions may not be applied yet (42P01) — labels are
        // enrichment; real query failures surface instead of empty labels.
        if (e?.code === "42P01") return { rows: [] as Row[] };
        throw e;
      });
      fill(rows, (r) => `Chat — ${r.title ?? "session"}`);
    } else if (type === "triage_session") {
      const { rows } = await c.query(
        `SELECT id, ai_urgency, escalated_to_booking, created_at FROM clinical.triage_sessions WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenant, ids],
      );
      fill(rows, (r) => `Triage ${r.ai_urgency ?? "—"}${r.escalated_to_booking ? " · escalated to booking" : ""} (${String(r.created_at ?? "").slice(0, 10)})`);
    } else if (type === "vet_lead") {
      const { rows } = await c.query(
        `SELECT id, owner_name, pet_name, status FROM clinical.vet_leads WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenant, ids],
      );
      fill(rows, (r) => `Lead — ${r.owner_name ?? "owner"}${r.pet_name ? ` · ${r.pet_name}` : ""} (${r.status ?? "—"})`);
    }
  }
  return labels;
}

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const fn = req.nextUrl.searchParams.get("function");
  const state = req.nextUrl.searchParams.get("state");
  try {
    const out = await withPg(async (c) => {
      const clauses = ["t.tenant_id = $1"];
      const params: unknown[] = [tenant];
      if (fn && aiFunction(fn)) { params.push(fn); clauses.push(`t.function = $${params.length}`); }
      if (state) { params.push(state); clauses.push(`t.state = $${params.length}`); }
      const { rows } = await c.query(
        `SELECT ${COLS} ${FROM} WHERE ${clauses.join(" AND ")} ORDER BY t.created_at DESC LIMIT 300`,
        params,
      );
      const { rows: counts } = await c.query(
        `SELECT function, state, count(*)::int AS n FROM public.ai_tasks
          WHERE tenant_id = $1 GROUP BY function, state`,
        [tenant],
      );
      const labels = await subjectLabels(c, tenant, rows as Row[]);
      return {
        functions: AI_FUNCTIONS,
        counts: counts as Row[],
        tasks: (rows as Row[]).map((t) => ({
          ...t,
          subject_label: t.subject_id ? labels.get(String(t.subject_id)) ?? null : null,
        })),
      };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai tasks list failed" }, { status: 500 });
  }
}

// POST /api/admin/ai-ops/tasks -> record one AI check / proposal / draft.
// This is the write path the function runners and the desks use to file AI
// output. Born state 'proposed'. NO desk state is touched by this write.
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const def = aiFunction(String(b.function || ""));
  if (!def) return NextResponse.json({ error: "function must be one of the registered AI Ops functions" }, { status: 400 });
  const subjectType = b.subject_type ? String(b.subject_type) : null;
  if (subjectType && !def.subjects.includes(subjectType)) {
    return NextResponse.json({ error: `subject_type for ${def.key} must be one of: ${def.subjects.join(", ")}` }, { status: 400 });
  }
  const subjectId = b.subject_id ? String(b.subject_id) : null;
  if (def.subjectRequired && (!subjectType || !subjectId)) {
    return NextResponse.json({ error: `subject_type and subject_id are required for ${def.key}` }, { status: 400 });
  }
  const outputText = b.output_text ? String(b.output_text) : null;
  const output = b.output && typeof b.output === "object" ? b.output : {};
  const input = b.input && typeof b.input === "object" ? b.input : {};
  if (!outputText && Object.keys(output as object).length === 0) {
    return NextResponse.json({ error: "an AI task records output: output_text or output is required" }, { status: 400 });
  }
  const modelId = b.model_id ? String(b.model_id) : null;
  const promptId = b.prompt_id ? String(b.prompt_id) : null;
  const actorId = await getActorIdFromRequest(req);
  try {
    const out = await withPgStrict(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO public.ai_tasks
           (tenant_id, function, subject_type, subject_id, model_id, prompt_id, input, output, output_text, state)
         VALUES ($1, $2, $3, $4::uuid, $5::uuid, $6::uuid, $7::jsonb, $8::jsonb, $9, 'proposed')
         RETURNING id`,
        [tenant, def.key, subjectType, subjectId, modelId, promptId, JSON.stringify(input), JSON.stringify(output), outputText],
      );
      if (!rows[0]) throw new Error("AI task insert did not land");
      await writeSellerAudit(c, {
        tenantId: tenant,
        actorId,
        action: "ai_task.recorded",
        entityType: "ai_task",
        entityId: rows[0].id,
        afterState: { function: def.key, subject_type: subjectType, subject_id: subjectId },
        ipAddress: requestIp(req),
      });
      const { rows: full } = await c.query(`SELECT ${COLS} ${FROM} WHERE t.id = $1`, [rows[0].id]);
      return { task: full[0] };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai task record failed" }, { status: 500 });
  }
}
