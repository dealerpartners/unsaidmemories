import { NextRequest, NextResponse } from "next/server";
import { requireModuleApi } from "@/lib/admin/gate";
import { resolveActiveTenantId } from "@/lib/admin/tenant-resolution";
import { withPg } from "@/lib/crm/enterprise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/dashboard/ytd
// Year-to-date operating counts (owner's question, 2026-11-01:
// "run a year-to-date report — how many orders, how many products,
// how many invoices were generated, how many were paid?").
// Every figure is a real aggregate over the live tables:
//   orders            → erp_orders placed since Jan 1
//   products sold     → units on paid storefront orders since Jan 1
//                       (order_items.quantity joined to orders)
//   invoices generated→ acct_ar_invoices issued since Jan 1
//   invoices paid     → the same set with status 'paid'
// The window is the server's current calendar year; the response
// states it so the reader never has to guess.
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("analytics", "read");
  if (gate) return gate;

  const year = new Date().getFullYear();
  const since = `${year}-01-01`;
  try {
    const out = await withPg(async (client) => {
      const tenant = await resolveActiveTenantId(client, req);
      const q = async (sql: string) => {
        const r = await client.query(sql, [tenant, since]);
        return Number(r.rows[0]?.n ?? 0);
      };
      return {
        year,
        since,
        ordersYtd: await q(
          `SELECT COUNT(*)::int AS n FROM public.erp_orders
            WHERE tenant_id = $1 AND order_date >= $2::date`,
        ),
        productsSoldYtd: await q(
          `SELECT COALESCE(SUM(oi.quantity), 0)::int AS n
             FROM public.order_items oi
             JOIN public.orders o ON o.id = oi.order_id
            WHERE o.tenant_id = $1 AND o.status IN ('paid', 'fulfilled')
              AND o.created_at >= $2::date`,
        ),
        invoicesGeneratedYtd: await q(
          `SELECT COUNT(*)::int AS n FROM public.acct_ar_invoices
            WHERE tenant_id = $1 AND invoice_date >= $2::date`,
        ),
        invoicesPaidYtd: await q(
          `SELECT COUNT(*)::int AS n FROM public.acct_ar_invoices
            WHERE tenant_id = $1 AND invoice_date >= $2::date AND status = 'paid'`,
        ),
      };
    });
    return NextResponse.json({ data: out });
  } catch (e) {
    console.error("[dashboard/ytd] aggregate failed:", e);
    return NextResponse.json({ error: "YTD aggregates unavailable" }, { status: 500 });
  }
}
