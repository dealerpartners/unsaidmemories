/**
 * One-off migration backfill: give every existing supplier_catalog_products
 * row a source_category_path (from its legacy category tree path), letting
 * the 06f trigger (trg_source_category → catalog_upsert_source_category)
 * build catalog_source_categories per supplier and set source_category_id.
 *
 * This moves the catalog layer onto source categories (06f model):
 *   Product Catalog  = supplier_catalog_products + catalog_source_categories
 *   Listing          = taxonomy_nodes
 *   Map              = listing_category_map
 *
 * Legacy category_id is left untouched (renderWorker/templates still read it).
 *
 * Run: bun scripts/backfill-source-categories.ts [--dry]
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pcwwvfgxnrglmmpbfqhf.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjd3d2Zmd4bnJnbG1tcGJmcWhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzIzMTEwOCwiZXhwIjoyMTA4ODA3MTA4fQ.VxltFn42SYE66BBTiYPzZI_5GQ7aMYJyIxoYHqCNgNA';

const DRY = process.argv.includes('--dry');
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. The legacy categories tree → id → " / "-joined names path.
  const cats: { id: string; name: string; parent_id: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('categories')
      .select('id,name,parent_id')
      .range(from, from + 999);
    if (error) throw new Error(`categories: ${error.message}`);
    cats.push(...((data ?? []) as typeof cats));
    if (!data || data.length < 1000) break;
  }
  const byId = new Map(cats.map((c) => [c.id, c]));
  const pathOf = (id: string): string => {
    const segs: string[] = [];
    let cur = byId.get(id);
    let guard = 0;
    while (cur && guard < 10) {
      segs.unshift(cur.name.trim());
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
      guard++;
    }
    return segs.join(' / ');
  };
  console.log(`categories: ${cats.length}`);

  // 2. Which categories are actually used by products (+ row counts)?
  // Paged — PostgREST caps a single request at 1,000 rows.
  const counts = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('supplier_catalog_products')
      .select('category_id')
      .not('category_id', 'is', null)
      .range(from, from + 999);
    if (error) throw new Error(`usage: ${error.message}`);
    for (const r of data ?? []) {
      const id = r.category_id as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    if (!data || data.length < 1000) break;
  }
  console.log(`used categories: ${counts.size}, products: ${[...counts.values()].reduce((a, b) => a + b, 0)}`);

  // 3. Skip categories already backfilled (idempotent re-runs).
  const { count: doneCount } = await sb
    .from('supplier_catalog_products')
    .select('id', { count: 'exact', head: true })
    .not('source_category_id', 'is', null);
  console.log(`already backfilled: ${doneCount ?? 0}`);

  // 4. One PATCH per category — the trigger does the rest per row.
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [catId, n] of sorted) {
    const path = pathOf(catId);
    if (!path) {
      console.log(`  SKIP ${catId} (${n} rows): no resolvable path`);
      skipped += n;
      continue;
    }
    if (DRY) {
      console.log(`  DRY ${path} — ${n} rows`);
      continue;
    }
    const { error } = await sb
      .from('supplier_catalog_products')
      .update({ source_category_path: path })
      .eq('category_id', catId)
      .is('source_category_id', null);
    if (error) {
      failed++;
      console.log(`  FAIL ${path} (${n} rows): ${error.message}`);
    } else {
      ok++;
      if (ok % 25 === 0) console.log(`  … ${ok}/${sorted.length} categories done`);
    }
  }
  console.log(`patched categories: ${ok}, failed: ${failed}, skipped rows: ${skipped}${DRY ? ' (dry run)' : ''}`);

  // 5. Verify.
  const { count: withSrc } = await sb
    .from('supplier_catalog_products')
    .select('id', { count: 'exact', head: true })
    .not('source_category_id', 'is', null);
  const { count: srcCats } = await sb
    .from('catalog_source_categories')
    .select('id', { count: 'exact', head: true });
  console.log(`VERIFY products with source_category_id: ${withSrc ?? 0}; catalog_source_categories rows: ${srcCats ?? 0}`);
}

main().catch((e) => {
  console.error('BACKFILL FAILED:', e.message);
  process.exit(1);
});
