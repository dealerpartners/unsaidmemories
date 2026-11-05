import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";
import { ACTIVE_TENANT_COOKIE, ADMIN_TENANT_ID } from "@/lib/admin-api";
import { withPg } from "@/lib/crm/enterprise";
import {
  encodeTenantSelection,
  identityKeysForRequest,
  resolveActiveTenantId,
} from "@/lib/admin/tenant-resolution";

/* /api/admin/tenants/active
 *
 * GET  -> { tenant_id } — the active tenant for this admin session,
 *   resolved from the caller's membership/role: their identity-bound
 *   switcher selection when it names a tenant in their entitled set,
 *   otherwise their home tenant (master for the platform owner; a
 *   franchise session's own tenant). A stale or foreign stored
 *   selection never wins over the signed-in identity.
 * POST -> { tenant_id } — set the active tenant. Body: { tenant_id }.
 *   The requested tenant is validated against the caller's switchable
 *   set (same rules as GET /api/admin/tenants/switchable), and the
 *   selection is stored BOUND to the caller's identity, so it applies
 *   to this caller's sessions — not to whoever uses the browser next,
 *   and not past a change of identity.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const tenant_id = await withPg(async (client) => resolveActiveTenantId(client, req));
  return NextResponse.json({ tenant_id: tenant_id || ADMIN_TENANT_ID() });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const tenant_id = String(body?.tenant_id || "").trim();
  if (!UUID_RE.test(tenant_id)) {
    return NextResponse.json({ error: "tenant_id must be a UUID" }, { status: 400 });
  }

  // Validate against the caller's switchable set.
  const sw = await fetch(new URL("/api/admin/tenants/switchable", req.url), {
    headers: { cookie: req.headers.get("cookie") || "" },
    cache: "no-store",
  });
  if (!sw.ok) {
    return NextResponse.json({ error: "Could not verify tenant access" }, { status: 502 });
  }
  const swJson = await sw.json().catch(() => ({}));
  const allowed: string[] = (swJson?.data || []).map((t: any) => String(t.id));
  if (!allowed.includes(tenant_id)) {
    return NextResponse.json({ error: "Tenant not available to this user" }, { status: 403 });
  }

  const identityKeys = await identityKeysForRequest(req);
  const res = NextResponse.json({ tenant_id });
  res.cookies.set(ACTIVE_TENANT_COOKIE, encodeTenantSelection(tenant_id, identityKeys), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
