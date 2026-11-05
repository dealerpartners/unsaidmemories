import Stripe from "stripe";
import { createServerClient } from "@/lib/supabase";
import { getIntegrationKey } from "@/lib/integrations/keys";

/**
 * Saved payment methods support: a Stripe client resolved through
 * the Connections & Keys vault (saved key wins, env fallback), and
 * the per-customer Stripe Customer link stored on profiles.
 * Card numbers never touch this app or its database.
 */
export async function getStripeFromVault(): Promise<Stripe> {
  const key = await getIntegrationKey("STRIPE_SECRET_KEY");
  if (!key) throw new Error("Stripe is not connected yet — add its key on the Connections & Keys page.");
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

export async function getOrCreateStripeCustomer(user: { id: string; email?: string | null }): Promise<string> {
  const db = createServerClient();
  const { data: profile } = await db
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.stripe_customer_id) return profile.stripe_customer_id as string;
  const stripe = await getStripeFromVault();
  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    metadata: { supabase_user_id: user.id },
  });
  await db.from("profiles").upsert(
    { id: user.id, stripe_customer_id: customer.id },
    { onConflict: "id" },
  );
  return customer.id;
}

export interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export async function listSavedCards(user: { id: string; email?: string | null }): Promise<SavedCard[]> {
  const db = createServerClient();
  const { data: profile } = await db
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.stripe_customer_id) return [];
  const stripe = await getStripeFromVault();
  const customerId = profile.stripe_customer_id as string;
  const [methods, customer] = await Promise.all([
    stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 20 }),
    stripe.customers.retrieve(customerId),
  ]);
  const defaultId =
    customer && !customer.deleted
      ? ((customer as Stripe.Customer).invoice_settings?.default_payment_method as string | null)
      : null;
  return methods.data.map((pm) => ({
    id: pm.id,
    brand: pm.card?.brand ?? "card",
    last4: pm.card?.last4 ?? "••••",
    expMonth: pm.card?.exp_month ?? 0,
    expYear: pm.card?.exp_year ?? 0,
    isDefault: pm.id === defaultId,
  }));
}
