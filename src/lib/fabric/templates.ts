/**
 * Fabric studio — supplier template resolution.
 *
 * The old studio switched between seven hardcoded garment silhouettes and
 * never looked at the real catalog product. This module is the bridge:
 * given a supplier catalog product and its variants' `print_specs` JSON,
 * it classifies the product kind (tee / mug / tumbler / cup / …), parses
 * the supplier's real print dimensions where present, and returns the
 * metadata the Konva editor needs:
 *
 *  - `productType`  — which silhouette the editor draws
 *  - `spec`         — print-file truth in pixels: trim size, DPI, bleed,
 *                     safe margin (supplier values win; per-kind
 *                     industry defaults otherwise, flagged via `source`)
 *  - `stage`        — the same three zones mapped into the 420×500 stage
 *                     coordinate system the editor draws guides in
 *  - `surfaces`     — Front/Back, each with independent artwork state
 *  - `mockupUrl`    — the supplier's own product photo for the bg layer
 */

import {
  getProductTemplate,
  type ProductType,
} from "@/lib/admin/product-templates";

export type TemplateKind =
  | "tee"
  | "hoodie"
  | "sweatshirt"
  | "mug"
  | "tumbler"
  | "cup"
  | "tote"
  | "poster"
  | "generic";

export type Surface = "Front" | "Back";

export interface PrintSpec {
  /** Trim (final print) width/height in pixels at `dpi`. */
  widthPx: number;
  heightPx: number;
  dpi: number;
  /** Bleed extension beyond trim, in pixels (each side). */
  bleedPx: number;
  /** Safe-area inset from trim, in pixels (each side). */
  safePx: number;
  source: "supplier" | "default" | "registry";
}

export interface StageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResolvedTemplate {
  kind: TemplateKind;
  productType: ProductType;
  spec: PrintSpec;
  stage: { trim: StageRect; bleed: StageRect; safe: StageRect };
  surfaces: Surface[];
  mockupUrl: string | null;
}

const KIND_TO_PRODUCT_TYPE: Record<TemplateKind, ProductType> = {
  tee: "Classic Tee",
  hoodie: "Premium Hoodie",
  sweatshirt: "Crewneck Sweatshirt",
  mug: "Ceramic Mug",
  tumbler: "Insulated Tumbler",
  cup: "Enamel Cup",
  tote: "Tote Bag",
  poster: "Poster",
  generic: "Classic Tee",
};

/**
 * Per-kind print defaults at 300 DPI (supplier values override).
 * Tee 15×18in, mug 11oz wrap 9×3.9in, 20oz tumbler wrap ≈9.3×8.1in,
 * enamel camp cup ≈8×3.5in print band, tote 12×12in, poster 12×18in.
 * Bleed default 0.125in, safe default 0.25in.
 */
const DEFAULT_SPECS: Record<TemplateKind, { w: number; h: number }> = {
  tee: { w: 4500, h: 5400 },
  hoodie: { w: 4500, h: 5400 },
  sweatshirt: { w: 4500, h: 5400 },
  mug: { w: 2700, h: 1175 },
  tumbler: { w: 2790, h: 2430 },
  cup: { w: 2400, h: 1050 },
  tote: { w: 3600, h: 3600 },
  poster: { w: 3600, h: 5400 },
  generic: { w: 4500, h: 5400 },
};
const DEFAULT_DPI = 300;
const BLEED_IN = 0.125;
const SAFE_IN = 0.25;

/**
 * "Canvas" names the poster substrate only when the name presents it
 * as wall art: leading the name ("Canvas (in)", "Canvas Print"), in a
 * substrate phrase ("canvas prints / wraps / pictures", "framed
 * canvas", "stretched canvases"), carrying a size suffix ("Thin
 * Canvas (in)"), or trailing ("Easel Back Canvas"). A bare mid-name
 * "canvas" is a brand or fabric word instead — the previous rule
 * matched it anywhere, so "Bella + Canvas" apparel classified as
 * Poster. (Walk-caught 2026-10-30; impact-audited over every distinct
 * catalog name: only apparel and canvas fabric goods change kind.)
 */
function isCanvasWallArt(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    /^canvas\b/.test(lower) ||
    /\bcanvas (print|prints|wrap|wraps|pictures?)\b/.test(lower) ||
    /\bcanvas \(/.test(lower) ||
    /\b(framed|faux|easel back|gallery|stretched) canvases?\b/.test(lower) ||
    /\bcanvas\s*$/.test(lower)
  );
}

export function classifyKind(name: string): TemplateKind {
  const n = ` ${name.toLowerCase()} `;
  if (/tumbler/.test(n)) return "tumbler";
  if (/hoodie|hoody/.test(n)) return "hoodie";
  if (/sweatshirt|crewneck|fleece/.test(n)) return "sweatshirt";
  if (/enamel|camp cup|camping mug/.test(n)) return "cup";
  if (/mug|cup/.test(n)) return "mug";
  if (/tote/.test(n)) return "tote";
  if (/poster|print set|wall art/.test(n)) return "poster";
  if (isCanvasWallArt(name)) return "poster";
  if (/tee|t-shirt|tshirt|shirt|tank|onesie|bodysuit|apparel|hood/.test(n))
    return "tee";
  return "generic";
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string") {
    const p = parseFloat(v);
    if (Number.isFinite(p) && p > 0) return p;
  }
  return null;
}

/** Dig a numeric field out of a print_specs blob under any known alias. */
function pick(specs: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const direct = num(specs[k]);
    if (direct) return direct;
  }
  // One level of nesting (e.g. { print_area: { width, height } }).
  for (const v of Object.values(specs)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const nested = pick(v as Record<string, unknown>, keys);
      if (nested) return nested;
    }
  }
  return null;
}

export interface PlaceholderSpec {
  placement: string;
  widthPx: number;
  heightPx: number;
}

/**
 * Printify-style specs carry their geometry as a placeholders[] array
 * ({ width, height, position, decoration_method }) — the format the
 * largest catalog supplier actually stores in print_specs. Extract
 * the per-placement pixel sizes from a list of variant print_specs
 * blobs (first blob with a usable placeholders array wins — variants
 * of one catalog product share the same print geometry).
 */
export function extractPlaceholderSpecs(specsList: unknown[]): PlaceholderSpec[] {
  for (const raw of specsList) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Record<string, unknown>;
    const phs = s.placeholders;
    if (!Array.isArray(phs)) continue;
    const out: PlaceholderSpec[] = [];
    for (const ph of phs) {
      if (!ph || typeof ph !== "object") continue;
      const p = ph as Record<string, unknown>;
      const w = Number(p.width);
      const h = Number(p.height);
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) continue;
      out.push({
        placement: String(p.position ?? "front"),
        widthPx: Math.round(w),
        heightPx: Math.round(h),
      });
    }
    if (out.length) return out;
  }
  return [];
}

const WIDTH_KEYS = [
  "print_width_px", "printAreaWidthPx", "print_area_width", "printAreaWidth",
  "print_width", "width_px", "widthPx", "image_width", "width",
];
const HEIGHT_KEYS = [
  "print_height_px", "printAreaHeightPx", "print_area_height", "printAreaHeight",
  "print_height", "height_px", "heightPx", "image_height", "height",
];
const DPI_KEYS = ["dpi", "resolution", "print_dpi"];

/**
 * Parse the supplier print spec from a set of variant print_specs blobs.
 * Values in inches/mm are converted when the blob declares a unit or the
 * numbers are far too small to be pixels.
 */
export function parsePrintSpec(
  specsList: unknown[],
  kind: TemplateKind,
): PrintSpec {
  const fallback = DEFAULT_SPECS[kind];
  let spec: PrintSpec = {
    widthPx: fallback.w,
    heightPx: fallback.h,
    dpi: DEFAULT_DPI,
    bleedPx: Math.round(BLEED_IN * DEFAULT_DPI),
    safePx: Math.round(SAFE_IN * DEFAULT_DPI),
    source: "default",
  };

  for (const raw of specsList) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Record<string, unknown>;
    const dpi = pick(s, DPI_KEYS) ?? spec.dpi;
    let w = pick(s, WIDTH_KEYS);
    let h = pick(s, HEIGHT_KEYS);
    if (!w || !h) {
      // Printify shape: geometry lives in placeholders[], not flat keys.
      const phs = extractPlaceholderSpecs([raw]);
      const front = phs.find((p) => /front/i.test(p.placement)) ?? phs[0];
      if (front) {
        w = front.widthPx;
        h = front.heightPx;
      }
    }
    if (!w || !h) continue;
    // Unit sanity: a "width" under 100 with a DPI present is inches.
    if (w < 100 && h < 100) {
      w = Math.round(w * dpi);
      h = Math.round(h * dpi);
    }
    const bleed =
      pick(s, ["bleed_px", "bleedPx", "bleed"]) ??
      Math.round(BLEED_IN * dpi);
    const safe =
      pick(s, ["safe_px", "safePx", "safe_margin", "safeMargin"]) ??
      Math.round(SAFE_IN * dpi);
    spec = {
      widthPx: Math.round(w),
      heightPx: Math.round(h),
      dpi,
      bleedPx: bleed < 10 ? Math.round(bleed * dpi) : Math.round(bleed),
      safePx: safe < 10 ? Math.round(safe * dpi) : Math.round(safe),
      source: "supplier",
    };
    break; // First variant with a usable spec wins — variants of one
    // catalog product share the same print geometry.
  }
  return spec;
}

/**
 * Resolve the full editor template for a catalog product.
 * `variants` only needs each row's print_specs.
 */
export function resolveTemplate(
  product: { name: string; image_url: string | null },
  variants: { print_specs: unknown }[],
): ResolvedTemplate {
  const kind = classifyKind(product.name);
  const productType = KIND_TO_PRODUCT_TYPE[kind];
  const spec = parsePrintSpec(
    variants.map((v) => v.print_specs),
    kind,
  );

  // Stage zones: start from the silhouette's drawn print area (stage px),
  // expand by the bleed ratio and inset by the safe ratio so the guides
  // on canvas are the real supplier proportions, not decoration.
  const trim = { ...getProductTemplate(productType).printArea };
  const bleedScaleX = spec.bleedPx / spec.widthPx;
  const bleedScaleY = spec.bleedPx / spec.heightPx;
  const safeScaleX = spec.safePx / spec.widthPx;
  const safeScaleY = spec.safePx / spec.heightPx;
  const bleed: StageRect = {
    x: trim.x - trim.width * bleedScaleX,
    y: trim.y - trim.height * bleedScaleY,
    width: trim.width * (1 + 2 * bleedScaleX),
    height: trim.height * (1 + 2 * bleedScaleY),
  };
  const safe: StageRect = {
    x: trim.x + trim.width * safeScaleX,
    y: trim.y + trim.height * safeScaleY,
    width: trim.width * (1 - 2 * safeScaleX),
    height: trim.height * (1 - 2 * safeScaleY),
  };

  return {
    kind,
    productType,
    spec,
    stage: { trim, bleed, safe },
    surfaces: ["Front", "Back"],
    mockupUrl: product.image_url ?? null,
  };
}

/** Common supplier color names → garment hex for the canvas silhouette. */
export const COLOR_NAME_TO_HEX: Record<string, string> = {
  white: "#ffffff",
  black: "#1f2024",
  charcoal: "#3c3f47",
  gray: "#9aa0ad",
  grey: "#9aa0ad",
  "heather gray": "#b9bcc4",
  navy: "#314a6b",
  "royal blue": "#315dba",
  "light blue": "#d9e7f4",
  red: "#b3372f",
  burgundy: "#6e2434",
  pink: "#e9b8c9",
  cream: "#f3f1ea",
  sand: "#e7d5b8",
  "forest green": "#356b56",
  green: "#356b56",
  olive: "#6b6a45",
  brown: "#6d4c38",
  purple: "#7258e8",
  yellow: "#e8c95a",
  orange: "#c45b3c",
  /* Bella + Canvas 3001 colorways (the captured catalog's colors) —
   * preview tints for the studio's garment-color render, in the same
   * approximate spirit as the names above. "athletic heather" is the
   * exception: it is the captured template's own background_color
   * (#cececc in supplier_mockup_templates), so the tint matches the
   * captured Athletic Heather stage exactly. */
  aqua: "#4fa8a0",
  army: "#5b6248",
  ash: "#e8e8e6",
  asphalt: "#4a4a4c",
  "athletic heather": "#cececc",
  autumn: "#b0662f",
  "baby blue": "#a9c6e2",
  berry: "#8e2f56",
  "black heather": "#3a3a3e",
  "burnt orange": "#c65a21",
  cardinal: "#8e2233",
  "charity pink": "#e59bb0",
};

export function colorNameToHex(name: string | null | undefined): string {
  if (!name) return "#ffffff";
  return COLOR_NAME_TO_HEX[name.trim().toLowerCase()] ?? "#ffffff";
}
