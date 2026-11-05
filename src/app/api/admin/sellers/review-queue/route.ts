import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"

export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// §14.15 · Seller Review Queue — the single aggregate surface the tree
// names. Before this route the queue functions lived in three separate
// seats with no combined view:
//   1. seller applications awaiting a decision — seller_partner_applications
//      in 'new'/'submitted' (the /admin/sellers A1 queue's own store);
//   2. verification tasks awaiting a decision — verification_tasks in
//      'pending' plus seller_brand_authorizations in 'pending' (the
//      /admin/sellers/verification desk's stores);
//   3. listing reviews awaiting a decision — seller_listings in
//      'pending_review' plus commerce_catalog_items carrying
//      metadata->>'status' = 'pending_review' (the /admin/listings +
//      /admin/catalog-review seats' stores).
// This route READS all of them and serves counts + the pending items.
// It writes NOTHING: decisions stay on their existing surfaces (deep
// links per item), except application approve/reject, which the queue
// page performs through the EXISTING POST /api/admin/sellers actions
// (approve_application / reject_application) — the sellers route is the
// only place those decision semantics live, and this surface invents
// no new ones.
// ---------------------------------------------------------------------------

const APPLICATION_OPEN = ["new", "submitted"] as const

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read")
  if (denied) return denied
  const tenant = resolveTenantId(req)

  const out = await withPg(async (c) => {
    const applications = (
      await c.query(
        `SELECT id::text AS id, business_name, contact_name, email, phone,
                partner_type, status, created_at::text AS created_at
           FROM public.seller_partner_applications
          WHERE tenant_id = $1 AND status = ANY($2::text[])
          ORDER BY created_at ASC LIMIT 100`,
        [tenant, [...APPLICATION_OPEN]],
      )
    ).rows

    const tasks = (
      await c.query(
        `SELECT t.id::text AS id, t.task_type, t.status,
                t.created_at::text AS created_at,
                s.id::text AS seller_id, s.display_name AS seller_name
           FROM public.verification_tasks t
           JOIN public.sellers s ON s.id = t.seller_id AND s.tenant_id = t.tenant_id
          WHERE t.tenant_id = $1 AND t.status = 'pending'
          ORDER BY t.created_at ASC LIMIT 100`,
        [tenant],
      )
    ).rows

    const brandAuthorizations = (
      await c.query(
        `SELECT a.id::text AS id, a.authorization_type, a.status,
                a.created_at::text AS created_at, b.name AS brand_name,
                s.id::text AS seller_id, s.display_name AS seller_name
           FROM public.seller_brand_authorizations a
           JOIN public.sellers s ON s.id = a.seller_id
           JOIN public.brands b ON b.id = a.brand_id AND b.tenant_id = $1
          WHERE s.tenant_id = $1 AND a.status = 'pending'
          ORDER BY a.created_at ASC LIMIT 100`,
        [tenant],
      )
    ).rows

    const listings = (
      await c.query(
        `SELECT l.id::text AS id, l.title, l.sku, l.status,
                l.created_at::text AS created_at,
                s.id::text AS seller_id, s.display_name AS seller_name
           FROM public.seller_listings l
           LEFT JOIN public.sellers s ON s.id = l.seller_id AND s.tenant_id = l.tenant_id
          WHERE l.tenant_id = $1 AND l.status = 'pending_review'
          ORDER BY l.created_at ASC LIMIT 100`,
        [tenant],
      )
    ).rows

    const catalogItems = (
      await c.query(
        `SELECT ci.id::text AS id, ci.name AS title,
                ci.metadata->>'seller_id' AS seller_id,
                s.display_name AS seller_name,
                ci.created_at::text AS created_at
           FROM public.commerce_catalog_items ci
           LEFT JOIN public.sellers s
             ON s.id::text = ci.metadata->>'seller_id' AND s.tenant_id = ci.tenant_id
          WHERE ci.tenant_id = $1 AND ci.metadata->>'status' = 'pending_review'
          ORDER BY ci.created_at ASC LIMIT 100`,
        [tenant],
      )
    ).rows

    // Wizard visibility (Crew D): attach each application's step packet
    // and uploaded documents so the desk reviews what the wizard filed,
    // not just the intake summary. Guarded — wizard columns and the
    // documents table arrive with migrations 20261123; until
    // they are applied the queue answers exactly as before (no steps,
    // no documents) rather than failing.
    try {
      const wiz = (
        await c.query(
          `SELECT id::text AS id, wizard_steps FROM public.seller_partner_applications
            WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
          [tenant, applications.map((a: any) => a.id)],
        )
      ).rows as { id: string; wizard_steps: unknown }[]
      const byId = new Map(wiz.map((w) => [w.id, w.wizard_steps ?? {}]))
      for (const a of applications as any[]) a.wizard_steps = byId.get(a.id) ?? {}
    } catch { /* wizard columns not applied yet — queue unchanged */ }
    try {
      const docs = (
        await c.query(
          `SELECT id::text AS id, application_id::text AS application_id, step, doc_type,
                  filename, created_at::text AS created_at
             FROM public.partner_application_documents
            WHERE application_kind = 'seller' AND application_id = ANY($1::uuid[])
            ORDER BY step, created_at`,
          [applications.map((a: any) => a.id)],
        )
      ).rows as { application_id: string }[]
      for (const a of applications as any[]) {
        a.documents = docs.filter((d) => d.application_id === a.id)
      }
    } catch {
      for (const a of applications as any[]) a.documents = []
    }

    const verificationPending = tasks.length + brandAuthorizations.length
    const listingPending = listings.length + catalogItems.length
    return {
      counts: {
        applications: applications.length,
        verificationTasks: tasks.length,
        brandAuthorizations: brandAuthorizations.length,
        verification: verificationPending,
        sellerListings: listings.length,
        catalogItems: catalogItems.length,
        listings: listingPending,
        total: applications.length + verificationPending + listingPending,
      },
      applications,
      verification: { tasks, brandAuthorizations },
      listings: { sellerListings: listings, catalogItems },
      decisionSurfaces: {
        applications: "/admin/sellers",
        verification: "/admin/sellers/verification",
        sellerListings: "/admin/listings",
        catalogItems: "/admin/catalog-review",
      },
      note:
        applications.length + verificationPending + listingPending === 0
          ? "Nothing is waiting in any of the three queues. New applications, verification filings, and pending listing reviews appear here the moment they are recorded."
          : null,
    }
  })
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  return NextResponse.json(out)
}
