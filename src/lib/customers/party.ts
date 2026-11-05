// lib/customers/party.ts — resolve the signed-in shopper to their
// canonical party record (crm_customers).
//
// Why this exists: the storefront's working identity is the Supabase
// auth user id (checkout stamps it on orders), but several customer
// tables were created with customer_id FOREIGN KEYS into
// crm_customers — customer_wishlist_items.customer_id →
// crm_customers.id is the live example: with crm_customers empty,
// every wishlist insert violated the FK and Saved could never work.
// crm_customers is also where portal_customer_accounts.customer_id
// points: it is the platform's party spine.
//
// Resolution mirrors the checkout ledger's own pattern
// (lib/commerce/order-ledger.ts): match by tenant + email
// (unmerged rows only); when no party row exists yet, create the
// minimal one — a save or a post is party activity, not marketing
// consent, so opt-ins stay false exactly as the ledger sets them.
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";

export async function resolvePartyCustomerId(
  supabase: any,
  user: { email?: string | null; user_metadata?: any }
): Promise<string | null> {
  const email = String(user.email || "").trim();
  if (!email) return null;
  const tenantId = PLATFORM_TENANT_ID;

  const find = async () => {
    const { data } = await supabase
      .from("crm_customers")
      .select("id, email")
      .eq("tenant_id", tenantId)
      .ilike("email", email.replace(/[\\%_]/g, (c: string) => `\\${c}`))
      .is("merged_into_customer_id", null)
      .limit(1)
      .maybeSingle();
    if (data && String(data.email).toLowerCase() === email.toLowerCase()) {
      return String(data.id);
    }
    return null;
  };

  const existing = await find();
  if (existing) return existing;

  const fullName = String(
    user.user_metadata?.full_name || user.user_metadata?.display_name || ""
  ).trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  const now = new Date();
  const { data: created, error } = await supabase
    .from("crm_customers")
    .insert({
      tenant_id: tenantId,
      customer_type: "Retail",
      lifecycle_stage: "new_customer",
      lifecycle_status: "active",
      first_name: parts[0] ?? null,
      last_name: parts.slice(1).join(" ") || null,
      email,
      country: "US",
      customer_since: now.toISOString().slice(0, 10),
      first_contact_at: now.toISOString(),
      last_activity_at: now.toISOString(),
      marketing_email_opt_in: false,
      marketing_sms_opt_in: false,
    })
    .select("id")
    .single();
  if (error) {
    // A concurrent request may have created the row first.
    return find();
  }
  return created ? String(created.id) : null;
}
