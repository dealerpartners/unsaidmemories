/**
 * Inspect products + variants + orders + designs data.
 * Run: bun scripts/inspect-products.ts
 */
import { supabaseAdmin, DEFAULT_TENANT_ID } from '../src/lib/supabaseAdmin';

const db = supabaseAdmin();

async function count(table: string, filter: Record<string, any> = {}) {
  const { count, error } = await db.from(table).select('id', { count: 'exact', head: true }).match(filter);
  console.log(`${table}: ${error ? `ERR ${error.message}` : count}`);
}

console.log('── counts (tenant scoped where applicable) ──');
await count('products', { tenant_id: DEFAULT_TENANT_ID });
await count('product_variants', { tenant_id: DEFAULT_TENANT_ID });
await count('designs', { tenant_id: DEFAULT_TENANT_ID });
await count('design_publications', { tenant_id: DEFAULT_TENANT_ID });
await count('orders', { tenant_id: DEFAULT_TENANT_ID });
await count('order_items', { tenant_id: DEFAULT_TENANT_ID });
await count('shipping_profiles');
await count('commerce_prices', { tenant_id: DEFAULT_TENANT_ID });
await count('commerce_price_lists', { tenant_id: DEFAULT_TENANT_ID });

console.log('\n── products sample ──');
const { data: prods, error: pe } = await db.from('products').select('*').limit(5);
if (pe) console.log('ERR', pe.message);
else console.log(JSON.stringify(prods, null, 2));

console.log('\n── product_variants sample ──');
const { data: vars } = await db.from('product_variants').select('*').limit(5);
console.log(JSON.stringify(vars, null, 2));

console.log('\n── designs sample ──');
const { data: des } = await db.from('designs').select('id,name,status,retail_price,product_type,garment_color,supplier_catalog_product_id,published_product_id,product_title').limit(5);
console.log(JSON.stringify(des, null, 2));

console.log('\n── orders sample ──');
const { data: ords } = await db.from('orders').select('*').limit(3);
console.log(JSON.stringify(ords, null, 2));
