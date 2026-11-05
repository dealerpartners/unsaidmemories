import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, withPgStrict } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";

export const dynamic = "force-dynamic";

// B.11 Incidents — public.ai_incidents (exists live): failures, degradations,
// and anomalous AI behavior, optionally tied to a model. J4's record fields
// (root cause · remediation · post-mortems) are columns on the incident
// record itself — added live in migration record 20261061; before that the
// store carried title/description only and the three leaves had no home.

const COLS = `i.id, i.title, i.description, i.severity, i.status, i.created_at, i.updated_at,
  i.root_cause, i.remediation, i.post_mortem,
  i.model_id, m.name AS model_name`;
const FROM = `FROM public.ai_incidents i LEFT JOIN public.ai_models m ON m.id = i.model_id`;

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT ${COLS} ${FROM} WHERE i.tenant_id = $1 ORDER BY i.created_at DESC LIMIT 200`,
        [tenant]
      );
      return { incidents: rows };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai incidents list failed" }, { status: 500 });
  }
}

// POST /api/admin/ai-ops/incidents -> report an incident
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const title = String(b.title || "").trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  const severity = ["critical", "high", "medium", "low"].includes(String(b.severity)) ? String(b.severity) : "medium";
  const description = b.description ? String(b.description) : null;
  const modelId = b.model_id ? String(b.model_id) : null;
  const actorId = await getActorIdFromRequest(req);
  try {
    const out = await withPgStrict(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO public.ai_incidents (tenant_id, model_id, severity, status, title, description)
         VALUES ($1, $2::uuid, $3, 'open', $4, $5) RETURNING id`,
        [tenant, modelId, severity, title, description]
      );
      if (!rows[0]) throw new Error("AI incident insert did not land");
      await writeSellerAudit(c, {
        tenantId: tenant,
        actorId,
        action: "ai_incident.reported",
        entityType: "ai_incident",
        entityId: rows[0].id,
        afterState: { title, severity },
        ipAddress: requestIp(req),
      });
      const { rows: full } = await c.query(`SELECT ${COLS} ${FROM} WHERE i.id = $1`, [rows[0].id]);
      return { incident: full[0] };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai incident create failed" }, { status: 500 });
  }
}
