// UnSaid Memories — PDP edge function (read-only product detail).
// GET /functions/v1/pdp?slug=<product-slug>
// Returns product + active variants + brand + category breadcrumb path + collections.
// Tenant-aware: platform tenant (slug unsaid-memories) + platform-shared rows (tenant_id NULL).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PLATFORM_SLUG = "unsaid-memories";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return json({ error: "missing ?slug=" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    const { data: tenant, error: tErr } = await supabase
      .from("tenants").select("id").eq("slug", PLATFORM_SLUG).single();
    if (tErr || !tenant) return json({ error: "platform tenant not found" }, 500);
    const tFilter = `tenant_id.eq.${tenant.id},tenant_id.is.null`;

    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("id,slug,name,description,status,category_id,brand_id,created_at")
      .eq("slug", slug).eq("status", "published")
      .or(tFilter).single();
    if (pErr || !product) return json({ error: "product not found" }, 404);

    const [varRes, brandRes, catRes, pcRes, colRes] = await Promise.all([
      supabase.from("product_variants")
        .select("id,sku,size,color,price,compare_at_price,is_active")
        .eq("product_id", product.id).eq("is_active", true)
        .order("price", { ascending: true }).limit(5000),
      product.brand_id
        ? supabase.from("brands").select("id,name,slug").eq("id", product.brand_id).single()
        : Promise.resolve({ data: null }),
      supabase.from("categories").select("id,parent_id,name,slug,level").limit(5000),
      supabase.from("product_collections").select("collection_id").eq("product_id", product.id).limit(1000),
      supabase.from("collections").select("id,slug,name,type").limit(1000),
    ]);

    const variants = (varRes.data ?? []).map((v: any) => ({
      id: v.id, sku: v.sku, size: v.size, color: v.color,
      price: v.price == null ? null : Number(v.price),
      compare_at_price: v.compare_at_price == null ? null : Number(v.compare_at_price),
      image_url: null,
    }));
    const prices = variants.map((v: any) => v.price).filter((p: any) => p != null);

    // Category breadcrumb path (root -> leaf)
    const catById = new Map((catRes.data ?? []).map((c: any) => [c.id, c]));
    const path: any[] = [];
    let cur = product.category_id ? catById.get(product.category_id) : undefined;
    while (cur) {
      path.unshift({ name: cur.name, slug: cur.slug, level: cur.level });
      cur = cur.parent_id ? catById.get(cur.parent_id) : undefined;
    }

    const colById = new Map((colRes.data ?? []).map((c: any) => [c.id, c]));
    const collections = (pcRes.data ?? [])
      .map((pc: any) => colById.get(pc.collection_id))
      .filter(Boolean)
      .map((c: any) => ({ name: c.name, slug: c.slug, type: c.type }));

    return json({
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      brand: brandRes.data ? { name: (brandRes.data as any).name, slug: (brandRes.data as any).slug } : null,
      category_path: path,
      collections,
      variants,
      price_min: prices.length ? Math.min(...prices) : null,
      price_max: prices.length ? Math.max(...prices) : null,
      image_url: null,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
