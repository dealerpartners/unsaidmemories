import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";
import { isInvestigationType } from "@/lib/trust-safety";

export const dynamic = "force-dynamic";

// GET /api/admin/trust-safety/investigations -> real investigations list.
// The F3 per-type queues are views over investigation_type (the tree's
// five leaf names, CHECK-enforced since DDL 20261072): ?type=<type>
// narrows to one queue.
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "read");
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const tenant = resolveTenantId(req);
  const status = (sp.get("status") || "").trim();
  const type = (sp.get("type") || "").trim();
  if (type && type !== "all" && !isInvestigationType(type)) {
    return NextResponse.json({ error: "unknown investigation type" }, { status: 400 });
  }

  try {
    const out = await withPg(async (c) => {
      const conds = ["i.tenant_id = $1"];
      const params: any[] = [tenant];
      if (status && status !== "all") {
        params.push(status);
        conds.push(`i.status = $${params.length}`);
      }
      if (type && type !== "all") {
        params.push(type);
        conds.push(`i.investigation_type = $${params.length}`);
      }
      // order_id (migration 20261080) carries the C2 order-escalation
      // link. Pre-migration the column does not exist — fall back to
      // the same list without it rather than failing the whole queue.
      const baseCols = `i.id, i.tenant_id, i.seller_id, i.status, i.priority, i.findings, i.notes,
                i.investigation_type,
                i.violation_id, i.investigator_id, i.created_at, i.updated_at,
                s.display_name AS seller_name`;
      const fromSql = `FROM public.seller_investigations i
           LEFT JOIN public.sellers s ON s.id = i.seller_id AND s.tenant_id = i.tenant_id
          WHERE ${conds.join(" AND ")}
          ORDER BY i.created_at DESC LIMIT 200`;
      let rows: any[];
      try {
        ({ rows } = await c.query(`SELECT ${baseCols}, i.order_id ${fromSql}`, params));
      } catch {
        ({ rows } = await c.query(`SELECT ${baseCols}, NULL AS order_id ${fromSql}`, params));
      }
      return { investigations: rows };
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "investigations list failed" }, { status: 500 });
  }
}

// POST /api/admin/trust-safety/investigations -> open a typed investigation.
// Until this route existed the store had NO writer — nothing anywhere
// could open an investigation. The desk opens one directly, or from a
// violation/case row (violation_id carried, and the violation must
// belong to the same seller in this tenant — checked in SQL; the
// store's composite FKs back the same facts). Born 'open', audited.
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "write");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const sellerId = String(body.seller_id || "");
  const investigationType = String(body.investigation_type || "");
  const violationId = body.violation_id ? String(body.violation_id) : null;
  const priority = body.priority ? String(body.priority) : "medium";
  const notes = body.notes ? String(body.notes) : null;
  if (!sellerId) return NextResponse.json({ error: "seller_id required" }, { status: 400 });
  if (!isInvestigationType(investigationType)) {
    return NextResponse.json({ error: "investigation_type must be one of the F3 types" }, { status: 400 });
  }
  if (!["critical", "high", "medium", "low"].includes(priority)) {
    return NextResponse.json({ error: "priority must be critical|high|medium|low" }, { status: 400 });
  }
  const tenant = resolveTenantId(req);
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);

  try {
    const out = await withPg(async (c) => {
      const { rows: seller } = await c.query(
        `SELECT id FROM public.sellers WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, sellerId]
      );
      if (!seller[0]) return { error: "seller not found in this tenant" as const };
      if (violationId) {
        const { rows: v } = await c.query(
          `SELECT id FROM public.seller_violations
            WHERE tenant_id = $1 AND id = $2::uuid AND seller_id = $3::uuid`,
          [tenant, violationId, sellerId]
        );
        if (!v[0]) return { error: "violation not found for this seller" as const };
      }
      const { rows } = await c.query(
        `INSERT INTO public.seller_investigations
           (tenant_id, seller_id, violation_id, investigation_type, status, priority, notes)
         VALUES ($1, $2::uuid, $3::uuid, $4, 'open', $5, $6)
         RETURNING id, investigation_type, status, priority, created_at`,
        [tenant, sellerId, violationId, investigationType, priority, notes]
      );
      if (!rows[0]) throw new Error("Investigation insert did not land");
      await writeSellerAudit(c, {
        tenantId: tenant, sellerId, actorId, ipAddress,
        action: "investigation.opened", entityType: "seller_investigation", entityId: rows[0].id,
        afterState: { investigation_type: investigationType, status: "open", priority, violation_id: violationId },
      });
      return { investigation: rows[0] };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if ("error" in out) return NextResponse.json({ error: out.error }, { status: 404 });
    return NextResponse.json(out, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "investigation open failed" }, { status: 500 });
  }
}

// PATCH /api/admin/trust-safety/investigations -> update investigation status/findings
export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "write");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const tenant = resolveTenantId(req);
  const sets: string[] = [];
  const params: any[] = [tenant, id];
  if (body.status) {
    params.push(String(body.status));
    sets.push(`status = $${params.length}`);
  }
  if (body.findings !== undefined) {
    params.push(body.findings === null ? null : String(body.findings));
    sets.push(`findings = $${params.length}`);
  }
  if (body.priority !== undefined) {
    params.push(body.priority === null ? null : String(body.priority));
    sets.push(`priority = $${params.length}`);
  }
  if (body.notes !== undefined) {
    params.push(body.notes === null ? null : String(body.notes));
    sets.push(`notes = $${params.length}`);
  }
  if (!sets.length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  sets.push("updated_at = now()");
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);
  const changedFields = ["status", "findings", "priority", "notes"].filter(
    (k) => (body as Record<string, unknown>)[k] !== undefined
  );

  try {
    const out = await withPg(async (c) => {
      const { rows: before } = await c.query(
        `SELECT seller_id, status, priority FROM public.seller_investigations
          WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, id]
      );
      const { rows } = await c.query(
        `UPDATE public.seller_investigations SET ${sets.join(", ")}
          WHERE tenant_id = $1 AND id = $2::uuid RETURNING id, status, priority, updated_at`,
        params
      );
      if (rows[0]) {
        await writeSellerAudit(c, {
          tenantId: tenant, sellerId: before[0]?.seller_id ?? null, actorId, ipAddress,
          action: "investigation.updated", entityType: "seller_investigation", entityId: id,
          beforeState: { status: before[0]?.status ?? null, priority: before[0]?.priority ?? null },
          afterState: { status: rows[0].status, priority: rows[0].priority, fields: changedFields },
        });
      }
      return { updated: rows.length > 0, investigation: rows[0] || null };
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "investigation update failed" }, { status: 500 });
  }
}
