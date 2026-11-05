// ---------------------------------------------------------------------------
// sellers/bulk-csv.ts — §2.2 bulk CSV for the seller's OWN listings.
//
// The export composer and the import parser/validator share this one
// column contract, so an exported file re-imports as-is: a seller
// downloads their listings, edits price / stock / state (or title,
// description, brand, GTIN) in a spreadsheet, and uploads the file back.
// Import UPDATES the caller's existing listings — identified by
// listing_id, else by SKU — it never creates listings (creation is the
// §2.3 / §2.8 path) and never touches another seller's rows (the route
// scopes every apply to the caller's seller_id).
//
// Validation is pure and total: every rule a row must pass lives in
// validateBulkRow, and a row that fails ANY rule is rejected whole with
// every failure listed — the route applies valid rows one transaction
// per row, so a row is never half-applied either.
// ---------------------------------------------------------------------------

import { prohibitedCopyHits } from "./listing-quality";

/** The export/import column contract, in file order. */
export const BULK_CSV_COLUMNS = [
  "listing_id",
  "product_id",
  "sku",
  "title",
  "description",
  "brand",
  "gtin",
  "price",
  "stock",
  "status",
] as const;

export type BulkCsvColumn = (typeof BULK_CSV_COLUMNS)[number];

/** States a seller may set on their own listing by CSV. "suppressed" is
 *  a platform act (§2.10) and is rejected, never applied. */
export const BULK_SETTABLE_STATUSES = [
  "active",
  "pending_review",
  "inactive",
  "draft",
] as const;

export const BULK_MAX_ROWS = 500;
const MAX_PRICE = 1_000_000;
const MAX_STOCK = 1_000_000;

// ---------------------------------------------------------------------------
// Compose (export)
// ---------------------------------------------------------------------------

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One listing record → one CSV line, in BULK_CSV_COLUMNS order. */
export function composeBulkCsv(rows: Record<string, unknown>[]): string {
  const lines = [BULK_CSV_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      BULK_CSV_COLUMNS.map((col) => {
        const v = r[col];
        if (col === "price" && v !== null && v !== undefined && v !== "") {
          const n = Number(v);
          return Number.isFinite(n) ? n.toFixed(2) : csvEscape(v);
        }
        return csvEscape(v);
      }).join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Parse (import)
// ---------------------------------------------------------------------------

/** RFC 4180 CSV parser: quoted fields, embedded commas/quotes/newlines. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      out.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    out.push(row);
  }
  return out.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export interface ParsedBulkCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/** Parse + header validation. Unknown columns are a file-level error:
 *  a mistyped header must not silently drop a seller's edits. */
export function parseBulkCsv(text: string): ParsedBulkCsv | { error: string } {
  const grid = parseCsv(text);
  if (grid.length === 0) return { error: "The file is empty." };
  const headers = grid[0].map((h) => h.trim().toLowerCase());
  const unknown = headers.filter(
    (h) => !(BULK_CSV_COLUMNS as readonly string[]).includes(h),
  );
  if (unknown.length > 0) {
    return {
      error: `Unknown column(s): ${unknown.join(", ")}. Expected: ${BULK_CSV_COLUMNS.join(", ")}`,
    };
  }
  if (!headers.includes("listing_id") && !headers.includes("sku")) {
    return { error: "The file must carry a listing_id or sku column so each row names one of your listings." };
  }
  const dataRows = grid.slice(1);
  if (dataRows.length === 0) return { error: "The file has a header row but no listing rows." };
  if (dataRows.length > BULK_MAX_ROWS) {
    return { error: `Bulk files are limited to ${BULK_MAX_ROWS} rows; this file has ${dataRows.length}.` };
  }
  const rows = dataRows.map((cells) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = (cells[i] ?? "").trim();
    });
    return rec;
  });
  return { headers, rows };
}

// ---------------------------------------------------------------------------
// Row validation
// ---------------------------------------------------------------------------

export interface BulkListingUpdate {
  listingId: string | null;
  sku: string | null;
  /** Only the fields whose column is present in the file AND whose cell
   *  the validator accepted. Absent column = field untouched. */
  fields: {
    title?: string;
    description?: string | null;
    brand?: string | null;
    gtin?: string | null;
    price?: number;
    stock?: number;
    status?: string;
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[$,]/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Validate one parsed row against the listing rules:
 *  - identity: listing_id (a UUID) or sku — one must name the listing;
 *  - title (when the column is present): required, ≤ 300 chars;
 *  - title + description: no prohibited ad copy (listing-quality.ts);
 *  - price (when present and non-empty): a real amount, > 0, ≤ 1,000,000;
 *  - stock (when present and non-empty): a whole number, 0–1,000,000;
 *  - status (when present and non-empty): a seller-settable state —
 *    "suppressed" is platform-only and rejected by name;
 *  - gtin (when non-empty): 8–14 digits.
 * Returns every failure, not just the first, so the seller's error
 * report fixes the row in one pass.
 */
export function validateBulkRow(
  rec: Record<string, string>,
  headers: ReadonlySet<string>,
): { ok: true; update: BulkListingUpdate } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const has = (c: BulkCsvColumn) => headers.has(c);
  const val = (c: BulkCsvColumn) => (rec[c] ?? "").trim();

  const listingId = val("listing_id");
  const sku = val("sku");
  if (listingId && !UUID_RE.test(listingId)) {
    errors.push(`listing_id "${listingId}" is not a valid listing id`);
  }
  if (!listingId && !sku) {
    errors.push("Row names no listing: listing_id and sku are both empty");
  }

  const fields: BulkListingUpdate["fields"] = {};

  if (has("title")) {
    const title = val("title");
    if (!title) errors.push("Title is required");
    else if (title.length > 300) errors.push("Title is over 300 characters");
    else fields.title = title;
  }
  if (has("description")) {
    const d = val("description");
    if (d.length > 5000) errors.push("Description is over 5000 characters");
    else fields.description = d === "" ? null : d;
  }
  const copyHits = [
    ...prohibitedCopyHits(val("title")),
    ...prohibitedCopyHits(val("description")),
  ];
  if (copyHits.length > 0) {
    errors.push(`Prohibited ad copy: ${[...new Set(copyHits)].join(", ")}`);
  }

  if (has("brand")) {
    const b = val("brand");
    if (b.length > 120) errors.push("Brand is over 120 characters");
    else fields.brand = b === "" ? null : b;
  }
  if (has("gtin")) {
    const g = val("gtin").replace(/[\s-]/g, "");
    if (g && !/^\d{8,14}$/.test(g)) errors.push(`GTIN "${val("gtin")}" must be 8–14 digits`);
    else fields.gtin = g === "" ? null : g;
  }
  if (has("price") && val("price") !== "") {
    const p = parsePrice(val("price"));
    if (p === null) errors.push(`Price "${val("price")}" is not a valid amount`);
    else if (p <= 0) errors.push("Price must be greater than zero");
    else if (p > MAX_PRICE) errors.push(`Price must be ${MAX_PRICE} or less`);
    else fields.price = p;
  }
  if (has("stock") && val("stock") !== "") {
    const s = val("stock");
    if (!/^\d+$/.test(s)) errors.push(`Stock "${s}" must be a whole number`);
    else if (Number(s) > MAX_STOCK) errors.push(`Stock must be ${MAX_STOCK} or less`);
    else fields.stock = Number(s);
  }
  if (has("status") && val("status") !== "") {
    const st = val("status").toLowerCase().replace(/[\s-]+/g, "_");
    if (st === "suppressed") {
      errors.push("Status \"suppressed\" is set by the platform, not by sellers");
    } else if (!(BULK_SETTABLE_STATUSES as readonly string[]).includes(st)) {
      errors.push(`Status "${val("status")}" is not one of: ${BULK_SETTABLE_STATUSES.join(", ")}`);
    } else {
      fields.status = st;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    update: {
      listingId: listingId || null,
      sku: sku || null,
      fields,
    },
  };
}
