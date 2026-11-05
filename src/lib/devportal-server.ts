// Developer portal server helpers (imported from musixkube/devportal and
// hooked into the UnSaid Memories database).
//
// Identity stays with the platform's Supabase Auth — there is no second
// users table. On a developer's first dashboard visit we provision:
//   - a public.developer_profiles row (user_id = the auth user id)
//   - a public.organizations row bridged to a tenant via tenant_id
//     (default: the master UnSaid Memories tenant), linked from the profile
// API keys created in the dashboard hang off that organization, and the
// public partner API resolves key -> organization -> tenant_id for scope.
//
// Provisioning runs with the service role (organizations has no
// authenticated-insert policy by design); all day-to-day dashboard reads
// and writes go through the session client under RLS own-rows policies.

const SB_URL = (
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ""
).replace(/\/$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// UNSAID ADAPTATION (transplant lane 2, 2026-10-30): was UnSaid Memories's hardcoded
// master tenant UUID; Unsaid resolves its tenant from the environment.
const MASTER_TENANT_ID = process.env.SUPABASE_TENANT_ID ?? process.env.UNSAID_TENANT_ID ?? "";

export interface DeveloperContext {
  profileId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  tenantId: string;
}

async function sb<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  if (!SB_KEY) throw new Error("service role not configured");
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      authorization: `Bearer ${SB_KEY}`,
      accept: "application/json",
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`rest ${path.split("?")[0]} ${res.status}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

interface AuthUserLike {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

export async function ensureDeveloperContext(
  user: AuthUserLike,
): Promise<DeveloperContext> {
  const profiles = await sb<Record<string, unknown>[]>(
    `developer_profiles?user_id=eq.${user.id}&select=id,organization_id,display_name`,
  );
  const existing = profiles[0];
  if (existing?.organization_id) {
    const orgs = await sb<Record<string, unknown>[]>(
      `organizations?id=eq.${existing.organization_id}&select=id,name,slug,tenant_id`,
    );
    const org = orgs[0];
    if (org) {
      return {
        profileId: String(existing.id),
        organizationId: String(org.id),
        organizationName: String(org.name),
        organizationSlug: String(org.slug),
        tenantId: String(org.tenant_id ?? MASTER_TENANT_ID),
      };
    }
  }

  const meta = user.user_metadata ?? {};
  const displayName =
    (typeof meta.display_name === "string" && meta.display_name) ||
    (typeof meta.company_name === "string" && meta.company_name) ||
    (user.email ? user.email.split("@")[0] : "Developer");
  const orgName =
    (typeof meta.company_name === "string" && meta.company_name) ||
    `${displayName}'s Organization`;
  const slug =
    `${slugify(orgName) || "org"}-${user.id.slice(0, 8)}`.toLowerCase();

  const orgRows = await sb<Record<string, unknown>[]>("organizations", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      name: orgName,
      slug,
      tenant_id: MASTER_TENANT_ID,
    }),
  });
  const org = orgRows[0];

  if (existing) {
    await sb(`developer_profiles?id=eq.${existing.id}`, {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({ organization_id: org.id }),
    });
    return {
      profileId: String(existing.id),
      organizationId: String(org.id),
      organizationName: String(org.name),
      organizationSlug: String(org.slug),
      tenantId: MASTER_TENANT_ID,
    };
  }

  const profileRows = await sb<Record<string, unknown>[]>(
    "developer_profiles",
    {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        user_id: user.id,
        display_name: displayName,
        organization_id: org.id,
      }),
    },
  );
  return {
    profileId: String(profileRows[0].id),
    organizationId: String(org.id),
    organizationName: String(org.name),
    organizationSlug: String(org.slug),
    tenantId: MASTER_TENANT_ID,
  };
}
