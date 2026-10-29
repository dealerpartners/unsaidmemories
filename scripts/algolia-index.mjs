#!/usr/bin/env node
// UnSaid Memories — Algolia product index builder.
// Reads products + variants + categories + brands + collections from Supabase,
// builds Algolia records, and pushes them to the `unsaid_products` index.
//
// Usage:
//   node scripts/algolia-index.mjs              # full index run (needs Algolia keys)
//   node scripts/algolia-index.mjs --dry-run    # build records, print summary, push nothing
//
// Env (see .env.example):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)
//   ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY, [ALGOLIA_INDEX_NAME, default unsaid_products]
//
// Without Algolia keys the script exits 0 with a clear message — the storefront
// search falls back to the Supabase catalog, so nothing breaks.
import { createClient } from '@supabase/supabase-js';
import { algoliasearch } from 'algoliasearch';

const DRY_RUN = process.argv.includes('--dry-run');
const INDEX_NAME = process.env.ALGOLIA_INDEX_NAME || 'unsaid_products';
const BATCH = 1000;

function fail(msg) { console.error(`algolia-index: ${msg}`); process.exit(1); }
function info(msg) { console.log(`algolia-index: ${msg}`); }

export function buildRecords({ products, variants, categories, brands, collections, productCollections }) {
  const brandById = new Map((brands ?? []).map((b) => [b.id, b.name]));
  const catById = new Map((categories ?? []).map((c) => [c.id, c]));
  const colById = new Map((collections ?? []).map((c) => [c.id, c.slug]));
  const colsByProduct = new Map();
  for (const pc of productCollections ?? []) {
    const slug = colById.get(pc.collection_id);
    if (!slug) continue;
    if (!colsByProduct.has(pc.product_id)) colsByProduct.set(pc.product_id, []);
    colsByProduct.get(pc.product_id).push(slug);
  }
  // Full category path from leaf to root (names, root-first).
  const pathOf = (catId) => {
    const names = [];
    let cur = catById.get(catId);
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      names.unshift(cur.name);
      cur = cur.parent_id ? catById.get(cur.parent_id) : null;
    }
    return names;
  };
  const variantsByProduct = new Map();
  for (const v of variants ?? []) {
    if (!v.is_active) continue;
    if (!variantsByProduct.has(v.product_id)) variantsByProduct.set(v.product_id, []);
    variantsByProduct.get(v.product_id).push(v);
  }
  const records = [];
  for (const p of products ?? []) {
    const cat = catById.get(p.category_id);
    const base = {
      name: p.name,
      slug: p.slug,
      brand: p.brand_id ? brandById.get(p.brand_id) ?? '' : '',
      category: cat?.slug ?? '',
      category_path: pathOf(p.category_id),
      collections: colsByProduct.get(p.id) ?? [],
    };
    const vs = variantsByProduct.get(p.id) ?? [];
    if (vs.length === 0) {
      records.push({ objectID: `product:${p.slug}`, type: 'product', sku: '', price: 0, size: '', color: '', ...base });
    } else {
      for (const v of vs) {
        records.push({
          objectID: `variant:${v.id}`,
          type: 'variant',
          sku: v.sku ?? '',
          price: v.price != null ? Number(v.price) : 0,
          size: v.size ?? '',
          color: v.color ?? '',
          ...base,
        });
      }
    }
  }
  return records;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    info('Supabase env missing (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Nothing to index — exiting cleanly.');
    process.exit(0);
  }
  const sb = createClient(url, key);
  const [prods, vars, cats, brs, cols, pcs] = await Promise.all([
    sb.from('products').select('id,slug,name,category_id,brand_id').eq('status', 'published').limit(BATCH),
    sb.from('product_variants').select('id,product_id,sku,size,color,price,is_active').eq('is_active', true).limit(BATCH),
    sb.from('categories').select('id,parent_id,level,name,slug').limit(BATCH),
    sb.from('brands').select('id,name').limit(BATCH),
    sb.from('collections').select('id,slug').limit(BATCH),
    sb.from('product_collections').select('product_id,collection_id').limit(BATCH),
  ]);
  for (const [label, r] of [['products', prods], ['variants', vars], ['categories', cats]]) {
    if (r.error) fail(`Supabase query failed (${label}): ${r.error.message}`);
  }
  const records = buildRecords({
    products: prods.data ?? [],
    variants: vars.data ?? [],
    categories: cats.data ?? [],
    brands: brs.data ?? [],
    collections: cols.data ?? [],
    productCollections: pcs.data ?? [],
  });
  info(`built ${records.length} records from ${(prods.data ?? []).length} products / ${(vars.data ?? []).length} variants`);
  if (DRY_RUN) {
    info('dry run — pushing nothing. Sample record:');
    console.log(JSON.stringify(records[0] ?? null, null, 2));
    process.exit(0);
  }
  const appId = process.env.ALGOLIA_APP_ID;
  const adminKey = process.env.ALGOLIA_ADMIN_API_KEY;
  if (!appId || !adminKey) {
    info(`Algolia not configured (ALGOLIA_APP_ID / ALGOLIA_ADMIN_API_KEY missing). Skipping push — built ${records.length} records for index '${INDEX_NAME}'.`);
    info('Search falls back to the Supabase catalog. To activate: run the Algolia wizard (needs an interactive terminal + Algolia login), set ALGOLIA_APP_ID and ALGOLIA_ADMIN_API_KEY, then re-run this script.');
    process.exit(0);
  }
  const client = algoliasearch(appId, adminKey);
  await client.saveObjects({ indexName: INDEX_NAME, objects: records });
  await client.setSettings({
    indexName: INDEX_NAME,
    indexSettings: {
      searchableAttributes: ['name', 'sku', 'brand', 'category_path', 'collections'],
      attributesForFaceting: ['brand', 'category', 'collections', 'type'],
    },
  });
  info(`pushed ${records.length} records to Algolia index '${INDEX_NAME}'`);
}

main().catch((e) => fail(e.message ?? String(e)));
