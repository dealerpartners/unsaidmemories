// UnSaid Memories — PLP edge function (read-only product listing data).
// GET /functions/v1/plp?category=<slug>&brand=<slug>&collection=<slug>&q=<text>
//     &sort=price_asc|price_desc|name|newest&page=1&per_page=24
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

function descendants(cats: any[], slug: string): string[] {
  const byParent = new Map<string, string[]>();
  for (const c of cats) {
    const p = c.parent_id ?? "";
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(c.id);
  }
  const root = cats.find((c) => c.slug === slug);
  if (!root) return [];
  const out = [root.id];
  const stack = [root.id];
  while (stack.length) {
    const id = stack.pop()!;
    for (const child of byParent.get(id) ?? []) {
      out.push(child);
      stack.push(child);
    }
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    const q = (name: string) => url.searchParams.get(name);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    const { data: tenant, error: tErr } = await supabase
      .from("tenants").select("id").eq("slug", PLATFORM_SLUG).single();
    if (tErr || !tenant) return json({ error: "platform tenant not found" }, 500);

    const [prodRes, catRes, brandRes, varRes, pcRes, colRes] = await Promise.all([
      supabase.from("products")
        .select("id,slug,name,description,status,category_id,brand_id,tenant_id,created_at")
        .eq("status", "published")
        .or(`tenant_id.eq.${tenant.id},tenant_id.is.null`)
        .limit(5000),
      supabase.from("categories").select("id,parent_id,name,slug,level").limit(5000),
      supabase.from("brands").select("id,name,slug").limit(1000),
      supabase.from("product_variants")
        .select("product_id,price,is_active").eq("is_active", true).limit(20000),
      supabase.from("product_collections").select("product_id,collection_id").limit(20000),
      supabase.from("collections").select("id,slug,name").limit(1000),
    ]);
    if (prodRes.error) return json({ error: prodRes.error.message }, 500);

    const catById = new Map((catRes.data ?? []).map((c: any) => [c.id, c]));
    const brandById = new Map((brandRes.data ?? []).map((b: any) => [b.id, b]));
    const colById = new Map((colRes.data ?? []).map((c: any) => [c.id, c]));
    const prices = new Map<string, number[]>();
    for (const v of (varRes.data ?? []) as any[]) {
      if (v.price == null) continue;
      if (!prices.has(v.product_id)) prices.set(v.product_id, []);
      prices.get(v.product_id)!.push(Number(v.price));
    }
    const colsByProduct = new Map<string, string[]>();
    for (const pc of (pcRes.data ?? []) as any[]) {
      const c = colById.get(pc.collection_id);
      if (!c) continue;
      if (!colsByProduct.has(pc.product_id)) colsByProduct.set(pc.product_id, []);
      colsByProduct.get(pc.product_id)!.push(c.slug);
    }

    let items = (prodRes.data ?? []).map((p: any) => {
      const ps = prices.get(p.id) ?? [];
      const cat = catById.get(p.category_id);
      const brand = brandById.get(p.brand_id);
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        description: p.description,
        brand: brand ? { name: brand.name, slug: brand.slug } : null,
        category: cat ? { name: cat.name, slug: cat.slug, level: cat.level } : null,
        price_min: ps.length ? Math.min(...ps) : null,
        price_max: ps.length ? Math.max(...ps) : null,
        variant_count: ps.length,
        collections: colsByProduct.get(p.id) ?? [],
        image_url: null,
      };
    });

    // Filters
    const catSlug = q("category");
    if (catSlug) {
      const catIdBySlug = new Map((catRes.data ?? []).map((c: any) => [c.slug, c.id]));
      const allowed = new Set(descendants(catRes.data ?? [], catSlug));
      items = items.filter((i: any) => i.category && allowed.has(catIdBySlug.get(i.category.slug)));
    }
    const brandSlug = q("brand");
    if (brandSlug) items = items.filter((i: any) => i.brand?.slug === brandSlug);
    const colSlug = q("collection");
    if (colSlug) items = items.filter((i: any) => i.collections.includes(colSlug));
    const search = q("q");
    if (search) {
      const s = search.toLowerCase();
      items = items.filter((i: any) => (i.name + " " + (i.description ?? "")).toLowerCase().includes(s));
    }

    // Sort
    const sort = q("sort") ?? "newest";
    const key = (i: any) => i.price_min ?? Number.POSITIVE_INFINITY;
    if (sort === "price_asc") items.sort((a: any, b: any) => key(a) - key(b));
    else if (sort === "price_desc") items.sort((a: any, b: any) => key(b) - key(a));
    else if (sort === "name") items.sort((a: any, b: any) => a.name.localeCompare(b.name));

    const perPage = Math.min(Math.max(parseInt(q("per_page") ?? "24", 10) || 24, 1), 100);
    const page = Math.max(parseInt(q("page") ?? "1", 10) || 1, 1);
    const total = items.length;
    const data = items.slice((page - 1) * perPage, page * perPage);

    return json({ data, meta: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) } });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
