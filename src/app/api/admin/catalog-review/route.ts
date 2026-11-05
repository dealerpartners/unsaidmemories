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
import { completenessIssues } from "@/lib/sellers/listing-quality"

export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// B1 Catalog Review + B2 Suppressions — commerce_catalog_items.
//
// This route previously stamped every row status:"auto-approved" with a
// note claiming "No approval-workflow tables exist on the platform."
// Both halves were fiction, disproven firsthand (2026-10-14): the
// review workflow's stores exist — seller_listings (the /admin/listings
// seat) and, for catalog items, the item's own review state.
//
// Firsthand shape of that state: commerce_catalog_items has NO status
// column. A seller-created item is born carrying metadata->>'status' =
// 'pending_review' (the seller single-create + imports writers stamp
// exactly that key); the vocabulary the platform's readers honor is
// 'pending_review' | 'approved' | 'rejected' | 'suppressed'. House
// items carry no review state (NULL) until a decision stamps one.
// Decisions here write ONLY that designed key — the decision's reason
// lives in seller_audit_log (after_state) and reaches an attributed
// seller through seller_notifications (the M2 precedent).
//
// What a decision governs, stated exactly: the public seller faces —
// the storefront's and PDP door's seller-attributed legs read
//   ci.active = true AND COALESCE(ci.metadata->>'status','')
//     NOT IN ('rejected','suppressed')
// (src/lib/sellers/storefront.ts, legs B). Reject/suppress therefore
// withdraw a seller's item from those faces; unsuppress returns it to
// 'pending_review' (back in this queue — lifting a suppression is not
// an approval). The main shop catalog (lib/enterprise/catalog) does
// NOT consult review state; its gates are the item's own active /
// ecommerce_enabled flags, administered in Catalog admin (G1).
// ---------------------------------------------------------------------------

const PAGE = 50

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("products_services", "read")
  if (denied) return denied
  const sp = req.nextUrl.searchParams
  const q = (sp.get("q") || "").trim()
  const page = Math.max(0, Number(sp.get("page") || 0) || 0)
  const only = (sp.get("status") || "").trim() // '' = all, 'pending_review'… , 'none'
  const tenant = resolveTenantId(req)

  const out = await withPg(async (c) => {
    const like = `%${q.replace(/[%_]/g, "")}%`
    const where = `ci.tenant_id = $1 AND ($2 = '%%' OR ci.name ILIKE $2 OR ci.metadata->>'slug' ILIKE $2 OR COALESCE(ci.brand, ci.metadata->>'brand') ILIKE $2)
      AND ($3 = '' OR ($3 = 'none' AND ci.metadata->>'status' IS NULL) OR ci.metadata->>'status' = $3)`

    const total = Number(
      (
        await c.query(
          `SELECT count(*)::int AS n FROM public.commerce_catalog_items ci WHERE ${where}`,
          [tenant, like, only],
        )
      ).rows[0]?.n ?? 0,
    )

    const { rows } = await c.query(
      `SELECT ci.id::text AS id, ci.name,
              ci.metadata->>'slug' AS slug,
              COALESCE(NULLIF(ci.brand, ''), ci.metadata->>'brand') AS brand,
              ci.metadata->>'status' AS status,
              ci.metadata->>'seller_id' AS seller_id,
              s.display_name AS seller_name,
              ci.active,
              ci.description,
              es.barcode AS gtin,
              (SELECT ptn.node_id::text FROM public.product_taxonomy_nodes ptn
                WHERE ptn.product_id = es.product_id AND ptn.is_primary LIMIT 1) AS category_id,
              (SELECT count(*)::int FROM public.commerce_product_media m
                WHERE m.catalog_item_id = ci.id) AS media_count,
              cp.price::float AS price, ci.created_at
         FROM public.commerce_catalog_items ci
         LEFT JOIN public.sellers s
           ON s.id::text = ci.metadata->>'seller_id' AND s.tenant_id = ci.tenant_id
         LEFT JOIN public.erp_product_skus es
           ON es.id = ci.sku_id
         LEFT JOIN public.commerce_prices cp
           ON cp.catalog_item_id = ci.id
          AND cp.price_list_id = (SELECT id FROM public.commerce_price_lists
                                   WHERE tenant_id = ci.tenant_id AND code = 'RETAIL' AND active = true LIMIT 1)
          AND (cp.valid_to IS NULL OR cp.valid_to >= now())
        WHERE ${where}
        ORDER BY CASE WHEN ci.metadata->>'status' = 'pending_review' THEN 0 ELSE 1 END,
                 ci.name
        LIMIT ${PAGE} OFFSET ${page * PAGE}`,
      [tenant, like, only],
    )

    const countsRes = await c.query(
      `SELECT COALESCE(metadata->>'status', 'none') AS status, count(*)::int AS n
         FROM public.commerce_catalog_items
        WHERE tenant_id = $1
        GROUP BY 1`,
      [tenant],
    )
    const byStatus: Record<string, number> = {}
    for (const r of countsRes.rows as { status: string; n: number }[]) {
      byStatus[String(r.status)] = Number(r.n)
    }

    // Completeness score (B1): every queue row carries the platform's
    // own completeness verdict (lib/sellers/listing-quality — the same
    // function behind the seller fix queue) computed over the item's
    // real facts: title, description, RETAIL price, primary taxonomy
    // category, SKU barcode (GTIN), and media count. The reviewer sees
    // what is missing BEFORE deciding; approval of an incomplete item
    // is a recorded choice, never an uninformed one.
    const mapped = rows.map((r) => {
      const issues = completenessIssues(
        {
          title: r.name,
          description: r.description,
          price: r.price,
          category_id: r.category_id,
          gtin: r.gtin,
        },
        Number(r.media_count ?? 0),
      )
      return {
        id: String(r.id),
        name: String(r.name ?? "Untitled"),
        slug: r.slug ? String(r.slug) : null,
        brand: r.brand ? String(r.brand) : null,
        price: typeof r.price === "number" ? r.price : null,
        status: r.status ? String(r.status) : null,
        sellerId: r.seller_id ? String(r.seller_id) : null,
        seller: r.seller_name ? String(r.seller_name) : null,
        active: r.active === true,
        issues,
        complete: issues.length === 0,
      }
    })
    return {
      rows: mapped,
      total,
      byStatus,
      incompleteOnPage: mapped.filter((m) => !m.complete).length,
    }
  })

  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  return NextResponse.json({ page, pageSize: PAGE, ...out, note: null })
}

const ACTIONS = ["approve", "reject", "suppress", "unsuppress"] as const
type Action = (typeof ACTIONS)[number]

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("products_services", "write")
  if (denied) return denied
  const b = await req.json().catch(() => ({}))
  const action = ACTIONS.includes(b.action) ? (b.action as Action) : null
  const itemId = typeof b.itemId === "string" ? b.itemId : ""
  if (!action || !UUID_RE.test(itemId)) {
    return NextResponse.json(
      { error: "Provide action (approve|reject|suppress|unsuppress) and a valid itemId" },
      { status: 400 },
    )
  }
  const reason = typeof b.reason === "string" ? b.reason.trim() : ""
  const category = typeof b.category === "string" ? b.category.trim() : ""
  if (action === "reject" && !reason) {
    return NextResponse.json(
      { error: "A rejection requires a reason — an attributed seller sees it." },
      { status: 400 },
    )
  }
  if (action === "suppress" && !isSuppressionCategory(category)) {
    return NextResponse.json(
      { error: `A suppression requires one of the tree's causes: ${SUPPRESSION_CATEGORIES.join(", ")}.` },
      { status: 400 },
    )
  }

  const tenant = resolveTenantId(req)
  const actorId = await getActorIdFromRequest(req)
  const ipAddress = requestIp(req)
  const recordedReason =
    action === "reject"
      ? reason
      : action === "suppress"
        ? composeSuppressionReason(category, reason)
        : null

  const out = await withPg(async (c) => {
    const { rows: cur } = await c.query(
      `SELECT id::text AS id, name, metadata->>'status' AS status,
              metadata->>'seller_id' AS seller_id
         FROM public.commerce_catalog_items
        WHERE tenant_id = $1 AND id = $2::uuid LIMIT 1`,
      [tenant, itemId],
    )
    const item = cur[0] as
      | { id: string; name: string; status: string | null; seller_id: string | null }
      | undefined
    if (!item) return { error: "Catalog item not found", status: 404 as const }
    const current = item.status // null = no review state recorded yet

    // Guarded transitions — the UPDATE itself re-checks the from-state.
    const fromStates: Record<Action, (string | null)[]> = {
      approve: [null, "pending_review", "rejected"],
      reject: [null, "pending_review", "approved"],
      suppress: [null, "pending_review", "approved"],
      unsuppress: ["suppressed"],
    }
    if (!fromStates[action].includes(current)) {
      return {
        error:
          action === "unsuppress"
            ? "Item is not suppressed."
            : `Item's review state is '${current}' — ${action} does not land from there` +
              (current === "suppressed" ? " (lift the suppression first)." : "."),
        status: 409 as const,
      }
    }
    const nextStatus =
      action === "approve"
        ? "approved"
        : action === "reject"
          ? "rejected"
          : action === "suppress"
            ? "suppressed"
            : "pending_review"

    const { rows } = await c.query(
      `UPDATE public.commerce_catalog_items
          SET metadata = metadata || jsonb_build_object('status', $3::text)
        WHERE tenant_id = $1 AND id = $2::uuid
          AND metadata->>'status' IS NOT DISTINCT FROM $4
        RETURNING id::text AS id, metadata->>'status' AS status`,
      [tenant, itemId, nextStatus, current],
    )
    if (!rows[0]) {
      return { error: "Item changed underneath this decision — reload and retry.", status: 409 as const }
    }

    const sellerId = item.seller_id && UUID_RE.test(item.seller_id) ? item.seller_id : null

    await writeSellerAudit(c, {
      tenantId: tenant,
      sellerId,
      actorId,
      ipAddress,
      action:
        action === "approve"
          ? "catalog_item.approved"
          : action === "reject"
            ? "catalog_item.rejected"
            : action === "suppress"
              ? "catalog_item.suppressed"
              : "catalog_item.unsuppressed",
      entityType: "commerce_catalog_item",
      entityId: itemId,
      beforeState: { status: current },
      afterState: { status: nextStatus, reason: recordedReason },
    })

    if (sellerId && action !== "approve") {
      const title =
        action === "reject"
          ? `Product rejected: ${item.name}`
          : action === "suppress"
            ? `Product suppressed: ${item.name}`
            : `Suppression lifted: ${item.name}`
      const body =
        action === "reject"
          ? `Your product "${item.name}" was rejected in catalog review: ${reason}`
          : action === "suppress"
            ? `Your product "${item.name}" has been suppressed and is hidden from your storefront. Reason: ${recordedReason}. You can appeal through your governance surface.`
            : `The suppression on your product "${item.name}" has been lifted; it is back in the review queue.`
      // Through the comms layer (event "listings") so the seller's
      // preferences and the email leg apply — the raw insert this
      // replaces wrote the in-portal row unconditionally and never
      // emailed. Same type/title/body/link as before.
      await notifySeller(
        {
          tenantId: tenant,
          sellerId,
          event: "listings",
          type: action === "reject" ? "listing_review" : "listing_suppression",
          title,
          body,
          link: "/seller/products",
        },
        c,
      )
    }

    return { ok: true as const, item: rows[0] }
  })

  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status })
  return NextResponse.json(out)
}
