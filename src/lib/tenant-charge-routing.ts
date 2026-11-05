import "server-only"
import { pgQuery } from "@/lib/pg"
import { MASTER_TENANT_ID } from "@/lib/site-tenant-shared"
import { TENANT_ID } from "@/lib/crm/enterprise"

// ---------------------------------------------------------------------------
// tenant-charge-routing.ts — WHICH Stripe account a tenant's OWN business
// money settles to (owner ruling, 2026-10-17: "a franchise gets everything
// that we have — that means their own Stripe keys for checking out").
//
// A tenant's Stripe connection lives in tenant_stripe_accounts (Stripe
// Connect Express; see src/lib/stripe-connect.ts): the tenant onboards
// THEIR OWN Stripe account and bank there. Until now that account was
// only ever READ by the admin status pages and payroll — every charge
// path (booking checkout) created its Stripe objects on the PLATFORM
// account with no destination, so a franchise tenant's website money
// silently settled to headquarters.
//
// The routing rule, applied by every charge path that takes money for a
// tenant's own business (booking checkout + resume):
//
//   platform    — the platform/master tenant itself. The platform Stripe
//                 account IS this tenant's account; charges are created
//                 exactly as before, no destination.
//   destination — a non-master tenant WITH a connected, charges-enabled
//                 Stripe account. Charges are created on the platform
//                 account as DESTINATION charges
//                 (transfer_data.destination = the tenant's account) —
//                 the same Connect pattern the seller and telemedicine
//                 payout flows use (src/lib/stripe-connect-payloads.ts).
//                 The money settles to the TENANT's Stripe account;
//                 customers and cards on file stay on the platform
//                 account, so cards saved at one location keep working.
//   unconnected — a non-master tenant WITHOUT a ready account. Card
//                 charging must REFUSE with a plain explanation. It must
//                 never fall back to settling the tenant's money on the
//                 platform account silently.
// ---------------------------------------------------------------------------

export type TenantChargeRouting =
  | { mode: "platform" }
  | { mode: "destination"; stripeAccountId: string }
  | { mode: "unconnected" }

export interface TenantStripeAccountRow {
  stripe_account_id: string | null
  charges_enabled: boolean | null
}

/** The platform tenant's charges settle on the platform account: the
 *  master tenant id, or the deployment's env tenant (the same tenant in
 *  every current deployment — SUPABASE_TENANT_ID is the master tenant). */
export function isPlatformTenant(tenantId: string): boolean {
  return tenantId === MASTER_TENANT_ID || tenantId === TENANT_ID()
}

/** Pure derivation: tenant + its Connect row → routing. */
export function chargeRoutingFor(
  tenantId: string,
  row: TenantStripeAccountRow | null,
): TenantChargeRouting {
  if (!tenantId || isPlatformTenant(tenantId)) return { mode: "platform" }
  if (row?.stripe_account_id && row.charges_enabled) {
    return { mode: "destination", stripeAccountId: String(row.stripe_account_id) }
  }
  return { mode: "unconnected" }
}

/** The verbatim loader SQL (exported so proofs run exactly this). */
export const TENANT_STRIPE_ACCOUNT_SQL =
  `SELECT stripe_account_id, charges_enabled FROM public.tenant_stripe_accounts WHERE tenant_id = $1 LIMIT 1`

/** Load the tenant's charge routing from its live Connect row. */
export async function loadTenantChargeRouting(tenantId: string): Promise<TenantChargeRouting> {
  if (!tenantId || isPlatformTenant(tenantId)) return { mode: "platform" }
  const rows = await pgQuery<TenantStripeAccountRow>(TENANT_STRIPE_ACCOUNT_SQL, [tenantId]).catch(
    () => [] as TenantStripeAccountRow[],
  )
  return chargeRoutingFor(tenantId, rows[0] ?? null)
}

/**
 * Stripe params fragment that routes a charge to the tenant's account.
 * Spread into PaymentIntent create params, or into a Checkout session's
 * payment_intent_data. Empty for the platform tenant (unchanged legacy
 * behavior). Callers must refuse on "unconnected" BEFORE creating any
 * Stripe object — this helper returns {} for it so a missed check can
 * never silently misroute money; the refusal is the caller's explicit
 * branch.
 */
export function destinationTransferFields(routing: TenantChargeRouting): {
  transfer_data?: { destination: string }
} {
  return routing.mode === "destination"
    ? { transfer_data: { destination: routing.stripeAccountId } }
    : {}
}

/** Plain-language refusal for card charging at an unconnected tenant —
 *  written for the staff member / customer who sees it, never jargon. */
export const TENANT_STRIPE_NOT_CONNECTED_MESSAGE =
  "This business hasn't finished connecting its own Stripe account, so card payments can't be taken here yet. Connect Stripe for this business first — cash, check, and gift card payments still work."
