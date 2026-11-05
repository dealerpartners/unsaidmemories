import { withPg } from "@/lib/crm/enterprise"

// ============================================================================
// Groomer activation (Crew D) — approving a grooming_partner_applications
// row provisions the partner exactly the way the franchise signup (S7,
// /api/admin/franchise/signup) provisions a franchisee:
//
//   franchise type → child tenant (tenant_type 'franchise', parent =
//   master) + template_key 'house' + brand columns from the application
//   + franchise_locations row + franchise_agreements row (pending) +
//   tenant_locations primary row + portal_users franchise_owner +
//   portal_module_permissions grants for every franchise-scope module +
//   crm_staff 'owner' record + portal_permission_audit_log row. The
//   application is stamped approved with activated_tenant_id set.
//
//   lead_only type → no tenant: the application is stamped 'active'
//   (lead routing reads grooming_partner_applications by zip codes
//   served for active partners).
//
// Counts in the returned summary come from actual insert results.
// ============================================================================

const FRANCHISE_OWNER_MODULES = [
  "crm", "customers", "leads", "appointments", "communications",
  "accounting", "payments", "invoices", "deposits", "refunds_disputes",
  "gift_cards_credits", "orders", "inventory", "products_services",
  "purchasing", "shipping", "marketing", "analytics", "reports",
  "staff_groomer_management",
]

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)
}

async function tableExists(client: any, table: string): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
    [table],
  )
  return r.rowCount > 0
}

export interface GroomerApplication {
  id: string
  tenant_id: string
  business_name: string
  contact_name: string
  email: string
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  partner_type: string
  status: string
  activated_tenant_id: string | null
}

export type ActivationResult =
  | { ok: true; mode: "franchise"; tenantId: string; slug: string; provisioning: Record<string, unknown> }
  | { ok: true; mode: "lead_only" }
  | { ok: false; status: number; error: string }

export async function activateGroomer(
  app: GroomerApplication,
  actor: string,
): Promise<ActivationResult> {
  if (app.status === "approved" || app.status === "active") {
    return { ok: false, status: 409, error: "This application has already been activated." }
  }
  if (app.partner_type === "lead_only") {
    const { pgQueryStrict } = await import("@/lib/pg")
    await pgQueryStrict(
      `update public.grooming_partner_applications
          set status = 'active', reviewed_by = $2, reviewed_at = now()
        where id = $1::uuid`,
      [app.id, actor],
    )
    return { ok: true, mode: "lead_only" }
  }

  const result = await withPg(async (client) => {
    const master = await client.query(
      `SELECT id::text AS id FROM public.tenants WHERE slug='all-about-pawz' LIMIT 1`,
    )
    const masterId: string = master.rows[0]?.id || app.tenant_id

    let slug = slugify(app.business_name) || "grooming-partner"
    const clash = await client.query(
      `SELECT 1 FROM public.tenants WHERE slug=$1 UNION SELECT 1 FROM public.franchise_locations WHERE slug=$1 LIMIT 1`,
      [slug],
    )
    if ((clash.rowCount || 0) > 0) slug = `${slug}-${app.id.slice(0, 4)}`

    const t = await client.query(
      `INSERT INTO public.tenants (parent_tenant_id, tenant_type, name, slug, status)
       VALUES ($1::uuid, 'franchise', $2, $3, 'active') RETURNING id::text AS id`,
      [masterId, app.business_name, slug],
    )
    const tenantId: string = t.rows[0].id

    // Starter template + brand columns (guarded, same as S7 §1b/1c).
    let templateAssigned = false
    const colCheck = await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name='template_key' LIMIT 1`,
    )
    if ((colCheck.rowCount || 0) > 0) {
      await client.query(`UPDATE public.tenants SET template_key='house' WHERE id=$1::uuid`, [tenantId])
      templateAssigned = true
    }
    const brandCols = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name IN ('support_email','support_phone')`,
    )
    let brandInitialized = false
    if ((brandCols.rowCount || 0) === 2) {
      await client.query(
        `UPDATE public.tenants SET support_email=$2, support_phone=$3 WHERE id=$1::uuid`,
        [tenantId, app.email || null, app.phone || null],
      )
      brandInitialized = true
    }

    const fl = await client.query(
      `INSERT INTO public.franchise_locations
         (tenant_id, parent_tenant_id, business_name, slug, address_line1, city, state, postal_code, phone, email, status)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
       RETURNING id::text AS id`,
      [tenantId, masterId, app.business_name, slug, app.address, app.city, app.state, app.zip, app.phone, app.email],
    )
    const franchiseLocationId: string = fl.rows[0].id

    let agreementId: string | null = null
    if (await tableExists(client, "franchise_agreements")) {
      const ag = await client.query(
        `INSERT INTO public.franchise_agreements (tenant_id, parent_tenant_id, agreement_type, status, fee_schedule)
         VALUES ($1::uuid, $2::uuid, 'franchise', 'pending', '{}'::jsonb) RETURNING id::text AS id`,
        [tenantId, masterId],
      )
      agreementId = ag.rows[0]?.id || null
    }

    let locationId: string | null = null
    if (await tableExists(client, "tenant_locations")) {
      const address = {
        line1: app.address || "", line2: "", city: app.city || "", state: app.state || "",
        postal_code: app.zip || "", phone: app.phone || "", email: app.email || "",
      }
      const loc = await client.query(
        `INSERT INTO public.tenant_locations (tenant_id, name, address, timezone, is_primary, is_active)
         VALUES ($1::uuid, $2, $3::jsonb, 'America/Chicago', true, true) RETURNING id::text AS id`,
        [tenantId, `${app.business_name} — Main`, JSON.stringify(address)],
      )
      locationId = loc.rows[0]?.id || null
    }

    let portalUserId: string | null = null
    let moduleGrants = 0
    let staffRecord: string | null = null
    if (await tableExists(client, "portal_users")) {
      const pu = await client.query(
        `INSERT INTO public.portal_users (tenant_id, role_type, portal, display_name, email, phone, is_owner, is_active)
         VALUES ($1::uuid, 'franchise_owner', 'admin', $2, $3, $4, true, true) RETURNING id::text AS id`,
        [tenantId, app.contact_name, app.email, app.phone],
      )
      portalUserId = pu.rows[0]?.id || null
      if (portalUserId) {
        await client.query(
          `UPDATE public.franchise_locations SET owner_portal_user_id=$1::uuid WHERE id=$2::uuid`,
          [portalUserId, franchiseLocationId],
        )
        if (await tableExists(client, "portal_module_permissions")) {
          for (const code of FRANCHISE_OWNER_MODULES) {
            const ins = await client.query(
              `INSERT INTO public.portal_module_permissions (tenant_id, portal_user_id, module_key, permission_level)
               VALUES ($1::uuid, $2::uuid, $3, 'all')`,
              [tenantId, portalUserId, code],
            )
            moduleGrants += ins.rowCount || 0
          }
        }
        if (await tableExists(client, "crm_staff")) {
          const parts = app.contact_name.split(/\s+/).filter(Boolean)
          const ins = await client
            .query(
              `INSERT INTO public.crm_staff (id, tenant_id, display_name, first_name, last_name, email, phone, role, is_service_staff, is_active)
               VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4, $5, $6, 'owner', true, true) RETURNING id::text AS id`,
              [tenantId, app.contact_name, parts[0] || app.contact_name, parts.slice(1).join(" ") || null, app.email, app.phone],
            )
          staffRecord = ins?.rows?.[0]?.id || null
        }
        if (await tableExists(client, "portal_permission_audit_log")) {
          await client
            .query(
              `INSERT INTO public.portal_permission_audit_log (tenant_id, portal_user_id, action, details)
               VALUES ($1::uuid, $2::uuid, 'groomer_franchise_activation', $3::jsonb)`,
              [masterId, portalUserId, JSON.stringify({ application_id: app.id, slug, tenant_id: tenantId, actor })],
            )
            .catch(() => {})
        }
      }
    }

    await client.query(
      `UPDATE public.grooming_partner_applications
          SET status='approved', activated_tenant_id=$2::uuid, reviewed_by=$3, reviewed_at=now()
        WHERE id=$1::uuid`,
      [app.id, tenantId, actor],
    )

    return {
      tenantId,
      slug,
      provisioning: {
        tenants: 1, franchise_locations: 1,
        agreements: agreementId ? 1 : 0, locations: locationId ? 1 : 0,
        portal_users: portalUserId ? 1 : 0, module_grants: moduleGrants,
        staff_record: !!staffRecord, template_assigned: templateAssigned,
        brand_initialized: brandInitialized,
      },
    }
  })

  if (!result) return { ok: false, status: 502, error: "Database unavailable." }
  if ((result as any).error) return { ok: false, status: 400, error: (result as any).error }
  const r = result as { tenantId: string; slug: string; provisioning: Record<string, unknown> }
  return { ok: true, mode: "franchise", tenantId: r.tenantId, slug: r.slug, provisioning: r.provisioning }
}
