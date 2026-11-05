import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// GET /api/admin/sellers/activity?seller_id= -> real per-seller activity for
// the seller detail page: counts + latest rows from seller_listings,
// seller_orders and seller_payouts. Before this route existed the detail
// page rendered three hardcoded "No listings/orders/payouts yet" sections
// that never queried anything — they would have kept saying "none" even
// with data present. Empty arrays here are the honest state (all three
// tables are empty platform-wide today).
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read");
  if (denied) return denied;
  const sellerId = (req.nextUrl.searchParams.get("seller_id") || "").trim();
  if (!sellerId) return NextResponse.json({ error: "seller_id required" }, { status: 400 });
  const tenant = resolveTenantId(req);

  try {
    const out = await withPg(async (c) => {
      const [listings, orders, payouts, listingCount, orderCount, payoutCount, bankMethod] = await Promise.all([
        c.query(
          `SELECT id, sku, title, price::float AS price, stock, status, created_at
             FROM public.seller_listings
            WHERE tenant_id = $1 AND seller_id = $2::uuid
            ORDER BY created_at DESC LIMIT 5`,
          [tenant, sellerId]
        ),
        c.query(
          `SELECT id, order_number, customer_name, status, total::float AS total, created_at
             FROM public.seller_orders
            WHERE tenant_id = $1 AND seller_id = $2::uuid
            ORDER BY created_at DESC LIMIT 5`,
          [tenant, sellerId]
        ),
        c.query(
          `SELECT id, amount::float AS amount, status, scheduled_at, paid_at, created_at
             FROM public.seller_payouts
            WHERE tenant_id = $1 AND seller_id = $2::uuid
            ORDER BY created_at DESC LIMIT 5`,
          [tenant, sellerId]
        ),
        c.query(`SELECT count(*)::int AS n FROM public.seller_listings WHERE tenant_id = $1 AND seller_id = $2::uuid`, [tenant, sellerId]),
        c.query(`SELECT count(*)::int AS n FROM public.seller_orders WHERE tenant_id = $1 AND seller_id = $2::uuid`, [tenant, sellerId]),
        c.query(`SELECT count(*)::int AS n FROM public.seller_payouts WHERE tenant_id = $1 AND seller_id = $2::uuid`, [tenant, sellerId]),
        // A2 bank account verify: the seller's bank account of record
        // (filed at onboarding Step 3; last4 only, by design). The desk
        // reads its recorded status here — before this, no admin surface
        // showed the bank state behind a seller at all.
        c.query(
          `SELECT id, method_type, brand, last4, is_default, status, created_at
             FROM public.seller_payment_methods
            WHERE tenant_id = $1 AND seller_id = $2::uuid
            ORDER BY is_default DESC, created_at DESC LIMIT 1`,
          [tenant, sellerId]
        ),
      ]);
      return {
        listings: listings.rows,
        orders: orders.rows,
        payouts: payouts.rows,
        bankMethod: bankMethod.rows[0] ?? null,
        counts: {
          listings: listingCount.rows[0]?.n ?? 0,
          orders: orderCount.rows[0]?.n ?? 0,
          payouts: payoutCount.rows[0]?.n ?? 0,
        },
      };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "seller activity failed" }, { status: 500 });
  }
}
