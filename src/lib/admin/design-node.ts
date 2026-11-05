/**
 * Fabric Design Studio — design-layer node model
 *
 * A single discriminated union describing every kind of node that can
 * live on the design layer of the Konva stage. State is kept as plain
 * JSON so it can be serialised to localStorage, restored, and pushed
 * onto the undo/redo history stack.
 */

export type DesignNodeKind = "text" | "rect" | "circle" | "image" | "line" | "arrow" | "group";

export interface BaseNode {
  id: string;
  kind: DesignNodeKind;
  name: string;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  scaleX: number;
  scaleY: number;
  /**
   * Layer lock: a locked node still renders and exports, but cannot be
   * dragged or transformed until unlocked. Optional — states saved
   * before locking existed simply have it unset (unlocked).
   */
  locked?: boolean;
}

export interface TextNode extends BaseNode {
  kind: "text";
  text: string;
  fontSize: number;
  fontFamily: string;
  fontStyle: string;
  fill: string;
  align: "left" | "center" | "right";
  width: number;
  /** Optional typography extensions (Konva spec additions). */
  letterSpacing?: number;
  lineHeight?: number;
  /** Curved lettering: letters are placed on an arc when set. */
  curve?: { radius: number; spacingDeg: number } | null;
}

export interface RectNode extends BaseNode {
  kind: "rect";
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
}

export interface CircleNode extends BaseNode {
  kind: "circle";
  radius: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface ImageFilters {
  brightness: number; // -1..1 (Konva Brighten)
  contrast: number; // -100..100 (Konva Contrast)
  saturation: number; // 0..2 (Konva HSL)
}

export interface ImageNode extends BaseNode {
  kind: "image";
  width: number;
  height: number;
  src: string;
  /**
   * Source-pixel crop window (Konva cropX/cropY/cropWidth/cropHeight).
   * The node width/height stay the DISPLAY size; Konva stretches the
   * crop window into it. Unset = the full source image.
   */
  crop?: { x: number; y: number; width: number; height: number };
  /**
   * Chroma key: pixels near `color` (hex) become transparent, with
   * `tolerance` 0..1 feathering the edge. Applied through the Konva
   * filter pipeline alongside brightness/contrast/saturation.
   */
  chromaKey?: { color: string; tolerance: number } | null;
  /** Intrinsic pixel size of the source asset — drives the DPI auditor. */
  naturalWidth?: number;
  naturalHeight?: number;
  /** Konva filter engine values (unset = no filters applied). */
  filters?: ImageFilters;
  /** Mockup realism: multiply weaves the fabric texture into the art. */
  blend?: "multiply" | "normal";
  /**
   * Mask: the image is only visible inside this shape (a circle, a
   * rounded rectangle, a heart, a star, or the outline of a word).
   * Rendered by compositing inside the node's own group, so it rides
   * the normal raster export path (PNG / print file / PDF) unchanged.
   * Unset/null = no mask (the whole image shows).
   */
  mask?: ImageMask | null;
}

export interface ImageMask {
  shape: "circle" | "rect" | "heart" | "star" | "text";
  /** The word whose letterforms form the mask (shape === "text"). */
  text?: string;
  fontFamily?: string;
  /** Corner radius for the "rect" mask, in design units. */
  cornerRadius?: number;
}

/**
 * Freehand drawing / annotation stroke (Konva.Line). Points are flat
 * [x1, y1, x2, y2, …] in the node's local space; the node x/y anchors
 * the stroke like every other node.
 */
export interface ArrowNode extends BaseNode {
  kind: "arrow";
  /** Flat [x1, y1, x2, y2, ...] in local coords — same model as a line. */
  points: number[];
  stroke: string;
  strokeWidth: number;
  /** Arrowhead size in design units (defaults scale with the stroke). */
  pointerLength?: number;
  pointerWidth?: number;
}

export interface LineNode extends BaseNode {
  kind: "line";
  points: number[];
  stroke: string;
  strokeWidth: number;
  /** Konva Line tension (0 = polyline, 0.5 = smooth curve). */
  tension?: number;
}

/**
 * A group of nodes that move, scale, rotate and lock as one unit.
 * Children keep LOCAL coordinates (relative to the group's anchor);
 * grouping converts surface coords → local, ungrouping converts back.
 * Single-level by design — the studio never nests groups in groups.
 */
export interface GroupNode extends BaseNode {
  kind: "group";
  children: DesignNode[];
}

export type DesignNode = TextNode | RectNode | CircleNode | ImageNode | LineNode | ArrowNode | GroupNode;

/** Canvas-side dimensions of the design stage (matches STAGE_WIDTH). */
export const DESIGN_STAGE_W = 420;
export const DESIGN_STAGE_H = 500;

export const FONT_FAMILY_OPTIONS = [
  "Space Grotesk",
  "DM Sans",
  "Manrope",
  "Anton",
  "Archivo Black",
  "Bebas Neue",
  "Lobster",
  "Montserrat",
  "Oswald",
  "Pacifico",
  "Playfair Display",
  "Poppins",
  "Arial",
  "Georgia",
  "Courier New",
] as const;

/** Families served locally/system — everything else loads from Google Fonts. */
const LOCAL_FONTS = new Set(["Arial", "Georgia", "Courier New"]);
const fontLinkLoaded = new Set<string>();

/**
 * Load a Google Font on the fly and WAIT until the browser has it
 * parsed (FontFace set), so Konva text renders — and exports — in the
 * real typeface instead of falling back mid-snapshot.
 */
export async function loadGoogleFont(family: string): Promise<boolean> {
  if (LOCAL_FONTS.has(family)) return true;
  try {
    if (!fontLinkLoaded.has(family)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/\s+/g, "+")}:wght@400;700&display=swap`;
      document.head.appendChild(link);
      fontLinkLoaded.add(family);
    }
    await document.fonts.load(`16px "${family}"`);
    await document.fonts.load(`700 16px "${family}"`);
    return true;
  } catch {
    return false;
  }
}

/** Quick text colors offered in the inspector. */
export const TEXT_COLOR_SWATCHES = [
  "#202126",
  "#7258e8",
  "#e45173",
  "#22a06b",
  "#c45b3c",
  "#315dba",
  "#ffffff",
  "#9aa0ad",
];

let _idCounter = 0;
export function nextId(prefix = "n"): string {
  _idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${_idCounter}`;
}

export function defaultTextNode(overrides: Partial<TextNode> = {}): TextNode {
  return {
    id: nextId("text"),
    kind: "text",
    name: "Text",
    x: 155,
    y: 225,
    text: "YOUR TEXT",
    fontSize: 28,
    fontFamily: "Space Grotesk",
    fontStyle: "bold",
    fill: "#202126",
    align: "center",
    width: 180,
    rotation: 0,
    opacity: 1,
    scaleX: 1,
    scaleY: 1,
    ...overrides,
  };
}

export function defaultRectNode(overrides: Partial<RectNode> = {}): RectNode {
  return {
    id: nextId("rect"),
    kind: "rect",
    name: "Rectangle",
    x: 150,
    y: 200,
    width: 120,
    height: 80,
    fill: "#7258e8",
    stroke: "#ffffff",
    strokeWidth: 0,
    cornerRadius: 12,
    rotation: 0,
    opacity: 1,
    scaleX: 1,
    scaleY: 1,
    ...overrides,
  };
}

export function defaultCircleNode(overrides: Partial<CircleNode> = {}): CircleNode {
  return {
    id: nextId("circle"),
    kind: "circle",
    name: "Circle",
    x: 210,
    y: 250,
    radius: 55,
    fill: "#7258e8",
    stroke: "#ffffff",
    strokeWidth: 2,
    rotation: 0,
    opacity: 1,
    scaleX: 1,
    scaleY: 1,
    ...overrides,
  };
}

export function defaultArrowNode(overrides: Partial<ArrowNode> = {}): ArrowNode {
  return {
    id: nextId("arrow"),
    kind: "arrow",
    name: "Arrow",
    x: 0,
    y: 0,
    points: [],
    stroke: "#202126",
    strokeWidth: 3,
    pointerLength: 16,
    pointerWidth: 13,
    rotation: 0,
    opacity: 1,
    scaleX: 1,
    scaleY: 1,
    ...overrides,
  };
}

export function defaultLineNode(overrides: Partial<LineNode> = {}): LineNode {
  return {
    id: nextId("line"),
    kind: "line",
    name: "Drawing",
    x: 0,
    y: 0,
    points: [],
    stroke: "#202126",
    strokeWidth: 3,
    tension: 0.5,
    rotation: 0,
    opacity: 1,
    scaleX: 1,
    scaleY: 1,
    ...overrides,
  };
}

export function defaultImageNode(src: string, overrides: Partial<ImageNode> = {}): ImageNode {
  return {
    id: nextId("img"),
    kind: "image",
    name: "Image",
    x: 125,
    y: 165,
    width: 170,
    height: 170,
    src,
    rotation: 0,
    opacity: 1,
    scaleX: 1,
    scaleY: 1,
    ...overrides,
  };
}

/** Per-side project snapshot saved to localStorage. */
export interface StudioProject {
  app: "Fabric Design Studio";
  version: 1;
  productName: string;
  product: string;
  garmentColor: string;
  currentSide: "Front" | "Back";
  sides: { Front: DesignNode[]; Back: DesignNode[] };
  updatedAt: string;
}
