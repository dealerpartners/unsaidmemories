import { withPg } from "@/lib/crm/enterprise"
import { pgQuery } from "@/lib/pg"
import { getStripe } from "@/lib/stripe"
import { MASTER_TENANT_ID } from "@/lib/site-tenant-shared"
import {
  ensureAuthUser,
  upsertPortalUser,
  issueIdentityGrant,
} from "@/app/api/admin/onboarding/_provision"

// ============================================================================
// Leashed business-tenant provisioning (design: tenant-provisioning-design-
// 2026-10-21.md). ONE idempotent sequence that turns an approved, completed
// business onboarding case (engine type "franchise" — the Leashed intake)
// into a live tenant:
//
//   tenants row (child of the master tenant, slug drives <slug>.unsaidmemories.com)
//   + Stripe customer + Leashed subscription ($79/mo doctrine price; the
//     Stripe price OBJECT is resolved from app_settings — see below)
//   + sellers row on the CHILD tenant (the marketplace face: catalog items
//     stamp metadata.seller_id, and the public catalog gate joins sellers →
//     tenants, so subscription lockout hides listings with no second gate)
//   + organizations bridge row (dev/ad surfaces share the tenant)
//   + tenant_locations primary row from the onboarding answers
//   + owner: auth user → portal_users (franchise_owner, is_owner) →
//     identity grant → tenant_memberships (owner) → crm_staff owner
//   + portal_module_permissions for the BUSINESS module set only
//
// Idempotency: every write is find-or-create keyed on a stable anchor —
// slug+owner for the tenant, (tenant_id, user_id) for people,
// (tenant_id, module_key) for grants, the tenant's own stamped Stripe ids
// for billing. Re-running the sequence for the same business fills gaps
// and changes nothing that already exists.
//
// Billing honesty: the Leashed Stripe price id is read from the
// app_settings key `leashed.stripe_price_id`. If it is not configured the
// sequence refuses with LEASHED_PRICE_NOT_CONFIGURED before writing
// anything — no invented price id, no free tenant. Terms (Sunny's ruling
// 2026-10-23): the subscription starts on a 30-day free trial ($0 today,
// card collected up front) and auto-renews at the configured price
// ($79/month) when the trial ends; with no card on file the trial
// cancels at its end instead of converting unpaid.
// ============================================================================

export const LEASHED_PRICE_SETTING_KEY = "leashed.stripe_price_id"

/** Slugs that can never be issued to a tenant (platform hosts + services). */
export const RESERVED_TENANT_SLUGS = new Set([
  "www", "learn", "api", "admin", "app", "support", "docs", "mail",
  "all-about-portal", "unsaid", "staging", "dev", "blog", "shop", "book",
  "partners", "seller", "customer", "employee", "vet", "ads", "auth",
])

/**
 * The business module set a Leashed tenant's owner is granted — the
 * module vocabulary of the existing franchise activation grants
 * (src/app/api/admin/onboarding/_provision.ts FRANCHISE_OWNER_MODULES,
 * plus "leads", which that list folds into CRM but the design names as
 * the tenant's own lead queue), MINUS everything the design grades
 * platform-only: MASTER_ONLY_MODULES (src/lib/franchise-access.ts —
 * sellers, trust_safety, ai_ops, policies) are never granted, and "lms"
 * (Learning Academy) is NOT in the tenant set by the design's explicit
 * ruling. Platform-only modules get no rows at all — absent, not hidden.
 */
export const LEASHED_BUSINESS_MODULES = [
  "crm", "customers", "leads", "appointments", "communications",
  "accounting", "payments", "invoices", "deposits", "refunds_disputes",
  "gift_cards_credits", "orders", "inventory", "products_services",
  "purchasing", "shipping", "marketing", "analytics", "reports",
  "staff_groomer_management",
] as const

export function slugifyTenantName(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)
}

type PgClientLike = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>
}

async function columnExists(client: PgClientLike, table: string, column: string): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2 LIMIT 1`,
    [table, column],
  )
  return (r.rowCount ?? r.rows.length) > 0
}

async function tableExists(client: PgClientLike, table: string): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
    [table],
  )
  return (r.rowCount ?? r.rows.length) > 0
}

/**
 * Resolve the Leashed subscription price from app_settings. The value may
 * be a bare price id string ("price_…") or an object carrying one
 * ({ price_id } / { stripe_price_id } / { id }). Returns null when the
 * setting is absent or malformed — callers must treat null as
 * NOT_CONFIGURED, never substitute a price.
 */
export async function resolveLeashedStripePriceId(): Promise<string | null> {
  try {
    const rows = await pgQuery<{ value: unknown }>(
      `SELECT value FROM public.app_settings WHERE key = $1 LIMIT 1`,
      [LEASHED_PRICE_SETTING_KEY],
    )
    const v = rows[0]?.value as any
    const candidate =
      typeof v === "string" ? v :
      v && typeof v === "object" ? (v.price_id || v.stripe_price_id || v.id || null) : null
    return typeof candidate === "string" && candidate.startsWith("price_") ? candidate : null
  } catch {
    return null
  }
}

export interface BusinessTenantInput {
  caseId: string
  businessName: string
  ownerName: string | null
  ownerEmail: string
  ownerPhone: string | null
  actor: string
  /** Merged onboarding answers (gate data); location + Connect read here. */
  answers: Record<string, any>
}

export type BusinessTenantResult =
  | {
      ok: true
      tenantId: string
      slug: string
      sellerId: string | null
      organizationId: string | null
      portalUserId: string | null
      moduleGrants: number
      stripeCustomerId: string | null
      stripeSubscriptionId: string | null
      subscriptionStatus: string | null
      reusedTenant: boolean
    }
  | { ok: false; code: "LEASHED_PRICE_NOT_CONFIGURED" | "STRIPE_NOT_CONFIGURED" | "DB_UNAVAILABLE" | "INVALID_INPUT"; error: string }

function firstLocation(answers: Record<string, any>): Record<string, any> {
  const loc = Array.isArray(answers?.locations) ? answers.locations[0] : null
  return (loc && typeof loc === "object" ? loc : {}) as Record<string, any>
}

function connectAccountFromAnswers(answers: Record<string, any>): string | null {
  const keys = ["stripe_connect_account_id", "connect_account_id", "stripe_account_id", "connect_id"]
  for (const k of keys) {
    const v = answers?.[k]
    if (typeof v === "string" && v.startsWith("acct_")) return v
  }
  return null
}

/**
 * The card the business put on file during onboarding, when the answers
 * carry one (a Stripe payment-method id). Falls back to whatever card
 * the Stripe customer already carries — see the subscription step.
 */
function paymentMethodFromAnswers(answers: Record<string, any>): string | null {
  const keys = ["stripe_payment_method_id", "payment_method_id", "card_payment_method_id", "paymentMethodId"]
  for (const k of keys) {
    const v = answers?.[k]
    if (typeof v === "string" && v.startsWith("pm_")) return v
  }
  return null
}

/**
 * Provision (or complete the provisioning of) the Leashed business tenant
 * for one completed onboarding case. Safe to call repeatedly.
 */
export async function provisionBusinessTenant(input: BusinessTenantInput): Promise<BusinessTenantResult> {
  const businessName = (input.businessName || "").trim()
  const ownerEmail = (input.ownerEmail || "").trim().toLowerCase()
  if (!businessName || !ownerEmail.includes("@")) {
    return { ok: false, code: "INVALID_INPUT", error: "A business name and owner email are required to provision a tenant." }
  }

  const priceId = await resolveLeashedStripePriceId()
  if (!priceId) {
    return {
      ok: false, code: "LEASHED_PRICE_NOT_CONFIGURED",
      error: `Leashed billing is not configured: set the app_settings key "${LEASHED_PRICE_SETTING_KEY}" to the Stripe price id for the Leashed monthly plan, then re-run activation. No tenant was created.`,
    }
  }
  const stripe = getStripe()
  if (!stripe) {
    return { ok: false, code: "STRIPE_NOT_CONFIGURED", error: "Stripe is not configured (STRIPE_SECRET_KEY) — cannot create the tenant's billing customer/subscription. No tenant was created." }
  }

  // Step 1 — the auth user first (portal_users.user_id is NOT NULL), the
  // same ordering discipline as the engine's activation provisioning.
  const auth = await ensureAuthUser(ownerEmail, input.ownerName || businessName)

  const loc = firstLocation(input.answers)
  const connectAccountId = connectAccountFromAnswers(input.answers)

  const result = await withPg(async (client) => {
    // --- Tenant: find-or-create, anchored on slug + owner ---------------
    const baseSlug = slugifyTenantName(businessName) || "leashed-business"
    let tenantId: string | null = null
    let slug = baseSlug
    let reusedTenant = false
    for (let n = 1; ; n++) {
      const candidate = n === 1 ? baseSlug : `${baseSlug}-${n}`
      if (RESERVED_TENANT_SLUGS.has(candidate)) continue
      const taken = await client.query(
        `SELECT id::text AS id FROM public.tenants WHERE slug = $1 LIMIT 1`,
        [candidate],
      )
      if (!taken.rows[0]) { slug = candidate; break }
      // Candidate taken: it is THIS business's tenant when its owner
      // portal user carries the owner's email — reuse and complete it.
      const owner = await client.query(
        `SELECT 1 FROM public.portal_users WHERE tenant_id = $1::uuid AND lower(email) = $2 AND is_owner LIMIT 1`,
        [taken.rows[0].id, ownerEmail],
      )
      if ((owner.rowCount ?? 0) > 0) {
        tenantId = taken.rows[0].id
        slug = candidate
        reusedTenant = true
        break
      }
    }

    const hasKind = await columnExists(client, "tenants", "tenant_kind")
    const hasPlan = await columnExists(client, "tenants", "plan_tier")
    const hasConnect = await columnExists(client, "tenants", "stripe_connect_account_id")

    if (!tenantId) {
      const cols = ["parent_tenant_id", "tenant_type", "name", "slug", "status"]
      const vals: unknown[] = [MASTER_TENANT_ID, "franchise", businessName, slug, "active"]
      // tenants_tenant_kind_check allows 'individual' | 'organization'
      // only — a Leashed business tenant is an organization. Writing
      // 'business' violated the CHECK and every Leashed provisioning
      // died inside withPg, surfacing as DB_UNAVAILABLE.
      if (hasKind) { cols.push("tenant_kind"); vals.push("organization") }
      if (hasPlan) { cols.push("plan_tier"); vals.push("leashed") }
      if (hasConnect && connectAccountId) { cols.push("stripe_connect_account_id"); vals.push(connectAccountId) }
      const ph = vals.map((_, i) => `$${i + 1}`).join(", ")
      const ins = await client.query(
        `INSERT INTO public.tenants (${cols.join(", ")}) VALUES (${ph}) RETURNING id::text AS id`,
        vals,
      )
      tenantId = ins.rows[0].id
      // Brand/starter columns, guarded exactly as the existing activation.
      if (await columnExists(client, "tenants", "template_key")) {
        await client.query(`UPDATE public.tenants SET template_key='house' WHERE id=$1::uuid`, [tenantId])
      }
      const brandCols = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants' AND column_name IN ('support_email','support_phone')`,
      )
      if ((brandCols.rowCount ?? 0) === 2) {
        await client.query(
          `UPDATE public.tenants SET support_email=$2, support_phone=$3 WHERE id=$1::uuid`,
          [tenantId, ownerEmail, input.ownerPhone],
        )
      }
    } else {
      // Reuse: fill only what is missing, never overwrite live values.
      if (hasKind) await client.query(`UPDATE public.tenants SET tenant_kind = COALESCE(tenant_kind, 'organization') WHERE id=$1::uuid`, [tenantId])
      if (hasPlan) await client.query(`UPDATE public.tenants SET plan_tier = COALESCE(plan_tier, 'leashed') WHERE id=$1::uuid`, [tenantId])
      if (hasConnect && connectAccountId) {
        await client.query(`UPDATE public.tenants SET stripe_connect_account_id = COALESCE(stripe_connect_account_id, $2) WHERE id=$1::uuid`, [tenantId, connectAccountId])
      }
    }

    // --- Stripe: customer + subscription, reusing stamped ids ----------
    const tRow = await client.query(
      `SELECT stripe_customer_id, stripe_subscription_id, subscription_status FROM public.tenants WHERE id=$1::uuid`,
      [tenantId],
    )
    let stripeCustomerId: string | null = tRow.rows[0]?.stripe_customer_id || null
    let stripeSubscriptionId: string | null = tRow.rows[0]?.stripe_subscription_id || null
    let subscriptionStatus: string | null = tRow.rows[0]?.subscription_status || null

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: ownerEmail,
        name: businessName,
        phone: input.ownerPhone || undefined,
        metadata: { leashed_tenant_slug: slug, onboarding_case_id: input.caseId },
      })
      stripeCustomerId = customer.id
    }
    if (!stripeSubscriptionId) {
      // Trial terms (Sunny's ruling 2026-10-23): 30-day free trial, $0
      // today, card collected up front, auto-renews at the $79 price
      // when the trial ends. Put the card on file BEFORE the trial
      // starts: a payment method named in the onboarding answers wins,
      // else the first card the Stripe customer already carries; either
      // is attached (if needed) and set as the customer's default.
      // No card anywhere → trial_settings cancels the subscription at
      // trial end rather than converting it unpaid (no card, no trial).
      let paymentMethodId = paymentMethodFromAnswers(input.answers)
      if (!paymentMethodId) {
        const carried = await stripe.paymentMethods.list({ customer: stripeCustomerId, type: "card", limit: 1 })
        paymentMethodId = carried.data[0]?.id || null
      }
      if (paymentMethodId) {
        const attachedList = await stripe.paymentMethods.list({ customer: stripeCustomerId, limit: 100 })
        if (!attachedList.data.some((pm) => pm.id === paymentMethodId)) {
          await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId })
        }
        await stripe.customers.update(stripeCustomerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        })
      }
      const sub = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{ price: priceId }],
        trial_period_days: 30,
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
        metadata: { type: "leashed_tenant", tenant_slug: slug, onboarding_case_id: input.caseId },
      })
      stripeSubscriptionId = sub.id
      subscriptionStatus = sub.status
    } else if (!subscriptionStatus) {
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId)
      subscriptionStatus = sub.status
    }
    await client.query(
      `UPDATE public.tenants
          SET stripe_customer_id = $2, stripe_subscription_id = $3, subscription_status = $4
        WHERE id = $1::uuid`,
      [tenantId, stripeCustomerId, stripeSubscriptionId, subscriptionStatus],
    )

    // --- Marketplace face: sellers row on the CHILD tenant ---------------
    let sellerId: string | null = null
    if (await tableExists(client, "sellers")) {
      const ex = await client.query(
        `SELECT id::text AS id FROM public.sellers WHERE tenant_id=$1::uuid AND lower(email)=$2 LIMIT 1`,
        [tenantId, ownerEmail],
      )
      if (ex.rows[0]) {
        sellerId = ex.rows[0].id
      } else {
        let sellerSlug = slug
        for (let n = 2; ; n++) {
          const clash = await client.query(
            `SELECT 1 FROM public.sellers WHERE tenant_id=$1::uuid AND slug=$2 LIMIT 1`,
            [tenantId, sellerSlug],
          )
          if (!clash.rows[0]) break
          sellerSlug = `${slug}-${n}`
        }
        const ins = await client.query(
          // sellers.seller_type CHECK vocabulary: a business tenant's
          // marketplace face is 'business_seller' — 'business' violated
          // the CHECK and killed provisioning at this insert (the same
          // invented-vocabulary family as tenant_kind 'business').
          `INSERT INTO public.sellers (tenant_id, seller_type, legal_name, display_name, slug, email, phone, status, approved_at)
           VALUES ($1::uuid, 'business_seller', $2, $2, $3, $4, $5, 'approved', now()) RETURNING id::text AS id`,
          [tenantId, businessName, sellerSlug, ownerEmail, input.ownerPhone],
        )
        sellerId = ins.rows[0].id
      }
      if (sellerId && (await tableExists(client, "seller_users"))) {
        await client.query(
          `INSERT INTO public.seller_users (tenant_id, seller_id, user_id, email, name, role, status)
           SELECT $1::uuid, $2::uuid, $3::uuid, $4, $5, 'owner', 'active'
            WHERE NOT EXISTS (
              SELECT 1 FROM public.seller_users WHERE seller_id=$2::uuid AND lower(email)=$4
            )`,
          [tenantId, sellerId, auth.userId, ownerEmail, input.ownerName || businessName],
        )
      }
    }

    // --- Organizations bridge (dev/ad surfaces share the tenant) ---------
    let organizationId: string | null = null
    if (await tableExists(client, "organizations")) {
      const ex = await client.query(
        `SELECT id::text AS id FROM public.organizations WHERE tenant_id=$1::uuid LIMIT 1`,
        [tenantId],
      )
      if (ex.rows[0]) {
        organizationId = ex.rows[0].id
      } else {
        let orgSlug = slug
        for (let n = 2; ; n++) {
          const clash = await client.query(
            `SELECT 1 FROM public.organizations WHERE slug=$1 LIMIT 1`,
            [orgSlug],
          )
          if (!clash.rows[0]) break
          orgSlug = `${slug}-${n}`
        }
        const ins = await client.query(
          `INSERT INTO public.organizations (name, slug, tenant_id) VALUES ($1, $2, $3::uuid) RETURNING id::text AS id`,
          [businessName, orgSlug, tenantId],
        )
        organizationId = ins.rows[0].id
      }
    }

    // --- Location from onboarding answers (tenant-scoped) ----------------
    if (await tableExists(client, "tenant_locations")) {
      const ex = await client.query(
        `SELECT id::text AS id FROM public.tenant_locations WHERE tenant_id=$1::uuid AND is_primary LIMIT 1`,
        [tenantId],
      )
      if (!ex.rows[0]) {
        const address = {
          line1: loc.line1 || loc.address_line1 || input.answers.address_line1 || "",
          line2: loc.line2 || loc.address_line2 || "",
          city: loc.city || input.answers.city || "",
          state: loc.state || input.answers.state || "",
          postal_code: loc.postal_code || loc.zip || input.answers.postal_code || "",
          phone: input.ownerPhone || "",
          email: ownerEmail,
        }
        await client.query(
          `INSERT INTO public.tenant_locations (tenant_id, name, address, timezone, is_primary, is_active)
           VALUES ($1::uuid, $2, $3::jsonb, 'America/Chicago', true, true)`,
          [tenantId, `${businessName} — Main`, JSON.stringify(address)],
        )
      }
    }

    // --- Owner: portal user + grant + membership + staff ------------------
    // tenantId is always set by here (reused in the slug loop or
    // inserted in the !tenantId branch above); the guard makes that
    // invariant explicit for the typed calls below.
    if (!tenantId) throw new Error("tenant provisioning lost its tenant id")
    const portalUserId = await upsertPortalUser(client as any, {
      tenantId, userId: auth.userId, roleType: "franchise_owner", portal: "admin",
      displayName: input.ownerName || businessName, email: ownerEmail,
      phone: input.ownerPhone, isOwner: true, actor: input.actor,
    })
    await issueIdentityGrant(client as any, {
      userId: auth.userId, tenantId,
      displayName: input.ownerName || businessName,
      scope: "admin", role: "admin", membershipRole: "owner",
    })
    if (await tableExists(client, "tenant_memberships")) {
      await client.query(
        `INSERT INTO public.tenant_memberships (id, tenant_id, user_id, role, active, status, mfa_enabled, created_at, updated_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'owner', true, 'active', false, now(), now())
         ON CONFLICT (tenant_id, user_id)
         DO UPDATE SET role='owner', active=true, status='active', updated_at=now()`,
        [tenantId, auth.userId],
      )
    }

    // --- Entitlements: the business module set, nothing else --------------
    let moduleGrants = 0
    if (await tableExists(client, "portal_module_permissions")) {
      for (const code of LEASHED_BUSINESS_MODULES) {
        const ins = await client.query(
          `INSERT INTO public.portal_module_permissions (tenant_id, portal_user_id, module_key, permission_level)
           SELECT $1::uuid, $2::uuid, $3, 'all'
            WHERE NOT EXISTS (
              SELECT 1 FROM public.portal_module_permissions
               WHERE tenant_id=$1::uuid AND portal_user_id=$2::uuid AND module_key=$3
            )`,
          [tenantId, portalUserId, code],
        )
        moduleGrants += ins.rowCount || 0
      }
    }

    if (await tableExists(client, "crm_staff")) {
      const existing = await client.query(
        `SELECT id::text AS id FROM public.crm_staff WHERE tenant_id=$1::uuid AND user_id=$2::uuid LIMIT 1`,
        [tenantId, auth.userId],
      )
      if (!existing.rows[0]) {
        const parts = (input.ownerName || businessName).split(/\s+/).filter(Boolean)
        await client.query(
          `INSERT INTO public.crm_staff (id, tenant_id, user_id, display_name, first_name, last_name, email, phone, role, is_service_staff, is_active)
           VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5, $6, $7, 'owner', false, true)`,
          [tenantId, auth.userId, input.ownerName || businessName, parts[0] || businessName, parts.slice(1).join(" ") || null, ownerEmail, input.ownerPhone],
        )
      }
    }
    if (await tableExists(client, "portal_permission_audit_log")) {
      await client.query(
        `INSERT INTO public.portal_permission_audit_log (tenant_id, portal_user_id, action, details)
         VALUES ($1::uuid, $2::uuid, 'leashed_tenant_provisioning', $3::jsonb)`,
        [MASTER_TENANT_ID, portalUserId, JSON.stringify({ case_id: input.caseId, tenant_id: tenantId, slug, actor: input.actor, reused: reusedTenant })],
      ).catch(() => {})
    }

    return {
      tenantId, slug, sellerId, organizationId, portalUserId, moduleGrants,
      stripeCustomerId, stripeSubscriptionId, subscriptionStatus, reusedTenant,
    }
  })

  if (!result) return { ok: false, code: "DB_UNAVAILABLE", error: "Database unavailable during tenant provisioning." }
  return { ok: true, ...result }
}

// ============================================================================
// Subscription enforcement read (design step 6): a business tenant whose
// Leashed subscription is not active/trialing is LOCKED — its portal shows
// the billing notice and the catalog gate hides its listings. The master
// tenant carries no subscription and is never locked. Tenants with no
// subscription on record (pre-Leashed legacy rows) are not locked by this
// read: absence of a subscription id means billing was never attached,
// which is a platform-ops state, not a delinquency.
// ============================================================================

export async function tenantSubscriptionState(
  tenantId: string,
): Promise<{ status: string | null; locked: boolean }> {
  if (!tenantId || tenantId === MASTER_TENANT_ID) return { status: null, locked: false }
  try {
    const rows = await pgQuery<{ subscription_status: string | null; stripe_subscription_id: string | null }>(
      `SELECT subscription_status, stripe_subscription_id FROM public.tenants WHERE id=$1::uuid LIMIT 1`,
      [tenantId],
    )
    const r = rows[0]
    if (!r || !r.stripe_subscription_id) return { status: r?.subscription_status ?? null, locked: false }
    const locked = r.subscription_status !== "active" && r.subscription_status !== "trialing"
    return { status: r.subscription_status, locked }
  } catch {
    return { status: null, locked: false }
  }
}
