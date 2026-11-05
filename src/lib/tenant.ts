/**
 * Single tenant-resolution path for Unsaid (server-side only).
 *
 * The tenant id comes from the SUPABASE_TENANT_ID environment variable —
 * the ONLY source. Doctrine carried over from UnSaid Memories: one resolution path
 * per concern, and never a hardcoded tenant literal scattered across
 * route files (this repo previously carried the same UUID literal in
 * 27 files; they all resolve through here now).
 *
 * Throws when the env var is missing rather than falling back to a
 * literal, so a misconfigured deploy fails loudly instead of silently
 * reading/writing another tenant's rows.
 */
let cached: string | null = null;

export function getTenantId(): string {
  if (cached) return cached;
  const id = process.env.SUPABASE_TENANT_ID?.trim();
  if (!id) {
    throw new Error(
      "SUPABASE_TENANT_ID is not set. The tenant id resolves from the environment only (see src/lib/tenant.ts).",
    );
  }
  cached = id;
  return id;
}

/** True when tenant resolution is configured (used by health checks). */
export function tenantConfigured(): boolean {
  return Boolean(process.env.SUPABASE_TENANT_ID?.trim());
}
