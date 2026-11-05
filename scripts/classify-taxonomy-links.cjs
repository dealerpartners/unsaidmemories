#!/usr/bin/env node
/**
 * Taxonomy completion classifier — secondary category assignment.
 *
 * Populates public.product_taxonomy_links (migration
 * 20261030080000_product_taxonomy_links.sql) for the DERIVED sidebar
 * children added by the taxonomy completion build (2026-10-30):
 *
 *   apparel/apparel-for-babies/*        (product types carved out of the
 *                                       23 products filed at "Apparel
 *                                       for Babies" by product name)
 *   business-and-commercial/*           (name families inside the single
 *                                       "Business & commercial" category)
 *   wall-art/framed-prints/*-framed-posters
 *                                       (frame material inside the
 *                                       "Framed prints" category)
 *
 * AAPAWZ pattern: a product keeps its single primary category_id (its
 * primary page) and gains is_primary = false links for each derived
 * node it genuinely matches. Nothing is moved; unmatched products stay
 * unlinked (they still appear on their primary page).
 *
 * Rules are explicit name-keyword sets, applied in order; a product
 * takes the FIRST rule it matches inside its group. Rule overlaps and
 * unmatched remainders are printed so they can be audited.
 *
 * Idempotent + re-runnable: for every managed path the script deletes
 * the existing links for that path and re-inserts from the live
 * catalog, so re-running after catalog changes converges to the same
 * state. Use --dry-run to print the plan without writing.
 *
 * Credentials are read at runtime from UNSAID_CREDS.md (never stored).
 * Usage: node scripts/classify-taxonomy-links.cjs [--dry-run]
 */

const fs = require("fs");
const path = require("path");

const TENANT_ID = "652fd2be-d19a-4778-835d-db38094d7718";
const PROJECT_REF = "pcwwvfgxnrglmmpbfqhf";

// ---------------------------------------------------------------- creds
function loadMgmtToken() {
  const file =
    process.env.UNSAID_CREDS ||
    path.join(process.env.HOME, "workspace/user/files/UNSAID_CREDS.md");
  const text = fs.readFileSync(file, "utf8");
  let section = null;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const sec = line.match(/^\*\*#\s*(.+?)\*\*$/);
    if (sec) {
      section = sec[1].trim().toUpperCase();
      continue;
    }
    const kv = line.match(/^([A-Za-z][A-Za-z0-9\\_ ]*?)=(.*)$/);
    if (kv && section === "SUPABASE") {
      const key = kv[1].replace(/\\_/g, "_").replace(/\s+/g, "_").toUpperCase();
      if (key === "ACCESS_TOKEN") return kv[2].trim().replace(/\\(.)/g, "$1");
    }
  }
  throw new Error("SUPABASE ACCESS_TOKEN not found in creds file");
}

async function mgmtQuery(token, sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const text = await res.text();
  if (!res.ok) throw new Error("mgmt " + res.status + ": " + text.slice(0, 300));
  return JSON.parse(text);
}

// ---------------------------------------------------------------- rules
// Each group: the DB category (by name path) whose DIRECT products are
// classified, an ordered rule list (first match wins), and an optional
// remainder target (null = leave unmatched products unlinked).
const GROUPS = [
  {
    label: "Apparel for Babies product types",
    categoryNames: ["Apparel", "Apparel for Babies"],
    rules: [
      {
        path: "apparel/apparel-for-babies/baby-beanies-and-hats",
        rule: "babies-beanie-or-hat",
        match: (n) => /beanie|hat/i.test(n),
      },
      {
        path: "apparel/apparel-for-babies/bibs-and-feeding",
        rule: "babies-bib-burp-nursing",
        match: (n) => /bib|burp|nursing/i.test(n),
      },
      {
        path: "apparel/apparel-for-babies/bodysuits-and-one-pieces",
        rule: "babies-bodysuit-onesie-one-piece",
        match: (n) => /bodysuit|onesie|one piece/i.test(n),
      },
    ],
    remainder: {
      path: "apparel/apparel-for-babies/dresses-blankets-and-toddler",
      rule: "babies-remainder",
    },
  },
  {
    label: "Business & commercial families",
    categoryNames: ["Business & commercial"],
    rules: [
      {
        path: "business-and-commercial/cards",
        rule: "business-name-cards",
        match: (n) => /cards/i.test(n),
      },
      {
        path: "business-and-commercial/notebooks",
        rule: "business-name-notebooks",
        match: (n) => /notebooks/i.test(n),
      },
      {
        path: "business-and-commercial/posters",
        rule: "business-name-posters",
        match: (n) => /posters/i.test(n),
      },
      {
        path: "business-and-commercial/print-products",
        rule: "business-name-starts-print",
        match: (n) => /^print/i.test(n),
      },
    ],
    remainder: null, // expect zero unmatched; anything left is reported
  },
  {
    label: "Framed prints by frame material",
    categoryNames: ["Wall Art", "Framed prints"],
    rules: [
      {
        path: "wall-art/framed-prints/wood-framed-posters",
        rule: "framed-name-wood",
        match: (n) => /wood/i.test(n),
      },
      {
        path: "wall-art/framed-prints/aluminum-framed-posters",
        rule: "framed-name-aluminum",
        match: (n) => /aluminum/i.test(n),
      },
    ],
    remainder: null, // 18 non-"Framed Posters" products stay at the parent
  },
];

const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// ----------------------------------------------------------------- main
(async () => {
  const dryRun = process.argv.includes("--dry-run");
  const token = loadMgmtToken();

  const cats = await mgmtQuery(
    token,
    "select id, name, parent_id from categories"
  );
  const byId = new Map(cats.map((c) => [c.id, c]));
  const children = new Map();
  for (const c of cats) {
    if (!children.has(c.parent_id)) children.set(c.parent_id, []);
    children.get(c.parent_id).push(c);
  }
  const resolveCategory = (names) => {
    let level = children.get(null) || [];
    let found = null;
    for (const name of names) {
      found = level.find((c) => c.name === name) || null;
      if (!found) return null;
      level = children.get(found.id) || [];
    }
    return found;
  };

  const ledger = [];
  for (const group of GROUPS) {
    const cat = resolveCategory(group.categoryNames);
    if (!cat) throw new Error("category not found: " + group.categoryNames.join(" / "));
    const products = await mgmtQuery(
      token,
      `select id, name from supplier_catalog_products
       where category_id = ${sqlStr(cat.id)} and is_hidden = false
       order by name`
    );

    // First-match classification + overlap audit.
    const buckets = new Map(); // static path -> { rule, ids: [] }
    const overlaps = [];
    const unmatched = [];
    for (const p of products) {
      const hits = group.rules.filter((r) => r.match(p.name));
      if (hits.length > 1)
        overlaps.push({ name: p.name, rules: hits.map((h) => h.rule) });
      const target = hits[0] || group.remainder;
      if (!target) {
        unmatched.push(p.name);
        continue;
      }
      if (!buckets.has(target.path)) buckets.set(target.path, { rule: target.rule, ids: [] });
      buckets.get(target.path).ids.push(p.id);
    }

    // Managed paths = every rule path + remainder path (even when a run
    // produces zero links for one, stale links must be cleared).
    const managedPaths = [
      ...group.rules.map((r) => r.path),
      ...(group.remainder ? [group.remainder.path] : []),
    ];

    for (const p of managedPaths) {
      const bucket = buckets.get(p) || { rule: "—", ids: [] };
      ledger.push({
        group: group.label,
        path: p,
        rule: bucket.rule,
        links: bucket.ids.length,
        parentProducts: products.length,
      });
      if (dryRun) continue;
      await mgmtQuery(
        token,
        `delete from public.product_taxonomy_links where path = ${sqlStr(p)}`
      );
      const BATCH = 400;
      for (let i = 0; i < bucket.ids.length; i += BATCH) {
        const rows = bucket.ids
          .slice(i, i + BATCH)
          .map(
            (id) =>
              `(${sqlStr(TENANT_ID)}, ${sqlStr(p)}, ${sqlStr(id)}, false, ${sqlStr(bucket.rule)})`
          )
          .join(",\n");
        await mgmtQuery(
          token,
          `insert into public.product_taxonomy_links
             (tenant_id, path, product_id, is_primary, rule)
           values ${rows}
           on conflict (path, product_id) do nothing`
        );
      }
    }
    if (overlaps.length)
      console.log(`OVERLAPS in ${group.label}:`, JSON.stringify(overlaps));
    if (unmatched.length)
      console.log(
        `UNMATCHED in ${group.label} (${unmatched.length}, left at primary page only):`,
        unmatched.slice(0, 20).join(" | ")
      );
  }

  console.log("\nLEDGER" + (dryRun ? " (dry run)" : "") + ":");
  for (const row of ledger)
    console.log(
      `${row.path}  links=${row.links}  rule=${row.rule}  (parent pool ${row.parentProducts})`
    );
  const total = ledger.reduce((s, r) => s + r.links, 0);
  console.log(`TOTAL LINKS: ${total}`);

  if (!dryRun) {
    const verify = await mgmtQuery(
      token,
      `select path, count(*)::int as n from public.product_taxonomy_links
       group by path order by path`
    );
    console.log("\nDB STATE AFTER RUN:", JSON.stringify(verify));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
