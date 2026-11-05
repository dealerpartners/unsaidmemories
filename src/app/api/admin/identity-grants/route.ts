import { NextRequest, NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { withPgStrict } from "@/lib/crm/enterprise";
import { requireModuleApi } from "@/lib/admin/gate";
import { findAuthUserByEmail, getSupabaseAdmin } from "@/lib/portal-auth";

// ============================================================================
// /api/admin/identity-grants — X1 · the identity-grant console API.
//
// Store: public.identity_grants — the SAME rows the grants-first resolver
// (lib/portal-auth resolvePortalUser) reads: scope / role / membership_role /
// tenant_id / display_name / station_name / source WHERE user_id = the
// identity's AUTH user id AND status = 'active'. POST writes exactly the
// row shape issueIdentityGrant writes in
// src/app/api/admin/onboarding/_provision.ts (same columns, same
// active-grant dedupe on (user_id, scope, tenant_id)), with source
// 'admin_console' so the console's own grants carry true provenance in the
// list below. A grant written here is honored by POST /api/auth/switch the
// next time the identity's session resolves its grant set: the resolver
// reads status='active' rows, and the switch finds the grant by scope.
//
// Revoke is a status flip to 'revoked', never a delete — the row stays as
// the record of what was held and when it ended. The resolver honors only
// 'active', so a revoked grant stops adjoining at the identity's next
// session resolution (an already-signed session carries its grant set in
// the cookie until it refreshes — the console page states this on its
// face).
//
// GATE: requireModuleApi("administration", …) — the module the K tools
// (impersonation et al.) ride; read for the list, write for grant/revoke.
// Strict pg helpers throughout: a database failure returns an error, it
// never masquerades as an empty grant list.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The switch endpoint's vocabulary (POST /api/auth/switch). Vet and
// pharmacy scopes are removed (2026-10-31) — Unsaid runs no telemed or
// pharmacy portals.
const SCOPES = ["admin", "employee", "customer", "seller"] as const;

// Role defaults mirror the PortalRole union (admin→admin,
// employee→admin, customer→customer, seller→seller). Both stay editable
// in the console form.
const ROLE_DEFAULT: Record<(typeof SCOPES)[number], string> = {
  admin: "admin",
  employee: "admin",
  customer: "customer",
  seller: "seller",
};
const MEMBERSHIP_DEFAULT: Record<(typeof SCOPES)[number], string | null> = {
  admin: "platform_admin",
  employee: "staff",
  customer: null,
  seller: "seller",
};

const COLS = `id::text AS id, user_id::text AS user_id, scope, role,
  membership_role, tenant_id::text AS tenant_id, display_name, station_name,
  status, source, created_at`;

type GrantRow = Record<string, any>;

function mapRow(r: GrantRow, email: string | null) {
  return {
    id: r.id,
    userId: r.user_id,
    email,
    displayName: r.display_name ?? null,
    scope: r.scope,
    role: r.role ?? null,
    membershipRole: r.membership_role ?? null,
    tenantId: r.tenant_id ?? null,
    stationName: r.station_name ?? null,
    status: r.status,
    source: r.source ?? null,
    createdAt: r.created_at,
  };
}

export async function GET() {
  const gate = await requireModuleApi("administration", "read");
  if (gate) return gate;
  try {
    const rows = await pgQueryStrict<GrantRow>(
      `SELECT ${COLS} FROM public.identity_grants ORDER BY created_at DESC LIMIT 500`,
    );
    // Emails live on the auth user, not the grant row — enrich best-effort;
    // a failed lookup leaves email null, the rows remain the truth.
    const emailById = new Map<string, string>();
    const admin = getSupabaseAdmin();
    if (admin && rows.length > 0) {
      try {
        const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
        for (const u of data?.users ?? []) {
          if (u.id && u.email) emailById.set(u.id, u.email);
        }
      } catch {
        /* decoration only */
      }
    }
    return NextResponse.json({
      success: true,
      grants: rows.map((r) => mapRow(r, emailById.get(r.user_id) ?? null)),
      total: rows.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to list identity grants." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("administration", "write");
  if (gate) return gate;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const email = String(body?.email || "").trim().toLowerCase();
  const scope = String(body?.scope || "") as (typeof SCOPES)[number];
  if (!email || !email.includes("@")) {
    return NextResponse.json({ success: false, error: "A valid email is required." }, { status: 400 });
  }
  if (!(SCOPES as readonly string[]).includes(scope)) {
    return NextResponse.json({ success: false, error: "Unknown portal scope." }, { status: 400 });
  }
  const role = String(body?.role || ROLE_DEFAULT[scope]);
  const membershipRole =
    body?.membershipRole != null && String(body.membershipRole) !== ""
      ? String(body.membershipRole)
      : MEMBERSHIP_DEFAULT[scope];
  const tenantId = body?.tenantId ? String(body.tenantId) : null;
  if (tenantId && !UUID_RE.test(tenantId)) {
    return NextResponse.json({ success: false, error: "Tenant id must be a uuid or empty." }, { status: 400 });
  }
  const displayName = body?.displayName ? String(body.displayName) : null;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ success: false, error: "Auth admin is not configured." }, { status: 500 });
  }
  const authUser: any = await findAuthUserByEmail(admin, email);
  if (!authUser?.id) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No account exists for that email. A grant adjoins an existing identity — the person signs up first, then the portal is granted here.",
      },
      { status: 404 },
    );
  }

  try {
    const result = await withPgStrict(async (client) => {
      // Same INSERT shape + active-grant dedupe as issueIdentityGrant
      // (_provision.ts); source records this console as the issuer.
      const ins = await client.query(
        `INSERT INTO public.identity_grants
           (id, user_id, scope, role, membership_role, tenant_id, display_name, status, source)
         SELECT gen_random_uuid(), $1::uuid, $2, $3, $4, $5::uuid, $6, 'active', 'admin_console'
          WHERE NOT EXISTS (
            SELECT 1 FROM public.identity_grants
             WHERE user_id = $1::uuid AND scope = $2
               AND tenant_id IS NOT DISTINCT FROM $5::uuid AND status = 'active'
          )
         RETURNING ${COLS}`,
        [authUser.id, scope, role, membershipRole, tenantId, displayName],
      );
      if (ins.rows[0]) return { row: ins.rows[0] as GrantRow, alreadyHeld: false };
      const ex = await client.query(
        `SELECT ${COLS} FROM public.identity_grants
          WHERE user_id = $1::uuid AND scope = $2
            AND tenant_id IS NOT DISTINCT FROM $3::uuid AND status = 'active'
          LIMIT 1`,
        [authUser.id, scope, tenantId],
      );
      return { row: (ex.rows[0] ?? null) as GrantRow | null, alreadyHeld: true };
    });
    if (!result.row) {
      return NextResponse.json({ success: false, error: "The grant was not recorded." }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      grant: mapRow(result.row, email),
      alreadyHeld: result.alreadyHeld,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to record the grant." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireModuleApi("administration", "write");
  if (gate) return gate;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = String(body?.id || "");
  const status = String(body?.status || "");
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ success: false, error: "A grant id is required." }, { status: 400 });
  }
  if (status !== "active" && status !== "revoked") {
    return NextResponse.json(
      { success: false, error: "Status must be 'active' or 'revoked'." },
      { status: 400 },
    );
  }
  try {
    const rows = await pgQueryStrict<GrantRow>(
      `UPDATE public.identity_grants SET status = $2 WHERE id = $1::uuid RETURNING ${COLS}`,
      [id, status],
    );
    if (!rows[0]) {
      return NextResponse.json({ success: false, error: "Grant not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true, grant: mapRow(rows[0], null) });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to update the grant." },
      { status: 500 },
    );
  }
}
