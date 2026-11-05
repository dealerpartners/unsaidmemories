import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { orgIdForUser, unbilledByCampaign } from "@/lib/ads-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/billing/transactions — the ad account's billing ledger
 * (ad_transactions, AB9) plus the live unbilled position per campaign:
 * spend accrued by serve, billed-through by succeeded charges, and the
 * remainder the next billing run will collect. An account with no
 * transactions reads an honest empty ledger, never an invented one.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const organizationId = await orgIdForUser(user.id);
    if (!organizationId) {
      return NextResponse.json({
        transactions: [],
        campaigns: [],
        totals: { spent: 0, billed: 0, unbilled: 0 },
      });
    }
    const accounts = await pgQueryStrict<{ id: string }>(
      `SELECT id FROM public.ad_accounts WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [organizationId],
    );
    const accountId = accounts[0]?.id;
    const transactions = accountId
      ? await pgQueryStrict(
          `SELECT t.id, t.type, t.amount, t.currency, t.status, t.provider_ref,
                  t.campaign_id, t.created_at, c.name AS campaign_name
             FROM public.ad_transactions t
             LEFT JOIN public.ad_legacy_campaigns c ON c.id = t.campaign_id
            WHERE t.account_id = $1
            ORDER BY t.created_at DESC
            LIMIT 200`,
          [accountId],
        )
      : [];
    const campaigns = await unbilledByCampaign(organizationId);
    const totals = campaigns.reduce(
      (acc, c) => ({
        spent: acc.spent + c.spent,
        billed: acc.billed + c.billed,
        unbilled: acc.unbilled + c.unbilled,
      }),
      { spent: 0, billed: 0, unbilled: 0 },
    );
    return NextResponse.json({ transactions, campaigns, totals });
  } catch {
    return NextResponse.json({ error: "transactions_unavailable" }, { status: 503 });
  }
}
