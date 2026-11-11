// Regenerates src/lib/taxonomy-data.ts from the store's own
// `categories` table. Runs on the deploy box before every build
// (deploy.sh), so the storefront's navigation, category pages,
// sidebar, sitemap and collection fallbacks always render the
// categories that are actually in the database.
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the
// environment or ./.env.production. Exits non-zero on any failure
// so a deploy never ships a stale or empty tree.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

function loadEnv() {
  const env = { ...process.env };
  if ((!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) && existsSync(".env.production")) {
    for (const line of readFileSync(".env.production", "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  }
  return env;
}

const env = loadEnv();
const base = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) {
  console.error("gen-taxonomy: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function getJson(path, extraHeaders = {}) {
  const res = await fetch(`${base}/rest/v1/${path}`, { headers: { ...headers, ...extraHeaders } });
  if (!res.ok) throw new Error(`gen-taxonomy: ${path} -> ${res.status}`);
  return res.json();
}

const cats = await getJson(
  "categories?select=id,name,slug,parent_id,sort_order&is_active=eq.true&slug=neq.api-test-category&order=sort_order.asc,name.asc",
);
if (!Array.isArray(cats) || cats.length < 50) {
  console.error(`gen-taxonomy: only ${cats?.length} categories returned — refusing to write`);
  process.exit(1);
}

const direct = {};
for (let from = 0; ; from += 1000) {
  const rows = await getJson(
    "supplier_catalog_products?select=category_id&is_hidden=eq.false&category_id=not.is.null",
    { Range: `${from}-${from + 999}` },
  );
  for (const r of rows) direct[r.category_id] = (direct[r.category_id] || 0) + 1;
  if (rows.length < 1000) break;
}

const byParent = new Map();
for (const c of cats) {
  const k = c.parent_id || "ROOT";
  if (!byParent.has(k)) byParent.set(k, []);
  byParent.get(k).push(c);
}
const build = (c) => {
  const kids = (byParent.get(c.id) || []).map(build);
  const count = (direct[c.id] || 0) + kids.reduce((s, k) => s + k.count, 0);
  return { name: c.name, slug: c.slug, count, children: kids };
};
const roots = (byParent.get("ROOT") || []).map(build);

const emit = (n, indent) => {
  const pad = "  ".repeat(indent);
  const kids = n.children.length
    ? `[\n${n.children.map((k) => emit(k, indent + 1)).join(",\n")}\n${pad}  ]`
    : "[]";
  return `${pad}{\n${pad}  name: ${JSON.stringify(n.name)},\n${pad}  slug: ${JSON.stringify(n.slug)},\n${pad}  count: ${n.count},\n${pad}  children: ${kids},\n${pad}}`;
};

const body = `// GENERATED from the store's own \`categories\` table by
// scripts/gen-taxonomy.mjs — regenerated on every deploy.
// Do not hand-edit: the store's navigation, category pages, sidebar,
// sitemap and collection fallbacks all render from this tree, and it
// must always match the categories in the database.

import type { TaxonomyNode } from "./taxonomy";

export const taxonomyData: TaxonomyNode[] = [
${roots.map((r) => emit(r, 1)).join(",\n")}
];
`;
writeFileSync("src/lib/taxonomy-data.ts", body);
console.log(`gen-taxonomy: ${roots.length} roots written from ${cats.length} categories`);
