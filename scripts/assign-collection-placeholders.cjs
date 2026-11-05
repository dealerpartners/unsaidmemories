#!/usr/bin/env node
/**
 * Collections placeholders + Hats resolution — secondary assignment.
 *
 * Owner rulings (2026-10-30):
 *   1. Collection / relationship pages are VIEWS over the same catalog.
 *      A collection page showing zero products is an assignment gap —
 *      the same tees, mugs and hats on the shop pages belong in them.
 *   2. Every collection page that renders ZERO gets TEMPORARY placeholder
 *      membership from the live supplier catalog until real designed
 *      products replace it. Placeholders are identifiable in the data:
 *      every placeholder row carries rule = 'placeholder-temp' and can be
 *      removed with one statement:
 *        delete from public.product_taxonomy_links
 *        where rule = 'placeholder-temp';
 *   3. The four folded "Hats" rows under Headwear get their own pages by
 *      their source identity (pre-re-parenting tree + DB categories:
 *      general / Kids / Men / Women — DB slugs hats-93, kids-hats,
 *      men-hats, women-hats). Kids membership is REAL (the 107 products
 *      filed in the DB kids-hats category; rule 'hats-source-category-
 *      kids', NOT a placeholder). Men/Women hold zero products in every
 *      source (DB categories empty; zero audience name matches in the
 *      1,576-product hats union) — their paths are managed with empty
 *      sets so the pages launch honestly empty, never faked.
 *
 * Membership is DATA ONLY (product_taxonomy_links rows) — the shop,
 * collections and relationships pages resolve it through the existing
 * cached static-path resolver; no render-path queries are added.
 *
 * Per zero leaf: 24 products = theme name-matches first (where the
 * catalog genuinely has any; capped at 12 so the grid stays a mix) +
 * a deterministic representative spread round-robin across core-type
 * buckets (tees, hoodies, mugs, hats, bags, cards, framed prints, art
 * prints), rotated per page so pages differ. Branch and department
 * paths receive the UNION of their descendant leaf sets (same rule), so
 * a branch page shows everything its collections hold — the way
 * category parents behave — and sidebar counts equal page totals.
 *
 * Idempotent + re-runnable: per managed path the script deletes only
 * ITS OWN rules' rows and re-inserts from the live catalog, converging
 * to the same state. Use --dry-run to print the plan without writing.
 *
 * Credentials are read at runtime from UNSAID_CREDS.md (never stored).
 * Usage: node scripts/assign-collection-placeholders.cjs [--dry-run]
 */

const fs = require("fs");
const path = require("path");

const TENANT_ID = "652fd2be-d19a-4778-835d-db38094d7718";
const PROJECT_REF = "pcwwvfgxnrglmmpbfqhf";
const PAGE_SIZE = 24;
const THEME_CAP = 12;
const PLACEHOLDER_RULE = "placeholder-temp";
const OWN_RULES = [
  PLACEHOLDER_RULE,
  "hats-source-category-kids",
  "hats-source-category-men",
  "hats-source-category-women",
];

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

const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// ------------------------------------------------------------- the plan
// Theme regexes are Postgres ~* patterns over product names, censused
// against the live catalog 2026-10-30 (counts in the ledger). null =
// no genuine name fit exists; the page is pure representative spread.
const BRANCHES = [
  {
    branchPath: "collections-and-occasions/collections",
    leaves: [
      { slug: "back-to-school", theme: "school" },
      { slug: "beachwear", theme: "beach|swimwear|\\mswim\\M" },
      { slug: "gifts", theme: "gift" },
      { slug: "grow-a-fashion-brand", theme: "fashion" },
      { slug: "halloween", theme: "halloween|spooky|pumpkin" },
      { slug: "holiday-season", theme: "christmas|\\mxmas\\M|holiday" },
      { slug: "made-in-eu", theme: null },
      { slug: "matching-sets", theme: "matching" },
      { slug: "new-apparel-variants", theme: null },
      { slug: "sportswear", theme: "sport|\\mgym\\M|fitness" },
      { slug: "streetwear", theme: "street|urban" },
      { slug: "style-trends", theme: "trend|fashion" },
    ],
  },
  {
    branchPath: "collections-and-occasions/relationships",
    leaves: [
      { slug: "caregiver", theme: "caregiver|nurse" },
      { slug: "chosen-family", theme: "\\mfamily\\M|friend" },
      { slug: "godparent", theme: "godparent|godmother|godfather" },
      { slug: "kin-keeper", theme: "\\mkin\\M" },
      { slug: "mentor", theme: "mentor|teacher" },
      { slug: "sister-friend", theme: "sister|friend" },
      { slug: "work-bestie", theme: "bestie|friend" },
    ],
  },
  {
    branchPath: "collections-and-occasions/unsaid-holidays",
    leaves: [
      { slug: "all-unsaid-holidays", theme: "christmas|\\mxmas\\M|holiday" },
      { slug: "day-ones", theme: "friend" },
      { slug: "family-by-choice", theme: "\\mfamily\\M|friend" },
      { slug: "just-because", theme: "heart|gift" },
      { slug: "kin-keeper-month", theme: "\\mkin\\M" },
    ],
  },
];
const DEPT_PATH = "collections-and-occasions";

// Spread buckets: core product types, each = the subtrees of every DB
// category carrying the name (or, for hats, the four source subtrees).
const BUCKETS = [
  { key: "tees", categoryNames: ["T-Shirts"] },
  { key: "hoodies", categoryNames: ["Hoodies"] },
  { key: "mugs", categoryNames: ["Mugs"] },
  { key: "hats", categorySlugs: ["hats-93", "kids-hats", "men-hats", "women-hats"] },
  { key: "bags", categoryNames: ["Bags", "Tote bags"] },
  { key: "cards", categoryNames: ["Cards"] },
  { key: "framed", categoryNames: ["Framed prints"] },
  { key: "artprints", categoryNames: ["Art prints"] },
];

// Hats pages by source identity (DB category slugs). kids carries real
// membership (products filed in that category); men/women are managed
// empty — zero products exist for them in any source.
const HATS_PAGES = [
  { path: "headwear/kids-hats", rule: "hats-source-category-kids", categorySlug: "kids-hats" },
  { path: "headwear/men-hats", rule: "hats-source-category-men", categorySlug: "men-hats" },
  { path: "headwear/women-hats", rule: "hats-source-category-women", categorySlug: "women-hats" },
];

function hashPath(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// ----------------------------------------------------------------- main
(async () => {
  const dryRun = process.argv.includes("--dry-run");
  const token = loadMgmtToken();

  // Category tree (for bucket subtrees + the hats source categories).
  const cats = await mgmtQuery(
    token,
    "select id, name, slug, parent_id from categories where is_active = true"
  );
  const children = new Map();
  for (const c of cats) {
    if (!children.has(c.parent_id)) children.set(c.parent_id, []);
    children.get(c.parent_id).push(c);
  }
  const subtreeIds = (rootId) => {
    const out = [];
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop();
      out.push(id);
      for (const ch of children.get(id) || []) stack.push(ch.id);
    }
    return out;
  };

  // Bucket product pools, ordered deterministically (newest first).
  const bucketPools = new Map(); // key -> [productId]
  for (const b of BUCKETS) {
    let roots = [];
    if (b.categorySlugs)
      roots = cats.filter((c) => b.categorySlugs.includes(c.slug));
    else roots = cats.filter((c) => b.categoryNames.includes(c.name));
    const ids = [...new Set(roots.flatMap((r) => subtreeIds(r.id)))];
    const rows = await mgmtQuery(
      token,
      `select id from supplier_catalog_products
       where is_hidden = false and category_id in (${ids.map(sqlStr).join(",")})
       order by created_at desc, id asc`
    );
    bucketPools.set(b.key, rows.map((r) => r.id));
    console.log(`bucket ${b.key}: ${rows.length} products`);
  }

  // Leaf sets: theme first (capped), then round-robin spread.
  const leafSets = new Map(); // path -> { ids, themeCount }
  for (const branch of BRANCHES) {
    for (const leaf of branch.leaves) {
      const p = `${branch.branchPath}/${leaf.slug}`;
      const chosen = [];
      const used = new Set();
      let themeCount = 0;
      if (leaf.theme) {
        const rows = await mgmtQuery(
          token,
          `select id from supplier_catalog_products
           where is_hidden = false and name ~* ${sqlStr(leaf.theme)}
           order by created_at desc, id asc limit ${THEME_CAP}`
        );
        for (const r of rows) {
          if (!used.has(r.id)) {
            used.add(r.id);
            chosen.push(r.id);
            themeCount++;
          }
        }
      }
      // Rotate each bucket by a per-page offset so pages differ.
      const offset = hashPath(p) % 300;
      const pools = BUCKETS.map((b) => {
        const pool = bucketPools.get(b.key);
        const rot = pool.length ? offset % pool.length : 0;
        return { list: [...pool.slice(rot), ...pool.slice(0, rot)], idx: 0 };
      });
      let progressed = true;
      while (chosen.length < PAGE_SIZE && progressed) {
        progressed = false;
        for (const pool of pools) {
          if (chosen.length >= PAGE_SIZE) break;
          while (pool.idx < pool.list.length && used.has(pool.list[pool.idx]))
            pool.idx++;
          if (pool.idx < pool.list.length) {
            const id = pool.list[pool.idx++];
            used.add(id);
            chosen.push(id);
            progressed = true;
          }
        }
      }
      leafSets.set(p, { ids: chosen, themeCount });
    }
  }

  // Rollups: branch = union of its leaves; department = union of all.
  const managed = new Map(); // path -> { rule, ids }
  for (const [p, s] of leafSets)
    managed.set(p, { rule: PLACEHOLDER_RULE, ids: s.ids });
  const deptUnion = new Set();
  for (const branch of BRANCHES) {
    const union = new Set();
    for (const leaf of branch.leaves)
      for (const id of leafSets.get(`${branch.branchPath}/${leaf.slug}`).ids) {
        union.add(id);
        deptUnion.add(id);
      }
    managed.set(branch.branchPath, {
      rule: PLACEHOLDER_RULE,
      ids: [...union],
    });
  }
  managed.set(DEPT_PATH, { rule: PLACEHOLDER_RULE, ids: [...deptUnion] });

  // Hats pages from DB provenance.
  for (const hp of HATS_PAGES) {
    const cat = cats.find((c) => c.slug === hp.categorySlug);
    if (!cat) throw new Error("hats category not found: " + hp.categorySlug);
    const rows = await mgmtQuery(
      token,
      `select id from supplier_catalog_products
       where is_hidden = false and category_id = ${sqlStr(cat.id)}
       order by created_at desc, id asc`
    );
    managed.set(hp.path, { rule: hp.rule, ids: rows.map((r) => r.id) });
  }

  // Write: per managed path, delete only this script's own rules, then
  // insert the fresh set. Idempotent by construction.
  const ruleList = OWN_RULES.map(sqlStr).join(",");
  for (const [p, s] of managed) {
    if (!dryRun) {
      await mgmtQuery(
        token,
        `delete from public.product_taxonomy_links
         where path = ${sqlStr(p)} and rule in (${ruleList})`
      );
      const BATCH = 400;
      for (let i = 0; i < s.ids.length; i += BATCH) {
        const rowsSql = s.ids
          .slice(i, i + BATCH)
          .map(
            (id) =>
              `(${sqlStr(TENANT_ID)}, ${sqlStr(p)}, ${sqlStr(id)}, false, ${sqlStr(s.rule)})`
          )
          .join(",\n");
        await mgmtQuery(
          token,
          `insert into public.product_taxonomy_links
             (tenant_id, path, product_id, is_primary, rule)
           values ${rowsSql}
           on conflict (path, product_id) do nothing`
        );
      }
    }
    const themeNote = leafSets.has(p)
      ? ` (theme ${leafSets.get(p).themeCount} + spread ${s.ids.length - leafSets.get(p).themeCount})`
      : "";
    console.log(`${p}  links=${s.ids.length}  rule=${s.rule}${themeNote}`);
  }
  const total = [...managed.values()].reduce((n, s) => n + s.ids.length, 0);
  console.log(`TOTAL LINKS MANAGED: ${total}` + (dryRun ? " (dry run)" : ""));

  if (!dryRun) {
    const verify = await mgmtQuery(
      token,
      `select path, rule, count(*)::int as n from public.product_taxonomy_links
       group by path, rule order by path`
    );
    console.log("\nDB STATE AFTER RUN:", JSON.stringify(verify));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
