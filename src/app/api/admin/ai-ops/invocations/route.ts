import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, withPgStrict } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// POST /api/admin/ai-ops/invocations -> log one AI invocation into
// public.ai_invocations. This is the write path that makes every AI call
// auditable and costed (B.11 outcome): feature, model/prompt links, token
// counts, cost, latency, status. Until this route existed nothing in the
// codebase wrote to ai_invocations at all.
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const feature = String(b.feature || "").trim();
  if (!feature) return NextResponse.json({ error: "feature is required" }, { status: 400 });

  const num = (v: any) => (v === null || v === undefined || v === "" ? null : Number(v));
  const inputTokens = num(b.input_tokens);
  const outputTokens = num(b.output_tokens);
  const cost = num(b.cost);
  const latencyMs = num(b.latency_ms);
  for (const [k, v] of Object.entries({ input_tokens: inputTokens, output_tokens: outputTokens, cost, latency_ms: latencyMs })) {
    if (v !== null && Number.isNaN(v)) return NextResponse.json({ error: `${k} must be a number` }, { status: 400 });
  }
  const status = ["success", "error", "timeout"].includes(String(b.status)) ? String(b.status) : "success";
  const modelId = b.model_id ? String(b.model_id) : null;
  const promptId = b.prompt_id ? String(b.prompt_id) : null;
  const sellerId = b.seller_id ? String(b.seller_id) : null;

  try {
    const out = await withPgStrict(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO public.ai_invocations
           (tenant_id, seller_id, feature, model_id, prompt_id, input_tokens, output_tokens, cost, latency_ms, status, metadata)
         VALUES ($1, $2::uuid, $3, $4::uuid, $5::uuid, $6, $7, $8, $9, $10, '{}'::jsonb)
         RETURNING id, feature, status, cost::float AS cost, created_at`,
        [tenant, sellerId, feature, modelId, promptId, inputTokens ?? 0, outputTokens ?? 0, cost ?? 0, latencyMs, status]
      );
      if (!rows[0]) throw new Error("AI invocation insert did not land");
      return { invocation: rows[0] };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai invocation log failed" }, { status: 500 });
  }
}
