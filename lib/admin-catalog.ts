import { supabase } from './supabase';
import { PRODUCTS as SEED_PRODUCTS } from './catalog';
export type AdminVariant = { id: string; sku: string; size: string | null; color: string | null; price: number; is_active: boolean; routes: number; design: string | null };
export type AdminProduct = { slug: string; name: string; category: string; brand: string; status: string; collections: string[]; variants: AdminVariant[] };
const SEED_VARIANTS: Record<string, AdminVariant[]> = {
  'kin-keeper-premium-tee': [{ id: '', sku: 'UNS-TEE-KK', size: null, color: null, price: 34, is_active: true, routes: 0, design: null }],
  'kin-keeper-cap': [{ id: '', sku: 'UNS-CAP-KK', size: null, color: null, price: 28, is_active: true, routes: 0, design: null }],
  'kin-keeper-mug': [{ id: '', sku: 'UNS-MUG-KK', size: null, color: null, price: 22, is_active: true, routes: 0, design: null }],
  'kin-keeper-bundle': [{ id: '', sku: 'UNS-BND-KK', size: null, color: null, price: 74, is_active: true, routes: 0, design: null }],
  'kin-keeper-card': [{ id: '', sku: 'UNS-CARD-KK', size: null, color: null, price: 8, is_active: true, routes: 0, design: null }],
};
// Admin-first: ALL products (draft + published + archived), NOT just published storefront ones.
// Nothing reaches the storefront until admin designs it and publishes it here.
export async function getAdminProducts(): Promise<AdminProduct[]> {
  try {
    if (!supabase) throw new Error('no supabase env');
    const [prods, brands, cats, variants, routes, pcs, cols, pubs] = await Promise.all([
      supabase.from('products').select('id,slug,name,category_id,brand_id,status').order('name').limit(1000),
      supabase.from('brands').select('id,name').limit(1000),
      supabase.from('categories').select('id,slug').limit(1000),
      supabase.from('product_variants').select('id,product_id,sku,size,color,price,is_active').limit(1000),
      supabase.from('variant_fulfillment_routes').select('product_variant_id,is_active').eq('is_active', true).limit(1000),
      supabase.from('product_collections').select('product_id,collection_id').limit(1000),
      supabase.from('collections').select('id,slug').limit(1000),
      supabase.from('design_publications').select('product_variant_id,status').limit(2000),
    ]);
    if (prods.error || !prods.data || prods.data.length === 0) throw new Error('no db products');
    const brandById = new Map((brands.data ?? []).map((b: any) => [b.id, b.name]));
    const catById = new Map((cats.data ?? []).map((c: any) => [c.id, c.slug]));
    const colById = new Map((cols.data ?? []).map((c: any) => [c.id, c.slug]));
    const colsByProduct = new Map<string, string[]>();
    for (const pc of (pcs.data ?? []) as any[]) { const s = colById.get(pc.collection_id); if (s) { if (!colsByProduct.has(pc.product_id)) colsByProduct.set(pc.product_id, []); colsByProduct.get(pc.product_id)!.push(s); } }
    const varsByProduct = new Map<string, AdminVariant[]>();
    const routeCount = new Map<string, number>();
    for (const r of (routes.data ?? []) as any[]) { routeCount.set(r.product_variant_id, (routeCount.get(r.product_variant_id) ?? 0) + 1); }
    // design_publications keyed by variant uuid -> publication status (one design, many products)
    const designByVariant = new Map<string, string>();
    for (const p of (pubs.data ?? []) as any[]) { if (!designByVariant.has(p.product_variant_id)) designByVariant.set(p.product_variant_id, p.status); }
    for (const v of (variants.data ?? []) as any[]) { if (!varsByProduct.has(v.product_id)) varsByProduct.set(v.product_id, []); varsByProduct.get(v.product_id)!.push({ id: v.id, sku: v.sku, size: v.size, color: v.color, price: Number(v.price), is_active: v.is_active, routes: routeCount.get(v.id) ?? 0, design: designByVariant.get(v.id) ?? null }); }
    return (prods.data as any[]).map((p) => ({ slug: p.slug, name: p.name, category: catById.get(p.category_id) ?? '', brand: brandById.get(p.brand_id) ?? '', status: p.status, collections: colsByProduct.get(p.id) ?? [], variants: varsByProduct.get(p.id) ?? [] }));
  } catch {
    return SEED_PRODUCTS.map((p) => ({ slug: p.slug, name: p.name, category: p.category, brand: p.brand, status: 'published', collections: p.collections, variants: SEED_VARIANTS[p.slug] ?? [{ id: '', sku: p.slug.toUpperCase(), size: null, color: null, price: p.price, is_active: true, routes: 0, design: null }] }));
  }
}
