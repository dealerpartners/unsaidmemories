import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { ensureDeveloperContext } from "@/lib/devportal-server";
import { orgIdForUser } from "@/lib/ads-server";

export const dynamic = "force-dynamic";

/**
 * /api/ads/templates — campaign launch templates (ad_campaign_templates,
 * W5). The table existed live with zero code references. A template's
 * `template` document carries the campaign-create payload shape
 * (objective / budgets / targeting / placements); "use template" posts
 * that document to /api/ads/campaigns, the one write path.
 */
const OBJECTIVES = [
  "brand_awareness",
  "traffic",
  "engagement",
  "lead_generation",
  "app_installs",
  "sales",
];

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const organizationId = await orgIdForUser(user.id);
    if (!organizationId) return NextResponse.json({ templates: [] });
    const templates = await pgQueryStrict(
      `SELECT id, name, category, objective, template, created_at, updated_at
         FROM public.ad_campaign_templates
        WHERE organization_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [organizationId],
    );
    return NextResponse.json({ templates });
  } catch {
    return NextResponse.json({ error: "templates_unavailable" }, { status: 503 });
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
  const objective = String(body.objective ?? "traffic");
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
  if (!OBJECTIVES.includes(objective))
    return NextResponse.json({ error: "invalid_objective" }, { status: 400 });
  try {
    const ctx = await ensureDeveloperContext(user);
    const rows = await pgQueryStrict(
      `INSERT INTO public.ad_campaign_templates (organization_id, name, category, objective, template)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id, name, category, objective, template, created_at, updated_at`,
      [
        ctx.organizationId,
        name,
        body.category ? String(body.category) : null,
        objective,
        JSON.stringify(body.template ?? {}),
      ],
    );
    return NextResponse.json({ template: rows[0] });
  } catch {
    return NextResponse.json({ error: "template_create_unavailable" }, { status: 503 });
  }
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  try {
    const organizationId = await orgIdForUser(user.id);
    if (!organizationId) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const rows = await pgQueryStrict(
      `DELETE FROM public.ad_campaign_templates WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [id, organizationId],
    );
    if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "template_delete_unavailable" }, { status: 503 });
  }
}
