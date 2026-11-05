import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { ensureDeveloperContext } from "@/lib/devportal-server";
import { normalizeTargeting, orgIdForUser } from "@/lib/ads-server";

export const dynamic = "force-dynamic";

/**
 * /api/ads/audiences — saved audiences (ad_audiences, Z1). The table was
 * referenced in zero source files: sixteen audience pages rendered
 * static mock lists while the campaigns API forced targeting to '{}'.
 * An audience is a named, reusable targeting record for the org;
 * campaign creation accepts audience_id and merges its targeting into
 * the campaign's ad group, and serve evaluates the result per request.
 *
 * GET: the org's audiences. POST { name, targeting }: create one —
 * targeting is the same contract serve reads (see lib/ads-server).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const organizationId = await orgIdForUser(user.id);
    if (!organizationId) return NextResponse.json({ audiences: [] });
    const audiences = await pgQueryStrict(
      `SELECT id, name, criteria, targeting, size, reach, created_at, updated_at
         FROM public.ad_audiences
        WHERE organization_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [organizationId],
    );
    return NextResponse.json({ audiences });
  } catch {
    return NextResponse.json({ error: "audiences_unavailable" }, { status: 503 });
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
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
  try {
    const ctx = await ensureDeveloperContext(user);
    const targeting = normalizeTargeting(body.targeting ?? body.criteria);
    const rows = await pgQueryStrict(
      `INSERT INTO public.ad_audiences (organization_id, name, criteria, targeting)
       VALUES ($1, $2, $3::jsonb, $3::jsonb)
       RETURNING id, name, criteria, targeting, size, reach, created_at, updated_at`,
      [ctx.organizationId, name, JSON.stringify(targeting)],
    );
    return NextResponse.json({ audience: rows[0] });
  } catch {
    return NextResponse.json({ error: "audience_create_unavailable" }, { status: 503 });
  }
}
