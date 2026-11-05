import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/admin/accounting/transfers
//
// Transfers & Adjustments data over erp_inventory_transfers +
// erp_inventory_transfer_lines (+ erp_warehouses for node names).
//
// GET: the transfer register (line counts and quantities rolled up)
// and the in-transit GL clearing summary: units that have shipped
// but not yet been received, valued at the origin warehouse's
// inventory cost layers (erp_inventory_cost_layers) where a cost is
// on record. Units without a cost layer are counted but never given
// an invented value.
// POST { action: 'set_status', id, status }: advance a transfer
// through its status flow (draft → requested → approved →
// in_transit → partially_received → received, or cancelled),
// stamping shipped_at / received_at as it moves.

const STATUSES = ["draft", "requested", "approved", "in_transit", "partially_received", "received", "cancelled"];

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const transfers = await pgQuery<{
      id: string; transfer_number: string; status: string;
      from_name: string | null; to_name: string | null;
      requested_at: string | null; shipped_at: string | null; received_at: string | null;
      notes: string | null; line_items: number; qty: string; qty_shipped: string; qty_received: string;
    }>(
      `SELECT t.id::text AS id, t.transfer_number, t.status,
              fw.name AS from_name, tw.name AS to_name,
              t.requested_at::text AS requested_at, t.shipped_at::text AS shipped_at,
              t.received_at::text AS received_at, t.notes,
              COUNT(l.id)::int AS line_items,
              COALESCE(SUM(l.quantity), 0)::text AS qty,
              COALESCE(SUM(l.shipped_quantity), 0)::text AS qty_shipped,
              COALESCE(SUM(l.received_quantity), 0)::text AS qty_received
         FROM public.erp_inventory_transfers t
         LEFT JOIN public.erp_warehouses fw ON fw.id = t.from_warehouse_id
         LEFT JOIN public.erp_warehouses tw ON tw.id = t.to_warehouse_id
         LEFT JOIN public.erp_inventory_transfer_lines l
           ON l.transfer_id = t.id AND l.tenant_id = t.tenant_id
        WHERE t.tenant_id = $1
        GROUP BY t.id, fw.name, tw.name
        ORDER BY t.created_at DESC
        LIMIT 200`,
      [tenant],
    );
    const clearing = await pgQuery<{ open_transfers: number; units_in_transit: string; valued_units: string; value: string }>(
      `SELECT COUNT(DISTINCT t.id)::int AS open_transfers,
              COALESCE(SUM(l.shipped_quantity - l.received_quantity), 0)::text AS units_in_transit,
              COALESCE(SUM(l.shipped_quantity - l.received_quantity) FILTER (WHERE c.unit_cost IS NOT NULL), 0)::text AS valued_units,
              COALESCE(SUM((l.shipped_quantity - l.received_quantity) * c.unit_cost), 0)::text AS value
         FROM public.erp_inventory_transfers t
         JOIN public.erp_inventory_transfer_lines l
           ON l.transfer_id = t.id AND l.tenant_id = t.tenant_id
         LEFT JOIN LATERAL (
           SELECT AVG(unit_cost) AS unit_cost FROM public.erp_inventory_cost_layers
            WHERE tenant_id = t.tenant_id AND sku_id = l.sku_id AND warehouse_id = t.from_warehouse_id
         ) c ON true
        WHERE t.tenant_id = $1 AND t.status NOT IN ('received', 'cancelled')`,
      [tenant],
    );
    const c = clearing[0];
    return NextResponse.json({
      transfers: transfers.map((t) => ({
        ...t,
        qty: Number(t.qty || 0),
        qtyShipped: Number(t.qty_shipped || 0),
        qtyReceived: Number(t.qty_received || 0),
      })),
      clearing: {
        openTransfers: Number(c?.open_transfers || 0),
        unitsInTransit: Number(c?.units_in_transit || 0),
        valuedUnits: Number(c?.valued_units || 0),
        value: Number(c?.value || 0),
      },
      total: transfers.length,
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/transfers]", e);
    return NextResponse.json({ error: e?.message || "Failed to load transfers" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (String(body.action || "") !== "set_status") {
    return NextResponse.json({ error: `Unknown action: ${String(body.action || "")}` }, { status: 400 });
  }
  const id = String(body.id || "");
  const status = String(body.status || "");
  if (!id || !STATUSES.includes(status)) {
    return NextResponse.json({ error: "A transfer id and a valid status are required." }, { status: 400 });
  }
  try {
    await pgQuery(
      `UPDATE public.erp_inventory_transfers
          SET status = $3,
              shipped_at = CASE WHEN $3 = 'in_transit' AND shipped_at IS NULL THEN now() ELSE shipped_at END,
              received_at = CASE WHEN $3 = 'received' THEN now() ELSE received_at END,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [tenant, id, status],
    );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[POST /api/admin/accounting/transfers]", e);
    return NextResponse.json({ error: e?.message || "Status update failed" }, { status: 500 });
  }
}
