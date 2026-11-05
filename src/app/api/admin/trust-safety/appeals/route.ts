import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";
import { isAppealType } from "@/lib/trust-safety";

export const dynamic = "force-dynamic";

// GET /api/admin/trust-safety/appeals -> real appeals queue.
// The F2 per-type queues are views over seller_appeals.appeal_type (the
// tree's five leaf names, CHECK-enforced since DDL 20261072): pass
// ?type=<appeal_type> for one type's queue; omit (or 'all') for the
// whole queue. Filings arrive from the seller portal (four types) and
// the customer portal (privacy, seller_id NULL, linked by reference in
// evidence_urls) — this queue is where every type is decided.
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "read");
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const tenant = resolveTenantId(req);
  const status = (sp.get("status") || "").trim();
  const type = (sp.get("type") || "").trim();
  if (type && type !== "all" && !isAppealType(type)) {
    return NextResponse.json({ error: "unknown appeal type" }, { status: 400 });
  }

  try {
    const out = await withPg(async (c) => {
      const conds = ["a.tenant_id = $1"];
      const params: any[] = [tenant];
      if (status && status !== "all") {
        params.push(status);
        conds.push(`a.status = $${params.length}`);
      }
      if (type && type !== "all") {
        params.push(type);
        conds.push(`a.appeal_type = $${params.length}`);
      }
      const { rows } = await c.query(
        `SELECT a.id, a.tenant_id, a.seller_id, a.violation_id, a.status, a.appeal_type, a.appeal_text,
                a.evidence_urls,
                a.decision, a.decided_by, a.decided_at, a.created_at, a.updated_at,
                s.display_name AS seller_name,
                v.violation_type AS violation_type
           FROM public.seller_appeals a
           LEFT JOIN public.sellers s ON s.id = a.seller_id AND s.tenant_id = a.tenant_id
           LEFT JOIN public.seller_violations v ON v.id = a.violation_id AND v.tenant_id = a.tenant_id
          WHERE ${conds.join(" AND ")}
          ORDER BY a.created_at DESC LIMIT 200`,
        params
      );
      return { appeals: rows };
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "appeals list failed" }, { status: 500 });
  }
}

// PATCH /api/admin/trust-safety/appeals -> approve or deny an appeal
export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "write");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const status = String(body.status || "");
  if (!id || !["approved", "denied", "pending"].includes(status)) {
    return NextResponse.json({ error: "id and valid status (approved|denied|pending) required" }, { status: 400 });
  }
  const tenant = resolveTenantId(req);
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);

  try {
    const out = await withPg(async (c) => {
      const { rows: before } = await c.query(
        `SELECT seller_id, status FROM public.seller_appeals WHERE id = $1::uuid AND tenant_id = $2`,
        [id, tenant]
      );
      // Stamp the decision columns the table carries (decision / decided_by /
      // decided_at) — previously a decision left no record of who decided or
      // when. Reopening (status back to pending) clears the stamp.
      const { rows } = await c.query(
        status === "pending"
          ? `UPDATE public.seller_appeals
                SET status = $1, decision = NULL, decided_by = NULL, decided_at = NULL, updated_at = now()
              WHERE id = $2::uuid AND tenant_id = $3
              RETURNING id, status, violation_id, decision, decided_at`
          : `UPDATE public.seller_appeals
                SET status = $1, decision = $1, decided_by = $4::uuid, decided_at = now(), updated_at = now()
              WHERE id = $2::uuid AND tenant_id = $3
              RETURNING id, status, violation_id, decision, decided_at`,
        status === "pending" ? [status, id, tenant] : [status, id, tenant, actorId]
      );
      if (rows[0]) {
        await writeSellerAudit(c, {
          tenantId: tenant, sellerId: before[0]?.seller_id ?? null, actorId, ipAddress,
          action: status === "pending" ? "appeal.reopened" : "appeal.decided",
          entityType: "seller_appeal", entityId: id,
          beforeState: { status: before[0]?.status ?? null },
          afterState: { status, decision: status === "pending" ? null : status },
        });
      }
      // If approved, also resolve the underlying violation
      if (rows[0] && status === "approved" && rows[0].violation_id) {
        await c.query(
          `UPDATE public.seller_violations SET status = 'dismissed' WHERE id = $1::uuid AND tenant_id = $2`,
          [rows[0].violation_id, tenant]
        );
        await writeSellerAudit(c, {
          tenantId: tenant, sellerId: before[0]?.seller_id ?? null, actorId, ipAddress,
          action: "violation.status_changed", entityType: "seller_violation",
          entityId: rows[0].violation_id,
          afterState: { status: "dismissed", via: "appeal_approved" },
        });
      }
      return { updated: rows.length > 0, appeal: rows[0] || null };
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "appeal update failed" }, { status: 500 });
  }
}
