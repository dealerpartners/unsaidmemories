import type { Client } from "pg";
import {
  portalGrantsForStaff as portalGrantsForStaffImpl,
  portalLevelToPlatform,
  platformLevelToPortal,
} from "@/lib/capabilities/module-grants";

export { portalLevelToPlatform, platformLevelToPortal };

// ===========================================================================
// Module grant sync — Settings → Users (franchise model) ⇄ the employee
// module gate.
//
// M3: this file used to be the BRIDGE between two grant stores
// (portal_module_permissions, written by Settings → Users, and
// platform_module_permissions, enforced by the employee shell). The
// bridge is gone because the second store is gone: migration 20261187
// made portal_module_permissions the ONE store (platform_ is now a
// compatibility view over it), and the employee gate reads it directly.
// What remains here is the REPORTING contract its callers depend on:
//   · syncPortalGrantsToStaff — now a read-back: Settings → Users
//     already wrote the portal rows, so this function reports what the
//     employee shell will enforce for that portal user (granted =
//     portal rows present at a non-none level in the scoped codes,
//     revoked = scoped codes absent or 'none'). It writes NOTHING.
//   · platformGrantsForStaff — the employee-shell truth for a staff
//     member, read from the surviving store through their portal
//     identity, in portal vocabulary (all, not full — callers convert
//     via platformLevelToPortal where the platform vocabulary is
//     needed; users/permissions displays the portal vocabulary as-is).
//
// Model rules (owner's, standing — unchanged):
//   · Additive grants, default-deny: no row = no access; a portal level
//     of 'none' counts as revoked (absence is the deny).
//   · Level mapping: portal 'all' == platform 'full'; read/write pass
//     through unchanged.
//   · Only codes that exist in BOTH catalogs used to sync. That
//     restriction died with the bridge: the surviving store carries
//     every code (portal-only crm/leads AND platform-only ai_ops/cms/
//     lms/subscriptions/support/telemed/social/vet), so scoped codes
//     are reported as-is; the franchise guardrail below still applies
//     to what the sync REPORTS as skipped for franchise tenants.
//   · Franchise guardrail: a franchise tenant's staff can NEVER hold
//     Marketplace (sellers), Trust Center (trust_safety), AI Ops,
//     policy management (policies), Administration, or cross-franchise
//     reporting — for a franchise tenant those codes are reported as
//     guardrailSkipped even if a caller submits them.
// ===========================================================================

/** Portal codes that are also platform module codes (lib/admin/modules.ts). */
export const SYNCABLE_MODULE_CODES = [
  "accounting",
  "administration",
  "analytics",
  "appointments",
  "communications",
  "customers",
  "deposits",
  "docs",
  "gift_cards_credits",
  "inventory",
  "invoices",
  "marketing",
  "orders",
  "payments",
  "policies",
  "products_services",
  "purchasing",
  "refunds_disputes",
  "reports",
  "sellers",
  "shipping",
  "staff_groomer_management",
  "trust_safety",
] as const;

/** Master-tenant-only modules — never grantable to franchise-tenant staff. */
export const MASTER_ONLY_MODULE_CODES = new Set<string>([
  "sellers", // Marketplace / seller management
  "trust_safety", // Trust Center
  "ai_ops", // AI Ops (platform-only code; listed for completeness)
  "policies", // policy management
]);

export interface StaffGrantSyncResult {
  /** False when the portal user has no crm_staff row in this tenant — the
   *  portal grants still saved; there is simply no employee-shell
   *  identity to mirror onto (reported to the admin UI verbatim). */
  staffLinked: boolean;
  staffId: string | null;
  /** Portal rows present at a non-none level in the scoped codes. */
  granted: number;
  /** Scoped codes absent or at 'none'. */
  revoked: number;
  /** Codes skipped by the franchise guardrail. */
  guardrailSkipped: string[];
}

/**
 * Read-back for a Settings → Users module-permission save: the portal
 * rows are already the store (M3), so this reports what the employee
 * shell will enforce — it writes nothing. `scopedCodes` is the set of
 * portal-catalog codes the editor could set for this role; only those
 * codes are counted, everything else is left untouched.
 */
export async function syncPortalGrantsToStaff(
  client: Client,
  args: {
    tenantId: string;
    tenantType: string | null;
    userId: string | null;
    modulePermissions: Record<string, string>;
    scopedCodes: string[];
  },
): Promise<StaffGrantSyncResult> {
  const out: StaffGrantSyncResult = {
    staffLinked: false,
    staffId: null,
    granted: 0,
    revoked: 0,
    guardrailSkipped: [],
  };
  if (!args.userId) return out;

  const staff = await client.query(
    `SELECT id::text AS id FROM public.crm_staff
      WHERE tenant_id = $1::uuid AND user_id = $2::uuid
      ORDER BY is_active DESC
      LIMIT 1`,
    [args.tenantId, args.userId],
  );
  const staffId = staff.rows[0]?.id as string | undefined;
  if (!staffId) return out;
  out.staffLinked = true;
  out.staffId = staffId;

  const isFranchise = (args.tenantType || "").toLowerCase() === "franchise";
  for (const code of args.scopedCodes) {
    if (isFranchise && MASTER_ONLY_MODULE_CODES.has(code)) {
      out.guardrailSkipped.push(code);
      continue;
    }
    const level = portalLevelToPlatform(args.modulePermissions[code]);
    if (level === "none") out.revoked += 1;
    else out.granted += 1;
  }
  return out;
}

/**
 * Read a staff member's grants back in portal vocabulary, for the
 * Settings → Users detail view: what the employee shell will actually
 * enforce for this person (now read from the surviving store).
 */
export async function platformGrantsForStaff(
  client: Client,
  tenantId: string,
  userId: string | null,
): Promise<{ staffId: string; grants: Record<string, string> } | null> {
  if (!userId) return null;
  const found = await portalGrantsForStaffImpl(client, tenantId, userId);
  if (!found) return null;
  const grants: Record<string, string> = {};
  for (const [code, level] of Object.entries(found.grants)) {
    grants[code] = platformLevelToPortal(level);
  }
  return { staffId: found.staffId, grants };
}
