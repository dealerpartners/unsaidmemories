// Storefront data from Supabase (migrated DB), with fallback to the in-app seed
// when Supabase env is missing or a query fails, so the build never breaks.
import { supabase } from './supabase';
import { CATEGORIES as SEED_CATEGORIES, PRODUCTS as SEED_PRODUCTS } from './catalog';

export type DbCategory = { id: string; parent_id: string | null; level: number; name: string; slug: string; parent?: string };
export type DbProduct = { slug: string; name: string; category: string; brand: string; price: number; collections: string[] };

// PostgREST caps single responses (default max-rows 1000); page through the
// category tree so the full taxonomy is always available to the storefront.
async function fetchAllCategories(cols: string): Promise<any[]> {
  const out: any[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase!.from('categories').select(cols).order('sort_order').range(from, from + 999);
    if (error || !data || data.length === 0) break;
    out.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

export async function getCategories(): Promise<DbCategory[]> {
  try {
    if (!supabase) throw new Error('no supabase env');
    const data = await fetchAllCategories('id,parent_id,level,name,slug');
    if (data.length === 0) throw new Error('no db categories');
    const byId = new Map(data.map((c: any) => [c.id, c.slug]));
    return data.map((c: any) => ({ ...c, parent: c.parent_id ? byId.get(c.parent_id) : undefined }));
  } catch {
    return SEED_CATEGORIES.map((c) => ({ id: c.slug, parent_id: null, level: c.level, name: c.name, slug: c.slug, parent: c.parent }));
  }
}

export async function getProducts(): Promise<DbProduct[]> {
  try {
    if (!supabase) throw new Error('no supabase env');
    const [prods, brands, variants, pcs, cols] = await Promise.all([
      supabase.from('products').select('id,slug,name,category_id,brand_id').eq('status', 'published').limit(5000),
      supabase.from('brands').select('id,name').limit(5000),
      supabase.from('product_variants').select('product_id,price,is_active').eq('is_active', true).limit(5000),
      supabase.from('product_collections').select('product_id,collection_id').limit(5000),
      supabase.from('collections').select('id,slug').limit(5000),
    ]);
    if (prods.error || !prods.data || prods.data.length === 0) throw new Error('no db products');
    const brandById = new Map((brands.data ?? []).map((b: any) => [b.id, b.name]));
    const catById = new Map((await fetchAllCategories('id,slug')).map((c: any) => [c.id, c.slug]));
    const priceByProduct = new Map((variants.data ?? []).map((v: any) => [v.product_id, Number(v.price)]));
    const colById = new Map((cols.data ?? []).map((c: any) => [c.id, c.slug]));
    const colsByProduct = new Map<string, string[]>();
    for (const pc of (pcs.data ?? []) as any[]) {
      const slug = colById.get(pc.collection_id);
      if (!slug) continue;
      if (!colsByProduct.has(pc.product_id)) colsByProduct.set(pc.product_id, []);
      colsByProduct.get(pc.product_id)!.push(slug);
    }
    return prods.data.map((p: any) => ({
      slug: p.slug, name: p.name,
      category: catById.get(p.category_id) ?? '',
      brand: brandById.get(p.brand_id) ?? '',
      price: priceByProduct.get(p.id) ?? 0,
      collections: colsByProduct.get(p.id) ?? [],
    }));
  } catch {
    return SEED_PRODUCTS;
  }
}


export type SupplierProduct = { id: string; slug: string; name: string; brand: string; price: number; category: string; variant_count: number };

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

export async function getSupplierProducts(limit = 5000): Promise<SupplierProduct[]> {
  try {
    if (!supabase) throw new Error('no supabase env');
    const prods = await supabase.from('supplier_catalog_products').select('id,name,brand_name,category_id,variant_count').limit(limit);
    if (prods.error || !prods.data) throw new Error('no supplier products');
    const pids = (prods.data as any[]).map((p: any) => p.id);
    const priceByPid = new Map<string, number[]>();
    // Fetch variants in batches for these specific products
    for (let i = 0; i < pids.length; i += 500) {
      const batch = pids.slice(i, i + 500);
      const { data: vdata } = await supabase.from('supplier_catalog_variants')
        .select('supplier_catalog_product_id,price_snapshot')
        .in('supplier_catalog_product_id', batch)
        .limit(10000);
      for (const v of (vdata ?? []) as any[]) {
        const pid = v.supplier_catalog_product_id;
        if (!priceByPid.has(pid)) priceByPid.set(pid, []);
        const n = Number(v.price_snapshot);
        if (n > 0) priceByPid.get(pid)!.push(n);
      }
    }
    const catById = new Map((await fetchAllCategories('id,slug')).map((c: any) => [c.id, c.slug]));
    return (prods.data as any[]).map((p: any) => {
      const prices = priceByPid.get(p.id) ?? [];
      const price = prices.length ? Math.min(...prices) : 0;
      return {
        id: p.id,
        slug: `sp-${p.id.slice(0, 8)}-${slugify(p.name)}`,
        name: p.name,
        brand: p.brand_name ?? 'Supplier',
        price,
        category: catById.get(p.category_id) ?? '',
        variant_count: p.variant_count ?? 0,
      };
    });
  } catch {
    return [];
  }
}


export async function getSupplierProductDetail(slug: string): Promise<any | null> {
  try {
    if (!supabase) throw new Error('no supabase env');
    // Slug format: sp-<id8>-<name>
    if (!slug.startsWith('sp-')) return null;
    const idPart = slug.slice(3, 11);
    const { data, error } = await supabase
      .from('supplier_catalog_products')
      .select('id,name,brand_name,category_id,supplier_catalog_variants(id,external_id,name,size,color,price_snapshot)')
      .ilike('id', idPart + '%')
      .limit(1)
      .single();
    if (error || !data) return null;
    const d: any = data;
    const variants = (d.supplier_catalog_variants ?? []).map((v: any) => ({
      id: v.id, sku: v.external_id, size: v.size, color: v.color,
      price: Number(v.price_snapshot ?? 0), compare_at_price: null, is_active: true,
    }));
    const prices = variants.map((v: any) => v.price).filter((n: number) => n > 0);
    return {
      slug, name: d.name, description: null, brand: d.brand_name ?? 'Supplier',
      category: d.category_id, variants,
      price_min: prices.length ? Math.min(...prices) : 0,
      price_max: prices.length ? Math.max(...prices) : 0,
      category_path: [],
    };
  } catch { return null; }
}

export function descendantsOf(categories: DbCategory[], slug: string): string[] {
  const out = [slug];
  for (const c of categories.filter((c) => c.parent === slug)) out.push(...descendantsOf(categories, c.slug));
  return out;
}

export type DbVariant = { id: string; sku: string; size: string | null; color: string | null; price: number; compare_at_price: number | null; is_active: boolean };
export type DbProductDetail = {
  slug: string; name: string; description: string | null;
  brand: string | null; category_path: { name: string; slug: string; level: number }[];
  collections: string[]; variants: DbVariant[];
  price_min: number | null; price_max: number | null;
};

export async function getProductDetail(slug: string): Promise<DbProductDetail | null> {
  try {
    if (!supabase) throw new Error('no supabase env');
    const { data: p, error }: { data: any; error: any } = await supabase.from('products')
      .select('id,slug,name,description,category_id,brand_id').eq('slug', slug).eq('status', 'published').single();
    if (error || !p) throw new Error('no db product');
    const prod = p as any;
    const [brands, cats, variants, pcs, cols] = await Promise.all([
      prod.brand_id ? supabase.from('brands').select('name').eq('id', prod.brand_id).single() : Promise.resolve({ data: null } as any),
      fetchAllCategories('id,parent_id,name,slug,level').then((data) => ({ data })),
      supabase.from('product_variants').select('id,sku,size,color,price,compare_at_price,is_active').eq('product_id', prod.id).eq('is_active', true).order('price').limit(5000),
      supabase.from('product_collections').select('collection_id').eq('product_id', prod.id).limit(5000),
      supabase.from('collections').select('id,slug').limit(5000),
    ]);
    const byId = new Map((cats.data ?? []).map((c: any) => [c.id, c]));
    const path: { name: string; slug: string; level: number }[] = [];
    let cur = prod.category_id ? byId.get(prod.category_id) : undefined;
    while (cur) { path.unshift({ name: cur.name, slug: cur.slug, level: cur.level }); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }
    const colById = new Map((cols.data ?? []).map((c: any) => [c.id, c.slug]));
    const vlist: DbVariant[] = (variants.data ?? []).map((v: any) => ({
      id: v.id, sku: v.sku, size: v.size, color: v.color,
      price: Number(v.price), compare_at_price: v.compare_at_price == null ? null : Number(v.compare_at_price),
      is_active: v.is_active,
    }));
    const prices = vlist.map((v) => v.price);
    return {
      slug: prod.slug, name: prod.name, description: prod.description,
      brand: brands.data?.name ?? null, category_path: path,
      collections: (pcs.data ?? []).map((pc: any) => colById.get(pc.collection_id)).filter(Boolean) as string[],
      variants: vlist,
      price_min: prices.length ? Math.min(...prices) : null,
      price_max: prices.length ? Math.max(...prices) : null,
    };
  } catch {
    const seed = SEED_PRODUCTS.find((x) => x.slug === slug);
    if (!seed) return null;
    return {
      slug: seed.slug, name: seed.name, description: null, brand: seed.brand,
      category_path: [{ name: seed.category, slug: seed.category, level: 3 }],
      collections: seed.collections, variants: [{ id: seed.slug, sku: seed.slug, size: null, color: null, price: seed.price, compare_at_price: null, is_active: true }],
      price_min: seed.price, price_max: seed.price,
    };
  }
}
