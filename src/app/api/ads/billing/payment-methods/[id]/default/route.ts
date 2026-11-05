import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { orgIdForUser } from "@/lib/ads-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ads/billing/payment-methods/[id]/default — make this card
 * the ad account's billing rail (the one the billing run charges).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const organizationId = await orgIdForUser(user.id);
    if (!organizationId) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const rows = await pgQueryStrict<{ id: string; account_id: string }>(
      `SELECT pm.id, pm.account_id
         FROM public.ad_payment_methods pm
         JOIN public.ad_accounts a ON a.id = pm.account_id
        WHERE pm.id = $1 AND a.organization_id = $2 AND pm.status = 'active' LIMIT 1`,
      [id, organizationId],
    );
    if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await pgQueryStrict(
      `UPDATE public.ad_payment_methods SET is_default = false, updated_at = now()
        WHERE account_id = $1 AND is_default = true`,
      [rows[0].account_id],
    );
    await pgQueryStrict(
      `UPDATE public.ad_payment_methods SET is_default = true, updated_at = now() WHERE id = $1`,
      [id],
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "payment_method_default_unavailable" }, { status: 503 });
  }
}
