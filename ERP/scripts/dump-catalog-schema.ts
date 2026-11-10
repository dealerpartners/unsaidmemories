/**
 * Lists ALL tables in the Supabase schema + dumps product-related ones.
 * Run: bun scripts/dump-catalog-schema.ts
 */
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from '../src/lib/supabaseConfig';

const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
  headers: {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  },
});
if (!res.ok) {
  console.log('FAILED:', res.status, await res.text());
  process.exit(1);
}
const spec: any = await res.json();

const allTables = Object.keys(spec.definitions || {}).sort();
console.log('ALL TABLES (' + allTables.length + '):');
for (const t of allTables) console.log('  ' + t);

// Dump any table whose name mentions product/catalog/inventory/sku/variant/price/shipping/order
const interesting = allTables.filter((t) =>
  /product|catalog|invent|sku|variant|price|shipping|order|design|item/i.test(t)
);
for (const t of interesting) {
  const def = spec.definitions?.[t];
  if (!def) continue;
  const props: Record<string, any> = def.properties || {};
  const required: string[] = def.required || [];
  console.log(`\n=== ${t} (${Object.keys(props).length} columns) ===`);
  for (const [name, p] of Object.entries(props)) {
    console.log(
      `  ${name.padEnd(32)} ${String((p as any).format || (p as any).type).padEnd(12)} ${required.includes(name) ? 'REQUIRED' : 'optional'}${(p as any).default != null ? ` def:${(p as any).default}` : ''}`
    );
  }
}
