// Storefront data from Supabase (migrated DB), with fallback to the in-app seed
// when Supabase env is missing or a query fails, so the build never breaks.
import { supabase } from './supabase';
import { CATEGORIES as SEED_CATEGORIES, PRODUCTS as SEED_PRODUCTS } from './catalog';

export type DbCategory = { id: string; parent_id: string | null; level: number; name: string; slug: string; parent?: string };
export type DbProduct = { slug: string; name: string; category: string; brand: string; price: number; collections: string[] };

export async function getCategories(): Promise<DbCategory[]> {
  try {
    if (!supabase) throw new Error('no supabase env');
    const { data, error } = await supabase.from('categories').select('id,parent_id,level,name,slug').order('sort_order').limit(1000);
    if (error || !data || data.length === 0) throw new Error('no db categories');
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
      supabase.from('products').select('id,slug,name,category_id,brand_id').eq('status', 'published').limit(1000),
      supabase.from('brands').select('id,name').limit(1000),
      supabase.from('product_variants').select('product_id,price,is_active').eq('is_active', true).limit(1000),
      supabase.from('product_collections').select('product_id,collection_id').limit(1000),
      supabase.from('collections').select('id,slug').limit(1000),
    ]);
    if (prods.error || !prods.data || prods.data.length === 0) throw new Error('no db products');
    const brandById = new Map((brands.data ?? []).map((b: any) => [b.id, b.name]));
    const catById = new Map((await supabase!.from('categories').select('id,slug').limit(1000)).data?.map((c: any) => [c.id, c.slug]) ?? []);
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

export function descendantsOf(categories: DbCategory[], slug: string): string[] {
  const out = [slug];
  for (const c of categories.filter((c) => c.parent === slug)) out.push(...descendantsOf(categories, c.slug));
  return out;
}
