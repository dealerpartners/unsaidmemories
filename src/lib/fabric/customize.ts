/**
 * PDP customizer — the shared math between the shopper-facing panel on
 * the product page and the /api/customize save endpoint.
 *
 * A shopper customization is a TRANSFORM of a published design's Front
 * surface: one artwork scale multiplier + one position offset, applied
 * around the print-zone (trim) center — exactly what the studio's
 * Transformer would produce if a designer dragged the whole design.
 * The preview applies it live via a Konva group transform; on save the
 * server BAKES it into a cloned canvas_state (this module), so the
 * saved design is a real, studio-openable v2 design whose nodes carry
 * the shopper's placement in plain stage coordinates.
 *
 * Baking rules mirror the studio's own transform semantics:
 *   - anchors move by the group equation  p' = c + (p − c)·m + d
 *   - text bakes scale into fontSize + width (crisp-editing rule)
 *   - rect / circle / image / line scale via scaleX / scaleY
 *   - group nodes transform as a unit (children stay local)
 */

import type { DesignNode } from "@/lib/admin/design-node";
import type { StageRect } from "./templates";

export interface CustomizeTransform {
  /** Artwork scale multiplier, 1 = the design as published. */
  multiplier: number;
  /** Position offset in stage pixels from the published placement. */
  offsetX: number;
  offsetY: number;
}

export const MULTIPLIER_MIN = 0.25;
export const MULTIPLIER_MAX = 2.5;

export function clampTransform(t: CustomizeTransform): CustomizeTransform {
  return {
    multiplier: Math.max(MULTIPLIER_MIN, Math.min(MULTIPLIER_MAX, t.multiplier || 1)),
    offsetX: Math.max(-210, Math.min(210, t.offsetX || 0)),
    offsetY: Math.max(-250, Math.min(250, t.offsetY || 0)),
  };
}

/** Bake a customizer transform into a cloned Front-surface node list. */
export function transformFrontNodes(
  nodes: DesignNode[],
  trim: StageRect,
  raw: CustomizeTransform,
): DesignNode[] {
  const { multiplier: m, offsetX: dx, offsetY: dy } = clampTransform(raw);
  if (m === 1 && dx === 0 && dy === 0) {
    return nodes.map((n) => ({ ...n }));
  }
  const cx = trim.x + trim.width / 2;
  const cy = trim.y + trim.height / 2;
  const move = (n: DesignNode): DesignNode => {
    const x = Math.round((cx + (n.x - cx) * m + dx) * 100) / 100;
    const y = Math.round((cy + (n.y - cy) * m + dy) * 100) / 100;
    if (n.kind === "text") {
      return {
        ...n,
        x,
        y,
        fontSize: Math.max(6, Math.round(n.fontSize * m * 100) / 100),
        width: Math.round(n.width * m * 100) / 100,
      };
    }
    return {
      ...n,
      x,
      y,
      scaleX: Math.round(n.scaleX * m * 10000) / 10000,
      scaleY: Math.round(n.scaleY * m * 10000) / 10000,
    };
  };
  return nodes.map(move);
}
