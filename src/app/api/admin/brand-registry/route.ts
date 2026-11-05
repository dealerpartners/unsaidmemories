import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"

export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// B4 Brand Registry — the registry list (Admin tree §B4; data graph
// contract: B4 writes Brand Registry status to the Seller Portal, reads to
// the Customer Portal). Firsthand census, 2026-10-14:
//
// THE REGISTRY IS public.brands (401 rows, all on the master tenant, ALL
// status 'draft', RLS DISABLED with 0 policies — isolation is app-level,
// hence the tenant predicate in every statement below). Columns read live:
// id, tenant_id (FK tenants, CASCADE), name, slug, description, logo_url,
// website, pricing_tier (CHECK value|mid|premium|luxury), owner_seller_id
// (FK sellers; populated on 0 rows), status (CHECK draft|published|
// suspended, default 'draft'), published_at, product_count,
// wholesale_confirmed, created_at, updated_at. UNIQUE (tenant_id, slug).
// Triggers: brand_before (slugify + numeric-suffix dedupe; publishing
// REQUIRES the description AND brand_supply_ok() — an approved purchase
// order or an authorized marketplace seller — and stamps published_at),
// brand_after (slug rename writes route_redirects), touch_brands.
//
// The legacy /api/admin/brands CRUD is NOT this registry: it operates on
// public.commerce_brands (1 row — the shop's brand logo/sort store). It is
// left exactly as it stands.
//
// brands.product_count is uniformly 0 across all 401 rows — no writer
// maintains it, so it is NEVER served as fact here. The footprint below is
// computed live, attributed by exact brand-NAME text: neither
// seller_listings nor commerce_catalog_items carries a brand_id — `brand`
// is a text column on both (that text is the attribution B1 reads). 390 of
// 401 registry names match at least one catalog item exactly; the registry
// also carries duplicate names (337 distinct lower(name) over 401 rows —
// e.g. two "KONG" rows), and duplicates share the name-attributed
// footprint. Both facts are stated on the surface, not hidden.
//
// AUTHORIZATIONS: seller_brand_authorizations (0 rows; NO tenant_id —
// tenancy flows through the sellers/brands rows, the M2 join discipline).
// Decisions on authorization rows are M2's seat (/admin/sellers/
// verification) — this surface READS the population per brand and links
// there; it never writes an authorization row. (It also never deletes or
// revokes one: the revalidate_brand trigger family references dropped
// tables, so authorization DELETEs and revokes-from-approved fail 42P01
// until Sunny rules on the repoint — cleanup ledger.)
//
// ⭐ BRAND OPT-OUT (Sunny, 2026-10-14): the opt-out list is ESTABLISHED.
// The store public.brand_opt_outs is LIVE (migration 20261060; Sunny
// approved the proposal, the parent applied the DDL; firsthand-verified
// 2026-10-14: brand FK, strength CHECK by_approval|ever, status CHECK
// filed|verified|applied|rejected|withdrawn, partial UNIQUE — one
// applied opt-out per (tenant, brand); RLS enabled, zero policies, so
// the tenant predicate rides every statement as with brands itself).
// Claims are recorded by the public intake (/brand-opt-out) in 'filed'
// state when the claimed brand resolves against this registry, decided
// at the claims queue (/api/admin/brand-registry/opt-outs), and an
// APPLIED opt-out is enforced at the seller brand gate — above every
// seller_brand_authorizations row. Per brand below, optOut.applied
// carries the applied strength; optOut.pending counts claims in
// verification (filed/verified). A filed claim is NOT an applied block.
// ---------------------------------------------------------------------------

type RegistryRow = {
  id: string
  name: string
  slug: string
  status: string
  pricing_tier: string | null
  wholesale_confirmed: boolean | null
  website: string | null
  logo_url: string | null
  owner_seller_id: string | null
  published_at: string | null
  created_at: string
  updated_at: string
  auth_total: number
  auth_pending: number
  auth_approved: number
  auth_rejected: number
  auth_expired: number
  listing_count: number
  catalog_count: number
  oo_applied_strength: string | null
  oo_pending: number
  oo_total: number
}

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read")
  if (denied) return denied
  const tenant = resolveTenantId(req)
  const sp = req.nextUrl.searchParams
  const status = (sp.get("status") || "").trim()
  const q = (sp.get("q") || "").trim()

  const out = await withPg(async (c) => {
    // Footprint aggregates are computed as grouped scans joined onto the
    // brand rows — there is no (tenant_id, brand) index on the catalog
    // table, so per-row correlated counts would seq-scan it once per
    // brand (401 scans); the grouped shape scans each store once.
    const { rows } = await c.query(
      `WITH cat AS (
         SELECT brand, count(*)::int AS n FROM public.commerce_catalog_items
          WHERE tenant_id = $1 GROUP BY brand
       ),
       lst AS (
         SELECT brand, count(*)::int AS n FROM public.seller_listings
          WHERE tenant_id = $1 GROUP BY brand
       ),
       auth AS (
         SELECT brand_id,
                count(*)::int AS total,
                count(*) FILTER (WHERE status = 'pending')::int AS pending,
                count(*) FILTER (WHERE status = 'approved')::int AS approved,
                count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
                count(*) FILTER (WHERE status = 'expired')::int AS expired
           FROM public.seller_brand_authorizations GROUP BY brand_id
       ),
       oo AS (
         SELECT brand_id,
                (array_agg(strength) FILTER (WHERE status = 'applied'))[1]
                  AS applied_strength,
                count(*) FILTER (WHERE status IN ('filed', 'verified'))::int
                  AS pending,
                count(*)::int AS total
           FROM public.brand_opt_outs
          WHERE tenant_id = $1 GROUP BY brand_id
       )
       SELECT b.id::text AS id, b.name, b.slug, b.status, b.pricing_tier,
              b.wholesale_confirmed, b.website, b.logo_url,
              b.owner_seller_id::text AS owner_seller_id,
              b.published_at::text AS published_at,
              b.created_at::text AS created_at, b.updated_at::text AS updated_at,
              COALESCE(auth.total, 0) AS auth_total,
              COALESCE(auth.pending, 0) AS auth_pending,
              COALESCE(auth.approved, 0) AS auth_approved,
              COALESCE(auth.rejected, 0) AS auth_rejected,
              COALESCE(auth.expired, 0) AS auth_expired,
              COALESCE(lst.n, 0) AS listing_count,
              COALESCE(cat.n, 0) AS catalog_count,
              oo.applied_strength AS oo_applied_strength,
              COALESCE(oo.pending, 0) AS oo_pending,
              COALESCE(oo.total, 0) AS oo_total
         FROM public.brands b
         LEFT JOIN cat ON cat.brand = b.name
         LEFT JOIN lst ON lst.brand = b.name
         LEFT JOIN auth ON auth.brand_id = b.id
         LEFT JOIN oo ON oo.brand_id = b.id
        WHERE b.tenant_id = $1
          AND ($2 = '' OR b.status = $2)
          AND ($3 = '' OR b.name ILIKE '%' || $3 || '%' OR b.slug ILIKE '%' || $3 || '%')
        ORDER BY b.name ASC, b.slug ASC
        LIMIT 500`,
      [tenant, status, q],
    )
    const totals = await c.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'draft')::int AS draft,
              count(*) FILTER (WHERE status = 'published')::int AS published,
              count(*) FILTER (WHERE status = 'suspended')::int AS suspended,
              count(DISTINCT lower(name))::int AS distinct_names
         FROM public.brands WHERE tenant_id = $1`,
      [tenant],
    )
    const t = totals.rows[0] as {
      total: number; draft: number; published: number; suspended: number; distinct_names: number
    }
    const claimCountsRes = await c.query(
      `SELECT status, count(*)::int AS n FROM public.brand_opt_outs
        WHERE tenant_id = $1 GROUP BY status`,
      [tenant],
    )
    const claimCounts: Record<string, number> = {
      filed: 0, verified: 0, applied: 0, rejected: 0, withdrawn: 0,
    }
    for (const r of claimCountsRes.rows as { status: string; n: number }[]) {
      claimCounts[r.status] = Number(r.n)
    }
    return {
      rows: (rows as RegistryRow[]).map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        status: r.status,
        pricingTier: r.pricing_tier,
        wholesaleConfirmed: r.wholesale_confirmed ?? false,
        website: r.website,
        logoUrl: r.logo_url,
        ownerSellerId: r.owner_seller_id,
        publishedAt: r.published_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        authorizations: {
          total: Number(r.auth_total),
          pending: Number(r.auth_pending),
          approved: Number(r.auth_approved),
          rejected: Number(r.auth_rejected),
          expired: Number(r.auth_expired),
        },
        footprint: {
          listings: Number(r.listing_count),
          catalogItems: Number(r.catalog_count),
        },
        // The recorded opt-out state for this brand (see header):
        // applied strength when an opt-out stands, pending claims in
        // verification, and the total claims ever recorded. Read from
        // public.brand_opt_outs — never synthesized.
        optOut: {
          applied: r.oo_applied_strength != null,
          strength: r.oo_applied_strength ?? null,
          pending: Number(r.oo_pending),
          recorded: Number(r.oo_total),
        },
      })),
      summary: {
        total: Number(t.total),
        byStatus: {
          draft: Number(t.draft),
          published: Number(t.published),
          suspended: Number(t.suspended),
        },
        distinctNames: Number(t.distinct_names),
        duplicateNames: Number(t.total) - Number(t.distinct_names),
      },
      optOut: {
        established: true,
        counts: claimCounts,
        note:
          "The brand opt-out list is established: claims filed on the public page (/brand-opt-out) are recorded in the registry, verified by the platform team, and applied opt-outs are enforced at the seller brand gate — an applied opt-out outranks every seller brand authorization for the brand. A filed claim is not an applied block until it is verified and applied in the claims queue.",
      },
      note:
        rows.length === 0
          ? "No brands in this tenant match. The registry holds the brands sellers declare against at onboarding; authorizations are decided at the verification desk."
          : null,
    }
  })

  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  return NextResponse.json(out)
}
