import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { productSlug } from "@/lib/product-slug";

// GET /api/search?q=...
// Searches products by name, brand, and SKU (external_id).
// Tries Algolia first (if the index is populated), falls back to a Supabase
// ILIKE search so search works immediately even before the Algolia sync.
// Returns hits with a ready-to-use product slug for /product/[slug] links.

// Algolia keys resolve through the Connections vault (saved key wins,
// env fallback) so the Connections & Keys page tells the truth for
// shopper search too. Prefer the write key server-side — the route is
// server-side only, the key never reaches the browser.
import { getIntegrationKey } from "@/lib/integrations/keys";
const INDEX = process.env.ALGOLIA_PRODUCTS_INDEX || "unsaid_products";

type SearchHit = {
  id: string;
  name: string;
  brand: string | null;
  image: string | null;
  sku: string | null;
  slug: string;
};

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ hits: [], source: "short-query" });
  }

  // ── Algolia fast path ──────────────────────────────────────
  const ALGOLIA_APP_ID = await getIntegrationKey("ALGOLIA_APP_ID");
  const ALGOLIA_SEARCH_KEY =
    (await getIntegrationKey("ALGOLIA_WRITE_API_KEY")) ||
    (await getIntegrationKey("ALGOLIA_SEARCH_API_KEY"));
  if (ALGOLIA_APP_ID && ALGOLIA_SEARCH_KEY) {
    try {
      const res = await fetch(
        `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${INDEX}/query`,
        {
          method: "POST",
          headers: {
            "X-Algolia-Application-Id": ALGOLIA_APP_ID,
            "X-Algolia-API-Key": ALGOLIA_SEARCH_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            params: `query=${encodeURIComponent(q)}&hitsPerPage=24`,
          }),
          signal: AbortSignal.timeout(3500),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const hits: SearchHit[] = (data.hits || []).map((h: any) => ({
          id: String(h.objectID || h.id),
          name: String(h.name || ""),
          brand: h.brand_name || null,
          image: h.image_url || null,
          sku: h.sku || h.external_id || null,
          slug: productSlug(String(h.name || h.objectID), String(h.objectID || h.id)),
        }));
        return NextResponse.json({ hits, source: "algolia" });
      }
    } catch {
      // fall through to Supabase
    }
  }

  // ── Supabase fallback (works immediately, no index needed) ──
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("supplier_catalog_products")
      .select("id, name, brand_name, image_url, external_id")
      .eq("is_hidden", false)
      .or(
        `name.ilike.%${q}%,brand_name.ilike.%${q}%,external_id.ilike.%${q}%`,
      )
      .order("name", { ascending: true })
      .limit(24);

    if (error || !data) {
      return NextResponse.json({ hits: [], source: "supabase-error" });
    }
    const hits: SearchHit[] = data.map((p) => ({
      id: String(p.id),
      name: String(p.name),
      brand: p.brand_name || null,
      image: p.image_url || null,
      sku: p.external_id || null,
      slug: productSlug(String(p.name), String(p.id)),
    }));
    return NextResponse.json({ hits, source: "supabase" });
  } catch {
    return NextResponse.json({ hits: [], source: "error" });
  }
}
