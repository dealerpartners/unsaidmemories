#!/usr/bin/env node
/**
 * Taxonomy recount — recomputes every static tree node's sidebar count
 * from REAL resolver membership and rewrites the counts in
 * src/lib/taxonomy.ts (build/taxonomy-completion, 2026-10-30).
 *
 * The Oct-29 stored counts were spec snapshots (e.g. Men/Women stored 0
 * while serving 655/324 products). This script replicates the catalog
 * resolver's membership semantics exactly:
 *
 *   membership(node) = primary products (the DB category sets that
 *     src/lib/static-catalog.ts resolves for the node, recursive over
 *     active categories, hidden products excluded)
 *     UNION secondary-link products attached to the node's static slug
 *     path or any descendant path (public.product_taxonomy_links).
 *
 * count = |membership|, deduplicated by product id. Duplicate sibling
 * rows that share one path receive the same count (they link to the
 * same page).
 *
 * The rewrite is surgical: the TypeScript AST is used to locate each
 * node's `count` numeric literal and only those literals are replaced —
 * formatting, order and comments are preserved.
 *
 * Usage: node scripts/recount-taxonomy.cjs [--dry-run]
 * Credentials are read at runtime from UNSAID_CREDS.md (never stored).
 */

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const TAXONOMY_FILE = path.join(REPO, "src/lib/taxonomy.ts");
const PROJECT_REF = "pcwwvfgxnrglmmpbfqhf";
const BREAKOUT_ROOTS = new Set(["Kids", "Men", "Women", "Apparel for Babies"]);

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

// ------------------------------------------------------------ tree load
function loadTree(ts) {
  const src = fs.readFileSync(TAXONOMY_FILE, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", out)(m, m.exports);
  return m.exports.taxonomy;
}

// ----------------------------------------------------------------- main
(async () => {
  const dryRun = process.argv.includes("--dry-run");
  const ts = require(path.join(REPO, "node_modules/typescript"));
  const token = loadMgmtToken();
  const tree = loadTree(ts);

  const cats = await mgmtQuery(
    token,
    "select id, name, parent_id from categories where is_active = true"
  );
  const products = await mgmtQuery(
    token,
    "select id, category_id from supplier_catalog_products where is_hidden = false"
  );
  const links = await mgmtQuery(
    token,
    "select path, product_id from public.product_taxonomy_links"
  );

  const byId = new Map(cats.map((c) => [c.id, c]));
  const children = new Map();
  for (const c of cats) {
    const k = c.parent_id ?? null;
    if (!children.has(k)) children.set(k, []);
    children.get(k).push(c);
  }
  const rootName = (cat) => {
    let cur = cat;
    const seen = new Set();
    while (cur.parent_id && byId.has(cur.parent_id) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parent_id);
    }
    return cur.name;
  };
  // Recursive product set per category id (memoized).
  const productsByCategory = new Map();
  for (const p of products) {
    if (!p.category_id) continue;
    if (!productsByCategory.has(p.category_id)) productsByCategory.set(p.category_id, []);
    productsByCategory.get(p.category_id).push(p.id);
  }
  const subtreeMemo = new Map();
  const subtreeProducts = (id) => {
    if (subtreeMemo.has(id)) return subtreeMemo.get(id);
    const set = new Set(productsByCategory.get(id) || []);
    for (const ch of children.get(id) || [])
      for (const pid of subtreeProducts(ch.id)) set.add(pid);
    subtreeMemo.set(id, set);
    return set;
  };
  const walkByNames = (names) => {
    let parent = null;
    let found = null;
    for (const name of names) {
      const cand = (children.get(parent) || []).filter((c) => c.name === name);
      if (!cand.length) return null;
      found = cand[0];
      parent = found.id;
    }
    return found;
  };

  // Resolver replication (must mirror src/lib/static-catalog.ts).
  function resolveIds(node, names) {
    const dept = names[0];
    const sameName = cats.filter(
      (c) => c.name === node.name && rootName(c) === dept
    );
    const unionChildren = () => {
      const ids = [];
      for (const child of node.children || [])
        ids.push(...resolveIds(child, [...names, child.name]));
      return [...new Set(ids)];
    };
    const inBreakout =
      dept === "Apparel" && names.length > 1 && BREAKOUT_ROOTS.has(names[1]);
    if (inBreakout) {
      const exact = walkByNames(names);
      if (exact) return [exact.id];
      if (sameName.length === 1) return [sameName[0].id];
      if ((node.children || []).length) return unionChildren();
      if (sameName.length > 1) return sameName.map((c) => c.id);
      return [];
    }
    if (sameName.length > 1) return sameName.map((c) => c.id);
    const exact = walkByNames(names);
    if (exact) return [exact.id];
    if (sameName.length === 1) return [sameName[0].id];
    if ((node.children || []).length) return unionChildren();
    return [];
  }

  // Links indexed by static path; a node's link set includes links on
  // descendant paths.
  const linksByPath = new Map();
  for (const l of links) {
    if (!linksByPath.has(l.path)) linksByPath.set(l.path, new Set());
    linksByPath.get(l.path).add(l.product_id);
  }

  // Walk the tree computing counts per node ROW.
  const rows = []; // { slugs, names, node, count }
  const walk = (nodes, slugPath, namePath) => {
    for (const node of nodes) {
      const sp = [...slugPath, node.slug];
      const np = [...namePath, node.name];
      const member = new Set();
      for (const id of resolveIds(node, np))
        for (const pid of subtreeProducts(id)) member.add(pid);
      const key = sp.join("/");
      for (const [lp, set] of linksByPath)
        if (lp === key || lp.startsWith(key + "/"))
          for (const pid of set) member.add(pid);
      rows.push({ slugs: sp, names: np, node, count: member.size });
      walk(node.children || [], sp, np);
    }
  };
  walk(tree, [], []);

  // ------------------------------------------------------- AST rewrite
  const src = fs.readFileSync(TAXONOMY_FILE, "utf8");
  const sf = ts.createSourceFile(TAXONOMY_FILE, src, ts.ScriptTarget.Latest, true);
  let taxonomyArray = null;
  const findDecl = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText() === "taxonomy" &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    )
      taxonomyArray = node.initializer;
    node.forEachChild(findDecl);
  };
  findDecl(sf);
  if (!taxonomyArray) throw new Error("taxonomy array not found");

  const edits = [];
  let rowIdx = 0;
  const applyToArray = (arr, nodesAtLevel) => {
    if (arr.elements.length !== nodesAtLevel.length)
      throw new Error("AST/tree length mismatch");
    arr.elements.forEach((el, i) => {
      if (!ts.isObjectLiteralExpression(el)) throw new Error("node not an object literal");
      const row = rows[rowIdx++];
      const props = new Map();
      for (const pr of el.properties)
        if (ts.isPropertyAssignment(pr)) props.set(pr.name.getText(), pr);
      const nameLit = props.get("name").initializer.getText().replace(/^"|"$/g, "");
      const slugLit = props.get("slug").initializer.getText().replace(/^"|"$/g, "");
      if (nameLit !== row.node.name || slugLit !== row.node.slug)
        throw new Error(`AST/tree mismatch at row ${rowIdx}: ${nameLit}/${slugLit} vs ${row.node.name}/${row.node.slug}`);
      const countInit = props.get("count").initializer;
      const oldVal = parseInt(countInit.getText(), 10);
      if (oldVal !== row.node.count)
        throw new Error(`stored count mismatch at ${row.slugs.join("/")}`);
      if (oldVal !== row.count)
        edits.push({
          start: countInit.getStart(),
          end: countInit.getEnd(),
          from: oldVal,
          to: row.count,
          path: row.slugs.join("/"),
        });
      const childProp = props.get("children");
      if (childProp && ts.isArrayLiteralExpression(childProp.initializer))
        applyToArray(childProp.initializer, row.node.children || []);
    });
  };
  applyToArray(taxonomyArray, tree);
  if (rowIdx !== rows.length) throw new Error("row count mismatch");

  console.log(`nodes: ${rows.length}; counts changed: ${edits.length}`);
  for (const e of edits) console.log(`  ${e.path}: ${e.from} -> ${e.to}`);

  if (!dryRun && edits.length) {
    let out = src;
    for (const e of [...edits].sort((a, b) => b.start - a.start))
      out = out.slice(0, e.start) + String(e.to) + out.slice(e.end);
    fs.writeFileSync(TAXONOMY_FILE, out);
    console.log("taxonomy.ts counts rewritten.");
  }
  const outFile = process.env.RECOUNT_OUT;
  if (outFile)
    fs.writeFileSync(
      outFile,
      JSON.stringify(Object.fromEntries(rows.map((r) => [r.slugs.join("/"), r.count])), null, 1)
    );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
