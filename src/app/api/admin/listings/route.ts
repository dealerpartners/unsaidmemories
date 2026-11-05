import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit"
import { notifySeller } from "@/lib/sellers/notify"
import {
  SUPPRESSION_CATEGORIES,
  isSuppressionCategory,
  composeSuppressionReason,
} from "@/lib/sellers/listings-review"

export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// B1 Catalog Review + B2 Suppressions — seller_listings (Admin tree §B).
//
// Sunny's text governs the shape (admin-portal-tree §B; admin data graph,
// Shared Contract Registry): B1 writes `listings.status` (seller manages,
// customer browses); B2 writes `listings.suppression_reason` ("Seller sees
// reason; customer sees hidden"). The live store carrying both designed
// columns is public.seller_listings (firsthand census, 2026-10-14):
// status text DEFAULT 'draft' — the table's ONLY constraint is its PK, so
// the vocabulary is the writers'/readers' contract, read firsthand:
//   born 'pending_review' (seller imports attach writer) or 'draft'
//   decided here: 'approved' | 'rejected'
//   public legs require status='approved' AND no suppression_reason
//     (src/lib/sellers/storefront.ts legs A — storefront + PDP door).
// suppression_reason is free text, NULL/'' = not suppressed; the seller's
// own suppression face reads it verbatim (GET /api/seller/catalog serves
// the set where the reason is non-empty). NO writer of suppression_reason
// existed before this route — B2's suppress/unsuppress below is the first.
//
// seller_listings carries NO reviewed_by/reviewed_at columns — reviewer
// identity and time live in seller_audit_log via writeSellerAudit (the
// lineage's audit idiom; vocabulary already carries listing.approved /
// listing.rejected). Rejections and suppressions ALSO reach the seller
// through seller_notifications (the M2 brand-decision precedent), because
// the data graph's contract is that the seller SEES the reason.
//
// B1's review checks ride the queue rows as recorded facts — photo
// presence (seller_listing_media count), title/description presence,
// category presence (category_id), attribute/health signal
// (health_score). Category REASSIGNMENT is not built here: categories
// are B3's seat and B3 waits on Sunny's category-unification ruling.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ListingRow = {
  id: string
  seller_id: string
  seller_name: string | null
  product_id: string | null
  product_name: string | null
  sku: string
  title: string
  description: string | null
  brand: string | null
  price: number | null
  stock: number | null
  status: string
  suppression_reason: string | null
  health_score: number | null
  category_id: string | null
  media_count: number
  created_at: string
  updated_at: string
}

const LISTING_SELECT = `
  SELECT l.id::text AS id, l.seller_id::text AS seller_id,
         s.display_name AS seller_name,
         l.product_id::text AS product_id, ci.name AS product_name,
         l.sku, l.title, l.description, l.brand,
         l.price::float AS price, l.stock,
         l.status, l.suppression_reason,
         l.health_score::float AS health_score,
         l.category_id::text AS category_id,
         (SELECT count(*)::int FROM public.seller_listing_media m
           WHERE m.listing_id = l.id AND m.tenant_id = l.tenant_id) AS media_count,
         l.created_at::text AS created_at, l.updated_at::text AS updated_at
    FROM public.seller_listings l
    JOIN public.sellers s ON s.id = l.seller_id AND s.tenant_id = l.tenant_id
    LEFT JOIN public.commerce_catalog_items ci
      ON ci.id = l.product_id AND ci.tenant_id = l.tenant_id
`

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read")
  if (denied) return denied
  const tenant = resolveTenantId(req)
  const sp = req.nextUrl.searchParams
  const status = (sp.get("status") || "").trim()
  const q = (sp.get("q") || "").trim()

  const out = await withPg(async (c) => {
    const { rows } = await c.query(
      `${LISTING_SELECT}
        WHERE l.tenant_id = $1
          AND ($2 = '' OR l.status = $2)
          AND ($3 = '' OR l.title ILIKE '%' || $3 || '%' OR l.sku ILIKE '%' || $3 || '%'
               OR s.display_name ILIKE '%' || $3 || '%')
        ORDER BY CASE WHEN l.status = 'pending_review' THEN 0
                      WHEN l.status = 'draft' THEN 1 ELSE 2 END,
                 l.created_at DESC
        LIMIT 200`,
      [tenant, status, q],
    )
    const countsRes = await c.query(
      `SELECT status, count(*)::int AS n FROM public.seller_listings
        WHERE tenant_id = $1 GROUP BY status`,
      [tenant],
    )
    const suppRes = await c.query(
      `SELECT count(*)::int AS n FROM public.seller_listings
        WHERE tenant_id = $1 AND COALESCE(suppression_reason, '') <> ''`,
      [tenant],
    )
    const counts: Record<string, number> = {}
    for (const r of countsRes.rows as { status: string; n: number }[]) {
      counts[String(r.status)] = Number(r.n)
    }
    return {
      rows: (rows as ListingRow[]).map((r) => ({
        id: r.id,
        sellerId: r.seller_id,
        seller: r.seller_name ?? "—",
        productId: r.product_id,
        productName: r.product_name,
        name: r.title,
        sku: r.sku,
        description: r.description,
        brand: r.brand,
        price: typeof r.price === "number" ? r.price : null,
        stock: r.stock,
        status: r.status,
        suppressionReason: r.suppression_reason || null,
        healthScore: typeof r.health_score === "number" ? r.health_score : null,
        categoryId: r.category_id,
        mediaCount: Number(r.media_count ?? 0),
        submittedAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      counts,
      suppressedCount: Number(suppRes.rows[0]?.n ?? 0),
      note:
        rows.length === 0
          ? "No seller listings in this tenant yet. A seller's listing lands here the moment it is submitted (born pending_review), and decisions recorded here are the ones the public storefront and product pages honor."
          : null,
    }
  })

  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  return NextResponse.json(out)
}

const ACTIONS = ["approve", "reject", "suppress", "unsuppress"] as const
type Action = (typeof ACTIONS)[number]

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write")
  if (denied) return denied
  const b = await req.json().catch(() => ({}))
  const action = ACTIONS.includes(b.action) ? (b.action as Action) : null
  const listingId = typeof b.listingId === "string" ? b.listingId : ""
  if (!action || !UUID_RE.test(listingId)) {
    return NextResponse.json(
      { error: "Provide action (approve|reject|suppress|unsuppress) and a valid listingId" },
      { status: 400 },
    )
  }
  const reason = typeof b.reason === "string" ? b.reason.trim() : ""
  const category = typeof b.category === "string" ? b.category.trim() : ""
  if (action === "reject" && !reason) {
    return NextResponse.json(
      { error: "A rejection requires a reason — the seller sees it (data graph B1/B2 contract)." },
      { status: 400 },
    )
  }
  if (action === "suppress" && !isSuppressionCategory(category)) {
    return NextResponse.json(
      {
        error: `A suppression requires one of the tree's causes: ${SUPPRESSION_CATEGORIES.join(", ")}.`,
      },
      { status: 400 },
    )
  }

  const tenant = resolveTenantId(req)
  const actorId = await getActorIdFromRequest(req)
  const ipAddress = requestIp(req)
  const suppressionReason =
    action === "suppress" ? composeSuppressionReason(category, reason) : null

  const out = await withPg(async (c) => {
    const { rows: cur } = await c.query(
      `SELECT id::text AS id, seller_id::text AS seller_id, title, status,
              suppression_reason
         FROM public.seller_listings
        WHERE tenant_id = $1 AND id = $2::uuid LIMIT 1`,
      [tenant, listingId],
    )
    const listing = cur[0] as
      | { id: string; seller_id: string; title: string; status: string; suppression_reason: string | null }
      | undefined
    if (!listing) return { error: "Listing not found", status: 404 as const }

    const suppressed = Boolean(listing.suppression_reason && listing.suppression_reason !== "")

    // Guarded transitions — a decision only lands from the states it means.
    if ((action === "approve" || action === "reject") && !["pending_review", "draft"].includes(listing.status)) {
      return {
        error: `Listing is already decided (${listing.status}) — review decisions land once, from the queue.`,
        status: 409 as const,
      }
    }
    if (action === "suppress" && suppressed) {
      return { error: "Listing is already suppressed.", status: 409 as const }
    }
    if (action === "unsuppress" && !suppressed) {
      return { error: "Listing is not suppressed.", status: 409 as const }
    }

    let updated: Record<string, unknown> | undefined
    if (action === "approve" || action === "reject") {
      const nextStatus = action === "approve" ? "approved" : "rejected"
      const { rows } = await c.query(
        `UPDATE public.seller_listings
            SET status = $3, updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid AND status = $4
          RETURNING id::text AS id, status`,
        [tenant, listingId, nextStatus, listing.status],
      )
      updated = rows[0]
    } else if (action === "suppress") {
      const { rows } = await c.query(
        `UPDATE public.seller_listings
            SET suppression_reason = $3, updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid
            AND COALESCE(suppression_reason, '') = ''
          RETURNING id::text AS id, status, suppression_reason`,
        [tenant, listingId, suppressionReason],
      )
      updated = rows[0]
    } else {
      const { rows } = await c.query(
        `UPDATE public.seller_listings
            SET suppression_reason = NULL, updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid
            AND COALESCE(suppression_reason, '') <> ''
          RETURNING id::text AS id, status, suppression_reason`,
        [tenant, listingId],
      )
      updated = rows[0]
    }
    if (!updated) {
      return { error: "Listing changed underneath this decision — reload and retry.", status: 409 as const }
    }

    await writeSellerAudit(c, {
      tenantId: tenant,
      sellerId: listing.seller_id,
      actorId,
      ipAddress,
      action:
        action === "approve"
          ? "listing.approved"
          : action === "reject"
            ? "listing.rejected"
            : action === "suppress"
              ? "listing.suppressed"
              : "listing.unsuppressed",
      entityType: "seller_listing",
      entityId: listingId,
      beforeState: { status: listing.status, suppression_reason: listing.suppression_reason },
      afterState:
        action === "approve" || action === "reject"
          ? { status: updated.status, reason: action === "reject" ? reason : null }
          : { suppression_reason: updated.suppression_reason ?? null },
    })

    // The seller sees the adverse decisions and their reasons (M2
    // precedent; the data graph's read contract). Approvals stay silent —
    // the listing simply goes live on the seller's own faces.
    // Through the comms layer (event "listings") so preferences and
    // the email leg apply; same type/title/body/link as the raw
    // inserts these replace.
    if (action === "reject") {
      await notifySeller(
        {
          tenantId: tenant,
          sellerId: String(listing.seller_id),
          event: "listings",
          type: "listing_review",
          title: `Listing rejected: ${listing.title}`,
          body: `Your listing "${listing.title}" was rejected in catalog review: ${reason}`,
          link: "/seller/catalog",
        },
        c,
      )
    } else if (action === "suppress") {
      await notifySeller(
        {
          tenantId: tenant,
          sellerId: String(listing.seller_id),
          event: "listings",
          type: "listing_suppression",
          title: `Listing suppressed: ${listing.title}`,
          body: `Your listing "${listing.title}" has been suppressed and is hidden from the storefront. Reason: ${suppressionReason}. You can appeal through your governance surface.`,
          link: "/seller/catalog/suppression",
        },
        c,
      )
    } else if (action === "unsuppress") {
      await notifySeller(
        {
          tenantId: tenant,
          sellerId: String(listing.seller_id),
          event: "listings",
          type: "listing_suppression",
          title: `Suppression lifted: ${listing.title}`,
          body: `The suppression on your listing "${listing.title}" has been lifted.`,
          link: "/seller/catalog/suppression",
        },
        c,
      )
    }

    return { ok: true as const, listing: updated }
  })

  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status })
  return NextResponse.json(out)
}
