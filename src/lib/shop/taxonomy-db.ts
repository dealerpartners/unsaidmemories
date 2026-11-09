// ---------------------------------------------------------------------------
// taxonomy-db — LIVE Supabase taxonomy for the shop route system.
//
// The single source of truth for /shop/<animal>/<group>/<subcategory> is the
// `taxonomy_nodes` table (feed-sync maintains it from the supplier feeds).
// This module replaces the hand-mirrored static tree in shop-nav.ts for all
// SERVER resolution: route matching, landing-page children, product scoping
// and PLP facets. The static mirror stays only for client islands (mega
// menu / flyout) and is regenerated from this data by scripts/gen-shop-nav.ts.
//
// Association model (verified against live data Oct 2026):
//   - commerce_catalog_items.metadata.taxonomy_node_ids — the item's
//     node set, materialized into commerce_catalog_item_taxonomy
//     (trigger-maintained) for the per-node counts below.
// The feed-era catalog tables (`products`, `product_variants`,
// `product_media`, `product_nodes`) were dropped in the migration to
// the commerce catalog; nothing in this module may query them.
//
// All queries go through pgQuery (session pooler). Tree + counts are cached
// in-process with a TTL so a burst of page views costs one round trip.
// ---------------------------------------------------------------------------

import { canonicalGroups } from "./nav-groups"
import { pgQuery, pgQueryStrict } from "@/lib/pg"
import { cached, invalidate } from "@/lib/cache"
import { unstable_cache } from "next/cache"
import { SHOP_NAV_TAXONOMY } from "@/lib/shop-nav"
import {
  queryEnterpriseTaxProducts,
  queryEnterpriseFacetRows,
  DEFAULT_TENANT,
} from "@/lib/enterprise/catalog"
import { loadSoldByForItems } from "@/lib/sellers/sold-by"
import {
  soldByAttribution,
  type SoldByAttribution,
} from "@/lib/shop/types"

// FACET/Grid TTLs — these reads hit the REMOTE Supabase over the pooler, so
// every uncached view costs a network round trip. Facet definitions and
// counts change only when the owner edits the taxonomy or a feed sync lands,
// so they cache 5 min; PLP grids (scope + filters + page) cache 60 s — long
// enough that a shopper paging through a category pays the query once, short
// enough that stock/price edits land within a minute. Feed-sync / admin
// product writes call invalidateTaxonomyCache().
const FACET_TTL_MS = 5 * 60 * 1000
const GRID_TTL_MS = 60 * 1000

export function invalidateTaxonomyCache(): void {
  invalidate("tax:")
}

// ----------------------------- Types ---------------------------------------

export type TaxNodeRow = {
  id: string
  parentId: string | null
  nodeType: string
  name: string
  displayName: string
  slug: string
  depth: number
  sortOrder: number
}

export type TaxL4 = {
  id: string
  slug: string
  name: string
  productCount: number
  heroImageUrl: string | null
}

export type TaxSub = {
  id: string
  slug: string
  name: string
  /** Live product count for this node's whole subtree. */
  productCount: number
  hasChildren: boolean
  /** Selection-function hero (category-imagery pipeline); null until run. */
  heroImageUrl: string | null
  /** L4 sub-subcategories. */
  children: TaxL4[]
}

export type TaxGroup = {
  id: string
  slug: string
  name: string
  nodeType: string
  subcategories: TaxSub[]
  productCount: number
  heroImageUrl: string | null
}

export type TaxAnimal = {
  id: string
  slug: string
  name: string
  groups: TaxGroup[]
  productCount: number
}

// ----------------------------- Tree ----------------------------------------

type NodeRec = TaxNodeRow & { productCount: number; childCount: number; heroImageUrl: string | null; children: NodeRec[] }

const TREE_TTL_MS = 5 * 60 * 1000
let treeCacheAt = 0
let treeCache: TaxAnimal[] | null = null

// ---------------------------------------------------------------------------
// ENTERPRISE per-node product counts — served from the MATERIALIZED
// membership table commerce_catalog_item_taxonomy (owner directive
// 2026-10-21: materialize the taxonomy membership into a real indexed
// table). The table is TRIGGER-MAINTAINED from
// commerce_catalog_items.metadata.taxonomy_node_ids for exactly the
// qualifying set this count has always used (active + sellable +
// ecommerce_enabled + slug present), so it cannot diverge the way the
// pipeline-written product_taxonomy_nodes link table did. The Oct 16
// warning against swapping sources stood until both proofs were run —
// they now have been (2026-10-21, live DB): pair equality 15,236 table
// pairs = 15,236 metadata pairs across 196 nodes; EXPLAIN ANALYZE
// 22 ms vs 259 ms warm for the fan-out, which degraded to ~14 s means
// under load per pg_stat_statements. Cached in the SHARED Next data
// cache so one execution serves every instance.
// ---------------------------------------------------------------------------
const fetchNodeCountsShared = unstable_cache(
  async (tenant: string): Promise<[string, number][]> => {
    const rows = await pgQueryStrict<{ node_id: string; n: number }>(
      `SELECT node_id, COUNT(*)::int AS n
         FROM public.commerce_catalog_item_taxonomy
        WHERE tenant_id = $1::uuid
        GROUP BY node_id`,
      [tenant],
    )
    return rows.map((r) => [r.node_id, Number(r.n) || 0] as [string, number])
  },
  ["ent-node-counts-v2"],
  { revalidate: 3600, tags: ["catalog", "node-counts"] },
)

async function enterpriseNodeCounts(): Promise<Map<string, number>> {
  try {
    return new Map(await fetchNodeCountsShared(DEFAULT_TENANT()))
  } catch {
    // DB unreachable: degrade THIS render to no counts instead of letting
    // the strict throw kill the page (or, at build time, the whole static
    // build — Oct 21). Rejections are never cached, so nothing is
    // poisoned: the next render retries the real query.
    return new Map<string, number>()
  }
}

// Count for ONE node (directly attached items), enterprise source, cached.
async function entNodeProductCount(nodeId: string): Promise<number> {
  const counts = await enterpriseNodeCounts()
  return counts.get(nodeId) ?? 0
}

type TaxNodeDbRow = {
  id: string; parent_id: string | null; node_type: string; name: string;
  display_name: string | null; slug: string; depth: number; sort_order: number;
  hero_image_url: string | null;
}

async function fetchTree(): Promise<TaxAnimal[]> {
  const nodeRows = await pgQueryStrict<TaxNodeDbRow>(
    `SELECT id, parent_id, node_type, name, display_name, slug, depth, sort_order, hero_image_url
       FROM taxonomy_nodes
      WHERE status = 'published'
      ORDER BY sort_order, name`,
  )

  // Live per-node product counts — ENTERPRISE source (commerce_catalog_items;
  // the bare `products` table was dropped, so any query against it returns
  // nothing and every count would render as zero).
  const countByNode = await enterpriseNodeCounts()

  return shapeTree(nodeRows, countByNode)
}

function shapeTree(nodeRows: TaxNodeDbRow[], countByNode: Map<string, number>): TaxAnimal[] {
  const byId = new Map<string, NodeRec>()
  for (const r of nodeRows) {
    byId.set(r.id, {
      id: r.id,
      parentId: r.parent_id,
      nodeType: r.node_type,
      name: r.name,
      displayName: r.display_name || r.name,
      slug: r.slug,
      depth: r.depth,
      sortOrder: r.sort_order,
      productCount: countByNode.get(r.id) ?? 0,
      childCount: 0,
      heroImageUrl: r.hero_image_url,
      children: [],
    })
  }
  const roots: NodeRec[] = []
  for (const n of byId.values()) {
    if (n.parentId && byId.has(n.parentId)) {
      byId.get(n.parentId)!.children.push(n)
      byId.get(n.parentId)!.childCount++
    } else {
      roots.push(n)
    }
  }

  // Rollup subtree counts bottom-up.
  const rollup = (n: NodeRec): number => {
    let total = n.productCount
    for (const c of n.children) total += rollup(c)
    n.productCount = total
    return total
  }
  for (const r of roots) rollup(r)

  // Animals = depth-1 nodes. Groups = depth-2 children. Subs = depth-3
  // children. L4 = depth-4 children (sub-subcategories).
  const animals: TaxAnimal[] = []
  for (const a of roots.filter((n) => n.depth === 1)) {
    const groups: TaxGroup[] = a.children.map((g) => ({
      id: g.id,
      slug: g.slug,
      name: g.displayName,
      nodeType: g.nodeType,
      productCount: g.productCount,
      heroImageUrl: g.heroImageUrl,
      subcategories: g.children.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.displayName,
        productCount: s.productCount,
        hasChildren: s.children.length > 0,
        heroImageUrl: s.heroImageUrl,
        children: s.children.map((l4) => ({
          id: l4.id,
          slug: l4.slug,
          name: l4.displayName,
          productCount: l4.productCount,
          heroImageUrl: l4.heroImageUrl,
        })),
      })),
    }))
    animals.push({
      id: a.id,
      slug: a.slug,
      name: a.displayName,
      groups,
      productCount: a.productCount,
    })
  }
  return animals
}

/**
 * Collapse twin departments into ONE card per aisle for the animal landing
 * bento. The feed seeded the same concept twice under dog/cat (supplier-tree
 * node + curated seed), so the raw group list renders "Toys" AND "Dog Toys"
 * as two tiles with the same photo. Aisle identity = GROUP_ALIASES /
 * ANIMAL_GROUP_ALIASES canonical target + DEPT_TWINS edges; the
 * product-rich twin represents the aisle (both routes resolve to the same
 * unioned scope, so the choice only affects the label/href).
 */
export function dedupeAisleGroups(animal: TaxAnimal): TaxGroup[] {
  if (animal.groups.length <= 1) return animal.groups
  const bySlug = new Map(animal.groups.map((g) => [g.slug, g]))
  const canonicalOf = (slug: string): string =>
    ANIMAL_GROUP_ALIASES[`${animal.slug}/${slug}`] || GROUP_ALIASES[slug] || slug

  // Union-find over twin edges.
  const parent = new Map<string, string>()
  for (const g of animal.groups) parent.set(g.slug, g.slug)
  const find = (s: string): string => {
    let r = s
    while ((parent.get(r) ?? r) !== r) r = parent.get(r)!
    // path compress
    let c = s
    while (c !== r) {
      const next = parent.get(c) ?? r
      parent.set(c, r)
      c = next
    }
    return r
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  for (const g of animal.groups) {
    const canonical = canonicalOf(g.slug)
    if (canonical !== g.slug && bySlug.has(canonical)) union(g.slug, canonical)
    for (const t of DEPT_TWINS[`${animal.slug}/${canonical}`] ?? []) {
      if (bySlug.has(t)) union(g.slug, t)
    }
  }

  // Best representative per aisle: most products; tie → shorter (curated) slug.
  const best = new Map<string, TaxGroup>()
  for (const g of animal.groups) {
    const root = find(g.slug)
    const cur = best.get(root)
    if (!cur || g.productCount > cur.productCount || (g.productCount === cur.productCount && g.slug.length < cur.slug.length)) {
      best.set(root, g)
    }
  }

  // Preserve original order, emit one tile per aisle (its representative).
  const emitted = new Set<string>()
  const out: TaxGroup[] = []
  for (const g of animal.groups) {
    const root = find(g.slug)
    if (emitted.has(root)) continue
    emitted.add(root)
    out.push(best.get(root)!)
  }
  return out
}

/**
 * Canonical LIVE department slug for a raw/static slug (resolves the static
 * nav slugs and archived curated seeds to the live taxonomy_nodes slug the
 * routes and image maps key on). Unknown slugs pass through unchanged.
 */
export function canonicalDeptSlug(animalSlug: string, groupSlug: string): string {
  return ANIMAL_GROUP_ALIASES[`${animalSlug}/${groupSlug}`] || GROUP_ALIASES[groupSlug] || groupSlug
}

const fetchTreeShared = unstable_cache(
  async (): Promise<TaxAnimal[]> => fetchTree(),
  ["taxonomy-tree-v2"],
  { revalidate: 3600, tags: ["catalog", "taxonomy-tree"] },
)

/** Live taxonomy tree, SHARED Next data cache (one execution serves
 *  every instance); the per-process copy remains only as a last-good
 *  fallback for DB blips. */
export async function getTaxonomyTree(): Promise<TaxAnimal[]> {
  let tree: TaxAnimal[]
  try {
    tree = await fetchTreeShared()
  } catch (e) {
    // Serve the last good tree on a DB blip; with none, fail loudly.
    if (treeCache) return treeCache
    throw e
  }
  if (tree.length > 0) {
    treeCache = tree
    treeCacheAt = Date.now()
  }
  return treeCache ?? tree
}

// ----------------------------- Resolver ------------------------------------

/** Legacy static-tree slugs → live taxonomy_nodes canonical paths. */
const ANIMAL_ALIASES: Record<string, string> = {
  "small-pet": "small-animal",
  "fish-aquatics": "fish",
}
const GROUP_ALIASES: Record<string, string> = {
  // dog
  "grooming-bathing": "grooming",
  "treats-chews": "treats",
  "crates-containment": "travel-crates",
  "apparel-accessories": "clothes-accessories",
  "cleaning-potty-supplies": "cleanup-potty",
  "collars-harnesses-leashes": "collars-leashes-harnesses",
  "training-behavior-supplies": "training-behavior",
  // cat
  "bowls-feeders": "bowls-feeding",
  "litter-litter-boxes-accessories": "litter",
  "flea-tick-solutions-for-cats": "flea-tick",
  "cleaners-waste-disposal": "cleanup-potty",
  "flea-tick-solutions-for-dogs": "flea-tick",
}

/**
 * LEGACY SUB-ALIASES — subcategory slugs that no longer exist anywhere in
 * the live feed tree (renamed or merged into a combined aisle). Keyed by
 * "animal/rawGroup/rawSub" (the RAW requested segments, before any
 * department aliasing); the value is the LIVE sub slug to land on. Every
 * target was verified against taxonomy_nodes with its product count before
 * being mapped. Resolution walks the whole animal tree for the target and
 * 308s to its true home, so old links follow the products.
 */
const LEGACY_SUB_ALIASES: Record<string, string> = {
  // Legacy "Wellness" department (old numeric tree) — concepts merged.
  "dog/wellness/digestive-remedies": "probiotics-for-dogs",
  "dog/wellness/dna-tests": "dog-dna-tests-test-kits",
  "dog/wellness/ear-care": "dog-ear-eye-care-2",
  "dog/wellness/eye-care": "dog-ear-eye-care-2",
  "dog/wellness/hip-joint-care": "hip-joint-supplements-for-dog",
  "dog/wellness/itch-remedies": "dog-allergy-medicine-itch-relief",
  "dog/wellness/supplements-vitamins": "dog-vitamins-supplements",
  // Legacy "Travel" department (old numeric tree).
  "dog/travel/backpack-carriers": "travel-gear-carriers",
  "dog/travel/bicycle-carriers": "travel-gear-carriers",
  "dog/travel/bicycle-trailers": "travel-gear-carriers",
  "dog/travel/car-travel-accessories": "car-accessories",
  "dog/travel/carriers": "travel-gear-carriers",
  "dog/travel/purses": "travel-gear-carriers",
  "dog/travel/slings": "travel-gear-carriers",
  "dog/travel/strollers": "travel-gear-carriers",
  // Legacy "Treats" children (biscuits/cookies/snacks merged into one aisle).
  "dog/treats/biscuits": "dog-biscuits-cookies-snacks",
  "dog/treats/cookies": "dog-biscuits-cookies-snacks",
  "dog/treats/snacks": "dog-biscuits-cookies-snacks",
  // Stale static-nav sub slugs whose live twin sits in a sibling aisle.
  "dog/clothes-accessories/dog-coats-jackets": "coats-jackets",
  "dog/training-behavior-supplies/dog-harnesses-leashes-for-pulling": "dog-harnesses",
  // Old static-nav sub slugs (pre-alignment) — renamed in place, old URLs
  // follow the renamed aisle instead of 404ing.
  "dog/health-wellness/dog-calming-aids-supplements": "dog-calming-aids-and-supplements",
  "dog/outdoor-travel-gear/dog-car-accessories": "car-accessories",
  "dog/outdoor-travel-gear/dog-carriers-strollers-totes": "travel-gear-carriers",
  "dog/clothes-accessories/dog-apparel-accessories": "dog-dog-apparel-accessories",
  "dog/grooming-supplies/dog-bathing-equipment-supplies": "dog-dog-bathing-equipment-supplies",
  "dog/grooming-supplies/dog-brushes-combs-deshedding-tools": "grooming-tools",
  "dog/grooming-supplies/dog-paw-nail-care": "dog-dog-paw-nail-care",
  "dog/grooming-supplies/dog-shampoos-conditioners-sprays": "dog-dog-shampoos-conditioners-sprays",
  "dog/grooming-supplies/dog-wipes-waterless-grooming": "wipes",
  "cat/grooming-bathing/cat-brushes-combs-grooming-gloves": "grooming-tools",
  "cat/grooming-bathing/cat-deodorizers": "sprays-deodorizers",
  "cat/grooming-bathing/cat-nail-care": "nail-care",
  "cat/grooming-bathing/cat-wipes-waterless-grooming": "wipes",
}

/**
 * ANIMAL-SCOPED department aliases — the static nav slugs whose canonical
 * live node differs per animal ("flea-tick-solutions" exists under BOTH cat
 * and dog with different live targets). Checked before GROUP_ALIASES.
 */
const ANIMAL_GROUP_ALIASES: Record<string, string> = {
  // Archived curated nodes → their surviving live twin (the owner retired
  // the curated seeds; old links must follow the products).
  "dog/beds-bedding": "dog-beds",
  "cat/beds-bedding": "cat-beds",
  "dog/treats": "dog-treats",
  // Legacy numeric-category departments (the old DB nav tree advertised
  // "Wellness" / "Travel"; their concepts live in these aisles).
  "dog/wellness": "health-wellness",
  "dog/travel": "dog-outdoor-travel-gear",
  // Static-nav slugs whose canonical live node differs per animal.
  "dog/treats-chews": "dog-treats",
  "dog/bowls-feeding-supplies": "bowls-feeding",
  "dog/crates-gates-housing-accessories": "travel-crates",
  "dog/grooming-supplies": "grooming",
  "dog/training-behavior-supplies": "training-behavior",
  "dog/flea-tick-solutions": "flea-tick",
  "cat/treats": "cat-treats",
  "cat/clothing-accessories": "cat-clothing-accessories",
  "cat/steps-ramps": "cat-steps-ramps",
  "dog/clothes-accessories": "dog-clothes-accessories",
  "dog/outdoor-travel-gear": "dog-outdoor-travel-gear",
  "cat/carriers-containment": "carriers-travel",
  "cat/grooming-bathing": "grooming",
  "cat/flea-tick-solutions": "flea-tick",
  "cat/bowls-feeders": "bowls-feeding",
}

/**
 * TWIN DEPARTMENTS — the feed seeded the same concept twice under dog/cat
 * (a supplier-tree node AND the curated seed), and products landed in BOTH
 * (e.g. cat toys: 476 products on `toys`, 354 on `cat-cat-toys`). A route
 * scoped to just one twin silently hides the other half of the aisle.
 *
 * Values are the LIVE sibling slugs whose scopes UNION into the product
 * grid for every member. Routing itself stays on the requested slug —
 * both twins resolve, same content, no redirect ping-pong.
 */
export const DEPT_TWINS: Record<string, string[]> = {
  // ---- dog ----
  "dog/food": ["dog-dog-food"],
  "dog/dog-dog-food": ["food"],
  "dog/toys": ["dog-dog-toys"],
  "dog/dog-dog-toys": ["toys"],
  "dog/grooming": ["dog-grooming-supplies"],
  "dog/dog-grooming-supplies": ["grooming"],
  "dog/health-wellness": ["dog-dog-health-wellness"],
  "dog/dog-dog-health-wellness": ["health-wellness"],
  "dog/beds-bedding": ["dog-beds"],
  "dog/dog-beds": ["beds-bedding"],
  "dog/bowls-feeding": ["dog-bowls-feeding"],
  "dog/dog-bowls-feeding": ["bowls-feeding"],
  "dog/cleanup-potty": ["dog-cleanup"],
  "dog/dog-cleanup": ["cleanup-potty"],
  "dog/collars-leashes-harnesses": ["collars-harnesses-leashes"],
  "dog/collars-harnesses-leashes": ["collars-leashes-harnesses"],
  "dog/travel-crates": ["crates-containment"],
  "dog/crates-containment": ["travel-crates"],
  "dog/training-behavior": ["dog-training-behavior-supplies"],
  "dog/dog-training-behavior-supplies": ["training-behavior"],
  "dog/flea-tick": ["dog-flea-tick-solutions-for-dogs"],
  "dog/dog-flea-tick-solutions-for-dogs": ["flea-tick"],
  // ---- cat ----
  "cat/food": ["cat-cat-food"],
  "cat/cat-cat-food": ["food"],
  "cat/toys": ["cat-cat-toys"],
  "cat/cat-cat-toys": ["toys"],
  "cat/grooming": ["cat-grooming-bathing"],
  "cat/cat-grooming-bathing": ["grooming"],
  "cat/health-wellness": ["cat-cat-health-wellness"],
  "cat/cat-cat-health-wellness": ["health-wellness"],
  "cat/beds-bedding": ["cat-beds"],
  "cat/cat-beds": ["beds-bedding"],
  "cat/bowls-feeding": ["bowls-feeders"],
  "cat/bowls-feeders": ["bowls-feeding"],
  "cat/litter": ["cat-litter"],
  "cat/cat-litter": ["litter"],
  "cat/cleanup-potty": ["cat-cleaners-waste-disposal"],
  "cat/cat-cleaners-waste-disposal": ["cleanup-potty"],
  "cat/collars-leashes-harnesses": ["cat-collars-leashes-harnesses"],
  "cat/cat-collars-leashes-harnesses": ["collars-leashes-harnesses"],
  "cat/furniture-scratchers": ["cat-cat-furniture-scratchers"],
  "cat/cat-cat-furniture-scratchers": ["furniture-scratchers"],
  "cat/training-behavior": ["cat-training-behavior"],
  "cat/cat-training-behavior": ["training-behavior"],
  "cat/flea-tick": ["flea-tick-solutions-for-cats"],
  "cat/flea-tick-solutions-for-cats": ["flea-tick"],
}

export type ResolvedTaxPath = {
  animal: TaxAnimal
  group: TaxGroup | null
  sub: TaxSub | null
  /** Deepest matched node's whole subtree id scope (for product queries). */
  nodeIds: string[]
  /** Deepest matched node still has children (render landing, not PLP). */
  deepestHasChildren: boolean
  /** When matched through a legacy alias, the canonical path to 301 to. */
  canonicalPath: string | null
  /** Animal matched but a deeper segment did not — render notFound(). */
  notFound: boolean
}

function subtreeIds(ids: string[], childrenOf: (id: string) => string[]): string[] {
  const out = new Set<string>(ids)
  const stack = [...ids]
  while (stack.length) {
    const cur = stack.pop()!
    for (const c of childrenOf(cur)) {
      if (!out.has(c)) {
        out.add(c)
        stack.push(c)
      }
    }
  }
  return [...out]
}

/**
 * Resolve /shop/<animal>[/<group>[/<sub>]] against the LIVE taxonomy.
 * Legacy slugs resolve too — with a canonicalPath for the 301.
 */
/**
 * Cached wrapper — each request resolves the SAME path twice (once for
 * generateMetadata, once for the page component). Without this wrapper that
 * doubled the per-view resolution cost and the deep-slug BFS count query ran
 * per view. Cached 5 min under the tax:* invalidation namespace.
 */
export async function resolveTaxPath(segments: string[]): Promise<ResolvedTaxPath | null> {
  if (segments.length === 0) return null
  const key = `tax:path:${segments.map((s) => s.toLowerCase()).join("/")}`
  return cached(key, TREE_TTL_MS, () => resolveTaxPathUncached(segments))
}

async function resolveTaxPathUncached(segments: string[]): Promise<ResolvedTaxPath | null> {
  if (segments.length === 0) return null
  const tree = await getTaxonomyTree()

  const rawAnimalSlug = segments[0]
  const canonicalAnimal = ANIMAL_ALIASES[rawAnimalSlug] || rawAnimalSlug
  const animal = tree.find((a) => a.slug === canonicalAnimal)
  if (!animal) return null

  const aliasedAnimal = canonicalAnimal !== rawAnimalSlug

  if (segments.length === 1) {
    return {
      animal,
      group: null,
      sub: null,
      nodeIds: [animal.id],
      deepestHasChildren: true,
      canonicalPath: aliasedAnimal ? `/shop/${animal.slug}` : null,
      notFound: false,
    }
  }

  // Group lookup needs the raw node tree for descendant scoping — refetch
  // node records from the tree cache via a flat index.
  const nodes = await getNodeIndex()
  const childrenOf = (id: string) => nodes.childrenMap.get(id) ?? []

  const rawGroupSlug = segments[1]
  // Animal-scoped aliases first ("flea-tick-solutions" means different live
  // nodes under cat vs dog), then the global legacy map, then the raw slug.
  const canonicalGroup =
    ANIMAL_GROUP_ALIASES[`${canonicalAnimal}/${rawGroupSlug}`] ||
    GROUP_ALIASES[rawGroupSlug] ||
    rawGroupSlug
  const group = animal.groups.find((g) => g.slug === canonicalGroup)

  // Twin departments: feed + curated seeds of the same concept — their
  // scopes UNION so the aisle shows every product, whichever twin was hit.
  const twinIds = (DEPT_TWINS[`${animal.slug}/${canonicalGroup}`] ?? [])
    .map((t) => animal.groups.find((g) => g.slug === t)?.id)
    .filter((x): x is string => !!x)

  if (!group) {
    // Unknown second segment under a known animal — hard 404 (do NOT fall
    // through to the legacy dog-only resolver for fish/bird/etc.).
    return { animal, group: null, sub: null, nodeIds: [animal.id], deepestHasChildren: true, canonicalPath: null, notFound: true }
  }

  const aliasedGroup = canonicalGroup !== rawGroupSlug || aliasedAnimal

  if (segments.length === 2) {
    return {
      animal,
      group,
      sub: null,
      nodeIds: subtreeIds([group.id, ...twinIds], childrenOf),
      deepestHasChildren: group.subcategories.length > 0,
      canonicalPath: aliasedGroup ? `/${["shop", animal.slug, group.slug].join("/")}` : null,
      notFound: false,
    }
  }

  const rawSubSlug = segments[2]
  let sub = group.subcategories.find((s) => s.slug === rawSubSlug) ?? null

  if (!sub) {
    // Not a direct depth-3 child — the slug may be a deeper node (depth-4+)
    // or a supplier-tree variant. BFS the group's subtree (and its twins')
    // for the first published node with this slug so EVERY live slug
    // resolves to a page.
    const seen = new Set<string>([group.id, ...twinIds])
    const stack = [...(nodes.childrenMap.get(group.id) ?? []), ...twinIds.flatMap((t) => nodes.childrenMap.get(t) ?? [])]
    while (stack.length > 0) {
      const cur = stack.pop()!
      if (seen.has(cur)) continue
      seen.add(cur)
      const rec = nodes.byId.get(cur)
      if (rec && rec.slug === rawSubSlug) {
        const childCount = (nodes.childrenMap.get(rec.id) ?? []).length
        sub = {
          id: rec.id,
          slug: rec.slug,
          name: rec.name,
          productCount: await entNodeProductCount(rec.id),
          hasChildren: childCount > 0,
          children: [],
          heroImageUrl: rec.heroImageUrl,
        }
        break
      }
      for (const c of nodes.childrenMap.get(cur) ?? []) stack.push(c)
    }
  }

  if (!sub) {
    // Last resort — legacy / stale sub slugs. Old URLs (the retired numeric
    // category tree: wellness/travel/treats aisles) and stale static-nav
    // slugs point at concepts that were RENAMED or MOVED, not deleted. The
    // raw slug may also exist under a sibling department (the feed seeded
    // twin subtrees). Walk the whole animal subtree for the target slug —
    // the LEGACY_SUB_ALIASES mapping first, then the raw slug — and 308 to
    // its true home so old links follow the products. Nothing to find →
    // honest 404.
    const targetSlug = LEGACY_SUB_ALIASES[`${animal.slug}/${rawGroupSlug}/${rawSubSlug}`] ?? rawSubSlug
    if (targetSlug !== canonicalGroup) {
      outer: for (const g of animal.groups) {
        const seenGroups = new Set<string>([group.id, ...twinIds, g.id])
        const stack = [...(nodes.childrenMap.get(g.id) ?? [])]
        while (stack.length > 0) {
          const cur = stack.pop()!
          if (seenGroups.has(cur)) continue
          seenGroups.add(cur)
          const rec = nodes.byId.get(cur)
          if (rec && rec.slug === targetSlug) {
            const childCount = (nodes.childrenMap.get(rec.id) ?? []).length
            return {
              animal,
              group: g,
              sub: {
                id: rec.id,
                slug: rec.slug,
                name: rec.name,
                productCount: await entNodeProductCount(rec.id),
                hasChildren: childCount > 0,
                children: [],
                heroImageUrl: rec.heroImageUrl,
              },
              nodeIds: subtreeIds([rec.id], childrenOf),
              deepestHasChildren: childCount > 0,
              canonicalPath: `/${["shop", animal.slug, g.slug, rec.slug].join("/")}`,
              notFound: false,
            }
          }
          for (const c of nodes.childrenMap.get(cur) ?? []) {
            stack.push(c)
            if (stack.length > 2000) break outer // safety valve on runaway trees
          }
        }
      }
    }

    return {
      animal,
      group,
      sub: null,
      nodeIds: subtreeIds([group.id, ...twinIds], childrenOf),
      deepestHasChildren: true,
      canonicalPath: null,
      notFound: true,
    }
  }

  return {
    animal,
    group,
    sub,
    nodeIds: subtreeIds([sub.id], childrenOf),
    deepestHasChildren: sub.hasChildren,
    canonicalPath: null,
    notFound: false,
  }
}

// ----------------------------- Node index ----------------------------------

/** Whole subtree of node ids (self + all descendants) — product scope. */
export async function subtreeNodeIds(id: string): Promise<string[]> {
  const nodes = await getNodeIndex()
  const out = new Set<string>([id])
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    for (const c of nodes.childrenMap.get(cur) ?? []) {
      if (!out.has(c)) {
        out.add(c)
        stack.push(c)
      }
    }
  }
  return [...out]
}

/**
 * Department product scope — the department's whole subtree UNION its twin
 * departments' subtrees (feed + curated seeds of the same concept carry
 * products in both; a single-node scope silently hides half the aisle).
 * DepartmentPage / SubcategoryPage build their grids from this.
 */
export async function deptScopeNodeIds(
  animalSlug: string,
  deptSlug: string,
  deptId: string,
): Promise<string[]> {
  const [nodes, tree] = await Promise.all([getNodeIndex(), getTaxonomyTree()])
  const animal = tree.find((a) => a.slug === animalSlug)
  const twinIds = (DEPT_TWINS[`${animalSlug}/${deptSlug}`] ?? [])
    .map((t) => animal?.groups.find((g) => g.slug === t)?.id)
    .filter((x): x is string => !!x)
  const out = new Set<string>([deptId, ...twinIds])
  const stack = [deptId, ...twinIds]
  while (stack.length) {
    const cur = stack.pop()!
    for (const c of nodes.childrenMap.get(cur) ?? []) {
      if (!out.has(c)) {
        out.add(c)
        stack.push(c)
      }
    }
  }
  return [...out]
}

type NodeIndex = {
  byId: Map<string, { id: string; slug: string; name: string; display_name: string | null; parentId: string | null; heroImageUrl: string | null }>
  childrenMap: Map<string, string[]>
}
let nodeIndexCache: NodeIndex | null = null
let nodeIndexAt = 0

type NodeIndexRow = { id: string; parent_id: string | null; name: string; display_name: string | null; slug: string; hero_image_url: string | null }

function buildNodeIndex(rows: NodeIndexRow[]): NodeIndex {
  const byId = new Map<string, { id: string; slug: string; name: string; display_name: string | null; parentId: string | null; heroImageUrl: string | null }>()
  const childrenMap = new Map<string, string[]>()
  for (const r of rows) {
    byId.set(r.id, { id: r.id, slug: r.slug, name: r.display_name || r.name, display_name: r.display_name, parentId: r.parent_id, heroImageUrl: r.hero_image_url })
    if (r.parent_id) {
      if (!childrenMap.has(r.parent_id)) childrenMap.set(r.parent_id, [])
      childrenMap.get(r.parent_id)!.push(r.id)
    }
  }
  return { byId, childrenMap }
}

async function getNodeIndex(): Promise<NodeIndex> {
  if (nodeIndexCache && Date.now() - nodeIndexAt < TREE_TTL_MS) return nodeIndexCache
  // STRICT (2026-10-21): pgQuery's error-to-empty semantics let a DB wave
  // cache an EMPTY node index for the whole TTL — every scope resolution
  // then returned nothing and category pages rendered empty shelves. A
  // failed fill now throws (nothing gets cached), and a previous good
  // index is served stale rather than replaced by an empty one.
  let rows: { id: string; parent_id: string | null; name: string; display_name: string | null; slug: string; hero_image_url: string | null }[]
  try {
    rows = await pgQueryStrict<{ id: string; parent_id: string | null; name: string; display_name: string | null; slug: string; hero_image_url: string | null }>(
      `SELECT id, parent_id, name, display_name, slug, hero_image_url FROM taxonomy_nodes WHERE status = 'published'`,
    )
  } catch (e) {
    if (nodeIndexCache) return nodeIndexCache
    throw e
  }
  if (rows.length === 0) {
    if (nodeIndexCache) return nodeIndexCache
    throw new Error("[taxonomy] node index returned zero rows")
  }
  nodeIndexCache = buildNodeIndex(rows)
  nodeIndexAt = Date.now()
  return nodeIndexCache
}

/**
 * Hover-panel circles for an overhead orbit category circle.
 *
 * The live taxonomy keeps PARALLEL depth-2 seeds per animal: simple
 * `department` nodes ("food", "toys") AND legacy-shaped `category` nodes
 * ("dog-food", "dog-treats") whose published L3 children (Dry Dog Food,
 * Wet Dog Food, Dog Food Toppers…) are what the nav links target. The tree
 * builder surfaces only the department seeds, so slug-matching a legacy
 * slug needs a BFS over the raw node index.
 *
 * Walks `segments` (e.g. ["dog","dog-food"] or ["dog","dog-food","dry-dog-
 * food-kibble"]) from the animal root through the raw published node graph
 * and returns the FINAL node's published children, ready to link as
 * /shop/{…path}/{childSlug} (routes resolve via the taxonomy BFS resolver).
 * Empty when the node doesn't exist or has no children.
 */
export async function taxonomyChildrenOfPath(
  segments: string[],
): Promise<{ name: string; slug: string; heroImageUrl: string | null }[]> {
  if (segments.length === 0) return []
  const canonicalAnimal = ANIMAL_ALIASES[segments[0]] || segments[0]
  const nodes = await getNodeIndex()
  let parentId: string | null = null
  for (const n of nodes.byId.values()) {
    if (n.slug === canonicalAnimal && n.parentId === null) {
      parentId = n.id
      break
    }
  }
  if (!parentId) return []
  for (let i = 1; i < segments.length; i++) {
    const seen = new Set<string>([parentId])
    const stack = [...(nodes.childrenMap.get(parentId) ?? [])]
    let found: string | null = null
    while (stack.length > 0) {
      const cur = stack.shift()!
      if (seen.has(cur)) continue
      seen.add(cur)
      const rec = nodes.byId.get(cur)
      if (!rec) continue
      if (rec.slug === segments[i]) {
        found = rec.id
        break
      }
      for (const c of nodes.childrenMap.get(cur) ?? []) stack.push(c)
    }
    if (!found) return []
    parentId = found
  }
  return (nodes.childrenMap.get(parentId) ?? [])
    .map((id) => nodes.byId.get(id))
    .filter((n): n is NonNullable<typeof n> => !!n)
    .slice(0, 14)
    .map((n) => ({ name: n.name, slug: n.slug, heroImageUrl: n.heroImageUrl }))
}

// ----------------------------- Products ------------------------------------

export type TaxProduct = {
  id: string
  name: string
  slug: string
  brand: string | null
  image: string | null
  /** Clean plain-text blurb (commerce_catalog_items.short_description).
   *  Raw source entities are decoded at render time via cleanText(). */
  shortDescription: string | null
  priceCents: number | null
  compareAtPriceCents: number | null
  isOnSale: boolean
  isNew: boolean
  isBestseller: boolean
  inStock: boolean
  ratingAvg: number | null
  ratingCount: number
  /** Who sells this item — a seller's shop or Portal Shop (platform stock).
   *  Resolved in bulk per grid page by lib/sellers/sold-by. */
  soldBy: SoldByAttribution
  /** The product's ASSIGNED taxonomy category — the deepest node linked
   *  in commerce_catalog_item_taxonomy, by name. Null when the item has
   *  no assignment (unclassified). NEVER the brand name and never a
   *  catch-all bucket: a missing assignment stays visibly missing. */
  category: string | null
  /** The assigned node's id (the category above), null when unassigned. */
  categoryNodeId: string | null
}

/** Bulk assigned-category read for one grid page: each item's deepest
 *  commerce_catalog_item_taxonomy → taxonomy_nodes link (name order
 *  breaks depth ties, so the pick is deterministic and matches the
 *  LIST_SQL lateral in lib/enterprise/catalog). STRICT — a failed read
 *  throws and the grid fails with it, per this loader's doctrine: a
 *  silent empty map would present every product as unclassified. */
async function loadAssignedCategories(
  itemIds: string[],
): Promise<Map<string, { name: string; nodeId: string }>> {
  const out = new Map<string, { name: string; nodeId: string; depth: number }>()
  if (itemIds.length === 0) return out
  const rows = await pgQueryStrict<{ item_id: string; node_id: string; name: string; depth: number }>(
    `SELECT t.item_id::text AS item_id, n.id::text AS node_id, n.name, n.depth
       FROM public.commerce_catalog_item_taxonomy t
       JOIN public.taxonomy_nodes n ON n.id::text = t.node_id
      WHERE t.item_id = ANY($1::uuid[])`,
    [itemIds],
  )
  for (const r of rows) {
    const cur = out.get(r.item_id)
    if (
      !cur ||
      r.depth > cur.depth ||
      (r.depth === cur.depth && r.name < cur.name)
    ) {
      out.set(r.item_id, { name: r.name, nodeId: r.node_id, depth: r.depth })
    }
  }
  return new Map(
    [...out].map(([id, v]) => [id, { name: v.name, nodeId: v.nodeId }]),
  )
}

export type TaxQueryResult = {
  items: TaxProduct[]
  total: number
  page: number
  pages: number
}

export async function queryTaxProducts(opts: {
  nodeIds: string[]
  sort?: string
  page?: number
  perPage?: number
  filters?: { minPrice?: number; maxPrice?: number; priceBucket?: string | null; rating?: number | null; availability?: string[]; q?: string | null; brands?: string[]; facets?: Record<string, string[]> }
}): Promise<TaxQueryResult> {
  const perPage = Math.max(1, Math.min(48, opts.perPage ?? 12))
  const page = Math.max(1, opts.page ?? 1)
  const sort = opts.sort || "best-selling"

  // v2 — price-bounds units fix (cents → dollars for the grid's WHERE
  // builder): bumped so entries parked by the pre-fix code can never
  // shadow the corrected query on a long-running process.
  const cacheKey = `tax:grid:v2:${[...opts.nodeIds].sort().join(",")}|${sort}|${page}|${perPage}|${JSON.stringify(opts.filters ?? {})}`
  // PRICE UNITS: parseSearchParams (the URL filter system) hands
  // minPrice/maxPrice in CENTS (bucket bounds + ?minPrice=10 → 1000),
  // while the enterprise grid compares against DOLLAR price columns and
  // expects DOLLAR bounds (gridFilterWhere pushes them through
  // unconverted). Convert once, here. Attribute facets pass through
  // (the enterprise grid matches them by listing name + variant option
  // columns).
  const { minPrice, maxPrice, ...facetFilters } = opts.filters ?? {}
  const sqlFilters = {
    ...facetFilters,
    minPrice: minPrice != null ? minPrice / 100 : undefined,
    maxPrice: maxPrice != null ? maxPrice / 100 : undefined,
  }

  return cached(cacheKey, GRID_TTL_MS, async () => {
    // ENTERPRISE catalog only (commerce_catalog_items, scoped by
    // metadata taxonomy_node_ids — the same relations the counts, the
    // facets and the PDP all read). The former feed fallback
    // (queryFeedTaxProducts over `products` / `product_variants` /
    // `product_media`) queried tables dropped in the catalog migration:
    // it could never return a row, and because it ran STRICT it turned
    // every legitimately empty category (enterprise total 0 — e.g.
    // /shop/cat/carriers-travel/cat-strollers, a published node with
    // zero catalog items) into a thrown `relation "products" does not
    // exist`, which killed static generation outright and 500'd the
    // page at runtime. Semantics now, matching the grid's own strict
    // doctrine: an enterprise failure PROPAGATES (an error render is
    // never cached as an empty shelf) and a completed empty result is
    // a true empty grid.
    const res = await queryEnterpriseTaxProducts({
      nodeIds: opts.nodeIds,
      sort,
      page,
      perPage,
      filters: sqlFilters,
    })
    const items: TaxProduct[] = res.items.map((it) => ({
      id: it.id,
      name: it.name,
      slug: it.slug,
      brand: it.brand,
      image: it.image,
      shortDescription: it.shortDescription,
      priceCents: it.priceCents,
      compareAtPriceCents: it.compareAtPriceCents,
      isOnSale: it.isOnSale,
      isNew: it.isNew,
      isBestseller: it.isBestseller || it.isSalonFavorite,
      inStock: it.inStock,
      ratingAvg: null,
      ratingCount: 0,
      soldBy: soldByAttribution([]),
      category: null,
      categoryNodeId: null,
    }))
    const [soldByMap, categoryMap] = await Promise.all([
      loadSoldByForItems(items.map((i) => i.id)),
      loadAssignedCategories(items.map((i) => i.id)),
    ])
    for (const it of items) {
      const s = soldByMap.get(it.id)
      if (s) it.soldBy = s
      const c = categoryMap.get(it.id)
      if (c) {
        it.category = c.name
        it.categoryNodeId = c.nodeId
      }
    }
    return { items, total: res.total, page: Math.min(res.page, res.pages), pages: res.pages }
  })
}

// ----------------------------- Facets --------------------------------------

export type TaxFacets = {
  brands: { name: string; count: number }[]
  priceBuckets: { value: string; label: string; count: number }[]
  ratingRows: { value: string; label: string; count: number }[]
  inStock: number
  outStock: number
}

export async function getTaxFacets(nodeIds: string[]): Promise<TaxFacets> {
  const key = `tax:facets:${[...nodeIds].sort().join(",")}`
  return cached(key, FACET_TTL_MS, async () => {
    // ENTERPRISE source only (commerce_catalog_items via
    // queryEnterpriseFacetRows). The former feed fallback queried the
    // dropped `products` / `product_variants` tables whenever the
    // enterprise facet set was empty: it could never return a row —
    // pgQuery logged `relation "products" does not exist` and the
    // facets came back empty anyway, with a phantom error against
    // every empty category's name. An empty enterprise result IS the
    // facet set for an empty category.
    const facetRows = await queryEnterpriseFacetRows(nodeIds)
    const products: { brand: string | null; priceCents: number | null; inStock: boolean; ratingAvg: number | null; ratingCount: number }[] =
      facetRows.map((r) => ({
        brand: r.brand,
        priceCents: r.priceCents,
        inStock: r.inStock,
        ratingAvg: null,
        ratingCount: 0,
      }))

    const priced = products.filter((p) => p.priceCents != null)

    const brandCounts = new Map<string, number>()
    for (const p of products) {
      if (!p.brand) continue
      brandCounts.set(p.brand, (brandCounts.get(p.brand) || 0) + 1)
    }
    const brands = [...brandCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 12)

    const bucketDefs: { value: string; label: string; min: number | null; max: number | null }[] = [
      { value: "under-10", label: "Under $10", min: null, max: 1000 },
      { value: "10-25", label: "$10 – $25", min: 1000, max: 2500 },
      { value: "25-50", label: "$25 – $50", min: 2500, max: 5001 },
      { value: "50-100", label: "$50 – $100", min: 5001, max: 10001 },
      { value: "over-100", label: "$100 & up", min: 10001, max: null },
    ]
    const priceBuckets = bucketDefs
      .map((b) => ({
        value: b.value,
        label: b.label,
        count: priced.filter((p) => {
          const c = p.priceCents!
          return (b.min == null || c >= b.min) && (b.max == null || c < b.max)
        }).length,
      }))
      .filter((b) => b.count > 0)

    const rated = products.filter((p) => p.ratingCount > 0 && p.ratingAvg != null)
    const ratingRows = [4, 3, 2, 1]
      .map((floor) => ({
        value: String(floor),
        label: `${floor}★ & up`,
        count: rated.filter((p) => (p.ratingAvg as number) >= floor).length,
      }))
      .filter((r) => r.count > 0)

    return {
      brands,
      priceBuckets,
      ratingRows,
      inStock: products.filter((p) => p.inStock).length,
      outStock: products.filter((p) => !p.inStock).length,
    }
  })
}

// ----------------------- Node facet sections (owner translation layer) ------
//
// The owner built the attribute→frontend translation IN THE DATABASE:
//   • node_filters     — WHICH attribute facets apply to WHICH node
//                        (+ per-filter UI contract: is_searchable,
//                         is_expanded_default, ui_toggle, sort_order)
//   • node_filter_values — the canonical filter OPTIONS per node filter
//   • attributes / attribute_values — the canonical attribute + value names
//
// This is the source of truth for the PLP sidebar. Do NOT substitute a
// generic computed facet rail for it — that was the mistake this function
// exists to undo. Brand / Price / Customer Rating are excluded here because
// the PLP renders those as live-computed sections (real product-backed
// counts); every other attribute renders straight from these rows.

export type NodeFacetSection = {
  /** URL facet key — attribute slug (e.g. "material", "food-form"). */
  key: string
  /** Customer-facing section label (e.g. "Material", "Food Form"). */
  label: string
  options: { value: string; label: string }[]
  /** Render the search-within-facet input (owner flag from node_filters). */
  searchable: boolean
  /** Collapse options past defaultVisible behind a "Show all" toggle. */
  collapsible: boolean
  defaultVisible: number
}

const GENERIC_ATTR_SLUGS = new Set(["brand", "price", "customer-rating"])

/**
 * SPEC BRIDGES — canonical department → the sibling node that carries the
 * department's authored filter spec (the owner's canonical category file,
 * loaded into node_filters on the legacy-generation nodes).
 *
 * The canonical departments were renamed (cat/cat-food, dog/dog-toys, …)
 * but their filter specs were authored on the original nodes (cat/food,
 * dog/toys, …) and never moved. v_node_filter_spec inheritance only walks
 * ANCESTORS, so a renamed department inherits the ANIMAL's landing set and
 * its own groups (Cat Food's Food Form, Dog Toys' Toy Type) never render.
 * DEPT_TWINS cannot bridge this — its slug forms predate the rename.
 * These pairs were verified node-by-node against the live database
 * (2026-10-25): the target holds self-defined, non-generic spec rows; the
 * source department holds none of its own.
 *
 * Rule: a node's OWN spec always wins. The bridge applies only when the
 * page's department carries no self-defined spec. Departments absent here
 * either carry their own spec (dog-treats, dog-beds, cat/toys, …) or have
 * none authored anywhere (dog training, cat treats, cat litter — their
 * file sections were never loaded into the DB) and keep the inherited set.
 */
const SPEC_BRIDGE: Record<string, string> = {
  "dog/dog-food": "food",
  "dog/dog-toys": "toys",
  "dog/dog-bowls-feeding": "bowls-feeding",
  "dog/dog-health-wellness": "health-wellness",
  "dog/flea-tick-solutions-for-dogs": "flea-tick",
  "dog/crates-containment": "travel-crates",
  "cat/cat-food": "food",
  "cat/cat-furniture-scratchers": "furniture-scratchers",
  "cat/bowls-feeders": "bowls-feeding",
  "cat/cat-health-wellness": "health-wellness",
  "cat/cat-cleaners-waste-disposal": "cleanup-potty",
  "cat/cat-grooming-bathing": "grooming",
  "cat/flea-tick-solutions-for-cats": "flea-tick",
  "cat/cat-beds": "beds-bedding",
  "cat/cat-clothing-accessories": "collars-leashes-harnesses",
}

/** The shaped-tree department (animal + group) that IS or CONTAINS a node
 *  id — spec bridges are keyed at department level. */
async function deptOfNode(
  rootId: string,
): Promise<{ animal: TaxAnimal; group: TaxGroup } | null> {
  const tree = await getTaxonomyTree()
  for (const animal of tree) {
    for (const group of animal.groups) {
      if (group.id === rootId) return { animal, group }
      for (const sub of group.subcategories) {
        if (sub.id === rootId) return { animal, group }
        if (sub.children.some((c) => c.id === rootId)) return { animal, group }
      }
    }
  }
  return null
}

export async function getNodeFacetSections(rootId: string): Promise<NodeFacetSection[]> {
  if (!rootId) return []
  // The owner's node_filters view is edited rarely — 5 min TTL per root.
  // v2: spec-bridge resolution (below) changes the payload for renamed
  // departments — the v1 entries hold the inherited animal sets.
  return cached(`tax:nodesections:v2:${rootId}`, FACET_TTL_MS, async () => {

  // The owner builds the attribute→frontend translation IN THE DATABASE:
  //   • node_filters        — WHICH attribute applies WHERE (+ UI contract)
  //   • node_filter_values  — the canonical OPTIONS per node filter
  //   • v_node_filter_spec  — the read model: for EVERY node it resolves the
  //     EFFECTIVE filter definition (effective_filter_node(): the node's own
  //     filters, else the nearest ancestor that has any — animal roots carry
  //     the store-wide sets, e.g. Dog: Size / Breed Size / Flavor / …).
  //
  // This view IS the owner's facet update mechanism — the previous code
  // re-implemented inheritance by hand and got it wrong (it stopped at
  // depth ≥ 2, so the animal-root facet sets never rendered and feed-tree
  // pages like /shop/dog/dog-treats/* showed no attribute facets at all).
  // Brand / Price / Customer Rating stay live-computed (real product-backed
  // counts); every other attribute renders straight from these rows.
  const ownRows = await fetchSpecRows(rootId)

  // The department's OWN authored spec outranks everything — including
  // any inherited set the view resolved for it.
  if (hasOwnSpec(ownRows, rootId)) return sectionsFromSpecRows(ownRows)

  // SPEC BRIDGE — the department was renamed and its authored spec lives
  // on the legacy sibling node (SPEC_BRIDGE above). The view's inheritance
  // walks ancestors only, so without this step the page renders the
  // ANIMAL's landing set instead of its own file-defined groups.
  const dept = await deptOfNode(rootId)
  if (dept) {
    const bridgeSlug = SPEC_BRIDGE[`${dept.animal.slug}/${dept.group.slug}`]
    const specNode = bridgeSlug
      ? dept.animal.groups.find((g) => g.slug === bridgeSlug)
      : undefined
    if (specNode && specNode.id !== dept.group.id) {
      const bridgeRows = await fetchSpecRows(specNode.id)
      if (hasOwnSpec(bridgeRows, specNode.id)) {
        return sectionsFromSpecRows(bridgeRows)
      }
    }
  }

  const own = sectionsFromSpecRows(ownRows)
  if (own.length > 0) return own

  // Inheritance fallback — the view's effective_filter_node() stops at the
  // DEEPEST node owning ANY filter rows, even when those rows are only the
  // generic Brand/Price/Rating scaffolding (or the node's attribute rows
  // carry no values yet). Those pages would otherwise render NO attribute
  // facets at all (all nine bird subcategories, /shop/cat/litter, …). Walk
  // UP to the nearest ancestor whose spec yields a usable non-generic set —
  // e.g. /shop/cat/litter falls through to the Cat root's 15-filter set.
  const ancestors = await pgQuery<{ id: string }>(
    `SELECT a.id
       FROM taxonomy_nodes n
       JOIN taxonomy_nodes a
         ON (n.path = a.path OR n.path LIKE a.path || '/%') AND a.depth < n.depth
      WHERE n.id = $1::uuid
      ORDER BY a.depth DESC`,
    [rootId],
  )
  for (const a of ancestors) {
    const sections = await fetchNodeFacetSections(a.id)
    if (sections.length > 0) return sections
  }
  return []
  })
}

type NodeFilterSpecRow = {
  query_param: string
  filter: string
  sort_order: number
  is_searchable: boolean | null
  is_expanded_default: boolean | null
  allowed_values: { value: string; slug: string }[] | null
  defined_on_node_id: string
}

/** Raw v_node_filter_spec rows for one node — its EFFECTIVE spec (the view
 *  resolves inheritance); defined_on_node_id says whose spec it really is. */
async function fetchSpecRows(nodeId: string): Promise<NodeFilterSpecRow[]> {
  return pgQuery<NodeFilterSpecRow>(
    `SELECT query_param, filter, sort_order, is_searchable, is_expanded_default, allowed_values, defined_on_node_id
       FROM v_node_filter_spec
      WHERE node_id = $1::uuid
      ORDER BY sort_order`,
    [nodeId],
  )
}

function sectionsFromSpecRows(rows: NodeFilterSpecRow[]): NodeFacetSection[] {
  const sections: NodeFacetSection[] = []
  for (const r of rows) {
    // Generic facets are computed live from the product set — skip the
    // scaffold rows here so they never render twice.
    if (GENERIC_ATTR_SLUGS.has(r.query_param)) continue
    const options = (r.allowed_values ?? [])
      .filter((v) => v.slug && v.value)
      .map((v) => ({ value: v.slug, label: v.value }))
    if (options.length === 0) continue
    sections.push({
      key: r.query_param,
      label: r.filter,
      options,
      searchable: r.is_searchable ?? false,
      collapsible: options.length > 6,
      defaultVisible: (r.is_expanded_default ?? false) ? options.length : 6,
    })
  }
  return sections
}

/** True when the rows carry a usable spec DEFINED ON the node itself (not
 *  inherited): at least one non-generic filter with options whose
 *  defined_on_node_id is the node. */
function hasOwnSpec(rows: NodeFilterSpecRow[], nodeId: string): boolean {
  return rows.some(
    (r) =>
      r.defined_on_node_id === nodeId &&
      !GENERIC_ATTR_SLUGS.has(r.query_param) &&
      (r.allowed_values ?? []).some((v) => v.slug && v.value),
  )
}

/** One node's attribute facet sections from v_node_filter_spec (generics
 *  excluded — those render as live-computed sections in the PLP). */
async function fetchNodeFacetSections(nodeId: string): Promise<NodeFacetSection[]> {
  return sectionsFromSpecRows(await fetchSpecRows(nodeId))
}

// ----------------------------- Nav conversion ------------------------------

/**
 * Reverse alias lookup: which STATIC nav key (`<animal>/<dept>` as used by
 * the static SHOP_NAV_TAXONOMY) routes to this live department slug?
 *
 * The client islands render the owner's static tree but link LIVE slugs —
 * this join is what lets /api/shop/nav annotate every department with its
 * static key so a static panel and its live links meet without the client
 * duplicating the alias maps.
 */
let _staticDeptSlugs: Map<string, Set<string>> | null = null
function getStaticDeptSlugs(): Map<string, Set<string>> {
  if (_staticDeptSlugs) return _staticDeptSlugs
  const map = new Map<string, Set<string>>()
  for (const a of SHOP_NAV_TAXONOMY) {
    map.set(a.slug, new Set(a.departments.map((d) => d.slug)))
  }
  _staticDeptSlugs = map
  return map
}

export function staticDeptKeyForLive(animalSlug: string, liveDeptSlug: string): string {
  const staticSlugs = getStaticDeptSlugs().get(animalSlug)
  const has = (s: string | undefined): boolean => !!s && !!staticSlugs?.has(s)

  // 1) The live slug is itself a static slug for this animal (dog/toys,
  //    cat/food, fish/aquatics, reptile/reptile, …).
  if (has(liveDeptSlug)) return liveDeptSlug
  // 2) It's an alias TARGET → the alias source is the static key
  //    (dog-treats ← dog/treats-chews; travel-crates ← crates-containment).
  for (const [k, v] of Object.entries(ANIMAL_GROUP_ALIASES)) {
    if (v === liveDeptSlug && k.startsWith(animalSlug + "/")) return k.split("/")[1]
  }
  for (const [k, v] of Object.entries(GROUP_ALIASES)) {
    if (v === liveDeptSlug && has(k)) return k
  }
  // 3) Twin pairs — the surviving static side of the pair.
  for (const t of DEPT_TWINS[`${animalSlug}/${liveDeptSlug}`] ?? []) {
    if (has(t)) return t
  }
  for (const [k, vs] of Object.entries(DEPT_TWINS)) {
    if (k.startsWith(animalSlug + "/") && vs.includes(liveDeptSlug)) {
      const kSlug = k.split("/")[1]
      if (has(kSlug)) return kSlug
    }
  }
  return liveDeptSlug
}

/** Resolve a bare slug to a published taxonomy node — used for flat
 *  single-segment shop URLs (/shop/grooming) that must land on the
 *  canonical nested category page. Slugs repeat across animals, so the
 *  winner is the dog-subtree node when one exists (the shop's primary
 *  catalog), else the candidate whose subtree carries the most
 *  products, else the shallowest. Returns the node's stored shop path. */
export async function findTaxNodeBySlug(
  slug: string,
): Promise<{ id: string; name: string; slug: string; path: string } | null> {
  const rows = await pgQueryStrict<{
    id: string
    name: string
    slug: string
    path: string
  }>(
    `SELECT t.id, COALESCE(t.display_name, t.name) AS name, t.slug, t.path
       FROM public.taxonomy_nodes t
      WHERE t.status = 'published' AND t.slug = $1 AND t.path IS NOT NULL
      ORDER BY (t.path LIKE '/shop/dog/%') DESC,
               (SELECT count(*) FROM public.commerce_catalog_item_taxonomy x
                  JOIN public.taxonomy_nodes d ON d.id::text = x.node_id
                 WHERE d.path = t.path OR d.path LIKE t.path || '/%') DESC,
               t.depth ASC
      LIMIT 1`,
    [slug],
  )
  return rows[0] ?? null
}

/** NavCategory-shaped conversion for the sidebar (same contract as
 *  buildNavTreeFromTaxonomy in shop-nav.ts, but built from LIVE data). */
export type NavLike = {
  key: string
  displayName: string
  path: string
  level: number
  count: number
  rawIds: string[]
  children: NavLike[]
  parentKey: string | null
}

export async function buildNavFromTaxonomyDb(): Promise<NavLike[]> {
  const tree = await getTaxonomyTree()
  return tree.map((a) => ({
    key: a.slug,
    displayName: a.name,
    path: `/shop/${a.slug}`,
    level: 0,
    count: a.productCount,
    rawIds: [a.id],
    parentKey: null,
    children: canonicalGroups(a.groups).map((g) => ({
      key: `${a.slug}/${g.slug}`,
      displayName: g.name,
      path: `/shop/${a.slug}/${g.slug}`,
      level: 1,
      count: g.productCount,
      rawIds: [g.id],
      parentKey: a.slug,
      children: g.subcategories.map((s) => ({
        key: `${a.slug}/${g.slug}/${s.slug}`,
        displayName: s.name,
        path: `/shop/${a.slug}/${g.slug}/${s.slug}`,
        level: 2,
        count: s.productCount,
        rawIds: [s.id],
        parentKey: `${a.slug}/${g.slug}`,
        children: (s.children || []).map((l4) => ({
          key: `${a.slug}/${g.slug}/${s.slug}/${l4.slug}`,
          displayName: l4.name,
          path: `/shop/${a.slug}/${g.slug}/${s.slug}/${l4.slug}`,
          level: 3,
          count: l4.productCount,
          rawIds: [l4.id],
          parentKey: `${a.slug}/${g.slug}/${s.slug}`,
          children: [],
        })),
      })),
    })),
  }))
}

/** Every customer-facing taxonomy path (for the sitemap). */
export async function flattenTaxonomyDb(): Promise<{ path: string; name: string; count: number }[]> {
  const tree = await getTaxonomyTree()
  const out: { path: string; name: string; count: number }[] = []
  for (const a of tree) {
    out.push({ path: `/shop/${a.slug}`, name: a.name, count: a.productCount })
    for (const g of a.groups) {
      out.push({ path: `/shop/${a.slug}/${g.slug}`, name: `${a.name} — ${g.name}`, count: g.productCount })
      for (const s of g.subcategories) {
        out.push({ path: `/shop/${a.slug}/${g.slug}/${s.slug}`, name: s.name, count: s.productCount })
      }
    }
  }
  return out
}

/** Every published node path at any depth (for pre-building all category pages). */
export async function allPublishedTaxonomyPaths(): Promise<string[]> {
  const rows = await pgQuery<{ id: string; parent_id: string | null; slug: string; depth: number }>(
    `SELECT id, parent_id, slug, depth FROM taxonomy_nodes WHERE status = 'published'`,
  )
  const byId = new Map(rows.map((r) => [r.id, r]))
  const paths = new Set<string>()
  for (const r of rows) {
    const segs: string[] = []
    let cur: typeof r | undefined = r
    while (cur) {
      segs.unshift(cur.slug)
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
    }
    if (segs.length === r.depth && segs.every(Boolean)) paths.add(`/shop/${segs.join("/")}`)
  }
  return [...paths]
}

// ----------------------------- PDP detail ---------------------------------

/** Mini recommendation card — the shared rail card contract. */
export type MiniRec = {
  id: string
  slug: string
  name: string
  brand: string | null
  image: string | null
  shortDescription: string | null
  priceCents: number | null
  compareAtPriceCents?: number | null
  isBestseller: boolean
  isOnSale: boolean
  isNew: boolean
  /** Catalog stock truth (variant attributes, default true when the
   *  supplier has not reported). Gates add-to-bag in recommendation
   *  cards: explicit false = Sold Out. */
  inStock: boolean
  /** Who sells this item (seller's shop or Portal Shop). Stamped by the
   *  PDP loader for enterprise-sourced recs. */
  soldBy?: SoldByAttribution
}

/** One swatch in a Chewy-style option picker ("Flavor: …", "Size: …"). */
export type PdpOption = {
  productId: string
  slug: string
  label: string
  priceCents: number | null
  image: string | null
  inStock: boolean
  isCurrent: boolean
  /** Supplier-reported units for this option's own record (null = unknown;
   *  only an explicit 0 — like an explicit inStock=false — gates buying). */
  stockQuantity?: number | null
  /** The option's named attributes (Color / Size / Dimensions / Count /
   *  Style), parsed from the supplier's flat variant string by
   *  lib/shop/catalog-text; the label above is composed from these in
   *  canonical order when any were found. */
  attributes?: { name: string; value: string }[]
}

export type PdpReview = {
  id: string
  author: string
  rating: number
  title: string | null
  body: string | null
  createdAt: string | null
  verified: boolean
}

export type PdpQa = { question: string; answer: string }

export type PdpArticle = { title: string; href: string; blurb: string | null }

export type PdpBreadcrumb = { name: string; path: string }

/**
 * Everything the dense PDP renders, in ONE resolved object:
 * identity + copy (description / ingredients / directions / warranty /
 * specifications), pricing, variant pickers, purchase programs (reship /
 * one-time / pickup / delivery), reviews, Q&A, associated articles and the
 * four recommendation rails. Built in ≤7 indexed queries and cached 60s so a
 * burst of product views costs the pool one query per slug per minute.
 */
export type PdpData = {
  /** The catalog item's id (commerce_catalog_items uuid). */
  id: string
  /** Provenance of the payload. Only "legacy" (the enterprise catalog)
   *  is produced since the feed catalog's tables were dropped and its
   *  PDP builder removed; "feed" remains in the union for stored/older
   *  payloads typed against this contract. */
  source: "feed" | "legacy"
  slug: string
  name: string
  brand: string | null
  brandId: string | null
  shortDescription: string | null
  description: string | null
  ingredients: string | null
  directions: string | null
  warranty: string | null
  specifications: string | null
  priceCents: number | null
  compareAtPriceCents: number | null
  isOnSale: boolean
  isNew: boolean
  isBestseller: boolean
  inStock: boolean
  /** Total sellable units across in-stock active variants (null = the feed
   *  doesn't report quantities for this product — urgency hides). */
  stockQuantity: number | null
  ratingAvg: number | null
  ratingCount: number
  reviews: PdpReview[]
  media: { url: string; alt: string | null; type: string | null }[]
  breadcrumb: PdpBreadcrumb[]
  /** "Dog" | "Cat" | … — powers pet-scoped rails and article matching. */
  petKind: string | null
  /** The product's own variant rows (size/color picks within one listing). */
  ownVariants: PdpOption[]
  /** Same-item sibling listings (variant_group_key group) — the other cards. */
  siblingOptions: PdpOption[]
  /** Chewy-style "Frequently bought together" (2 companions, same category). */
  frequentlyBoughtTogether: MiniRec[]
  /** "Customers also bought" — same category, 6. */
  alsoBought: MiniRec[]
  /** "More from this brand" — 6. */
  alsoViewed: MiniRec[]
  mayLike?: MiniRec[]
  /** Best sellers scoped to the product's animal (Best sellers for your pet). */
  bestSellersForPet: MiniRec[]
  /** Storewide trending picks (Trending products). */
  trending: MiniRec[]
  /** Associated grooming/care articles (guides). */
  articles: PdpArticle[]
  /** Q&A composed from the product's own published copy. */
  qa: PdpQa[]
  /** Reship program (site-wide policy, consistent with the PLP banners). */
  reship: { firstOrderPct: number; firstOrderCapCents: number; ongoingPct: number }
}

// Canonical Reship program policy — the unified intent route mirrors
// these values (src/app/api/shop/checkout/intent/route.ts §1b); change
// them in both places or neither.
export const RESHIP = { firstOrderPct: 35, firstOrderCapCents: 2000, ongoingPct: 5 }

