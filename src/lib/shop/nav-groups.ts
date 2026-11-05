import { categoryConcept } from "./category-images"

type G = { slug: string; name: string; productCount: number; subcategories: unknown[] }

/**
 * The live tree carries duplicate departments from two merged taxonomies
 * ("dog-beds" + "dog-beds-and-bedding"). Drop empties and collapse
 * same-concept duplicates, keeping the node with the most products.
 */
export function canonicalGroups<T extends G>(groups: T[]): T[] {
  const best = new Map<string, T>()
  const keep: T[] = []
  const score = (x: T) => x.productCount * 1000 + x.subcategories.length
  for (const g of groups) {
    if (g.productCount <= 0) continue
    const concept = categoryConcept(`${g.slug} ${g.name}`)
    if (!concept) {
      keep.push(g)
      continue
    }
    const cur = best.get(concept)
    if (!cur || score(g) > score(cur)) best.set(concept, g)
  }
  return [...keep, ...best.values()].sort((x, y) => y.productCount - x.productCount)
}
