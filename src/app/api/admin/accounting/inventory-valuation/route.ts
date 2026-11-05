import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/inventory-valuation
//
// Inventory Valuation & COGS (owner's inventory_valuation_cogs.html):
// FIFO cost layers (erp_inventory_cost_layers), the perpetual
// inventory value from erp_inventory_balances, and the GL 1300
// reconciliation — the inventory account's posted journal balance
// set against the perpetual value, with the difference shown, never
// hidden. Cost layers store one landed unit cost; no separate
// freight/duty split exists in the data, and the page says so.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const layers = await pgQuery<{
      id: string; sku: string | null; product_name: string | null; warehouse_name: string | null;
      costing_method: string | null; quantity_remaining: string; unit_cost: string;
      created_at: string; ingest_ref: string | null; ingest_type: string | null;
    }>(
      `SELECT l.id::text AS id, pv.sku, p.name AS product_name, w.name AS warehouse_name,
              l.costing_method, l.quantity_remaining::text AS quantity_remaining,
              l.unit_cost::text AS unit_cost, l.created_at::text AS created_at,
              mv.reference AS ingest_ref, mv.source_type AS ingest_type
         FROM public.erp_inventory_cost_layers l
         LEFT JOIN public.product_variants pv ON pv.id = l.sku_id
         LEFT JOIN public.products p ON p.id = pv.product_id
         LEFT JOIN public.erp_warehouses w ON w.id = l.warehouse_id
         LEFT JOIN public.erp_inventory_movements mv ON mv.id = l.source_movement_id
        WHERE l.tenant_id = $1
        ORDER BY l.created_at ASC
        LIMIT 500`,
      [tenant],
    );
    const perpetual = await pgQuery<{ warehouse_name: string | null; units: string; value: string }>(
      `SELECT w.name AS warehouse_name, COALESCE(SUM(b.on_hand), 0)::text AS units,
              COALESCE(SUM(b.on_hand * COALESCE(b.unit_cost, 0)), 0)::text AS value
         FROM public.erp_inventory_balances b
         LEFT JOIN public.erp_warehouses w ON w.id = b.warehouse_id
        WHERE b.tenant_id = $1
        GROUP BY w.name
        ORDER BY w.name ASC`,
      [tenant],
    );
    const gl = await pgQuery<{ code: string; name: string }>(
      `SELECT a.code, a.name
         FROM public.acct_chart_of_accounts a
        WHERE a.tenant_id = $1 AND a.code = '1300'
        LIMIT 1`,
      [tenant],
    );
    const glStrict = await pgQuery<{ balance: string }>(
      `SELECT COALESCE(SUM(l.debit - l.credit), 0)::text AS balance
         FROM public.acct_journal_lines l
         JOIN public.acct_journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted'
         JOIN public.acct_chart_of_accounts a ON a.id = l.account_id
        WHERE l.tenant_id = $1 AND a.code = '1300'`,
      [tenant],
    );
    const movements = await pgQuery<{
      id: string; movement_type: string; sku: string | null; product_name: string | null;
      quantity: string; unit_cost: string | null; total_cost: string | null; occurred_at: string;
    }>(
      `SELECT m.id::text AS id, m.movement_type, pv.sku, p.name AS product_name,
              m.quantity::text AS quantity, m.unit_cost::text AS unit_cost,
              m.total_cost::text AS total_cost, m.occurred_at::text AS occurred_at
         FROM public.erp_inventory_movements m
         LEFT JOIN public.product_variants pv ON pv.id = m.sku_id
         LEFT JOIN public.products p ON p.id = pv.product_id
        WHERE m.tenant_id = $1
        ORDER BY m.occurred_at DESC
        LIMIT 25`,
      [tenant],
    );
    const perpetualTotal = perpetual.reduce((s, r) => s + Number(r.value || 0), 0);
    const glBalance = Number(glStrict[0]?.balance || 0);
    return NextResponse.json({
      layers: layers.map((l) => ({
        id: l.id, sku: l.sku, productName: l.product_name, warehouseName: l.warehouse_name,
        costingMethod: l.costing_method, quantityRemaining: Number(l.quantity_remaining || 0),
        unitCost: Number(l.unit_cost || 0), createdAt: l.created_at,
        ingestRef: l.ingest_ref, ingestType: l.ingest_type,
        extended: Number(l.quantity_remaining || 0) * Number(l.unit_cost || 0),
      })),
      perpetual: perpetual.map((r) => ({
        warehouseName: r.warehouse_name, units: Number(r.units || 0), value: Number(r.value || 0),
      })),
      perpetualTotal,
      gl: gl[0] ? { code: gl[0].code, name: gl[0].name, balance: glBalance } : null,
      difference: glBalance - perpetualTotal,
      movements: movements.map((m) => ({
        id: m.id, movementType: m.movement_type, sku: m.sku, productName: m.product_name,
        quantity: Number(m.quantity || 0),
        unitCost: m.unit_cost != null ? Number(m.unit_cost) : null,
        totalCost: m.total_cost != null ? Number(m.total_cost) : null,
        occurredAt: m.occurred_at,
      })),
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/inventory-valuation]", e);
    return NextResponse.json({ error: e?.message || "Failed to load valuation" }, { status: 500 });
  }
}
