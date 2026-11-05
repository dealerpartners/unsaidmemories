// ---------------------------------------------------------------------------
// sellers/catalog-import-spec.ts — THE canonical seller catalog import
// contract (§2.8 create-import), as code. This module is the single source
// for: the column list (the imports page renders its guide from it and
// the template endpoint emits it), the alias table, and the pure
// translator that turns parsed CSV rows into validated, grouped domain
// objects (products keyed by parent_key, each with its variants) plus a
// per-row error list. Both the dry-run and the real import run THIS
// translator, so what validates is exactly what writes.
//
// The model (dossier Q7 — CATALOG_IMPORT_RESEARCH.md):
//   - One row per variant (SKU); rows sharing parent_key form one
//     product (the SPU). Shopify's handle model / Amazon's parent-child
//     model, with Portal names.
//   - Prices are DOLLARS in the file, in commerce_prices, and in
//     erp_product_skus.unit_price. Cents exist only at the single-
//     listing form's API edge, never here.
//   - GTINs are validated for length (8/12/13/14) AND check digit.
//   - Category is a taxonomy SLUG PATH resolved against the published
//     taxonomy_nodes tree — an unresolvable path is a row error,
//     because without a node the product is in no aisle.
//   - Pet/content attribute columns are validated against the live
//     attributes/attribute_values dictionary — a value the dictionary
//     doesn't carry is a row error, not a free-text invention.
//   - Unknown columns are a FILE-level error (the §2.2 bulk-edit rule):
//     a mistyped header must never silently drop a seller's data.
//   - Axis consistency is enforced per parent_key: every row of a
//     product declares the same axis names, and no two rows repeat an
//     axis-value combination.
//   - Product-level fields (title, brand, category, copy…) are one
//     value per product: repeats must agree, conflicts are row errors.
//   - A product with ANY rejected row is not written at all — a variant
//     set with a hole in it is worse than none. Every rejected row is
//     returned (and persisted by the route to
//     seller_catalog_import_errors) with row number, sku and messages.
//
// The translator is pure: taxonomy resolution, the attribute dictionary
// and tax codes arrive as injected lookups, so the same function runs
// in the route (live lookups) and in the self-test (fixtures).
// ---------------------------------------------------------------------------

import { prohibitedCopyHits } from "./listing-quality";
import {
  normalizeProductDescription,
  normalizeProductName,
  parseVariantAttributes,
} from "@/lib/shop/catalog-text";

// ---------------------------------------------------------------------------
// Column contract
// ---------------------------------------------------------------------------

export interface ImportColumn {
  /** Canonical header name in the file. */
  name: string;
  /** Other header spellings accepted for this column. */
  aliases: string[];
  group: "identity" | "variant" | "pricing" | "inventory" | "media" | "content" | "pet" | "logistics";
  /** Required at file level (the column must exist)… */
  requiredColumn?: boolean;
  /** …and/or required to carry a value on every row. */
  requiredValue?: boolean;
  /** One-line seller-facing guidance, rendered by the imports page. */
  help: string;
  /** Pet attribute dictionary slug this column validates against. */
  attributeSlug?: string;
}

export const IMPORT_COLUMNS: ImportColumn[] = [
  // identity & product -------------------------------------------------
  { name: "parent_key", aliases: ["parent_sku", "handle", "variant_group_id", "product_key", "spu", "parent"], group: "identity", requiredColumn: true, requiredValue: true, help: "Groups rows into one product. Every variant of a product repeats the same parent_key." },
  { name: "sku", aliases: ["item_sku", "variant_sku", "seller_sku"], group: "identity", requiredColumn: true, requiredValue: true, help: "Your unique SKU for this variant. Re-importing the same SKU updates it — it never duplicates." },
  { name: "gtin", aliases: ["upc", "ean", "barcode", "gtin14", "isbn"], group: "identity", requiredValue: true, help: "UPC/EAN/GTIN for this variant (8, 12, 13 or 14 digits, check digit validated)." },
  { name: "title", aliases: ["name", "product_title", "item_name"], group: "identity", requiredColumn: true, requiredValue: true, help: "Product title (max 300 characters). Same on every row of a product." },
  { name: "brand", aliases: ["vendor", "manufacturer"], group: "identity", requiredColumn: true, requiredValue: true, help: "Brand name. Registered brands require your approved brand authorization." },
  { name: "category", aliases: ["category_path", "taxonomy_path", "category_slug"], group: "identity", requiredColumn: true, requiredValue: true, help: "Taxonomy slug path, e.g. dog/food/dry-food. Must resolve to a real shop category." },
  { name: "status", aliases: ["listing_status"], group: "identity", help: "draft keeps the product unpublished. Anything else publishes on import (approved sellers)." },
  { name: "condition", aliases: [], group: "identity", help: "new (default), used or refurbished." },
  // variant axes -------------------------------------------------------
  { name: "option1_name", aliases: ["axis1_name"], group: "variant", help: "First variant axis name — size, color, flavor, count or scent." },
  { name: "option1_value", aliases: ["axis1_value"], group: "variant", help: "This row's value on axis 1, e.g. 28.3 oz." },
  { name: "option2_name", aliases: ["axis2_name"], group: "variant", help: "Second variant axis name, if the product varies two ways." },
  { name: "option2_value", aliases: ["axis2_value"], group: "variant", help: "This row's value on axis 2." },
  { name: "option3_name", aliases: ["axis3_name"], group: "variant", help: "Third variant axis name, if needed." },
  { name: "option3_value", aliases: ["axis3_value"], group: "variant", help: "This row's value on axis 3." },
  { name: "variant_label", aliases: ["option_label"], group: "variant", help: "Optional picker label override. Defaults to the axis values joined, e.g. “Red · Large”." },
  // pricing (dollars) --------------------------------------------------
  { name: "price", aliases: ["unit_price", "standard_price", "base_price"], group: "pricing", requiredColumn: true, requiredValue: true, help: "Selling price in dollars, e.g. 25.00. Never cents." },
  { name: "compare_at_price", aliases: ["compare_at", "list_price", "msrp"], group: "pricing", help: "The struck-through “was” price in dollars. Must be higher than price." },
  { name: "cost_price", aliases: ["cost", "cost_per_item"], group: "pricing", help: "Your cost in dollars (margin reporting; never shown to shoppers)." },
  { name: "sale_start", aliases: ["sale_start_date"], group: "pricing", help: "Sale window start (YYYY-MM-DD). Sets the price row's validity start." },
  { name: "sale_end", aliases: ["sale_end_date"], group: "pricing", help: "Sale window end (YYYY-MM-DD)." },
  // inventory ----------------------------------------------------------
  { name: "quantity", aliases: ["stock", "qty", "stock_quantity", "inventory_quantity", "inventory"], group: "inventory", requiredColumn: true, requiredValue: true, help: "Units on hand for this variant (whole number, 0 or more)." },
  { name: "track_inventory", aliases: ["track_stock"], group: "inventory", help: "true (default) / false — whether stock counts against this variant." },
  { name: "bin_location", aliases: ["bin", "location"], group: "inventory", help: "Your warehouse bin/shelf for this variant." },
  // media --------------------------------------------------------------
  { name: "image_url_1", aliases: ["image_url", "main_image_url", "image_src", "image"], group: "media", help: "Primary product image URL (http/https)." },
  { name: "image_url_2", aliases: ["other_image_url1"], group: "media", help: "Second product image URL." },
  { name: "image_url_3", aliases: ["other_image_url2"], group: "media", help: "Third product image URL." },
  { name: "image_url_4", aliases: ["other_image_url3"], group: "media", help: "Fourth product image URL." },
  { name: "image_url_5", aliases: ["other_image_url4"], group: "media", help: "Fifth product image URL." },
  { name: "image_alt_1", aliases: ["image_alt"], group: "media", help: "Alt text for image 1." },
  { name: "image_alt_2", aliases: [], group: "media", help: "Alt text for image 2." },
  { name: "image_alt_3", aliases: [], group: "media", help: "Alt text for image 3." },
  { name: "image_alt_4", aliases: [], group: "media", help: "Alt text for image 4." },
  { name: "image_alt_5", aliases: [], group: "media", help: "Alt text for image 5." },
  { name: "variant_image_url", aliases: ["variant_image"], group: "media", help: "This variant's own image URL (e.g. the red one). Becomes the variant's primary image." },
  // content ------------------------------------------------------------
  { name: "short_description", aliases: ["short_desc", "subtitle"], group: "content", help: "One-line summary shown on cards and above the buy box (max 500 characters)." },
  { name: "description", aliases: ["body", "details", "product_description", "body_html"], group: "content", help: "Full product description (max 5000 characters)." },
  { name: "key_features", aliases: ["features", "bullets", "bullet_points", "specifications", "specs"], group: "content", help: "Key features / specifications, separated with · — rendered as the PDP highlights and specs tab." },
  { name: "ingredients", aliases: [], group: "content", help: "Full ingredient list (food/treats). Rendered on the PDP ingredients tab." },
  { name: "directions", aliases: ["feeding_directions", "usage", "instructions"], group: "content", help: "Feeding / usage directions. Rendered on the PDP directions tab." },
  { name: "warnings", aliases: ["warning", "caution"], group: "content", help: "Warnings / cautions for the product." },
  // pet attributes (validated against the platform dictionary) ---------
  { name: "species", aliases: ["pet", "pet_type", "animal"], group: "pet", attributeSlug: "pet", help: "Pet species — a value from the platform dictionary (Dog, Cat, …). Separate multiple values with ;" },
  { name: "life_stage", aliases: ["lifestage"], group: "pet", attributeSlug: "lifestage", help: "Life stage from the dictionary (Puppy, Adult, Senior, …). Separate multiple values with ;" },
  { name: "flavor", aliases: [], group: "pet", attributeSlug: "flavor", help: "Flavor from the dictionary (Chicken, Salmon, …). Separate multiple values with ;" },
  { name: "food_form", aliases: ["foodform"], group: "pet", attributeSlug: "food-form", help: "Food form from the dictionary. Separate multiple values with ;" },
  { name: "breed_size", aliases: ["breedsize"], group: "pet", attributeSlug: "breed-size", help: "Breed size from the dictionary. Separate multiple values with ;" },
  { name: "dietary_preference", aliases: ["dietary", "diet"], group: "pet", attributeSlug: "dietary-preference", help: "Dietary preference from the dictionary (Grain-Free, …). Separate multiple values with ;" },
  { name: "health_concern", aliases: ["health_concerns"], group: "pet", attributeSlug: "health-concern", help: "Health concern from the dictionary. Separate multiple values with ;" },
  { name: "health_feature", aliases: [], group: "pet", attributeSlug: "health-feature", help: "Health feature from the dictionary. Separate multiple values with ;" },
  { name: "material", aliases: [], group: "pet", attributeSlug: "material", help: "Material from the dictionary. Separate multiple values with ;" },
  { name: "scent", aliases: [], group: "pet", attributeSlug: "scent", help: "Scent from the dictionary. Separate multiple values with ;" },
  { name: "product_weight_label", aliases: ["product_weight"], group: "pet", attributeSlug: "product-weight", help: "Shelf weight label from the dictionary (e.g. a bag-size band). Separate multiple values with ;" },
  { name: "package_size", aliases: ["packagesize"], group: "pet", attributeSlug: "package-size", help: "Package size from the dictionary. Separate multiple values with ;" },
  // logistics ----------------------------------------------------------
  { name: "weight", aliases: ["weight_value", "variant_weight"], group: "logistics", help: "Variant weight (number) — shipping is priced from this." },
  { name: "weight_unit", aliases: ["weight_uom"], group: "logistics", help: "lb, oz, kg or g (default lb when weight is given)." },
  { name: "length", aliases: ["package_length"], group: "logistics", help: "Package length (number)." },
  { name: "width", aliases: ["package_width"], group: "logistics", help: "Package width (number)." },
  { name: "height", aliases: ["package_height"], group: "logistics", help: "Package height (number)." },
  { name: "dimension_unit", aliases: ["dimension_uom"], group: "logistics", help: "in (default) or cm." },
  { name: "fulfillment_type", aliases: ["fulfillment"], group: "logistics", help: "seller_fulfilled (default), platform or dropship." },
  { name: "handling_days", aliases: ["handling_time", "lead_time_days"], group: "logistics", help: "Days before this product ships (0–60)." },
  { name: "taxable", aliases: [], group: "logistics", help: "true (default) / false." },
  { name: "tax_code", aliases: ["tax_code_name"], group: "logistics", help: "Platform tax code (code or name from the tax code list)." },
];

export const IMPORT_COLUMN_NAMES: string[] = IMPORT_COLUMNS.map((c) => c.name);

const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const col of IMPORT_COLUMNS) {
  ALIAS_TO_CANONICAL.set(col.name, col.name);
  for (const a of col.aliases) ALIAS_TO_CANONICAL.set(a, col.name);
}

/** Header normalization: trim, lowercase, spaces/hyphens → underscores. */
export function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Map a file header to its canonical column name, or null if unknown. */
export function canonicalColumn(header: string): string | null {
  return ALIAS_TO_CANONICAL.get(normalizeHeader(header)) ?? null;
}

export const MAX_IMPORT_ROWS = 1000;
const MAX_PRICE = 1_000_000;
const MAX_QUANTITY = 1_000_000;
const MAX_TITLE = 300;
const MAX_DESCRIPTION = 5000;
const MAX_SHORT_DESCRIPTION = 500;

// ---------------------------------------------------------------------------
// GTIN validation (mod-10 check digit — GTIN-8/12/13/14 share it)
// ---------------------------------------------------------------------------

export function gtinCheckDigitValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  // Weight digits 3,1,3,1… from the RIGHT, excluding the check digit.
  let sum = 0;
  const body = digits.slice(0, -1);
  for (let i = 0; i < body.length; i++) {
    const d = body.charCodeAt(body.length - 1 - i) - 48;
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === digits.charCodeAt(digits.length - 1) - 48;
}

export function validateGtin(raw: string): string | null {
  const g = raw.replace(/[\s-]/g, "");
  if (!g) return "GTIN is required";
  if (!/^\d+$/.test(g)) return `GTIN "${raw}" must be digits only`;
  if (![8, 12, 13, 14].includes(g.length)) {
    return `GTIN "${raw}" must be 8, 12, 13 or 14 digits (got ${g.length})`;
  }
  if (!gtinCheckDigitValid(g)) return `GTIN "${raw}" fails its check digit — re-check the barcode`;
  return null;
}

export function gtinType(digits: string): string {
  // Values per the live CHECK catalog_gtins_gtin_type_check.
  switch (digits.replace(/[\s-]/g, "").length) {
    case 12: return "UPC-A";
    case 13: return "GTIN-13";
    case 14: return "GTIN-14";
    case 8: return "GTIN-8";
    default: return "GTIN-14";
  }
}

// ---------------------------------------------------------------------------
// Money — dollars in the file, dollars in the database.
// ---------------------------------------------------------------------------

export function parseDollars(raw: string): number | null {
  const cleaned = raw.replace(/[$,]/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Translator
// ---------------------------------------------------------------------------

export interface AttributeDictEntry {
  attributeId: string;
  /** lowercased value → canonical dictionary row. */
  values: Map<string, { id: string; value: string }>;
}

export interface ImportLookups {
  /** Taxonomy slug path → taxonomy node id, or null when unresolvable. */
  resolveCategory: (path: string) => string | null;
  /** Attribute dictionary by attribute slug. */
  attributes: Map<string, AttributeDictEntry>;
  /** Tax code (lowercased code or name) → acct_tax_codes id. */
  taxCodes: Map<string, string>;
}

export interface ImportVariant {
  rowNumber: number;
  sku: string;
  gtin: string;
  axes: { name: string; value: string }[];
  /** Stable combination key, e.g. "color=Red|size=Large". */
  axisSignature: string;
  variantLabel: string;
  price: number;
  compareAtPrice: number | null;
  costPrice: number | null;
  saleStart: string | null;
  saleEnd: string | null;
  quantity: number;
  trackInventory: boolean;
  binLocation: string | null;
  weight: number | null;
  weightUnit: string | null;
  length: number | null;
  width: number | null;
  height: number | null;
  dimensionUnit: string | null;
  variantImageUrl: string | null;
  raw: Record<string, string>;
}

export interface ImportAttributeValue {
  column: string;
  attributeSlug: string;
  attributeId: string;
  valueId: string;
  value: string;
}

export interface ImportProduct {
  parentKey: string;
  title: string;
  brand: string;
  categoryPath: string;
  categoryNodeId: string;
  status: "draft" | "live";
  condition: string;
  shortDescription: string | null;
  description: string | null;
  keyFeatures: string | null;
  ingredients: string | null;
  directions: string | null;
  warnings: string | null;
  fulfillmentType: string;
  handlingDays: number | null;
  taxable: boolean;
  taxCodeId: string | null;
  images: { url: string; alt: string | null }[];
  attributes: ImportAttributeValue[];
  variants: ImportVariant[];
  /** Row numbers that form this product (for error fan-out). */
  rowNumbers: number[];
}

export interface ImportRowError {
  row: number;
  sku: string | null;
  message: string;
  raw: Record<string, string>;
}

export interface TranslateResult {
  /** File-level failure (unknown columns, missing required columns…). */
  fileError: string | null;
  products: ImportProduct[];
  rowErrors: ImportRowError[];
  stats: {
    totalRows: number;
    productCount: number;
    variantCount: number;
    errorRowCount: number;
  };
}

const AXIS_SLOTS = [1, 2, 3] as const;

function parseBool(raw: string, dflt: boolean): boolean | null {
  const s = raw.trim().toLowerCase();
  if (s === "") return dflt;
  if (["true", "yes", "1", "y"].includes(s)) return true;
  if (["false", "no", "0", "n"].includes(s)) return false;
  return null;
}

function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeAxisName(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "colour") return "color";
  return s;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function productSlug(title: string): string {
  return slugify(title).substring(0, 120) || "item";
}

/**
 * Slug suffix for a non-canonical variant's catalog item. The live
 * catalog allows ONE live (active + sellable + ecommerce) item per
 * metadata slug (uq_cci_slug_sellable), so each variant item carries
 * its own slug: the product slug for the canonical variant, product
 * slug + this suffix for the rest — the same shape the Dropshift
 * families use ("...-khaki-xs", "...-dark-gray-m").
 */
export function variantSlugSuffix(variant: { axes: { name: string; value: string }[]; sku: string }): string {
  const label = variant.axes.length > 0 ? variant.axes.map((a) => a.value).join(" ") : variant.sku;
  return slugify(label).substring(0, 60) || slugify(variant.sku);
}

/**
 * Translate parsed CSV rows into validated products.
 * `headers` are the file's raw headers (any spelling — aliases resolve
 * here); `rows` are records keyed by those same raw headers.
 */
export function translateImportRows(
  headers: string[],
  rows: Record<string, string>[],
  lookups: ImportLookups,
): TranslateResult {
  const empty: TranslateResult["stats"] = {
    totalRows: rows.length,
    productCount: 0,
    variantCount: 0,
    errorRowCount: 0,
  };
  const fail = (fileError: string): TranslateResult => ({
    fileError,
    products: [],
    rowErrors: [],
    stats: empty,
  });

  // ---- Header resolution (unknown column = file error) ---------------
  const headerMap = new Map<string, string>(); // raw header → canonical
  const unknown: string[] = [];
  const seenCanonical = new Map<string, string>();
  for (const h of headers) {
    const canon = canonicalColumn(h);
    if (!canon) {
      unknown.push(h);
      continue;
    }
    if (seenCanonical.has(canon)) {
      return fail(
        `Columns "${seenCanonical.get(canon)}" and "${h}" are both spellings of "${canon}" — keep one.`,
      );
    }
    seenCanonical.set(canon, h);
    headerMap.set(h, canon);
  }
  if (unknown.length > 0) {
    return fail(
      `Unknown column(s): ${unknown.join(", ")}. The import accepts exactly the canonical columns (see the template / column guide) — nothing is silently dropped.`,
    );
  }
  const present = new Set(headerMap.values());
  const missingCols = IMPORT_COLUMNS.filter((c) => c.requiredColumn && !present.has(c.name)).map((c) => c.name);
  if (missingCols.length > 0) {
    return fail(`Missing required column(s): ${missingCols.join(", ")}.`);
  }
  if (rows.length === 0) return fail("The file has a header row but no data rows.");
  if (rows.length > MAX_IMPORT_ROWS) {
    return fail(`Imports are limited to ${MAX_IMPORT_ROWS} rows per request; this file has ${rows.length}.`);
  }

  // Canonical-keyed row records.
  const canonRows = rows.map((r, i) => {
    const rec: Record<string, string> = {};
    for (const [raw, canon] of headerMap) rec[canon] = (r[raw] ?? "").trim();
    return { rowNumber: i + 1, rec, raw: r };
  });
  const val = (rec: Record<string, string>, col: string) => (rec[col] ?? "").trim();

  const rowErrorMap = new Map<number, string[]>();
  const addErr = (row: number, msg: string) => {
    const arr = rowErrorMap.get(row) ?? [];
    arr.push(msg);
    rowErrorMap.set(row, arr);
  };

  // ---- Per-row field validation --------------------------------------
  const seenSkus = new Map<string, number>();
  interface RowWork {
    rowNumber: number;
    rec: Record<string, string>;
    raw: Record<string, string>;
    parentKey: string;
    sku: string;
    axes: { name: string; value: string }[];
    axisSignature: string;
  }
  const work: RowWork[] = [];

  for (const { rowNumber, rec, raw } of canonRows) {
    const parentKey = val(rec, "parent_key");
    if (!parentKey) addErr(rowNumber, "parent_key is required — it groups this row's variants into one product");
    const sku = val(rec, "sku");
    if (!sku) addErr(rowNumber, "sku is required");
    else {
      const prev = seenSkus.get(sku.toLowerCase());
      if (prev) addErr(rowNumber, `sku "${sku}" is duplicated in this file (first on row ${prev})`);
      else seenSkus.set(sku.toLowerCase(), rowNumber);
    }
    const gtinErr = validateGtin(val(rec, "gtin"));
    if (gtinErr) addErr(rowNumber, gtinErr);

    const title = val(rec, "title");
    if (!title) addErr(rowNumber, "title is required");
    else if (title.length > MAX_TITLE) addErr(rowNumber, `title is over ${MAX_TITLE} characters`);
    if (!val(rec, "brand")) addErr(rowNumber, "brand is required");
    if (!val(rec, "category")) addErr(rowNumber, "category is required (a taxonomy slug path, e.g. dog/food/dry-food)");
    const desc = val(rec, "description");
    if (desc.length > MAX_DESCRIPTION) addErr(rowNumber, `description is over ${MAX_DESCRIPTION} characters`);
    const shortDesc = val(rec, "short_description");
    if (shortDesc.length > MAX_SHORT_DESCRIPTION) addErr(rowNumber, `short_description is over ${MAX_SHORT_DESCRIPTION} characters`);
    const copyHits = [
      ...prohibitedCopyHits(title),
      ...prohibitedCopyHits(desc),
      ...prohibitedCopyHits(shortDesc),
    ];
    if (copyHits.length > 0) {
      addErr(rowNumber, `Prohibited ad copy: ${[...new Set(copyHits)].join(", ")}`);
    }

    // Pricing — dollars.
    const priceRaw = val(rec, "price");
    if (!priceRaw) addErr(rowNumber, "price is required (dollars, e.g. 25.00)");
    else {
      const p = parseDollars(priceRaw);
      if (p === null) addErr(rowNumber, `price "${priceRaw}" is not a valid dollar amount`);
      else if (p <= 0) addErr(rowNumber, "price must be greater than zero");
      else if (p > MAX_PRICE) addErr(rowNumber, `price must be ${MAX_PRICE} or less`);
    }
    const compareRaw = val(rec, "compare_at_price");
    if (compareRaw) {
      const cp = parseDollars(compareRaw);
      const p = parseDollars(priceRaw);
      if (cp === null) addErr(rowNumber, `compare_at_price "${compareRaw}" is not a valid dollar amount`);
      else if (p !== null && cp <= p) addErr(rowNumber, "compare_at_price must be higher than price (it is the struck-through “was” price)");
    }
    const costRaw = val(rec, "cost_price");
    if (costRaw && parseDollars(costRaw) === null) addErr(rowNumber, `cost_price "${costRaw}" is not a valid dollar amount`);
    const saleStart = val(rec, "sale_start");
    const saleEnd = val(rec, "sale_end");
    if (saleStart && !parseDate(saleStart)) addErr(rowNumber, `sale_start "${saleStart}" is not a YYYY-MM-DD date`);
    if (saleEnd && !parseDate(saleEnd)) addErr(rowNumber, `sale_end "${saleEnd}" is not a YYYY-MM-DD date`);
    if (saleStart && saleEnd && parseDate(saleStart) && parseDate(saleEnd) && parseDate(saleEnd)! < parseDate(saleStart)!) {
      addErr(rowNumber, "sale_end is before sale_start");
    }

    // Inventory.
    const qtyRaw = val(rec, "quantity");
    if (!qtyRaw) addErr(rowNumber, "quantity is required (units on hand for this variant)");
    else if (!/^\d+$/.test(qtyRaw)) addErr(rowNumber, `quantity "${qtyRaw}" must be a whole number`);
    else if (Number(qtyRaw) > MAX_QUANTITY) addErr(rowNumber, `quantity must be ${MAX_QUANTITY} or less`);

    // Axes.
    const axes: { name: string; value: string }[] = [];
    for (const n of AXIS_SLOTS) {
      const an = val(rec, `option${n}_name`);
      const av = val(rec, `option${n}_value`);
      if (an && !av) addErr(rowNumber, `option${n}_name "${an}" is set but option${n}_value is empty`);
      if (!an && av) addErr(rowNumber, `option${n}_value "${av}" is set but option${n}_name is empty`);
      if (an && av) axes.push({ name: normalizeAxisName(an), value: av });
    }
    const seenAxes = new Set<string>();
    for (const a of axes) {
      if (seenAxes.has(a.name)) addErr(rowNumber, `axis "${a.name}" is declared twice on this row`);
      seenAxes.add(a.name);
    }

    // Media URLs.
    for (let i = 1; i <= 5; i++) {
      const u = val(rec, `image_url_${i}`);
      if (u && !/^https?:\/\//i.test(u)) addErr(rowNumber, `image_url_${i} "${u}" must be an http(s) URL`);
    }
    const viu = val(rec, "variant_image_url");
    if (viu && !/^https?:\/\//i.test(viu)) addErr(rowNumber, `variant_image_url "${viu}" must be an http(s) URL`);

    // Logistics.
    const weightRaw = val(rec, "weight");
    if (weightRaw && (Number.isNaN(Number(weightRaw)) || Number(weightRaw) < 0)) {
      addErr(rowNumber, `weight "${weightRaw}" must be a number ≥ 0`);
    }
    const wu = val(rec, "weight_unit").toLowerCase();
    if (wu && !["lb", "lbs", "oz", "kg", "g"].includes(wu)) addErr(rowNumber, `weight_unit "${wu}" must be lb, oz, kg or g`);
    for (const dim of ["length", "width", "height"] as const) {
      const dv = val(rec, dim);
      if (dv && (Number.isNaN(Number(dv)) || Number(dv) < 0)) addErr(rowNumber, `${dim} "${dv}" must be a number ≥ 0`);
    }
    const du = val(rec, "dimension_unit").toLowerCase();
    if (du && !["in", "cm"].includes(du)) addErr(rowNumber, `dimension_unit "${du}" must be in or cm`);
    const hd = val(rec, "handling_days");
    if (hd && (!/^\d+$/.test(hd) || Number(hd) > 60)) addErr(rowNumber, `handling_days "${hd}" must be a whole number 0–60`);
    const ff = val(rec, "fulfillment_type").toLowerCase();
    if (ff && !["seller_fulfilled", "platform", "dropship"].includes(ff)) {
      addErr(rowNumber, `fulfillment_type "${ff}" must be seller_fulfilled, platform or dropship`);
    }
    const cond = val(rec, "condition").toLowerCase();
    if (cond && !["new", "used", "refurbished"].includes(cond)) addErr(rowNumber, `condition "${cond}" must be new, used or refurbished`);
    const st = val(rec, "status").toLowerCase();
    if (st && !["draft", "pending_review", "active", "live"].includes(st)) {
      addErr(rowNumber, `status "${st}" must be draft (anything else publishes for approved sellers)`);
    }
    if (parseBool(val(rec, "taxable"), true) === null) addErr(rowNumber, `taxable "${val(rec, "taxable")}" must be true or false`);
    if (parseBool(val(rec, "track_inventory"), true) === null) addErr(rowNumber, `track_inventory "${val(rec, "track_inventory")}" must be true or false`);

    // Category must resolve (checked per row; grouping re-checks).
    if (val(rec, "category") && !lookups.resolveCategory(val(rec, "category"))) {
      addErr(rowNumber, `category "${val(rec, "category")}" does not resolve to a published shop category (use a slug path like dog/food/dry-food)`);
    }
    // Tax code must resolve when named.
    const taxCode = val(rec, "tax_code");
    if (taxCode && !lookups.taxCodes.has(taxCode.toLowerCase())) {
      addErr(rowNumber, `tax_code "${taxCode}" is not a platform tax code`);
    }

    work.push({
      rowNumber,
      rec,
      raw,
      parentKey,
      sku,
      axes,
      axisSignature: axes.map((a) => `${a.name}=${a.value.toLowerCase()}`).join("|"),
    });
  }

  // ---- Grouping: product-level consistency + axis consistency --------
  const groups = new Map<string, RowWork[]>();
  for (const w of work) {
    if (!w.parentKey) continue; // already errored; ungroupable
    const arr = groups.get(w.parentKey) ?? [];
    arr.push(w);
    groups.set(w.parentKey, arr);
  }

  const PRODUCT_FIELDS = [
    "title", "brand", "category", "short_description", "description",
    "key_features", "ingredients", "directions", "warnings",
    "fulfillment_type", "handling_days", "taxable", "tax_code", "condition", "status",
    ...IMPORT_COLUMNS.filter((c) => c.group === "pet").map((c) => c.name),
  ] as const;

  const products: ImportProduct[] = [];

  for (const [parentKey, members] of groups) {
    // Product-level fields: first non-empty wins; a conflicting non-empty
    // value on a later row is that row's error.
    const productVals = new Map<string, { value: string; row: number }>();
    for (const m of members) {
      for (const f of PRODUCT_FIELDS) {
        const v = val(m.rec, f);
        if (!v) continue;
        const prev = productVals.get(f);
        if (!prev) productVals.set(f, { value: v, row: m.rowNumber });
        else if (prev.value !== v) {
          addErr(m.rowNumber, `${f} "${v}" conflicts with row ${prev.row} ("${prev.value}") — a product has one ${f}; repeat it identically or leave it blank`);
        }
      }
    }
    const pv = (f: string) => productVals.get(f)?.value ?? "";

    // Axis consistency: identical axis-name sets on every row; unique
    // combinations; multi-row products must vary.
    const axisSetOf = (m: RowWork) => m.axes.map((a) => a.name).sort().join(",");
    const firstSet = axisSetOf(members[0]);
    const comboSeen = new Map<string, number>();
    for (const m of members) {
      if (axisSetOf(m) !== firstSet) {
        addErr(m.rowNumber, `variant axes [${axisSetOf(m) || "none"}] differ from the product's other rows [${firstSet || "none"}] — every row of a product must declare the same axes`);
      }
      if (members.length > 1 && m.axes.length === 0) {
        addErr(m.rowNumber, "this product has multiple rows but this row declares no variant options — rows of one product must differ by their axis values");
      }
      const prev = comboSeen.get(m.axisSignature);
      if (prev !== undefined && m.axisSignature !== "") {
        addErr(m.rowNumber, `variant combination "${m.axisSignature}" duplicates row ${prev}`);
      } else if (m.axisSignature !== "") {
        comboSeen.set(m.axisSignature, m.rowNumber);
      }
    }

    // Pet attributes: validated against the dictionary.
    const attributes: ImportAttributeValue[] = [];
    for (const col of IMPORT_COLUMNS.filter((c) => c.group === "pet")) {
      const rawVals = pv(col.name);
      if (!rawVals) continue;
      const dict = lookups.attributes.get(col.attributeSlug!);
      for (const piece of rawVals.split(";").map((s) => s.trim()).filter(Boolean)) {
        if (!dict) {
          for (const m of members) addErr(m.rowNumber, `${col.name}: the "${col.attributeSlug}" attribute dictionary is unavailable`);
          break;
        }
        const hit = dict.values.get(piece.toLowerCase());
        if (!hit) {
          for (const m of members) {
            addErr(m.rowNumber, `${col.name} "${piece}" is not a value in the platform dictionary for ${col.attributeSlug} — use the dictionary spelling`);
          }
        } else {
          attributes.push({
            column: col.name,
            attributeSlug: col.attributeSlug!,
            attributeId: dict.attributeId,
            valueId: hit.id,
            value: hit.value,
          });
        }
      }
    }

    // Product images: first row's non-empty per position wins; conflicts
    // join the error list like other product-level fields.
    const images: { url: string; alt: string | null }[] = [];
    for (let i = 1; i <= 5; i++) {
      let url = "";
      let alt = "";
      for (const m of members) {
        const u = val(m.rec, `image_url_${i}`);
        if (u && !url) { url = u; alt = val(m.rec, `image_alt_${i}`); }
        else if (u && url && u !== url) {
          addErr(m.rowNumber, `image_url_${i} "${u}" conflicts with row ${members[0].rowNumber} — product images are one set per product`);
        }
      }
      if (url) images.push({ url, alt: alt || null });
    }

    const categoryNodeId = lookups.resolveCategory(pv("category"));
    const statusRaw = pv("status").toLowerCase();
    products.push({
      parentKey,
      // Supplier text is normalized to plain English at translation time
      // (lib/shop/catalog-text): titles lose their keyword stuffing,
      // descriptions lose fulfillment boilerplate and scaffolding, so
      // what validates here is exactly what shoppers will read.
      title: normalizeProductName(pv("title")),
      brand: pv("brand"),
      categoryPath: pv("category"),
      categoryNodeId: categoryNodeId ?? "",
      status: statusRaw === "draft" ? "draft" : "live",
      condition: pv("condition").toLowerCase() || "new",
      shortDescription: pv("short_description")
        ? normalizeProductDescription(pv("short_description"), pv("title"))
        : null,
      description: pv("description")
        ? normalizeProductDescription(pv("description"), pv("title"))
        : null,
      keyFeatures: pv("key_features") || null,
      ingredients: pv("ingredients") || null,
      directions: pv("directions") || null,
      warnings: pv("warnings") || null,
      fulfillmentType: pv("fulfillment_type").toLowerCase() || "seller_fulfilled",
      handlingDays: pv("handling_days") ? Number(pv("handling_days")) : null,
      taxable: parseBool(pv("taxable"), true) ?? true,
      taxCodeId: pv("tax_code") ? lookups.taxCodes.get(pv("tax_code").toLowerCase()) ?? null : null,
      images,
      attributes,
      variants: members.map((m) => ({
        rowNumber: m.rowNumber,
        sku: m.sku,
        gtin: val(m.rec, "gtin").replace(/[\s-]/g, ""),
        axes: m.axes,
        axisSignature: m.axisSignature,
        variantLabel: (() => {
          const explicit = val(m.rec, "variant_label");
          // A free-text variant string with no declared axes is parsed
          // into its named attributes (Color / Size / Count / …) and the
          // label recomposed from them in canonical order.
          if (explicit && m.axes.length === 0) {
            const parsed = parseVariantAttributes(explicit);
            if (parsed.attributes.length > 0) return parsed.label;
          }
          return explicit || m.axes.map((a) => a.value).join(" · ") || m.sku;
        })(),
        price: parseDollars(val(m.rec, "price")) ?? 0,
        compareAtPrice: val(m.rec, "compare_at_price") ? parseDollars(val(m.rec, "compare_at_price")) : null,
        costPrice: val(m.rec, "cost_price") ? parseDollars(val(m.rec, "cost_price")) : null,
        saleStart: parseDate(val(m.rec, "sale_start")),
        saleEnd: parseDate(val(m.rec, "sale_end")),
        quantity: /^\d+$/.test(val(m.rec, "quantity")) ? Number(val(m.rec, "quantity")) : 0,
        trackInventory: parseBool(val(m.rec, "track_inventory"), true) ?? true,
        binLocation: val(m.rec, "bin_location") || null,
        weight: val(m.rec, "weight") ? Number(val(m.rec, "weight")) : null,
        weightUnit: val(m.rec, "weight")
          ? ((val(m.rec, "weight_unit").toLowerCase() || "lb").replace(/^lbs$/, "lb"))
          : null,
        length: val(m.rec, "length") ? Number(val(m.rec, "length")) : null,
        width: val(m.rec, "width") ? Number(val(m.rec, "width")) : null,
        height: val(m.rec, "height") ? Number(val(m.rec, "height")) : null,
        dimensionUnit: (val(m.rec, "length") || val(m.rec, "width") || val(m.rec, "height"))
          ? (val(m.rec, "dimension_unit").toLowerCase() || "in")
          : null,
        variantImageUrl: val(m.rec, "variant_image_url") || null,
        raw: m.raw,
      })),
      rowNumbers: members.map((m) => m.rowNumber),
    });
  }

  // ---- Split: products with any row error are rejected whole ---------
  const errorRows = new Set(rowErrorMap.keys());
  const kept: ImportProduct[] = [];
  for (const p of products) {
    if (p.rowNumbers.some((n) => errorRows.has(n))) {
      // Rows of the product that are individually valid are still
      // rejected — the product is not written with a hole in it.
      for (const n of p.rowNumbers) {
        if (!errorRows.has(n)) {
          addErr(n, `not imported: another row of product "${p.parentKey}" failed validation — fix it and re-import the product`);
          errorRows.add(n);
        }
      }
    } else {
      kept.push(p);
    }
  }
  // Rows that never grouped (missing parent_key) keep their errors.
  const rowErrors: ImportRowError[] = [...rowErrorMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([row, messages]) => {
      const w = work.find((x) => x.rowNumber === row);
      return {
        row,
        sku: w?.sku || null,
        message: messages.join("; "),
        raw: w?.raw ?? rows[row - 1] ?? {},
      };
    });

  return {
    fileError: null,
    products: kept,
    rowErrors,
    stats: {
      totalRows: rows.length,
      productCount: kept.length,
      variantCount: kept.reduce((s, p) => s + p.variants.length, 0),
      errorRowCount: rowErrors.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

/**
 * The canonical template: every column header in contract order, then
 * three example rows — a single-variant product, and a two-variant
 * product whose rows share one parent_key. Example GTINs carry valid
 * check digits; example categories are real published taxonomy paths.
 */
export const TEMPLATE_EXAMPLE_ROWS: Record<string, string>[] = [
  {
    parent_key: "acme-retractable-leash",
    sku: "ACME-LEASH-RED-16",
    gtin: "036000291452",
    title: "Acme Retractable Dog Leash — 16 ft",
    brand: "Acme Pet",
    category: "dog/collars-leashes-harnesses/dog-leashes",
    option1_name: "color",
    option1_value: "Red",
    price: "24.99",
    compare_at_price: "32.99",
    quantity: "40",
    image_url_1: "https://example.com/images/leash-red.jpg",
    image_alt_1: "Red retractable dog leash",
    short_description: "Smooth-retract 16 ft leash for dogs up to 110 lb.",
    description: "A tangle-free retractable leash with a one-hand brake and lock.",
    key_features: "16 ft nylon tape · One-hand brake · Ergonomic grip",
    species: "Dog",
    weight: "0.8",
    weight_unit: "lb",
  },
  {
    parent_key: "acme-dental-sticks",
    sku: "ACME-DENTAL-LG-28",
    gtin: "012345678905",
    title: "Acme Dental Sticks for Large Dogs",
    brand: "Acme Pet",
    category: "dog/dog-treats/dental-dog-chews",
    option1_name: "size",
    option1_value: "28.3 oz",
    price: "31.85",
    compare_at_price: "39.99",
    quantity: "25",
    image_url_1: "https://example.com/images/dental-large.jpg",
    image_alt_1: "Bag of dental sticks, large",
    short_description: "Daily dental sticks that clean teeth and freshen breath.",
    description: "Vet-recommended dental sticks for large breeds.",
    key_features: "Clinically proven plaque reduction · Highly digestible",
    ingredients: "Rice flour, glycerin, calcium carbonate",
    directions: "Feed one stick per day for dogs over 25 lb.",
    species: "Dog",
    flavor: "Chicken",
    weight: "1.8",
    weight_unit: "lb",
  },
  {
    parent_key: "acme-dental-sticks",
    sku: "ACME-DENTAL-LG-13",
    gtin: "012345678912",
    title: "Acme Dental Sticks for Large Dogs",
    brand: "Acme Pet",
    category: "dog/dog-treats/dental-dog-chews",
    option1_name: "size",
    option1_value: "13.1 oz",
    price: "22.94",
    quantity: "60",
    image_url_1: "https://example.com/images/dental-large.jpg",
    image_alt_1: "Bag of dental sticks, large",
    short_description: "Daily dental sticks that clean teeth and freshen breath.",
    description: "Vet-recommended dental sticks for large breeds.",
    key_features: "Clinically proven plaque reduction · Highly digestible",
    ingredients: "Rice flour, glycerin, calcium carbonate",
    directions: "Feed one stick per day for dogs over 25 lb.",
    species: "Dog",
    flavor: "Chicken",
    weight: "0.8",
    weight_unit: "lb",
  },
];

function csvEscapeCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function composeTemplateCsv(): string {
  const header = IMPORT_COLUMN_NAMES.join(",");
  const lines = TEMPLATE_EXAMPLE_ROWS.map((row) =>
    IMPORT_COLUMN_NAMES.map((c) => csvEscapeCell(row[c] ?? "")).join(","),
  );
  return [header, ...lines].join("\r\n") + "\r\n";
}
