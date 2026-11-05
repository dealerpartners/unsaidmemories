/**
 * Size guides — the owner's structure (his unsaid-size-guide.html,
 * 2026-10-31): a directory of departments → categories → one guide
 * per product, each guide with its own slug (a real route at
 * /size-guide/<slug>), its own intro copy, a measurement-basis
 * label, and its chart. Arranged by product, never by vendor; no
 * vendor is named in any customer-facing string. Values are stored
 * in inches as published; centimetres are converted at render
 * (ranges convert per number; weights and "—" never convert).
 *
 * The numbers are transcribed from the makers' published charts;
 * provenance is recorded in the harvest notes, not on the page.
 */

export interface GuideRow {
  label: string;
  values: string[];
  kind: "in" | "range" | "weight";
}

export interface SizeGuideChart {
  id: string;
  department: string;
  category: string;
  name: string;
  slug: string;
  intro: string;
  note: string;
  sizes: string[];
  rows: GuideRow[];
  /** Measurement basis, shown as the guide's label. */
  variant: string;
}

export const SIZE_GUIDE_DEPARTMENTS = [
  "Clothing",
  "Hoodies & Sweatshirts",
  "Baby & Toddler",
  "Kids",
] as const;

export const sizeGuideCharts: SizeGuideChart[] = [
  {
    id: "unisex-bella-3001",
    department: "Clothing",
    category: "Unisex T-Shirts",
    name: "Unisex Tee — Bella + Canvas 3001",
    slug: "unisex-tee-bella-canvas-3001",
    intro: "A classic unisex tee with garment measurements taken flat. Compare the width and length with a tee you already own for the closest fit.",
    note: "Garment measurements are taken with the garment laid flat. Chest-to-fit is a body measurement range, not the garment width.",
    sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
    rows: [
      { label: "Length", values: ["27", "28", "29", "30", "31", "32", "33", "34", "35"], kind: "in" },
      { label: "Width (laid flat)", values: ["16.5", "18", "20", "22", "24", "26", "28", "30", "31"], kind: "in" },
      { label: "Chest to fit", values: ["31–34", "34–37", "38–41", "42–45", "46–49", "50–53", "54–57", "58–61", "62–65"], kind: "range" },
    ],
    variant: "Garment measurements",
  },
  {
    id: "unisex-bella-3001-alt",
    department: "Clothing",
    category: "Unisex T-Shirts",
    name: "Unisex Tee — Bella + Canvas 3001 (alternate published chart)",
    slug: "unisex-tee-bella-canvas-3001-alternate",
    intro: "An alternate published size chart for this tee. Use the chart attached to the specific product listing when available.",
    note: "Chest-to-fit is a body measurement range. Body length is measured from the high point of shoulder (HPS).",
    sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
    rows: [
      { label: "Chest to fit", values: ["34–37", "38–41", "43–45", "46–49", "50–53", "54–57"], kind: "range" },
      { label: "Body length from HPS", values: ["28", "29", "30", "31", "32", "33"], kind: "in" },
    ],
    variant: "Alternate published measurements",
  },
  {
    id: "hoodie-gildan-18500",
    department: "Hoodies & Sweatshirts",
    category: "Pullover Hoodies",
    name: "Heavy Blend Pullover Hoodie — Gildan 18500",
    slug: "heavy-blend-pullover-hoodie-gildan-18500",
    intro: "A classic heavyweight pullover hoodie. Measurements describe the garment itself, not the body wearing it.",
    note: "Garment measurements are taken flat. Sleeve length is measured from the centre back.",
    sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
    rows: [
      { label: "Body length", values: ["27", "28", "29", "30", "31", "32", "33", "34"], kind: "in" },
      { label: "Chest width (laid flat)", values: ["20", "22", "24", "26", "28", "30", "32", "34"], kind: "in" },
      { label: "Sleeve length (from centre back)", values: ["33.5", "34.5", "35.5", "36.5", "37.5", "38.5", "39.5", "40.5"], kind: "in" },
    ],
    variant: "Garment measurements",
  },
  {
    id: "womens-bella-6004",
    department: "Clothing",
    category: "Women's T-Shirts",
    name: "Women's Slim-Fit Tee — Bella + Canvas 6004",
    slug: "womens-slim-fit-tee-bella-canvas-6004",
    intro: "A fitted women's silhouette. This cut is narrower than the unisex tee, so compare the garment measurements before choosing your usual size.",
    note: "Garment measurements are taken flat. This style has a slimmer fit than the unisex tee.",
    sizes: ["S", "M", "L", "XL", "2XL"],
    rows: [
      { label: "Body width", values: ["16", "16.75", "17.75", "18.75", "19.75"], kind: "in" },
      { label: "Body length", values: ["26.25", "26.75", "27.25", "28", "28.5"], kind: "in" },
      { label: "Sleeve length", values: ["6.25", "6.5", "6.75", "7.25", "7.5"], kind: "in" },
    ],
    variant: "Garment measurements",
  },
  {
    id: "baby-bodysuit-100b",
    department: "Baby & Toddler",
    category: "Baby Bodysuits",
    name: "Baby Bodysuit — Bella + Canvas 100B",
    slug: "baby-bodysuit-bella-canvas-100b",
    intro: "A one-piece baby bodysuit. The chart combines garment width with the baby length and weight ranges each size is designed to fit.",
    note: "Width is a garment measurement. Baby length and weight are fit ranges.",
    sizes: ["3–6M", "6–12M", "12–18M", "18–24M"],
    rows: [
      { label: "Width", values: ["9 ⅜", "9 ⅞", "10 ⅜", "10 ⅞"], kind: "in" },
      { label: "Fits baby length", values: ["20–25", "25–28", "28–30", "30–32"], kind: "range" },
      { label: "Fits baby weight", values: ["12–16 lbs", "16–22 lbs", "22–27 lbs", "27–30 lbs"], kind: "weight" },
    ],
    variant: "Garment width & baby fit",
  },
  {
    id: "classic-gildan-64000",
    department: "Clothing",
    category: "Classic T-Shirts",
    name: "Classic Tee — Gildan 64000",
    slug: "classic-tee-gildan-64000",
    intro: "A classic everyday tee with published chest-to-fit and garment-length measurements.",
    note: "The original chart publishes measurements in millimetres with inch conversions. XS garment length is not published.",
    sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"],
    rows: [
      { label: "Chest to fit", values: ["32", "34", "38", "42", "46", "50", "54"], kind: "range" },
      { label: "Garment length", values: ["—", "28", "29.2", "30.2", "31.2", "32.5", "33.5"], kind: "in" },
    ],
    variant: "Published chest & length measurements",
  },
  {
    id: "baby-tee-lat-3322",
    department: "Baby & Toddler",
    category: "Baby & Toddler T-Shirts",
    name: "Baby Tee — LAT Apparel 3322",
    slug: "baby-tee-lat-apparel-3322",
    intro: "A baby tee with width, length and sleeve measurements across four age-based sizes.",
    note: "Measurements describe the garment.",
    sizes: ["6 months", "12 months", "18 months", "24 months"],
    rows: [
      { label: "Width", values: ["10", "11", "12", "13"], kind: "in" },
      { label: "Length", values: ["12.5", "13.5", "14.4", "15.5"], kind: "in" },
      { label: "Sleeve length", values: ["3.7", "4", "4.5", "4.8"], kind: "in" },
    ],
    variant: "Garment measurements",
  },
  {
    id: "classic-bella-3001-go",
    department: "Clothing",
    category: "Classic T-Shirts",
    name: "Classic Tee — Bella + Canvas 3001",
    slug: "classic-tee-bella-canvas-3001",
    intro: "A classic tee with published garment width and length measurements. Compare the flat width against a similar tee you own.",
    note: "Garment measurements are taken flat.",
    sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"],
    rows: [
      { label: "Width", values: ["16.5", "18", "20", "22", "24", "26", "28", "30"], kind: "in" },
      { label: "Length", values: ["27", "28", "29", "30", "31", "32", "33", "34"], kind: "in" },
    ],
    variant: "Garment measurements",
  },
  {
    id: "hoodie-gildan-18500-simple",
    department: "Hoodies & Sweatshirts",
    category: "Pullover Hoodies",
    name: "Unisex Pullover Hoodie — Gildan 18500",
    slug: "unisex-pullover-hoodie-gildan-18500",
    intro: "A classic unisex pullover hoodie with body length and flat chest-width measurements.",
    note: "Garment measurements are taken flat.",
    sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
    rows: [
      { label: "Width (laid flat)", values: ["20", "22", "24", "26", "28", "30", "32", "34"], kind: "in" },
      { label: "Length", values: ["27", "28", "29", "30", "31", "32", "33", "34"], kind: "in" },
    ],
    variant: "Garment measurements",
  },
  {
    id: "mens-body-measurements",
    department: "Clothing",
    category: "Men's & Unisex Clothing",
    name: "Men's Tees & Sweatshirts — Body Measurements",
    slug: "mens-tees-sweatshirts-body-measurements",
    intro: "This chart sizes by your body measurements rather than the garment. Measure around your chest just below your armpits. If you fall between sizes, choose the larger size.",
    note: "These are body measurements, not garment measurements.",
    sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
    rows: [
      { label: "Chest (body)", values: ["34", "37", "39", "41", "46", "51", "53", "56", "63.8"], kind: "in" },
      { label: "Waist (body)", values: ["28", "30", "32", "35", "39", "44", "47", "51", "54"], kind: "in" },
    ],
    variant: "Body measurements",
  },
  {
    id: "womens-body-measurements",
    department: "Clothing",
    category: "Women's Clothing",
    name: "Women's Tees & Sweatshirts — Body Measurements",
    slug: "womens-tees-sweatshirts-body-measurements",
    intro: "This chart uses your body measurements. Measure your bust around the fullest part of your torso, just below your armpits.",
    note: "These are body measurements. Sizes are UK numeric sizes.",
    sizes: ["8", "10", "12", "14", "16", "18"],
    rows: [
      { label: "Bust (body)", values: ["33", "35", "36", "38", "41", "43"], kind: "in" },
      { label: "Waist (body)", values: ["26", "28", "30", "32", "34", "36"], kind: "in" },
    ],
    variant: "UK body measurements",
  },
  {
    id: "kids-body-measurements",
    department: "Kids",
    category: "Kids' Clothing",
    name: "Kids' Clothing — Body Measurements",
    slug: "kids-clothing-body-measurements",
    intro: "Choose a size using the child's height and chest measurements. The published chart uses centimetres; inch values are shown here as supplied in the provided sizing information.",
    note: "These are body measurements, not garment measurements.",
    sizes: ["3–4 years", "5–6 years", "7–8 years", "9–10 years", "11–12 years"],
    rows: [
      { label: "Height (body)", values: ["38.6", "44.1", "49.2", "53.5", "57.9"], kind: "in" },
      { label: "Chest (body)", values: ["23.6", "26", "27.6", "29.5", "33.1"], kind: "in" },
    ],
    variant: "Body measurements",
  },
];

export function findSizeGuide(slug: string): SizeGuideChart | undefined {
  return sizeGuideCharts.find((c) => c.slug === slug);
}

const byId = (id: string): SizeGuideChart => sizeGuideCharts.find((c) => c.id === id)!;

/**
 * The owner's taxonomy rule: when a shopper opens a department's
 * child (subcategory) page, THAT page renders the size guide for
 * its product type. Resolves a taxonomy slug path to the guides
 * that belong on it — name-based and deliberately conservative:
 * no match, no guide section. Women/kids/baby context comes from
 * the ancestor names in the path.
 */
export function sizeGuidesForShopNames(names: string[]): SizeGuideChart[] {
  // The guide renders on the department's CHILD page (the
  // subcategory), not on department landings — name paths of
  // depth 3+ only (e.g. Apparel / Men / T-Shirts).
  if (names.length < 3) return [];
  const leaf = names[names.length - 1] ?? "";
  const pathText = names.join(" ");
  const isWomen = /women/i.test(pathText);
  const isKids = /kids/i.test(pathText);
  const isBaby = /baby|babies|toddler/i.test(pathText);

  // Hoodies/sweatshirts first: "Sweatshirts" contains "tshirts",
  // and the tee test is word-bounded for the same reason.
  if (/hoodie|sweatshirt/i.test(leaf)) {
    if (isKids) return [byId("kids-body-measurements")];
    if (isWomen) return [byId("hoodie-gildan-18500"), byId("womens-body-measurements")];
    return [byId("hoodie-gildan-18500"), byId("hoodie-gildan-18500-simple")];
  }
  if (/\bt-?shirts?\b/i.test(leaf)) {
    if (isWomen) return [byId("womens-bella-6004"), byId("womens-body-measurements")];
    if (isBaby) return [byId("baby-bodysuit-100b"), byId("baby-tee-lat-3322")];
    if (isKids) return [byId("kids-body-measurements")];
    return [
      byId("unisex-bella-3001"),
      byId("classic-bella-3001-go"),
      byId("classic-gildan-64000"),
      byId("mens-body-measurements"),
    ];
  }
  if (/bodysuit/i.test(leaf)) return [byId("baby-bodysuit-100b")];
  return [];
}

/** Department → category → charts, in the owner's department order. */
export function sizeGuideDirectory(): { department: string; categories: { name: string; charts: SizeGuideChart[] }[] }[] {
  return SIZE_GUIDE_DEPARTMENTS.map((department) => {
    const inDept = sizeGuideCharts.filter((c) => c.department === department);
    const catNames = [...new Set(inDept.map((c) => c.category))];
    return {
      department,
      categories: catNames.map((name) => ({
        name,
        charts: inDept.filter((c) => c.category === name),
      })),
    };
  }).filter((d) => d.categories.length > 0);
}

/** Mug & drinkware finished dimensions (kept from the prior guide). */
export const drinkwareDims = {
  title: "Mugs & drinkware — White Glossy Mug",
  basis:
    "Finished dimensions of the finished piece. For other drinkware, the product page lists the exact dimensions and capacity.",
  rows: [
    { size: "11 oz", height: "3.85 in / 9.8 cm", diameter: "3.35 in / 8.5 cm" },
    { size: "15 oz", height: "4.7 in / 12 cm", diameter: "3.35 in / 8.5 cm" },
    { size: "20 oz", height: "4.3 in / 10.9 cm", diameter: "3.7 in / 9.3 cm" },
  ],
};
