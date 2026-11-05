// ---------------------------------------------------------------------------
// Franchise access rules — which platform modules stay master-only.
//
// Portals model (Sunny, 2026-10-13): franchise tenants get the same admin
// portal, CRM, and accounting as the master tenant, scoped to their own
// tenant_id. They are NEVER granted the Marketplace (seller management,
// Trust & Safety, seller payouts, listing approvals), AI Ops, policy
// management, or cross-franchise reporting — those stay with the master
// tenant. Permissions are additive and default-deny: a module is available
// to a child tenant only when it is not on this list AND a role grant
// exists. Being "owner" of a child tenant confers no rights over
// master-only modules.
// ---------------------------------------------------------------------------

import { MASTER_TENANT_ID } from "@/lib/site-tenant-shared"
import type { ModuleCode } from "@/lib/admin/modules"

/** Module codes a child (franchise / seller / vet / pharmacy) tenant can
 * never hold, at any access level, under any role — master tenant only.
 * Sibling contract: this exact list is referenced by the admin module
 * guard and the portal Sidebar gating. */
export const MASTER_ONLY_MODULES: ModuleCode[] = [
  "sellers",
  "trust_safety",
  "ai_ops",
  "policies",
]

export function isMasterOnlyModule(module: string): boolean {
  return (MASTER_ONLY_MODULES as string[]).includes(module)
}

/** True when `tenantId` is a child tenant (anything other than the
 * master). Null/unknown tenant ids are treated as child — default-deny. */
export function isChildTenant(tenantId: string | null | undefined, masterTenantId: string = MASTER_TENANT_ID): boolean {
  return !tenantId || tenantId !== masterTenantId
}

/**
 * The deny rule: a module is denied for a tenant when the module is
 * master-only and the tenant is not the master tenant. `masterTenantId`
 * defaults to the platform master (site-tenant.ts); callers whose tenant
 * notion comes from another layer (e.g. crm_staff.tenant_id vs
 * TENANT_ID() in src/lib/crm/enterprise) pass their own master id so the
 * comparison stays inside one tenant namespace.
 */
export function isModuleDeniedForTenant(
  module: string,
  tenantId: string | null | undefined,
  masterTenantId: string = MASTER_TENANT_ID,
): boolean {
  return isMasterOnlyModule(module) && isChildTenant(tenantId, masterTenantId)
}
