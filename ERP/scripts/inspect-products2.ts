/**
 * Inspect categories + design_publications + product join shapes.
 * Run: bun scripts/inspect-products2.ts
 */
import { supabaseAdmin, DEFAULT_TENANT_ID } from '../src/lib/supabaseAdmin';

const db = supabaseAdmin();

console.log('── categories ──');
const { data: cats } = await db.from('categories').select('*').limit(30);
console.log(JSON.stringify(cats?.map(c => ({ id: c.id, name: c.name, slug: c.slug, parent: c.parent_id })), null, 1));

console.log('\n── design_publications sample ──');
const { data: pubs } = await db.from('design_publications').select('*').limit(5);
console.log(JSON.stringify(pubs, null, 1));

console.log('\n── order_items with joins ──');
const { data: ois, error: oiErr } = await db.from('order_items')
  .select('id, order_id, product_variant_id, quantity, unit_price, product_variants!inner(sku, product_id, size, color)')
  .limit(5);
if (oiErr) console.log('JOIN ERR:', oiErr.message);
else console.log(JSON.stringify(ois, null, 1));

console.log('\n── product with category join ──');
const { data: pj, error: pjErr } = await db.from('products')
  .select('id, name, status, category_id, categories!inner(name, slug)')
  .limit(3);
if (pjErr) console.log('JOIN ERR:', pjErr.message);
else console.log(JSON.stringify(pj, null, 1));

console.log('\n── designs joined to published product ──');
const { data: dj, error: djErr } = await db.from('designs')
  .select('id, name, status, retail_price, published_product_id, products!designs_published_product_id_fkey(id, name)')
  .limit(5);
if (djErr) console.log('JOIN ERR:', djErr.message);
else console.log(JSON.stringify(dj, null, 1));
