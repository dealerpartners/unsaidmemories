// ---------------------------------------------------------------------------
// sellers/provisioning.ts — what an approval must leave behind.
//
// Approval used to flip sellers.status and stop. The seller then signed
// in to a shell whose capability grants read NULL (no seller_capabilities
// row), no portal assignment existed for them in Settings → Users, and
// nobody ever told them they'd been approved. The manual grant for the
// house seller (2026-10-15) is the record of everything approval owed
// and didn't do; this module is that list, executed:
//
//   1. seller_capabilities — one row, column defaults only (is_pro /
//      can_advertise / can_bulk_import all false, status 'active').
//      Deny-by-default is the platform model: upgrades (Pro, advertise,
//      bulk import) and category permissions are granted afterwards
//      through the admin permissions surface, never pre-granted here.
//   2. portal_users — the Settings → Users assignment row (role seller,
//      portal seller, parent = the seller, owner), created ONLY when an
//      auth account with the seller's email of record already exists.
//      Sign-in resolution is by email, so a seller without an account
//      yet loses nothing: the approval email tells them to create their
//      sign-in with the same email, and the row can be assigned from
//      Settings → Users once they have.
//   3. The approval email itself is sent by the caller (the admin
//      sellers route owns the mail pattern, next to the rejection
//      email) — this module does the database half.
//
// Idempotent by construction: re-approving a seller (or approving an
// already-provisioned one) creates nothing twice.
// ---------------------------------------------------------------------------

import { withPg } from "@/lib/crm/enterprise";
import { writeSellerAudit } from "@/lib/sellers/audit";
import { getSupabaseAdmin, findAuthUserByEmail } from "@/lib/portal-auth";

// The withPg client shape (mirrors lib/sellers/audit's local type —
// the query result is cast at each call site, as the audit lib does).
type PgClientLike = {
  query: (text: string, params?: unknown[]) => Promise<any>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The in-transaction half: the capabilities row + its audit entry.
 *  Runs inside the approval's own withPg callback so the grant set and
 *  the decision commit together. */
export async function provisionSellerGrants(
  c: PgClientLike,
  opts: {
    tenantId: string;
    sellerId: string;
    actorId: string | null;
    ipAddress?: string | null;
  },
): Promise<{ capabilitiesCreated: boolean }> {
  const ins = await c.query(
    `INSERT INTO public.seller_capabilities (tenant_id, seller_id)
     SELECT $1, $2::uuid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.seller_capabilities
         WHERE tenant_id = $1 AND seller_id = $2::uuid
      )
     RETURNING id`,
    [opts.tenantId, opts.sellerId],
  );
  const capabilitiesCreated = (ins.rows?.length ?? 0) > 0;
  await writeSellerAudit(c, {
    tenantId: opts.tenantId,
    sellerId: opts.sellerId,
    actorId: opts.actorId,
    ipAddress: opts.ipAddress ?? null,
    action: "seller.provisioned",
    entityType: "seller",
    entityId: opts.sellerId,
    afterState: {
      capabilities_created: capabilitiesCreated,
      grants: "defaults (all capabilities off; upgrades via admin permissions)",
    },
  });
  return { capabilitiesCreated };
}

export type PortalLinkResult =
  | "linked"
  | "already_linked"
  | "no_auth_user"
  | "unavailable";

/** The post-commit half: the portal_users assignment, when an auth
 *  account with the seller's email already exists. Best-effort by
 *  design — the approval is already committed and audited; a linking
 *  failure is reported to the caller, never fatal to it. */
export async function linkSellerPortalUser(opts: {
  tenantId: string;
  sellerId: string;
  email: string | null;
  displayName: string | null;
  actorId: string | null;
}): Promise<PortalLinkResult> {
  if (!opts.email) return "no_auth_user";
  const admin = getSupabaseAdmin();
  if (!admin) return "unavailable";
  let authUser: Awaited<ReturnType<typeof findAuthUserByEmail>>;
  try {
    authUser = await findAuthUserByEmail(admin, opts.email);
  } catch {
    // A failed lookup is not "no such user": report it through the
    // result vocabulary the caller already surfaces for this case.
    return "unavailable";
  }
  if (!authUser?.id) return "no_auth_user";
  const userId = String(authUser.id);

  const out = await withPg(async (c) => {
    const existing = await c.query(
      `SELECT id FROM public.portal_users
        WHERE tenant_id = $1 AND user_id = $2::uuid AND portal = 'seller' AND parent_id = $3::uuid
        LIMIT 1`,
      [opts.tenantId, userId, opts.sellerId],
    );
    if (existing.rows[0]) return "already_linked" as const;
    await c.query(
      `INSERT INTO public.portal_users
         (tenant_id, user_id, role_type, portal, parent_id, display_name, email, is_owner, is_active, invited_by, invited_at)
       VALUES ($1, $2::uuid, 'seller', 'seller', $3::uuid, $4, $5, true, true, $6::uuid, now())`,
      [
        opts.tenantId,
        userId,
        opts.sellerId,
        opts.displayName || null,
        opts.email,
        opts.actorId && UUID_RE.test(opts.actorId) ? opts.actorId : null,
      ],
    );
    return "linked" as const;
  });
  return out ?? "unavailable";
}
