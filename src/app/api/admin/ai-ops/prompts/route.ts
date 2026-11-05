import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, withPgStrict } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";

export const dynamic = "force-dynamic";

// B.11 Prompts — public.ai_prompts (exists live): versioned prompt templates
// per feature. Editing the text bumps version by 1 (the version column is
// the versioning mechanism the table ships with).

const COLS = `id, name, feature, prompt_text, version, status, created_at, updated_at`;

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT ${COLS} FROM public.ai_prompts WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT 200`,
        [tenant]
      );
      return { prompts: rows };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai prompts list failed" }, { status: 500 });
  }
}

// POST /api/admin/ai-ops/prompts -> create a prompt template (version 1)
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const name = String(b.name || "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const feature = b.feature ? String(b.feature).trim() : null;
  const promptText = b.prompt_text ? String(b.prompt_text) : null;
  const status = ["draft", "active", "archived"].includes(String(b.status)) ? String(b.status) : "draft";
  const actorId = await getActorIdFromRequest(req);
  try {
    const out = await withPgStrict(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO public.ai_prompts (tenant_id, name, feature, prompt_text, version, status)
         VALUES ($1, $2, $3, $4, 1, $5) RETURNING ${COLS}`,
        [tenant, name, feature, promptText, status]
      );
      if (!rows[0]) throw new Error("AI prompt insert did not land");
      await writeSellerAudit(c, {
        tenantId: tenant,
        actorId,
        action: "ai_prompt.created",
        entityType: "ai_prompt",
        entityId: rows[0].id,
        afterState: { name, feature, status },
        ipAddress: requestIp(req),
      });
      return { prompt: rows[0] };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai prompt create failed" }, { status: 500 });
  }
}
