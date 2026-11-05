import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("gift_cards_credits", "read")
  if (gate) return gate
  const data = await withPg(async (c) => {
    const cards = await c.query(
      `SELECT gc.id, gc.card_number, gc.initial_value, gc.balance, gc.status, gc.card_format,
              gc.recipient_name, gc.recipient_email, gc.sender_name, gc.issued_at, gc.last_used_at,
              d.name AS design_name
         FROM public.commerce_gift_cards gc
         LEFT JOIN public.commerce_gift_card_designs d ON d.id = gc.design_id
        WHERE gc.tenant_id = $1
        ORDER BY gc.issued_at DESC
        LIMIT 300`,
      [resolveTenantId(req)],
    )
    const kpi = await c.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status IN ('active','partially_redeemed'))::int AS active,
              COALESCE(SUM(balance) FILTER (WHERE status IN ('active','partially_redeemed')),0)::float AS liability,
              COALESCE(SUM(initial_value),0)::float AS sold,
              COALESCE(SUM(initial_value) FILTER (WHERE issued_at >= date_trunc('month', CURRENT_DATE)),0)::float AS issued_this_month,
              COUNT(*) FILTER (WHERE issued_at >= date_trunc('month', CURRENT_DATE))::int AS issued_this_month_count,
              COALESCE(SUM(initial_value - balance) FILTER (WHERE last_used_at >= date_trunc('month', CURRENT_DATE)),0)::float AS redeemed_mtd,
              COUNT(*) FILTER (WHERE status = 'expired')::int AS expired_inactive,
              COALESCE(AVG(initial_value),0)::float AS avg_value
         FROM public.commerce_gift_cards WHERE tenant_id = $1`,
      [resolveTenantId(req)],
    )
    const sc = await c.query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(balance) FILTER (WHERE status = 'active'),0)::float AS outstanding
         FROM public.commerce_store_credits WHERE tenant_id = $1`,
      [resolveTenantId(req)],
    )
    const credits = await c.query(
      `SELECT id, credit_number, customer_id, original_amount, balance, status, issued_at, expires_at
         FROM public.commerce_store_credits WHERE tenant_id = $1
         ORDER BY issued_at DESC LIMIT 200`,
      [resolveTenantId(req)],
    )
    return {
      cards: cards.rows,
      kpi: { ...kpi.rows[0], store_credits_outstanding: sc.rows[0]?.outstanding || 0, store_credits_count: sc.rows[0]?.total || 0 },
      store_credits: credits.rows,
    }
  })
  return NextResponse.json(data || { cards: [], kpi: { total: 0, active: 0, liability: 0, sold: 0 }, store_credits: [] })
}
