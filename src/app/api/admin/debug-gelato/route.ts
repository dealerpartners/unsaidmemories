import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";

// Debug endpoint — calls Gelato API directly and returns raw response
// so we can see what fields are available and fix the sync adapter.
export async function GET() {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const gelatoKey = process.env.GELATO_API_KEY;
  if (!gelatoKey) {
    return NextResponse.json({ error: "No GELATO_API_KEY set" }, { status: 500 });
  }

  // 1. Fetch catalog list
  let catalogInfo: any = null;
  try {
    const res = await fetch("https://product.gelatoapis.com/v3/products?limit=5", {
      headers: { "X-API-KEY": gelatoKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    catalogInfo = {
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      body: await res.json(),
    };
  } catch (e) {
    catalogInfo = { error: e instanceof Error ? e.message : String(e) };
  }

  // 2. If we got products, fetch detail of the first one
  let detailInfo: any = null;
  const products = catalogInfo?.body?.products;
  if (products && products.length > 0) {
    const firstProduct = products[0];
    try {
      const res = await fetch(
        `https://product.gelatoapis.com/v3/products/${encodeURIComponent(firstProduct.productUid)}`,
        { headers: { "X-API-KEY": gelatoKey, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000) }
      );
      detailInfo = {
        status: res.status,
        productUid: firstProduct.productUid,
        keys: Object.keys(await res.json()),
      };
    } catch (e) {
      detailInfo = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  // 3. Also try the ecommerce templates API
  let templateInfo: any = null;
  try {
    const res = await fetch("https://ecommerce.gelatoapis.com/v1/templates?limit=2", {
      headers: { "X-API-KEY": gelatoKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    templateInfo = {
      status: res.status,
      statusText: res.statusText,
      body: await res.text().then(t => t.substring(0, 500)),
    };
  } catch (e) {
    templateInfo = { error: e instanceof Error ? e.message : String(e) };
  }

  // 4. Check what our DB has — sample external_ids
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let dbInfo: any = null;
  if (supabaseUrl && supabaseKey) {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/supplier_catalog_products?supplier_id=eq.abf6eac3-782e-4f24-96fe-a39b4d04abec&is=image_url&select=external_id,name&limit=5`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
      );
      dbInfo = { status: res.status, body: await res.json() };
    } catch (e) {
      dbInfo = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json({
    catalog: catalogInfo,
    detail: detailInfo,
    templates: templateInfo,
    db: dbInfo,
  });
}
