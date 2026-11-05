// Shared AI gateway — the one transport every AI surface calls through.
//
// Mirrors the Kinnect chat gateway exactly (same provider, same model
// order, same per-call audit logging) so new AI surfaces — the Learning
// Center tutor first — ride the proven path instead of growing a second
// one. Transport: Vercel AI Gateway chat completions, keyed by
// AI_GATEWAY_API_KEY. Free model first; the paid model answers only if
// the free one is down or empty. Every attempt is reported through
// logAiInvocation (fail-soft by contract). Returns the reply text, or
// null when no model answered — callers own their honest fallback.

import { logAiInvocation } from "@/lib/ai/log-invocation";
import { TENANT_ID } from "@/lib/crm/enterprise";

const GATEWAY_KEY = process.env.AI_GATEWAY_API_KEY || "";
const MODELS = ["inclusionai/ling-3.1-flash-free", "openai/gpt-4o-mini"];

/** The gateway's configured model set, in rotation order — the only
 *  models any surface may offer (§6.16.11.1.2's selector reads this;
 *  nothing here adds, removes, or reprices a model). */
export const GATEWAY_MODELS: readonly string[] = MODELS;

export interface GatewayMessage {
  role: string;
  content: string;
}

export async function gatewayChat(
  messages: GatewayMessage[],
  opts: { maxTokens?: number; json?: boolean; feature: string; preferredModel?: string | null },
): Promise<string | null> {
  const maxTokens = opts.maxTokens ?? 600;
  const json = opts.json ?? false;
  const feature = opts.feature;
  if (!GATEWAY_KEY) return null;
  // A caller's preferred model (§6.16.11.1.2 — the learner's tutor
  // choice) is tried first WITHIN the configured set; the rotation
  // itself — membership and fallback order — is unchanged.
  const order =
    opts.preferredModel && MODELS.includes(opts.preferredModel)
      ? [opts.preferredModel, ...MODELS.filter((m) => m !== opts.preferredModel)]
      : MODELS;
  for (const model of order) {
    const startedAt = Date.now();
    try {
      const r = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${GATEWAY_KEY}` },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: model.endsWith("-free") ? maxTokens + 600 : maxTokens,
          temperature: 0.2,
          ...(json ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(model.endsWith("-free") ? 12_000 : 20_000),
      });
      if (!r.ok) {
        await logAiInvocation({
          feature,
          provider: "vercel-ai-gateway",
          modelRef: model,
          tenantId: TENANT_ID(),
          latencyMs: Date.now() - startedAt,
          status: "error",
          error: `gateway HTTP ${r.status}`,
          metadata: { http_status: r.status },
        });
        continue;
      }
      const j = await r.json();
      const out = (j.choices?.[0]?.message?.content as string) || "";
      const usage = {
        inputTokens: j?.usage?.prompt_tokens ?? null,
        outputTokens: j?.usage?.completion_tokens ?? null,
      };
      if (out.trim()) {
        await logAiInvocation({
          feature,
          provider: "vercel-ai-gateway",
          modelRef: model,
          tenantId: TENANT_ID(),
          ...usage,
          latencyMs: Date.now() - startedAt,
          status: "success",
        });
        return out;
      }
      await logAiInvocation({
        feature,
        provider: "vercel-ai-gateway",
        modelRef: model,
        tenantId: TENANT_ID(),
        ...usage,
        latencyMs: Date.now() - startedAt,
        status: "error",
        error: "gateway returned empty content",
        metadata: { reason: "empty_content" },
      });
    } catch (e) {
      await logAiInvocation({
        feature,
        provider: "vercel-ai-gateway",
        modelRef: model,
        tenantId: TENANT_ID(),
        latencyMs: Date.now() - startedAt,
        status: e instanceof Error && /timeout|abort/i.test(`${e.name} ${e.message}`) ? "timeout" : "error",
        error: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
  }
  return null;
}
