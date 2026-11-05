import { NextRequest, NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { MASTER_TENANT_ID } from "@/lib/site-tenant";
import { getCurrentUser } from "@/lib/auth/server";
import { getStripe } from "@/lib/stripe";
import { ensureDeveloperContext } from "@/lib/devportal-server";
import {
  claimV2BillingPending,
  ensureAdAccount,
  ensureAdAccountStripeCustomer,
  settleV2Billing,
  unbilledByCampaign,
  unbilledV2ByCampaign,
} from "@/lib/ads-server";
import { getAdvertiserForUser } from "@/lib/ads/advertiser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ads/billing/charge — THE BILLING RUN (BL-5 / B11.2 item 3).
 *
 * Until now advertising spend accrued as numbers in the legacy
 * campaigns' `spent` column and no payment was ever collected:
 * ad_transactions had no writer. This run closes the loop for the
 * signed-in advertiser's organization. Ads v2 note (finish step):
 * the run settles LEGACY campaigns — unbilledByCampaign reads
 * ad_legacy_campaigns explicitly; v2 campaign spend
 * (ad_campaigns.lifetime_spend_cents) has no billing writer yet
 * (named remainder of the v2 rebuild).
 *
 *   for each campaign with unbilled accrued spend >= $0.50:
 *     1. write the ad_transactions row first ('charge', 'pending'),
 *     2. create + confirm a Stripe PaymentIntent off-session against
 *        the ad account's default saved card, idempotency-keyed on the
 *        transaction row so a retried run can never double-charge,
 *     3. settle the row: 'succeeded' with provider_ref = the
 *        PaymentIntent id, or 'failed' with the Stripe outcome kept in
 *        metadata (e.g. a card that needs authentication — the honest
 *        state the advertiser must fix on the payment-methods page).
 *
 * Billed-through accounting (succeeded + pending sums) is what makes a
 * re-run collect only what is still owed. Amounts under Stripe's $0.50
 * minimum stay accrued and ride the next run.
 *
 * No default payment method → 400 no_payment_method (nothing written).
 * Stripe unconfigured → 503 stripe_not_configured.
 *
 * V2 LEG (migration 20261190, report-first). The legacy leg above is
 * unchanged in behavior. Alongside it, every call computes the v2
 * position for the caller's advertiser row (unbilledV2ByCampaign)
 * and returns it in the `v2` block — report mode writes nothing.
 * V2 money moves only when BOTH hold: ?apply=1 on the request AND
 * ADS_V2_BILLING_APPLY=true in env. The env flag is unset by
 * default, so an apply request without owner approval answers
 * mode "apply_not_approved" and charges nothing. In apply mode the
 * v2 charge mirrors the legacy leg: ad_transactions row first
 * (campaign_id NULL — the UUID column keeps its legacy meaning,
 * the v2 campaign id rides in metadata), claim on the
 * ad_v2_campaign_billing marker so a concurrent run cannot
 * double-charge, Stripe PaymentIntent idempotency-keyed on the
 * transaction row, then settle both rows. A lost claim fails its
 * transaction row at once as "already_pending". Amounts below the
 * $0.50 minimum stay accrued and ride the next run, exactly as
 * the legacy leg treats them.
 */

const MIN_CHARGE = 0.5;

type V2Result = {
  campaign_id: number; transaction_id: string; amount: number;
  status: string; provider_ref: string | null;
};

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    // V2 report: computed on every call, writes nothing. A caller
    // with no advertiser row honestly reports an empty v2 position;
    // no advertiser row is ever created by billing. If the marker
    // table is not installed yet, v2 degrades to an empty report
    // with a note instead of breaking the legacy run.
    let v2Campaigns: Awaited<ReturnType<typeof unbilledV2ByCampaign>> = [];
    let v2Note: string | null = null;
    let v2AdvertiserId: string | null = null;
    try {
      const advertiser = await getAdvertiserForUser(user.id);
      v2AdvertiserId = advertiser?.id ?? null;
      v2Campaigns = advertiser ? await unbilledV2ByCampaign(advertiser.id) : [];
    } catch (err) {
      const msg = String((err as { message?: unknown })?.message ?? err);
      if (/does not exist/i.test(msg)) {
        v2Note = "v2_billing_not_installed";
      } else {
        throw err;
      }
    }
    const v2ApplyRequested = req.nextUrl.searchParams.get("apply") === "1";
    const v2ApplyApproved = process.env.ADS_V2_BILLING_APPLY === "true";
    const v2Mode = !v2ApplyRequested
      ? "report"
      : v2ApplyApproved
        ? "apply"
        : "apply_not_approved";
    const v2Base = {
      mode: v2Mode,
      campaigns: v2Campaigns,
      ...(v2Note ? { note: v2Note } : {}),
    };

    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json(
        {
          error: "Billing is unavailable right now.",
          state: "stripe_not_configured",
          v2: v2Base,
        },
        { status: 503 },
      );
    }

    const ctx = await ensureDeveloperContext(user);
    const account = await ensureAdAccount(
      ctx.organizationId,
      ctx.tenantId ?? MASTER_TENANT_ID,
      ctx.organizationName,
    );

    const methods = await pgQueryStrict<{
      id: string; provider_ref: string | null;
    }>(
      `SELECT id, provider_ref FROM public.ad_payment_methods
        WHERE account_id = $1 AND status = 'active' AND provider_ref IS NOT NULL
        ORDER BY is_default DESC, created_at ASC LIMIT 1`,
      [account.id],
    );
    const method = methods[0];
    if (!method?.provider_ref) {
      return NextResponse.json(
        {
          error: "Add a payment method before running billing.",
          state: "no_payment_method",
          v2: v2Base,
        },
        { status: 400 },
      );
    }

    const due = (await unbilledByCampaign(ctx.organizationId)).filter(
      (c) => c.unbilled >= MIN_CHARGE,
    );
    const v2Due = v2Mode === "apply"
      ? v2Campaigns.filter((c) => c.chargeable)
      : [];
    if (!due.length && v2Due.length === 0) {
      return NextResponse.json({
        charged: 0, failed: 0, total: 0, results: [],
        v2: { ...v2Base, charged: 0, failed: 0, total: 0, results: [] },
      });
    }

    const customerId = await ensureAdAccountStripeCustomer(account, user.email ?? null);
    if (!customerId) {
      return NextResponse.json(
        { error: "stripe_not_configured", v2: v2Base },
        { status: 503 },
      );
    }

    const results: Array<{
      campaign_id: string; transaction_id: string; amount: number;
      status: string; provider_ref: string | null;
    }> = [];
    let total = 0;

    for (const campaign of due) {
      const inserted = await pgQueryStrict<{ id: string }>(
        `INSERT INTO public.ad_transactions
           (account_id, campaign_id, type, amount, currency, status, metadata)
         VALUES ($1, $2, 'charge', $3, 'USD', 'pending', $4::jsonb)
         RETURNING id`,
        [
          account.id,
          campaign.campaign_id,
          campaign.unbilled,
          JSON.stringify({ source: "billing_run", accrued_spend: campaign.spent }),
        ],
      );
      const txnId = inserted[0].id;
      try {
        const pi = await stripe.paymentIntents.create(
          {
            amount: Math.round(campaign.unbilled * 100),
            currency: "usd",
            customer: customerId,
            payment_method: method.provider_ref,
            off_session: true,
            confirm: true,
            description: `UnSaid Memories advertising — ${campaign.name}`,
            metadata: {
              ad_account_id: account.id,
              ad_campaign_id: campaign.campaign_id,
              ad_transaction_id: txnId,
            },
          },
          { idempotencyKey: `ad-billing-${txnId}` },
        );
        const succeeded = pi.status === "succeeded";
        await pgQueryStrict(
          `UPDATE public.ad_transactions
              SET status = $2, provider_ref = $3,
                  metadata = metadata || $4::jsonb, updated_at = now()
            WHERE id = $1`,
          [
            txnId,
            succeeded ? "succeeded" : "failed",
            pi.id,
            JSON.stringify({
              stripe_status: pi.status,
              ...(succeeded ? {} : { failure_reason: "payment_not_completed" }),
            }),
          ],
        );
        if (succeeded) total += campaign.unbilled;
        results.push({
          campaign_id: campaign.campaign_id,
          transaction_id: txnId,
          amount: campaign.unbilled,
          status: succeeded ? "succeeded" : "failed",
          provider_ref: pi.id,
        });
      } catch (err) {
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code?: unknown }).code ?? "stripe_error")
            : "stripe_error";
        await pgQueryStrict(
          `UPDATE public.ad_transactions
              SET status = 'failed',
                  metadata = metadata || $2::jsonb, updated_at = now()
            WHERE id = $1`,
          [txnId, JSON.stringify({ stripe_error: code })],
        ).catch(() => undefined);
        results.push({
          campaign_id: campaign.campaign_id,
          transaction_id: txnId,
          amount: campaign.unbilled,
          status: "failed",
          provider_ref: null,
        });
      }
    }

    // V2 apply leg: runs only in approved apply mode. Same shape as
    // the legacy leg, with the marker claim as the double-charge guard.
    const v2Results: V2Result[] = [];
    let v2Total = 0;
    for (const campaign of v2Due) {
      const chargedMillicents = campaign.unbilled_cents * 1000;
      const inserted = await pgQueryStrict<{ id: string }>(
        `INSERT INTO public.ad_transactions
           (account_id, campaign_id, type, amount, currency, status, metadata)
         VALUES ($1, NULL, 'charge', $2, 'USD', 'pending', $3::jsonb)
         RETURNING id`,
        [
          account.id,
          campaign.unbilled_dollars,
          JSON.stringify({
            source: "v2_billing_run",
            v2_campaign_id: campaign.campaign_id,
            v2_advertiser_id: v2AdvertiserId,
            unbilled_millicents: campaign.unbilled_millicents,
            charged_millicents: chargedMillicents,
          }),
        ],
      );
      const txnId = inserted[0].id;
      const claimed = await claimV2BillingPending(
        campaign.campaign_id,
        account.id,
        chargedMillicents,
        txnId,
      );
      if (!claimed) {
        await pgQueryStrict(
          `UPDATE public.ad_transactions
              SET status = 'failed',
                  metadata = metadata || $2::jsonb, updated_at = now()
            WHERE id = $1`,
          [txnId, JSON.stringify({ claim: "already_pending" })],
        ).catch(() => undefined);
        v2Results.push({
          campaign_id: campaign.campaign_id,
          transaction_id: txnId,
          amount: campaign.unbilled_dollars,
          status: "already_pending",
          provider_ref: null,
        });
        continue;
      }
      try {
        const pi = await stripe.paymentIntents.create(
          {
            amount: campaign.unbilled_cents,
            currency: "usd",
            customer: customerId,
            payment_method: method.provider_ref,
            off_session: true,
            confirm: true,
            description: `UnSaid Memories advertising — ${campaign.name}`,
            metadata: {
              ad_account_id: account.id,
              ad_transaction_id: txnId,
              v2_campaign_id: String(campaign.campaign_id),
            },
          },
          { idempotencyKey: `ad-billing-v2-${txnId}` },
        );
        const succeeded = pi.status === "succeeded";
        await pgQueryStrict(
          `UPDATE public.ad_transactions
              SET status = $2, provider_ref = $3,
                  metadata = metadata || $4::jsonb, updated_at = now()
            WHERE id = $1`,
          [
            txnId,
            succeeded ? "succeeded" : "failed",
            pi.id,
            JSON.stringify({
              stripe_status: pi.status,
              ...(succeeded ? {} : { failure_reason: "payment_not_completed" }),
            }),
          ],
        );
        await settleV2Billing(campaign.campaign_id, txnId, succeeded);
        if (succeeded) v2Total += campaign.unbilled_dollars;
        v2Results.push({
          campaign_id: campaign.campaign_id,
          transaction_id: txnId,
          amount: campaign.unbilled_dollars,
          status: succeeded ? "succeeded" : "failed",
          provider_ref: pi.id,
        });
      } catch (err) {
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code?: unknown }).code ?? "stripe_error")
            : "stripe_error";
        await pgQueryStrict(
          `UPDATE public.ad_transactions
              SET status = 'failed',
                  metadata = metadata || $2::jsonb, updated_at = now()
            WHERE id = $1`,
          [txnId, JSON.stringify({ stripe_error: code })],
        ).catch(() => undefined);
        await settleV2Billing(campaign.campaign_id, txnId, false).catch(() => undefined);
        v2Results.push({
          campaign_id: campaign.campaign_id,
          transaction_id: txnId,
          amount: campaign.unbilled_dollars,
          status: "failed",
          provider_ref: null,
        });
      }
    }

    return NextResponse.json({
      charged: results.filter((r) => r.status === "succeeded").length,
      failed: results.filter((r) => r.status === "failed").length,
      total: Math.round(total * 100) / 100,
      results,
      v2: {
        ...v2Base,
        charged: v2Results.filter((r) => r.status === "succeeded").length,
        failed: v2Results.filter((r) => r.status === "failed").length,
        total: Math.round(v2Total * 100) / 100,
        results: v2Results,
      },
    });
  } catch {
    return NextResponse.json({ error: "billing_run_unavailable" }, { status: 503 });
  }
}
