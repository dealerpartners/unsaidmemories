/**
 * POST /api/admin/descriptions/generate
 *
 * AI product descriptions via Pollinations (the free model Kim asked for).
 * The server owns the API key — it never reaches the browser.
 *
 * Body:
 * {
 *   "name": "Kin Keeper Premium Tee",
 *   "brand": "UnSaid",
 *   "category": "T-Shirts",
 *   "sizes": ["S", "M", "L", "XL"],
 *   "colors": ["Black", "Navy"],
 *   "material": "100% ring-spun cotton",
 *   "tone": "warm"            // optional: warm | premium | playful
 * }
 *
 * Returns: { description: string, model: string }
 *
 * Pollinations text API: GET https://text.pollinations.ai/{prompt}
 * With POLLINATIONS_API_KEY we send `Authorization: Bearer <key>` for
 * higher-tier models; without it we fall back to the free anonymous tier.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TEXT_API = "https://text.pollinations.ai";

function buildPrompt(input: {
  name: string;
  brand?: string;
  category?: string;
  sizes?: string[];
  colors?: string[];
  material?: string;
  tone?: string;
}): string {
  const {
    name,
    brand = "UnSaid",
    category,
    sizes = [],
    colors = [],
    material,
    tone = "warm",
  } = input;

  const toneGuide: Record<string, string> = {
    warm: "warm, heartfelt, and personal — like a note from someone who loves you",
    premium: "premium and refined — quiet luxury, no hype",
    playful: "playful and upbeat — fun without being cheesy",
  };

  const lines = [
    `Write a product description for an online gift store called UnSaid Memories.`,
    `Product: "${name}" by ${brand}.`,
  ];
  if (category) lines.push(`Category: ${category}.`);
  if (sizes.length) lines.push(`Available sizes: ${sizes.join(", ")}.`);
  if (colors.length) lines.push(`Available colors: ${colors.join(", ")}.`);
  if (material) lines.push(`Material: ${material}.`);
  lines.push(
    `Tone: ${toneGuide[tone] ?? toneGuide.warm}.`,
    `Rules: 3 short paragraphs max. No emojis. No exclamation marks. Never mention "AI".`,
    `Focus on the feeling of giving and receiving — this is a gift that says what words can't.`,
    `Return ONLY the description text, no headings or quotes.`,
  );
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const prompt = buildPrompt({
      name,
      brand: typeof body.brand === "string" ? body.brand : undefined,
      category: typeof body.category === "string" ? body.category : undefined,
      sizes: Array.isArray(body.sizes) ? body.sizes.filter((s): s is string => typeof s === "string") : [],
      colors: Array.isArray(body.colors) ? body.colors.filter((c): c is string => typeof c === "string") : [],
      material: typeof body.material === "string" ? body.material : undefined,
      tone: typeof body.tone === "string" ? body.tone : undefined,
    });

    const apiKey = process.env.POLLINATIONS_API_KEY || "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    // Pollinations text API — POST with messages (OpenAI-compatible).
    const res = await fetch(`${TEXT_API}/openai`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: apiKey ? "openai" : "openai",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      // Fallback: anonymous GET tier.
      const fallback = await fetch(
        `${TEXT_API}/${encodeURIComponent(prompt)}?model=openai`,
        { signal: AbortSignal.timeout(45000) },
      );
      if (!fallback.ok) {
        throw new Error(`Pollinations error: ${res.status}`);
      }
      const text = (await fallback.text()).trim();
      return NextResponse.json({ description: text, model: "pollinations-free" });
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) throw new Error("Empty response from Pollinations");

    return NextResponse.json({ description: text, model: "pollinations" });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Description generation failed" },
      { status: 502 },
    );
  }
}

export async function GET() {
  const gate = await requireAdminApi();
  if (gate) return gate;
  return NextResponse.json({
    endpoint: "/api/admin/descriptions/generate",
    method: "POST",
    body: {
      name: "string (required)",
      brand: "string (optional)",
      category: "string (optional)",
      sizes: "string[] (optional)",
      colors: "string[] (optional)",
      material: "string (optional)",
      tone: '"warm" | "premium" | "playful" (optional)',
    },
    returns: { description: "string", model: "string" },
    configured: Boolean(process.env.POLLINATIONS_API_KEY),
  });
}
