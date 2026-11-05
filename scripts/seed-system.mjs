#!/usr/bin/env node
/**
 * seed-system.mjs — System module seed for Unsaid.
 *
 * Creates (idempotently):
 *   1. The platform admin Auth user (default admin@unsaidmemories.com)
 *   2. Its portal_users row (Super Admin, owner, admin portal)
 *   3. Its platform_admins grant (keyed by the portal_users id)
 *   4. Full module grants for all 13 admin modules
 *   5. The tenant_settings 'organization' defaults (domain / timezone /
 *      currency) — only for keys not already set
 *
 * Credentials are extracted at runtime from UNSAID_CREDS.md (never
 * printed, never committed). The admin password is generated unless
 * UNSAID_ADMIN_PASSWORD is set, and is printed ONCE at the end of a
 * run that creates the user — capture it from that output.
 *
 * Usage: node scripts/seed-system.mjs
 * Env:   UNSAID_CREDS_PATH, UNSAID_ADMIN_EMAIL, UNSAID_ADMIN_PASSWORD
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const credsPath =
  process.env.UNSAID_CREDS_PATH ||
  path.resolve(repoRoot, "../../../user/files/UNSAID_CREDS.md");

const ADMIN_EMAIL = process.env.UNSAID_ADMIN_EMAIL || "admin@unsaidmemories.com";
const MODULES = [
  "crm", "orders", "accounting", "inventory", "catalog", "studio",
  "integrations", "trust_safety", "support", "analytics", "ecommerce",
  "website", "administration",
];

function unesc(s) {
  return s.replace(/\\_/g, "_").trim();
}

function extractCreds() {
  const text = readFileSync(credsPath, "utf8");
  const svcMatch = text.match(/Service\\?_Role\s*=\s*(\S+)/);
  if (!svcMatch) throw new Error("Service_Role not found in creds file");
  const serviceKey = unesc(svcMatch[1]);
  const payload = JSON.parse(
    Buffer.from(serviceKey.split(".")[1], "base64url").toString("utf8"),
  );
  if (!payload.ref) throw new Error("No project ref in service key");
  return { serviceKey, base: `https://${payload.ref}.supabase.co` };
}

const { serviceKey, base } = extractCreds();
const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function rest(pathname, init = {}) {
  const res = await fetch(`${base}/rest/v1/${pathname}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  if (!res.ok) throw new Error(`${init.method || "GET"} ${pathname} → ${res.status}: ${text.slice(0, 300)}`);
  return data;
}

async function authAdmin(pathname, init = {}) {
  const res = await fetch(`${base}/auth/v1/admin/${pathname}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep null */ }
  if (!res.ok) throw new Error(`${init.method || "GET"} auth/${pathname} → ${res.status}: ${text.slice(0, 300)}`);
  return data;
}

function genPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const bytes = randomBytes(24);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function main() {
  // Tenant: the platform tenant (slug unsaid-memories), else the only row.
  const tenants = await rest("tenants?select=id,slug,name");
  const tenant = tenants.find((t) => t.slug === "unsaid-memories") || tenants[0];
  if (!tenant) throw new Error("No tenant row found");
  const tenantId = tenant.id;
  console.log(`Tenant: ${tenant.name} (${tenantId})`);

  // 1) Auth user
  let authUser = null;
  for (let page = 1; page <= 10 && !authUser; page++) {
    const { users } = await authAdmin(`users?page=${page}&per_page=200`);
    authUser = users.find((u) => (u.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()) || null;
    if (users.length < 200) break;
  }
  let passwordNote;
  if (!authUser) {
    const password = process.env.UNSAID_ADMIN_PASSWORD || genPassword();
    authUser = await authAdmin("users", {
      method: "POST",
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password,
        email_confirm: true,
        user_metadata: { full_name: "Platform Admin" },
      }),
    });
    passwordNote = `CREATED — password (shown once): ${password}`;
  } else {
    passwordNote = process.env.UNSAID_ADMIN_PASSWORD
      ? "existing user; password left as-is (env value not reapplied)"
      : "existing user; password unchanged";
  }
  console.log(`Auth user: ${ADMIN_EMAIL} (${authUser.id}) — ${passwordNote}`);

  // 2) portal_users row
  let staff = await rest(
    `portal_users?select=id&tenant_id=eq.${tenantId}&user_id=eq.${authUser.id}`,
  );
  let portalUserId;
  if (staff.length === 0) {
    const inserted = await rest("portal_users", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        tenant_id: tenantId,
        user_id: authUser.id,
        role_type: "Super Admin",
        portal: "admin",
        display_name: "Platform Admin",
        email: ADMIN_EMAIL,
        is_owner: true,
        is_active: true,
        accepted_at: new Date().toISOString(),
      }),
    });
    portalUserId = inserted[0].id;
    console.log(`portal_users: created ${portalUserId}`);
  } else {
    portalUserId = staff[0].id;
    console.log(`portal_users: exists ${portalUserId}`);
  }

  // 3) platform_admins grant (user_id references portal_users.id)
  const admins = await rest(`platform_admins?select=user_id&user_id=eq.${portalUserId}`);
  if (admins.length === 0) {
    await rest("platform_admins", {
      method: "POST",
      body: JSON.stringify({
        user_id: portalUserId,
        tenant_id: tenantId,
        reason: "System build seed — platform administrator",
      }),
    });
    console.log("platform_admins: granted");
  } else {
    console.log("platform_admins: already granted");
  }

  // 4) Full grants for all modules
  const existing = await rest(
    `portal_module_permissions?select=id,module_key,permission_level&portal_user_id=eq.${portalUserId}`,
  );
  const byKey = new Map(existing.map((g) => [g.module_key, g]));
  let granted = 0;
  for (const mod of MODULES) {
    const cur = byKey.get(mod);
    if (!cur) {
      await rest("portal_module_permissions", {
        method: "POST",
        body: JSON.stringify({
          tenant_id: tenantId,
          portal_user_id: portalUserId,
          module_key: mod,
          permission_level: "full",
        }),
      });
      granted++;
    } else if (cur.permission_level !== "full") {
      await rest(`portal_module_permissions?id=eq.${cur.id}`, {
        method: "PATCH",
        body: JSON.stringify({ permission_level: "full" }),
      });
      granted++;
    }
  }
  console.log(`module grants: ${MODULES.length} modules at full (${granted} written this run)`);

  // 5) tenant_settings organization defaults (unset keys only)
  const orgRows = await rest(
    `tenant_settings?select=data&tenant_id=eq.${tenantId}&section=eq.organization`,
  );
  const org = { ...(orgRows[0]?.data || {}) };
  const defaults = {
    domain: "unsaidmemories.com",
    timezone: "America/Chicago",
    currency: "USD",
  };
  let changed = false;
  for (const [k, v] of Object.entries(defaults)) {
    if (!org[k]) { org[k] = v; changed = true; }
  }
  if (changed || orgRows.length === 0) {
    await rest("tenant_settings?on_conflict=tenant_id,section", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        tenant_id: tenantId,
        section: "organization",
        data: org,
        updated_at: new Date().toISOString(),
        updated_by: "seed-system",
      }),
    });
    console.log("tenant_settings.organization: seeded defaults");
  } else {
    console.log("tenant_settings.organization: already set");
  }

  console.log("SEED COMPLETE");
}

main().catch((e) => {
  console.error("SEED FAILED:", e.message);
  process.exit(1);
});
