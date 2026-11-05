import { NextRequest, NextResponse } from "next/server";
import { findCandidates, type AssistantProduct } from "@/lib/assistant/catalog-search";
import { getIntegrationKey } from "@/lib/integrations/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/assistant — the storefront shopping assistant.
//
// Grounding contract (no exceptions):
//  1. Candidates come FIRST, from the live catalog
//     (lib/assistant/catalog-search). The model never sees anything
//     but these rows.
//  2. The model may only pick product ids from that candidate set;
//     its picks are validated against the set before anything is
//     returned. Prices, images, and links are attached from the
//     catalog rows — never from the model's text.
//  3. If there is no AI key, or the gateway call fails in any way,
//     the shopper still gets the same real products, presented
//     plainly. There is no error wall and no invented product.

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const GATEWAY_MODEL = process.env.AI_GATEWAY_MODEL || "openai/gpt-4o-mini";

const SYSTEM_PROMPT = `You are Shoppy, the shopping assistant for UnSaid — a store for meaningful, made-to-order gifts. You speak warmly and plainly, like a good shopkeeper who knows the stock.

You will be given a shopper's request and a list of candidate products from the live catalog. Each candidate carries a short factual description of what the piece is. Your job:
- Choose up to 4 products from the candidate list that best fit the request — the person, the occasion, and any budget mentioned.
- Write a short, warm reply (2–3 sentences). Acknowledge the occasion with care, especially for sympathy or loss. Do not be salesy.
- When you recommend a piece, say what it actually is, using its description — the shopper should understand the piece without leaving this conversation.
- NEVER name, describe as available, or imply any product that is not in the candidate list. Never state a price that is not in the list. Never invent links.
- If nothing in the list truly fits, say so honestly in the reply and return an empty product list — the shopper will still be shown the closest search matches.
- BUYING: if the shopper clearly says they want to buy or add a specific piece ("I want to buy this", "add the blue one"), set action to {"type": "add_to_bag", "productId": "<id>"} — the id must be one of the candidates or one already shown in this conversation (the shopper's screen carries them). Confirm warmly in one short line; the bag update itself is announced separately. If WHICH piece they mean is ambiguous, ask — never guess. Otherwise action is null.

Respond with ONLY a JSON object, no other text:
{"reply": "<your message to the shopper>", "productIds": ["<id from the candidate list>", ...], "action": {"type": "add_to_bag", "productId": "<id>"} or null}`;

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

function fallbackReply(occasion: string | null, budgetCap: number | null, count: number): string {
  if (count === 0) {
    return "I couldn't find anything in the shop that matches that just yet. Try a word like “mug”, “candle”, “blanket”, or “sympathy” — or browse the shop and something may catch your eye.";
  }
  const budget = budgetCap != null ? ` under $${budgetCap}` : "";
  switch (occasion) {
    case "sympathy":
      return `I'm very sorry for her loss. Here are some thoughtful pieces from the shop${budget} — each one is made to order, so it arrives with a little extra care behind it.`;
    case "baby":
      return `How lovely — a new arrival deserves something soft and lasting. Here are some pieces from the shop${budget} that families tend to love.`;
    case "wedding":
      return `A wedding calls for something they'll keep. Here are some fitting pieces from the shop${budget}.`;
    case "birthday":
      return `Birthdays are better with something made just for them. Here are some ideas from the shop${budget}.`;
    default:
      return `Here are the closest matches from the shop${budget}. Tap a card to see it up close, or add it straight to your bag.`;
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const message = String(body?.message || "").trim().slice(0, 600);
  if (!message) {
    return NextResponse.json({ error: "Tell me who you're shopping for." }, { status: 400 });
  }
  const shownIds: string[] = Array.isArray(body?.shownIds)
    ? body.shownIds.filter((x: any) => typeof x === "string").slice(0, 24)
    : [];
  const history: ChatTurn[] = Array.isArray(body?.history)
    ? body.history
        .filter((t: any) => (t?.role === "user" || t?.role === "assistant") && typeof t?.content === "string")
        .slice(-6)
        .map((t: any) => ({ role: t.role, content: String(t.content).slice(0, 500) }))
    : [];

  const { products: candidates, occasion, budgetCap } = await findCandidates(message);

  // Plain-search fallback is the floor: real products, honestly framed.
  let reply = fallbackReply(occasion, budgetCap, candidates.length);
  let products: AssistantProduct[] = candidates.slice(0, 6);
  let source: "search" | "ai" = "search";
  let action: { type: "add_to_bag"; productId: string } | null = null;

  const apiKey = await getIntegrationKey("AI_GATEWAY_API_KEY").catch(() => "");
  if (apiKey && candidates.length) {
    try {
      const res = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GATEWAY_MODEL,
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...history,
            {
              role: "user",
              content:
                `Shopper request: ${message}\n\n` +
                `Candidate products (JSON — id, name, brand, price, description):\n` +
                JSON.stringify(
                  candidates.map((p) => ({ id: p.id, name: p.name, brand: p.brand, price: p.price, description: p.description })),
                ),
            },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content;
        if (typeof text === "string") {
          const parsed = JSON.parse(text);
          const byId = new Map(candidates.map((p) => [p.id, p]));
          const picked: AssistantProduct[] = [];
          if (Array.isArray(parsed?.productIds)) {
            for (const id of parsed.productIds) {
              const p = byId.get(String(id));
              if (p && !picked.includes(p)) picked.push(p);
              if (picked.length >= 4) break;
            }
          }
          if (typeof parsed?.reply === "string" && parsed.reply.trim()) {
            reply = parsed.reply.trim().slice(0, 900);
            products = picked.length ? picked : candidates.slice(0, 6);
            source = "ai";
            // The action may only ever name a product that is on the
            // shopper's screen (this turn's candidates) or one already
            // shown earlier in the conversation — validated here; the
            // panel re-validates against its own message state and the
            // product data always comes from the catalog rows there,
            // never from the model.
            const act = parsed?.action;
            if (
              act?.type === "add_to_bag" &&
              typeof act?.productId === "string" &&
              (byId.has(act.productId) || shownIds.includes(act.productId))
            ) {
              action = { type: "add_to_bag", productId: act.productId };
            }
          }
        }
      }
    } catch {
      // Gateway unreachable / bad JSON / timeout — the fallback above
      // already holds real products; carry on without a word of error.
    }
  }

  return NextResponse.json({ reply, products, source, action });
}
