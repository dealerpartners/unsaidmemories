/**
 * Fabric Design Studio — product template data
 *
 * The silhouette coordinate arrays below are copied verbatim from the
 * vanilla-Konva `drawProduct()` function in `/public/fabric-admin.html`
 * (lines 334–357). Do NOT redesign them — they are the production print
 * mockup shapes and must remain faithful to the HTML prototype.
 */

export type ProductType =
  | "Premium Tee"
  | "Classic Tee"
  | "Premium Hoodie"
  | "Crewneck Sweatshirt"
  | "Ceramic Mug"
  | "Insulated Tumbler"
  | "Enamel Cup"
  | "Tote Bag"
  | "Poster";

export type SilhouetteKind =
  | "shirt"
  | "hoodie"
  | "mug"
  | "tumbler"
  | "cup"
  | "tote"
  | "poster";

export interface PrintArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProductTemplate {
  type: ProductType;
  label: string;
  printArea: PrintArea;
  silhouette: SilhouetteKind;
  /** Multiplier applied to the whole silhouette group (used by Crewneck). */
  scale: number;
  defaultColor: string;
  colorOptions: string[];
}

/**
 * Shared print area used by every garment template (matches the dashed
 * guide rect drawn inside `drawProduct()` at x:130, y:155, w:160, h:205).
 */
const STANDARD_PRINT_AREA: PrintArea = {
  x: 130,
  y: 155,
  width: 160,
  height: 205,
};

/** Garment swatches offered on every apparel product. */
const APPAREL_COLORS = [
  "#ffffff",
  "#1f2024",
  "#5b5d68",
  "#f3f1ea",
  "#9aa0ad",
  "#c45b3c",
  "#356b56",
  "#315dba",
];

/** Mug / poster / tote swatches (slightly different palette). */
const GOODS_COLORS = [
  "#ffffff",
  "#1f2024",
  "#5b5d68",
  "#f3f1ea",
  "#e7d5b8",
  "#314a6b",
];

export const PRODUCT_TEMPLATES: ProductTemplate[] = [
  {
    type: "Premium Tee",
    label: "Premium Tee",
    printArea: STANDARD_PRINT_AREA,
    silhouette: "shirt",
    scale: 1,
    defaultColor: "#ffffff",
    colorOptions: APPAREL_COLORS,
  },
  {
    type: "Classic Tee",
    label: "Classic Tee",
    printArea: STANDARD_PRINT_AREA,
    silhouette: "shirt",
    scale: 1,
    defaultColor: "#ffffff",
    colorOptions: APPAREL_COLORS,
  },
  {
    type: "Premium Hoodie",
    label: "Premium Hoodie",
    printArea: STANDARD_PRINT_AREA,
    silhouette: "hoodie",
    scale: 1,
    defaultColor: "#5b5d68",
    colorOptions: APPAREL_COLORS,
  },
  {
    type: "Crewneck Sweatshirt",
    label: "Crewneck Sweatshirt",
    printArea: STANDARD_PRINT_AREA,
    silhouette: "shirt",
    scale: 1.03,
    defaultColor: "#f3f1ea",
    colorOptions: APPAREL_COLORS,
  },
  {
    type: "Ceramic Mug",
    label: "Ceramic Mug",
    printArea: { x: 100, y: 160, width: 220, height: 180 },
    silhouette: "mug",
    scale: 1,
    defaultColor: "#ffffff",
    colorOptions: GOODS_COLORS,
  },
  {
    type: "Insulated Tumbler",
    label: "Insulated Tumbler",
    printArea: { x: 118, y: 168, width: 184, height: 236 },
    silhouette: "tumbler",
    scale: 1,
    defaultColor: "#ffffff",
    colorOptions: GOODS_COLORS,
  },
  {
    type: "Enamel Cup",
    label: "Enamel Cup",
    printArea: { x: 108, y: 178, width: 204, height: 128 },
    silhouette: "cup",
    scale: 1,
    defaultColor: "#ffffff",
    colorOptions: GOODS_COLORS,
  },
  {
    type: "Tote Bag",
    label: "Tote Bag",
    printArea: { x: 100, y: 200, width: 220, height: 230 },
    silhouette: "tote",
    scale: 1,
    defaultColor: "#f3f1ea",
    colorOptions: GOODS_COLORS,
  },
  {
    type: "Poster",
    label: "Poster",
    printArea: { x: 60, y: 50, width: 300, height: 400 },
    silhouette: "poster",
    scale: 1,
    defaultColor: "#ffffff",
    colorOptions: GOODS_COLORS,
  },
];

export const DEFAULT_PRODUCT: ProductType = "Premium Tee";

export function getProductTemplate(type: ProductType): ProductTemplate {
  return (
    PRODUCT_TEMPLATES.find((p) => p.type === type) ?? PRODUCT_TEMPLATES[0]
  );
}

/* ------------------------------------------------------------------ */
/* Silhouette geometry — copied from drawProduct() in fabric-admin.html */
/* ------------------------------------------------------------------ */

/**
 * Main t-shirt body outline (closed). Copied verbatim from
 * `points:[155,96,126,107,79,137,47,220,92,240,118,195,118,424,302,424,302,195,328,240,373,220,341,137,294,107,265,96]`
 */
export const SHIRT_BODY_POINTS = [
  155, 96, 126, 107, 79, 137, 47, 220, 92, 240, 118, 195, 118, 424, 302, 424,
  302, 195, 328, 240, 373, 220, 341, 137, 294, 107, 265, 96,
];

/** Collar outer rim (closed). */
export const SHIRT_COLLAR_POINTS = [
  155, 96, 175, 116, 210, 129, 245, 116, 265, 96, 246, 80, 174, 80,
];

/** Collar inner stitch line (stroke only). */
export const SHIRT_COLLAR_LINE_POINTS = [
  175, 81, 181, 111, 210, 128, 239, 111, 245, 81,
];

/** Hood outline (closed, hoodie only). */
export const HOOD_POINTS = [
  165, 84, 155, 50, 180, 35, 210, 45, 240, 35, 265, 50, 255, 84,
];

/** Hood pocket left stitch. */
export const HOOD_POCKET_L = [194, 132, 194, 179];

/** Hood pocket right stitch. */
export const HOOD_POCKET_R = [226, 132, 226, 179];

/** Bottom hem stitch. */
export const SHIRT_HEM_POINTS = [117, 393, 303, 393];

/* Mug geometry */
export const MUG_BODY = { x: 90, y: 145, width: 235, height: 205, cornerRadius: 17 };
export const MUG_HANDLE = { x: 322, y: 247, innerRadius: 34, outerRadius: 45, angle: 180, rotation: -90 };

/* Tumbler geometry — tapered body with a lid band on top. */
export const TUMBLER_BODY_POINTS = [
  128, 128, 292, 128, 282, 402, 270, 428, 150, 428, 138, 402,
];
export const TUMBLER_LID = { x: 122, y: 102, width: 176, height: 26, cornerRadius: 8 };

/* Enamel cup geometry — short wide camp cup, mug-style handle. */
export const CUP_BODY = { x: 96, y: 158, width: 228, height: 168, cornerRadius: 12 };
export const CUP_HANDLE = { x: 320, y: 228, innerRadius: 26, outerRadius: 36, angle: 180, rotation: -90 };
export const CUP_RIM = { x: 96, y: 150, width: 228, height: 14, cornerRadius: 7 };

/* Tote geometry */
export const TOTE_HANDLE = { x: 210, y: 160, innerRadius: 44, outerRadius: 51, angle: 180, rotation: 180 };
export const TOTE_BODY = { x: 87, y: 175, width: 246, height: 265, cornerRadius: [5, 5, 16, 16] as [number, number, number, number] };

/* Poster geometry */
export const POSTER_BODY = { x: 48, y: 36, width: 324, height: 428 };

/* Print-area guide label */
export const PRINT_AREA_LABEL = { x: 130, y: 363, width: 160, text: "PRINT AREA", fontSize: 8 };

/** Stage dimensions (matches `stageW` / `stageH` in the prototype). */
export const STAGE_WIDTH = 420;
export const STAGE_HEIGHT = 500;

/** Zoom range enforced by `setCanvasZoom()` in the prototype. */
export const ZOOM_MIN = 0.65;
export const ZOOM_MAX = 1.35;
export const ZOOM_STEP = 0.1;
