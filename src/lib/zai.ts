// ZAI provider — NEW in the unified build (z-ai-web-dev-sdk).
// Mirrors the Gemini provider's function signatures so the unified router
// (lib/ai.ts) can swap between Gemini and ZAI transparently. Uses the SDK's
// auto-configured client (no credentials in code).

import ZAI from "z-ai-web-dev-sdk";

export const modelLabel = "ZAI GLM-4.6";
// The SDK call below does not pin a model id, so there is no stable ref to
// register against ai_models — the label is the platform's name for it and
// the invocation logger matches on it (model_id stays NULL until a registry
// row carries this label as its name/model_ref).
export const modelRef: string | null = null;

let clientPromise: Promise<ZAI> | null = null;
function client(): Promise<ZAI> {
  if (!clientPromise) clientPromise = ZAI.create();
  return clientPromise;
}

type History = Array<{ role: "user" | "model"; text: string }>;

function stripFences(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
  }
  return trimmed;
}

// Convert the Gemini-style schema (STRING/OBJECT/ARRAY/BOOLEAN/NUMBER) into a
// plain JSON-Schema fragment so the model has an explicit target shape.
function toJsonSchema(node: unknown): unknown {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(toJsonSchema);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "type" && typeof value === "string") {
      out[key] = value.toLowerCase();
    } else {
      out[key] = toJsonSchema(value);
    }
  }
  return out;
}

export async function generateText(
  _visitorToken: string,
  systemInstruction: string,
  history: History,
  _description: string,
): Promise<string> {
  const zai = await client();
  const messages = [
    { role: "system" as const, content: systemInstruction },
    ...history.map((item) => ({
      role: (item.role === "model" ? "assistant" : "user") as "user" | "assistant",
      content: item.text,
    })),
  ];
  const response = await zai.chat.completions.create({
    messages,
    temperature: 0.45,
    max_tokens: 900,
  });
  const text = response?.choices?.[0]?.message?.content;
  if (!text) throw new Error("ZAI returned no usable response.");
  return text as string;
}

export async function generateJson<T>(
  _visitorToken: string,
  systemInstruction: string,
  userPrompt: string,
  schema: Record<string, unknown>,
  _description: string,
): Promise<T> {
  const zai = await client();
  const schemaDoc = JSON.stringify(toJsonSchema(schema), null, 2);
  const messages = [
    {
      role: "system" as const,
      content: `${systemInstruction}\n\nRespond with a single valid JSON object (no markdown, no prose) that exactly matches this JSON schema:\n${schemaDoc}`,
    },
    { role: "user" as const, content: userPrompt },
  ];
  const response = await zai.chat.completions.create({
    messages,
    temperature: 0.35,
    response_format: { type: "json_object" },
  });
  const text = response?.choices?.[0]?.message?.content;
  if (!text) throw new Error("ZAI returned no usable content.");
  return JSON.parse(stripFences(text)) as T;
}
