import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { gatewayChat } from "@/lib/ai/gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/ads/creatives/generate — AI-powered creative generation
 * (Z5). Drafts ad copy through the platform's real AI gateway (the
 * same gatewayChat transport as the CMS page drafter; the call is
 * recorded in ai_invocations under feature "ads_creative_draft").
 * DRAFT-ONLY: nothing is written here — the studio reviews a variant
 * and saves it through POST /api/ads/creatives, the one write path.
 * When the gateway is not configured or every model fails, this says
 * so (503) — it never fabricates copy.
 */
const SYSTEM = `You write ad copy for UnSaid Memories, a pet grooming salon and pet-care marketplace in Memphis, Tennessee. Plain human words, warm and confident, no jargon, no em dashes. Never invent prices, discounts, statistics, or services not in the brief. Respond with a single JSON object and nothing else:
{ "variants": [{ "headline": string, "body": string, "cta": string }] }
Write exactly 3 variants. Headline: at most 8 words. Body: 1-2 short sentences. CTA: 2-4 words (for example "Book a groom", "Shop the sale", "Learn more").`;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const brief = String(body.brief ?? "").trim();
  if (!brief) return NextResponse.json({ error: "brief_required" }, { status: 400 });
  const objective = String(body.objective ?? "traffic");
  const text = await gatewayChat(
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Campaign objective: ${objective}\nBrief: ${brief.slice(0, 1500)}`,
      },
    ],
    { feature: "ads_creative_draft", json: true, maxTokens: 900 },
  );
  if (!text) {
    return NextResponse.json(
      {
        error:
          "The AI gateway is unavailable (not configured, or every model failed). No draft was generated and nothing was saved.",
      },
      { status: 503 },
    );
  }
  let variants: Array<{ headline: string; body: string; cta: string }> = [];
  try {
    const parsed = JSON.parse(
      text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
    ) as { variants?: Array<Record<string, unknown>> };
    variants = (parsed.variants ?? [])
      .map((v) => ({
        headline: String(v.headline ?? "").trim(),
        body: String(v.body ?? "").trim(),
        cta: String(v.cta ?? "").trim(),
      }))
      .filter((v) => v.headline || v.body);
  } catch {
    variants = [];
  }
  if (!variants.length) {
    return NextResponse.json(
      { error: "The model answered outside the expected shape. Nothing was saved; try a shorter brief." },
      { status: 502 },
    );
  }
  return NextResponse.json({ variants });
}
