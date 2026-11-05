// HOST WIRING for the social module — the only module file that knows
// about this app. Identity and tenancy come from the app's own systems:
// sellerContext() (session -> sellers row under TENANT_ID()) for seller
// surfaces, the admin gate for admin surfaces. The module never resolves
// identity itself and never trusts client-supplied ids.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sellerContext } from "@/lib/sellers/api-context";

export interface SocialActor {
  tenantId: string;      // TENANT_ID() of the active tenant
  sellerId: string;      // public.sellers.id — whose accounts/posts these are
  userId: string;        // actor id for audit/connected_by (seller id on seller surfaces)
  roles: string[];       // actor roles (M3: "seller" for seller-portal actors; module grants live in portal_module_permissions)
}

/** Build the actor for a seller-portal request, or null when there is no
 * linked seller session. Roles are the seller's own module grants; sellers
 * act on their own accounts, so "seller" is the operative grant here —
 * staff/admin surfaces build their actor through the admin gate instead. */
export async function sellerActor(): Promise<SocialActor | null> {
  const res = await sellerContext();
  if (!res.ok) return null;
  return {
    tenantId: res.ctx.tenant,
    sellerId: res.ctx.sellerId,
    userId: res.ctx.sellerId,
    roles: ["seller"],
  };
}

/** Service-role Supabase client (server-only) for the module's engine,
 * which speaks PostgREST. Seller-facing route handlers in this app prefer
 * withPg + SQL scoping (house pattern); the engine port to pg is tracked
 * in the module plan — until then the engine runs only from cron/admin
 * contexts through this client, never from seller input paths. */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Social module: Supabase service client is not configured.");
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Role gate for module actions. Call before any mutation. */
export function requireRole(actor: SocialActor, allowed: string[]): void {
  if (!actor.roles.some((r) => allowed.includes(r))) {
    throw new Error(`Forbidden: this action requires one of: ${allowed.join(", ")}.`);
  }
}

/** Audit hook — integration point for the app's audit trail
 * (crm_audit_log pattern). Structured log until wired to the table. */
export async function audit(event: {
  tenantId: string; sellerId?: string; actorId: string; action: string;
  resourceType: string; resourceId?: string; after?: Record<string, unknown>;
}): Promise<void> {
  console.info("[social:audit]", JSON.stringify(event));
}
