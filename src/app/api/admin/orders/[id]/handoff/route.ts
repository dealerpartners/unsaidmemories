import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import {
  rollupSplitParentFulfillmentSafe,
  sellerQueryFnForPgClient,
} from "@/lib/sellers/order-split";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/admin/orders/[id]/handoff — Mark a pickup order as handed off.
// Sets fulfillment_status='delivered', records handoff timestamp in metadata.
// ============================================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireModuleApi("orders", "write");
  if (gate) return gate;

  const { id } = await params;
  const tenant = resolveTenantId(req);

  const result = await withPg(async (client) => {
    const { rows } = await client.query(
      `UPDATE public.commerce_orders
       SET fulfillment_status = 'delivered',
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('handed_off_at', now()::text),
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id::text AS id, fulfillment_status`,
      [id, tenant]
    );
    if (rows[0]) {
      // Checkout-split child? Its parent's roll-up follows the handoff.
      await rollupSplitParentFulfillmentSafe(sellerQueryFnForPgClient(client), id);
    }
    return rows[0] || null;
  });

  if (!result) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, orderId: result.id, status: "delivered", handedOff: true });
}
