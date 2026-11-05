// ---------------------------------------------------------------------------
// analytics/platform.ts — Admin tree §I ANALYTICS completion: the platform /
// seller / customer metric computations + the seller KPI machinery (the A4
// follow-on the Connect build named: "the tier is an ADMIN-ASSIGNED RECORD
// until the A4 KPI machinery computes one" — src/lib/sellers/payout-delay.ts).
//
// FIRSTHAND CENSUS (2026-10-14, foreground information_schema / pg_constraint
// / pg_class + live counts + firsthand code reads):
//
//   §I leaves (admin-portal-tree.md, quoted): I1 Platform Metrics {GMV,
//   Orders, Returns, Refunds, Revenue} · I2 Seller Analytics {Seller KPIs,
//   Category performance, Listing quality, Search performance} · I3
//   Customer Analytics {Cohorts, Lifetime value, Churn, Search behavior} ·
//   I4 NL→SQL Explorer {Query builder, Saved queries, Scheduled exports,
//   Data governance}. Data graph contracts: I1 writes `kpi_definitions`,
//   `metric_facts` (read by Seller + Customer + Employee, "each sees scoped
//   metrics") · I2 writes `seller_metrics` (Seller sees own) · I3 writes
//   `customer_metrics` (Customer sees own) · A4 Performance writes
//   `kpi_snapshots` (Seller sees own KPIs).
//
//   THE DESIGNED STORES AS THEY ACTUALLY EXIST: the graph's platform-shaped
//   names were built seller-prefixed — public.seller_kpi_definitions,
//   seller_kpi_snapshots, seller_metric_definitions, seller_metric_facts,
//   seller_insights (ALL 0 rows, PK-only constraints, ZERO code references
//   anywhere on this lineage beyond comments naming their emptiness).
//   seller_kpi_snapshots.value/snapshot_date + seller_metric_facts.value/
//   dimension/measured_at are the A4/I2 record shapes. There is NO platform
//   (seller-less) facts store: seller_metric_facts.seller_id is NOT NULL,
//   so platform metrics are COMPUTED AT READ (the pattern the existing
//   /api/admin/reports route already runs for revenue) and never written
//   into a seller-keyed store under a fake seller.
//
//   WHAT /admin/analytics COMPUTED BEFORE THIS BITE: the Master Tree B.9
//   salon base only (AnalyticsView → /api/admin/analytics/actions, gate
//   reports/write — bookings funnel, no-show, rebook, revenue, groomer,
//   acquisition, liabilities). §I's four sections had NO admin surface.
//
//   SOURCE POPULATIONS (live, master tenant): commerce_orders 12 (ALL
//   payment_status 'unpaid'; total_amount is TEXT carrying "$34.00"-shaped
//   values — parsed by stripping non-numerics, never cast raw) ·
//   commerce_payments 34 (succeeded 25 @ 1541.09 · refunded 1 @ 25.00 ·
//   pending 7 @ 175.00 · cancelled 1 @ 58.07) · commerce_refunds 2
//   (completed @ 72.11) · customer_return_requests 0 ·
//   erp_return_authorizations 1 · sellers 1 · seller_listings 0 ·
//   seller_disputes 0 · seller_violations 0 · seller_refunds 0 · reviews 17
//   (product-keyed) · crm_customers 23 · crm_appointments 22 (14 distinct
//   customers) · analytics_events 88 (GA-shaped event names; ZERO search
//   events) · seller_capabilities 0 (pro_tier is the tier record the payout
//   -delay derivation reads — this module never writes it: no delivered
//   text makes a computed KPI assign a tier, so tiers stay admin-assigned
//   records exactly as the Connect build left them).
//
//   SELLER ATTRIBUTION — THE BOUNDARY THAT GOVERNS I2: commerce_orders and
//   commerce_order_items carry NO seller_id (§C's named finding). The
//   designed attribution bridge DOES exist — public.seller_orders
//   (seller_id, order_id, total, is_late) with seller_order_lines /
//   seller_order_events. UPDATE (Crew G, §9/§11 writer): the attribution
//   writer now exists (src/lib/sellers/attribution.ts, called from shop
//   checkout / express checkout / the Stripe webhook), so attributed
//   orders populate seller_orders and commerce_orders.metadata.seller_id.
//   computeSellerMetrics below therefore computes the tree-named rate
//   KPIs (return_rate, inr_rate, late_shipment_rate) as snapshots — but
//   ONLY over a real attributed-order denominator > 0; a 0/0 written as
//   0 would still be a fabricated rate, so with no attributed orders no
//   snapshot is written. Count facts whose populations are real
//   (listings, disputes, violations, seller refunds, attributable
//   negative reviews) ARE computed and recorded; a count of 0 over a
//   real population is a true fact, stated as such.
// ---------------------------------------------------------------------------

import { searchStats } from "@/lib/analytics/search-stats";

type PgClientLike = {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
};

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const int = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
};

// Order totals are TEXT with currency formatting ("$34.00"). The parse is
// the same strip-non-numerics reading the §I census verified against all
// 12 live rows (sum 814.27, matching a hand parse).
export const ORDER_TOTAL_SQL = `NULLIF(regexp_replace(coalesce(total_amount, ''), '[^0-9.]', '', 'g'), '')::numeric`;

// ── Definitions (CONFIGURATION — seeded from Sunny's text, labeled) ──────
// KPI names are the original feature tree's seller performance pages
// (/seller/performance: return-rate · inr-rate · negative-feedback ·
// late-shipment) + the catalog quality leaf (kpi_snapshots
// (listing_quality)). Targets/thresholds: NO delivered text names a
// number for any of them, so both stay NULL — never invented.
export const KPI_DEFINITIONS: { key: string; name: string; unit: string }[] = [
  { key: "listing_quality", name: "Listing quality", unit: "score" },
  { key: "return_rate", name: "Return rate", unit: "%" },
  { key: "inr_rate", name: "Item-not-received rate", unit: "%" },
  { key: "negative_feedback", name: "Negative feedback", unit: "count" },
  { key: "late_shipment_rate", name: "Late shipment rate", unit: "%" },
  // §11.6 Carrier — no definition existed among the original five. Seeded
  // through this same code-seeded store (ensureAnalyticsDefinitions),
  // exactly like the other five; computed in computeSellerMetrics from
  // attributed commerce_orders carrying a carrier (see KPI section).
  { key: "carrier_delivery_rate", name: "Carrier delivery rate", unit: "%" },
];

// Metric definitions carry the PLAIN READING of each metric as its
// formula text — recorded on the row, shown on the face. Rates whose
// sources cannot be attributed say so in their formula and are never
// computed (see the header's attribution boundary).
export const METRIC_DEFINITIONS: { key: string; name: string; formula: string; unit: string; computable: boolean }[] = [
  { key: "listings_count", name: "Listings", formula: "Count of the seller's rows in seller_listings.", unit: "count", computable: true },
  { key: "listings_approved_count", name: "Approved listings", formula: "Count of the seller's listings with status 'approved'.", unit: "count", computable: true },
  { key: "listings_suppressed_count", name: "Suppressed listings", formula: "Count of the seller's listings carrying a suppression_reason.", unit: "count", computable: true },
  { key: "disputes_count", name: "Disputes", formula: "Count of the seller's rows in seller_disputes.", unit: "count", computable: true },
  { key: "violations_count", name: "Policy violations", formula: "Count of the seller's rows in seller_violations.", unit: "count", computable: true },
  { key: "refunds_issued_count", name: "Refunds issued", formula: "Count of the seller's seller_refunds with status 'completed'.", unit: "count", computable: true },
  { key: "refunds_issued_amount", name: "Refunds issued (amount)", formula: "Sum of amount over the seller's seller_refunds with status 'completed'.", unit: "USD", computable: true },
  { key: "negative_feedback_count", name: "Negative feedback", formula: "Count of reviews with rating 1–2 on products the seller lists (reviews joined through seller_listings.product_id).", unit: "count", computable: true },
  { key: "return_rate", name: "Return rate", formula: "Seller return requests (seller_return_requests) ÷ seller-attributed orders (seller_orders bridge rows). Written as a KPI snapshot only when the attributed-order denominator is > 0 — never as a fabricated 0/0.", unit: "%", computable: true },
  { key: "inr_rate", name: "Item-not-received rate", formula: "Seller disputes whose dispute_type marks item-not-received (ILIKE '%not_received%' / '%not-received%' / '%item_not%' / '%inr%') ÷ seller-attributed orders (seller_orders). KPI snapshot only when the denominator is > 0.", unit: "%", computable: true },
  { key: "late_shipment_rate", name: "Late shipment rate", formula: "Seller orders marked late (seller_orders.is_late) ÷ seller orders. is_late is computed by the same run: an order is late when its delivery-promise window (the seller's shortest seller_delivery_promises.promised_days, from commerce_orders.created_at) elapsed before shipment (label purchase time in commerce_orders.metadata.label_purchased_at) or elapsed while still unshipped. No promise on record → lateness is not computed and no snapshot is written.", unit: "%", computable: true },
  { key: "sales_revenue", name: "Sales revenue (period)", formula: "Sum of commerce_orders totals (text totals parsed) over the seller's attributed (metadata.seller_id), non-cancelled orders in the period named in the fact's dimension (7d / 30d).", unit: "USD", computable: true },
  { key: "sales_orders_count", name: "Sales orders (period)", formula: "Count of the seller's attributed, non-cancelled commerce_orders in the period named in the fact's dimension (7d / 30d); with dimension {region} instead of {period}, the all-time count for orders whose shipping address carries that US state.", unit: "count", computable: true },
  { key: "units_sold", name: "Units sold (period)", formula: "Sum of commerce_order_items.quantity over the seller's attributed, non-cancelled orders in the period named in the fact's dimension.", unit: "count", computable: true },
  { key: "sales_aov", name: "Average order value (period)", formula: "sales_revenue ÷ sales_orders_count for the period; written only when the period's order count is > 0.", unit: "USD", computable: true },
  { key: "sales_revenue_by_region", name: "Sales revenue by region", formula: "All-time sum of commerce_orders totals over the seller's attributed, non-cancelled orders, grouped by the US state parsed from commerce_orders.shipping_address (JSON state field, or the ', ST ZIP' tail of the text address). Facts carry dimension {region: STATE}; orders with no parseable state produce no regional fact.", unit: "USD", computable: true },
  { key: "pricing_priced_listings_count", name: "Priced listings", formula: "Count of the seller's commerce_catalog_items whose latest commerce_prices row (valid_from DESC) is > 0 — the same price reading /api/seller/products serves.", unit: "count", computable: true },
  { key: "pricing_min_price", name: "Lowest listing price", formula: "Minimum latest price across the seller's priced commerce_catalog_items (commerce_prices.price is cents; the fact is dollars).", unit: "USD", computable: true },
  { key: "pricing_avg_price", name: "Average listing price", formula: "Mean latest price across the seller's priced commerce_catalog_items (dollars).", unit: "USD", computable: true },
  { key: "pricing_max_price", name: "Highest listing price", formula: "Maximum latest price across the seller's priced commerce_catalog_items (dollars).", unit: "USD", computable: true },
  { key: "inventory_skus_count", name: "Inventory SKUs tracked", formula: "Count of the seller's seller_inventory rows.", unit: "count", computable: true },
  { key: "inventory_units_available", name: "Units available", formula: "Sum of seller_inventory.available over the seller's rows.", unit: "count", computable: true },
  { key: "inventory_low_stock_count", name: "Low-stock SKUs", formula: "Count of the seller's seller_inventory rows with available <= 5 (the threshold the inventory surfaces use).", unit: "count", computable: true },
  { key: "inventory_out_of_stock_count", name: "Out-of-stock SKUs", formula: "Count of the seller's seller_inventory rows with available = 0.", unit: "count", computable: true },
  { key: "inventory_sell_through_rate", name: "Sell-through rate (30d)", formula: "Units sold in the last 30 days ÷ (units sold in the last 30 days + units currently available) × 100, aggregate over the seller's attributed orders and seller_inventory. Written only when the denominator is > 0.", unit: "%", computable: true },
  { key: "inventory_days_of_supply", name: "Days of supply", formula: "Units available ÷ (units sold in the last 30 days ÷ 30). Written only when units were sold in the last 30 days.", unit: "days", computable: true },
  { key: "carrier_orders_count", name: "Carrier orders", formula: "All-time count of the seller's attributed commerce_orders carrying the carrier named in the fact's dimension {carrier}.", unit: "count", computable: true },
  { key: "carrier_delivered_count", name: "Carrier delivered orders", formula: "All-time count of the seller's attributed commerce_orders with that carrier whose fulfillment_status (or status) is 'delivered'. Facts carry dimension {carrier}.", unit: "count", computable: true },
  { key: "traffic_product_views", name: "Traffic — product views (30d)", formula: "Count of storefront view_item events in public.analytics_events over the last 30 days whose items name a product of this seller (event_data.items[].item_id → commerce_catalog_items.metadata.seller_id — the same attribution the sales facts use). Facts carry dimension {period: '30d'}.", unit: "count", computable: true },
  { key: "traffic_sessions", name: "Traffic — sessions with a product view (30d)", formula: "Distinct session_id values among the seller's attributed view_item events (analytics_events) over the last 30 days. Facts carry dimension {period: '30d'}.", unit: "count", computable: true },
  { key: "traffic_cart_adds", name: "Traffic — add-to-cart events (30d)", formula: "Count of add_to_cart events in public.analytics_events over the last 30 days attributed to the seller through their items. Facts carry dimension {period: '30d'}.", unit: "count", computable: true },
  { key: "conversion_cart_rate", name: "Conversion — view-to-cart rate (30d)", formula: "traffic_cart_adds ÷ traffic_product_views × 100 over the same 30 days. Written only when product views > 0 — never as a fabricated 0/0. Facts carry dimension {period: '30d'}.", unit: "%", computable: true },
  { key: "conversion_checkout_rate", name: "Conversion — view-to-checkout rate (30d)", formula: "Attributed begin_checkout events (analytics_events) ÷ traffic_product_views × 100 over the last 30 days. Written only when product views > 0. Facts carry dimension {period: '30d'}.", unit: "%", computable: true },
];

/** Idempotent seed of the definition configuration for one tenant.
 *  The stores carry PK-only constraints (no unique on (tenant, key)), so
 *  idempotency is check-then-insert per key. Returns what was seeded. */
export async function ensureAnalyticsDefinitions(
  client: PgClientLike,
  tenantId: string,
): Promise<{ kpiSeeded: string[]; metricSeeded: string[] }> {
  const kpiSeeded: string[] = [];
  const metricSeeded: string[] = [];
  const { rows: existingKpi } = await client.query(
    `SELECT key FROM public.seller_kpi_definitions WHERE tenant_id = $1::uuid`,
    [tenantId],
  );
  const haveKpi = new Set(existingKpi.map((r) => String(r.key)));
  for (const d of KPI_DEFINITIONS) {
    if (haveKpi.has(d.key)) continue;
    await client.query(
      `INSERT INTO public.seller_kpi_definitions (tenant_id, key, name, unit) VALUES ($1::uuid, $2, $3, $4)`,
      [tenantId, d.key, d.name, d.unit],
    );
    kpiSeeded.push(d.key);
  }
  const { rows: existingMetric } = await client.query(
    `SELECT key FROM public.seller_metric_definitions WHERE tenant_id = $1::uuid`,
    [tenantId],
  );
  const haveMetric = new Set(existingMetric.map((r) => String(r.key)));
  for (const d of METRIC_DEFINITIONS) {
    if (haveMetric.has(d.key)) continue;
    await client.query(
      `INSERT INTO public.seller_metric_definitions (tenant_id, key, name, formula, unit) VALUES ($1::uuid, $2, $3, $4, $5)`,
      [tenantId, d.key, d.name, d.formula, d.unit],
    );
    metricSeeded.push(d.key);
  }
  return { kpiSeeded, metricSeeded };
}

// ── The KPI writer ────────────────────────────────────────────────────────
// Computes the computable metric facts + the listing_quality KPI snapshot
// for every seller in the tenant, from real rows, at run time.
// IDEMPOTENCY: a same-day rerun REPLACES that day's facts (delete by
// tenant+seller+metric_key+measured day, then insert) and that date's
// snapshots — a second run leaves the fact/snapshot counts unchanged.
/** Write one measured fact for today, replacing today's same-dimension
 *  fact for the key (manual-override facts are governed and never
 *  touched — same rule as the legacy fact loop below). */
async function writeFact(
  client: PgClientLike,
  tenantId: string,
  sellerId: string,
  key: string,
  value: number,
  dimension: Record<string, unknown>,
): Promise<void> {
  const dim = JSON.stringify(dimension);
  await client.query(
    `DELETE FROM public.seller_metric_facts
      WHERE tenant_id = $1::uuid AND seller_id = $2::uuid AND metric_key = $3
        AND measured_at::date = CURRENT_DATE
        AND dimension = $4::jsonb
        AND coalesce(dimension->>'source', '') <> 'manual_override'`,
    [tenantId, sellerId, key, dim],
  );
  await client.query(
    `INSERT INTO public.seller_metric_facts (tenant_id, seller_id, metric_key, value, dimension)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb)`,
    [tenantId, sellerId, key, value, dim],
  );
}

/** Write one KPI snapshot for today, replacing today's snapshot for the
 *  key (same per-day idempotency as the listing_quality snapshot). */
async function writeSnapshot(
  client: PgClientLike,
  tenantId: string,
  sellerId: string,
  kpiKey: string,
  value: number,
): Promise<void> {
  await client.query(
    `DELETE FROM public.seller_kpi_snapshots
      WHERE tenant_id = $1::uuid AND seller_id = $2::uuid AND kpi_key = $3
        AND snapshot_date = CURRENT_DATE`,
    [tenantId, sellerId, kpiKey],
  );
  await client.query(
    `INSERT INTO public.seller_kpi_snapshots (tenant_id, seller_id, kpi_key, value, snapshot_date)
     VALUES ($1::uuid, $2::uuid, $3, $4, CURRENT_DATE)`,
    [tenantId, sellerId, kpiKey, value],
  );
}

export async function computeSellerMetrics(
  client: PgClientLike,
  tenantId: string,
  opts?: { sellerId?: string },
): Promise<{
  sellersComputed: number;
  factsWritten: number;
  snapshotsWritten: number;
  perSeller: Record<string, Record<string, number>>;
}> {
  const { rows: sellers } = await client.query(
    `SELECT id::text AS id FROM public.sellers
      WHERE tenant_id = $1::uuid
        AND ($2::uuid IS NULL OR id = $2::uuid)
      ORDER BY created_at`,
    [tenantId, opts?.sellerId ?? null],
  );
  let factsWritten = 0;
  let snapshotsWritten = 0;
  const perSeller: Record<string, Record<string, number>> = {};

  for (const s of sellers) {
    const sellerId = String(s.id);
    const { rows } = await client.query(
      `SELECT
         (SELECT count(*)::int FROM public.seller_listings WHERE tenant_id = $1::uuid AND seller_id = $2::uuid) AS listings_count,
         (SELECT count(*)::int FROM public.seller_listings WHERE tenant_id = $1::uuid AND seller_id = $2::uuid AND status = 'approved') AS listings_approved_count,
         (SELECT count(*)::int FROM public.seller_listings WHERE tenant_id = $1::uuid AND seller_id = $2::uuid AND suppression_reason IS NOT NULL) AS listings_suppressed_count,
         (SELECT count(*)::int FROM public.seller_disputes WHERE tenant_id = $1::uuid AND seller_id = $2::uuid) AS disputes_count,
         (SELECT count(*)::int FROM public.seller_violations WHERE tenant_id = $1::uuid AND seller_id = $2::uuid) AS violations_count,
         (SELECT count(*)::int FROM public.seller_refunds WHERE tenant_id = $1::uuid AND seller_id = $2::uuid AND status = 'completed') AS refunds_issued_count,
         (SELECT coalesce(sum(amount), 0)::numeric FROM public.seller_refunds WHERE tenant_id = $1::uuid AND seller_id = $2::uuid AND status = 'completed') AS refunds_issued_amount,
         (SELECT count(*)::int FROM public.reviews r JOIN public.seller_listings l
             ON l.product_id = r.product_id AND l.tenant_id = r.tenant_id
            WHERE l.tenant_id = $1::uuid AND l.seller_id = $2::uuid AND r.rating <= 2) AS negative_feedback_count,
         (SELECT avg(health_score)::numeric FROM public.seller_listings
            WHERE tenant_id = $1::uuid AND seller_id = $2::uuid AND health_score IS NOT NULL) AS listing_quality_avg,
         (SELECT count(*)::int FROM public.seller_listings
            WHERE tenant_id = $1::uuid AND seller_id = $2::uuid AND health_score IS NOT NULL) AS listing_quality_n`,
      [tenantId, sellerId],
    );
    const r = rows[0] ?? {};
    const values: Record<string, number> = {};
    for (const d of METRIC_DEFINITIONS) {
      if (!d.computable) continue;
      // Only keys the aggregate query actually selected are legacy facts.
      // The rate KPIs and the period/pricing/inventory/carrier facts are
      // computed (conditionally — never as fabricated zeros) in the
      // extended section below, which writes them with their dimensions.
      if (!(d.key in r)) continue;
      values[d.key] = num(r[d.key]);
    }
    perSeller[sellerId] = values;

    for (const [key, value] of Object.entries(values)) {
      // K2 manual-override facts (dimension.source = 'manual_override',
      // written by src/lib/admin/manual-overrides.ts) are GOVERNED records:
      // a recompute never deletes them. The computed fact lands underneath
      // and the I2 reader serves the manual fact preferentially.
      await client.query(
        `DELETE FROM public.seller_metric_facts
          WHERE tenant_id = $1::uuid AND seller_id = $2::uuid AND metric_key = $3
            AND measured_at::date = CURRENT_DATE
            AND coalesce(dimension->>'source', '') <> 'manual_override'`,
        [tenantId, sellerId, key],
      );
      await client.query(
        `INSERT INTO public.seller_metric_facts (tenant_id, seller_id, metric_key, value, dimension)
         VALUES ($1::uuid, $2::uuid, $3, $4, '{}'::jsonb)`,
        [tenantId, sellerId, key, value],
      );
      factsWritten += 1;
    }

    // listing_quality KPI snapshot — written ONLY when a recorded
    // health_score population exists (the snapshot is the mean of the
    // listings' recorded health scores, the store's own quality field).
    // No recorded scores → no snapshot: absent, never a fabricated 0.
    if (int(r.listing_quality_n) > 0) {
      await client.query(
        `DELETE FROM public.seller_kpi_snapshots
          WHERE tenant_id = $1::uuid AND seller_id = $2::uuid AND kpi_key = 'listing_quality'
            AND snapshot_date = CURRENT_DATE`,
        [tenantId, sellerId],
      );
      await client.query(
        `INSERT INTO public.seller_kpi_snapshots (tenant_id, seller_id, kpi_key, value, snapshot_date)
         VALUES ($1::uuid, $2::uuid, 'listing_quality', $3, CURRENT_DATE)`,
        [tenantId, sellerId, num(r.listing_quality_avg)],
      );
      snapshotsWritten += 1;
      perSeller[sellerId].listing_quality = num(r.listing_quality_avg);
    }

    // ── Extended writer (§9 analytics facts + §11 KPI snapshots) ──────
    // Every value below is derived in SQL from a named real store; the
    // derivation is recorded on each metric/KPI definition above.
    const OT = ORDER_TOTAL_SQL.replaceAll("total_amount", "o.total_amount");

    // is_late (§11.5) — computed here, from the seller's own delivery
    // promise and the order's real fields only. No promise on record →
    // the UPDATE matches nothing and lateness stays uncomputed.
    await client.query(
      `UPDATE public.seller_orders so
          SET is_late = (
            SELECT CASE
              WHEN o.id IS NULL THEN false
              WHEN o.status = 'cancelled' THEN false
              WHEN (o.fulfillment_status IN ('shipped','in_transit','delivered')
                    OR o.tracking_number IS NOT NULL)
                   AND nullif(o.metadata->>'label_purchased_at','') IS NOT NULL
                THEN (o.metadata->>'label_purchased_at')::timestamptz
                     > o.created_at + (p.promised_days || ' days')::interval
              WHEN o.fulfillment_status IN ('shipped','in_transit','delivered')
                    OR o.tracking_number IS NOT NULL
                THEN false
              ELSE now() > o.created_at + (p.promised_days || ' days')::interval
            END
            FROM (SELECT min(promised_days) AS promised_days
                    FROM public.seller_delivery_promises
                   WHERE tenant_id = $1::uuid AND seller_id = $2::uuid
                     AND promised_days IS NOT NULL) p
            LEFT JOIN public.commerce_orders o ON o.id::text = so.order_id::text
            WHERE p.promised_days IS NOT NULL
          )
        WHERE so.tenant_id = $1::uuid AND so.seller_id = $2::uuid
          AND EXISTS (SELECT 1 FROM public.seller_delivery_promises dp
                       WHERE dp.tenant_id = $1::uuid AND dp.seller_id = $2::uuid
                         AND dp.promised_days IS NOT NULL)
          AND so.order_id IS NOT NULL`,
      [tenantId, sellerId],
    );

    // Sales facts by period (7d / 30d) — attributed commerce_orders.
    for (const days of [7, 30]) {
      const { rows: srows } = await client.query(
        `SELECT count(*)::int AS orders,
                coalesce(sum(${OT}), 0)::numeric AS revenue,
                (SELECT coalesce(sum(oi.quantity), 0)::int
                   FROM public.commerce_order_items oi
                   JOIN public.commerce_orders o2 ON o2.id::text = oi.order_id::text
                  WHERE o2.tenant_id = $1::uuid AND o2.metadata->>'seller_id' = $2
                    AND o2.status <> 'cancelled'
                    AND o2.created_at >= now() - ($3 || ' days')::interval) AS units
           FROM public.commerce_orders o
          WHERE o.tenant_id = $1::uuid AND o.metadata->>'seller_id' = $2
            AND o.status <> 'cancelled'
            AND o.created_at >= now() - ($3 || ' days')::interval`,
        [tenantId, sellerId, String(days)],
      );
      const s = srows[0] ?? {};
      const dim = { period: `${days}d` };
      const orders = int(s.orders);
      const revenue = num(s.revenue);
      await writeFact(client, tenantId, sellerId, "sales_orders_count", orders, dim);
      await writeFact(client, tenantId, sellerId, "sales_revenue", revenue, dim);
      await writeFact(client, tenantId, sellerId, "units_sold", int(s.units), dim);
      factsWritten += 3;
      if (orders > 0) {
        await writeFact(client, tenantId, sellerId, "sales_aov", num(revenue / orders), dim);
        factsWritten += 1;
      }
      if (days === 30) {
        perSeller[sellerId].sales_orders_30d = orders;
        perSeller[sellerId].sales_revenue_30d = revenue;
      }
    }

    // Traffic + conversion facts (§9.2 / §9.3) — the storefront's own
    // analytics_events are the traffic source: view_item / add_to_cart /
    // begin_checkout events carry items[].item_id, attributed to the
    // seller through commerce_catalog_items.metadata.seller_id (the
    // sales attribution). Before this block no writer could produce a
    // fact the Traffic/Conversion pages' needles match, so both pages
    // were permanently empty despite the events flowing.
    {
      const { rows: trows } = await client.query(
        `SELECT
           count(*) FILTER (WHERE e.event_name = 'view_item')::int AS views,
           count(DISTINCT e.session_id) FILTER (WHERE e.event_name = 'view_item')::int AS sessions,
           count(*) FILTER (WHERE e.event_name = 'add_to_cart')::int AS cart_adds,
           count(*) FILTER (WHERE e.event_name = 'begin_checkout')::int AS checkouts
         FROM public.analytics_events e
         WHERE e.created_at >= now() - interval '30 days'
           AND e.event_name IN ('view_item', 'add_to_cart', 'begin_checkout')
           AND EXISTS (
             SELECT 1
               FROM jsonb_array_elements(coalesce(e.event_data->'items', '[]'::jsonb)) it
               JOIN public.commerce_catalog_items ci ON ci.id::text = it->>'item_id'
              WHERE ci.tenant_id = $1::uuid AND ci.metadata->>'seller_id' = $2
           )`,
        [tenantId, sellerId],
      );
      const t = trows[0] ?? {};
      const tdim = { period: "30d" };
      const views = int(t.views);
      await writeFact(client, tenantId, sellerId, "traffic_product_views", views, tdim);
      await writeFact(client, tenantId, sellerId, "traffic_sessions", int(t.sessions), tdim);
      await writeFact(client, tenantId, sellerId, "traffic_cart_adds", int(t.cart_adds), tdim);
      factsWritten += 3;
      if (views > 0) {
        await writeFact(client, tenantId, sellerId, "conversion_cart_rate", num((int(t.cart_adds) / views) * 100), tdim);
        await writeFact(client, tenantId, sellerId, "conversion_checkout_rate", num((int(t.checkouts) / views) * 100), tdim);
        factsWritten += 2;
      }
      perSeller[sellerId].traffic_product_views_30d = views;
    }

    // Regional facts (§11.7) — all-time, grouped by the US state parsed
    // from the order's shipping address. No parseable state → no fact.
    const { rows: regionRows } = await client.query(
      `SELECT region, count(*)::int AS orders, coalesce(sum(${ORDER_TOTAL_SQL}), 0)::numeric AS revenue
         FROM (
           SELECT o.*,
             upper(coalesce(
               CASE WHEN o.shipping_address LIKE '{%'
                    THEN o.shipping_address::jsonb->>'state' END,
               (regexp_match(coalesce(o.shipping_address, ''),
                             ',\\s*([A-Za-z]{2})\\s+\\d{5}'))[1]
             )) AS region
             FROM public.commerce_orders o
            WHERE o.tenant_id = $1::uuid AND o.metadata->>'seller_id' = $2
              AND o.status <> 'cancelled'
         ) s
        WHERE region IS NOT NULL AND region <> ''
        GROUP BY region ORDER BY region`,
      [tenantId, sellerId],
    );
    for (const rr of regionRows) {
      const dim = { region: String(rr.region) };
      await writeFact(client, tenantId, sellerId, "sales_orders_count", int(rr.orders), dim);
      await writeFact(client, tenantId, sellerId, "sales_revenue_by_region", num(rr.revenue), dim);
      factsWritten += 2;
    }

    // Pricing facts — the seller's own listings at their latest price.
    const { rows: prows } = await client.query(
      `SELECT count(*)::int AS priced,
              coalesce(min(p.price), 0)::numeric AS min_cents,
              coalesce(avg(p.price), 0)::numeric AS avg_cents,
              coalesce(max(p.price), 0)::numeric AS max_cents
         FROM public.commerce_catalog_items ci
         JOIN LATERAL (SELECT price FROM public.commerce_prices
                        WHERE catalog_item_id = ci.id
                        ORDER BY valid_from DESC LIMIT 1) p ON true
        WHERE ci.tenant_id = $1::uuid AND ci.metadata->>'seller_id' = $2 AND p.price > 0`,
      [tenantId, sellerId],
    );
    const pr = prows[0] ?? {};
    if (int(pr.priced) > 0) {
      const pdim = { scope: "own_listings" };
      await writeFact(client, tenantId, sellerId, "pricing_priced_listings_count", int(pr.priced), pdim);
      await writeFact(client, tenantId, sellerId, "pricing_min_price", num(int(pr.min_cents) / 100), pdim);
      await writeFact(client, tenantId, sellerId, "pricing_avg_price", num(num(pr.avg_cents) / 100), pdim);
      await writeFact(client, tenantId, sellerId, "pricing_max_price", num(int(pr.max_cents) / 100), pdim);
      factsWritten += 4;
    }

    // Inventory facts — seller_inventory posture + sell-through derived
    // from attributed units sold in the last 30 days (sales query above).
    const { rows: irows } = await client.query(
      `SELECT count(*)::int AS skus,
              coalesce(sum(available), 0)::int AS units_available,
              count(*) FILTER (WHERE available <= 5)::int AS low_stock,
              count(*) FILTER (WHERE available = 0)::int AS out_of_stock,
              (SELECT coalesce(sum(oi.quantity), 0)::int
                 FROM public.commerce_order_items oi
                 JOIN public.commerce_orders o ON o.id::text = oi.order_id::text
                WHERE o.tenant_id = $1::uuid AND o.metadata->>'seller_id' = $2
                  AND o.status <> 'cancelled'
                  AND o.created_at >= now() - interval '30 days') AS units_sold_30d
         FROM public.seller_inventory
        WHERE tenant_id = $1::uuid AND seller_id = $2::uuid`,
      [tenantId, sellerId],
    );
    const inv = irows[0] ?? {};
    const idim = { scope: "seller_inventory" };
    await writeFact(client, tenantId, sellerId, "inventory_skus_count", int(inv.skus), idim);
    await writeFact(client, tenantId, sellerId, "inventory_units_available", int(inv.units_available), idim);
    await writeFact(client, tenantId, sellerId, "inventory_low_stock_count", int(inv.low_stock), idim);
    await writeFact(client, tenantId, sellerId, "inventory_out_of_stock_count", int(inv.out_of_stock), idim);
    factsWritten += 4;
    const sold30 = int(inv.units_sold_30d);
    const avail = int(inv.units_available);
    if (sold30 + avail > 0) {
      await writeFact(client, tenantId, sellerId, "inventory_sell_through_rate", num((sold30 / (sold30 + avail)) * 100), idim);
      factsWritten += 1;
    }
    if (sold30 > 0) {
      await writeFact(client, tenantId, sellerId, "inventory_days_of_supply", num(avail / (sold30 / 30)), idim);
      factsWritten += 1;
    }

    // Carrier facts (§11.6 support) — attributed orders grouped by the
    // carrier recorded on the order itself.
    const { rows: carrierRows } = await client.query(
      `SELECT carrier, count(*)::int AS orders,
              count(*) FILTER (WHERE fulfillment_status = 'delivered' OR status = 'delivered')::int AS delivered
         FROM public.commerce_orders
        WHERE tenant_id = $1::uuid AND metadata->>'seller_id' = $2
          AND carrier IS NOT NULL AND carrier <> ''
        GROUP BY carrier ORDER BY carrier`,
      [tenantId, sellerId],
    );
    for (const cr of carrierRows) {
      const dim = { carrier: String(cr.carrier) };
      await writeFact(client, tenantId, sellerId, "carrier_orders_count", int(cr.orders), dim);
      await writeFact(client, tenantId, sellerId, "carrier_delivered_count", int(cr.delivered), dim);
      factsWritten += 2;
    }

    // KPI snapshots (§11) — rates are written ONLY over a real
    // attributed-order denominator; a 0/0 rate is never fabricated.
    const { rows: krows } = await client.query(
      `SELECT
         (SELECT count(*)::int FROM public.seller_orders
           WHERE tenant_id = $1::uuid AND seller_id = $2::uuid) AS attributed_orders,
         (SELECT count(*)::int FROM public.seller_orders
           WHERE tenant_id = $1::uuid AND seller_id = $2::uuid AND is_late) AS late_orders,
         (SELECT count(*)::int FROM public.seller_return_requests
           WHERE tenant_id = $1::uuid AND seller_id = $2::uuid) AS return_requests,
         (SELECT count(*)::int FROM public.seller_disputes
           WHERE tenant_id = $1::uuid AND seller_id = $2::uuid
             AND (dispute_type ILIKE '%not_received%' OR dispute_type ILIKE '%not-received%'
                  OR dispute_type ILIKE '%item_not%' OR dispute_type ILIKE '%inr%')) AS inr_disputes,
         (SELECT count(*)::int FROM public.seller_delivery_promises
           WHERE tenant_id = $1::uuid AND seller_id = $2::uuid AND promised_days IS NOT NULL) AS promise_rows,
         (SELECT count(*)::int FROM public.commerce_orders
           WHERE tenant_id = $1::uuid AND metadata->>'seller_id' = $2
             AND carrier IS NOT NULL AND carrier <> ''
             AND (fulfillment_status IN ('shipped','in_transit','delivered') OR status = 'delivered')) AS carrier_shipped,
         (SELECT count(*)::int FROM public.commerce_orders
           WHERE tenant_id = $1::uuid AND metadata->>'seller_id' = $2
             AND carrier IS NOT NULL AND carrier <> ''
             AND (fulfillment_status = 'delivered' OR status = 'delivered')) AS carrier_delivered`,
      [tenantId, sellerId],
    );
    const k = krows[0] ?? {};
    const denom = int(k.attributed_orders);
    if (denom > 0) {
      const returnRate = num((int(k.return_requests) / denom) * 100);
      await writeSnapshot(client, tenantId, sellerId, "return_rate", returnRate);
      const inrRate = num((int(k.inr_disputes) / denom) * 100);
      await writeSnapshot(client, tenantId, sellerId, "inr_rate", inrRate);
      snapshotsWritten += 2;
      perSeller[sellerId].return_rate = returnRate;
      perSeller[sellerId].inr_rate = inrRate;
      // Late rate rests on the is_late computation above, which only
      // runs when the seller has a delivery promise on record.
      if (int(k.promise_rows) > 0) {
        const lateRate = num((int(k.late_orders) / denom) * 100);
        await writeSnapshot(client, tenantId, sellerId, "late_shipment_rate", lateRate);
        snapshotsWritten += 1;
        perSeller[sellerId].late_shipment_rate = lateRate;
      }
    }
    // Negative feedback (§11.4) — the count the legacy loop already
    // computes into facts, now ALSO as the KPI snapshot its page reads.
    // A count over a real population: 0 is a true fact.
    const negFb = num(r.negative_feedback_count);
    await writeSnapshot(client, tenantId, sellerId, "negative_feedback", negFb);
    snapshotsWritten += 1;
    perSeller[sellerId].negative_feedback = negFb;
    // Carrier delivery rate (§11.6) — delivered ÷ shipped-or-beyond
    // among attributed orders carrying a carrier.
    if (int(k.carrier_shipped) > 0) {
      const carrierRate = num((int(k.carrier_delivered) / int(k.carrier_shipped)) * 100);
      await writeSnapshot(client, tenantId, sellerId, "carrier_delivery_rate", carrierRate);
      snapshotsWritten += 1;
      perSeller[sellerId].carrier_delivery_rate = carrierRate;
    }
  }
  return { sellersComputed: sellers.length, factsWritten, snapshotsWritten, perSeller };
}

// ── I1 · Platform Metrics (computed at read, derivations labeled) ────────
export async function platformMetrics(client: PgClientLike, tenantId: string) {
  const { rows } = await client.query(
    `SELECT
       (SELECT coalesce(sum(${ORDER_TOTAL_SQL}), 0)::numeric FROM public.commerce_orders
          WHERE tenant_id = $1::uuid AND status <> 'cancelled') AS gmv_all,
       (SELECT coalesce(sum(${ORDER_TOTAL_SQL}), 0)::numeric FROM public.commerce_orders
          WHERE tenant_id = $1::uuid AND status <> 'cancelled' AND created_at >= now() - interval '30 days') AS gmv_30d,
       (SELECT count(*)::int FROM public.commerce_orders WHERE tenant_id = $1::uuid) AS orders_all,
       (SELECT count(*)::int FROM public.commerce_orders WHERE tenant_id = $1::uuid AND created_at >= now() - interval '30 days') AS orders_30d,
       (SELECT coalesce(sum(amount), 0)::numeric FROM public.commerce_payments
          WHERE tenant_id = $1::uuid AND status IN ('succeeded', 'captured')) AS revenue_all,
       (SELECT count(*)::int FROM public.commerce_payments
          WHERE tenant_id = $1::uuid AND status IN ('succeeded', 'captured')) AS revenue_count,
       (SELECT coalesce(sum(amount), 0)::numeric FROM public.commerce_payments
          WHERE tenant_id = $1::uuid AND status IN ('succeeded', 'captured') AND created_at >= now() - interval '30 days') AS revenue_30d,
       (SELECT coalesce(sum(amount), 0)::numeric FROM public.commerce_payments
          WHERE tenant_id = $1::uuid AND status = 'refunded') AS refunds_payments_amount,
       (SELECT count(*)::int FROM public.commerce_payments
          WHERE tenant_id = $1::uuid AND status = 'refunded') AS refunds_payments_count,
       (SELECT coalesce(sum(amount), 0)::numeric FROM public.commerce_refunds
          WHERE tenant_id = $1::uuid AND status = 'completed') AS refunds_records_amount,
       (SELECT count(*)::int FROM public.commerce_refunds
          WHERE tenant_id = $1::uuid AND status = 'completed') AS refunds_records_count,
       (SELECT count(*)::int FROM public.commerce_refunds WHERE tenant_id = $1::uuid) AS refunds_records_all,
       (SELECT count(*)::int FROM public.customer_return_requests WHERE tenant_id = $1::uuid) AS returns_customer,
       (SELECT count(*)::int FROM public.customer_return_requests WHERE tenant_id IS NULL) AS returns_customer_untenanted,
       (SELECT count(*)::int FROM public.erp_return_authorizations WHERE tenant_id = $1::uuid) AS returns_rma,
       (SELECT count(*)::int FROM public.seller_return_requests WHERE tenant_id = $1::uuid) AS returns_seller`,
    [tenantId],
  );
  const t = rows[0] ?? {};
  const { rows: byStatus } = await client.query(
    `SELECT status, count(*)::int AS n FROM public.commerce_orders WHERE tenant_id = $1::uuid GROUP BY 1 ORDER BY 1`,
    [tenantId],
  );
  return {
    gmv: {
      allTime: num(t.gmv_all),
      last30d: num(t.gmv_30d),
      derivation: "Sum of commerce_orders totals (text totals parsed) over non-cancelled orders. All 12 live orders are payment_status 'unpaid' — this is order value placed, not cash collected.",
    },
    orders: {
      allTime: int(t.orders_all),
      last30d: int(t.orders_30d),
      byStatus: byStatus.map((r) => ({ status: String(r.status), count: int(r.n) })),
      derivation: "Count of commerce_orders rows for the tenant.",
    },
    returns: {
      total: int(t.returns_customer) + int(t.returns_rma) + int(t.returns_seller),
      customerRequests: int(t.returns_customer),
      customerRequestsUntenanted: int(t.returns_customer_untenanted),
      rmaAuthorizations: int(t.returns_rma),
      sellerRequests: int(t.returns_seller),
      derivation: "Recorded return records across the three designed stores (customer_return_requests + erp_return_authorizations + seller_return_requests), each named; untenanted customer filings (tenant_id NULL, as the store allows) are counted separately, never folded in silently.",
    },
    refunds: {
      recordsCompletedAmount: num(t.refunds_records_amount),
      recordsCompletedCount: int(t.refunds_records_count),
      recordsAllCount: int(t.refunds_records_all),
      paymentsRefundedAmount: num(t.refunds_payments_amount),
      paymentsRefundedCount: int(t.refunds_payments_count),
      derivation: "Two recording legs, shown separately and never summed: commerce_refunds records (the refund register) and commerce_payments rows in 'refunded' status (the payment spine's own mark).",
    },
    revenue: {
      allTime: num(t.revenue_all),
      last30d: num(t.revenue_30d),
      paymentCount: int(t.revenue_count),
      derivation: "Sum of commerce_payments in 'succeeded'/'captured' status — the same reading /api/admin/reports has always run.",
    },
  };
}

// ── I3 · Customer Analytics (computed at read, derivations labeled) ──────
export async function customerAnalytics(client: PgClientLike, tenantId: string) {
  const { rows: cohorts } = await client.query(
    `SELECT to_char(date_trunc('month', c.created_at), 'YYYY-MM') AS cohort,
            count(*)::int AS customers,
            count(*) FILTER (WHERE a.customer_id IS NOT NULL)::int AS with_appointments,
            count(*) FILTER (WHERE o.customer_id IS NOT NULL)::int AS with_orders
       FROM public.crm_customers c
       LEFT JOIN (SELECT DISTINCT customer_id FROM public.crm_appointments WHERE tenant_id = $1::uuid) a
         ON a.customer_id = c.id
       LEFT JOIN (SELECT DISTINCT customer_id::uuid AS customer_id FROM public.commerce_orders
                   WHERE tenant_id = $1::uuid AND customer_id ~ '^[0-9a-fA-F-]{36}$') o
         ON o.customer_id = c.id
      WHERE c.tenant_id = $1::uuid
      GROUP BY 1 ORDER BY 1`,
    [tenantId],
  );
  const { rows: ltvRows } = await client.query(
    `SELECT count(*)::int AS customers,
            coalesce(sum(lifetime_value), 0)::numeric AS recorded_ltv_sum,
            coalesce(avg(lifetime_value), 0)::numeric AS recorded_ltv_avg,
            count(*) FILTER (WHERE coalesce(lifetime_value, 0) > 0)::int AS recorded_ltv_positive
       FROM public.crm_customers WHERE tenant_id = $1::uuid`,
    [tenantId],
  );
  // Computed LTV leg: spend on orders whose customer_id links to a CRM
  // customer (3 of 12 live orders carry such a link — stated on the face).
  const { rows: computed } = await client.query(
    `SELECT c.id::text AS customer_id,
            trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) AS name,
            count(o.id)::int AS orders,
            coalesce(sum(${ORDER_TOTAL_SQL.replaceAll("total_amount", "o.total_amount")}), 0)::numeric AS spend
       FROM public.crm_customers c
       JOIN public.commerce_orders o
         ON o.tenant_id = $1::uuid AND o.customer_id ~ '^[0-9a-fA-F-]{36}$' AND o.customer_id::uuid = c.id
      WHERE c.tenant_id = $1::uuid
      GROUP BY 1, 2 ORDER BY spend DESC LIMIT 25`,
    [tenantId],
  );
  const { rows: linkRows } = await client.query(
    `SELECT count(*)::int AS orders_total,
            count(*) FILTER (WHERE customer_id ~ '^[0-9a-fA-F-]{36}$'
              AND customer_id::uuid IN (SELECT id FROM public.crm_customers WHERE tenant_id = $1::uuid))::int AS orders_linked
       FROM public.commerce_orders WHERE tenant_id = $1::uuid`,
    [tenantId],
  );
  // Churn — the plain reading of the name, derivation labeled on the
  // face: a customer counts as churned when they HAVE recorded activity
  // (an appointment or a linked order) but none in the last 90 days.
  // last_activity_at / lifetime_value on crm_customers are recorded by
  // the CRM metrics machinery but hold no values in substance today
  // (last_activity_at is NULL on all 23; recorded LTV sums to 0.00), so
  // activity is derived from the underlying records, never from the
  // empty recorded fields.
  const { rows: churnRows } = await client.query(
    `WITH activity AS (
       SELECT c.id,
              GREATEST(
                (SELECT max(a.starts_at) FROM public.crm_appointments a
                  WHERE a.tenant_id = $1::uuid AND a.customer_id = c.id),
                (SELECT max(o.created_at) FROM public.commerce_orders o
                  WHERE o.tenant_id = $1::uuid AND o.customer_id ~ '^[0-9a-fA-F-]{36}$'
                    AND o.customer_id::uuid = c.id)
              ) AS last_activity
         FROM public.crm_customers c WHERE c.tenant_id = $1::uuid
     )
     SELECT count(*)::int AS customers,
            count(*) FILTER (WHERE last_activity IS NOT NULL)::int AS ever_active,
            count(*) FILTER (WHERE last_activity IS NULL)::int AS never_active,
            count(*) FILTER (WHERE last_activity < now() - interval '90 days')::int AS churned_90d,
            count(*) FILTER (WHERE last_activity >= now() - interval '90 days')::int AS active_90d
       FROM activity`,
    [tenantId],
  );
  const ltv = ltvRows[0] ?? {};
  const churn = churnRows[0] ?? {};
  const link = linkRows[0] ?? {};
  return {
    cohorts: cohorts.map((r) => ({
      cohort: String(r.cohort),
      customers: int(r.customers),
      withAppointments: int(r.with_appointments),
      withOrders: int(r.with_orders),
    })),
    cohortDerivation: "Cohort = the calendar month of the customer's crm_customers.created_at. Activity flags ride real records: crm_appointments.customer_id and commerce_orders whose customer_id links to the CRM record.",
    lifetimeValue: {
      recordedSum: num(ltv.recorded_ltv_sum),
      recordedAvg: num(ltv.recorded_ltv_avg),
      recordedPositiveCustomers: int(ltv.recorded_ltv_positive),
      customers: int(ltv.customers),
      computedFromLinkedOrders: computed.map((r) => ({
        customerId: String(r.customer_id),
        name: String(r.name || ""),
        orders: int(r.orders),
        spend: num(r.spend),
      })),
      ordersLinked: int(link.orders_linked),
      ordersTotal: int(link.orders_total),
      derivation: "Two legs, never blended: RECORDED lifetime_value on crm_customers (maintained by the CRM customer-metrics machinery — today it sums to 0.00 across all 23 customers, i.e. recorded but unpopulated in substance) and COMPUTED spend over commerce_orders whose customer_id links to a CRM customer (only a minority of orders carry the link — the counts are stated).",
    },
    churn: {
      customers: int(churn.customers),
      everActive: int(churn.ever_active),
      neverActive: int(churn.never_active),
      activeLast90d: int(churn.active_90d),
      churned90d: int(churn.churned_90d),
      derivation: "Last activity = the later of the customer's most recent crm_appointments.starts_at and most recent linked commerce_orders.created_at. Churned = has activity, but none in the last 90 days. Customers with no recorded activity at all are counted separately as never-active, never silently folded into churn.",
    },
    searchBehavior: (await searchStats(client, tenantId)) ?? {
      recorded: false,
      derivation: "The search-event store (public.search_events, migration 20261090) is not queryable yet, so no figures are served. Once it is live, this leaf reports the searches the header search itself records — never invented numbers.",
    },
  };
}

// ── I4 · Explorer governance ──────────────────────────────────────────────
// The governed reporting set the query builder offers. Credential and
// secret stores are excluded ENTIRELY (named in the governance panel):
// tenant_stripe_accounts, franchise_email_settings. The explorer itself
// runs under a read-only transaction with a statement timeout and a row
// cap (enforced in the route), and every run is audit-logged.
export const BUILDER_TABLES = [
  "commerce_orders",
  "commerce_order_items",
  "commerce_payments",
  "commerce_refunds",
  "customer_return_requests",
  "erp_return_authorizations",
  "seller_listings",
  "sellers",
  "seller_disputes",
  "seller_refunds",
  "seller_violations",
  "seller_kpi_snapshots",
  "seller_metric_facts",
  "crm_customers",
  "crm_appointments",
  "acct_ar_invoices",
  "acct_journal_entries",
  "reviews",
  "analytics_events",
] as const;

export const EXPLORER_ROW_CAP = 500;
export const EXPLORER_TIMEOUT_MS = 5000;

const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|execute|call|do|merge|replace|vacuum|analyze|reindex|comment|lock|set|reset|begin|commit|rollback|savepoint|prepare|listen|notify|unlisten|discard|load|import|security|definer)\b/i;

/** Conservative single-statement SELECT gate for the explorer. Returns
 *  the cleaned SQL or an error string. The database ALSO enforces
 *  read-only (the route runs inside SET TRANSACTION READ ONLY), so this
 *  is the first of two walls, never the only one. */
export function validateExplorerSql(raw: string): { sql?: string; error?: string } {
  let sql = (raw ?? "").trim();
  if (!sql) return { error: "SQL is required" };
  if (sql.length > 8000) return { error: "SQL exceeds the 8000-character explorer limit" };
  if (sql.endsWith(";")) sql = sql.slice(0, -1).trim();
  if (sql.includes(";")) return { error: "One statement at a time — remove the semicolon" };
  if (!/^(select|with)\b/i.test(sql)) return { error: "Explorer queries must be SELECT (or WITH … SELECT) statements" };
  const m = sql.match(FORBIDDEN);
  if (m) return { error: `Explorer queries are read-only — '${m[0]}' is not permitted` };
  if (/\bpg_sleep\b/i.test(sql)) return { error: "pg_sleep is not permitted in the explorer" };
  return { sql };
}
