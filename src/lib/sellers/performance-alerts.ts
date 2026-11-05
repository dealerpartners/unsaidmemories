// ---------------------------------------------------------------------------
// sellers/performance-alerts.ts — Admin tree A4 · Seller Performance: the
// WRITER for public.seller_performance_alerts (census A4: the table stood
// at 0 rows with no writer anywhere; late_shipment_rate and return_rate
// were defined in seller_kpi_definitions but never evaluated into flags).
//
// ATTRIBUTION — stated honestly, never fabricated:
//   The designed attribution bridge is public.seller_orders (one row per
//   seller-attributed commerce order, is_late = the platform's lateness
//   record; written by lib/sellers/attribution.ts at checkout/webhook).
//   commerce_orders itself carries seller attribution only as
//   metadata->>'seller_id'. This evaluator therefore computes:
//     denominator  = seller_orders rows for the seller; when the bridge
//                    holds none but commerce_orders metadata attributes
//                    orders to the seller, the commerce count is the
//                    denominator and the outcome names that source.
//     late rate    = seller_orders.is_late rows ÷ seller_orders rows.
//                    Only computable from the bridge — commerce metadata
//                    carries no lateness, so a commerce-only denominator
//                    makes the late rate NOT COMPUTABLE, and the outcome
//                    says so instead of writing a 0.
//     return rate  = seller_return_requests rows for the seller (the
//                    seller-attributed return store) ÷ denominator.
//   A seller with no attributed orders at all yields, per KPI, an
//   explicit outcome { outcome: 'not_computable', reason:
//   'no attributed orders' } — returned to the caller, recorded by the
//   admin route in seller_audit_log, and shown on the dashboard. Silence
//   or a fabricated 0% are both refused.
//
// THRESHOLDS come from seller_kpi_definitions.threshold for the tenant.
// The platform's delivered text names no numeric threshold for any KPI
// (see lib/analytics/platform.ts: targets/thresholds stay NULL), so when
// no threshold is configured the outcome is 'no_threshold_configured' —
// a rate is computed and reported, but no alert is written, because
// "breached" has no honest meaning without a configured line. The moment
// an admin records a threshold on the definition, breaches write alerts.
//
// IDEMPOTENCY: an evaluation never stacks a second OPEN alert for the
// same (seller, kpi_key) on the same day — an existing open alert from
// today is reported as 'alert_already_open' instead.
// ---------------------------------------------------------------------------

type PgClientLike = {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
};

export type PerformanceOutcome = {
  sellerId: string;
  sellerName: string | null;
  kpiKey: "late_shipment_rate" | "return_rate" | "negative_feedback";
  outcome:
    | "alert_written"
    | "alert_already_open"
    | "below_threshold"
    | "no_threshold_configured"
    | "not_computable";
  value: number | null;
  threshold: number | null;
  denominator: number;
  numerator: number | null;
  attributionSource: "seller_orders" | "commerce_orders_metadata" | "reviews_via_seller_listings" | "none";
  reason: string | null;
};

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};
const int = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function evaluateSellerPerformanceAlerts(
  client: PgClientLike,
  tenantId: string,
): Promise<{ outcomes: PerformanceOutcome[]; alertsWritten: number }> {
  const { rows: defs } = await client.query(
    `SELECT key, threshold FROM public.seller_kpi_definitions
      WHERE tenant_id = $1::uuid AND key IN ('late_shipment_rate', 'return_rate', 'negative_feedback')`,
    [tenantId],
  );
  const thresholds = new Map<string, number | null>();
  for (const d of defs) {
    thresholds.set(
      String(d.key),
      d.threshold === null || d.threshold === undefined ? null : num(d.threshold),
    );
  }

  const { rows: sellers } = await client.query(
    `SELECT id::text AS id, display_name FROM public.sellers
      WHERE tenant_id = $1::uuid ORDER BY created_at`,
    [tenantId],
  );

  const outcomes: PerformanceOutcome[] = [];
  let alertsWritten = 0;

  for (const s of sellers) {
    const sellerId = String(s.id);
    const sellerName = (s.display_name as string) ?? null;
    const { rows } = await client.query(
      `SELECT
         (SELECT count(*)::int FROM public.seller_orders
           WHERE tenant_id = $1::uuid AND seller_id = $2::uuid) AS bridge_orders,
         (SELECT count(*)::int FROM public.seller_orders
           WHERE tenant_id = $1::uuid AND seller_id = $2::uuid AND is_late = true) AS bridge_late,
         (SELECT count(*)::int FROM public.commerce_orders
           WHERE tenant_id = $1::uuid AND metadata->>'seller_id' = $2) AS commerce_orders,
         (SELECT count(*)::int FROM public.seller_return_requests
           WHERE tenant_id = $1::uuid AND seller_id = $2::uuid) AS return_requests`,
      [tenantId, sellerId],
    );
    const r = rows[0] ?? {};
    const bridgeOrders = int(r.bridge_orders);
    const commerceOrders = int(r.commerce_orders);
    const denominator = bridgeOrders > 0 ? bridgeOrders : commerceOrders;
    const source: PerformanceOutcome["attributionSource"] =
      bridgeOrders > 0
        ? "seller_orders"
        : commerceOrders > 0
          ? "commerce_orders_metadata"
          : "none";

    const kpis: {
      key: PerformanceOutcome["kpiKey"];
      numerator: number | null;
      computable: boolean;
      notComputableReason: string | null;
    }[] = [
      {
        key: "late_shipment_rate",
        numerator: bridgeOrders > 0 ? int(r.bridge_late) : null,
        computable: bridgeOrders > 0,
        notComputableReason:
          denominator === 0
            ? "not computable — no attributed orders"
            : "not computable — orders are attributed only via commerce_orders metadata, which carries no lateness record (seller_orders.is_late is the lateness store and holds no rows for this seller)",
      },
      {
        key: "return_rate",
        numerator: int(r.return_requests),
        computable: denominator > 0,
        notComputableReason: "not computable — no attributed orders",
      },
    ];

    for (const kpi of kpis) {
      const threshold = thresholds.get(kpi.key) ?? null;
      if (!kpi.computable || denominator === 0) {
        outcomes.push({
          sellerId,
          sellerName,
          kpiKey: kpi.key,
          outcome: "not_computable",
          value: null,
          threshold,
          denominator,
          numerator: kpi.numerator,
          attributionSource: source,
          reason: kpi.notComputableReason,
        });
        continue;
      }
      const value = round2(((kpi.numerator ?? 0) / denominator) * 100);
      if (threshold === null) {
        outcomes.push({
          sellerId,
          sellerName,
          kpiKey: kpi.key,
          outcome: "no_threshold_configured",
          value,
          threshold: null,
          denominator,
          numerator: kpi.numerator,
          attributionSource: source,
          reason:
            "Rate computed from real attributed orders, but seller_kpi_definitions carries no threshold for this KPI — no alert is written until an admin configures one.",
        });
        continue;
      }
      if (value <= threshold) {
        outcomes.push({
          sellerId,
          sellerName,
          kpiKey: kpi.key,
          outcome: "below_threshold",
          value,
          threshold,
          denominator,
          numerator: kpi.numerator,
          attributionSource: source,
          reason: null,
        });
        continue;
      }
      // Breach: write the alert unless an open one from today stands.
      const { rows: existing } = await client.query(
        `SELECT id::text AS id FROM public.seller_performance_alerts
          WHERE tenant_id = $1::uuid AND seller_id = $2::uuid AND kpi_key = $3
            AND status = 'open' AND created_at::date = CURRENT_DATE
          LIMIT 1`,
        [tenantId, sellerId, kpi.key],
      );
      if (existing[0]) {
        outcomes.push({
          sellerId,
          sellerName,
          kpiKey: kpi.key,
          outcome: "alert_already_open",
          value,
          threshold,
          denominator,
          numerator: kpi.numerator,
          attributionSource: source,
          reason: `An open alert for this KPI already stands from today (${String(existing[0].id)}).`,
        });
        continue;
      }
      await client.query(
        `INSERT INTO public.seller_performance_alerts
           (tenant_id, seller_id, kpi_key, metric_value, threshold, status, detail)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'open', $6::jsonb)`,
        [
          tenantId,
          sellerId,
          kpi.key,
          value,
          threshold,
          JSON.stringify({
            numerator: kpi.numerator,
            denominator,
            attribution_source: source,
            evaluated_by: "admin_performance_evaluation",
          }),
        ],
      );
      alertsWritten += 1;
      outcomes.push({
        sellerId,
        sellerName,
        kpiKey: kpi.key,
        outcome: "alert_written",
        value,
        threshold,
        denominator,
        numerator: kpi.numerator,
        attributionSource: source,
        reason: null,
      });
    }

    // ---- Negative feedback (A4) ----------------------------------------
    // The third flag the tree names. A COUNT, not a rate — the platform
    // KPI's own formula (lib/analytics/platform.ts): reviews with
    // rating 1–2 on products the seller lists, joined through
    // seller_listings.product_id. Breach = the count exceeds the
    // definition's threshold. A seller with no listings has nothing
    // reviewable: not computable, stated, never a fabricated 0-flag.
    {
      const { rows: fbRows } = await client.query(
        `SELECT
           (SELECT count(*)::int FROM public.seller_listings
             WHERE tenant_id = $1::uuid AND seller_id = $2::uuid) AS listings_count,
           (SELECT count(*)::int FROM public.reviews r
              JOIN public.seller_listings l
                ON l.product_id = r.product_id AND l.tenant_id = r.tenant_id
             WHERE l.tenant_id = $1::uuid AND l.seller_id = $2::uuid AND r.rating <= 2) AS negative_reviews,
           (SELECT count(*)::int FROM public.reviews r
              JOIN public.seller_listings l
                ON l.product_id = r.product_id AND l.tenant_id = r.tenant_id
             WHERE l.tenant_id = $1::uuid AND l.seller_id = $2::uuid) AS total_reviews`,
        [tenantId, sellerId],
      );
      const fb = fbRows[0] ?? {};
      const listingsCount = int(fb.listings_count);
      const negativeCount = int(fb.negative_reviews);
      const totalReviews = int(fb.total_reviews);
      const fbThreshold = thresholds.get("negative_feedback") ?? null;
      const fbBase = {
        sellerId,
        sellerName,
        kpiKey: "negative_feedback" as const,
        denominator: listingsCount,
        numerator: negativeCount,
        attributionSource: "reviews_via_seller_listings" as const,
      };
      if (listingsCount === 0) {
        outcomes.push({
          ...fbBase,
          outcome: "not_computable",
          value: null,
          threshold: fbThreshold,
          reason: "not computable — the seller has no listings, so no product reviews can attach",
        });
      } else if (fbThreshold === null) {
        outcomes.push({
          ...fbBase,
          outcome: "no_threshold_configured",
          value: negativeCount,
          threshold: null,
          reason:
            "Count computed from real reviews on the seller's listed products, but seller_kpi_definitions carries no threshold for negative_feedback — no alert is written until an admin configures one.",
        });
      } else if (negativeCount <= fbThreshold) {
        outcomes.push({
          ...fbBase,
          outcome: "below_threshold",
          value: negativeCount,
          threshold: fbThreshold,
          reason: null,
        });
      } else {
        const { rows: existingFb } = await client.query(
          `SELECT id::text AS id FROM public.seller_performance_alerts
            WHERE tenant_id = $1::uuid AND seller_id = $2::uuid AND kpi_key = 'negative_feedback'
              AND status = 'open' AND created_at::date = CURRENT_DATE
            LIMIT 1`,
          [tenantId, sellerId],
        );
        if (existingFb[0]) {
          outcomes.push({
            ...fbBase,
            outcome: "alert_already_open",
            value: negativeCount,
            threshold: fbThreshold,
            reason: `An open alert for this KPI already stands from today (${String(existingFb[0].id)}).`,
          });
        } else {
          await client.query(
            `INSERT INTO public.seller_performance_alerts
               (tenant_id, seller_id, kpi_key, metric_value, threshold, status, detail)
             VALUES ($1::uuid, $2::uuid, 'negative_feedback', $3, $4, 'open', $5::jsonb)`,
            [
              tenantId,
              sellerId,
              negativeCount,
              fbThreshold,
              JSON.stringify({
                numerator: negativeCount,
                total_reviews: totalReviews,
                listings: listingsCount,
                attribution_source: "reviews_via_seller_listings",
                evaluated_by: "admin_performance_evaluation",
              }),
            ],
          );
          alertsWritten += 1;
          outcomes.push({
            ...fbBase,
            outcome: "alert_written",
            value: negativeCount,
            threshold: fbThreshold,
            reason: null,
          });
        }
      }
    }
  }

  return { outcomes, alertsWritten };
}
