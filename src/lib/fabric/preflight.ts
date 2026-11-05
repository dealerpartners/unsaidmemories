/**
 * Fabric studio — preflight validation (architecture doc §8).
 *
 * Runs before a design may move draft → needs_review → ready_to_publish.
 * Errors block the transition; warnings surface in the review panel but
 * do not block. Checks are geometric (artwork inside the real print
 * spec), commercial (title/price/category/supplier), and structural
 * (a persisted print file exists for every designed surface).
 */

import type { DesignNode } from "@/lib/admin/design-node";
import type { ResolvedTemplate, Surface } from "./templates";

export interface CanvasStateV2 {
  app: "Fabric Design Studio";
  version: 2;
  productName: string;
  productType: string;
  garmentColor: string;
  supplierCatalogProductId: string | null;
  templateKind: string;
  surfaces: Record<Surface, DesignNode[]>;
  /**
   * Additive workspace extensions (Konva completion build). All
   * optional — older saved designs simply don't have them, and every
   * reader treats absence as "none". They ride the same canvas_state
   * JSON; no migration is involved.
   */
  boards?: SketchBoard[];
  gangSheets?: GangSheet[];
  book?: BookState | null;
  annotations?: AnnotationState | null;
}

/** A freehand sketch board: draw first, deliver to AI when ready. */
export interface SketchBoard {
  id: string;
  name: string;
  nodes: DesignNode[];
}

/** One placed artwork on a DTF gang sheet (positions in inches). */
export interface GangItem {
  id: string;
  src: string;
  name: string;
  xIn: number;
  yIn: number;
  wIn: number;
  /** height / width of the source image. */
  aspect: number;
  rotation: number;
}

/** A DTF gang sheet: many artworks arranged on one printable sheet. */
export interface GangSheet {
  id: string;
  name: string;
  widthIn: number;
  heightIn: number;
  items: GangItem[];
}

export interface BookPage {
  id: string;
  label: string;
  nodes: DesignNode[];
}

/** A multi-page book design (cover + interior pages). */
export interface BookState {
  trimWIn: number;
  trimHIn: number;
  pages: BookPage[];
}

/**
 * A PDF annotation board: the first node of `nodes` is the locked
 * page image; the rest are the annotation layers drawn over it.
 */
export interface AnnotationState {
  sourceName: string;
  /** The page image the annotations sit on (asset URL or data URL). */
  imageSrc: string;
  /** Physical page size when known (from the PDF MediaBox). */
  physWIn: number | null;
  physHIn: number | null;
  nodes: DesignNode[];
}

export interface PreflightIssue {
  level: "error" | "warning";
  surface: Surface | null;
  message: string;
}

export interface PreflightResult {
  ok: boolean;
  errors: PreflightIssue[];
  warnings: PreflightIssue[];
}

interface DesignFacts {
  canvas_state: unknown;
  product_title: string | null;
  retail_price: number | null;
  category_id: string | null;
  supplier_catalog_product_id: string | null;
  print_file_path: string | null;
}

/**
 * On-canvas bounds of one node. Exported (additive) so the Publish
 * wizard's Step 2 can run this exact geometry for its live print-area
 * fit check — one bounds implementation, never a parallel copy.
 *
 * Geometry follows Konva's own transform order, which the old version
 * did not: a node draws from its local origin (0,0) to (width,height),
 * is scaled (a negative scale flips it about the origin), then rotated
 * about that same origin, then translated to (x,y). Ignoring rotation
 * let a rotated node near the print-area edge PASS the fit check while
 * its rendered corners spilled past the area and were clipped in
 * production — the fit check measured a box the canvas never drew.
 * The fix is here, in the one bounds implementation, not in the
 * wizard's copy of it (there is none): every corner of the local box
 * goes through scale → rotate → translate, and the returned box is the
 * axis-aligned hull of the transformed corners.
 */
type Pt = { x: number; y: number };

function hull(points: Pt[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Local box corners through one node's scale/rotation/translation. */
function placedBox(
  n: { x: number; y: number; scaleX: number; scaleY: number; rotation: number },
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number } {
  const rad = ((n.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners: Pt[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: 0, y: h },
    { x: w, y: h },
  ].map((p) => {
    const sx = p.x * n.scaleX;
    const sy = p.y * n.scaleY;
    return {
      x: n.x + sx * cos - sy * sin,
      y: n.y + sx * sin + sy * cos,
    };
  });
  return hull(corners);
}

export function nodeBounds(n: DesignNode): { x: number; y: number; w: number; h: number } {
  switch (n.kind) {
    case "text": {
      // Konva wraps text at node.width; only explicit newlines can be
      // counted without measuring glyphs, so the height is one line
      // per explicit line (the old single-line height under-measured
      // multi-line text and let it pass while its lower lines
      // clipped). Wrapped lines beyond the explicit count remain an
      // approximation the canvas itself measures at render time.
      // The canvas renders lineHeight ?? 1.15; the 1.3 floor keeps
      // the historical conservative height for ordinary text, while
      // a lineHeight above 1.3 now measures honestly instead of
      // under-measuring tall-spaced text past the print edge.
      const lines = Math.max(1, n.text.split("\n").length);
      const lh = Math.max(1.3, n.lineHeight ?? 1.15);
      return placedBox(n, n.width, n.fontSize * lh * lines);
    }
    case "rect":
    case "image":
      return placedBox(n, n.width, n.height);
    case "circle":
      // Rotation cannot change a circle's hull; scale alone matters.
      return {
        x: n.x - n.radius * Math.abs(n.scaleX),
        y: n.y - n.radius * Math.abs(n.scaleY),
        w: n.radius * 2 * Math.abs(n.scaleX),
        h: n.radius * 2 * Math.abs(n.scaleY),
      };
    case "line":
    case "arrow": {
      if (!n.points.length) return { x: n.x, y: n.y, w: 0, h: 0 };
      const rad = ((n.rotation ?? 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      // Local points first: an arrow's head is a triangle whose tip
      // is the last point and whose base corners sit pointerLength
      // back along the final segment, spread pointerWidth across it.
      // Those base corners can stick out sideways past the polyline,
      // so they join the hull (a wide arrowhead flush with the print
      // edge used to pass while its corners clipped).
      const local: Pt[] = [];
      for (let i = 0; i + 1 < n.points.length; i += 2) {
        local.push({ x: n.points[i], y: n.points[i + 1] });
      }
      if (n.kind === "arrow" && local.length >= 2) {
        const last = local[local.length - 1];
        const prev = local[local.length - 2];
        const dx = last.x - prev.x;
        const dy = last.y - prev.y;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          const pl = n.pointerLength ?? 16;
          const pw = n.pointerWidth ?? 13;
          const ux = dx / len;
          const uy = dy / len;
          const bx = last.x - ux * pl;
          const by = last.y - uy * pl;
          local.push(
            { x: bx - uy * (pw / 2), y: by + ux * (pw / 2) },
            { x: bx + uy * (pw / 2), y: by - ux * (pw / 2) },
          );
        }
      }
      const pts: Pt[] = local.map((p) => {
        const sx = p.x * n.scaleX;
        const sy = p.y * n.scaleY;
        return {
          x: n.x + sx * cos - sy * sin,
          y: n.y + sx * sin + sy * cos,
        };
      });
      return hull(pts);
    }
    case "group": {
      // Children live in group-local space (their bounds are already
      // in that space, rotation included); each child box's corners go
      // through the group's own transform and the hull is the union.
      if (!n.children.length) return { x: n.x, y: n.y, w: 0, h: 0 };
      const rad = ((n.rotation ?? 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const pts: Pt[] = [];
      for (const child of n.children) {
        const b = nodeBounds(child);
        for (const c of [
          { x: b.x, y: b.y },
          { x: b.x + b.w, y: b.y },
          { x: b.x, y: b.y + b.h },
          { x: b.x + b.w, y: b.y + b.h },
        ]) {
          const sx = c.x * n.scaleX;
          const sy = c.y * n.scaleY;
          pts.push({
            x: n.x + sx * cos - sy * sin,
            y: n.y + sx * sin + sy * cos,
          });
        }
      }
      return hull(pts);
    }
  }
}

export function asCanvasStateV2(raw: unknown): CanvasStateV2 | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (s.version !== 2 || typeof s.surfaces !== "object" || !s.surfaces) {
    return null;
  }
  const surfaces = s.surfaces as Record<string, unknown>;
  return {
    app: "Fabric Design Studio",
    version: 2,
    productName: String(s.productName ?? ""),
    productType: String(s.productType ?? ""),
    garmentColor: String(s.garmentColor ?? "#ffffff"),
    supplierCatalogProductId:
      typeof s.supplierCatalogProductId === "string"
        ? s.supplierCatalogProductId
        : null,
    templateKind: String(s.templateKind ?? ""),
    surfaces: {
      Front: Array.isArray(surfaces.Front) ? (surfaces.Front as DesignNode[]) : [],
      Back: Array.isArray(surfaces.Back) ? (surfaces.Back as DesignNode[]) : [],
    },
    // Additive workspace extensions pass through untouched (they are
    // the studio's own data; preflight only validates surfaces).
    ...(Array.isArray(s.boards) ? { boards: s.boards as SketchBoard[] } : {}),
    ...(Array.isArray(s.gangSheets)
      ? { gangSheets: s.gangSheets as GangSheet[] }
      : {}),
    ...(s.book && typeof s.book === "object"
      ? { book: s.book as BookState }
      : {}),
    ...(s.annotations && typeof s.annotations === "object"
      ? { annotations: s.annotations as AnnotationState }
      : {}),
  };
}

export function runPreflight(
  design: DesignFacts,
  template: ResolvedTemplate | null,
): PreflightResult {
  const errors: PreflightIssue[] = [];
  const warnings: PreflightIssue[] = [];
  const err = (surface: Surface | null, message: string) =>
    errors.push({ level: "error", surface, message });
  const warn = (surface: Surface | null, message: string) =>
    warnings.push({ level: "warning", surface, message });

  const state = asCanvasStateV2(design.canvas_state);
  if (!state) {
    err(null, "Design was saved by the legacy studio (no per-surface state). Reopen it in the studio and save again.");
    return { ok: false, errors, warnings };
  }

  if (!design.supplier_catalog_product_id) {
    err(null, "No supplier catalog product selected — the design is not tied to a real product.");
  }
  if (!design.product_title?.trim()) err(null, "Product title is empty.");
  if (!design.retail_price || design.retail_price <= 0) {
    err(null, "Retail price must be greater than zero.");
  }
  if (!design.category_id) err(null, "No storefront category chosen.");

  const designedSurfaces = (Object.keys(state.surfaces) as Surface[]).filter(
    (s) => state.surfaces[s].length > 0,
  );
  if (designedSurfaces.length === 0) {
    err(null, "The canvas is empty — add artwork before review.");
  }

  if (template) {
    const { trim, safe } = template.stage;
    for (const surface of designedSurfaces) {
      for (const node of state.surfaces[surface]) {
        const b = nodeBounds(node);
        const outsideTrim =
          b.x < trim.x - 1 ||
          b.y < trim.y - 1 ||
          b.x + b.w > trim.x + trim.width + 1 ||
          b.y + b.h > trim.y + trim.height + 1;
        if (outsideTrim) {
          err(
            surface,
            `"${node.name}" extends outside the print area on the ${surface} — it would be clipped in production.`,
          );
          continue;
        }
        const outsideSafe =
          b.x < safe.x ||
          b.y < safe.y ||
          b.x + b.w > safe.x + safe.width ||
          b.y + b.h > safe.y + safe.height;
        if (outsideSafe) {
          warn(
            surface,
            `"${node.name}" crosses the safe area on the ${surface} — keep important content inside it.`,
          );
        }
        if (node.kind === "image" && node.src.startsWith("blob:")) {
          err(
            surface,
            `"${node.name}" is a temporary browser image — upload it so the artwork is stored with the design.`,
          );
        }
      }
    }
    if (template.spec.source === "default") {
      warn(
        null,
        "This supplier variant carries no print spec — per-kind default dimensions were used. Verify against the supplier before fulfilling.",
      );
    }
  }

  if (designedSurfaces.length > 0 && !design.print_file_path) {
    warn(null, "No print file exported yet — one will be generated during publish if still missing.");
  }

  return { ok: errors.length === 0, errors, warnings };
}
