#!/usr/bin/env node
/**
 * Lane 4 — Printful asset ingest (contract §4).
 *
 * For each Printful blank in `supplier_mockup_templates`, downloads the base
 * photo + print-area geometry, hashes them (sha256), stores them in OUR
 * storage (design-assets bucket), derives the shading layer + mask from the
 * light base photo, and writes the render contract to
 * `product_canvas_templates` with source='printful'.
 *
 * GATE: refuses to run unless the image-terms flag is recorded as allowed in
 * `platform_feature_flags` (flag_key 'image_terms_printful', enabled=true).
 * A missing or disabled flag exits 3 with a plain REFUSED message and
 * downloads nothing. Never set the flag from this script — recording image
 * terms is a business/legal decision, not an ingest step.
 *
 * RULES (contract §4, acceptance test 5):
 * - A supplier URL is NEVER the live asset. `mockup_image_url` /
 *   `displacement_map_url` are written NULL; the renderer reads only
 *   stored_base_path / stored_shading_path / stored_mask_path.
 * - verified=false on every ingested row. Only the blank-workspace box
 *   confirmation (Lane 5) sets verified=true. Ingest never does.
 * - The 158 published mockups are NOT touched by this script. It reads only
 *   supplier_mockup_templates + supplier_print_specs and writes only
 *   product_canvas_templates (+ render_state 'missing_assets'->'unverified'
 *   per §5 when every view of a blank has stored assets).
 * - Human-check note goes in the existing `hardware_modifiers` jsonb column.
 *   No new columns, no new tables.
 * - PostgREST caps at 1000 rows/request: all reads paginate with .range().
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/ingest-printful-templates.js [--dry-run] [--limit N] [--blank <uuid>]
 * Env: SUPABASE_URL (default https://pcwwvfgxnrglmmpbfqhf.supabase.co),
 *      SUPABASE_SERVICE_ROLE_KEY (required), read from .env.local / .env too.
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
const SUPPLIER = 'printful';
const FLAG_KEY = 'image_terms_printful';
const EXIT_REFUSED = 3;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = parseInt((args[args.indexOf('--limit') + 1] || '0'), 10) || 0;
const ONLY_BLANK = args[args.indexOf('--blank') + 1] || null;

/* ---------- env ---------- */
function loadDotEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch { /* file absent — fine */ }
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

/** GET with 429 backoff (max 3 retries). Returns a Buffer. */
async function download(url) {
  let delay = 2000;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'erp-pod-ingest/1.0' } });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status === 429 && attempt < 4) {
      rateLimitHits++;
      const retryAfter = parseInt(res.headers.get('retry-after') || '', 10);
      await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : delay);
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

/**
 * Derive the shading layer and the mask from a light base photo.
 * Shading: grayscale luminance, normalised — the multiply layer the renderer
 * uses to darken folds (contract §4 render steps).
 * Mask: garment silhouette — alpha channel when the photo has one, else
 * non-white pixels (luminance < 250). Both are DERIVED and flagged for a
 * human check in the row note; they are never treated as supplier truth.
 */
async function deriveShadingAndMask(baseBuf) {
  const img = sharp(baseBuf);
  const meta = await img.metadata();
  const shadingBuf = await sharp(baseBuf).greyscale().normalise().png().toBuffer();
  let maskBuf;
  if (meta.hasAlpha) {
    maskBuf = await sharp(baseBuf).extractChannel('alpha').threshold(10).png().toBuffer();
  } else {
    // White-background ghost: garment = any pixel darker than near-white.
    maskBuf = await sharp(baseBuf).greyscale().threshold(250).png().toBuffer();
  }
  return { shadingBuf, maskBuf, width: meta.width, height: meta.height };
}

/** Paginated read of a table query (PostgREST 1000-row cap). */
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
const VIEW_BY_TAG = {
  front: 'FRONT',
  back: 'BACK',
  sleeve_left: 'LEFT_SIDE',
  sleeve_right: 'RIGHT_SIDE',
  // 'default' is Printful's catch-all placement (mugs, all-over). The
  // mockup style name disambiguates it when present; otherwise FRONT.
  default: 'FRONT',
};
const VIEW_BY_STYLE_NAME = {
  'front view': 'FRONT',
  'back view': 'BACK',
  'handle on right': 'RIGHT_SIDE',
  'handle on left': 'LEFT_SIDE',
  'left view': 'LEFT_SIDE',
  'right view': 'RIGHT_SIDE',
};

function viewForTemplate(t) {
  const styles = t.raw_payload?.mockup_styles;
  if (Array.isArray(styles)) {
    for (const s of styles) {
      const v = VIEW_BY_STYLE_NAME[String(s.view_name || '').toLowerCase()];
      if (v) return { view: v, via: `mockup_style:${s.view_name}` };
    }
  }
  const view = VIEW_BY_TAG[t.placement_tag];
  return view ? { view, via: `placement_tag:${t.placement_tag}` } : null;
}

/** "12x16in@150" -> { wIn: 12, hIn: 16, dpi: 150 } */
function parseSizeTag(sizeTag) {
  const m = String(sizeTag || '').match(/([\d.]+)x([\d.]+)in@(\d+)/);
  return m ? { wIn: parseFloat(m[1]), hIn: parseFloat(m[2]), dpi: parseInt(m[3], 10) } : null;
}

/* ---------- main ---------- */
async function main() {
  console.log(`[printful-ingest] supplier=${SUPPLIER} dryRun=${DRY_RUN}`);

  // 1. THE GATE — checked before any download, storage write, or row write.
  const { data: flag, error: flagErr } = await supabase
    .from('platform_feature_flags')
    .select('flag_key,enabled,description')
    .eq('flag_key', FLAG_KEY)
    .maybeSingle();
  if (flagErr) throw new Error(`flag read: ${flagErr.message}`);
  if (!flag || flag.enabled !== true) {
    console.log(
      `[printful-ingest] REFUSED: image-terms flag '${FLAG_KEY}' is `
      + `${flag ? 'disabled' : 'NOT SET'} in platform_feature_flags. `
      + 'Printful images may not be copied into our storage until the image '
      + 'terms are recorded as allowed. Nothing downloaded, nothing written.',
    );
    process.exit(EXIT_REFUSED);
  }
  console.log(`[printful-ingest] flag '${FLAG_KEY}' enabled — proceeding.`);

  // 2. Read the harvest rows (90 Printful templates) + print specs.
  const templates = await fetchAll('supplier_mockup_templates', (q) =>
    q.eq('supplier_name', SUPPLIER).order('canonical_product_id').order('placement_tag'));
  const specs = await fetchAll('supplier_print_specs', (q) =>
    q.eq('supplier_name', SUPPLIER));
  const specsByBlankTag = new Map();
  for (const s of specs) specsByBlankTag.set(`${s.canonical_product_id}|${s.placement_tag}`, s);
  console.log(`[printful-ingest] harvest rows=${templates.length} spec rows=${specs.length}`);

  // 3. Dedupe to one template per (blank, view). Prefer an exact placement
  //    tag ('front') over the catch-all ('default'); prefer a light
  //    white-background ghost as the base photo.
  const chosen = new Map(); // key blank|view -> { template, viewVia }
  for (const t of templates) {
    if (ONLY_BLANK && t.canonical_product_id !== ONLY_BLANK) continue;
    const mapped = viewForTemplate(t);
    if (!mapped) { console.log(`  skip: unmapped placement_tag '${t.placement_tag}' row ${t.id}`); continue; }
    const key = `${t.canonical_product_id}|${mapped.view}`;
    const prev = chosen.get(key);
    const score = (row) =>
      // Prefer an exact placement tag ('front') over the catch-all ('default'),
      // and prefer a light white-background ghost as the base photo.
      (row.placement_tag !== 'default' ? 1 : 0)
      + (/whitebg|ghost/i.test(row.image_url || '') ? 1 : 0);
    if (!prev || score(t) > score(prev.template)) chosen.set(key, { template: t, viewVia: mapped.via });
  }
  const jobs = [...chosen.entries()].map(([key, v]) => {
    const [blankId, view] = key.split('|');
    return { blankId, view, ...v };
  });
  if (LIMIT > 0) jobs.splice(LIMIT);
  console.log(`[printful-ingest] distinct blank/view jobs=${jobs.length} (from ${templates.length} harvest rows)`);

  // 4. Per job: download base, hash, store, derive shading+mask, store, write row.
  let persisted = 0;
  let skippedExisting = 0;
  let failed = 0;
  const perBlankViews = new Map(); // blankId -> Set(view) stored this run + pre-existing
  for (const job of jobs) {
    const { blankId, view, template, viewVia } = job;
    try {
      // Skip if this blank/view already has a stored row (idempotent re-run).
      const { data: existing } = await supabase
        .from('product_canvas_templates')
        .select('id,stored_base_path,base_sha256')
        .eq('canonical_product_id', blankId)
        .eq('view_angle', view)
        .eq('is_active', true)
        .maybeSingle();
      if (existing?.stored_base_path && existing?.base_sha256) {
        skippedExisting++;
        (perBlankViews.get(blankId) ?? perBlankViews.set(blankId, new Set()).get(blankId)).add(view);
        continue;
      }

      const spec = specsByBlankTag.get(`${blankId}|${template.placement_tag}`)
        || specsByBlankTag.get(`${blankId}|front`)
        || null;
      const size = spec ? parseSizeTag(spec.size_tag) : null;
      // px_per_inch = template print-area px / print-area inches (spec).
      const pxPerInch = size && spec
        ? Number((template.print_area_width / size.wIn).toFixed(4))
        : null;

      if (DRY_RUN) {
        console.log(`  [dry-run] ${blankId.slice(0, 8)} ${view} via=${viewVia} box=${template.print_area_left},${template.print_area_top} ${template.print_area_width}x${template.print_area_height} pxPerInch=${pxPerInch}`);
        continue;
      }

      const baseBuf = await download(template.image_url);
      const baseHash = sha256(baseBuf);
      const contentType = /png/i.test(template.image_url) ? 'image/png' : 'image/jpeg';
      const ext = contentType === 'image/png' ? 'png' : 'jpg';
      const basePath = `${TENANT_ID}/blank-templates/${SUPPLIER}/${blankId}/${view.toLowerCase()}-${shortHash(baseHash)}.${ext}`;
      await uploadStored(basePath, baseBuf, contentType);

      const { shadingBuf, maskBuf } = await deriveShadingAndMask(baseBuf);
      const shadingHash = sha256(shadingBuf);
      const maskHash = sha256(maskBuf);
      const shadingPath = `${TENANT_ID}/blank-templates/${SUPPLIER}/${blankId}/${view.toLowerCase()}-shading-${shortHash(shadingHash)}.png`;
      const maskPath = `${TENANT_ID}/blank-templates/${SUPPLIER}/${blankId}/${view.toLowerCase()}-mask-${shortHash(maskHash)}.png`;
      await uploadStored(shadingPath, shadingBuf, 'image/png');
      await uploadStored(maskPath, maskBuf, 'image/png');

      const note = {
        ingest_note: 'Shading + mask DERIVED from the light base photo (grayscale luminance / non-white silhouette). Flagged for human check in the blank workspace; verified stays false until the box is confirmed there.',
        shading_derived: true,
        needs_human_check: true,
        source_template_id: template.id,
        view_mapped_via: viewVia,
        px_per_inch_source: spec ? `supplier_print_specs size_tag ${spec.size_tag}` : 'unknown — no print spec row; px_per_inch left null for human confirmation',
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
        px_per_inch: pxPerInch,
        print_zone_x: template.print_area_left,
        print_zone_y: template.print_area_top,
        print_zone_width: template.print_area_width,
        print_zone_height: template.print_area_height,
        physical_width_inches: size ? size.wIn : null,
        physical_height_inches: size ? size.hIn : null,
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
      (perBlankViews.get(blankId) ?? perBlankViews.set(blankId, new Set()).get(blankId)).add(view);
      persisted++;
      console.log(`  persisted ${blankId.slice(0, 8)} ${view} base=${basePath} sha=${baseHash.slice(0, 12)}… px/in=${pxPerInch}`);
      await sleep(150); // be polite to the Printful CDN
    } catch (err) {
      failed++;
      console.error(`  FAILED ${job.blankId.slice(0, 8)} ${job.view}: ${err.message}`);
    }
  }

  // 5. Render-state transition (§5): all views stored -> 'unverified'.
  if (!DRY_RUN) {
    for (const [blankId, views] of perBlankViews) {
      const { data: all } = await supabase
        .from('product_canvas_templates')
        .select('view_angle,stored_base_path')
        .eq('canonical_product_id', blankId)
        .eq('is_active', true)
        .eq('source', SUPPLIER);
      const stored = (all ?? []).filter((r) => r.stored_base_path).map((r) => r.view_angle);
      const { data: product } = await supabase
        .from('canonical_products')
        .select('id,render_state')
        .eq('id', blankId)
        .maybeSingle();
      if (product?.render_state === 'missing_assets' && stored.length > 0) {
        // Only flip when every harvested view for this blank is stored.
        const harvestedViews = new Set(
          templates.filter((t) => t.canonical_product_id === blankId)
            .map((t) => viewForTemplate(t)?.view).filter(Boolean),
        );
        if ([...harvestedViews].every((v) => stored.includes(v))) {
          await supabase.from('canonical_products').update({ render_state: 'unverified' }).eq('id', blankId);
          console.log(`  render_state ${blankId.slice(0, 8)}: missing_assets -> unverified`);
        }
      }
    }
  }

  console.log(`[printful-ingest] done persisted=${persisted} skippedExisting=${skippedExisting} failed=${failed} rateLimitHits=${rateLimitHits} dryRun=${DRY_RUN}`);
  process.exit(failed > 0 ? 2 : 0);
}

main().catch((err) => { console.error('[printful-ingest] FATAL:', err.message); process.exit(2); });
