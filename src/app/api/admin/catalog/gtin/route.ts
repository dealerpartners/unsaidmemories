import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";
import { validateGtin } from "@/lib/catalog/gtin";

export const dynamic = "force-dynamic";

// G1 GTIN registry — store: public.catalog_gtins (migration 20261088),
// keyed to the canonical item (commerce_catalog_items). GTINs are validated
// with the real GS1 check-digit algorithm (lib/catalog/gtin.ts) before any
// write; a GTIN may belong to exactly one item per tenant (unique index).
// GET ?q=&filter=assigned|unassigned|all&limit= — items with their GTINs + counts.
// POST {action:'validate',gtin} — dry validation, no write.
// POST {action:'assign',item_id,gtin,is_primary?} — assign (primary by default;
//      assigning a new primary demotes the previous primary in the same tx).
// POST {action:'remove',gtin_id} — remove one assignment.
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("products_services", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const filter = req.nextUrl.searchParams.get("filter") || "unassigned";
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit") || 100) || 100));
  try {
    const out = await withPg(async (c) => {
      const having = filter === "assigned" ? "HAVING count(g.id) > 0" : filter === "all" ? "" : "HAVING count(g.id) = 0";
      const { rows } = await c.query(
        `SELECT i.id, i.sku, i.name, i.brand, i.active,
                COALESCE(jsonb_agg(jsonb_build_object('id', g.id, 'gtin', g.gtin, 'gtin_type', g.gtin_type, 'is_primary', g.is_primary, 'source', g.source)
                  ORDER BY g.is_primary DESC, g.created_at) FILTER (WHERE g.id IS NOT NULL), '[]'::jsonb) AS gtins
           FROM public.commerce_catalog_items i
           LEFT JOIN public.catalog_gtins g ON g.catalog_item_id = i.id AND g.tenant_id = $1
          WHERE i.tenant_id = $1 AND ($2 = '' OR i.name ILIKE '%' || $2 || '%' OR i.sku ILIKE '%' || $2 || '%' OR EXISTS (SELECT 1 FROM public.catalog_gtins gx WHERE gx.catalog_item_id = i.id AND gx.gtin = $3))
          GROUP BY i.id ${having}
          ORDER BY i.name ASC LIMIT $4`,
        [tenant, q, q.replace(/[\s-]/g, ""), limit]
      );
      const { rows: counts } = await c.query(
        `SELECT (SELECT count(*)::int FROM public.commerce_catalog_items WHERE tenant_id=$1) AS items,
                (SELECT count(DISTINCT catalog_item_id)::int FROM public.catalog_gtins WHERE tenant_id=$1) AS assigned,
                (SELECT count(*)::int FROM public.catalog_gtins WHERE tenant_id=$1) AS gtins`, [tenant]);
      const cnt = counts[0] ?? { items: 0, assigned: 0, gtins: 0 };
      return { items: rows, counts: { ...cnt, unassigned: cnt.items - cnt.assigned } };
    });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "GTIN registry failed (is migration 20261088 applied?)" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("products_services", "write");
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  if (action === "validate") {
    const v = validateGtin(String(body.gtin || ""));
    return NextResponse.json({ validation: v });
  }
  const tenant = resolveTenantId(req);
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);
  try {
    if (action === "assign") {
      const itemId = String(body.item_id || "");
      const v = validateGtin(String(body.gtin || ""));
      if (!itemId) return NextResponse.json({ error: "item_id required" }, { status: 400 });
      if (!v.valid) return NextResponse.json({ error: v.error }, { status: 400 });
      const isPrimary = body.is_primary !== false;
      const out = await withPg(async (c) => {
        const { rows: item } = await c.query(`SELECT id, name FROM public.commerce_catalog_items WHERE id=$1::uuid AND tenant_id=$2`, [itemId, tenant]);
        if (!item[0]) return { error: "catalog item not found", status: 404 as const };
        const { rows: dup } = await c.query(`SELECT catalog_item_id FROM public.catalog_gtins WHERE tenant_id=$1 AND gtin=$2`, [tenant, v.normalized]);
        if (dup[0] && String(dup[0].catalog_item_id) !== itemId)
          return { error: `GTIN ${v.normalized} is already assigned to another item (${dup[0].catalog_item_id}).`, status: 409 as const };
        if (isPrimary) await c.query(`UPDATE public.catalog_gtins SET is_primary=false, updated_at=now() WHERE tenant_id=$1 AND catalog_item_id=$2::uuid AND is_primary AND gtin<>$3`, [tenant, itemId, v.normalized]);
        const { rows } = await c.query(
          `INSERT INTO public.catalog_gtins (tenant_id, catalog_item_id, gtin, gtin_type, is_primary, source, created_by)
           VALUES ($1,$2::uuid,$3,$4,$5,'admin',$6) ON CONFLICT (tenant_id, gtin) DO UPDATE SET is_primary=EXCLUDED.is_primary, updated_at=now()
           RETURNING id, gtin, gtin_type, is_primary`, [tenant, itemId, v.normalized, v.type, isPrimary, actorId]);
        await writeSellerAudit(c, { tenantId: tenant, sellerId: null, actorId, ipAddress, action: "gtin.assigned", entityType: "catalog_item", entityId: itemId, afterState: { gtin: v.normalized, gtin_type: v.type, is_primary: isPrimary } });
        return { gtin: rows[0] };
      });
      if ((out as any)?.error) return NextResponse.json({ error: (out as any).error }, { status: (out as any).status || 400 });
      return NextResponse.json(out);
    }
    if (action === "remove") {
      const gtinId = String(body.gtin_id || "");
      if (!gtinId) return NextResponse.json({ error: "gtin_id required" }, { status: 400 });
      const out = await withPg(async (c) => {
        const { rows } = await c.query(`DELETE FROM public.catalog_gtins WHERE id=$1::uuid AND tenant_id=$2 RETURNING gtin, catalog_item_id`, [gtinId, tenant]);
        if (rows[0]) await writeSellerAudit(c, { tenantId: tenant, sellerId: null, actorId, ipAddress, action: "gtin.removed", entityType: "catalog_item", entityId: String(rows[0].catalog_item_id), beforeState: { gtin: rows[0].gtin } });
        return { removed: rows.length > 0 };
      });
      if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
      if (!out.removed) return NextResponse.json({ error: "GTIN assignment not found" }, { status: 404 });
      return NextResponse.json(out);
    }
    return NextResponse.json({ error: "action must be validate|assign|remove" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "GTIN write failed" }, { status: 500 });
  }
}
