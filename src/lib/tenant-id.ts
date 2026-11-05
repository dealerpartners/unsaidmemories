// ---------------------------------------------------------------------------
// tenant-id — the ONE resolution path for the platform tenant id.
//
// The defect this closes (defect census, Class C adjacent): the house
// tenant UUID was repeated as an env fallback —
//   process.env.SUPABASE_TENANT_ID || "b2a3b20c-…"
// in 26 places across 21 files. Any environment missing the variable
// silently operated on the house tenant: a multi-tenant codebase quietly
// running on one tenant's data because a variable was absent.
//
// The rule now: the tenant id comes from the environment, only. A missing
// SUPABASE_TENANT_ID is a configuration failure and throws a named error
// at the point of resolution — it never falls back to a printed UUID.
//
// This module is import-free on purpose (the site-tenant-shared pattern):
// any server module may import it without dragging heavy dependency
// graphs or creating cycles. For the platform's own tenant as a NAMED
// constant (comparisons, isMaster checks), use MASTER_TENANT_ID from
// "@/lib/site-tenant-shared" — that constant names the master tenant; it
// is not a resolution fallback and masks no failure.
// ---------------------------------------------------------------------------

export function resolveTenantId(): string {
  const id = process.env.SUPABASE_TENANT_ID;
  if (!id) {
    throw new Error(
      "TENANT_NOT_CONFIGURED: SUPABASE_TENANT_ID is not set — refusing to resolve a tenant from a hardcoded fallback",
    );
  }
  return id;
}
