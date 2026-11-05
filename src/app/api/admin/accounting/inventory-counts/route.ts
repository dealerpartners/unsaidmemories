import { NextRequest, NextResponse } from "next/server";
import { adminAuthorIdFromSession, adminCreate, resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/inventory-counts
//
// Stock Counts (owner's stock_counts.html): count batches from
// erp_inventory_count_sessions with progress and variance rolled up
// from erp_inventory_count_lines (expected vs counted, variance in
// units and dollars). Warehouses ride along for the schedule form.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const sessions = await pgQuery<{
      id: string; count_number: string | null; count_type: string | null; status: string;
      scheduled_for: string | null; started_at: string | null; posted_at: string | null;
      warehouse_name: string | null; location_name: string | null;
      total_lines: number; counted_lines: number; variance_units: string; variance_value: string;
    }>(
      `SELECT s.id::text AS id, s.count_number, s.count_type, s.status::text AS status,
              s.scheduled_for::text AS scheduled_for, s.started_at::text AS started_at,
              s.posted_at::text AS posted_at,
              w.name AS warehouse_name, loc.name AS location_name,
              COUNT(l.id)::int AS total_lines,
              COUNT(l.id) FILTER (WHERE l.counted_quantity IS NOT NULL)::int AS counted_lines,
              COALESCE(SUM(l.variance_quantity), 0)::text AS variance_units,
              COALESCE(SUM(l.variance_value), 0)::text AS variance_value
         FROM public.erp_inventory_count_sessions s
         LEFT JOIN public.erp_warehouses w ON w.id = s.warehouse_id
         LEFT JOIN public.erp_warehouse_locations loc ON loc.id = s.location_id
         LEFT JOIN public.erp_inventory_count_lines l ON l.count_session_id = s.id
        WHERE s.tenant_id = $1
        GROUP BY s.id, w.name, loc.name
        ORDER BY s.created_at DESC
        LIMIT 200`,
      [tenant],
    );
    const lines = await pgQuery<{
      id: string; count_session_id: string; sku: string | null; product_name: string | null;
      expected_quantity: string | null; counted_quantity: string | null;
      variance_quantity: string | null; variance_value: string | null;
    }>(
      `SELECT l.id::text AS id, l.count_session_id::text AS count_session_id,
              pv.sku, p.name AS product_name,
              l.expected_quantity::text AS expected_quantity,
              l.counted_quantity::text AS counted_quantity,
              l.variance_quantity::text AS variance_quantity,
              l.variance_value::text AS variance_value
         FROM public.erp_inventory_count_lines l
         LEFT JOIN public.product_variants pv ON pv.id = l.sku_id
         LEFT JOIN public.products p ON p.id = pv.product_id
        WHERE l.tenant_id = $1
        ORDER BY p.name ASC NULLS LAST
        LIMIT 500`,
      [tenant],
    );
    const warehouses = await pgQuery<{ id: string; name: string; code: string | null }>(
      `SELECT id::text AS id, name, code FROM public.erp_warehouses
        WHERE tenant_id = $1 AND is_active ORDER BY name ASC`,
      [tenant],
    );
    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id, countNumber: s.count_number, countType: s.count_type, status: s.status,
        scheduledFor: s.scheduled_for, startedAt: s.started_at, postedAt: s.posted_at,
        warehouseName: s.warehouse_name, locationName: s.location_name,
        totalLines: Number(s.total_lines || 0), countedLines: Number(s.counted_lines || 0),
        progress: Number(s.total_lines || 0) > 0 ? Number(s.counted_lines || 0) / Number(s.total_lines) : 0,
        varianceUnits: Number(s.variance_units || 0), varianceValue: Number(s.variance_value || 0),
        lines: lines.filter((l) => l.count_session_id === s.id).map((l) => ({
          id: l.id, sku: l.sku, productName: l.product_name,
          expected: l.expected_quantity != null ? Number(l.expected_quantity) : null,
          counted: l.counted_quantity != null ? Number(l.counted_quantity) : null,
          varianceQty: l.variance_quantity != null ? Number(l.variance_quantity) : null,
          varianceValue: l.variance_value != null ? Number(l.variance_value) : null,
        })),
      })),
      warehouses,
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/inventory-counts]", e);
    return NextResponse.json({ error: e?.message || "Failed to load stock counts" }, { status: 500 });
  }
}

// POST /api/admin/accounting/inventory-counts — schedule a count
// session (draft). Count lines are generated when the count starts
// in the warehouse workflow; this schedules the batch honestly.

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const body = await req.json().catch(() => null);
    if (!body?.warehouse_id) return NextResponse.json({ error: "warehouse_id is required" }, { status: 400 });
    const seq = await pgQuery<{ n: number }>(
      `SELECT COUNT(*)::int + 1 AS n FROM public.erp_inventory_count_sessions WHERE tenant_id = $1`,
      [tenant],
    );
    const author = await adminAuthorIdFromSession(req.headers.get("cookie"));
    return adminCreate("erp_inventory_count_sessions", {
      count_number: `CNT-${String(seq[0]?.n ?? 1).padStart(4, "0")}`,
      warehouse_id: String(body.warehouse_id),
      location_id: body.location_id || null,
      count_type: body.count_type ? String(body.count_type) : "cycle",
      status: "draft",
      scheduled_for: body.scheduled_for || null,
      created_by: author,
    }, { preGated: true, tenantId: tenant, schema: "public" });
  } catch (e: any) {
    console.error("[POST /api/admin/accounting/inventory-counts]", e);
    return NextResponse.json({ error: e?.message || "Failed to schedule count" }, { status: 500 });
  }
}
