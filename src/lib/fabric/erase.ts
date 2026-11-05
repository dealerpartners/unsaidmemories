/**
 * Eraser for freehand strokes.
 *
 * The design model has no raster drawing layer — a freehand drawing IS
 * a list of point-based stroke nodes (kind "line", and "arrow" once
 * that kind exists). So the eraser works honestly in the same model:
 * it removes the stroke POINTS the eraser passes over and re-splits
 * each affected stroke into the surviving runs. The result is still
 * plain stroke nodes, so it saves, reloads, groups, exports to PNG /
 * SVG / PDF and prints exactly like the original drawing — there is
 * no hidden "erased pixels" state to lose.
 *
 * Deliberate limits (stated, not silent):
 *  - Only point-stroke nodes are erasable. Shapes, text and images
 *    are objects, not strokes — delete those as layers.
 *  - Locked strokes and strokes inside groups are left alone: a group
 *    is edited as one object (ungroup to erase inside it).
 *  - Hit-testing uses the node's translation + scale; a stroke that
 *    was ROTATED after drawing erases in its unrotated frame.
 */

import { nextId, type DesignNode, type LineNode } from "../admin/design-node";

export interface ErasePoint {
  x: number;
  y: number;
}

const STROKE_KINDS = new Set(["line", "arrow"]);

function pointSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function eraseFromLines(
  nodes: DesignNode[],
  path: ErasePoint[],
  radius: number,
): { nodes: DesignNode[]; removedPoints: number } {
  if (path.length === 0) return { nodes, removedPoints: 0 };
  let removedPoints = 0;
  const out: DesignNode[] = [];

  for (const node of nodes) {
    if (!STROKE_KINDS.has(node.kind) || node.locked) {
      out.push(node);
      continue;
    }
    const line = node as LineNode;
    if (!line.points || line.points.length < 2) {
      out.push(node);
      continue;
    }
    // The eraser must cover the visible stroke, not just its spine:
    // effective radius = eraser radius + half the stroke's width.
    const scale = Math.max(Math.abs(line.scaleX), Math.abs(line.scaleY));
    const r = radius + (line.strokeWidth * scale) / 2;

    const pointCount = Math.floor(line.points.length / 2);
    const hits: boolean[] = new Array(pointCount).fill(false);
    for (let i = 0; i < pointCount; i++) {
      const sx = line.x + line.points[i * 2] * line.scaleX;
      const sy = line.y + line.points[i * 2 + 1] * line.scaleY;
      let hit = false;
      if (path.length === 1) {
        hit = Math.hypot(sx - path[0].x, sy - path[0].y) <= r;
      } else {
        for (let j = 0; j + 1 < path.length; j++) {
          if (
            pointSegmentDistance(sx, sy, path[j].x, path[j].y, path[j + 1].x, path[j + 1].y) <= r
          ) {
            hit = true;
            break;
          }
        }
      }
      hits[i] = hit;
      if (hit) removedPoints++;
    }

    if (!hits.some(Boolean)) {
      out.push(node);
      continue;
    }
    // Rebuild the surviving runs of >= 2 points as stroke nodes.
    const runs: number[][] = [];
    let run: number[] = [];
    for (let i = 0; i < pointCount; i++) {
      if (!hits[i]) {
        run.push(line.points[i * 2], line.points[i * 2 + 1]);
      } else {
        if (run.length >= 4) runs.push(run);
        run = [];
      }
    }
    if (run.length >= 4) runs.push(run);
    runs.forEach((runPoints, idx) => {
      out.push({
        ...line,
        id: idx === 0 ? line.id : nextId(line.kind),
        name: idx === 0 ? line.name : `${line.name} (part ${idx + 1})`,
        points: runPoints,
      });
    });
    // Zero runs = the stroke was fully erased: it simply disappears.
  }

  return { nodes: out, removedPoints };
}
