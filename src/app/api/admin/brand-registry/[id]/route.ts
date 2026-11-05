import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"

export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// B4 Brand Registry — one brand's detail (Admin tree §B4). Read-only by
// design: authorization DECISIONS are M2's seat (/admin/sellers/
// verification, which stamps reviewed_by/reviewed_at and notifies the
// seller on rejection); this face shows the brand's full recorded state —
// registry fields, its authorization population with the sellers holding
// them, and its live listing footprint — so a reviewer deciding at M2 or
// verifying an opt-out claim works from the whole record.
//
// Footprint attribution is exact brand-NAME text (seller_listings.brand /
// commerce_catalog_items.brand — neither store carries a brand_id; see the
// list route's header census). Duplicate registry names share the
// name-attributed footprint; the response names that when it applies.
//
// Opt-out: the store public.brand_opt_outs is LIVE (migration 20261060),
// so the optOut block serves this brand's REAL recorded claims — every
// state, newest first — and the recorded standing derived from them
// (applied / in verification / closed / none). Claims are recorded by the
// public /brand-opt-out intake and decided at the claims queue
// (/api/admin/brand-registry/opt-outs); an applied claim is enforced at
// the seller brand gate, above this brand's authorizations.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await requireModuleApi("sellers", "read")
  if (denied) return denied
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid brand id" }, { status: 400 })
  }
  const tenant = resolveTenantId(req)

  const out = await withPg(async (c) => {
    const brandRes = await c.query(
      `SELECT id::text AS id, tenant_id::text AS tenant_id, name, slug,
              description, logo_url, website, pricing_tier, wholesale_confirmed,
              owner_seller_id::text AS owner_seller_id, status,
              published_at::text AS published_at,
              created_at::text AS created_at, updated_at::text AS updated_at
         FROM public.brands
        WHERE id = $1::uuid AND tenant_id = $2`,
      [id, tenant],
    )
    const brand = brandRes.rows[0] as Record<string, unknown> | undefined
    if (!brand) return { notFound: true as const }

    const name = String(brand.name)

    const authRes = await c.query(
      `SELECT a.id::text AS id, a.seller_id::text AS seller_id,
              s.display_name AS seller_name, s.status AS seller_status,
              s.seller_type AS seller_type,
              a.authorization_type, a.evidence_url, a.status,
              a.valid_from::text AS valid_from, a.valid_until::text AS valid_until,
              a.reviewed_by, a.reviewed_at::text AS reviewed_at,
              a.created_at::text AS created_at
         FROM public.seller_brand_authorizations a
         JOIN public.sellers s ON s.id = a.seller_id AND s.tenant_id = $2
        WHERE a.brand_id = $1::uuid
        ORDER BY a.created_at DESC`,
      [id, tenant],
    )

    const listingRes = await c.query(
      `SELECT l.id::text AS id, l.title, l.sku, l.status, l.suppression_reason,
              l.seller_id::text AS seller_id, s.display_name AS seller_name,
              l.created_at::text AS created_at
         FROM public.seller_listings l
         JOIN public.sellers s ON s.id = l.seller_id AND s.tenant_id = l.tenant_id
        WHERE l.tenant_id = $2 AND l.brand = $1
        ORDER BY l.created_at DESC
        LIMIT 100`,
      [name, tenant],
    )

    const catalogCountRes = await c.query(
      `SELECT count(*)::int AS n FROM public.commerce_catalog_items
        WHERE tenant_id = $2 AND brand = $1`,
      [name, tenant],
    )
    const catalogSampleRes = await c.query(
      `SELECT name, sku, active FROM public.commerce_catalog_items
        WHERE tenant_id = $2 AND brand = $1
        ORDER BY name ASC
        LIMIT 10`,
      [name, tenant],
    )

    const dupRes = await c.query(
      `SELECT count(*)::int AS n FROM public.brands
        WHERE tenant_id = $2 AND lower(name) = lower($1)`,
      [name, tenant],
    )
    const sameName = Number((dupRes.rows[0] as { n: number }).n)

    const claimsRes = await c.query(
      `SELECT id::text AS id, strength, status, claimant_name,
              claimant_email, claimant_company, is_agent, represented_owner,
              trademark_registration, attestation_authority,
              attestation_accuracy,
              (signature_text IS NOT NULL) AS signed,
              claim_ticket_ref,
              verified_by, verified_at::text AS verified_at,
              applied_at::text AS applied_at, decision_reason,
              created_at::text AS created_at
         FROM public.brand_opt_outs
        WHERE tenant_id = $2 AND brand_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT 50`,
      [id, tenant],
    )
    const claims = (claimsRes.rows as Record<string, unknown>[]).map((o) => ({
      id: o.id,
      strength: o.strength,
      status: o.status,
      claimantName: o.claimant_name,
      claimantEmail: o.claimant_email,
      claimantCompany: o.claimant_company ?? null,
      isAgent: o.is_agent === true,
      representedOwner: o.represented_owner ?? null,
      trademarkRegistration: o.trademark_registration ?? null,
      attestation: {
        authority: o.attestation_authority === true,
        accuracy: o.attestation_accuracy === true,
        signed: o.signed === true,
      },
      claimTicketRef: o.claim_ticket_ref ?? null,
      verifiedBy: o.verified_by ?? null,
      verifiedAt: o.verified_at ?? null,
      appliedAt: o.applied_at ?? null,
      decisionReason: o.decision_reason ?? null,
      createdAt: o.created_at,
    }))
    const appliedClaim = claims.find((cl) => cl.status === "applied")
    const pendingClaims = claims.filter(
      (cl) => cl.status === "filed" || cl.status === "verified",
    ).length

    return {
      brand: {
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
        description: brand.description ?? null,
        logoUrl: brand.logo_url ?? null,
        website: brand.website ?? null,
        pricingTier: brand.pricing_tier ?? null,
        wholesaleConfirmed: brand.wholesale_confirmed ?? false,
        ownerSellerId: brand.owner_seller_id ?? null,
        status: brand.status,
        publishedAt: brand.published_at ?? null,
        createdAt: brand.created_at,
        updatedAt: brand.updated_at,
      },
      authorizations: (
        authRes.rows as Record<string, unknown>[]
      ).map((a) => ({
        id: a.id,
        sellerId: a.seller_id,
        seller: a.seller_name ?? "—",
        sellerStatus: a.seller_status,
        sellerType: a.seller_type,
        authorizationType: a.authorization_type,
        evidenceUrl: a.evidence_url ?? null,
        status: a.status,
        validFrom: a.valid_from ?? null,
        validUntil: a.valid_until ?? null,
        reviewedBy: a.reviewed_by ?? null,
        reviewedAt: a.reviewed_at ?? null,
        createdAt: a.created_at,
      })),
      footprint: {
        attribution:
          "Listings and catalog items are attributed by exact brand-name text — neither store carries a brand_id.",
        sameNameBrands: sameName,
        listings: (
          listingRes.rows as Record<string, unknown>[]
        ).map((l) => ({
          id: l.id,
          title: l.title,
          sku: l.sku,
          status: l.status,
          suppressionReason: l.suppression_reason || null,
          sellerId: l.seller_id,
          seller: l.seller_name ?? "—",
          createdAt: l.created_at,
        })),
        catalogItems: Number(
          (catalogCountRes.rows[0] as { n: number }).n,
        ),
        catalogSample: (
          catalogSampleRes.rows as Record<string, unknown>[]
        ).map((ci) => ({
          name: ci.name,
          sku: ci.sku,
          active: ci.active,
        })),
      },
      optOut: {
        established: true,
        recordedState: appliedClaim
          ? "applied"
          : pendingClaims > 0
            ? "in_verification"
            : claims.length > 0
              ? "closed"
              : "none",
        appliedStrength: appliedClaim ? appliedClaim.strength : null,
        claims,
        note: appliedClaim
          ? `An opt-out stands for this brand at '${appliedClaim.strength}' strength (applied ${appliedClaim.appliedAt ? String(appliedClaim.appliedAt).slice(0, 10) : ""}). It is enforced at the seller brand gate and outranks every seller authorization below.`
          : pendingClaims > 0
            ? `${pendingClaims} opt-out claim(s) for this brand are in verification. No block applies until a claim is verified and applied in the claims queue.`
            : "No opt-out is recorded for this brand. Claims filed on the public page (/brand-opt-out) are recorded in the registry, verified by the platform team, and only then applied.",
      },
      decisionsSeat:
        "Authorization decisions (approve/reject) are recorded at the verification desk: /admin/sellers/verification",
    }
  })

  if (!out) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  }
  if ("notFound" in out) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 })
  }
  return NextResponse.json(out)
}
