import { supabaseAdmin } from './supabaseAdmin';
import { DEFAULT_TENANT_ID } from './supabaseConfig';

export interface StaffIdentity {
  portalUserId: string;
  email: string | null;
  isOwner: boolean;
  isPlatformAdmin: boolean;
  roleType: string | null;
}

/**
 * Resolve whether a Supabase Auth user is staff for this tenant, following
 * the platform's existing access model (the same chain the storefront's
 * admin gate uses):
 *
 *   auth user -> portal_users (user_id = auth id, active, this tenant)
 *   staff = portal_users.is_owner OR a platform_admins row keyed by the
 *           portal_users row id.
 *
 * Email fallback: a staff member whose Google sign-in produced a NEW auth
 * user (same email) is re-linked — the portal_users row is matched by
 * email and its user_id is re-pointed at the live auth id — so the same
 * person keeps the same staff identity instead of being locked out.
 */
export async function resolveStaff(
  authUserId: string,
  email: string | null,
): Promise<StaffIdentity | null> {
  const db = supabaseAdmin();

  let { data: row } = await db
    .from('portal_users')
    .select('id, email, is_owner, role_type')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('user_id', authUserId)
    .eq('is_active', true)
    .maybeSingle();

  if (!row && email) {
    const { data: byEmail } = await db
      .from('portal_users')
      .select('id, email, is_owner, role_type')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('email', email)
      .eq('is_active', true)
      .maybeSingle();
    if (byEmail) {
      await db
        .from('portal_users')
        .update({ user_id: authUserId })
        .eq('id', byEmail.id);
      row = byEmail;
    }
  }

  if (!row) return null;

  const { data: pa } = await db
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', row.id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .maybeSingle();

  const isPlatformAdmin = Boolean(pa);
  if (!row.is_owner && !isPlatformAdmin) return null;

  return {
    portalUserId: row.id,
    email: row.email,
    isOwner: Boolean(row.is_owner),
    isPlatformAdmin,
    roleType: row.role_type,
  };
}
