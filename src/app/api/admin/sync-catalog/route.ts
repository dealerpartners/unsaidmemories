import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/admin/gate";

// ─────────────────────────────────────────────────────────────
// Catalog Sync Route — fetches product images from supplier APIs
// (Printful, Gelato, Prodigi, Gooten) and updates Supabase.
//
// Usage:
//   GET  /api/admin/sync-catalog              → status report
//   POST /api/admin/sync-catalog?supplier=printful   → sync Printful
//   POST /api/admin/sync-catalog?supplier=gelato     → sync Gelato
//   POST /api/admin/sync-catalog?supplier=all        → sync all
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const SUPPLIER_IDS: Record<string, string> = {
  printful: "52c95a9d-f383-4c5b-bb64-03437c57ce36",
  gelato: "abf6eac3-782e-4f24-96fe-a39b4d04abec",
  prodigi: "84f205e1-ddb4-4dea-9929-6603d49a26e6",
  gooten: "6d4f701e-d122-4687-aa65-c374766ef45c",
};

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
}

async function syncPrintful(): Promise<{ synced: number; failed: number; errors: string[] }> {
  const supabase = getSupabase();
  const printfulKey = process.env.PRINTFUL_API_KEY;
  if (!printfulKey) return { synced: 0, failed: 0, errors: ["No PRINTFUL_API_KEY"] };
  const errors: string[] = [];

  // Use Printful V1 API which returns catalog products with `image` field
  // GET https://api.printful.com/products?limit=100&offset=0
  // Auth: Bearer token
  // Response: { code: 200, result: [{ id, title, image, variant_count, ... }] }
  let synced = 0, failed = 0;
  let offset = 0;
  const limit = 100;

  for (let page = 0; page < 30; page++) { // max 3000 products
    try {
      const res = await fetch(
        `https://api.printful.com/products?limit=${limit}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${printfulKey}` }, signal: AbortSignal.timeout(20000) }
      );
      if (!res.ok) { errors.push(`Printful page ${page}: HTTP ${res.status}`); break; }
      const data = await res.json();
      const products = data.result || [];
      if (!products.length) break;

      for (const p of products) {
        try {
          const imageUrl = p.image || null;
          const images = imageUrl ? [imageUrl] : null;
          
          // Try to find existing record by external_id (= Printful product ID)
          const { data: existing } = await supabase
            .from("supplier_catalog_products")
            .select("id")
            .eq("supplier_id", SUPPLIER_IDS.printful)
            .eq("external_id", String(p.id))
            .limit(1);

          if (existing && existing.length > 0) {
            // Update existing record
            await supabase.from("supplier_catalog_products")
              .update({ image_url: imageUrl, images, variant_count: p.variant_count || null })
              .eq("id", existing[0].id);
          } else {
            // Insert new record
            await supabase.from("supplier_catalog_products")
              .insert({
                supplier_id: SUPPLIER_IDS.printful,
                external_id: String(p.id),
                external_id_type: "printful_product",
                name: p.title || p.type_name || `Printful Product ${p.id}`,
                brand_name: p.brand || null,
                image_url: imageUrl,
                images,
                variant_count: p.variant_count || null,
              });
          }
          synced++;
        } catch (e) {
          errors.push(`Printful product ${p.id}: ${e instanceof Error ? e.message : String(e)}`);
          failed++;
        }
      }

      offset += limit;
      if (products.length < limit) break; // last page
    } catch (e) {
      errors.push(`Printful page ${page}: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
  }

  return { synced, failed, errors };
}

async function syncGelato(): Promise<{ synced: number; failed: number; errors: string[] }> {
  const supabase = getSupabase();
  const gelatoKey = process.env.GELATO_API_KEY;
  if (!gelatoKey) return { synced: 0, failed: 0, errors: ["No GELATO_API_KEY"] };
  const errors: string[] = [];

  // Step 1: Fetch the full Gelato catalog and build a name→productUid map
  // Gelato API: GET https://product.gelatoapis.com/v3/products?limit=100&offset=0
  // Auth: X-API-KEY header
  const gelatoCatalog: Map<string, { productUid: string; id: string }> = new Map();
  let offset = 0;
  const limit = 100;
  for (let page = 0; page < 50; page++) { // max 5000 products
    try {
      const res = await fetch(
        `https://product.gelatoapis.com/v3/products?limit=${limit}&offset=${offset}`,
        { headers: { "X-API-KEY": gelatoKey, "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000) }
      );
      if (!res.ok) { errors.push(`Gelato catalog page ${page}: HTTP ${res.status}`); break; }
      const json = await res.json();
      const products = json.products || [];
      if (!products.length) break;
      for (const p of products) {
        // Map by productUid and by name for matching
        gelatoCatalog.set(p.productUid, { productUid: p.productUid, id: p.id });
        if (p.productNameUid) gelatoCatalog.set(p.productNameUid, { productUid: p.productUid, id: p.id });
      }
      offset += limit;
      if (products.length < limit) break; // last page
    } catch (e) {
      errors.push(`Gelato catalog page ${page}: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
  }

  // Step 2: Get our DB products without images
  const { data: dbProducts } = await supabase
    .from("supplier_catalog_products")
    .select("id,external_id,name")
    .eq("supplier_id", SUPPLIER_IDS.gelato)
    .is("image_url", null)
    .limit(50); // smaller batch since we also fetch details

  if (!dbProducts?.length) return { synced: 0, failed: 0, errors };

  let synced = 0, failed = 0;

  // Step 3: For each DB product, try to find a match in the Gelato catalog
  for (const product of dbProducts) {
    try {
      // The external_id is like "gelato:Calendars / LT / 100-lb-cover-coated-silk"
      // Try to extract a productUid or name from it
      const ref = product.external_id.replace(/^gelato:/, "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      
      // Try direct productUid lookup
      let match = gelatoCatalog.get(ref);
      
      // Try matching by name
      if (!match) {
        for (const [key, val] of gelatoCatalog) {
          if (key.toLowerCase().includes(ref.substring(0, 20)) || ref.includes(key.toLowerCase().substring(0, 20))) {
            match = val;
            break;
          }
        }
      }

      if (match) {
        // Fetch product detail to get image URLs
        const detailRes = await fetch(
          `https://product.gelatoapis.com/v3/products/${encodeURIComponent(match.productUid)}`,
          { headers: { "X-API-KEY": gelatoKey, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000) }
        );
        if (detailRes.ok) {
          const detail = await detailRes.json();
          // Look for image/preview fields per Gelato API docs
          const imageUrl = detail.externalPreviewUrl || detail.externalThumbnailUrl || detail.previewUrl || null;
          const images: string[] = [];
          if (imageUrl) images.push(imageUrl);
          if (detail.imagePlaceholders) {
            for (const ph of detail.imagePlaceholders) {
              if (ph.previewUrl) images.push(ph.previewUrl);
            }
          }
          // Update with whatever we found (even if imageUrl is null, store the productUid)
          await supabase.from("supplier_catalog_products")
            .update({ image_url: imageUrl, images: images.length ? images : null, external_id: `gelato:${match.productUid}` })
            .eq("id", product.id);
          synced++;
        } else {
          // Store just the productUid even without images
          await supabase.from("supplier_catalog_products")
            .update({ external_id: `gelato:${match.productUid}` })
            .eq("id", product.id);
          synced++;
        }
      } else {
        failed++;
      }
    } catch (e) {
      errors.push(`Gelato product ${product.external_id}: ${e instanceof Error ? e.message : String(e)}`);
      failed++;
    }
  }

  return { synced, failed, errors };
}

async function syncProdigi(): Promise<{ synced: number; failed: number }> {
  const supabase = getSupabase();
  const prodigiKey = process.env.PRODIGI_API_KEY;
  if (!prodigiKey) return { synced: 0, failed: 0 };
  const { data: products } = await supabase
    .from("supplier_catalog_products")
    .select("id,external_id,name")
    .eq("supplier_id", SUPPLIER_IDS.prodigi)
    .is("image_url", null)
    .limit(100);
  if (!products?.length) return { synced: 0, failed: 0 };
  let synced = 0, failed = 0;
  for (const product of products) {
    try {
      const res = await fetch(`https://api.prodigi.com/v4.0/Products/${encodeURIComponent(product.external_id)}`, {
        headers: { "X-API-Key": prodigiKey },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) { failed++; continue; }
      const json = await res.json();
      const p = json.data || json;
      const imageUrl = p.imageUrl || p.image_url || p.images?.[0]?.url || null;
      await supabase.from("supplier_catalog_products")
        .update({ image_url: imageUrl })
        .eq("id", product.id);
      synced++;
    } catch { failed++; }
  }
  return { synced, failed };
}

async function syncGooten(): Promise<{ synced: number; failed: number }> {
  const supabase = getSupabase();
  const { getIntegrationKey } = await import("@/lib/integrations/keys");
  const recipeId = await getIntegrationKey("GOOTEN_RECIPE_ID");
  if (!recipeId) return { synced: 0, failed: 0 };
  const { data: products } = await supabase
    .from("supplier_catalog_products")
    .select("id,external_id,name")
    .eq("supplier_id", SUPPLIER_IDS.gooten)
    .is("image_url", null)
    .limit(100);
  if (!products?.length) return { synced: 0, failed: 0 };
  let synced = 0, failed = 0;
  for (const product of products) {
    try {
      const res = await fetch(`https://api.gooten.com/v1/products/${encodeURIComponent(product.external_id)}?recipeId=${recipeId}`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) { failed++; continue; }
      const json = await res.json();
      const p = json.data || json.Product || json;
      const imageUrl = p.imageUrl || p.ImageUrl || p.Images?.[0] || null;
      await supabase.from("supplier_catalog_products")
        .update({ image_url: imageUrl })
        .eq("id", product.id);
      synced++;
    } catch { failed++; }
  }
  return { synced, failed };
}

export async function GET() {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const { getIntegrationKey } = await import("@/lib/integrations/keys");
  const supabase = getSupabase();
  const { count: withImages } = await supabase.from("supplier_catalog_products").select("*", { count: "exact", head: true }).not("image_url", "is", null);
  const { count: withoutImages } = await supabase.from("supplier_catalog_products").select("*", { count: "exact", head: true }).is("image_url", null);
  return NextResponse.json({
    products: { withImages: withImages || 0, withoutImages: withoutImages || 0, total: (withImages || 0) + (withoutImages || 0) },
    keys: { printful: !!(await getIntegrationKey("PRINTFUL_API_KEY")), gelato: !!(await getIntegrationKey("GELATO_API_KEY")), prodigi: !!(await getIntegrationKey("PRODIGI_API_KEY")), gooten: !!(await getIntegrationKey("GOOTEN_RECIPE_ID")) },
    usage: "POST /api/admin/sync-catalog?supplier=printful|gelato|prodigi|gooten|all",
  });
}

export async function POST(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const supplier = request.nextUrl.searchParams.get("supplier") || "all";
  const results: Record<string, any> = {};
  const allErrors: string[] = [];
  
  if (supplier === "all" || supplier === "printful") { const r = await syncPrintful(); results.printful = { synced: r.synced, failed: r.failed }; if (r.errors?.length) { results.printfulErrors = r.errors.slice(0, 5); allErrors.push(...r.errors.slice(0, 3)); } }
  if (supplier === "all" || supplier === "gelato") { const r = await syncGelato(); results.gelato = { synced: r.synced, failed: r.failed }; if (r.errors?.length) { results.gelatoErrors = r.errors.slice(0, 5); allErrors.push(...r.errors.slice(0, 3)); } }
  if (supplier === "all" || supplier === "prodigi") results.prodigi = await syncProdigi();
  if (supplier === "all" || supplier === "gooten") results.gooten = await syncGooten();
  const totalSynced = Object.values(results).reduce((s: number, r: any) => s + (r?.synced || 0), 0);
  const totalFailed = Object.values(results).reduce((s: number, r: any) => s + (r?.failed || 0), 0);
  return NextResponse.json({ supplier, results, totalSynced, totalFailed, sampleErrors: allErrors.slice(0, 5), message: `Synced ${totalSynced} (${totalFailed} failed). Run again for next batch.` });
}
