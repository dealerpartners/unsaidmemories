import { createServerClient } from "@/lib/supabase";
import { productSlug } from "@/lib/product-slug";

/**
 * Grounded candidate search for the shopping assistant.
 *
 * The assistant may only ever show products that come out of this
 * function: real rows from supplier_catalog_products (the same table
 * the shop and the product pages read — published studio designs are
 * mirrored into it by the publish bridge, so they are included too).
 * Prices come from supplier_catalog_variants.price_snapshot, and the
 * "default variant" is the cheapest priced variant — the exact row
 * the cart API will price again server-side when the shopper adds it.
 */

export interface AssistantProduct {
  id: string;
  name: string;
  brand: string | null;
  image: string | null;
  price: number;
  variantId: string;
  variantLabel: string;
  slug: string;
  /** A factual one-liner saying what the piece is — built from the
   *  same catalog facts the product page uses (category edit, size
   *  and color range). Shoppy quotes it; it is never invented. */
  description: string;
}

export interface CandidateResult {
  products: AssistantProduct[];
  /** Occasion key detected in the message ("sympathy", "baby", …) or null. */
  occasion: string | null;
  /** Budget cap parsed from the message ("under $60"), or null. */
  budgetCap: number | null;
}

const STOPWORDS = new Set([
  "a", "an", "the", "for", "my", "me", "i", "we", "you", "please", "looking",
  "look", "want", "need", "needs", "something", "anything", "gift", "gifts",
  "present", "idea", "ideas", "suggest", "suggestion", "recommend", "show",
  "find", "get", "buy", "shop", "store", "who", "that", "this", "with",
  "and", "or", "of", "to", "in", "on", "is", "are", "was", "has", "have",
  "her", "his", "their", "she", "he", "they", "it", "its", "about", "around",
  "under", "below", "less", "than", "max", "budget", "price", "cost", "dollars",
  "usd", "really", "just", "very", "some", "any", "can", "could", "would",
  "should", "help", "give", "gave", "make", "made", "good", "nice", "great",
]);

/** Occasion / relationship expansions: pattern → extra search keywords. */
export const OCCASION_EXPANSIONS: { key: string; pattern: RegExp; keywords: string[] }[] = [
  {
    key: "sympathy",
    pattern: /(lost|loss|passed away|passing|died|death|griev|sympathy|condolence|widow|funeral|memorial|bereave)/i,
    keywords: ["sympathy", "memorial", "remembrance", "in loving memory", "condolence", "comfort"],
  },
  {
    key: "baby",
    pattern: /(baby|newborn|infant|baby shower)/i,
    keywords: ["baby", "newborn"],
  },
  {
    key: "wedding",
    pattern: /(wedding|bride|groom|engaged|engagement|bridal)/i,
    keywords: ["wedding", "bride", "bridal"],
  },
  { key: "birthday", pattern: /birthday/i, keywords: ["birthday"] },
  { key: "mother", pattern: /\b(mom|mother|mama|mum)\b/i, keywords: ["mother", "mom", "mama"] },
  { key: "father", pattern: /\b(dad|father|papa)\b/i, keywords: ["father", "dad", "papa"] },
  { key: "sister", pattern: /\bsister\b/i, keywords: ["sister"] },
  { key: "brother", pattern: /\bbrother\b/i, keywords: ["brother"] },
  { key: "grandmother", pattern: /\b(grandma|grandmother|nana)\b/i, keywords: ["grandma", "grandmother"] },
  { key: "grandfather", pattern: /\b(grandpa|grandfather)\b/i, keywords: ["grandpa", "grandfather"] },
  { key: "teacher", pattern: /\bteacher\b/i, keywords: ["teacher"] },
  { key: "nurse", pattern: /\bnurse\b/i, keywords: ["nurse"] },
  { key: "thankyou", pattern: /(thank you|thanks|grateful|gratitude|appreciation)/i, keywords: ["thank you", "gratitude", "appreciation"] },
  { key: "getwell", pattern: /(get well|recovering|recovery|surgery|hospital|sick)/i, keywords: ["get well", "recovery", "comfort"] },
  { key: "housewarming", pattern: /(housewarming|new home|moved)/i, keywords: ["housewarming", "home"] },
  { key: "christmas", pattern: /(christmas|xmas|holiday)/i, keywords: ["christmas", "holiday"] },
  { key: "valentine", pattern: /valentine/i, keywords: ["valentine", "love"] },
  { key: "pet", pattern: /\b(dog|cat|pet|puppy|kitten)\b/i, keywords: ["dog", "pet"] },
  { key: "anniversary", pattern: /anniversary/i, keywords: ["anniversary", "love"] },
  { key: "graduation", pattern: /graduat/i, keywords: ["graduation", "graduate"] },
];

export function parseBudget(message: string): number | null {
  const m = message.match(/(?:under|below|less than|max|around|about|\$)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0 && n < 100000) return n;
  }
  const bare = message.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  if (bare) {
    const n = Number(bare[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function extractKeywords(message: string): string[] {
  const words = message
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[-']+|[-']+$/g, ""))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)].slice(0, 8);
}

export async function findCandidates(message: string): Promise<CandidateResult> {
  const budgetCap = parseBudget(message);
  const occasionHit = OCCASION_EXPANSIONS.find((o) => o.pattern.test(message)) ?? null;

  const keywords = [...new Set([
    ...extractKeywords(message),
    ...(occasionHit ? occasionHit.keywords : []),
  ])].slice(0, 10);

  const sb = createServerClient();
  const byId = new Map<string, { row: any; score: number }>();

  const addRows = (rows: any[] | null, score: number) => {
    for (const row of rows ?? []) {
      const prev = byId.get(row.id);
      if (prev) prev.score += score;
      else byId.set(row.id, { row, score });
    }
  };

  // Name / brand matches per keyword.
  for (const kw of keywords) {
    const { data } = await sb
      .from("supplier_catalog_products")
      .select("id, name, brand_name, image_url, category_id")
      .eq("is_hidden", false)
      .or(`name.ilike.%${kw}%,brand_name.ilike.%${kw}%`)
      .limit(14);
    addRows(data, 2);
  }

  // Category matches (a "sympathy" category beats a random name hit).
  if (keywords.length) {
    const { data: cats } = await sb
      .from("categories")
      .select("id, name")
      .or(keywords.map((kw) => `name.ilike.%${kw}%`).join(","))
      .limit(12);
    if (cats?.length) {
      const { data } = await sb
        .from("supplier_catalog_products")
        .select("id, name, brand_name, image_url, category_id")
        .eq("is_hidden", false)
        .in("category_id", cats.map((c: any) => c.id))
        .limit(24);
      addRows(data, 3);
    }
  }

  const productIds = [...byId.keys()].slice(0, 48);
  if (!productIds.length) {
    return { products: [], occasion: occasionHit?.key ?? null, budgetCap };
  }

  // Prices + default variant per product (cheapest priced variant).
  const { data: variants } = await sb
    .from("supplier_catalog_variants")
    .select("id, supplier_catalog_product_id, price_snapshot, size, color, name")
    .in("supplier_catalog_product_id", productIds)
    .not("price_snapshot", "is", null)
    .order("price_snapshot", { ascending: true })
    .limit(400);

  const bestByProduct = new Map<string, any>();
  for (const v of variants ?? []) {
    if (!bestByProduct.has(v.supplier_catalog_product_id)) {
      bestByProduct.set(v.supplier_catalog_product_id, v);
    }
  }

  // Category names + per-product size/color ranges, for the
  // factual one-line description of what each piece is.
  const catIds = [...new Set([...byId.values()].map(({ row }: any) => row.category_id).filter(Boolean))];
  const catName = new Map<string, string>();
  if (catIds.length) {
    const { data: cats } = await sb.from("categories").select("id, name").in("id", catIds);
    for (const c of cats ?? []) catName.set(String(c.id), String(c.name));
  }
  const sizesByProduct = new Map<string, Set<string>>();
  const colorsByProduct = new Map<string, Set<string>>();
  for (const v of variants ?? []) {
    const pid = String(v.supplier_catalog_product_id);
    if (v.size) (sizesByProduct.get(pid) ?? sizesByProduct.set(pid, new Set()).get(pid)!).add(String(v.size));
    if (v.color) (colorsByProduct.get(pid) ?? colorsByProduct.set(pid, new Set()).get(pid)!).add(String(v.color));
  }

  const products: (AssistantProduct & { score: number })[] = [];
  for (const [id, { row, score }] of byId) {
    const v = bestByProduct.get(id);
    if (!v) continue; // no priced variant → cannot be added to a bag; skip
    const price = Number(v.price_snapshot);
    if (budgetCap != null && price > budgetCap) continue;
    const labelParts = [v.size, v.color].filter(Boolean);
    const descParts: string[] = [];
    const cat = row.category_id ? catName.get(String(row.category_id)) : null;
    if (cat) descParts.push(`Part of our ${cat} edit`);
    const sizes = sizesByProduct.get(id);
    if (sizes && sizes.size > 1) descParts.push(`${sizes.size} sizes`);
    const colors = colorsByProduct.get(id);
    if (colors && colors.size > 1) descParts.push(`${colors.size} colorways`);
    else if (colors && colors.size === 1) descParts.push(`in ${[...colors][0]}`);
    products.push({
      id,
      name: String(row.name),
      brand: row.brand_name || null,
      image: row.image_url || null,
      price,
      variantId: String(v.id),
      variantLabel: labelParts.length ? labelParts.join(" · ") : String(v.name ?? ""),
      slug: productSlug(String(row.name), String(id)),
      description: descParts.length ? descParts.join(" · ") : "Made to order, just for them",
      score,
    });
  }

  products.sort((a, b) => b.score - a.score || a.price - b.price || a.name.localeCompare(b.name));

  return {
    products: products.slice(0, 12).map(({ score: _score, ...p }) => p),
    occasion: occasionHit?.key ?? null,
    budgetCap,
  };
}
