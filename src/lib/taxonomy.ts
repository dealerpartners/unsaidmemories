// Static taxonomy — 13 L1 departments, 265 nodes, 4 levels deep.
// Hardcoded, no database calls. Client-side rendered.

export interface TaxonomyNode {
  name: string;
  slug: string;
  count: number;
  children: TaxonomyNode[];
}

export const taxonomy: TaxonomyNode[] = [
  {
    name: "acessories",
    slug: "acessories",
    count: 0,
    children: [
    {
      name: "bags",
      slug: "bags",
      count: 0,
      children: [
      { name: "backpacks", slug: "backpacks", count: 0, children: [] },
      { name: "Drawstrinf Bags", slug: "drawstrinf-bags", count: 0, children: [] },
      { name: "Duffle Bags", slug: "duffle-bags", count: 0, children: [] },
      { name: "fanny packs", slug: "fanny-packs", count: 0, children: [] },
      { name: "handbags", slug: "handbags", count: 0, children: [] },
      { name: "Tote Bags", slug: "tote-bags", count: 0, children: [] },
      ],
    },
    {
      name: "Hat",
      slug: "hat",
      count: 0,
      children: [
      {
        name: "Hats",
        slug: "hats",
        count: 0,
        children: [
        { name: "5 Panel", slug: "5-panel", count: 0, children: [] },
        { name: "Beanies", slug: "beanies", count: 0, children: [] },
        { name: "Buscket", slug: "buscket", count: 0, children: [] },
        { name: "Dad Hats", slug: "dad-hats", count: 0, children: [] },
        { name: "Mesh hat", slug: "mesh-hat", count: 0, children: [] },
        { name: "Snap backs", slug: "snap-backs", count: 0, children: [] },
        { name: "truckers", slug: "truckers", count: 0, children: [] },
        { name: "Visors", slug: "visors", count: 0, children: [] },
        ],
      },
      ],
    },
    { name: "Patches", slug: "patches", count: 0, children: [] },
    { name: "Pins", slug: "pins", count: 0, children: [] },
    { name: "sports acessorieds", slug: "sports-acessorieds", count: 0, children: [] },
    {
      name: "tech accessories",
      slug: "tech-accessories",
      count: 0,
      children: [
      { name: "earphone Cases", slug: "earphone-cases", count: 0, children: [] },
      { name: "laptop cases", slug: "laptop-cases", count: 0, children: [] },
      { name: "Mosue Pads", slug: "mosue-pads", count: 0, children: [] },
      { name: "Phone cases", slug: "phone-cases", count: 0, children: [] },
      ],
    },
    ],
  },
  {
    name: "Children",
    slug: "children",
    count: 0,
    children: [
    { name: "Baby clothing", slug: "baby-clothing", count: 0, children: [] },
    { name: "Bottoms", slug: "bottoms", count: 0, children: [] },
    { name: "Dresses", slug: "dresses", count: 0, children: [] },
    {
      name: "Knitwear",
      slug: "knitwear",
      count: 0,
      children: [
      { name: "Hoodies", slug: "hoodies", count: 0, children: [] },
      { name: "Sweatshirts", slug: "sweatshirts", count: 0, children: [] },
      ],
    },
    {
      name: "Shirts",
      slug: "shirts",
      count: 0,
      children: [
      { name: "All Over Shirts", slug: "all-over-shirts", count: 0, children: [] },
      { name: "Long sleeves", slug: "long-sleeves", count: 0, children: [] },
      { name: "T-Shirts", slug: "t-shirts", count: 0, children: [] },
      ],
    },
    {
      name: "Shoes",
      slug: "shoes",
      count: 0,
      children: [
      { name: "Flip Flops", slug: "flip-flops", count: 0, children: [] },
      { name: "Shoes", slug: "shoes", count: 0, children: [] },
      { name: "Socks", slug: "socks", count: 0, children: [] },
      ],
    },
    { name: "Sportswear", slug: "sportswear", count: 0, children: [] },
    { name: "Sweatshirt", slug: "sweatshirt", count: 0, children: [] },
    ],
  },
  {
    name: "Home goods",
    slug: "home-goods",
    count: 0,
    children: [
    { name: "Babies & kids Essentials", slug: "babies-and-kids-essentials", count: 0, children: [] },
    {
      name: "Drinkware Bottles & tumblers",
      slug: "drinkware-bottles-and-tumblers",
      count: 0,
      children: [
      { name: "Coasters", slug: "coasters", count: 0, children: [] },
      { name: "Glasssware", slug: "glasssware", count: 0, children: [] },
      { name: "Glassware", slug: "glassware", count: 0, children: [] },
      { name: "Mugs", slug: "mugs", count: 0, children: [] },
      { name: "Tumblers", slug: "tumblers", count: 0, children: [] },
      { name: "Water bottles", slug: "water-bottles", count: 0, children: [] },
      ],
    },
    { name: "Flags & Signs", slug: "flags-and-signs", count: 0, children: [] },
    {
      name: "Home Decor",
      slug: "home-decor",
      count: 0,
      children: [
      { name: "Bathroom", slug: "bathroom", count: 0, children: [] },
      { name: "Candles", slug: "candles", count: 0, children: [] },
      { name: "Kitchen acessories", slug: "kitchen-acessories", count: 0, children: [] },
      { name: "New folder", slug: "new-folder", count: 0, children: [] },
      {
        name: "Pillows & Blankets",
        slug: "pillows-and-blankets",
        count: 0,
        children: [
        { name: "Bedding", slug: "bedding", count: 0, children: [] },
        { name: "Blankets", slug: "blankets", count: 0, children: [] },
        { name: "Pillow Covers", slug: "pillow-covers", count: 0, children: [] },
        { name: "Pillows", slug: "pillows", count: 0, children: [] },
        ],
      },
      { name: "Rugs & mats", slug: "rugs-and-mats", count: 0, children: [] },
      { name: "Tableware", slug: "tableware", count: 0, children: [] },
      { name: "Towels", slug: "towels", count: 0, children: [] },
      {
        name: "Wall Art",
        slug: "wall-art",
        count: 0,
        children: [
        { name: "Canvas Prints", slug: "canvas-prints", count: 0, children: [] },
        { name: "Framed Posters", slug: "framed-posters", count: 0, children: [] },
        { name: "Metal Prints", slug: "metal-prints", count: 0, children: [] },
        { name: "New folder", slug: "new-folder", count: 0, children: [] },
        ],
      },
      ],
    },
    {
      name: "Seasonal & Holiday decorations",
      slug: "seasonal-and-holiday-decorations",
      count: 0,
      children: [
      { name: "Ornamnets", slug: "ornamnets", count: 0, children: [] },
      ],
    },
    {
      name: "Stationary",
      slug: "stationary",
      count: 0,
      children: [
      { name: "Books", slug: "books", count: 0, children: [] },
      { name: "greetoing cards", slug: "greetoing-cards", count: 0, children: [] },
      { name: "Journals & Notebooks", slug: "journals-and-notebooks", count: 0, children: [] },
      { name: "Magnets & stickers", slug: "magnets-and-stickers", count: 0, children: [] },
      { name: "Notebooks", slug: "notebooks", count: 0, children: [] },
      { name: "Post Card", slug: "post-card", count: 0, children: [] },
      { name: "Postcards", slug: "postcards", count: 0, children: [] },
      { name: "Stickers", slug: "stickers", count: 0, children: [] },
      ],
    },
    ],
  },
  {
    name: "Men",
    slug: "men",
    count: 0,
    children: [
    {
      name: "Bottoms",
      slug: "bottoms",
      count: 0,
      children: [
      { name: "Leggings", slug: "leggings", count: 0, children: [] },
      { name: "Pants", slug: "pants", count: 0, children: [] },
      { name: "Shorts", slug: "shorts", count: 0, children: [] },
      { name: "sweatpants", slug: "sweatpants", count: 0, children: [] },
      ],
    },
    {
      name: "Knitwear",
      slug: "knitwear",
      count: 0,
      children: [
      { name: "Hoodies", slug: "hoodies", count: 0, children: [] },
      { name: "Sweatshirt", slug: "sweatshirt", count: 0, children: [] },
      ],
    },
    {
      name: "Outerwear",
      slug: "outerwear",
      count: 0,
      children: [
      { name: "Jackets & Vests", slug: "jackets-and-vests", count: 0, children: [] },
      ],
    },
    {
      name: "Shirts",
      slug: "shirts",
      count: 0,
      children: [
      { name: "All Over Shirts", slug: "all-over-shirts", count: 0, children: [] },
      { name: "Crop Tops", slug: "crop-tops", count: 0, children: [] },
      { name: "Embroidered Shirts", slug: "embroidered-shirts", count: 0, children: [] },
      { name: "Long sleeves", slug: "long-sleeves", count: 0, children: [] },
      { name: "Polo shirts", slug: "polo-shirts", count: 0, children: [] },
      { name: "T-Shirts", slug: "t-shirts", count: 0, children: [] },
      { name: "Tank tops", slug: "tank-tops", count: 0, children: [] },
      ],
    },
    {
      name: "Shoes",
      slug: "shoes",
      count: 0,
      children: [
      { name: "Flip Flops", slug: "flip-flops", count: 0, children: [] },
      { name: "Shoes", slug: "shoes", count: 0, children: [] },
      { name: "Socks", slug: "socks", count: 0, children: [] },
      ],
    },
    {
      name: "Sleepwear & Underwear",
      slug: "sleepwear-and-underwear",
      count: 0,
      children: [
      { name: "Pajamas", slug: "pajamas", count: 0, children: [] },
      { name: "Underwear", slug: "underwear", count: 0, children: [] },
      ],
    },
    {
      name: "Sportswear",
      slug: "sportswear",
      count: 0,
      children: [
      { name: "swimwear", slug: "swimwear", count: 0, children: [] },
      ],
    },
    { name: "workwear", slug: "workwear", count: 0, children: [] },
    ],
  },
  {
    name: "Women",
    slug: "women",
    count: 0,
    children: [
    {
      name: "Bottoms",
      slug: "bottoms",
      count: 0,
      children: [
      { name: "Leggings", slug: "leggings", count: 0, children: [] },
      { name: "Pants", slug: "pants", count: 0, children: [] },
      { name: "shorts", slug: "shorts", count: 0, children: [] },
      { name: "SweatPants & joggers", slug: "sweatpants-and-joggers", count: 0, children: [] },
      ],
    },
    {
      name: "Knitwear",
      slug: "knitwear",
      count: 0,
      children: [
      { name: "Hoodies", slug: "hoodies", count: 0, children: [] },
      { name: "Sweatshirt", slug: "sweatshirt", count: 0, children: [] },
      ],
    },
    {
      name: "Outerwear",
      slug: "outerwear",
      count: 0,
      children: [
      { name: "Jackets & Vests", slug: "jackets-and-vests", count: 0, children: [] },
      ],
    },
    {
      name: "Shirts",
      slug: "shirts",
      count: 0,
      children: [
      { name: "All Over Shirts", slug: "all-over-shirts", count: 0, children: [] },
      { name: "Crop Tops", slug: "crop-tops", count: 0, children: [] },
      { name: "Embroidered Shirts", slug: "embroidered-shirts", count: 0, children: [] },
      { name: "Long sleeves", slug: "long-sleeves", count: 0, children: [] },
      { name: "Polo shirts", slug: "polo-shirts", count: 0, children: [] },
      { name: "T-Shirts", slug: "t-shirts", count: 0, children: [] },
      { name: "Tank tops", slug: "tank-tops", count: 0, children: [] },
      ],
    },
    {
      name: "Shoes",
      slug: "shoes",
      count: 0,
      children: [
      { name: "Flip Flops", slug: "flip-flops", count: 0, children: [] },
      { name: "Shoes", slug: "shoes", count: 0, children: [] },
      { name: "Socks", slug: "socks", count: 0, children: [] },
      ],
    },
    {
      name: "Skirts & dresses",
      slug: "skirts-and-dresses",
      count: 0,
      children: [
      { name: "Dresses", slug: "dresses", count: 0, children: [] },
      { name: "Skirts", slug: "skirts", count: 0, children: [] },
      ],
    },
    { name: "Sleepwear & Underwear", slug: "sleepwear-and-underwear", count: 0, children: [] },
    {
      name: "Sportswear",
      slug: "sportswear",
      count: 0,
      children: [
      { name: "Sports Bras", slug: "sports-bras", count: 0, children: [] },
      { name: "swimwear", slug: "swimwear", count: 0, children: [] },
      ],
    },
    { name: "workwear", slug: "workwear", count: 0, children: [] },
    ],
  }
];

export interface FlatTaxonomyNode {
  node: TaxonomyNode;
  /** URL slug path, e.g. ["apparel", "hoodies-and-sweatshirts", "hoodies"]. */
  path: string[];
  /** Name path, e.g. ["Apparel", "Hoodies & Sweatshirts", "Hoodies"]. */
  names: string[];
  depth: number;
}

/** Flatten the whole static tree (265 nodes) in display order. */
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

/** Total node count of the static tree (spec: 278). */
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

