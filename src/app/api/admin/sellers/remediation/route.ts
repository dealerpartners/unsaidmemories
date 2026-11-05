import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// /api/admin/sellers/remediation — Admin Tree A4 · Remediation plans.
//
// The store (public.seller_remediation_plans) existed with zero rows and
// no route, page, or writer anywhere (census A4, 2026-10-15). This route
// is the writer + reader:
//   GET   → every plan for the tenant (seller joined), ?seller_id= and
//           ?status= narrow. Plans whose deadline has passed while still
//           'active' are lazily expired in the same read (status →
//           'expired', audited) so the desk never shows a stale "active"
//           plan past its deadline.
//   POST  → put a seller on a plan: seller + trigger (kpi | violation |
//           manual), requirements, deadline. A violation trigger must
//           name a violation that belongs to that seller (checked in
//           SQL, the investigations route's pattern). One ACTIVE plan
//           per seller at a time — a second open attempt 409s and names
//           the existing plan, instead of stacking silent duplicates.
//   PATCH → update requirements/deadline/notes/title, or close the plan
//           with action complete | expire | cancel. Terminal plans
//           (completed/expired/cancelled) cannot be rewritten — 409.
// Every mutation writes seller_audit_log (remediation_plan.*) in the
// same withPg callback, after the mutation's rows are known.
// Columns are guaranteed by migration 20261080 (ADD COLUMN IF NOT
// EXISTS over the pre-existing store).
// ============================================================================

const PLAN_COLS = `p.id::text AS id, p.seller_id::text AS seller_id,
  COALESCE(s.display_name, s.legal_name) AS seller_name,
  p.status, p.trigger_type, p.trigger_ref, p.kpi_key,
  p.violation_id::text AS violation_id, p.title, p.requirements,
  p.deadline::text AS deadline, p.notes, p.created_by,
  p.completed_at::text AS completed_at, p.completed_by,
  p.created_at::text AS created_at, p.updated_at::text AS updated_at`;

const TERMINAL = ["completed", "expired", "cancelled"];
const TRIGGER_TYPES = ["kpi", "violation", "manual"];

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const sp = req.nextUrl.searchParams;
  const sellerId = (sp.get("seller_id") || "").trim();
  const status = (sp.get("status") || "").trim();

  try {
    const out = await withPg(async (c) => {
      // Lazy expiry: an active plan past its deadline IS expired — say
      // so on the record, not just in the UI.
      const expired = await c.query(
        `UPDATE public.seller_remediation_plans
            SET status = 'expired', updated_at = now()
          WHERE tenant_id = $1 AND status = 'active'
            AND deadline IS NOT NULL AND deadline < now()
          RETURNING id::text AS id, seller_id::text AS seller_id`,
        [tenant]
      );
      for (const row of expired.rows) {
        await writeSellerAudit(c, {
          tenantId: tenant, sellerId: row.seller_id, actorId: null, actorType: "system",
          action: "remediation_plan.expired", entityType: "seller_remediation_plan",
          entityId: row.id, afterState: { status: "expired", reason: "deadline_passed" },
        });
      }

      const conds = ["p.tenant_id = $1"];
      const params: any[] = [tenant];
      if (sellerId) { params.push(sellerId); conds.push(`p.seller_id = $${params.length}::uuid`); }
      if (status && status !== "all") { params.push(status); conds.push(`p.status = $${params.length}`); }
      const { rows } = await c.query(
        `SELECT ${PLAN_COLS}
           FROM public.seller_remediation_plans p
           LEFT JOIN public.sellers s ON s.id = p.seller_id AND s.tenant_id = p.tenant_id
          WHERE ${conds.join(" AND ")}
          ORDER BY p.created_at DESC LIMIT 500`,
        params
      );
      return { plans: rows, expiredNow: expired.rows.length };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "remediation plans list failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);

  const sellerId = String(body.seller_id || "").trim();
  const triggerType = String(body.trigger_type || "manual").trim().toLowerCase();
  const requirements = String(body.requirements || "").trim();
  const deadlineRaw = String(body.deadline || "").trim();
  const kpiKey = body.kpi_key ? String(body.kpi_key).trim().slice(0, 120) : null;
  const violationId = body.violation_id ? String(body.violation_id).trim() : null;
  const triggerRef = body.trigger_ref ? String(body.trigger_ref).trim().slice(0, 300) : null;
  const title = body.title ? String(body.title).trim().slice(0, 300) : null;
  const notes = body.notes ? String(body.notes).trim().slice(0, 4000) : null;

  if (!sellerId) return NextResponse.json({ error: "seller_id required" }, { status: 400 });
  if (!TRIGGER_TYPES.includes(triggerType)) {
    return NextResponse.json({ error: "trigger_type must be kpi, violation, or manual" }, { status: 400 });
  }
  if (!requirements) return NextResponse.json({ error: "requirements required — a plan without requirements is not a plan" }, { status: 400 });
  if (!deadlineRaw || Number.isNaN(Date.parse(deadlineRaw))) {
    return NextResponse.json({ error: "deadline required (date or timestamp)" }, { status: 400 });
  }
  if (triggerType === "kpi" && !kpiKey && !triggerRef) {
    return NextResponse.json({ error: "a KPI-triggered plan needs kpi_key (or trigger_ref) naming the missed KPI" }, { status: 400 });
  }
  if (triggerType === "violation" && !violationId) {
    return NextResponse.json({ error: "a violation-triggered plan needs violation_id" }, { status: 400 });
  }

  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);

  try {
    const out = await withPg(async (c) => {
      const { rows: seller } = await c.query(
        `SELECT id FROM public.sellers WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, sellerId]
      );
      if (!seller[0]) return { error: "seller not found in this tenant", status: 404 } as const;
      if (violationId) {
        const { rows: v } = await c.query(
          `SELECT id FROM public.seller_violations WHERE tenant_id = $1 AND id = $2::uuid AND seller_id = $3::uuid`,
          [tenant, violationId, sellerId]
        );
        if (!v[0]) return { error: "violation not found for this seller", status: 400 } as const;
      }
      const { rows: open } = await c.query(
        `SELECT id::text AS id FROM public.seller_remediation_plans
          WHERE tenant_id = $1 AND seller_id = $2::uuid AND status = 'active'
          ORDER BY created_at DESC LIMIT 1`,
        [tenant, sellerId]
      );
      if (open[0]) {
        return { error: `Seller already has an active remediation plan (${open[0].id}) — complete or cancel it before opening another`, status: 409 } as const;
      }
      const { rows } = await c.query(
        `INSERT INTO public.seller_remediation_plans
           (tenant_id, seller_id, status, trigger_type, trigger_ref, kpi_key,
            violation_id, title, requirements, deadline, notes, created_by)
         VALUES ($1, $2::uuid, 'active', $3, $4, $5, $6::uuid, $7, $8, $9::timestamptz, $10, $11)
         RETURNING id::text AS id`,
        [tenant, sellerId, triggerType, triggerRef, kpiKey, violationId, title,
         requirements.slice(0, 8000), deadlineRaw, notes, actorId]
      );
      if (!rows[0]) throw new Error("Remediation plan insert did not land");
      await writeSellerAudit(c, {
        tenantId: tenant, sellerId, actorId, ipAddress,
        action: "remediation_plan.created", entityType: "seller_remediation_plan",
        entityId: rows[0].id,
        afterState: { trigger_type: triggerType, kpi_key: kpiKey, violation_id: violationId, deadline: deadlineRaw },
      });
      const { rows: full } = await c.query(
        `SELECT ${PLAN_COLS} FROM public.seller_remediation_plans p
           LEFT JOIN public.sellers s ON s.id = p.seller_id AND s.tenant_id = p.tenant_id
          WHERE p.id = $1::uuid`,
        [rows[0].id]
      );
      return { plan: full[0] };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status });
    return NextResponse.json(out, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "remediation plan create failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const action = body.action ? String(body.action).trim().toLowerCase() : null;
  if (action && !["complete", "expire", "cancel", "update"].includes(action)) {
    return NextResponse.json({ error: "action must be complete, expire, cancel, or update" }, { status: 400 });
  }
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);

  try {
    const out = await withPg(async (c) => {
      const { rows: before } = await c.query(
        `SELECT id::text AS id, seller_id::text AS seller_id, status FROM public.seller_remediation_plans
          WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, id]
      );
      if (!before[0]) return { error: "remediation plan not found", status: 404 } as const;
      if (TERMINAL.includes(before[0].status)) {
        return { error: `Plan is '${before[0].status}' — a closed plan cannot be rewritten`, status: 409 } as const;
      }

      const sets: string[] = ["updated_at = now()"];
      const params: any[] = [tenant, id];
      const push = (col: string, val: unknown, cast = "") => {
        params.push(val);
        sets.push(`${col} = $${params.length}${cast}`);
      };
      let auditActionName = "remediation_plan.updated";
      let newStatus: string | null = null;

      if (action === "complete") {
        newStatus = "completed";
        sets.push("status = 'completed'", "completed_at = now()");
        push("completed_by", actorId);
        auditActionName = "remediation_plan.completed";
      } else if (action === "expire") {
        newStatus = "expired";
        sets.push("status = 'expired'");
        auditActionName = "remediation_plan.expired";
      } else if (action === "cancel") {
        newStatus = "cancelled";
        sets.push("status = 'cancelled'");
        auditActionName = "remediation_plan.cancelled";
      }
      if (body.requirements !== undefined) push("requirements", String(body.requirements).slice(0, 8000));
      if (body.title !== undefined) push("title", body.title === null ? null : String(body.title).slice(0, 300));
      if (body.notes !== undefined) push("notes", body.notes === null ? null : String(body.notes).slice(0, 4000));
      if (body.deadline !== undefined) {
        if (!body.deadline || Number.isNaN(Date.parse(String(body.deadline)))) {
          return { error: "deadline must be a date or timestamp", status: 400 } as const;
        }
        push("deadline", String(body.deadline), "::timestamptz");
      }
      if (sets.length <= 1 && !newStatus) return { error: "nothing to update", status: 400 } as const;

      const { rows } = await c.query(
        `UPDATE public.seller_remediation_plans SET ${sets.join(", ")}
          WHERE tenant_id = $1 AND id = $2::uuid
          RETURNING id::text AS id, status`,
        params
      );
      await writeSellerAudit(c, {
        tenantId: tenant, sellerId: before[0].seller_id, actorId, ipAddress,
        action: auditActionName, entityType: "seller_remediation_plan", entityId: id,
        beforeState: { status: before[0].status },
        afterState: { status: rows[0]?.status ?? newStatus, fields: Object.keys(body) },
      });
      const { rows: full } = await c.query(
        `SELECT ${PLAN_COLS} FROM public.seller_remediation_plans p
           LEFT JOIN public.sellers s ON s.id = p.seller_id AND s.tenant_id = p.tenant_id
          WHERE p.id = $1::uuid`,
        [id]
      );
      return { plan: full[0] };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "remediation plan update failed" }, { status: 500 });
  }
}
