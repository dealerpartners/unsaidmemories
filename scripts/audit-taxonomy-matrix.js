/**
 * 19k SKU Taxonomy Configuration Audit — adapted to the Unsaid schema.
 *
 * Scans supplier_product_mappings in chunks and validates the Rule C
 * routing integrity of every row: known supplier, non-empty supplier
 * SKU, and the per-supplier print_job_config requirements (Gelato
 * print_area_id, Prodigi print_area_id, Printful catalog_variant_id).
 * Also reports canvas-template registration (product_canvas_templates)
 * and overall mapping coverage vs the staged supplier catalog.
 *
 * Run: node scripts/audit-taxonomy-matrix.js   (reads UNSAID creds via
 * the repo tools parser — no secrets in this file.)
 */
let credsMod;
try { credsMod = require("../../tools/creds.js"); }
catch { credsMod = require("../tools/creds.js"); }
const { loadCreds, mgmtQuery } = credsMod;

async function main() {
  const creds = loadCreds();
  const q = (sql) => mgmtQuery(creds, sql);
  console.log("🔍 Initializing validation scan across the product taxonomy catalog...");
  const start = Date.now();

  const rows = await q(`
    select m.id, s.slug as supplier, m.supplier_sku, m.product_sku, m.print_job_config,
           (select count(*) from public.product_canvas_templates t where t.product_mapping_id = m.id) as templates
    from public.supplier_product_mappings m
    join public.suppliers s on s.id = m.supplier_id
    order by m.created_at;
  `);

  const KNOWN = ["gelato", "prodigi", "printful", "gooten", "teemill", "spreadconnect"];
  let violations = 0;
  const issues = [];
  for (const entry of rows) {
    const anomalies = [];
    if (!KNOWN.includes(entry.supplier)) anomalies.push(`Unrecognized supplier slug: [${entry.supplier}]`);
    if (!entry.supplier_sku || String(entry.supplier_sku).trim() === "") anomalies.push("Supplier SKU is empty.");
    const config = entry.print_job_config || {};
    if (entry.supplier === "printful" && !config.catalog_variant_id) anomalies.push("Missing Printful requirement: catalog_variant_id.");
    if (entry.supplier === "gelato" && !config.print_area_id) anomalies.push("Missing Gelato requirement: print_area_id.");
    if (entry.supplier === "prodigi" && !config.print_area_id) anomalies.push("Missing Prodigi requirement: print_area_id.");
    if (anomalies.length) {
      violations++;
      issues.push({ sku: entry.product_sku, supplier: entry.supplier, errors: anomalies });
    }
  }

  const [catalog] = await q(`select count(*) n from public.supplier_catalog_products;`);
  const [variants] = await q(`select count(*) n from public.supplier_catalog_variants;`);
  const [tmpl] = await q(`select count(*) n from public.product_canvas_templates where is_active;`);
  const secs = ((Date.now() - start) / 1000).toFixed(2);

  console.log(`\n🏁 Data validation sweep finished in ${secs}s.`);
  console.log(`Mappings evaluated: ${rows.length} | Integrity breaches: ${violations}`);
  console.log(`Canvas template rows (registry): ${tmpl.n}`);
  console.log(`Catalog context: ${catalog.n} staged supplier products / ${variants.n} variants.`);
  console.log("Note: Rule C mappings are created at design publish (one per published variant) by design —");
  console.log("coverage tracks published designs, while this audit validates the integrity of what exists.");
  if (violations) {
    console.warn("\n🚨 Anomalies:");
    console.table(issues.slice(0, 50));
    process.exitCode = 1;
  } else {
    console.log("🟢 Success: All mapped configurations match routing requirements.");
  }
}

main().catch((e) => { console.error("🔴 Audit execution failed:", e.message); process.exit(1); });
