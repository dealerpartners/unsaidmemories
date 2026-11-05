// ---------------------------------------------------------------------------
// sellers/api-context.ts — shared session → seller resolution for the
// /api/seller/* routes.
//
// Every seller API is scoped the same way (established by the returns /
// shipping / support routes): the session cookie resolves to an email via
// verifySessionToken, and the seller is the public.sellers row whose email
// matches under the active tenant. A seller only ever sees their OWN rows —
// client-supplied seller ids are never trusted. This helper is that pattern
// in one place so new seller routes can't drift from it.
// ---------------------------------------------------------------------------

import { withPgStrict, TENANT_ID } from "@/lib/crm/enterprise";
import {
  authedEmail,
  authedSeller,
  sellerScopedRows,
} from "@/app/api/seller/returns/route";

/**
 * sellerScopedRows (returns route) answers { exists, rows }; seller routes
 * here only need the rows — the tables they read are known to exist in the
 * designed schema, and an absent table reads as an honest empty list.
 */
export async function scopedRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c: any,
  table: string,
  sellerId: string,
  orderBy?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const res = await sellerScopedRows(c, table, sellerId, orderBy);
  return res.rows;
}

export interface SellerContext {
  email: string;
  tenant: string;
  sellerId: string;
  seller: Record<string, unknown>;
  /** How this session reaches the seller: the owner personally, or a
   * team member (seller_users, status 'active') acting in the owner's
   * store with a role from src/lib/sellers/team.ts. */
  access:
    | { kind: "owner" }
    | { kind: "team"; role: string; sellerUserId: string };
}

/**
 * Resolve the signed-in seller. Returns { ok: false, reason:
 * "unauthenticated" } when there is no session, and reason "no-seller"
 * when the session is valid but no sellers row matches (an applicant
 * who hasn't been created as a seller yet, or a staff account) —
 * routes decide how to answer.
 *
 * The resolution runs on withPgStrict, never withPg: withPg folds a
 * database failure into null, and null here reads as "no-seller" — so
 * under load a real, approved seller was answered 404 "Seller not
 * found" by routes whose only fault was a timed-out lookup (observed
 * live 2026-10-25 on /api/seller/orders and /api/seller/products while
 * /api/seller/shell resolved the same seller fine). A failed read must
 * THROW, not state a verdict the platform never reached; only a
 * completed lookup that finds nothing may answer "no-seller".
 */
export async function sellerContext(): Promise<
  | { ok: true; ctx: SellerContext }
  | { ok: false; reason: "unauthenticated" | "no-seller" }
> {
  const email = await authedEmail();
  if (!email) return { ok: false, reason: "unauthenticated" };
  const tenant = TENANT_ID();
  const found = await withPgStrict(async (c) => {
    const sellerId = await authedSeller(c, tenant, email);
    if (sellerId) {
      const { rows } = await c.query(
        `SELECT id, tenant_id, seller_type, legal_name, display_name, slug,
                email, phone, website, tax_id_last4, commission_rate, status,
                approved_at, created_at, updated_at
           FROM public.sellers
          WHERE id = $1::uuid AND tenant_id = $2
          LIMIT 1`,
        [sellerId, tenant],
      );
      const seller = rows[0] as Record<string, unknown> | undefined;
      return seller
        ? { sellerId, seller, access: { kind: "owner" } as const }
        : null;
    }
    // Team membership: an ACTIVE seller_users row for this email grants
    // scoped access to that owner's store, with the row's role.
    const team = await c.query(
      `SELECT id, seller_id, role FROM public.seller_users
        WHERE tenant_id = $1 AND LOWER(email) = LOWER($2) AND status = 'active'
        ORDER BY created_at ASC
        LIMIT 1`,
      [tenant, email],
    );
    const membership = team.rows[0] as
      | { id: string; seller_id: string; role: string }
      | undefined;
    if (!membership) return null;
    const { rows } = await c.query(
      `SELECT id, tenant_id, seller_type, legal_name, display_name, slug,
              email, phone, website, tax_id_last4, commission_rate, status,
              approved_at, created_at, updated_at
         FROM public.sellers
        WHERE id = $1::uuid AND tenant_id = $2
        LIMIT 1`,
      [membership.seller_id, tenant],
    );
    const seller = rows[0] as Record<string, unknown> | undefined;
    if (!seller) return null;
    return {
      sellerId: membership.seller_id,
      seller,
      access: {
        kind: "team",
        role: membership.role,
        sellerUserId: membership.id,
      } as const,
    };
  });
  if (!found) return { ok: false, reason: "no-seller" };
  return {
    ok: true,
    ctx: {
      email,
      tenant,
      sellerId: found.sellerId,
      seller: found.seller,
      access: found.access,
    },
  };
}

/**
 * Section guard for /api/seller routes — M3 capability version.
 * Owners pass; team members pass only when their team role's
 * CAPABILITY subset (lib/capabilities/roles.ts, derived from
 * ROLE_SECTIONS in team.ts via SECTION_CAPABILITIES) contains every
 * capability the section requires. The derivation is exact over every
 * section this guard actually guards (see roles.ts), so a member who
 * passed under roleAllowsSection still passes, and a member who was
 * denied still fails with the SAME 403 body, code and message as
 * before — the test moved from a section list to capabilities, the
 * refusal did not move. Baseline sections (dashboard, communication,
 * docs, account) need no capability and pass for every team member,
 * exactly as before. Unknown roles hold nothing beyond baseline.
 * Usage: const denied = await sellerSectionGuard("payments");
 *        if (denied) return denied;
 */
export async function sellerSectionGuard(
  section: import("@/lib/types").DawgNavSection,
): Promise<import("next/server").NextResponse | null> {
  const { NextResponse } = await import("next/server");
  const res = await sellerContext();
  if (!res.ok) {
    const err = sellerContextError(res.reason);
    return NextResponse.json({ error: err.error }, { status: err.status });
  }
  if (res.ctx.access.kind === "owner") return null;
  const { TEAM_ROLE_LABELS, isTeamRole, ROLE_SECTIONS } = await import(
    "@/lib/sellers/team"
  );
  const { SECTION_CAPABILITIES, teamRoleCapabilities } = await import(
    "@/lib/capabilities/roles"
  );
  const role = res.ctx.access.role;
  const BASELINE = ["dashboard", "communication", "docs", "account"];
  if ((BASELINE as string[]).includes(section)) return null;
  // Owner/admin team roles hold the full seller set (ROLE_SECTIONS
  // "all") — they pass every section, as before.
  if (isTeamRole(role) && ROLE_SECTIONS[role] === "all") return null;
  const needed = SECTION_CAPABILITIES[section] ?? null;
  const held = isTeamRole(role)
    ? teamRoleCapabilities(role, ROLE_SECTIONS[role])
    : [];
  if (needed && needed.every((cap) => (held as readonly string[]).includes(cap))) return null;
  const label = isTeamRole(role) ? TEAM_ROLE_LABELS[role] : role;
  return NextResponse.json(
    {
      error: `Your team role (${label}) doesn't include this section. Ask your store owner if you need access.`,
      code: "role_section_denied",
      section,
      role: res.ctx.access.role,
    },
    { status: 403 },
  );
}

/** Standard error body for seller routes that require a linked seller. */
export function sellerContextError(reason: "unauthenticated" | "no-seller") {
  return reason === "unauthenticated"
    ? { error: "Not authenticated", status: 401 as const }
    : { error: "Seller not found", status: 404 as const };
}
