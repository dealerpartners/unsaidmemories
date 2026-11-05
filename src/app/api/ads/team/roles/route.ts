import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { ensureDeveloperContext } from "@/lib/devportal-server";
import { ensureAdAccount } from "@/lib/ads-server";
import { MASTER_TENANT_ID } from "@/lib/site-tenant";

export const dynamic = "force-dynamic";

/**
 * /api/ads/team/roles — role-based permissions (ad_account_roles, AB6).
 * The table existed live with zero code references. An account with no
 * stored rows runs on the platform default role set below (returned
 * with stored=false); PUT stores the account's own definition for a
 * role, which then wins. Permission keys are the capabilities the ad
 * portal checks: campaigns, creatives, audiences, billing, analytics,
 * leads, account, team — each read/write.
 */
const DEFAULT_ROLES: Array<{ role: string; permissions: string[] }> = [
  {
    role: "owner",
    permissions: [
      "campaigns:write", "creatives:write", "audiences:write", "billing:write",
      "analytics:read", "leads:write", "account:write", "team:write",
    ],
  },
  {
    role: "admin",
    permissions: [
      "campaigns:write", "creatives:write", "audiences:write", "billing:read",
      "analytics:read", "leads:write", "account:write", "team:write",
    ],
  },
  {
    role: "editor",
    permissions: [
      "campaigns:write", "creatives:write", "audiences:write",
      "analytics:read", "leads:read",
    ],
  },
  { role: "viewer", permissions: ["analytics:read", "leads:read", "campaigns:read"] },
];

async function accountFor(user: Parameters<typeof ensureDeveloperContext>[0]) {
  const ctx = await ensureDeveloperContext(user);
  return ensureAdAccount(ctx.organizationId, ctx.tenantId ?? MASTER_TENANT_ID, ctx.organizationName);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const account = await accountFor(user);
    const stored = await pgQueryStrict<{ role: string; permissions: unknown }>(
      `SELECT role, permissions FROM public.ad_account_roles WHERE account_id = $1 ORDER BY role`,
      [account.id],
    );
    const byRole = new Map(stored.map((r) => [r.role, r.permissions]));
    const roles = DEFAULT_ROLES.map((d) => ({
      role: d.role,
      permissions: (byRole.get(d.role) as string[] | undefined) ?? d.permissions,
      stored: byRole.has(d.role),
    }));
    for (const r of stored) {
      if (!roles.some((x) => x.role === r.role))
        roles.push({ role: r.role, permissions: (r.permissions as string[]) ?? [], stored: true });
    }
    return NextResponse.json({ roles });
  } catch {
    return NextResponse.json({ error: "roles_unavailable" }, { status: 503 });
  }
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const role = String(body.role ?? "").trim();
  const permissions = Array.isArray(body.permissions)
    ? body.permissions.map((p) => String(p)).filter(Boolean)
    : [];
  if (!role) return NextResponse.json({ error: "role_required" }, { status: 400 });
  try {
    const account = await accountFor(user);
    const existing = await pgQueryStrict<{ id: string }>(
      `SELECT id FROM public.ad_account_roles WHERE account_id = $1 AND role = $2`,
      [account.id, role],
    );
    if (existing[0]) {
      await pgQueryStrict(
        `UPDATE public.ad_account_roles SET permissions = $3::jsonb, updated_at = now()
          WHERE account_id = $1 AND role = $2`,
        [account.id, role, JSON.stringify(permissions)],
      );
    } else {
      await pgQueryStrict(
        `INSERT INTO public.ad_account_roles (account_id, role, permissions)
         VALUES ($1, $2, $3::jsonb)`,
        [account.id, role, JSON.stringify(permissions)],
      );
    }
    return NextResponse.json({ saved: true, role, permissions });
  } catch {
    return NextResponse.json({ error: "role_save_unavailable" }, { status: 503 });
  }
}
