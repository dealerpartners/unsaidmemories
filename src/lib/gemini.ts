// Gemini provider — KEPT from the original UNLEASHED build (do not delete).
// Reaches Google Gemini 2.5 Flash through the PromptQL platform integration
// proxy using each visitor's token. Active only when PROMPTQL_PLATFORM_API_URL
// is configured; otherwise the unified router (lib/ai.ts) falls back to ZAI.

const MODEL = "gemini-2.5-flash";
const PROVIDER = "__gemini-web-search";

export const modelLabel = "Google Gemini 2.5 Flash";
export const modelRef = MODEL;

function endpoint() {
  const base = process.env.PROMPTQL_PLATFORM_API_URL?.replace(/\/$/, "");
  if (!base) throw new Error("PROMPTQL_PLATFORM_API_URL is not configured.");
  return `${base}/v1/integration/${PROVIDER}/generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
}

export async function generateJson<T>(
  visitorToken: string,
  systemInstruction: string,
  userPrompt: string,
  schema: Record<string, unknown>,
  description: string,
): Promise<T> {
  const response = await fetch(endpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${visitorToken}`,
      "Content-Type": "application/json",
      "X-PromptQL-Description": description.replace(/\n/g, " ").slice(0, 220),
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.35,
      },
    }),
    cache: "no-store",
  });

  if (response.status === 403) {
    throw new Error("Gemini permission is required. Reload the app and approve the integration.");
  }
  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}).`);
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no usable content.");
  return JSON.parse(text) as T;
}

export async function generateText(
  visitorToken: string,
  systemInstruction: string,
  history: Array<{ role: "user" | "model"; text: string }>,
  description: string,
) {
  const response = await fetch(endpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${visitorToken}`,
      "Content-Type": "application/json",
      "X-PromptQL-Description": description.replace(/\n/g, " ").slice(0, 220),
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: history.map((item) => ({
        role: item.role,
        parts: [{ text: item.text }],
      })),
      generationConfig: { temperature: 0.45, maxOutputTokens: 900 },
    }),
    cache: "no-store",
  });

  if (response.status === 403) {
    throw new Error("Gemini permission is required. Reload the app and approve the integration.");
  }
  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}).`);
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no usable response.");
  return text as string;
}
