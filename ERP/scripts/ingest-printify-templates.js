#!/usr/bin/env node
/**
 * Lane 4 — Printify asset ingest (contract §4).
 *
 * Printify publishes no static mockup-photo table: the base photo for a
 * blank comes from a shop product's generated mockups. So for each
 * (blueprint, provider, blank) pair in `supplier_catalog_variants`
 * (print_specs placeholders carry the print-area px), this script:
 *   1. uploads one blank white PNG (the throwaway print file),
 *   2. creates a THROWAWAY shop product for the pair,
 *   3. reads the generated mockup image URLs, downloads + hashes them,
 *      stores them in OUR storage (design-assets bucket), derives the
 *      shading layer + mask from the light base photo,
 *   4. writes the render contract to `product_canvas_templates` with
 *      source='printify',
 *   5. DELETES the throwaway shop product (finally block — a failed delete
 *      is reported loudly and the product id is printed for manual cleanup).
 *
 * GATE: refuses to run unless the image-terms flag is recorded as allowed in
 * `platform_feature_flags` (flag_key 'image_terms_printify', enabled=true).
 * A missing or disabled flag exits 3 with a plain REFUSED message and makes
 * NO Printify calls and NO downloads. Never set the flag from this script.
 *
 * PRINTIFY LIMITS (recorded honestly in the row note):
 * - Printify does NOT publish the print-box position inside the mockup
 *   photo, so print_zone_x/y are NULL and print_zone_width/height come from
 *   the placeholder px. The box position is confirmed by a human in the
 *   blank workspace (Lane 5); verified stays false until then.
 * - px_per_inch = 300 (Printify print-file DPI convention) — flagged, not
 *   measured; the workspace confirms it with the box.
 * - A supplier URL is NEVER the live asset: mockup_image_url /
 *   displacement_map_url are written NULL; the renderer reads only the
 *   stored_*_path columns.
 * - Human-check note goes in the existing `hardware_modifiers` jsonb
 *   column. No new columns, no new tables.
 * - PostgREST caps at 1000 rows/request: all reads paginate with .range().
 * - Printify rate limits (429) are respected via Retry-After and counted.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/ingest-printify-templates.js [--dry-run] [--limit N] [--blueprint <id>] [--provider <id>]
 * Env: SUPABASE_URL (default https://pcwwvfgxnrglmmpbfqhf.supabase.co),
 *      SUPABASE_SERVICE_ROLE_KEY (required), INTEGRATIONS_ENCRYPTION_KEY
 *      (optional; falls back to the service-role key as key material, same
 *      as src/lib/supplierKeys.ts).
 * Exit: 0 ok · 3 refused (image-terms flag not set) · 2 error.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');

const PROJECT_URL_DEFAULT = 'https://pcwwvfgxnrglmmpbfqhf.supabase.co';
const TENANT_ID = '652fd2be-d19a-4778-835d-db38094d7718';
const BUCKET = 'design-assets';
const SUPPLIER = 'printify';
const FLAG_KEY = 'image_terms_printify';
const PRINTIFY_BASE = 'https://api.printify.com';
const PRINT_DPI = 300; // Printify print-file DPI convention (flagged, see header)
const EXIT_REFUSED = 3;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = parseInt((args[args.indexOf('--limit') + 1] || '0'), 10) || 0;
const ONLY_BLUEPRINT = args[args.indexOf('--blueprint') + 1] || null;
const ONLY_PROVIDER = args[args.indexOf('--provider') + 1] || null;

/* ---------- env ---------- */
function loadDotEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* absent — fine */ }
}
loadDotEnv(path.join(__dirname, '..', '.env.local'));
loadDotEnv(path.join(__dirname, '..', '.env'));

const SUPABASE_URL = process.env.SUPABASE_URL
  || process.env.NEXT_PUBLIC_SUPABASE_URL
  || PROJECT_URL_DEFAULT;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is not set (env or .env.local). Refusing to run.');
  process.exit(2);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/* ---------- helpers ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const shortHash = (hex) => hex.slice(0, 8);
let rateLimitHits = 0;

/** AES-256-GCM decrypt, same scheme as src/lib/supplierKeys.ts (read-only mirror). */
function decryptValue(payload) {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const material = process.env.INTEGRATIONS_ENCRYPTION_KEY || SERVICE_KEY;
  const key = crypto.createHash('sha256').update(material).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

async function getPrintifyKey() {
  const { data, error } = await supabase
    .from('integration_keys')
    .select('encrypted_value')
    .eq('tenant_id', TENANT_ID)
    .eq('key_name', 'PRINTIFY_API_KEY')
    .maybeSingle();
  if (error) throw new Error(`integration_keys: ${error.message}`);
  if (!data?.encrypted_value) throw new Error('No PRINTIFY_API_KEY on file (integration_keys).');
  return decryptValue(data.encrypted_value);
}

let PRINTIFY_KEY = null;
async function printifyFetch(p, init = {}) {
  let delay = 2000;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${PRINTIFY_BASE}${p}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${PRINTIFY_KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < 4) {
      rateLimitHits++;
      const retryAfter = parseInt(res.headers.get('retry-after') || '', 10);
      await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : delay);
      delay *= 2;
      continue;
    }
    const text = await res.text().catch(() => '');
    throw new Error(`Printify ${res.status} on ${p}: ${text.slice(0, 300)}`);
  }
  throw new Error(`Printify request failed after retries: ${p}`);
}

async function download(url) {
  let delay = 2000;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'erp-pod-ingest/1.0' } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status === 429 && attempt < 4) {
      rateLimitHits++;
      await sleep(delay);
      delay *= 2;
      continue;
    }
    throw new Error(`download ${res.status} for ${url}`);
  }
  throw new Error(`download failed after retries: ${url}`);
}

async function uploadStored(storagePath, bytes, contentType) {
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`storage upload ${storagePath}: ${error.message}`);
  return storagePath;
}

async function deriveShadingAndMask(baseBuf) {
  const meta = await sharp(baseBuf).metadata();
  const shadingBuf = await sharp(baseBuf).greyscale().normalise().png().toBuffer();
  let maskBuf;
  if (meta.hasAlpha) {
    maskBuf = await sharp(baseBuf).extractChannel('alpha').threshold(10).png().toBuffer();
  } else {
    maskBuf = await sharp(baseBuf).greyscale().threshold(250).png().toBuffer();
  }
  return { shadingBuf, maskBuf };
}

async function fetchAll(table, build) {
  const rows = [];
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select('*');
    q = build(q);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return rows;
}

/* ---------- view mapping ---------- */
function viewForPosition(position) {
  const p = String(position || '').toLowerCase();
  if (p.startsWith('front')) return 'FRONT';
  if (p.startsWith('back')) return 'BACK';
  if (p.includes('left_sleeve') || p.includes('left sleeve') || p === 'left') return 'LEFT_SIDE';
  if (p.includes('right_sleeve') || p.includes('right sleeve') || p === 'right') return 'RIGHT_SIDE';
  return null;
}

/* ---------- main ---------- */
async function main() {
  console.log(`[printify-ingest] supplier=${SUPPLIER} dryRun=${DRY_RUN}`);

  // 1. THE GATE — checked before any Printify call, download, or write.
  const { data: flag, error: flagErr } = await supabase
    .from('platform_feature_flags')
    .select('flag_key,enabled,description')
    .eq('flag_key', FLAG_KEY)
    .maybeSingle();
  if (flagErr) throw new Error(`flag read: ${flagErr.message}`);
  if (!flag || flag.enabled !== true) {
    console.log(
      `[printify-ingest] REFUSED: image-terms flag '${FLAG_KEY}' is `
      + `${flag ? 'disabled' : 'NOT SET'} in platform_feature_flags. `
      + 'Printify images may not be copied into our storage until the image '
      + 'terms are recorded as allowed. No Printify calls made, nothing '
      + 'downloaded, nothing written.',
    );
    process.exit(EXIT_REFUSED);
  }
  console.log(`[printify-ingest] flag '${FLAG_KEY}' enabled — proceeding.`);

  // 2. Resolve the Printify supplier id + the (blueprint, provider, blank) pairs.
  const { data: supplier } = await supabase
    .from('suppliers').select('id').ilike('name', 'printify').maybeSingle();
  if (!supplier) throw new Error('suppliers: no Printify row.');
  const variants = await fetchAll('supplier_catalog_variants', (q) =>
    q.eq('supplier_id', supplier.id).not('print_specs', 'is', null).not('canonical_product_id', 'is', null));
  const pairs = new Map(); // blueprint|provider|blank -> { blueprintId, providerId, blankId, placeholders, variantIds }
  for (const v of variants) {
    const specs = v.print_specs || {};
    if (!specs.blueprint_id || !specs.provider_id || !Array.isArray(specs.placeholders)) continue;
    if (ONLY_BLUEPRINT && String(specs.blueprint_id) !== ONLY_BLUEPRINT) continue;
    if (ONLY_PROVIDER && String(specs.provider_id) !== ONLY_PROVIDER) continue;
    const key = `${specs.blueprint_id}|${specs.provider_id}|${v.canonical_product_id}`;
    const entry = pairs.get(key) ?? {
      blueprintId: specs.blueprint_id,
      providerId: specs.provider_id,
      blankId: v.canonical_product_id,
      placeholders: specs.placeholders,
      variantIds: new Set(),
    };
    entry.variantIds.add(v.external_id);
    pairs.set(key, entry);
  }
  let jobs = [...pairs.values()];
  if (LIMIT > 0) jobs = jobs.slice(0, LIMIT);
  console.log(`[printify-ingest] pairs=${pairs.size} jobs=${jobs.length} (from ${variants.length} variant rows)`);

  if (DRY_RUN) {
    for (const j of jobs.slice(0, 20)) {
      console.log(`  [dry-run] blueprint=${j.blueprintId} provider=${j.providerId} blank=${String(j.blankId).slice(0, 8)} placeholders=${j.placeholders.map((p) => `${p.position}:${p.width}x${p.height}`).join(',')}`);
    }
    if (jobs.length > 20) console.log(`  [dry-run] … and ${jobs.length - 20} more`);
    console.log('[printify-ingest] dry run done — no products created, nothing written.');
    return;
  }

  // 3. Live Printify session: key + shop + one blank white print file.
  PRINTIFY_KEY = await getPrintifyKey();
  const shops = await printifyFetch('/v1/shops.json');
  if (!Array.isArray(shops) || shops.length === 0) throw new Error('Printify: no shops on this account.');
  const shopId = shops[0].id;
  console.log(`[printify-ingest] shop=${shopId} (${shops[0].title})`);

  // A 1200x1200 white PNG: the throwaway print file. The art is invisible,
  // so the generated mockup is effectively the bare garment photo.
  const blankPng = await sharp({
    create: { width: 1200, height: 1200, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).png().toBuffer();
  const form = new FormData();
  form.append('file', new Blob([blankPng], { type: 'image/png' }), 'blank-white.png');
  const uploadRes = await fetch(`${PRINTIFY_BASE}/v1/uploads/images.json`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PRINTIFY_KEY}` },
    body: form,
  });
  if (!uploadRes.ok) throw new Error(`Printify image upload ${uploadRes.status}: ${(await uploadRes.text()).slice(0, 300)}`);
  const uploadJson = await uploadRes.json();
  const uploadId = uploadJson.id;
  if (!uploadId) throw new Error('Printify image upload returned no id.');
  console.log(`[printify-ingest] blank print file uploaded id=${uploadId}`);

  // 4. Per pair: throwaway product -> mockups -> store -> row -> DELETE product.
  let persisted = 0;
  let skippedExisting = 0;
  let failed = 0;
  const leakedProducts = [];
  for (const job of jobs) {
    const { blueprintId, providerId, blankId, placeholders } = job;
    let productId = null;
    try {
      const variantIds = [...job.variantIds].slice(0, 20); // cap variants per throwaway
      const printAreas = {};
      for (const ph of placeholders) {
        const view = viewForPosition(ph.position);
        if (!view) continue;
        printAreas[ph.position] = [{ src: uploadId, x: 0.5, y: 0.5, scale: 1, angle: 0 }];
      }
      if (Object.keys(printAreas).length === 0) {
        console.log(`  skip: blueprint=${blueprintId} provider=${providerId} — no mappable placeholder positions`);
        continue;
      }
      const created = await printifyFetch(`/v1/shops/${shopId}/products.json`, {
        method: 'POST',
        body: JSON.stringify({
          blueprint_id: blueprintId,
          print_provider_id: providerId,
          variants: variantIds.map((id) => ({ id: Number(id), price: 1999, is_enabled: true })),
          print_areas: printAreas,
          title: `INGEST-THROWAWAY-${blueprintId}-${providerId}`,
        }),
      });
      productId = created.id;
      if (!productId) throw new Error('Printify create product returned no id.');

      // Mockups generate async — poll until image srcs are present.
      let images = [];
      for (let poll = 0; poll < 10; poll++) {
        const prod = await printifyFetch(`/v1/shops/${shopId}/products/${productId}.json`);
        images = Array.isArray(prod.images) ? prod.images : [];
        if (images.some((im) => im.src)) break;
        await sleep(3000);
      }
      if (images.length === 0) throw new Error('no mockup images generated for throwaway product');

      for (const ph of placeholders) {
        const view = viewForPosition(ph.position);
        if (!view) continue;
        const img = images.find((im) => im.position === ph.position) || images[0];
        if (!img?.src) continue;
        const { data: existing } = await supabase
          .from('product_canvas_templates')
          .select('id,stored_base_path,base_sha256')
          .eq('canonical_product_id', blankId)
          .eq('view_angle', view)
          .eq('is_active', true)
          .maybeSingle();
        if (existing?.stored_base_path && existing?.base_sha256) { skippedExisting++; continue; }

        const baseBuf = await download(img.src);
        const baseHash = sha256(baseBuf);
        const basePath = `${TENANT_ID}/blank-templates/${SUPPLIER}/${blankId}/${view.toLowerCase()}-${shortHash(baseHash)}.png`;
        await uploadStored(basePath, baseBuf, 'image/png');
        const { shadingBuf, maskBuf } = await deriveShadingAndMask(baseBuf);
        const shadingHash = sha256(shadingBuf);
        const maskHash = sha256(maskBuf);
        const shadingPath = `${TENANT_ID}/blank-templates/${SUPPLIER}/${blankId}/${view.toLowerCase()}-shading-${shortHash(shadingHash)}.png`;
        const maskPath = `${TENANT_ID}/blank-templates/${SUPPLIER}/${blankId}/${view.toLowerCase()}-mask-${shortHash(maskHash)}.png`;
        await uploadStored(shadingPath, shadingBuf, 'image/png');
        await uploadStored(maskPath, maskBuf, 'image/png');

        const note = {
          ingest_note: 'Shading + mask DERIVED from the light base photo. Printify does not publish the print-box position inside the mockup photo, so print_zone_x/y are NULL and the box position + px_per_inch (300 DPI convention) must be confirmed by a human in the blank workspace; verified stays false until then.',
          shading_derived: true,
          needs_human_check: true,
          printify_blueprint_id: blueprintId,
          printify_provider_id: providerId,
          placeholder_position: ph.position,
          px_per_inch_source: 'Printify print-file DPI convention (300); not measured',
        };
        const row = {
          canonical_product_id: blankId,
          view_angle: view,
          mockup_image_url: null, // NEVER a supplier URL as the live asset
          displacement_map_url: null,
          stored_base_path: basePath,
          stored_shading_path: shadingPath,
          stored_mask_path: maskPath,
          base_sha256: baseHash,
          shading_sha256: shadingHash,
          mask_sha256: maskHash,
          px_per_inch: PRINT_DPI,
          print_zone_x: null, // unknown from Printify — workspace confirms
          print_zone_y: null,
          print_zone_width: ph.width,
          print_zone_height: ph.height,
          physical_width_inches: Number((ph.width / PRINT_DPI).toFixed(2)),
          physical_height_inches: Number((ph.height / PRINT_DPI).toFixed(2)),
          source: SUPPLIER,
          verified: false, // only the blank-workspace box confirmation sets this
          is_active: true,
          hardware_modifiers: note,
        };
        if (existing?.id) {
          const { error } = await supabase.from('product_canvas_templates').update(row).eq('id', existing.id);
          if (error) throw new Error(`canvas update: ${error.message}`);
        } else {
          const { error } = await supabase.from('product_canvas_templates').insert(row);
          if (error) throw new Error(`canvas insert: ${error.message}`);
        }
        persisted++;
        console.log(`  persisted blank=${String(blankId).slice(0, 8)} ${view} blueprint=${blueprintId} base=${basePath} sha=${baseHash.slice(0, 12)}…`);
      }
      await sleep(500); // be polite to the Printify API
    } catch (err) {
      failed++;
      console.error(`  FAILED blueprint=${blueprintId} provider=${providerId} blank=${String(blankId).slice(0, 8)}: ${err.message}`);
    } finally {
      if (productId) {
        try {
          await printifyFetch(`/v1/shops/${shopId}/products/${productId}.json`, { method: 'DELETE' });
        } catch (err) {
          leakedProducts.push(productId);
          console.error(`  WARNING: throwaway product ${productId} could NOT be deleted: ${err.message} — clean up manually.`);
        }
      }
    }
  }

  console.log(`[printify-ingest] done persisted=${persisted} skippedExisting=${skippedExisting} failed=${failed} rateLimitHits=${rateLimitHits} leakedThrowawayProducts=${leakedProducts.length}`);
  if (leakedProducts.length > 0) console.log(`[printify-ingest] LEAKED product ids: ${leakedProducts.join(',')}`);
  process.exit(failed > 0 || leakedProducts.length > 0 ? 2 : 0);
}

main().catch((err) => { console.error('[printify-ingest] FATAL:', err.message); process.exit(2); });
