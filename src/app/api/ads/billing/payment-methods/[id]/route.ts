import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { getStripe } from "@/lib/stripe";
import { orgIdForUser } from "@/lib/ads-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/ads/billing/payment-methods/[id] — remove a saved card
 * from the org's ad account: detached from the Stripe customer and the
 * row marked 'removed' (kept for the ledger's audit trail). If the
 * removed card was the default, the oldest remaining active card is
 * promoted so a billing run always has a defined rail.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const organizationId = await orgIdForUser(user.id);
    if (!organizationId) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const rows = await pgQueryStrict<{
      id: string; account_id: string; provider_ref: string | null; is_default: boolean | null;
    }>(
      `SELECT pm.id, pm.account_id, pm.provider_ref, pm.is_default
         FROM public.ad_payment_methods pm
         JOIN public.ad_accounts a ON a.id = pm.account_id
        WHERE pm.id = $1 AND a.organization_id = $2 AND pm.status = 'active' LIMIT 1`,
      [id, organizationId],
    );
    const method = rows[0];
    if (!method) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const stripe = getStripe();
    if (stripe && method.provider_ref) {
      await stripe.paymentMethods.detach(method.provider_ref).catch(() => undefined);
    }
    await pgQueryStrict(
      `UPDATE public.ad_payment_methods SET status = 'removed', is_default = false, updated_at = now() WHERE id = $1`,
      [id],
    );
    if (method.is_default) {
      await pgQueryStrict(
        `UPDATE public.ad_payment_methods SET is_default = true, updated_at = now()
          WHERE id = (SELECT id FROM public.ad_payment_methods
                       WHERE account_id = $1 AND status = 'active'
                       ORDER BY created_at ASC LIMIT 1)`,
        [method.account_id],
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "payment_method_remove_unavailable" }, { status: 503 });
  }
}
