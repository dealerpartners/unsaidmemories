// Shared AI invocation logger — the write path behind B.11's outcome
// ("every AI call is auditable and costed"). Every real AI call site in the
// app (the lib/ai router and the Kinnect gateway) reports through here into
// public.ai_invocations.
//
// FAIL-SOFT BY CONTRACT: this function never throws and never rejects. A
// logging failure (DB down, model lookup miss, bad input) must never break
// or fail the AI call that produced the value being logged. Metrics that
// the provider response did not expose are stored as NULL — never invented.
//
// Model resolution: model_id is linked ONLY when an ai_models row matches
// the call's model ref (model_ref or name). With no registry row the column
// stays NULL (nullable by design) and the ref/label ride in metadata so the
// call is still attributable.

import { withPg, TENANT_ID } from "@/lib/crm/enterprise";

export interface AiInvocationEntry {
  /** Stable per-site feature key, e.g. "professor_chat", "kinnect_chat". */
  feature: string;
  /** Provider that served the call: "gemini" | "zai" | "vercel-ai-gateway". */
  provider?: string | null;
  /** Provider model identifier, e.g. "gemini-2.5-flash", "openai/gpt-4o-mini". */
  modelRef?: string | null;
  /** Human model label when no stable ref exists, e.g. "ZAI GLM-4.6". */
  modelLabel?: string | null;
  tenantId?: string | null;
  sellerId?: string | null;
  promptId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cost?: number | null;
  latencyMs?: number | null;
  status?: "success" | "error" | "timeout";
  error?: string | null;
  metadata?: Record<string, unknown>;
}

const num = (v: number | null | undefined): number | null =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v);

export async function logAiInvocation(entry: AiInvocationEntry): Promise<void> {
  try {
    if (!entry || !String(entry.feature || "").trim()) return;
    const tenant = entry.tenantId ?? TENANT_ID();
    await withPg(async (c) => {
      // Resolve the registry model only on a real match (model_ref or name,
      // earliest registration wins). No match → model_id stays NULL.
      let modelId: string | null = null;
      const ref = entry.modelRef || entry.modelLabel;
      if (ref) {
        const m = await c
          .query(
            `SELECT id FROM public.ai_models
              WHERE model_ref = $1 OR name = $1
              ORDER BY created_at ASC
              LIMIT 1`,
            [ref],
          )
          .catch(() => ({ rows: [] as Array<{ id: string }> }));
        modelId = m.rows[0]?.id ?? null;
      }
      const metadata: Record<string, unknown> = {
        ...(entry.metadata || {}),
        provider: entry.provider ?? null,
        model_ref: entry.modelRef ?? null,
        model_label: entry.modelLabel ?? null,
        ...(entry.error ? { error: String(entry.error).slice(0, 500) } : {}),
      };
      await c.query(
        `INSERT INTO public.ai_invocations
           (tenant_id, seller_id, feature, model_id, prompt_id, input_tokens, output_tokens, cost, latency_ms, status, metadata)
         VALUES ($1, $2::uuid, $3, $4::uuid, $5::uuid, $6, $7, $8, $9, $10, $11::jsonb)`,
        [
          tenant,
          entry.sellerId ?? null,
          String(entry.feature).trim(),
          modelId,
          entry.promptId ?? null,
          num(entry.inputTokens),
          num(entry.outputTokens),
          num(entry.cost),
          num(entry.latencyMs),
          entry.status ?? "success",
          JSON.stringify(metadata),
        ],
      );
    });
  } catch {
    // Observability must never break the caller's path. Swallow everything.
  }
}
