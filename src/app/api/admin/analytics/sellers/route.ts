import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";
import {
  ensureAnalyticsDefinitions,
  computeSellerMetrics,
  KPI_DEFINITIONS,
  METRIC_DEFINITIONS,
} from "@/lib/analytics/platform";
import { searchStats } from "@/lib/analytics/search-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// /api/admin/analytics/sellers — Admin tree I2 · SELLER ANALYTICS (Seller
// KPIs · Category performance · Listing quality · Search performance) +
// the A4 KPI machinery the Connect build named as its follow-on.
//
// GET  — definitions (configuration, seeded from Sunny's text on first
//        read — check-then-insert per key, PK-only stores), the recorded
//        facts + snapshots per seller, category performance computed from
//        seller_listings, listing quality from the listings' recorded
//        health_score + the KPI snapshots, and Search performance read
//        from public.search_events (the store the header search records
//        into — migration 20261100; stated absence only until it lands).
// POST {action:"compute"} — the writer run: recomputes the computable
//        metric facts + KPI snapshots from real rows
//        (idempotent per day — a rerun replaces that day's rows), audited
//        via writeSellerAudit as analytics.kpi_compute. The tree-named
//        RATE KPIs (return_rate, inr_rate, late_shipment_rate) are now
//        computed as snapshots over the seller_orders attribution bridge
//        (writer: src/lib/sellers/attribution.ts) — only when a seller's
//        attributed-order denominator is > 0, so a rate is still never
//        written as a fabricated 0/0. The same compute also runs
//        seller-side via POST /api/seller/analytics {action:"compute"}
//        scoped to the signed-in seller.
//        The writer NEVER touches seller_capabilities.pro_tier — no
//        delivered text makes a computed KPI assign a payout tier, so
//        the payout-delay derivation keeps resolving from the
//        admin-assigned tier record exactly as before.
//
// Gates: 'reports' read/write — the gate the existing analytics routes
// use (/api/admin/reports, /api/admin/analytics/actions).
// ============================================================================

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const int = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
};

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("reports", "read");
  if (gate) return gate;
  const tenant = resolveTenantId(req);

  const result = await withPg(async (client) => {
    const seeded = await ensureAnalyticsDefinitions(client, tenant);

    const kpiDefs = await client.query(
      `SELECT key, name, unit, target, threshold FROM public.seller_kpi_definitions
        WHERE tenant_id = $1::uuid ORDER BY key`,
      [tenant],
    );
    const metricDefs = await client.query(
      `SELECT key, name, formula, unit FROM public.seller_metric_definitions
        WHERE tenant_id = $1::uuid ORDER BY key`,
      [tenant],
    );
    const sellers = await client.query(
      `SELECT id::text AS id, display_name, legal_name, status, seller_type
         FROM public.sellers WHERE tenant_id = $1::uuid ORDER BY created_at`,
      [tenant],
    );
    // Latest fact per (seller, metric_key) — with one governed exception:
    // a K2 manual-override fact (dimension.source = 'manual_override')
    // outranks computed facts for its key regardless of age, so an
    // override stands until it is itself superseded by a newer override.
    const facts = await client.query(
      `SELECT seller_id, metric_key, value, measured_at, is_override
         FROM (
           SELECT DISTINCT ON (seller_id, metric_key)
                  seller_id::text AS seller_id, metric_key, value, measured_at,
                  (dimension->>'source' = 'manual_override') AS is_override
             FROM public.seller_metric_facts
            WHERE tenant_id = $1::uuid
            ORDER BY seller_id, metric_key,
                     (dimension->>'source' = 'manual_override') DESC,
                     measured_at DESC
         ) latest
        ORDER BY seller_id, metric_key`,
      [tenant],
    );
    const snapshots = await client.query(
      `SELECT seller_id::text AS seller_id, kpi_key, value, snapshot_date
         FROM public.seller_kpi_snapshots
        WHERE tenant_id = $1::uuid
          AND snapshot_date = (SELECT max(snapshot_date) FROM public.seller_kpi_snapshots s2
                                WHERE s2.tenant_id = $1::uuid AND s2.seller_id = seller_kpi_snapshots.seller_id
                                  AND s2.kpi_key = seller_kpi_snapshots.kpi_key)
        ORDER BY seller_id, kpi_key`,
      [tenant],
    );
    // Category performance — the seller's listings grouped by their
    // recorded category (seller_listings.category_id carries no FK; the
    // name resolves against the canonical taxonomy where it can).
    const categories = await client.query(
      `SELECT l.category_id::text AS category_id,
              t.name AS category_name,
              count(*)::int AS listings,
              count(*) FILTER (WHERE l.status = 'approved')::int AS approved,
              coalesce(avg(l.price), 0)::numeric AS avg_price
         FROM public.seller_listings l
         LEFT JOIN public.taxonomy_nodes t ON t.id = l.category_id
        WHERE l.tenant_id = $1::uuid
        GROUP BY 1, 2 ORDER BY listings DESC`,
      [tenant],
    );
    // Listing quality — the listings' own recorded health_score field,
    // per seller: how many carry a recorded score, and their mean.
    const quality = await client.query(
      `SELECT seller_id::text AS seller_id,
              count(*)::int AS listings,
              count(health_score)::int AS with_recorded_score,
              avg(health_score)::numeric AS mean_recorded_score
         FROM public.seller_listings WHERE tenant_id = $1::uuid GROUP BY 1`,
      [tenant],
    );
    const tiers = await client.query(
      `SELECT seller_id::text AS seller_id, pro_tier, is_pro, status
         FROM public.seller_capabilities WHERE tenant_id = $1::uuid`,
      [tenant],
    );
    const search = await searchStats(client, tenant);
    return { seeded, kpiDefs: kpiDefs.rows, metricDefs: metricDefs.rows, sellers: sellers.rows, facts: facts.rows, snapshots: snapshots.rows, categories: categories.rows, quality: quality.rows, tiers: tiers.rows, search };
  });

  if (!result) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const factsBySeller = new Map<string, Record<string, { value: number; measuredAt: unknown; overridden: boolean }>>();
  for (const f of result.facts) {
    const sid = String(f.seller_id);
    if (!factsBySeller.has(sid)) factsBySeller.set(sid, {});
    factsBySeller.get(sid)![String(f.metric_key)] = {
      value: num(f.value),
      measuredAt: f.measured_at,
      overridden: Boolean((f as any).is_override),
    };
  }
  const snapsBySeller = new Map<string, Record<string, { value: number; date: unknown }>>();
  for (const s of result.snapshots) {
    const sid = String(s.seller_id);
    if (!snapsBySeller.has(sid)) snapsBySeller.set(sid, {});
    snapsBySeller.get(sid)![String(s.kpi_key)] = { value: num(s.value), date: s.snapshot_date };
  }
  const qualityBySeller = new Map(result.quality.map((q) => [String(q.seller_id), q]));
  const tierBySeller = new Map(result.tiers.map((t) => [String(t.seller_id), t]));

  const notComputable = METRIC_DEFINITIONS.filter((d) => !d.computable).map((d) => d.key);

  return NextResponse.json({
    section: "I2",
    tenant,
    seededConfiguration: result.seeded,
    kpiDefinitions: result.kpiDefs.map((d) => ({
      key: String(d.key), name: d.name, unit: d.unit,
      target: d.target === null ? null : num(d.target),
      threshold: d.threshold === null ? null : num(d.threshold),
    })),
    metricDefinitions: result.metricDefs.map((d) => ({ key: String(d.key), name: d.name, formula: d.formula, unit: d.unit })),
    definitionNote: "Definitions are CONFIGURATION seeded from Sunny's text (the original tree's seller performance pages + catalog quality leaf). Targets/thresholds stay NULL — no delivered text names a number for any KPI. Facts and snapshots are computed by the writer run or absent — never seeded.",
    sellers: result.sellers.map((s) => {
      const sid = String(s.id);
      const q = qualityBySeller.get(sid) as
        | { listings?: unknown; with_recorded_score?: unknown; mean_recorded_score?: unknown }
        | undefined;
      const tier = tierBySeller.get(sid) as { pro_tier?: unknown } | undefined;
      return {
        id: sid,
        name: s.display_name ?? s.legal_name ?? null,
        status: s.status,
        sellerType: s.seller_type,
        facts: factsBySeller.get(sid) ?? {},
        kpiSnapshots: snapsBySeller.get(sid) ?? {},
        listingQuality: {
          listings: q ? int(q.listings) : 0,
          withRecordedScore: q ? int(q.with_recorded_score) : 0,
          meanRecordedScore: q && q.mean_recorded_score !== null ? num(q.mean_recorded_score) : null,
          derivation: "Mean of seller_listings.health_score where a score is recorded. The KPI snapshot (listing_quality) is written by the compute run only when at least one listing carries a recorded score.",
        },
        payoutTier: {
          proTier: tier ? (tier.pro_tier ?? null) : null,
          recorded: Boolean(tier),
          note: "The tier the payout-delay derivation reads (seller_capabilities.pro_tier) — an admin-assigned record. The KPI machinery does not assign tiers; no delivered text defines a score→tier mapping.",
        },
      };
    }),
    categoryPerformance: {
      rows: result.categories.map((c) => ({
        categoryId: c.category_id ?? null,
        categoryName: c.category_name ?? (c.category_id ? null : "Uncategorized"),
        listings: int(c.listings),
        approved: int(c.approved),
        avgPrice: num(c.avg_price),
      })),
      derivation: "The tenant's seller_listings grouped by their recorded category_id (the column carries no FK; names resolve against taxonomy_nodes where the id matches). Order/GMV performance by category is not computable — orders carry no seller or listing attribution.",
    },
    searchPerformance: result.search ?? {
      recorded: false,
      derivation: "The search-event store (public.search_events, migration 20261100) is not queryable yet, so no figures are served. Once it is live, this leaf reports the searches the header search itself records — never invented numbers.",
    },
    notComputableMetrics: notComputable,
    kpiDefinitionKeys: KPI_DEFINITIONS.map((d) => d.key),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("reports", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.action !== "compute") {
    return NextResponse.json({ error: "action must be 'compute'" }, { status: 400 });
  }
  const actorId = await getActorIdFromRequest(req);

  const result = await withPg(async (client) => {
    const seeded = await ensureAnalyticsDefinitions(client, tenant);
    const computed = await computeSellerMetrics(client, tenant);
    await writeSellerAudit(client, {
      tenantId: tenant,
      sellerId: null,
      actorId,
      actorType: "staff",
      action: "analytics.kpi_compute",
      entityType: "seller_kpi",
      entityId: null,
      afterState: {
        sellersComputed: computed.sellersComputed,
        factsWritten: computed.factsWritten,
        snapshotsWritten: computed.snapshotsWritten,
        seededConfiguration: seeded,
      },
      ipAddress: requestIp(req),
    });
    return { seeded, computed };
  });

  if (!result) return NextResponse.json({ error: "Compute failed" }, { status: 503 });
  return NextResponse.json({ ok: true, section: "I2", tenant, ...result.computed, seededConfiguration: result.seeded });
}
