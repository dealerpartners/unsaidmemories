import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/margin-matrix
//
// SKU & Variant Margin Matrix (owner's sku_variant_margin_matrix
// .html): one row per variant actually sold (order_items on
// captured orders), with gross retail from the order lines.
// Landed COGS comes only from real inventory cost layers —
// erp_inventory_cost_layers reached through erp_product_skus
// (variant_id link) — averaged per unit. Fulfillment comes from
// the active variant_fulfillment_routes cost snapshot. Where a
// cost source holds nothing, the figure is null and the page
// prints '—': margins are never invented. Platform fees and
// per-variant return drag have no source table yet, so they are
// always '—' and labeled as such.

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const rows = await pgQuery<{
      variant_id: string; sku: string | null; variant_title: string | null;
      product_name: string | null; category: string | null;
      units: number; gross: string; layer_unit_cost: string | null; route_unit_cost: string | null;
    }>(
      `SELECT pv.id::text AS variant_id, pv.sku, pv.variant_title,
              p.name AS product_name, c.name AS category,
              SUM(oi.quantity)::int AS units,
              COALESCE(SUM(oi.quantity * oi.unit_price), 0)::text AS gross,
              (SELECT SUM(l.unit_cost * l.quantity_remaining) / NULLIF(SUM(l.quantity_remaining), 0)
                 FROM public.erp_inventory_cost_layers l
                 JOIN public.erp_product_skus s ON s.id = l.sku_id
                WHERE s.variant_id = pv.id AND l.quantity_remaining > 0)::text AS layer_unit_cost,
              (SELECT MIN(r.cost_snapshot)
                 FROM public.variant_fulfillment_routes r
                WHERE r.product_variant_id = pv.id AND r.is_active IS NOT FALSE
                  AND r.cost_snapshot IS NOT NULL)::text AS route_unit_cost
         FROM public.order_items oi
         JOIN public.orders o ON o.id = oi.order_id AND o.status IN ('paid', 'refunded')
         JOIN public.product_variants pv ON pv.id = oi.product_variant_id
         LEFT JOIN public.products p ON p.id = pv.product_id
         LEFT JOIN public.categories c ON c.id = p.category_id
        WHERE oi.tenant_id = $1
        GROUP BY pv.id, pv.sku, pv.variant_title, p.name, c.name
        ORDER BY gross DESC`,
      [tenant],
    );
    const out = rows.map((r) => {
      const units = Number(r.units || 0);
      const gross = round2(Number(r.gross || 0));
      const cogsUnit = r.layer_unit_cost != null ? Number(r.layer_unit_cost) : null;
      const fulfillUnit = r.route_unit_cost != null ? Number(r.route_unit_cost) : null;
      const landedCogs = cogsUnit != null ? round2(cogsUnit * units) : null;
      const fulfillment = fulfillUnit != null ? round2(fulfillUnit * units) : null;
      const netMargin = landedCogs != null ? round2(gross - landedCogs - (fulfillment || 0)) : null;
      const marginPct = netMargin != null && gross > 0 ? round2((netMargin / gross) * 100) : null;
      const status = netMargin == null ? "No cost data"
        : netMargin < 0 ? "Loss"
        : (marginPct || 0) >= 50 ? "High Profit"
        : (marginPct || 0) >= 30 ? "Healthy"
        : "Thin";
      return {
        variantId: r.variant_id,
        identity: [r.sku || "no SKU", r.variant_title || ""].filter(Boolean).join(" · "),
        product: r.product_name || "Untitled product",
        category: r.category || "Uncategorized",
        units, grossRetail: gross,
        landedCogs, landedCogsUnit: cogsUnit,
        fulfillment, fulfillmentUnit: fulfillUnit,
        platform: null as number | null,
        returnDrag: null as number | null,
        netMargin, marginPct, status,
      };
    });
    const withCost = out.filter((r) => r.netMargin != null);
    return NextResponse.json({
      rows: out,
      portfolio: {
        variantsSold: out.length,
        units: out.reduce((s, r) => s + r.units, 0),
        grossRetail: round2(out.reduce((s, r) => s + r.grossRetail, 0)),
        variantsWithCost: withCost.length,
        weightedMarginPct: withCost.length && withCost.reduce((s, r) => s + r.grossRetail, 0) > 0
          ? round2((withCost.reduce((s, r) => s + (r.netMargin || 0), 0) / withCost.reduce((s, r) => s + r.grossRetail, 0)) * 100)
          : null,
      },
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/margin-matrix]", e);
    return NextResponse.json({ error: e?.message || "Failed to build margin matrix" }, { status: 500 });
  }
}
