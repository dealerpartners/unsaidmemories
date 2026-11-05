/**
 * SVG export — serialize a design surface (studio v2 nodes) to a real
 * vector SVG on the supplier print grid.
 *
 * Coordinates: nodes live in 420×500 stage space; the export maps the
 * print-zone (trim) rect onto the spec pixel grid (spec.widthPx ×
 * spec.heightPx), so the SVG opens at true print size in any vector
 * tool and feeds the Fabric.js post-processor unchanged.
 *
 * Fidelity notes (honest limits):
 *   - Text is emitted as <text> with the node's family/size/fill —
 *     the receiving tool needs the font installed (the post-processor
 *     rasterizes in-browser, where loadGoogleFont has fetched it).
 *   - Konva wraps text by width; SVG does not wrap, so multi-line
 *     text is split on explicit newlines only.
 *   - Image crops become a <clipPath> window over the full image,
 *     positioned so the crop maps exactly onto the node box.
 *   - Freehand strokes with tension export as smoothed paths
 *     (quadratic through midpoints — the same curve Konva draws).
 */

import type {
  CircleNode,
  DesignNode,
  ImageNode,
  ArrowNode,
  LineNode,
  RectNode,
  TextNode,
} from "@/lib/admin/design-node";
import type { StageRect } from "./templates";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* Mask shapes on the same 100x100 grid the canvas renderer uses. */
const MASK_HEART_PATH =
  "M50 88 C20 62 4 44 4 28 C4 13 16 4 28 4 C38 4 47 10 50 19 C53 10 62 4 72 4 C84 4 96 13 96 28 C96 44 80 62 50 88 Z";
const MASK_STAR_PATH =
  "M50 2 L61.8 37.1 L98.5 38.2 L69.1 60.9 L79.4 96.8 L50 75.6 L20.6 96.8 L30.9 60.9 L1.5 38.2 L38.2 37.1 Z";

/** The clipPath body for an image mask, in the node's local (already
 *  k-scaled) box coordinates — mirrors MaskShape in canvas-editor. */
function maskShapeSvg(
  mask: import("@/lib/admin/design-node").ImageMask,
  w: number,
  h: number,
  k: number,
): string {
  switch (mask.shape) {
    case "circle":
      return `<circle cx="${(w / 2).toFixed(2)}" cy="${(h / 2).toFixed(2)}" r="${(Math.min(w, h) / 2).toFixed(2)}"/>`;
    case "rect":
      return `<rect x="0" y="0" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${((mask.cornerRadius ?? 18) * k).toFixed(2)}"/>`;
    case "heart":
      return `<path d="${MASK_HEART_PATH}" transform="scale(${(w / 100).toFixed(4)} ${(h / 100).toFixed(4)})"/>`;
    case "star":
      return `<path d="${MASK_STAR_PATH}" transform="scale(${(w / 100).toFixed(4)} ${(h / 100).toFixed(4)})"/>`;
    case "text": {
      const text = (mask.text ?? "LOVE").toUpperCase() || "LOVE";
      const fontSize = Math.min(h * 0.92, (w / Math.max(1, text.length)) * 1.7);
      return `<text x="${(w / 2).toFixed(2)}" y="${(h / 2).toFixed(2)}" font-family="${esc(mask.fontFamily ?? "Space Grotesk")}" font-size="${fontSize.toFixed(2)}" font-weight="bold" text-anchor="middle" dominant-baseline="central">${esc(text)}</text>`;
    }
  }
}

interface Ctx {
  /** stage px → svg px scale */
  k: number;
  trim: StageRect;
  defs: string[];
  uid: number;
  /**
   * Coordinate mode for THIS node's anchor: top-level nodes are
   * trim-relative; group children are local (the parent <g> carries
   * the trim shift, and its scale multiplies child geometry — so a
   * child's anchor scales by k but is never trim-shifted).
   */
  local: boolean;
}

function nodeToSvg(node: DesignNode, ctx: Ctx): string {
  const { k, trim } = ctx;
  const X = (x: number) => ((ctx.local ? x : x - trim.x) * k).toFixed(2);
  const Y = (y: number) => ((ctx.local ? y : y - trim.y) * k).toFixed(2);
  const transform = `transform="translate(${X(node.x)} ${Y(node.y)}) rotate(${node.rotation}) scale(${node.scaleX} ${node.scaleY})" opacity="${node.opacity}"`;

  switch (node.kind) {
    case "text": {
      const n = node as TextNode;
      const anchor = n.align === "center" ? "middle" : n.align === "right" ? "end" : "start";
      const ax = n.align === "center" ? (n.width * k) / 2 : n.align === "right" ? n.width * k : 0;
      const style = `font-family="${esc(n.fontFamily)}" font-size="${(n.fontSize * k).toFixed(2)}" fill="${esc(n.fill)}"${n.fontStyle.includes("bold") ? ' font-weight="700"' : ""}${n.fontStyle.includes("italic") ? ' font-style="italic"' : ""}${n.letterSpacing ? ` letter-spacing="${(n.letterSpacing * k).toFixed(2)}"` : ""}`;
      if (n.curve) {
        const { radius, spacingDeg } = n.curve;
        const chars = n.text.split("");
        const startAngle = -((chars.length - 1) * spacingDeg) / 2;
        const letters = chars
          .map((ch, i) => {
            const angle = startAngle + i * spacingDeg;
            const rad = (angle * Math.PI) / 180;
            const lx = radius * Math.sin(rad) * k;
            const ly = -radius * Math.cos(rad) * k;
            return `<text x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" ${style} text-anchor="middle" transform="rotate(${angle.toFixed(2)} ${lx.toFixed(2)} ${ly.toFixed(2)})">${esc(ch)}</text>`;
          })
          .join("");
        return `<g transform="translate(${X(n.x)} ${Y(n.y)}) rotate(${n.rotation}) scale(${n.scaleX} ${n.scaleY})" opacity="${n.opacity}">${letters}</g>`;
      }
      const lines = n.text.split("\n");
      const tspans = lines
        .map(
          (line, i) =>
            `<tspan x="${ax.toFixed(2)}" dy="${i === 0 ? (n.fontSize * k).toFixed(2) : (n.fontSize * (n.lineHeight ?? 1.15) * k).toFixed(2)}">${esc(line)}</tspan>`,
        )
        .join("");
      return `<text ${transform} ${style} text-anchor="${anchor}">${tspans}</text>`;
    }
    case "rect": {
      const n = node as RectNode;
      return `<rect x="0" y="0" width="${(n.width * k).toFixed(2)}" height="${(n.height * k).toFixed(2)}" rx="${(n.cornerRadius * k).toFixed(2)}" fill="${esc(n.fill)}"${n.strokeWidth > 0 ? ` stroke="${esc(n.stroke)}" stroke-width="${(n.strokeWidth * k).toFixed(2)}"` : ""} ${transform}/>`;
    }
    case "circle": {
      const n = node as CircleNode;
      return `<circle cx="0" cy="0" r="${(n.radius * k).toFixed(2)}" fill="${esc(n.fill)}"${n.strokeWidth > 0 ? ` stroke="${esc(n.stroke)}" stroke-width="${(n.strokeWidth * k).toFixed(2)}"` : ""} ${transform}/>`;
    }
    case "image": {
      const n = node as ImageNode;
      const w = n.width * k;
      const h = n.height * k;
      // Masking: a clipPath with the mask shape wraps the image,
      // mirroring the canvas renderer's cached-group compositing.
      const maskClip = (core: string): string => {
        if (!n.mask) return core;
        const mid = `mask${ctx.uid++}`;
        ctx.defs.push(
          `<clipPath id="${mid}">${maskShapeSvg(n.mask, w, h, k)}</clipPath>`,
        );
        return `<g clip-path="url(#${mid})">${core}</g>`;
      };
      if (n.crop && n.naturalWidth && n.naturalHeight) {
        const id = `crop${ctx.uid++}`;
        const sx = w / n.crop.width / 1; // svg px per source px, x
        const sy = h / n.crop.height;
        const imgW = n.naturalWidth * (w / n.crop.width);
        const imgH = n.naturalHeight * (h / n.crop.height);
        void sx; void sy;
        ctx.defs.push(
          `<clipPath id="${id}"><rect x="0" y="0" width="${w.toFixed(2)}" height="${h.toFixed(2)}"/></clipPath>`,
        );
        const core = `<g clip-path="url(#${id})"><image href="${esc(n.src)}" x="${(-n.crop.x * (w / n.crop.width)).toFixed(2)}" y="${(-n.crop.y * (h / n.crop.height)).toFixed(2)}" width="${imgW.toFixed(2)}" height="${imgH.toFixed(2)}" preserveAspectRatio="none"/></g>`;
        return `<g ${transform}>${maskClip(core)}</g>`;
      }
      if (n.mask) {
        const core = `<image href="${esc(n.src)}" x="0" y="0" width="${w.toFixed(2)}" height="${h.toFixed(2)}" preserveAspectRatio="none"/>`;
        return `<g ${transform}>${maskClip(core)}</g>`;
      }
      return `<image href="${esc(n.src)}" x="0" y="0" width="${w.toFixed(2)}" height="${h.toFixed(2)}" preserveAspectRatio="none" ${transform}/>`;
    }
    case "line": {
      const n = node as LineNode;
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < n.points.length; i += 2) {
        pts.push([n.points[i], n.points[i + 1]]);
      }
      // Points are local to the node anchor; the group transform below
      // places them — so local coords scale by k only.
      const scaled = pts.map(([x, y]) => [x * k, y * k] as [number, number]);
      let d: string;
      if ((n.tension ?? 0) > 0 && scaled.length > 2) {
        d = `M ${scaled[0][0].toFixed(2)} ${scaled[0][1].toFixed(2)}`;
        for (let i = 1; i < scaled.length - 1; i++) {
          const mx = (scaled[i][0] + scaled[i + 1][0]) / 2;
          const my = (scaled[i][1] + scaled[i + 1][1]) / 2;
          d += ` Q ${scaled[i][0].toFixed(2)} ${scaled[i][1].toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
        }
        const last = scaled[scaled.length - 1];
        d += ` L ${last[0].toFixed(2)} ${last[1].toFixed(2)}`;
      } else {
        d = `M ${scaled.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")}`;
      }
      return `<path d="${d}" fill="none" stroke="${esc(n.stroke)}" stroke-width="${(n.strokeWidth * k).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" ${transform}/>`;
    }
    case "arrow": {
      const n = node as ArrowNode;
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < n.points.length; i += 2) {
        pts.push([n.points[i] * k, n.points[i + 1] * k]);
      }
      if (pts.length < 2) return "";
      const d = `M ${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")}`;
      // Arrowhead: a filled triangle at the last point, aimed along the
      // final segment — the vector twin of the Konva Arrow's pointer.
      const [tx, ty] = pts[pts.length - 1];
      const [px, py] = pts[pts.length - 2];
      const ang = Math.atan2(ty - py, tx - px);
      const headLen = (n.pointerLength ?? 16) * k;
      const headWid = ((n.pointerWidth ?? 13) * k) / 2;
      const bx = tx - Math.cos(ang) * headLen;
      const by = ty - Math.sin(ang) * headLen;
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      const head = `${tx.toFixed(2)},${ty.toFixed(2)} ${(bx + nx * headWid).toFixed(2)},${(by + ny * headWid).toFixed(2)} ${(bx - nx * headWid).toFixed(2)},${(by - ny * headWid).toFixed(2)}`;
      return `<path d="${d}" fill="none" stroke="${esc(n.stroke)}" stroke-width="${(n.strokeWidth * k).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" ${transform}/><polygon points="${head}" fill="${esc(n.stroke)}" ${transform}/>`;
    }
    case "group": {
      const inner = node.children
        .map((c) => nodeToSvg(c, { ...ctx, local: true }))
        .join("");
      return `<g transform="translate(${X(node.x)} ${Y(node.y)}) rotate(${node.rotation}) scale(${node.scaleX} ${node.scaleY})" opacity="${node.opacity}">${inner}</g>`;
    }
    default:
      return "";
  }
}

/**
 * Serialize one surface's nodes to a standalone SVG document sized to
 * the print grid. `trim` is the surface's print zone in stage coords.
 */
export function nodesToSvg(
  nodes: DesignNode[],
  trim: StageRect,
  spec: { widthPx: number; heightPx: number; dpi: number },
): string {
  const ctx: Ctx = { k: spec.widthPx / trim.width, trim, defs: [], uid: 0, local: false };
  const body = nodes.map((n) => nodeToSvg(n, ctx)).join("\n");
  const defs = ctx.defs.length ? `<defs>${ctx.defs.join("")}</defs>` : "";
  const wIn = (spec.widthPx / spec.dpi).toFixed(3);
  const hIn = (spec.heightPx / spec.dpi).toFixed(3);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${wIn}in" height="${hIn}in" viewBox="0 0 ${spec.widthPx} ${spec.heightPx}">${defs}${body}</svg>`;
}
