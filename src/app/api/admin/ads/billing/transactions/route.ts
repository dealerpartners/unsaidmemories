import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { isAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ads/billing/transactions — the W9 platform revenue
 * ledger across every ad account. ad_transactions holds the charge
 * history (type, amount, currency, status, provider_ref) keyed to an
 * ad_accounts row; admin joins to organizations (the billing identity)
 * and ad_legacy_campaigns (the campaign a charge was scoped to, when
 * one was). Filters: ?status=, ?type=, ?account_id=. Newest first,
 * capped at 500, with a totals summary the licensee route does not
 * produce (admin sees the whole platform's settled + pending position).
 * Admin only.
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");
  const accountId = url.searchParams.get("account_id");

  const conds: string[] = [];
  const params: unknown[] = [];
  const add = (v: string | null, col: string) => {
    if (!v) return;
    const s = v.trim();
    if (!s) return;
    params.push(s);
    conds.push(`${col} = $${params.length}`);
  };
  add(status, "t.status");
  add(type, "t.type");
  add(accountId, "t.account_id");

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  try {
    const [transactions, totals, byStatus] = await Promise.all([
      pgQueryStrict(
        `SELECT t.id, t.type, t.amount, t.currency, t.status,
                t.provider_ref, t.campaign_id, t.metadata, t.created_at,
                t.account_id,
                ac.name AS account_name,
                ac.organization_id,
                org.name AS organization_name,
                c.name AS campaign_name
           FROM public.ad_transactions t
           LEFT JOIN public.ad_accounts ac ON ac.id = t.account_id
           LEFT JOIN public.organizations org ON org.id = ac.organization_id
           LEFT JOIN public.ad_legacy_campaigns c ON c.id = t.campaign_id
          ${where}
          ORDER BY t.created_at DESC
          LIMIT 500`,
        params,
      ),
      pgQueryStrict<{ settled: number; pending: number; refunded: number }>(
        `SELECT
           COALESCE(sum(amount) FILTER (WHERE status = 'succeeded'),0)::float8 AS settled,
           COALESCE(sum(amount) FILTER (WHERE status = 'pending'),0)::float8 AS pending,
           COALESCE(sum(amount) FILTER (WHERE status = 'refunded'),0)::float8 AS refunded
         FROM public.ad_transactions t
         ${where}`,
        params,
      ),
      pgQueryStrict<{ status: string; n: number; amount: number }>(
        `SELECT status, count(*)::int AS n,
                COALESCE(sum(amount),0)::float8 AS amount
           FROM public.ad_transactions t
          ${where}
          GROUP BY status
          ORDER BY status`,
        params,
      ),
    ]);
    return NextResponse.json({
      transactions,
      totals: totals[0] ?? { settled: 0, pending: 0, refunded: 0 },
      by_status: byStatus,
    });
  } catch {
    return NextResponse.json(
      { error: "transactions_unavailable" },
      { status: 503 },
    );
  }
}
