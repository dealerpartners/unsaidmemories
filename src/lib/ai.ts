// Unified AI router for the UNLEASHED classroom.
//
// Two providers coexist in this build:
//   - Gemini (lib/gemini.ts) — preserved from the original build; used when
//     AI_PROVIDER=gemini AND PROMPTQL_PLATFORM_API_URL is configured.
//   - ZAI (lib/zai.ts) — added in the unified build via z-ai-web-dev-sdk; the
//     default working provider so the classroom runs anywhere.
//
// Both expose identical generateText / generateJson signatures, so the API
// routes import from here and never need to know which provider is active.
//
// Every call through this router is logged to public.ai_invocations via
// lib/ai/log-invocation.ts (fail-soft — logging never breaks a call). The
// provider wrappers return only the generated value, so token/cost are not
// exposed at this layer and are logged as NULL; latency is measured here.

import * as gemini from "./gemini";
import * as zai from "./zai";
import { logAiInvocation } from "./ai/log-invocation";

export type AiProvider = "gemini" | "zai";

export function activeProvider(): AiProvider {
  const requested = process.env.AI_PROVIDER?.toLowerCase();
  if (requested === "gemini" && process.env.PROMPTQL_PLATFORM_API_URL) {
    return "gemini";
  }
  return "zai";
}

export const modelLabel =
  activeProvider() === "gemini" ? gemini.modelLabel : zai.modelLabel;

type History = Array<{ role: "user" | "model"; text: string }>;

function providerModel(provider: AiProvider) {
  return provider === "gemini"
    ? { modelRef: gemini.modelRef, modelLabel: gemini.modelLabel }
    : { modelRef: zai.modelRef, modelLabel: zai.modelLabel };
}

function failureStatus(error: unknown): "error" | "timeout" {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|timed out|abort/i.test(`${name} ${message}`)
    ? "timeout"
    : "error";
}

export async function generateText(
  visitorToken: string,
  systemInstruction: string,
  history: History,
  description: string,
  feature = "ai_router",
): Promise<string> {
  const provider = activeProvider();
  const startedAt = Date.now();
  try {
    const out =
      provider === "gemini"
        ? await gemini.generateText(visitorToken, systemInstruction, history, description)
        : await zai.generateText(visitorToken, systemInstruction, history, description);
    await logAiInvocation({
      feature,
      provider,
      ...providerModel(provider),
      latencyMs: Date.now() - startedAt,
      status: "success",
      metadata: { description, kind: "text" },
    });
    return out;
  } catch (error) {
    await logAiInvocation({
      feature,
      provider,
      ...providerModel(provider),
      latencyMs: Date.now() - startedAt,
      status: failureStatus(error),
      error: error instanceof Error ? error.message : String(error),
      metadata: { description, kind: "text" },
    });
    throw error;
  }
}

export async function generateJson<T>(
  visitorToken: string,
  systemInstruction: string,
  userPrompt: string,
  schema: Record<string, unknown>,
  description: string,
  feature = "ai_router",
): Promise<T> {
  const provider = activeProvider();
  const startedAt = Date.now();
  try {
    const out =
      provider === "gemini"
        ? await gemini.generateJson<T>(visitorToken, systemInstruction, userPrompt, schema, description)
        : await zai.generateJson<T>(visitorToken, systemInstruction, userPrompt, schema, description);
    await logAiInvocation({
      feature,
      provider,
      ...providerModel(provider),
      latencyMs: Date.now() - startedAt,
      status: "success",
      metadata: { description, kind: "json" },
    });
    return out;
  } catch (error) {
    await logAiInvocation({
      feature,
      provider,
      ...providerModel(provider),
      latencyMs: Date.now() - startedAt,
      status: failureStatus(error),
      error: error instanceof Error ? error.message : String(error),
      metadata: { description, kind: "json" },
    });
    throw error;
  }
}
