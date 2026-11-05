import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getStripe } from "@/lib/stripe"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// GET /api/admin/crm/customers/[id]/settings — everything the customer can
// set in their own portal, read back for staff from the SAME stores the
// customer writes (Sunny's ruling, 2026-10-14: a setting the customer
// writes that staff cannot see is a broken contract):
//
//   comms      crm_customers opt-in columns — written by
//              PATCH /api/customer/preferences { comms }
//   booking    crm_customer_preferences (preferred groomer / days / time
//              window / shampoo / cut / special handling / preferred
//              payment method) — written by the same PATCH { booking }
//   contact    crm_customers phone / mobile / email — written by
//              PATCH /api/customer/account
//   addresses  commerce_customer_addresses — written by
//              /api/customer/addresses (the customer's address book)
//   cards      the customer's saved Stripe cards (brand / last4 /
//              expiry / default) via the shop record's stripeCustomerId
//              — the same read /api/customer/payment-methods performs;
//              honest states when Stripe or the link is absent.
//
// Gated: customers module, read. Tenant-scoped on the customer row.
// ============================================================================

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requireModuleApi("customers", "read")
  if (gate) return gate

  try {
    const tenant = resolveTenantId(req)
    const data = await withPg(async (client) => {
      const cust = await client.query(
        `SELECT email, phone, mobile_phone,
                transactional_email_opt_in, transactional_sms_opt_in,
                marketing_email_opt_in, marketing_sms_opt_in,
                preferred_contact_method,
                preferred_staff_id::text AS preferred_staff_id
           FROM public.crm_customers
          WHERE id = $1::uuid AND tenant_id = $2`,
        [id, tenant],
      )
      if (cust.rows.length === 0) return null
      const c = cust.rows[0]

      const prefs = await client.query(
        `SELECT preferred_days,
                preferred_time_start::text AS preferred_time_start,
                preferred_time_end::text AS preferred_time_end,
                preferred_shampoo, preferred_cut_style, special_handling_notes,
                preferred_payment_method,
                preferred_staff_id::text AS preferred_staff_id
           FROM public.crm_customer_preferences WHERE customer_id = $1::uuid`,
        [id],
      )
      const p = prefs.rows[0] || {}

      const groomerId = p.preferred_staff_id || c.preferred_staff_id || null
      let groomerName: string | null = null
      if (groomerId) {
        const g = await client.query(
          `SELECT display_name FROM public.crm_staff WHERE id = $1::uuid`,
          [groomerId],
        )
        groomerName = g.rows[0]?.display_name || null
      }

      const addresses = await client.query(
        `SELECT id::text AS id, address_type, first_name, last_name, company,
                line1, line2, city, state, postal_code, country_code, phone, is_default
           FROM public.commerce_customer_addresses
          WHERE customer_id = $1::uuid
          ORDER BY is_default DESC, created_at DESC`,
        [id],
      )

      const shop = await client.query(
        `SELECT "stripeCustomerId" AS stripe_id FROM public.customers
          WHERE lower(email) = lower($1) AND "stripeCustomerId" IS NOT NULL
          LIMIT 1`,
        [c.email],
      )

      return {
        email: c.email,
        comms: {
          transactionalEmail: c.transactional_email_opt_in !== false,
          transactionalSms: c.transactional_sms_opt_in === true,
          marketingEmail: c.marketing_email_opt_in === true,
          marketingSms: c.marketing_sms_opt_in === true,
          preferredContactMethod: c.preferred_contact_method || null,
        },
        booking: {
          preferredGroomerId: groomerId,
          preferredGroomerName: groomerName,
          preferredDays: Array.isArray(p.preferred_days) ? p.preferred_days : [],
          preferredTimeStart: p.preferred_time_start ? String(p.preferred_time_start).slice(0, 5) : null,
          preferredTimeEnd: p.preferred_time_end ? String(p.preferred_time_end).slice(0, 5) : null,
          preferredShampoo: p.preferred_shampoo || null,
          preferredCutStyle: p.preferred_cut_style || null,
          specialHandling: p.special_handling_notes || null,
          preferredPaymentMethod: p.preferred_payment_method || null,
        },
        contact: {
          phone: c.phone || null,
          mobilePhone: c.mobile_phone || null,
          email: c.email || null,
        },
        addresses: addresses.rows.map((a: any) => ({
          id: a.id,
          addressType: a.address_type,
          name: [a.first_name, a.last_name].filter(Boolean).join(" ") || null,
          company: a.company || null,
          line1: a.line1,
          line2: a.line2 || null,
          city: a.city,
          state: a.state || null,
          postalCode: a.postal_code || null,
          countryCode: a.country_code || null,
          phone: a.phone || null,
          isDefault: a.is_default === true,
        })),
        stripeCustomerId: shop.rows[0]?.stripe_id ? String(shop.rows[0].stripe_id) : null,
      }
    })

    if (!data) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }

    // Saved cards — read from Stripe exactly as the customer's own
    // payment-methods endpoint reads them; never stored locally.
    let cards: { state: string; cards: { id: string; brand: string; last4: string; expMonth: number | null; expYear: number | null; isDefault: boolean }[] }
    const stripe = getStripe()
    if (!stripe) {
      cards = { state: "stripe_not_configured", cards: [] }
    } else if (!data.stripeCustomerId) {
      cards = { state: "no_stripe_customer", cards: [] }
    } else {
      try {
        const [list, customer] = await Promise.all([
          stripe.paymentMethods.list({ customer: data.stripeCustomerId, type: "card", limit: 20 }),
          stripe.customers.retrieve(data.stripeCustomerId),
        ])
        const defaultId =
          customer && !customer.deleted
            ? ((customer as any).invoice_settings?.default_payment_method as string | null) || null
            : null
        cards = {
          state: list.data.length ? "ok" : "no_cards",
          cards: list.data.map((pm) => ({
            id: pm.id,
            brand: pm.card?.brand || "card",
            last4: pm.card?.last4 || "••••",
            expMonth: pm.card?.exp_month ?? null,
            expYear: pm.card?.exp_year ?? null,
            isDefault: defaultId === pm.id,
          })),
        }
      } catch {
        cards = { state: "stripe_error", cards: [] }
      }
    }

    const { stripeCustomerId: _omit, ...rest } = data
    return NextResponse.json({ data: { ...rest, cards } })
  } catch (e: any) {
    console.error("[GET /api/admin/crm/customers/[id]/settings]", e)
    return NextResponse.json({ error: e?.message || "Failed to load customer settings" }, { status: 500 })
  }
}
