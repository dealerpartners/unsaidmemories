import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdminApi } from "@/lib/admin/gate";

// POST /api/admin/sync-algolia
// Pushes all supplier_catalog_products into the Algolia index so the search
// bar returns real Algolia results (typo-tolerant, ranked, faceted) instead of
// the Supabase ILIKE fallback. Safe to run repeatedly — uses addObject with
// objectID = product id, so re-running updates existing records.
//
// Each Algolia record: { objectID, name, brand_name, category_id, image_url, sku }

const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID;
const ALGOLIA_WRITE_KEY = process.env.ALGOLIA_WRITE_API_KEY;
const INDEX = process.env.ALGOLIA_PRODUCTS_INDEX || "unsaid_products";

const BATCH_SIZE = 500; // Algolia batch limit per request

export async function POST() {
  const gate = await requireAdminApi();
  if (gate) return gate;
  if (!ALGOLIA_APP_ID || !ALGOLIA_WRITE_KEY) {
    return NextResponse.json(
      { error: "ALGOLIA_APP_ID or ALGOLIA_WRITE_API_KEY not set" },
      { status: 500 },
    );
  }

  const supabase = createServerClient();

  // Fetch ALL supplier products (paginate to avoid PostgREST row caps).
  const all: { id: string; name: string; brand_name: string | null; category_id: string | null; image_url: string | null; external_id: string | null }[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("supplier_catalog_products")
      .select("id, name, brand_name, category_id, image_url, external_id")
      .range(offset, offset + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data) {
      all.push({
        id: String(r.id),
        name: String(r.name),
        brand_name: r.brand_name || null,
        category_id: r.category_id || null,
        image_url: r.image_url || null,
        external_id: r.external_id || null,
      });
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  if (all.length === 0) {
    return NextResponse.json({ synced: 0, error: "no products found" });
  }

  // Build Algolia objects.
  const objects = all.map((p) => ({
    objectID: p.id,
    name: p.name,
    brand_name: p.brand_name || "",
    category_id: p.category_id || "",
    image_url: p.image_url || "",
    sku: p.external_id || "",
  }));

  // Push in batches.
  let pushed = 0;
  const errors: string[] = [];
  for (let i = 0; i < objects.length; i += BATCH_SIZE) {
    const batch = objects.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(
        `https://${ALGOLIA_APP_ID}.algolia.net/1/indexes/${INDEX}/batch`,
        {
          method: "POST",
          headers: {
            "X-Algolia-Application-Id": ALGOLIA_APP_ID,
            "X-Algolia-API-Key": ALGOLIA_WRITE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: batch.map((o) => ({ action: "addObject", body: o })),
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!res.ok) {
        errors.push(`batch ${i}: HTTP ${res.status}`);
      } else {
        pushed += batch.length;
      }
    } catch (e: any) {
      errors.push(`batch ${i}: ${e?.message || "fetch failed"}`);
    }
  }

  // Configure searchable attributes + ranking on the index.
  try {
    await fetch(`https://${ALGOLIA_APP_ID}.algolia.net/1/indexes/${INDEX}/settings`, {
      method: "PUT",
      headers: {
        "X-Algolia-Application-Id": ALGOLIA_APP_ID,
        "X-Algolia-API-Key": ALGOLIA_WRITE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        searchableAttributes: ["name", "brand_name", "sku"],
        attributesForFaceting: ["brand_name", "category_id"],
        customRanking: ["desc:name"],
        hitsPerPage: 24,
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // non-fatal — the data is already indexed
  }

  return NextResponse.json({
    synced: pushed,
    total: all.length,
    index: INDEX,
    errors: errors.length ? errors : undefined,
  });
}
