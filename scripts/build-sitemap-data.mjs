// Refreshes lib/sitemap-data.json from Supabase at build time via the Supabase CLI.
// Safe to run anywhere: on any failure it keeps the committed fallback file and exits 0,
// so `next build` never breaks for lack of DB access. Never prints credentials.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(root, 'lib', 'sitemap-data.json');

function getToken() {
  const creds = join(os.homedir(), 'workspace', 'user', 'files', 'UNSAID_CREDS.md');
  if (!existsSync(creds)) return null;
  const txt = readFileSync(creds, 'utf8');
  const m = txt.match(/# Supabase[\s\S]*?ACCESS(?:\\_TOKEN|_TOKEN)\s*=\s*(\S+)/);
  if (!m) return null;
  return m[1].replace(/\\_/g, '_');
}

function query(token, sql) {
  const cli = join(os.homedir(), 'workspace', 'bin', 'supabase');
  const raw = execFileSync(cli, ['db', 'query', '--linked', '--output-format', 'json', sql], {
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
    timeout: 90000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString();
  return JSON.parse(raw).map((r) => r.slug).filter(Boolean);
}

try {
  const token = getToken();
  if (!token) throw new Error('no Supabase token available');
  const products = query(token, "SELECT slug FROM products WHERE status='published' ORDER BY slug;");
  const collections = query(token, 'SELECT slug FROM collections ORDER BY slug;');
  const categories = query(token, 'SELECT slug FROM categories WHERE level=1 ORDER BY slug;');
  const data = {
    generatedAt: new Date().toISOString(),
    source: 'supabase',
    products,
    collections,
    categories,
  };
  writeFileSync(outFile, JSON.stringify(data, null, 2) + '\n');
  console.log(`sitemap-data: ${products.length} products, ${collections.length} collections, ${categories.length} categories`);
} catch (e) {
  console.log(`sitemap-data: using committed fallback (${e.message || e})`);
}
