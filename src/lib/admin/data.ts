import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { normalizeLevel, type AccessLevel, type ModuleCode } from "./modules";

/**
 * Server-side data helpers for the System / Admin Users / Analytics /
 * Ecommerce / Website admin surfaces. All reads go through the service
 * client after the caller has passed the gate (pages call
 * getAdminContext, APIs call requireAdminApi/requireModuleApi).
 */

/**
 * Tenant + settings. The `tenants` table carries only identity columns
 * (id, name, slug, type, is_active, created_at) — every settings section
 * (organization extras, branding, website, ecommerce, financial,
 * operations, governance, documents, cms) lives in the `tenant_settings`
 * table (tenant_id, section, data jsonb), created by
 * supabase/migrations/20261029_tenant_settings.sql. getTenantRow()
 * synthesizes one record so pages read tenant.settings.<section>,
 * tenant.branding and the organization accessors uniformly.
 */
export interface TenantRow {
  id: string;
  name: string | null;
  slug: string | null;
  type: string | null;
  is_active: boolean;
  domain: string | null;
  status: string | null;
  contact_email: string | null;
  timezone: string | null;
  currency: string | null;
  settings: Record<string, any>;
  branding: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export async function getTenantRow(): Promise<TenantRow | null> {
  const db = createServerClient();
  const tenantId = getTenantId();
  const { data } = await db
    .from("tenants")
    .select("id, name, slug, type, is_active, created_at")
    .eq("id", tenantId)
    .limit(1);
  const row = data?.[0];
  if (!row) return null;

  const settings: Record<string, any> = {};
  let updatedAt = row.created_at as string;
  const { data: sectionRows } = await db
    .from("tenant_settings")
    .select("section, data, updated_at")
    .eq("tenant_id", tenantId);
  for (const s of sectionRows ?? []) {
    settings[s.section as string] = (s.data as Record<string, any>) ?? {};
    if (s.updated_at && new Date(s.updated_at as string) > new Date(updatedAt)) {
      updatedAt = s.updated_at as string;
    }
  }
  const org = (settings.organization as Record<string, any>) ?? {};
  return {
    id: row.id as string,
    name: row.name as string | null,
    slug: row.slug as string | null,
    type: row.type as string | null,
    is_active: Boolean(row.is_active),
    domain: (org.domain as string) ?? null,
    status: (org.status as string) ?? (row.is_active ? "active" : "suspended"),
    contact_email: (org.contact_email as string) ?? null,
    timezone: (org.timezone as string) ?? null,
    currency: (org.currency as string) ?? null,
    settings,
    branding: (settings.branding as Record<string, any>) ?? {},
    created_at: row.created_at as string,
    updated_at: updatedAt,
  };
}

/** Merge values into one tenant_settings section; returns the section. */
export async function updateTenantSettingsSection(
  section: string,
  values: Record<string, unknown>,
): Promise<Record<string, any>> {
  const db = createServerClient();
  const tenantId = getTenantId();
  const { data: existing } = await db
    .from("tenant_settings")
    .select("data")
    .eq("tenant_id", tenantId)
    .eq("section", section)
    .limit(1);
  const merged = { ...((existing?.[0]?.data as Record<string, any>) ?? {}), ...values };
  const { error } = await db
    .from("tenant_settings")
    .upsert(
      { tenant_id: tenantId, section, data: merged, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id,section" },
    );
  if (error) throw new Error(error.message);
  return merged;
}

export async function updateTenantBranding(values: Record<string, unknown>): Promise<Record<string, any>> {
  return updateTenantSettingsSection("branding", values);
}

export interface StaffRow {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  phone: string | null;
  role_type: string | null;
  portal: string | null;
  is_owner: boolean;
  is_active: boolean;
  invited_at: string | null;
  accepted_at: string | null;
  created_at: string;
  grants: Partial<Record<ModuleCode, AccessLevel>>;
  isPlatformAdmin: boolean;
}

const RANK: Record<AccessLevel, number> = { read: 1, write: 2, full: 3 };

/** All staff (portal_users for this tenant) with merged effective grants
 *  (platform_module_permissions view ∪ portal_module_permissions table —
 *  the same union the gate enforces). */
export async function listStaffWithGrants(): Promise<StaffRow[]> {
  const db = createServerClient();
  const tenantId = getTenantId();
  const { data: users } = await db
    .from("portal_users")
    .select("id, user_id, email, display_name, phone, role_type, portal, is_owner, is_active, invited_at, accepted_at, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  const rows = (users ?? []) as Array<Omit<StaffRow, "grants" | "isPlatformAdmin">>;
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const grantsByUser = new Map<string, Partial<Record<ModuleCode, AccessLevel>>>();
  const absorb = (uid: string, key: unknown, raw: unknown) => {
    const lvl = normalizeLevel(raw as string);
    if (lvl === "none" || typeof key !== "string") return;
    const map = grantsByUser.get(uid) ?? {};
    const prev = map[key as ModuleCode];
    if (!prev || RANK[lvl] > RANK[prev]) map[key as ModuleCode] = lvl;
    grantsByUser.set(uid, map);
  };
  try {
    const { data } = await db
      .from("platform_module_permissions")
      .select("staff_id, module_code, access_level")
      .in("staff_id", ids);
    for (const g of data ?? []) absorb(g.staff_id as string, g.module_code, g.access_level);
  } catch { /* view optional */ }
  try {
    const { data } = await db
      .from("portal_module_permissions")
      .select("portal_user_id, module_key, permission_level")
      .in("portal_user_id", ids);
    for (const g of data ?? []) absorb(g.portal_user_id as string, g.module_key, g.permission_level);
  } catch { /* table optional */ }

  let platformAdmins = new Set<string>();
  try {
    const { data } = await db.from("platform_admins").select("user_id, expires_at").in("user_id", ids);
    platformAdmins = new Set(
      (data ?? [])
        .filter((r) => !r.expires_at || new Date(r.expires_at as string) > new Date())
        .map((r) => r.user_id as string),
    );
  } catch { /* optional */ }

  return rows.map((r) => ({
    ...r,
    grants: grantsByUser.get(r.id) ?? {},
    isPlatformAdmin: platformAdmins.has(r.id),
  }));
}

export interface AuthUserInfo {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  mfaEnabled: boolean;
  name: string | null;
}

/** All Supabase Auth users (paginated through the admin API). */
export async function listAuthUsers(): Promise<AuthUserInfo[]> {
  const db = createServerClient();
  const out: AuthUserInfo[] = [];
  let page = 1;
  for (;;) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) break;
    for (const u of data.users) {
      out.push({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        last_sign_in_at: (u as any).last_sign_in_at ?? null,
        email_confirmed_at: (u as any).email_confirmed_at ?? null,
        banned_until: (u as any).banned_until ?? null,
        mfaEnabled: Array.isArray((u as any).factors) && (u as any).factors.length > 0,
        name: (u.user_metadata?.full_name as string) || (u.user_metadata?.display_name as string) || null,
      });
    }
    if (data.users.length < 200) break;
    page += 1;
    if (page > 10) break;
  }
  return out;
}

/** Write a permission-change audit row (best effort — never blocks). */
export async function writePermissionAudit(entry: {
  portalUserId: string;
  changedBy: string | null;
  changeType: string;
  key: string;
  oldValue: string;
  newValue: string;
}): Promise<void> {
  try {
    const db = createServerClient();
    await db.from("portal_permission_audit_log").insert({
      tenant_id: getTenantId(),
      portal_user_id: entry.portalUserId,
      changed_by: entry.changedBy,
      change_type: entry.changeType,
      key: entry.key,
      old_value: entry.oldValue,
      new_value: entry.newValue,
    });
  } catch {
    // audit is best-effort; the grant write itself is the source of truth
  }
}
