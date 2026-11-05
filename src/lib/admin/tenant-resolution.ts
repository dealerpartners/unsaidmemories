// ---------------------------------------------------------------------------
// UNSAID ADAPTER — transplant lane 2, 2026-10-30. This file REPLACES
// UnSaid Memories's lib/admin/tenant-resolution.ts (303 lines); it is not a copy.
//
// UnSaid Memories's module implements the tenant switcher: an admin's chosen
// tenant is stored in a cookie, identity-bound to their portal session,
// and validated against their entitled tenant set. Unsaid has ONE
// tenant and ONE resolution path — the environment (SUPABASE_TENANT_ID,
// via lib/tenant-id, the same variable Unsaid's admin gate reads) — so
// there is nothing to switch and nothing to bind. The one export the
// transplanted routes import, resolveActiveTenantId, therefore
// resolves to the env tenant unconditionally; its (client, req)
// arguments are accepted for contract compatibility and ignored.
// ---------------------------------------------------------------------------
import { resolveTenantId } from "@/lib/tenant-id";

/** Kept for contract compatibility; Unsaid has no tenant switcher, so
 *  nothing reads or writes this cookie. */
export const ACTIVE_TENANT_COOKIE = "portal_active_tenant";

/** The caller's active tenant in Unsaid is always the env tenant. */
export async function resolveActiveTenantId(_client?: unknown, _req?: unknown): Promise<string> {
  return resolveTenantId();
}

// --- Switcher surface the transplanted tenants routes import. In a
// one-tenant Unsaid these are inert by design: no cookie selection is
// ever honored (decode* return null), identity keys are empty (there is
// no portal session to bind to), and the caller context is the env tenant.
export function readCookieValue(cookieHeader: string, name: string): string | null {
  try {
    for (const part of cookieHeader.split(";")) {
      const eq = part.indexOf("=");
      if (eq < 0) continue;
      if (part.slice(0, eq).trim() !== name) continue;
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  } catch { /* malformed cookie header */ }
  return null;
}

export async function identityKeysForRequest(_req: Request): Promise<string[]> {
  return [];
}

export function encodeTenantSelection(tenantId: string, _identityKeys: string[]): string {
  return tenantId;
}

export function decodeTenantSelection(_raw: string | null, _identityKeys: string[]): string | null {
  return null;
}

export function decodeBoundSelectionFromCookies(_cookieHeader: string): string | null {
  return null;
}

export interface CallerTenantContext {
  identityKeys: string[];
  masterTenantId: string;
  homeTenantId: string;
  entitledTenantIds: Set<string>;
  tenantRows: any[];
  callerRows: any[];
}

export async function callerTenantContext(_client?: unknown, _req?: unknown): Promise<CallerTenantContext> {
  const tenantId = resolveTenantId();
  return {
    identityKeys: [],
    masterTenantId: tenantId,
    homeTenantId: tenantId,
    entitledTenantIds: new Set([tenantId]),
    tenantRows: [],
    callerRows: [],
  };
}
