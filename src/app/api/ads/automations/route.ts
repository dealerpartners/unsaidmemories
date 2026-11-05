import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { ensureDeveloperContext } from "@/lib/devportal-server";
import { orgIdForUser } from "@/lib/ads-server";

export const dynamic = "force-dynamic";

/**
 * /api/ads/automations — automation rules (ad_automations, W6/W7). The
 * table existed live with zero code references; the automated-rules and
 * promotional-suite pages rendered hardcoded rule cards. A rule is a
 * trigger document + an action document for the org's ad account; the
 * `active` flag is what the operator controls here.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const organizationId = await orgIdForUser(user.id);
    if (!organizationId) return NextResponse.json({ automations: [] });
    const automations = await pgQueryStrict(
      `SELECT id, name, trigger_config, action_config, active, created_at, updated_at
         FROM public.ad_automations
        WHERE organization_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [organizationId],
    );
    return NextResponse.json({ automations });
  } catch {
    return NextResponse.json({ error: "automations_unavailable" }, { status: 503 });
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
    const rows = await pgQueryStrict(
      `INSERT INTO public.ad_automations (organization_id, name, trigger_config, action_config, active)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
       RETURNING id, name, trigger_config, action_config, active, created_at, updated_at`,
      [
        ctx.organizationId,
        name,
        JSON.stringify(body.trigger_config ?? {}),
        JSON.stringify(body.action_config ?? {}),
        body.active !== false,
      ],
    );
    return NextResponse.json({ automation: rows[0] });
  } catch {
    return NextResponse.json({ error: "automation_create_unavailable" }, { status: 503 });
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
  const set = (col: string, val: unknown, json = false) => {
    values.push(json ? JSON.stringify(val ?? {}) : val);
    sets.push(`${col} = $${values.length}${json ? "::jsonb" : ""}`);
  };
  if (body.name !== undefined) set("name", String(body.name));
  if (body.trigger_config !== undefined) set("trigger_config", body.trigger_config, true);
  if (body.action_config !== undefined) set("action_config", body.action_config, true);
  if (body.active !== undefined) set("active", body.active === true);
  if (!sets.length) return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  try {
    const organizationId = await orgIdForUser(user.id);
    if (!organizationId) return NextResponse.json({ error: "not_found" }, { status: 404 });
    values.push(id, organizationId);
    const rows = await pgQueryStrict(
      `UPDATE public.ad_automations SET ${sets.join(", ")}, updated_at = now()
        WHERE id = $${values.length - 1} AND organization_id = $${values.length}
        RETURNING id, name, trigger_config, action_config, active, created_at, updated_at`,
      values,
    );
    if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ automation: rows[0] });
  } catch {
    return NextResponse.json({ error: "automation_update_unavailable" }, { status: 503 });
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
      `DELETE FROM public.ad_automations WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [id, organizationId],
    );
    if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "automation_delete_unavailable" }, { status: 503 });
  }
}
