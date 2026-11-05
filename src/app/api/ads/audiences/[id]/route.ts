import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { normalizeTargeting, orgIdForUser } from "@/lib/ads-server";

export const dynamic = "force-dynamic";

/**
 * /api/ads/audiences/[id] — single audience (Z1). The audiences route
 * only listed and created; the detail/edit pages rendered static
 * shells with nothing to read or write. PATCH renames and re-targets
 * (criteria + targeting stay in step, as POST writes them); DELETE
 * removes the audience. Campaigns that already merged its targeting
 * keep their copy — serve reads groups, not audiences.
 */
async function loadOwned(userId: string, id: string) {
  const organizationId = await orgIdForUser(userId);
  if (!organizationId) return null;
  const rows = await pgQueryStrict(
    `SELECT id, name, criteria, targeting, size, reach, created_at, updated_at
       FROM public.ad_audiences
      WHERE id = $1 AND organization_id = $2`,
    [id, organizationId],
  );
  return rows[0] ?? null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const audience = await loadOwned(user.id, id);
    if (!audience) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ audience });
  } catch {
    return NextResponse.json({ error: "audience_unavailable" }, { status: 503 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const existing = await loadOwned(user.id, id);
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const name = body.name !== undefined ? String(body.name).trim() : existing.name;
    if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
    const targeting =
      body.targeting !== undefined || body.criteria !== undefined
        ? normalizeTargeting(body.targeting ?? body.criteria)
        : existing.targeting;
    const rows = await pgQueryStrict(
      `UPDATE public.ad_audiences
          SET name = $2, criteria = $3::jsonb, targeting = $3::jsonb, updated_at = now()
        WHERE id = $1
        RETURNING id, name, criteria, targeting, size, reach, created_at, updated_at`,
      [id, name, JSON.stringify(targeting)],
    );
    return NextResponse.json({ audience: rows[0] });
  } catch {
    return NextResponse.json({ error: "audience_update_unavailable" }, { status: 503 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const existing = await loadOwned(user.id, id);
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await pgQueryStrict(`DELETE FROM public.ad_audiences WHERE id = $1`, [id]);
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "audience_delete_unavailable" }, { status: 503 });
  }
}
