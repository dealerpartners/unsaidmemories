// Canonical taxonomy L1-L3 + Launch SKUs. Categories are a tree;
// collections/holidays/relationships are facets, NOT categories.
export type Category = { slug: string; name: string; level: 1|2|3; parent?: string; children?: Category[] };
export const CATEGORIES: Category[] = [
  { slug: 'apparel', name: 'Apparel', level: 1 },
  { slug: 'tops', name: 'Tops', level: 2, parent: 'apparel' },
  { slug: 'graphic-tees', name: 'Graphic tees', level: 3, parent: 'tops' },
  { slug: 'headwear', name: 'Headwear', level: 2, parent: 'apparel' },
  { slug: 'caps', name: 'Caps / beanies', level: 3, parent: 'headwear' },
  { slug: 'drinkware', name: 'Drinkware', level: 1 },
  { slug: 'mugs', name: 'Mugs', level: 2, parent: 'drinkware' },
  { slug: 'ceramic-mugs', name: 'Ceramic mugs', level: 3, parent: 'mugs' },
  { slug: 'gift-sets', name: 'Gift Sets', level: 1 },
  { slug: 'bundles', name: 'Bundles', level: 2, parent: 'gift-sets' },
  { slug: 'tee-mug-cap', name: 'Tee + mug + cap', level: 3, parent: 'bundles' },
  { slug: 'celebrations', name: 'Celebrations', level: 1 },
  { slug: 'gift-packaging', name: 'Gift Packaging', level: 2, parent: 'celebrations' },
  { slug: 'cards', name: 'Cards / gift wrap', level: 3, parent: 'gift-packaging' },
];
export type Product = { slug: string; name: string; category: string; brand: string; price: number; collections: string[] };
export const PRODUCTS: Product[] = [
  { slug: 'kin-keeper-premium-tee', name: 'Kin Keeper Premium Tee', category: 'graphic-tees', brand: 'Bella+Canvas', price: 34, collections: ['kin-keeper-month','all-unsaid-holidays','family-by-choice'] },
  { slug: 'kin-keeper-cap', name: 'Kin Keeper Cap', category: 'caps', brand: 'Yupoong', price: 28, collections: ['kin-keeper-month','all-unsaid-holidays'] },
  { slug: 'kin-keeper-mug', name: 'Kin Keeper Ceramic Mug', category: 'ceramic-mugs', brand: 'UnSaid', price: 22, collections: ['kin-keeper-month','all-unsaid-holidays','family-by-choice'] },
  { slug: 'kin-keeper-bundle', name: 'Kin Keeper Tee + Mug + Cap Bundle', category: 'tee-mug-cap', brand: 'UnSaid', price: 74, collections: ['kin-keeper-month'] },
  { slug: 'kin-keeper-card', name: 'Kin Keeper Card', category: 'cards', brand: 'UnSaid', price: 8, collections: ['kin-keeper-month','all-unsaid-holidays'] },
];
export function findCategory(slug: string) { return CATEGORIES.find(c => c.slug === slug); }
export function descendants(slug: string): string[] {
  const out: string[] = [slug];
  for (const c of CATEGORIES.filter(c => c.parent === slug)) out.push(...descendants(c.slug));
  return out;
}
export function productsForCategory(slug: string) {
  const allowed = new Set(descendants(slug));
  return PRODUCTS.filter(p => allowed.has(p.category));
}
