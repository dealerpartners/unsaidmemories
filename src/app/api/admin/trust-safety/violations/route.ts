import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";

export const dynamic = "force-dynamic";

const COLS = `id, tenant_id, seller_id, violation_type, severity, status, description, created_at`;

// GET /api/admin/trust-safety/violations -> real violations list
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "read");
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const tenant = resolveTenantId(req);
  const status = (sp.get("status") || "").trim();
  const search = (sp.get("search") || "").trim();

  try {
    const out = await withPg(async (c) => {
      const conds = ["v.tenant_id = $1"];
      const params: any[] = [tenant];
      if (status && status !== "all") {
        params.push(status);
        conds.push(`v.status = $${params.length}`);
      }
      if (search) {
        params.push(`%${search.replace(/[%_]/g, "")}%`);
        conds.push(`(v.violation_type ILIKE $${params.length} OR v.description ILIKE $${params.length})`);
      }
      const { rows } = await c.query(
        `SELECT ${COLS.replace(/(\w+)/g, "v.$1")},
                s.display_name AS seller_name
           FROM public.seller_violations v
           LEFT JOIN public.sellers s ON s.id = v.seller_id AND s.tenant_id = v.tenant_id
          WHERE ${conds.join(" AND ")}
          ORDER BY v.created_at DESC LIMIT 200`,
        params
      );
      return { violations: rows };
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "violations list failed" }, { status: 500 });
  }
}

// PATCH /api/admin/trust-safety/violations -> update violation status
export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("trust_safety", "write");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const status = String(body.status || "");
  if (!id || !status) return NextResponse.json({ error: "id and status required" }, { status: 400 });
  const tenant = resolveTenantId(req);
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);

  try {
    const out = await withPg(async (c) => {
      const { rows: before } = await c.query(
        `SELECT seller_id, status FROM public.seller_violations WHERE id = $1::uuid AND tenant_id = $2`,
        [id, tenant]
      );
      const { rows } = await c.query(
        `UPDATE public.seller_violations SET status = $1 WHERE id = $2::uuid AND tenant_id = $3 RETURNING id, status`,
        [status, id, tenant]
      );
      if (rows[0]) {
        await writeSellerAudit(c, {
          tenantId: tenant, sellerId: before[0]?.seller_id ?? null, actorId, ipAddress,
          action: "violation.status_changed", entityType: "seller_violation", entityId: id,
          beforeState: { status: before[0]?.status ?? null },
          afterState: { status },
        });
      }
      return { updated: rows.length > 0, violation: rows[0] || null };
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "violation update failed" }, { status: 500 });
  }
}
