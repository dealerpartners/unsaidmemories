import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { ensureDeveloperContext } from "@/lib/devportal-server";
import { ensureAdAccount } from "@/lib/ads-server";
import { MASTER_TENANT_ID } from "@/lib/site-tenant";

export const dynamic = "force-dynamic";

/**
 * /api/ads/team — team member management (ad_team_members, AB5). The
 * table existed live with zero code references; every team page
 * rendered the fabricated template. Members are the ad account's
 * roster: an invite row keyed by email until the person is linked to a
 * user. Role strings are interpreted by /api/ads/team/roles (AB6).
 */
async function accountFor(user: Parameters<typeof ensureDeveloperContext>[0]) {
  const ctx = await ensureDeveloperContext(user);
  return ensureAdAccount(ctx.organizationId, ctx.tenantId ?? MASTER_TENANT_ID, ctx.organizationName);
}

const SELECT =
  "id, account_id, user_id, invited_email, role, status, created_at, updated_at";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const account = await accountFor(user);
    const members = await pgQueryStrict(
      `SELECT ${SELECT} FROM public.ad_team_members
        WHERE account_id = $1
        ORDER BY created_at ASC
        LIMIT 200`,
      [account.id],
    );
    return NextResponse.json({ members });
  } catch {
    return NextResponse.json({ error: "team_unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const email = String(body.email ?? body.invited_email ?? "").trim().toLowerCase();
  const role = String(body.role ?? "viewer").trim() || "viewer";
  if (!email || !email.includes("@"))
    return NextResponse.json({ error: "valid_email_required" }, { status: 400 });
  try {
    const account = await accountFor(user);
    const dup = await pgQueryStrict<{ id: string }>(
      `SELECT id FROM public.ad_team_members
        WHERE account_id = $1 AND lower(invited_email) = $2 AND status <> 'removed'`,
      [account.id, email],
    );
    if (dup[0]) return NextResponse.json({ error: "already_on_roster" }, { status: 409 });
    const rows = await pgQueryStrict(
      `INSERT INTO public.ad_team_members (account_id, invited_email, role, status)
       VALUES ($1, $2, $3, 'invited')
       RETURNING ${SELECT}`,
      [account.id, email, role],
    );
    return NextResponse.json({ member: rows[0] });
  } catch {
    return NextResponse.json({ error: "invite_unavailable" }, { status: 503 });
  }
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  const sets: string[] = [];
  const values: unknown[] = [];
  if (body.role !== undefined) {
    values.push(String(body.role));
    sets.push(`role = $${values.length}`);
  }
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!["invited", "active", "suspended", "removed"].includes(status))
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    values.push(status);
    sets.push(`status = $${values.length}`);
  }
  if (!sets.length) return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  try {
    const account = await accountFor(user);
    values.push(id, account.id);
    const rows = await pgQueryStrict(
      `UPDATE public.ad_team_members SET ${sets.join(", ")}, updated_at = now()
        WHERE id = $${values.length - 1} AND account_id = $${values.length}
        RETURNING ${SELECT}`,
      values,
    );
    if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ member: rows[0] });
  } catch {
    return NextResponse.json({ error: "team_update_unavailable" }, { status: 503 });
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  try {
    const account = await accountFor(user);
    const rows = await pgQueryStrict(
      `UPDATE public.ad_team_members SET status = 'removed', updated_at = now()
        WHERE id = $1 AND account_id = $2 AND status <> 'removed'
        RETURNING id`,
      [id, account.id],
    );
    if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ removed: true });
  } catch {
    return NextResponse.json({ error: "team_remove_unavailable" }, { status: 503 });
  }
}
