import { NextRequest, NextResponse } from "next/server";
import { adminQuery, resolveTenantId } from "@/lib/admin-api";
import { withPg } from "@/lib/crm/enterprise";
import { requireCapabilityApi } from "@/lib/capabilities/guards";
import { portalUserIdForStaff, platformLevelToPortal, portalLevelToPlatform } from "@/lib/capabilities/module-grants";

// M3: this generic CRUD surface used to list/create rows in
// platform_module_permissions. The surviving store is
// portal_module_permissions (migration 20261187), so this route reads
// and writes THAT store — but projects the OLD column vocabulary
// (module_code, access_level with 'full', staff_id) in its responses,
// so the settings UI that consumes { data, total } keeps working
// unchanged. Search still runs over module_code/access_level, which
// is why the old route's ?search= never failed: those are the
// projected names, not the stored ones (module_key/permission_level).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireCapabilityApi("org.amend");
  if (gate) return gate;
  const q = adminQuery(req);
  const tenant = resolveTenantId(req);
  const limit = Math.max(1, Math.min(q.limit || 100, 500));
  const offset = Math.max(0, q.offset || 0);
  const search = (q.search || "").trim();
  const out = await withPg(async (client) => {
    const params: unknown[] = [tenant];
    let where = `WHERE p.tenant_id = $1`;
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (p.module_key ILIKE $${params.length} OR p.permission_level ILIKE $${params.length})`;
    }
    for (const [k, v] of Object.entries(q.filters || {})) {
      if (k === "module_code") {
        params.push(v);
        where += ` AND p.module_key = $${params.length}`;
      } else if (k === "access_level") {
        params.push(v === "full" ? "all" : v);
        where += ` AND p.permission_level = $${params.length}`;
      }
    }
    const totalRes = await client.query(
      `SELECT count(*)::int AS n FROM public.portal_module_permissions p ${where}`,
      params,
    );
    params.push(limit, offset);
    const orderMap: Record<string, string> = {
      created_at: "p.created_at",
      module_code: "p.module_key",
      access_level: "p.permission_level",
    };
    let orderSql = "p.created_at DESC";
    if (q.order) {
      const [col, dir] = String(q.order).split(".");
      if (orderMap[col]) orderSql = `${orderMap[col]} ${dir === "asc" ? "ASC" : "DESC"}`;
    }
    const rows = await client.query(
      `SELECT p.id::text AS id, p.tenant_id::text AS tenant_id,
              s.id::text AS staff_id,
              p.module_key AS module_code, p.module_key,
              CASE p.permission_level WHEN 'all' THEN 'full' ELSE p.permission_level END AS access_level,
              p.permission_level, p.portal_user_id::text AS portal_user_id,
              p.granted_by::text AS granted_by, p.created_at::text AS granted_at
         FROM public.portal_module_permissions p
         LEFT JOIN public.portal_users pu ON pu.id = p.portal_user_id AND pu.tenant_id = p.tenant_id
         LEFT JOIN public.crm_staff s ON s.user_id = pu.user_id AND s.tenant_id = p.tenant_id AND s.is_active
        ${where}
        ORDER BY ${orderSql}
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { data: rows.rows, total: totalRes.rows[0]?.n ?? rows.rows.length };
  });
  if (!out) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
  return NextResponse.json(out);
}

export async function POST(req: NextRequest) {
  const gate = await requireCapabilityApi("org.amend");
  if (gate) return gate;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }
  const tenant = resolveTenantId(req);
  const moduleCode = String(body.module_code || body.module_key || "");
  const rawLevel = String(body.access_level || body.permission_level || "write");
  if (!moduleCode) return NextResponse.json({ error: "module_code is required" }, { status: 400 });
  const out = await withPg(async (client) => {
    let portalUserId: string | null = body.portal_user_id ? String(body.portal_user_id) : null;
    if (!portalUserId && body.staff_id) {
      const s = await client.query(
        `SELECT user_id::text AS user_id, email, display_name FROM public.crm_staff WHERE id = $1::uuid AND tenant_id = $2 LIMIT 1`,
        [String(body.staff_id), tenant],
      );
      if (s.rows[0]) {
        portalUserId = await portalUserIdForStaff(client, {
          tenantId: tenant,
          userId: String(s.rows[0].user_id),
          email: s.rows[0].email,
          displayName: s.rows[0].display_name,
        });
      }
    }
    if (!portalUserId) return null;
    const portalLevel = platformLevelToPortal(rawLevel);
    if (portalLevel === "none") {
      await client.query(
        `DELETE FROM public.portal_module_permissions
          WHERE tenant_id = $1::uuid AND portal_user_id = $2::uuid AND module_key = $3`,
        [tenant, portalUserId, moduleCode],
      );
      return { id: null, module_code: moduleCode, access_level: "none" };
    }
    const upd = await client.query(
      `UPDATE public.portal_module_permissions
          SET permission_level = $4, updated_at = now()
        WHERE tenant_id = $1::uuid AND portal_user_id = $2::uuid AND module_key = $3
        RETURNING id::text AS id`,
      [tenant, portalUserId, moduleCode, portalLevel],
    );
    const id =
      upd.rows[0]?.id ??
      (
        await client.query(
          `INSERT INTO public.portal_module_permissions (tenant_id, portal_user_id, module_key, permission_level)
           SELECT $1::uuid, $2::uuid, $3, $4
            WHERE NOT EXISTS (
              SELECT 1 FROM public.portal_module_permissions
               WHERE tenant_id = $1::uuid AND portal_user_id = $2::uuid AND module_key = $3)
           RETURNING id::text AS id`,
          [tenant, portalUserId, moduleCode, portalLevel],
        )
      ).rows[0]?.id;
    return {
      id: id ?? null,
      module_code: moduleCode,
      access_level: portalLevelToPlatform(portalLevel),
    };
  });
  if (!out) return NextResponse.json({ error: "DB unavailable or no portal identity" }, { status: 500 });
  return NextResponse.json({ data: out }, { status: 201 });
}
