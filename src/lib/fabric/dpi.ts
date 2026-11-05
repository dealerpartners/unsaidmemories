/**
 * Live DPI Auditor — the studio's gatekeeper (Sunny's Konva spec).
 *
 * Maps a node's canvas footprint back to physical inches through the
 * print zone's pixels-per-inch, then divides the asset's natural pixel
 * size by those inches. The master DPI is the LOWER of the X/Y
 * densities (protects against one-axis stretching). Text and vector
 * nodes are resolution-independent and never gated.
 */

import type { DesignNode } from "@/lib/admin/design-node";
import type { ResolvedTemplate } from "./templates";

export const TARGET_DPI = 300;

export interface NodeDpi {
  dpi: number;
  dpiX: number;
  dpiY: number;
  isPrintReady: boolean;
  naturalResolution: string;
  physicalWidthIn: number;
  physicalHeightIn: number;
  marginOfSafety: number;
}

export function calculateNodeDPI(
  naturalWidth: number,
  naturalHeight: number,
  nodeCanvasWidth: number,
  nodeCanvasHeight: number,
  zone: { physicalWidthIn: number; physicalHeightIn: number; canvasWidthPx: number; canvasHeightPx: number },
): NodeDpi {
  const ppiX = zone.canvasWidthPx / zone.physicalWidthIn;
  const ppiY = zone.canvasHeightPx / zone.physicalHeightIn;
  const physicalWidthIn = nodeCanvasWidth / ppiX;
  const physicalHeightIn = nodeCanvasHeight / ppiY;
  const dpiX = Math.round(naturalWidth / physicalWidthIn);
  const dpiY = Math.round(naturalHeight / physicalHeightIn);
  const dpi = Math.min(dpiX, dpiY);
  return {
    dpi,
    dpiX,
    dpiY,
    isPrintReady: dpi >= TARGET_DPI,
    naturalResolution: `${naturalWidth}x${naturalHeight}`,
    physicalWidthIn,
    physicalHeightIn,
    marginOfSafety: dpi - TARGET_DPI,
  };
}

/** Zone geometry from a resolved supplier template (trim = print zone). */
export function zoneFromTemplate(template: ResolvedTemplate) {
  return {
    physicalWidthIn: template.spec.widthPx / template.spec.dpi,
    physicalHeightIn: template.spec.heightPx / template.spec.dpi,
    canvasWidthPx: template.stage.trim.width,
    canvasHeightPx: template.stage.trim.height,
  };
}

/** On-canvas footprint of a node (width × scale), per kind. */
export function nodeCanvasSize(node: DesignNode): { w: number; h: number } {
  switch (node.kind) {
    case "image":
    case "rect":
      // Math.abs: flipped nodes carry negative scales — a footprint is
      // always a positive size.
      return { w: node.width * Math.abs(node.scaleX), h: node.height * Math.abs(node.scaleY) };
    case "circle":
      return { w: node.radius * 2 * Math.abs(node.scaleX), h: node.radius * 2 * Math.abs(node.scaleY) };
    case "text":
      return { w: node.width * Math.abs(node.scaleX), h: node.fontSize * 1.3 * Math.abs(node.scaleY) };
    case "line":
    case "arrow": {
      // Stroke footprint = the points' extent, scaled.
      if (!node.points.length) return { w: 0, h: 0 };
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i + 1 < node.points.length; i += 2) {
        minX = Math.min(minX, node.points[i]);
        maxX = Math.max(maxX, node.points[i]);
        minY = Math.min(minY, node.points[i + 1]);
        maxY = Math.max(maxY, node.points[i + 1]);
      }
      return {
        w: Math.max(0, (maxX - minX) * Math.abs(node.scaleX)),
        h: Math.max(0, (maxY - minY) * Math.abs(node.scaleY)),
      };
    }
    case "group": {
      // Union of the children's footprints (children are local coords),
      // scaled by the group's own transform.
      let w = 0;
      let h = 0;
      for (const child of node.children) {
        const cs = nodeCanvasSize(child);
        w = Math.max(w, child.x + cs.w);
        h = Math.max(h, child.y + cs.h);
      }
      return { w: w * Math.abs(node.scaleX), h: h * Math.abs(node.scaleY) };
    }
  }
}

export interface DesignAudit {
  /** Worst (lowest) image DPI across the audited nodes; null when no raster art. */
  worstDpi: number | null;
  failing: { nodeId: string; name: string; dpi: number }[];
  perNode: Map<string, NodeDpi>;
  isPrintReady: boolean;
}

/**
 * Audit every image node on a design (all sides). Vector/text nodes are
 * exempt by construction. An image whose natural size is not yet known
 * is treated as failing-closed with dpi 0 until its dimensions land.
 */
export function auditDesign(
  sides: Record<string, DesignNode[]>,
  template: ResolvedTemplate | null,
): DesignAudit {
  const perNode = new Map<string, NodeDpi>();
  const failing: DesignAudit["failing"] = [];
  if (!template) return { worstDpi: null, failing, perNode, isPrintReady: true };
  const zone = zoneFromTemplate(template);
  let worst: number | null = null;
  // Recurse into groups: an image inside a group prints at the
  // group's accumulated scale, so its effective footprint grows.
  const walk = (nodes: DesignNode[], scaleMul: number): { node: Extract<DesignNode, { kind: "image" }>; effW: number; effH: number }[] => {
    const out: ReturnType<typeof walk> = [];
    for (const node of nodes) {
      if (node.kind === "image") {
        const { w, h } = nodeCanvasSize(node);
        out.push({ node, effW: w * scaleMul, effH: h * scaleMul });
      } else if (node.kind === "group") {
        out.push(...walk(node.children, scaleMul * node.scaleX));
      }
    }
    return out;
  };
  for (const nodes of Object.values(sides)) {
    for (const { node, effW: w, effH: h } of walk(nodes, 1)) {
      const audit = calculateNodeDPI(
        node.naturalWidth ?? 0,
        node.naturalHeight ?? 0,
        Math.max(w, 1),
        Math.max(h, 1),
        zone,
      );
      perNode.set(node.id, audit);
      if (worst === null || audit.dpi < worst) worst = audit.dpi;
      if (!audit.isPrintReady) failing.push({ nodeId: node.id, name: node.name, dpi: audit.dpi });
    }
  }
  return { worstDpi: worst, failing, perNode, isPrintReady: failing.length === 0 };
}
