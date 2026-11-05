import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit"
import { provisionSellerGrants, linkSellerPortalUser } from "@/lib/sellers/provisioning"
import { notifySeller } from "@/lib/sellers/notify"
import { bustPublicShopFaces } from "@/lib/sellers/public-bust"
import { sendEmail } from "@/lib/email"
import { deferWork } from "@/lib/defer"
import { SITE_URL } from "@/lib/site-url"

export const dynamic = "force-dynamic"

// Tree A1: a rejected application reaches the applicant by EMAIL — the
// decision record alone leaves them waiting on a portal account they may
// not have yet. Best-effort by design: the decision is already committed
// and audited before this runs, and a mail failure never unwinds it.
async function sendRejectionEmail(opts: {
  tenantId: string
  to: string | null
  business: string
  reason: string
}) {
  const to = opts.to
  if (!to) return
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  try {
    await deferWork(() => sendEmail({
      to,
      tenantId: opts.tenantId,
      template: "seller_application_rejected",
      subject: "Your UnSaid Memories seller application",
      html: [
        `<p>Hello ${esc(opts.business)},</p>`,
        `<p>Thank you for applying to sell on UnSaid Memories. After review, we're unable to approve your application at this time.</p>`,
        opts.reason ? `<p><strong>Reason:</strong> ${esc(opts.reason)}</p>` : "",
        `<p>If your circumstances change, you're welcome to apply again. Questions? Just reply to this email.</p>`,
        `<p>— UnSaid Memories</p>`,
      ]
        .filter(Boolean)
        .join("\n"),
    }))
  } catch {
    /* the audited decision stands even if the notice cannot be sent */
  }
}

// Tree A1, the other direction: an APPROVED seller hears it from us —
// and approval provisions their account (lib/sellers/provisioning).
// Same best-effort contract as the rejection notice: the decision is
// committed and audited before any of this runs, and a failure here
// never unwinds it. Returns what the post-commit steps achieved so the
// admin surface can show it.
async function sendApprovalEmail(opts: {
  tenantId: string
  to: string | null
  business: string
}) {
  const to = opts.to
  if (!to) return
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  try {
    await deferWork(() => sendEmail({
      to,
      tenantId: opts.tenantId,
      template: "seller_application_approved",
      subject: "Your UnSaid Memories seller account is approved",
      html: [
        `<p>Hello ${esc(opts.business)},</p>`,
        `<p>Good news — your application to sell on UnSaid Memories has been approved, and your Seller Center account is ready.</p>`,
        `<p>Sign in with this email address at <a href="${SITE_URL}/access-seller">${SITE_URL.replace(/^https?:\/\//, "")}/access-seller</a>. If you don't have a sign-in yet, create one with this same email address and your seller account will be waiting for you.</p>`,
        `<p>Next steps inside your Seller Center: finish onboarding — bank information, tax identity, and policy acceptance — so listings and payouts can go live. Category permissions and capability upgrades are enabled by our team as you complete onboarding; reply to this email with any questions.</p>`,
        `<p>— UnSaid Memories</p>`,
      ]
        .filter(Boolean)
        .join("\n"),
    }))
  } catch {
    /* the audited decision stands even if the notice cannot be sent */
  }
}

async function afterApproval(opts: {
  tenantId: string
  sellerId: string
  email: string | null
  business: string
  actorId: string | null
}): Promise<{ portal_link: string }> {
  const portalLink = await linkSellerPortalUser({
    tenantId: opts.tenantId,
    sellerId: opts.sellerId,
    email: opts.email,
    displayName: opts.business,
    actorId: opts.actorId,
  }).catch(() => "unavailable" as const)
  await sendApprovalEmail({ tenantId: opts.tenantId, to: opts.email, business: opts.business })
  return { portal_link: portalLink }
}

const PAGE = 50

// Sunny's seller-type vocabulary (Seller Tree A, onboarding Step 4 — his
// text): Manufacturer brand · Supplier · Reseller · Drop shipper.
// 'marketplace' names the PLATFORM, never a seller type; 'first_party' is
// only the house account's own record type. Enforced by
// sellers_seller_type_check (migration 20261059).
const SELLER_TYPES = [
  "first_party",
  "manufacturer_brand",
  "supplier",
  "reseller",
  "drop_shipper",
] as const

// sellers.status lifecycle (live CHECK): 'applied' is the application
// awaiting a decision. There is no 'pending' and no 'rejected' seller
// status — rejection is recorded on the APPLICATION record
// (seller_partner_applications), never on the seller.
const SELLER_STATUSES = ["applied", "approved", "suspended", "closed"] as const

// seller_partner_applications statuses that mean "awaiting a decision":
// 'new' (public intake default) and 'submitted' (Step 4 packet filed).
const APPLICATION_OPEN = ["new", "submitted"] as const

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The seller type a Step 4 packet filed, read from the application's
 *  packet notes ("Seller type: <value>" line the onboarding writes). */
function filedSellerType(notes: string | null): string | null {
  if (!notes) return null
  const m = notes.match(/Seller type:\s*([a-z_]+)/i)
  const v = m ? m[1].toLowerCase() : null
  return v && (SELLER_TYPES as readonly string[]).includes(v) ? v : null
}

function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return s || "seller"
}

const SELLER_COLS = `
  id, tenant_id, seller_type, legal_name, display_name, slug, email, phone,
  website, tax_id_last4, commission_rate::float AS commission_rate, status,
  approved_at, approved_by, created_at, updated_at
`

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read")
  if (denied) return denied
  const sp = req.nextUrl.searchParams
  const tenant = resolveTenantId(req)

  const out = await withPg(async (c) => {
    // Single-seller detail
    const id = (sp.get("id") || "").trim()
    if (id) {
      const { rows } = await c.query(
        `SELECT ${SELLER_COLS} FROM public.sellers WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenant, id],
      )
      if (!rows[0]) return { error: "Seller not found", status: 404 }
      return { seller: rows[0] }
    }

    const q = (sp.get("q") || "").trim()
    const rawStatus = (sp.get("status") || "").trim()
    // A1 · Reactivations view: suspended/closed sellers WITH prior
    // approved history (approved_at set when they were approved) — the
    // population a reinstatement/reactivation decision can act on. It is
    // a VIEW over the status vocabulary, not a new status.
    const reactivations = (sp.get("view") || "").trim() === "reactivations"
    // Filters read the real sellers.status vocabulary only — a value
    // outside it ('pending', 'rejected', …) matches nothing.
    const status =
      rawStatus && !(SELLER_STATUSES as readonly string[]).includes(rawStatus)
        ? "__none__"
        : rawStatus
    const type = (sp.get("type") || "").trim()
    const page = Math.max(0, Number(sp.get("page") || 0) || 0)
    const like = `%${q.replace(/[%_]/g, "")}%`
    const counts = (
      await c.query(
        `SELECT count(*)::int AS all,
                count(*) FILTER (WHERE status = 'applied')::int AS applied,
                count(*) FILTER (WHERE status = 'approved')::int AS approved,
                count(*) FILTER (WHERE status = 'suspended')::int AS suspended,
                count(*) FILTER (WHERE status = 'closed')::int AS closed,
                count(*) FILTER (WHERE status IN ('suspended', 'closed') AND approved_at IS NOT NULL)::int AS reactivations
           FROM public.sellers WHERE tenant_id = $1`,
        [tenant],
      )
    ).rows[0]
    const types = (
      await c.query(
        `SELECT DISTINCT seller_type FROM public.sellers
          WHERE tenant_id = $1 AND seller_type IS NOT NULL AND seller_type <> ''
          ORDER BY seller_type`,
        [tenant],
      )
    ).rows.map((r: any) => r.seller_type)
    const { rows } = await c.query(
      `SELECT ${SELLER_COLS}
         FROM public.sellers
        WHERE tenant_id = $1
          AND ($2 = '' OR status = $2)
          AND ($4 = '' OR seller_type = $4)
          AND ($3 = '%%' OR display_name ILIKE $3 OR legal_name ILIKE $3 OR email ILIKE $3 OR slug ILIKE $3)
          AND ($5 = false OR (status IN ('suspended', 'closed') AND approved_at IS NOT NULL))
        ORDER BY created_at DESC
        LIMIT ${PAGE} OFFSET ${page * PAGE}`,
      [tenant, status, like, type, reactivations],
    )
    // The A1 queue: applications awaiting a decision (the working queue —
    // a public filing or a Step 4 packet with no decision yet).
    const applications = (
      await c.query(
        `SELECT id, business_name, contact_name, email, phone, partner_type,
                status, notes, created_at
           FROM public.seller_partner_applications
          WHERE tenant_id = $1 AND status = ANY($2::text[])
          ORDER BY created_at DESC
          LIMIT 100`,
        [tenant, [...APPLICATION_OPEN]],
      )
    ).rows.map((a: any) => ({ ...a, filed_type: filedSellerType(a.notes) }))
    counts.applications = applications.length
    return { counts, types, rows, applications, page, pageSize: PAGE, view: reactivations ? "reactivations" : "all" }
  })
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status || 400 })
  return NextResponse.json(out)
}

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write")
  if (denied) return denied
  const b = await req.json().catch(() => ({}))
  const tenant = resolveTenantId(req)
  const actorId = await getActorIdFromRequest(req)
  const ipAddress = requestIp(req)
  const action = typeof b.action === "string" ? b.action : ""

  // ---- Application decisions (A1 queue) ---------------------------------
  // The application record carries the decision. Approve lands the seller;
  // reject is recorded on the application (status + reason in its notes) —
  // sellers.status has no 'rejected' and never gets one.
  if (action === "approve_application" || action === "reject_application") {
    const applicationId = typeof b.application_id === "string" ? b.application_id.trim() : ""
    if (!applicationId) return NextResponse.json({ error: "Missing application id" }, { status: 400 })

    const result = await withPg(async (c) => {
      const { rows: apps } = await c.query(
        `SELECT id, business_name, contact_name, email, phone, partner_type, status, notes
           FROM public.seller_partner_applications
          WHERE tenant_id = $1 AND id = $2::uuid LIMIT 1`,
        [tenant, applicationId],
      )
      const app = apps[0]
      if (!app) return { error: "Application not found", status: 404 }
      if (!(APPLICATION_OPEN as readonly string[]).includes(app.status)) {
        return { error: `Application already decided (${app.status})`, status: 400 }
      }

      if (action === "reject_application") {
        const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 500) : ""
        const notes = [app.notes || "", `Rejected${reason ? `: ${reason}` : ""}`]
          .filter(Boolean)
          .join("\n")
        await c.query(
          `UPDATE public.seller_partner_applications
              SET status = 'rejected', notes = $3
            WHERE tenant_id = $1 AND id = $2::uuid`,
          [tenant, applicationId, notes],
        )
        await writeSellerAudit(c, {
          tenantId: tenant, actorId, ipAddress,
          action: "seller_application.reject", entityType: "seller_partner_application", entityId: applicationId,
          beforeState: { status: app.status },
          afterState: { status: "rejected", reason: reason || null },
        })
        await sendRejectionEmail({
          tenantId: tenant,
          to: app.email,
          business: app.business_name,
          reason,
        })
        return { ok: true, application: { id: applicationId, status: "rejected" } }
      }

      // approve_application — the intake→queue bridge. seller_type comes
      // from the reviewer's confirmation or the type the applicant filed
      // at Step 4; the seller record cannot exist without one (NOT NULL +
      // CHECK), and no type is ever invented here.
      const explicit = typeof b.seller_type === "string"
        ? b.seller_type.trim().toLowerCase().replace(/\s+/g, "_")
        : ""
      if (explicit && !(SELLER_TYPES as readonly string[]).includes(explicit)) {
        return { error: `Unknown seller type "${explicit}"`, status: 400 }
      }
      const sellerType = explicit || filedSellerType(app.notes)
      if (!sellerType) {
        return {
          error: "Choose the seller type to approve under: Manufacturer brand, Supplier, Reseller, or Drop shipper.",
          status: 400,
        }
      }

      const { rows: existing } = await c.query(
        `SELECT id, status, seller_type FROM public.sellers
          WHERE tenant_id = $1 AND lower(email) = lower($2) LIMIT 1`,
        [tenant, app.email],
      )
      let seller = existing[0]
      if (seller) {
        const { rows } = await c.query(
          `UPDATE public.sellers
              SET status = 'approved',
                  seller_type = $3,
                  approved_at = CASE WHEN status = 'approved' THEN approved_at ELSE now() END,
                  updated_at = now()
            WHERE tenant_id = $1 AND id = $2::uuid
            RETURNING id, status, seller_type`,
          [tenant, seller.id, sellerType],
        )
        seller = rows[0]
      } else {
        const base = slugify(app.business_name)
        let slug = base
        for (let n = 2; ; n++) {
          const { rows: clash } = await c.query(
            `SELECT 1 FROM public.sellers WHERE tenant_id = $1 AND slug = $2 LIMIT 1`,
            [tenant, slug],
          )
          if (!clash[0]) break
          slug = `${base}-${n}`
        }
        const { rows } = await c.query(
          `INSERT INTO public.sellers
             (tenant_id, seller_type, legal_name, display_name, slug, email, phone, status, approved_at, approved_by)
           VALUES ($1, $2, $3, $3, $4, $5, $6, 'approved', now(), $7::uuid)
           RETURNING id, status, seller_type`,
          [
            tenant, sellerType, app.business_name, slug, app.email, app.phone || null,
            actorId && UUID_RE.test(actorId) ? actorId : null,
          ],
        )
        seller = rows[0]
      }

      await c.query(
        `UPDATE public.seller_partner_applications
            SET status = 'approved'
          WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, applicationId],
      )
      await writeSellerAudit(c, {
        tenantId: tenant, sellerId: seller.id, actorId, ipAddress,
        action: "seller_application.approve", entityType: "seller_partner_application", entityId: applicationId,
        beforeState: { status: app.status },
        afterState: { status: "approved", seller_status: "approved", seller_type: sellerType },
      })
      // Approval provisions the account in the same commit: the
      // capabilities row (defaults — upgrades are granted separately).
      const grants = await provisionSellerGrants(c, {
        tenantId: tenant, sellerId: seller.id, actorId, ipAddress,
      })
      return {
        ok: true,
        seller,
        application: { id: applicationId, status: "approved" },
        provisioning: { capabilities_created: grants.capabilitiesCreated },
        approved_email: app.email,
        approved_business: app.business_name,
      }
    })
    if (!result) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    if (!("error" in result) && (result as any).seller) {
      const post = await afterApproval({
        tenantId: tenant,
        sellerId: (result as any).seller.id,
        email: (result as any).approved_email || null,
        business: (result as any).approved_business || "Seller",
        actorId,
      }).catch(() => ({ portal_link: "unavailable" }))
      ;(result as any).provisioning = { ...(result as any).provisioning, ...post }
      delete (result as any).approved_email
      delete (result as any).approved_business
    }
    return NextResponse.json(result, { status: "error" in result ? result.status || 400 : 200 })
  }

  // ---- Seller-record actions --------------------------------------------
  const id = typeof b.id === "string" ? b.id.trim() : ""
  if (!id) return NextResponse.json({ error: "Missing seller id" }, { status: 400 })

  // Rejecting a seller IS rejecting their application: the decision lands
  // on the application record (matched by the seller's email of record),
  // never as a sellers.status the CHECK forbids.
  if (action === "reject") {
    const result = await withPg(async (c) => {
      const { rows: sellers } = await c.query(
        `SELECT id, email, status, display_name, legal_name FROM public.sellers WHERE tenant_id = $1 AND id = $2::uuid LIMIT 1`,
        [tenant, id],
      )
      const seller = sellers[0]
      if (!seller) return { error: "Seller not found", status: 404 }
      const { rows: apps } = await c.query(
        `SELECT id, status, notes FROM public.seller_partner_applications
          WHERE tenant_id = $1 AND lower(email) = lower($2) AND status = ANY($3::text[])
          ORDER BY created_at DESC LIMIT 1`,
        [tenant, seller.email, [...APPLICATION_OPEN]],
      )
      const app = apps[0]
      if (!app) {
        return {
          error: "Rejection is recorded on the seller's application — this seller has no open application.",
          status: 400,
        }
      }
      const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 500) : ""
      const notes = [app.notes || "", `Rejected${reason ? `: ${reason}` : ""}`]
        .filter(Boolean)
        .join("\n")
      await c.query(
        `UPDATE public.seller_partner_applications
            SET status = 'rejected', notes = $3
          WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, app.id, notes],
      )
      await writeSellerAudit(c, {
        tenantId: tenant, sellerId: id, actorId, ipAddress,
        action: "seller_application.reject", entityType: "seller_partner_application", entityId: app.id,
        beforeState: { status: app.status },
        afterState: { status: "rejected", reason: reason || null },
      })
      await sendRejectionEmail({
        tenantId: tenant,
        to: seller.email,
        business: seller.display_name || seller.legal_name || "there",
        reason,
      })
      return { ok: true, application: { id: app.id, status: "rejected" } }
    })
    if (!result) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    // The decision changes the public store (a seller appears or
    // disappears): bust the shop faces so it renders at once.
    if ("ok" in result) bustPublicShopFaces()
    return NextResponse.json(result, { status: "error" in result ? result.status || 400 : 200 })
  }

  // ---- Termination (A3) --------------------------------------------------
  // A dedicated termination workflow — distinct from suspension (a
  // reversible hold) and from the K2 status override (a field write).
  // Termination is terminal: the seller's status moves to 'closed' (the
  // CHECK vocabulary's terminal value), which removes the seller from
  // every public face (storefront/directory read approved sellers only)
  // and locks the portal shell to its most restricted state. A reason is
  // REQUIRED — termination without a recorded reason and a notice to the
  // seller does not happen. Notice = seller_notifications row the seller
  // reads in-portal; the audit row carries the reason verbatim.
  // Reinstatement is NOT a path back from termination: a terminated
  // seller returns only through a fresh application (A1).
  if (action === "terminate") {
    const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 1000) : ""
    if (!reason) {
      return NextResponse.json(
        { error: "A reason is required — termination without a recorded reason is refused by design." },
        { status: 400 },
      )
    }
    const result = await withPg(async (c) => {
      const { rows: before } = await c.query(
        `SELECT status, email, display_name, legal_name FROM public.sellers WHERE tenant_id = $1 AND id = $2`,
        [tenant, id],
      )
      if (!before[0]) return { error: "Seller not found", status: 404 }
      if (before[0].status === "closed") {
        return { error: "Seller is already terminated (status closed).", status: 409 }
      }
      const { rows } = await c.query(
        `UPDATE public.sellers
            SET status = 'closed', updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING id, status`,
        [tenant, id],
      )
      if (!rows[0]) return { error: "Seller not found", status: 404 }
      await writeSellerAudit(c, {
        tenantId: tenant, sellerId: id, actorId, ipAddress,
        action: "seller.terminated", entityType: "seller", entityId: id,
        beforeState: { status: before[0].status },
        afterState: { status: "closed", reason, notice: "seller_notifications" },
      })
      await notifySeller(
        {
          tenantId: tenant,
          sellerId: id,
          event: "governance",
          type: "seller_terminated",
          title: "Your seller account has been terminated",
          body: `Your seller account on UnSaid Memories has been terminated and is now closed. Reason recorded by the platform: ${reason} If you believe this was made in error, you can appeal through your governance surface or re-apply when eligible.`,
          link: "/seller/governance",
        },
        c,
      )
      return { ok: true, seller: rows[0], terminated: true, reason }
    })
    if (!result) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    // The decision changes the public store (a seller appears or
    // disappears): bust the shop faces so it renders at once.
    if ("ok" in result) bustPublicShopFaces()
    return NextResponse.json(result, { status: "error" in result ? result.status || 400 : 200 })
  }

  const transitions: Record<string, string> = {
    approve: "approved",
    suspend: "suspended",
  }

  // Partner-type assignment (set seller_type directly) — Sunny's vocabulary
  // only; anything else is refused here instead of 23514 at the CHECK.
  if (action === "set_type") {
    const sellerType = String(b.seller_type || "").trim().toLowerCase().replace(/\s+/g, "_") || null
    if (!sellerType || !(SELLER_TYPES as readonly string[]).includes(sellerType)) {
      return NextResponse.json(
        { error: "Seller type must be one of: First party, Manufacturer brand, Supplier, Reseller, Drop shipper." },
        { status: 400 },
      )
    }
    const result = await withPg(async (c) => {
      const { rows: before } = await c.query(
        `SELECT seller_type FROM public.sellers WHERE tenant_id = $1 AND id = $2`,
        [tenant, id],
      )
      if (!before[0]) return { error: "Seller not found" }
      const { rows } = await c.query(
        `UPDATE public.sellers
            SET seller_type = $3, updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING id, seller_type`,
        [tenant, id, sellerType],
      )
      if (!rows[0]) return { error: "Seller not found" }
      await writeSellerAudit(c, {
        tenantId: tenant, sellerId: id, actorId, ipAddress,
        action: "seller.set_type", entityType: "seller", entityId: id,
        beforeState: { seller_type: before[0].seller_type },
        afterState: { seller_type: sellerType },
      })
      return { ok: true, seller: rows[0] }
    })
    if (!result) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    return NextResponse.json(result, { status: "error" in result ? 400 : 200 })
  }

  const nextStatus = transitions[action]
  if (!nextStatus) return NextResponse.json({ error: "Unknown action" }, { status: 400 })

  const result = await withPg(async (c) => {
    const { rows: before } = await c.query(
      `SELECT status, email, display_name, legal_name FROM public.sellers WHERE tenant_id = $1 AND id = $2`,
      [tenant, id],
    )
    if (!before[0]) return { error: "Seller not found" }
    const { rows } = await c.query(
      `UPDATE public.sellers
          SET status = $3,
              approved_at = CASE WHEN $3 = 'approved' THEN now() ELSE approved_at END,
              updated_at = now()
        WHERE tenant_id = $1 AND id = $2
        RETURNING id, status, approved_at`,
      [tenant, id, nextStatus],
    )
    if (!rows[0]) return { error: "Seller not found" }
    await writeSellerAudit(c, {
      tenantId: tenant, sellerId: id, actorId, ipAddress,
      action: `seller.${action}`, entityType: "seller", entityId: id,
      beforeState: { status: before[0].status },
      afterState: { status: nextStatus },
    })
    // The decision must reach the seller in-portal, not just the
    // audit log: suspension hides the seller's shop and products from
    // every public face (the catalog readers gate on this status), and
    // the seller learns why from their notifications + governance
    // surface — the same notice contract termination already keeps.
    if (nextStatus === "suspended") {
      await notifySeller(
        {
          tenantId: tenant,
          sellerId: id,
          event: "governance",
          type: "seller_suspended",
          title: "Your seller account has been suspended",
          body: "Your seller account on UnSaid Memories has been suspended. Your shop page and products are hidden from the public store while the suspension is in effect. Review the platform policies in your governance surface; if you believe this was made in error, you can appeal there.",
          link: "/seller/governance",
        },
        c,
      )
    }
    // Reinstatement (approve from suspended): the seller's shop and
    // products return to the public store — say so in-portal too.
    if (nextStatus === "approved" && before[0].status === "suspended") {
      await notifySeller(
        {
          tenantId: tenant,
          sellerId: id,
          event: "governance",
          type: "seller_reinstated",
          title: "Your seller account has been reinstated",
          body: "Your suspension has been lifted and your seller account is approved again. Your shop page and products are visible in the public store.",
          link: "/seller/dashboard",
        },
        c,
      )
    }
    // An approval decides the seller's open application too — the two
    // records never disagree about the outcome.
    if (nextStatus === "approved" && before[0].email) {
      const { rows: apps } = await c.query(
        `UPDATE public.seller_partner_applications
            SET status = 'approved'
          WHERE tenant_id = $1 AND lower(email) = lower($2) AND status = ANY($3::text[])
          RETURNING id`,
        [tenant, before[0].email, [...APPLICATION_OPEN]],
      )
      for (const app of apps) {
        await writeSellerAudit(c, {
          tenantId: tenant, sellerId: id, actorId, ipAddress,
          action: "seller_application.approve", entityType: "seller_partner_application", entityId: app.id,
          beforeState: {},
          afterState: { status: "approved", via: "seller_approve" },
        })
      }
    }
    // Approval provisions the account in the same commit (capabilities
    // row at defaults), whichever door the approval came through.
    if (nextStatus === "approved") {
      const grants = await provisionSellerGrants(c, {
        tenantId: tenant, sellerId: id, actorId, ipAddress,
      })
      return {
        ok: true,
        seller: rows[0],
        provisioning: { capabilities_created: grants.capabilitiesCreated },
        approved_email: before[0].email || null,
        approved_business: before[0].display_name || before[0].legal_name || "Seller",
      }
    }
    return { ok: true, seller: rows[0] }
  })
  if (!result) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  if (!("error" in result) && (result as any).approved_email !== undefined) {
    const post = await afterApproval({
      tenantId: tenant,
      sellerId: id,
      email: (result as any).approved_email,
      business: (result as any).approved_business || "Seller",
      actorId,
    }).catch(() => ({ portal_link: "unavailable" }))
    ;(result as any).provisioning = { ...(result as any).provisioning, ...post }
    delete (result as any).approved_email
    delete (result as any).approved_business
  }
  if (!("error" in result)) bustPublicShopFaces()
  return NextResponse.json(result, { status: "error" in result ? 400 : 200 })
}
