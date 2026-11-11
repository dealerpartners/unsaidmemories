// Store taxonomy — the tree itself is GENERATED from the store's own
// `categories` table (src/lib/taxonomy-data.ts, regenerated on every
// deploy by scripts/gen-taxonomy.mjs). These helpers resolve paths,
// names and children over that tree; the database is the source.

export interface TaxonomyNode {
  name: string;
  slug: string;
  count: number;
  children: TaxonomyNode[];
}

import { taxonomyData } from "./taxonomy-data";

export const taxonomy: TaxonomyNode[] = taxonomyData;

export interface FlatTaxonomyNode {
  node: TaxonomyNode;
  /** URL slug path, e.g. ["apparel", "hoodies-and-sweatshirts", "hoodies"]. */
  path: string[];
  /** Name path, e.g. ["Apparel", "Hoodies & Sweatshirts", "Hoodies"]. */
  names: string[];
  depth: number;
}

/** Flatten the whole tree in display order. */
export function flattenTaxonomy(): FlatTaxonomyNode[] {
  const out: FlatTaxonomyNode[] = [];
  const walk = (nodes: TaxonomyNode[], path: string[], names: string[], depth: number) => {
    for (const n of nodes) {
      const p = [...path, n.slug];
      const nm = [...names, n.name];
      out.push({ node: n, path: p, names: nm, depth });
      if (n.children?.length) walk(n.children, p, nm, depth + 1);
    }
  };
  walk(taxonomy, [], [], 1);
  return out;
}

/** Total node count of the tree. */
export function countTaxonomyNodes(): number {
  return flattenTaxonomy().length;
}

/** URL path for a node, e.g. "/shop/apparel/men". */
export function shopPath(path: string[]): string {
  return path.length ? `/shop/${path.join("/")}` : "/shop";
}

/** Find a node by NAME anywhere in the tree, returning the full chain
 *  from the department down to it. Grouping nodes like "Relationships"
 *  and "UnSaid Holidays" are nested under Collections & Occasions —
 *  a top-level-only find() misses them (that is what 404'd every
 *  /relationships/<slug> and /collections/<slug> page). */
export function findNodePathByName(
  name: string,
  nodes: TaxonomyNode[] = taxonomy,
  trail: TaxonomyNode[] = [],
): TaxonomyNode[] | null {
  for (const n of nodes) {
    const t = [...trail, n];
    if (n.name === name) return t;
    const hit = findNodePathByName(name, n.children ?? [], t);
    if (hit) return hit;
  }
  return null;
}

export function findCategoryByPath(slugs: string[]): { node: TaxonomyNode; ancestors: TaxonomyNode[] } | null {
  let nodes = taxonomy;
  let found: TaxonomyNode | null = null;
  const ancestors: TaxonomyNode[] = [];
  for (const slug of slugs) {
    const next = nodes.find(n => n.slug === slug);
    if (!next) return null;
    found = next;
    ancestors.push(found);
    nodes = found.children;
  }
  return found ? { node: found, ancestors: ancestors.slice(0, -1) } : null;
}

export function getChildren(node: TaxonomyNode): TaxonomyNode[] {
  return node.children || [];
}

export function getTopDepartments(): TaxonomyNode[] {
  return taxonomy;
}

