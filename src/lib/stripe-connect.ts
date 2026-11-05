import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"

// ---------------------------------------------------------------------------
// tenant_stripe_accounts — one row per tenant (PK: tenant_id) recording that
// business's Stripe Connect (Express) account.
//
// Sunny's model: the master tenant (UnSaid Memories) and every franchise
// tenant links its OWN bank through Stripe Connect onboarding. Bank details
// are collected and held by Stripe — never typed into or stored in this app.
// The connection is what lets a tenant receive dropship order payouts and
// fund payroll.
//
// This module is the only reader/writer of the table. The Stripe webhook
// (account.updated) keeps the cached flags in sync between admin visits.
// ---------------------------------------------------------------------------

export interface TenantStripeAccount {
  tenant_id: string
  stripe_account_id: string
  charges_enabled: boolean
  payouts_enabled: boolean
  onboarding_complete: boolean
  created_at: string
  updated_at: string
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getSupabase(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseKey) return null
  return createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** The tenant's Connect row, or null when the tenant has never connected. */
export async function getTenantStripeAccount(
  tenantId: string,
): Promise<TenantStripeAccount | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("tenant_stripe_accounts")
    .select("*")
    .eq("tenant_id", tenantId)
    .limit(1)
  if (error) {
    console.error("[stripe-connect] read failed:", error.message)
    return null
  }
  return (data?.[0] as TenantStripeAccount) || null
}

/** Insert the row for a freshly created Connect account. */
export async function insertTenantStripeAccount(
  tenantId: string,
  stripeAccountId: string,
): Promise<TenantStripeAccount | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("tenant_stripe_accounts")
    .insert({ tenant_id: tenantId, stripe_account_id: stripeAccountId })
    .select("*")
  if (error) {
    console.error("[stripe-connect] insert failed:", error.message)
    return null
  }
  return (data?.[0] as TenantStripeAccount) || null
}

/**
 * Copy the live flags from a retrieved Stripe account into the tenant's row.
 * onboarding_complete tracks Stripe's details_submitted — the point at which
 * the business has finished Connect onboarding.
 */
export async function syncTenantStripeAccount(
  tenantId: string,
  account: Stripe.Account,
): Promise<TenantStripeAccount | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from("tenant_stripe_accounts")
    .update({
      charges_enabled: !!account.charges_enabled,
      payouts_enabled: !!account.payouts_enabled,
      onboarding_complete: !!account.details_submitted,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .select("*")
  if (error) {
    console.error("[stripe-connect] sync failed:", error.message)
    return null
  }
  return (data?.[0] as TenantStripeAccount) || null
}

/**
 * Webhook path: an account.updated event carries only the Stripe account, so
 * sync by stripe_account_id. Uses the caller's Supabase client (the webhook
 * already holds one). No-op when no tenant row matches the account.
 */
export async function syncTenantStripeAccountByStripeId(
  supabase: SupabaseClient,
  account: Stripe.Account,
): Promise<void> {
  const { error } = await supabase
    .from("tenant_stripe_accounts")
    .update({
      charges_enabled: !!account.charges_enabled,
      payouts_enabled: !!account.payouts_enabled,
      onboarding_complete: !!account.details_submitted,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_account_id", account.id)
  if (error) {
    console.error("[stripe-connect] webhook sync failed:", error.message)
  }
}
