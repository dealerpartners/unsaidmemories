"use client";

/**
 * Fabric Design Studio — react-konva canvas editor
 *
 * The Konva Stage below has THREE distinct Layers, per the studio spec:
 *   1. Background layer (bgLayer)  — product silhouette. Excluded on export.
 *   2. Guide layer (guideLayer)    — print-area dashed rect + label.
 *                                     Non-interactive, excluded on export.
 *   3. Design layer (designLayer)  — user content (Text / Rect / Circle /
 *                                     Image). The ONLY layer exported.
 *
 * CP2 (real product stage): when the bound product has a captured
 * stage (productStage prop), a GHOST layer joins between the design
 * and snap layers and the three content layers composite the
 * supplier's own mockup template frame — bg = garment base, design =
 * artwork clipped to the captured print area, ghost = template
 * shading. See the stage-geometry section below (computeStageLayout).
 * Stage-fix adds two SCREEN-ONLY shading/sheen layers between the
 * design and ghost layers (amplified garment luminance over the
 * artwork, print-area clipped, excluded from every export) and
 * colorway-aware template resolution + tint (stageVariantIds prop).
 * With no captured stage, every layer renders exactly as above.
 *
 * The Transformer lives on the design layer and attaches to whichever node
 * is currently selected by id. Empty-stage clicks deselect.
 *
 * Export (`exportPNG`) hides the bg and guide layers, detaches the
 * Transformer, calls `stage.toDataURL({ pixelRatio: 3 })`, then restores
 * visibility. Only the design-layer content is captured.
 *
 * All silhouette coordinates are copied verbatim from `drawProduct()` in
 * `/public/fabric-admin.html` — see `src/lib/admin/product-templates.ts`.
 */

/* The inline text editor overlay measures the Konva stage's container via
 * getBoundingClientRect inside a useEffect and stores the result in React
 * state. This is a legitimate "sync React state with measured DOM" effect
 * (the lint rule's stated exception), so we disable the heuristic rule for
 * the whole file rather than littering disable comments. */
/* eslint-disable react-hooks/set-state-in-effect */

import { canvasImageSrc } from "@/lib/image-proxy";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Konva from "konva";
import {
  Stage,
  Layer,
  Rect,
  Text,
  Line,
  Arrow,
  Arc,
  Circle,
  Image as KonvaImage,
  Transformer,
  Group,
  Path,
} from "react-konva";
import useImage from "use-image";
import {
  type CircleNode,
  type DesignNode,
  type GroupNode,
  type ImageMask,
  type ImageNode,
  type ArrowNode,
  type LineNode,
  type RectNode,
  type TextNode,
} from "@/lib/admin/design-node";
import {
  CUP_BODY,
  CUP_HANDLE,
  CUP_RIM,
  HOOD_POINTS,
  HOOD_POCKET_L,
  HOOD_POCKET_R,
  MUG_BODY,
  MUG_HANDLE,
  POSTER_BODY,
  PRINT_AREA_LABEL,
  type ProductType,
  SHIRT_BODY_POINTS,
  SHIRT_COLLAR_LINE_POINTS,
  SHIRT_COLLAR_POINTS,
  SHIRT_HEM_POINTS,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  TOTE_BODY,
  TOTE_HANDLE,
  TUMBLER_BODY_POINTS,
  TUMBLER_LID,
  getProductTemplate,
} from "@/lib/admin/product-templates";
import type { ResolvedTemplate } from "@/lib/fabric/templates";
import type {
  ProductStage,
  StageMockupTemplate,
  StagePrintSpec,
} from "@/lib/fabric/product-stage";
import { nodeBounds } from "@/lib/fabric/preflight";

export interface CanvasEditorHandle {
  /** Reset the view-only pan/zoom transform (wheel/space-drag) to 1:1. */
  resetView: () => void;
  /**
   * Capture a rectangular region of the canvas (design coordinates) —
   * used by the sketch boards, book pages and the PDF annotator,
   * whose "product" is a plain sheet of paper rather than a garment.
   * With includeBackground, the background layer (the white sheet)
   * is composited under the design layer.
   */
  exportRegionPng: (
    rect: { x: number; y: number; width: number; height: number },
    pixelRatio?: number,
    opts?: { includeBackground?: boolean },
  ) => Promise<string | null>;
  /** Hide bg + guide layers, capture the design layer at 3x, restore. */
  exportPNG: (pixelRatio?: number) => string | null;
  /** Capture silhouette + design (guides hidden) as a product mockup. */
  exportMockup: (pixelRatio?: number, mimeType?: string) => string | null;
  /**
   * Rule B production file: export ONLY the design layer, cropped to
   * the print-zone (trim) rect, at the exact supplier pixel grid
   * (spec.widthPx x spec.heightPx — physical inches x DPI), computed
   * from the zone footprint so window size / zoom never change the
   * output dimensions. Null when no supplier template is resolved.
   */
  exportPrintFile: () => string | null;
  /** Current stage zoom scale (used by the parent for the % display). */
  getZoom: () => number;
  /**
   * Convert a browser client point (e.g. a drag-and-drop event) into
   * design coordinates on the current side. Null when the point falls
   * outside the stage.
   */
  clientToDesign: (clientX: number, clientY: number) => { x: number; y: number } | null;
}

export interface CanvasEditorProps {
  productType: ProductType;
  garmentColor: string;
  nodes: DesignNode[];
  selectedId: string | null;
  zoom: number;
  side: "Front" | "Back";
  /**
   * Resolved supplier template (from /api/admin/studio/catalog/[id]).
   * When present, the guide layer draws the REAL zones — bleed, trim,
   * safe — and the bg layer shows the supplier's own product photo.
   */
  templateMeta?: ResolvedTemplate | null;
  /**
   * Captured REAL product stage (CP1: /api/admin/studio/product-stage)
   * — the supplier's own mockup template frame + print-area geometry
   * and the captured print specs for the bound catalog product. When
   * present (and it resolves for the active side), the stage renders
   * as a three-layer composite inside the template frame: garment
   * base, artwork clipped to the captured print area, ghost shading
   * template on top. Null/absent = today's stage, untouched.
   */
  productStage?: ProductStage | null;
  /**
   * Stage-fix: the SELECTED garment colorway's catalog variant ids
   * (supplier_catalog_variants.external_id as numbers). The stage
   * resolver prefers the captured template row covering these ids;
   * when no row covers them, the captured garment photo is tinted
   * with `garmentColor` so the canvas follows the selection instead
   * of showing another colorway's photo. Absent = not colorway-aware
   * (pre-fix behaviour, no tint).
   */
  stageVariantIds?: number[] | null;
  /** Stage mouse down on empty area OR a node → set selection (null = clear). */
  onSelect: (id: string | null) => void;
  /** Live update while dragging / transforming (no history snapshot). */
  onChange: (id: string, patch: Partial<DesignNode>) => void;
  /** Commit a history snapshot (called on dragend / transformend). */
  onCommit: () => void;
  /** Notify parent that a text node entered inline-edit mode. */
  onTextEditMode: (id: string | null) => void;
  /**
   * Active canvas tool. "draw" turns stage presses into freehand
   * strokes (Konva.Line) committed through onDrawComplete; "erase"
   * turns them into eraser passes committed through onEraseComplete.
   * Nodes are not draggable while a non-select tool is active.
   */
  tool?: "select" | "draw" | "erase" | "line" | "arrow";
  /** Stroke style for the draw tool. */
  drawStroke?: { stroke: string; strokeWidth: number };
  /** A finished freehand stroke, in design-layer coordinates. */
  onDrawComplete?: (node: LineNode | ArrowNode) => void;
  /** Eraser brush radius in design units (default 14). */
  eraseRadius?: number;
  /** A finished eraser pass: the swept path + radius, design coords. */
  onEraseComplete?: (path: { x: number; y: number }[], radius: number) => void;
  /**
   * Blank-page mode: instead of a product silhouette + print zones,
   * the canvas shows a plain sheet of paper at this rect (sketch
   * boards, book pages, PDF annotation). Snapping treats the sheet's
   * edges/centre as guides. Null/absent = the product canvas.
   */
  blankPage?: {
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
  } | null;
  /** Parent → child signal that text editing should exit (e.g. user pressed Escape elsewhere). */
  textEditId: string | null;
  /**
   * Pan mode (the bottom rail's Pan Canvas toggle): while on, a press
   * anywhere on the stage pans the view instead of touching layers —
   * nodes render non-draggable and the Transformer stays detached, so
   * the admin can inspect fine detail without moving the artwork.
   * Select tool only; the draw/erase tools keep the pointer.
   */
  panMode?: boolean;
  /**
   * Reports the LIVE total zoom (the getZoom() number: zoom prop ×
   * view multiplier) whenever it changes, so the bottom rail's %
   * readout stays honest through mouse-wheel zooms too.
   */
  onZoomChange?: (totalZoom: number) => void;
}

/* ------------------------------------------------------------------ */
/* Product silhouette — faithful copy of drawProduct() in the HTML     */
/* prototype. Each silhouette is a pure function of (template, color). */
/* ------------------------------------------------------------------ */

interface SilhouetteProps {
  productType: ProductType;
  color: string;
}

function ProductSilhouette({ productType, color }: SilhouetteProps) {
  const template = getProductTemplate(productType);
  const scale = template.scale;
  const silhouette = template.silhouette;
  const stroke = "#dedee5";
  const stitch = "#e3e3e8";
  const shadow = {
    shadowColor: "#000000",
    shadowBlur: 13,
    shadowOpacity: 0.06,
    shadowOffsetY: 5,
  };

  // The whole silhouette group is wrapped in a Group with scale={template.scale}
  // so the Crewneck Sweatshirt's 1.03 multiplier applies uniformly. We pass
  // `scaleX`/`scaleY` on each line/rect instead of a <Group> wrapper to keep
  // the silhouette geometry independent of Konva.Group transforms (which would
  // also re-scale the print-area guide if it lived on this layer).

  if (silhouette === "mug") {
    return (
      <>
        <Rect
          x={MUG_BODY.x}
          y={MUG_BODY.y}
          width={MUG_BODY.width}
          height={MUG_BODY.height}
          fill={color}
          cornerRadius={MUG_BODY.cornerRadius}
          stroke="#e2e2e8"
          strokeWidth={2}
          {...shadow}
        />
        <Arc
          x={MUG_HANDLE.x}
          y={MUG_HANDLE.y}
          innerRadius={MUG_HANDLE.innerRadius}
          outerRadius={MUG_HANDLE.outerRadius}
          angle={MUG_HANDLE.angle}
          rotation={MUG_HANDLE.rotation}
          fill={color}
          stroke="#e2e2e8"
          strokeWidth={2}
        />
      </>
    );
  }

  if (silhouette === "tumbler") {
    return (
      <>
        <Rect
          x={TUMBLER_LID.x}
          y={TUMBLER_LID.y}
          width={TUMBLER_LID.width}
          height={TUMBLER_LID.height}
          fill={color}
          cornerRadius={TUMBLER_LID.cornerRadius}
          stroke="#e2e2e8"
          strokeWidth={2}
        />
        <Line
          points={TUMBLER_BODY_POINTS}
          closed
          fill={color}
          stroke="#e2e2e8"
          strokeWidth={2}
          lineJoin="round"
          {...shadow}
        />
      </>
    );
  }

  if (silhouette === "cup") {
    return (
      <>
        <Arc
          x={CUP_HANDLE.x}
          y={CUP_HANDLE.y}
          innerRadius={CUP_HANDLE.innerRadius}
          outerRadius={CUP_HANDLE.outerRadius}
          angle={CUP_HANDLE.angle}
          rotation={CUP_HANDLE.rotation}
          fill={color}
          stroke="#e2e2e8"
          strokeWidth={2}
        />
        <Rect
          x={CUP_BODY.x}
          y={CUP_BODY.y}
          width={CUP_BODY.width}
          height={CUP_BODY.height}
          fill={color}
          cornerRadius={CUP_BODY.cornerRadius}
          stroke="#e2e2e8"
          strokeWidth={2}
          {...shadow}
        />
        <Rect
          x={CUP_RIM.x}
          y={CUP_RIM.y}
          width={CUP_RIM.width}
          height={CUP_RIM.height}
          fill="#d9d9de"
          cornerRadius={CUP_RIM.cornerRadius}
        />
      </>
    );
  }

  if (silhouette === "tote") {
    return (
      <>
        <Arc
          x={TOTE_HANDLE.x}
          y={TOTE_HANDLE.y}
          innerRadius={TOTE_HANDLE.innerRadius}
          outerRadius={TOTE_HANDLE.outerRadius}
          angle={TOTE_HANDLE.angle}
          rotation={TOTE_HANDLE.rotation}
          stroke="#d8d8de"
          strokeWidth={13}
        />
        <Rect
          x={TOTE_BODY.x}
          y={TOTE_BODY.y}
          width={TOTE_BODY.width}
          height={TOTE_BODY.height}
          fill={color}
          stroke="#dedee4"
          strokeWidth={2}
          cornerRadius={TOTE_BODY.cornerRadius}
          {...shadow}
        />
      </>
    );
  }

  if (silhouette === "poster") {
    return (
      <Rect
        x={POSTER_BODY.x}
        y={POSTER_BODY.y}
        width={POSTER_BODY.width}
        height={POSTER_BODY.height}
        fill={color}
        stroke="#e2e2e8"
        strokeWidth={2}
        shadowColor="#000000"
        shadowBlur={15}
        shadowOpacity={0.1}
        shadowOffsetY={6}
      />
    );
  }

  // shirt or hoodie (silhouette === "shirt" || silhouette === "hoodie")
  const isHoodie = silhouette === "hoodie";
  return (
    <>
      {/* Main body outline */}
      <Line
        points={SHIRT_BODY_POINTS}
        closed
        fill={color}
        stroke={stroke}
        strokeWidth={2}
        lineJoin="round"
        scaleX={scale}
        scaleY={scale}
        {...shadow}
      />
      {/* Collar outer rim */}
      <Line
        points={SHIRT_COLLAR_POINTS}
        closed
        fill={color}
        stroke={stroke}
        strokeWidth={2}
        lineJoin="round"
        scaleX={scale}
        scaleY={scale}
      />
      {/* Collar inner stitch line */}
      <Line
        points={SHIRT_COLLAR_LINE_POINTS}
        stroke={stitch}
        strokeWidth={2}
        lineJoin="round"
        scaleX={scale}
        scaleY={scale}
      />
      {/* Hoodie-only extras */}
      {isHoodie && (
        <>
          <Line
            points={HOOD_POINTS}
            closed
            fill={color}
            stroke={stroke}
            strokeWidth={2}
            lineJoin="round"
            scaleX={scale}
            scaleY={scale}
          />
          <Line
            points={HOOD_POCKET_L}
            stroke="#d9d9e0"
            strokeWidth={2}
            scaleX={scale}
            scaleY={scale}
          />
          <Line
            points={HOOD_POCKET_R}
            stroke="#d9d9e0"
            strokeWidth={2}
            scaleX={scale}
            scaleY={scale}
          />
        </>
      )}
      {/* Bottom hem stitch */}
      <Line
        points={SHIRT_HEM_POINTS}
        stroke={stitch}
        strokeWidth={2}
        scaleX={scale}
        scaleY={scale}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Print-area guide — drawn on the (non-interactive) guide layer.      */
/* ------------------------------------------------------------------ */

function PrintAreaGuide({
  productType,
  templateMeta,
}: {
  productType: ProductType;
  templateMeta?: ResolvedTemplate | null;
}) {
  const template = getProductTemplate(productType);
  const area = template.printArea;

  // With a resolved supplier template, draw the three real zones:
  // bleed (outermost), trim (the print area), safe (innermost).
  if (templateMeta) {
    const { bleed, trim, safe } = templateMeta.stage;
    return (
      <>
        <Rect
          x={bleed.x}
          y={bleed.y}
          width={bleed.width}
          height={bleed.height}
          stroke="#e88a8a"
          strokeWidth={1}
          dash={[3, 4]}
          cornerRadius={3}
        />
        <Rect
          x={trim.x}
          y={trim.y}
          width={trim.width}
          height={trim.height}
          fill="rgba(114,88,232,0.035)"
          stroke="#bfb5ff"
          strokeWidth={1}
          dash={[5, 5]}
          cornerRadius={3}
        />
        <Rect
          x={safe.x}
          y={safe.y}
          width={safe.width}
          height={safe.height}
          stroke="#9fc7a8"
          strokeWidth={1}
          dash={[2, 4]}
          cornerRadius={3}
        />
        <Text
          x={trim.x}
          y={trim.y + trim.height + 6}
          width={trim.width}
          text={`PRINT AREA · ${templateMeta.spec.widthPx}×${templateMeta.spec.heightPx}px @${templateMeta.spec.dpi} DPI`}
          align="center"
          fontSize={8}
          fontFamily="DM Sans"
          fill="#b0a5ee"
          letterSpacing={1}
        />
      </>
    );
  }

  return (
    <>
      <Rect
        x={area.x}
        y={area.y}
        width={area.width}
        height={area.height}
        fill="rgba(114,88,232,0.035)"
        stroke="#bfb5ff"
        strokeWidth={1}
        dash={[5, 5]}
        cornerRadius={3}
      />
      <Text
        x={PRINT_AREA_LABEL.x}
        y={PRINT_AREA_LABEL.y}
        width={PRINT_AREA_LABEL.width}
        text={PRINT_AREA_LABEL.text}
        align="center"
        fontSize={PRINT_AREA_LABEL.fontSize}
        fontFamily="DM Sans"
        fill="#b0a5ee"
        letterSpacing={1}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* REAL product stage (CP2) — captured supplier template geometry.     */
/*                                                                     */
/* When the bound catalog product has a captured stage, the canvas     */
/* stops drawing an imagined silhouette and renders the supplier's     */
/* own mockup template frame instead, at a VIRTUAL SCALE (template     */
/* pixels → stage design units):                                       */
/*                                                                     */
/*   BASE    garment background (photo, else template background       */
/*           color, else the chosen garment color)                     */
/*   ARTWORK the design's layer stack, inside a Konva group clipped    */
/*           to the ACTIVE placement's captured print-area rect,       */
/*           mapped from design space by an affine group so node       */
/*           coordinates are NEVER rewritten                           */
/*   GHOST   the supplier's template ("ghost" shading) image over      */
/*           the artwork, so prints sit inside the fabric shading      */
/*                                                                     */
/* Design space stays what it has always been: nodes are authored      */
/* against the design zone (the resolved template's trim, or the       */
/* product template's print area). The affine map takes that zone      */
/* exactly onto the captured print-area rect, so switching placements  */
/* rescales artwork positions by the area-rect ratio and a design      */
/* keeps its relative placement on the new placement.                  */
/* ------------------------------------------------------------------ */

export type StageSide = "Front" | "Back";

/**
 * The placement a side resolves to on a captured stage, most specific
 * first: Front → "front", Back → "back", and either falls back to the
 * single-surface "default" (mugs and other one-area products). Null
 * when the stage carries neither a template nor a spec for the side.
 */
export function stagePlacementForSide(
  stage: ProductStage,
  side: StageSide,
): string | null {
  const wanted =
    side === "Front" ? ["front", "default"] : ["back", "default"];
  for (const p of wanted) {
    if (stage.templates.some((t) => t.placement === p)) return p;
  }
  for (const p of wanted) {
    if (stage.specs.some((s) => s.placement === p)) return p;
  }
  return null;
}

/**
 * Deterministic template pick for one placement. Several captured
 * rows can share a placement — a sleeve's upper and lower print
 * zones, or the same image serving several variant groups. The row
 * covering the MOST catalog variants wins (it is the supplier's
 * primary zone for that placement); ties break toward the LARGER
 * print area, then the smaller template frame, then printfile id /
 * image URL — so the winner never depends on capture row order.
 */
export function pickStageTemplate(
  stage: ProductStage,
  placement: string,
  variantIds?: readonly number[] | null,
): StageMockupTemplate | null {
  let rows = stage.templates.filter((t) => t.placement === placement);
  if (!rows.length) return null;
  /* Colorway binding (stage-fix): captured template rows are
   * per-variant-set — a row's catalog_variant_ids are the variants
   * its garment photo/ghost were captured for. When the caller knows
   * the SELECTED colorway's variant ids, a row covering that
   * colorway wins over the generic deterministic pick below; only
   * when NO row covers the selection does the generic pick stand
   * (the caller then tints it — see `stageTemplateMatchesVariants`).
   * With no variant ids the pick is exactly the pre-fix behaviour. */
  if (variantIds && variantIds.length) {
    const wanted = new Set(variantIds);
    const matched = rows.filter((t) =>
      t.catalogVariantIds.some((id) => wanted.has(id)),
    );
    if (matched.length) rows = matched;
  }
  const area = (t: StageMockupTemplate) =>
    t.printAreaWidth * t.printAreaHeight;
  return [...rows].sort(
    (a, b) =>
      b.catalogVariantIds.length - a.catalogVariantIds.length ||
      area(b) - area(a) ||
      a.templateWidth * a.templateHeight -
        b.templateWidth * b.templateHeight ||
      (a.printfileId ?? 0) - (b.printfileId ?? 0) ||
      String(a.imageUrl ?? "").localeCompare(String(b.imageUrl ?? "")),
  )[0];
}

/**
 * True when `template` was captured for one of `variantIds` (the
 * selected colorway's catalog variant ids). No ids supplied (null /
 * undefined) means the caller is not colorway-aware, so the template
 * stands as-is and no tint fallback applies — the pre-fix behaviour.
 * An empty list is a colorway with no resolvable variant ids: it
 * matches nothing, so the tint fallback applies.
 */
export function stageTemplateMatchesVariants(
  template: StageMockupTemplate,
  variantIds?: readonly number[] | null,
): boolean {
  if (variantIds == null) return true;
  const wanted = new Set(variantIds);
  return template.catalogVariantIds.some((id) => wanted.has(id));
}

/**
 * The first color (in the caller's variant order) whose variants are
 * covered by a captured template row — i.e. the colorway the bound
 * stage's garment photo actually shows. The parent uses this to make
 * the DEFAULT garment-color selection agree with the photo on
 * canvas, instead of defaulting to whichever variant happens to sort
 * first (cheapest — "Black" over the Athletic Heather photo).
 * Null when no variant is covered by any captured row.
 */
export function firstCapturedStageColorName(
  stage: ProductStage,
  variants: readonly { color: string | null; external_id: string }[],
): string | null {
  const captured = new Set<number>();
  for (const t of stage.templates) {
    for (const id of t.catalogVariantIds) captured.add(id);
  }
  if (!captured.size) return null;
  const seen = new Set<string>();
  for (const v of variants) {
    if (!v.color || seen.has(v.color)) continue;
    seen.add(v.color);
    const hit = variants.some(
      (o) =>
        o.color === v.color && captured.has(Number(o.external_id)),
    );
    if (hit) return v.color;
  }
  return null;
}

/** The captured print spec for one placement, when one was captured.
 *  A placement can carry several size-tagged specs (migration
 *  20261030213100): prefer the first whose sizeTag is a REAL size —
 *  not 'placeholder', not 'unsized', not null — so a mug's real
 *  per-size spec wins over its Placeholder fallback regardless of
 *  row order; fall back to the first placement match when none
 *  qualify (e.g. only placeholder/unsized rows were captured). */
export function stageSpecForPlacement(
  stage: ProductStage,
  placement: string,
): StagePrintSpec | null {
  const matches = stage.specs.filter((s) => s.placement === placement);
  const realSize = matches.find(
    (s) => s.sizeTag !== null && s.sizeTag !== "placeholder" && s.sizeTag !== "unsized",
  );
  return realSize ?? matches[0] ?? null;
}

/** Placement + captured spec for a side — the auditor/export lookup. */
export function stageSpecForSide(
  stage: ProductStage,
  side: StageSide,
): { placement: string; spec: StagePrintSpec } | null {
  const placement = stagePlacementForSide(stage, side);
  if (!placement) return null;
  const spec = stageSpecForPlacement(stage, placement);
  return spec ? { placement, spec } : null;
}

export interface StageLayout {
  placement: string;
  template: StageMockupTemplate;
  /** Captured print spec for the placement (supplier_print_specs). */
  spec: StagePrintSpec | null;
  /** Template frame fitted into the stage, in design units. */
  frame: { x: number; y: number; scale: number; width: number; height: number };
  /** The captured print-area rect mapped into stage design units. */
  areaStageRect: { x: number; y: number; width: number; height: number };
  /**
   * Affine map from design space onto the template frame: a Konva
   * group with these props takes design-zone coordinates exactly
   * onto the captured print-area rect (template pixels).
   */
  designMap: { x: number; y: number; scaleX: number; scaleY: number };
}

/**
 * Resolve the full stage layout for a side, or null when the stage
 * has no usable template for it (the editor then keeps today's
 * stage). `designZone` is the design-space rect artwork is authored
 * against — the same zone the auditor measures through.
 */
export function computeStageLayout(
  stage: ProductStage,
  side: StageSide,
  designZone: { x: number; y: number; width: number; height: number },
  variantIds?: readonly number[] | null,
): StageLayout | null {
  const placement = stagePlacementForSide(stage, side);
  if (!placement) return null;
  const template = pickStageTemplate(stage, placement, variantIds);
  if (!template || template.templateWidth <= 0 || template.templateHeight <= 0) {
    return null;
  }
  if (designZone.width <= 0 || designZone.height <= 0) return null;
  const scale = Math.min(
    STAGE_WIDTH / template.templateWidth,
    STAGE_HEIGHT / template.templateHeight,
  );
  const width = template.templateWidth * scale;
  const height = template.templateHeight * scale;
  const frame = {
    x: (STAGE_WIDTH - width) / 2,
    y: (STAGE_HEIGHT - height) / 2,
    scale,
    width,
    height,
  };
  const areaStageRect = {
    x: frame.x + template.printAreaLeft * scale,
    y: frame.y + template.printAreaTop * scale,
    width: template.printAreaWidth * scale,
    height: template.printAreaHeight * scale,
  };
  const sx = template.printAreaWidth / designZone.width;
  const sy = template.printAreaHeight / designZone.height;
  const designMap = {
    x: template.printAreaLeft - designZone.x * sx,
    y: template.printAreaTop - designZone.y * sy,
    scaleX: sx,
    scaleY: sy,
  };
  return {
    placement,
    template,
    spec: stageSpecForPlacement(stage, placement),
    frame,
    areaStageRect,
    designMap,
  };
}

/** A rendered box in stage design units (the snap handler's shape). */
export interface StageBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Sub-design-unit tolerance so artwork sitting exactly flush with
 * the print-area edge doesn't flicker the spill warning (CP2.1). */
const SPILL_EPS = 0.5;

/**
 * True when any part of `box` lies outside the captured print-area
 * rect — both in stage design units, so this tests exactly the rect
 * the artwork clip cuts against.
 */
export function boxSpillsArea(
  box: StageBox,
  area: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    box.x < area.x - SPILL_EPS ||
    box.y < area.y - SPILL_EPS ||
    box.x + box.w > area.x + area.width + SPILL_EPS ||
    box.y + box.h > area.y + area.height + SPILL_EPS
  );
}

/**
 * A design node's box in stage design units — the one shared
 * computation behind BOTH the Publish wizard's Step 2 fit check and
 * the live canvas spill test (`stageBoxOfNode` below routes the
 * rendered node's model + live transform through this same function).
 * A saved design has no Konva nodes to measure, so the
 * node's design-space bounds (nodeBounds, lib/fabric/preflight —
 * the one shared bounds implementation) are mapped through the
 * SAME affine the canvas renders through: StageArtworkGroups nests
 * the frame group (x/y + uniform `frame.scale`) around the
 * design-map group (x/y + `designMap.scaleX/scaleY`), so a
 * design-space point p lands at
 *   frame.pos + frame.scale × (designMap.pos + designMap.scale × p)
 * in stage units. Consumers test the result with boxSpillsArea
 * against `layout.areaStageRect` — exactly the rect and tolerance
 * the live canvas spill warning uses, so a fit verdict computed
 * from saved JSON (e.g. the Publish wizard's Step 2) is the canvas's
 * own verdict, not a parallel one in different units.
 */
export function designNodeStageBox(
  node: DesignNode,
  layout: StageLayout,
): StageBox {
  const b = nodeBounds(node);
  const { frame, designMap } = layout;
  const px = (v: number) =>
    frame.x + frame.scale * (designMap.x + designMap.scaleX * v);
  const py = (v: number) =>
    frame.y + frame.scale * (designMap.y + designMap.scaleY * v);
  const x0 = px(b.x);
  const x1 = px(b.x + b.w);
  const y0 = py(b.y);
  const y1 = py(b.y + b.h);
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

/**
 * The artwork wrap for the composite: frame group (virtual scale) →
 * clip group (the captured print-area rect, via clipFunc, in template
 * pixels) → design-map group (design space → template pixels).
 * Children render in plain design space; nothing about them changes.
 * With no layout it is a passthrough fragment, so callers wrap
 * unconditionally and the no-stage render is byte-identical.
 */
function StageArtworkGroups({
  layout,
  children,
}: {
  layout: StageLayout | null;
  children: React.ReactNode;
}) {
  if (!layout) return <>{children}</>;
  const t = layout.template;
  return (
    <Group
      x={layout.frame.x}
      y={layout.frame.y}
      scaleX={layout.frame.scale}
      scaleY={layout.frame.scale}
    >
      <Group
        clipFunc={(ctx) => {
          ctx.beginPath();
          ctx.rect(
            t.printAreaLeft,
            t.printAreaTop,
            t.printAreaWidth,
            t.printAreaHeight,
          );
          ctx.closePath();
        }}
      >
        <Group
          x={layout.designMap.x}
          y={layout.designMap.y}
          scaleX={layout.designMap.scaleX}
          scaleY={layout.designMap.scaleY}
        >
          {children}
        </Group>
      </Group>
    </Group>
  );
}

/* ------------------------------------------------------------------ */
/* Shading overlay (stage-fix) — screen-only mockup realism.           */
/*                                                                     */
/* Why the CP2.1 ghost alone produced NO visible effect on design      */
/* layers (measured on the captured Bella + Canvas 3001 front ghost,   */
/* 2026-10-30): inside the print area the ghost PNG's alpha averages   */
/* ~19/255 (≈7%) at a mean luminance of ~116 — it is a FAINT shading   */
/* sheet, not an opaque one. Multiplied at ≈7% strength it moves a     */
/* mid-tone pixel by only a few percent, and multiply can never        */
/* change near-black ink at all (black × anything = black), which is   */
/* exactly the walk case: large near-black text rendered flat.         */
/*                                                                     */
/* This overlay therefore AMPLIFIES the garment's own shading and      */
/* renders it above the design layers, clipped to the print area:      */
/*                                                                     */
/*   MULTIPLY pass — the garment photo's luminance, contrast-          */
/*     amplified (shadow depth ×3), as an opaque grayscale sheet in    */
/*     its own layer whose canvas carries CSS mix-blend-mode:          */
/*     multiply (the same DOM-blend mechanism CP2.1 uses for the       */
/*     ghost layer), at partial opacity. Folds and shadow streaks      */
/*     darken whatever design sits under them.                         */
/*   SHEEN pass — the garment photo itself at low opacity, source-     */
/*     over, in a plain layer. Multiply-family blends preserve pure    */
/*     black, so this pass is what lets even near-black ink pick up    */
/*     the fold luminance/grain inside the letters.                    */
/*                                                                     */
/* Both passes are SCREEN-ONLY: they live in their own layers, and     */
/* every export path either captures a different layer (print file,    */
/* region PNG, SVG) or hides these layers first (stage PNG, mockup)    */
/* — export behaviour is byte-identical to before this overlay.        */
/* ------------------------------------------------------------------ */

/** Contrast amplification for the multiply shading sheet. */
const SHADING_CONTRAST = 3;
/** Partial opacity of the multiply shading pass. */
const SHADING_MULTIPLY_OPACITY = 0.55;
/** Low opacity of the source-over sheen pass (fold grain in dark ink). */
const SHADING_SHEEN_OPACITY = 0.14;

/**
 * Build the opaque multiply shading sheet from a garment image:
 * each pixel becomes the gray `255 − (255 − luminance) × CONTRAST`
 * (white = no change under multiply; fold shadows become real
 * grays). Returns null when the image is not readable (e.g. a
 * CORS-tainted canvas) — the overlay then simply does not render.
 */
function buildMultiplyShadingCanvas(
  img: HTMLImageElement,
): HTMLCanvasElement | null {
  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return null;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      const shade = Math.max(
        0,
        Math.min(255, 255 - (255 - lum) * SHADING_CONTRAST),
      );
      px[i] = shade;
      px[i + 1] = shade;
      px[i + 2] = shade;
      px[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    return canvas;
  } catch {
    return null;
  }
}

/**
 * Load the shading source for a template frame — the garment
 * background photo when one was captured (opaque, carries the real
 * fold luminance), else the template/ghost image itself — and derive
 * its multiply shading sheet. Nulls while loading / on any failure:
 * the overlay is an aid, never a blocker.
 */
function useStageShading(sourceUrl: string | null): {
  photo: HTMLImageElement | null;
  shading: HTMLCanvasElement | null;
} {
  const [state, setState] = useState<{
    photo: HTMLImageElement | null;
    shading: HTMLCanvasElement | null;
  }>({ photo: null, shading: null });
  useEffect(() => {
    if (!sourceUrl) {
      setState({ photo: null, shading: null });
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      setState({ photo: img, shading: buildMultiplyShadingCanvas(img) });
    };
    img.onerror = () => {
      if (!cancelled) setState({ photo: null, shading: null });
    };
    img.src = canvasImageSrc(sourceUrl);
    return () => {
      cancelled = true;
    };
  }, [sourceUrl]);
  return state;
}

/** A template-frame image (garment background photo or ghost shading). */
function StageFrameImage({
  url,
  width,
  height,
  blend,
}: {
  url: string;
  width: number;
  height: number;
  /**
   * Composite op for this frame image. ONLY the ghost shading sheet
   * passes "multiply" (CP2.1): the supplier's template image is a
   * grayscale shading layer, and multiply is what burns its wrinkles
   * and shadows into the artwork beneath it instead of washing over
   * it source-over. The base background photo never passes this and
   * stays source-over.
   */
  blend?: "multiply";
}) {
  const [img] = useImage(canvasImageSrc(url), "anonymous");
  if (!img) return null;
  return (
    <KonvaImage
      image={img}
      x={0}
      y={0}
      width={width}
      height={height}
      globalCompositeOperation={blend ?? "source-over"}
    />
  );
}

/* Guide-layer print-area outline for the captured stage: the area as
 * it sits on the garment frame, labelled with the captured spec.
 * While any artwork spills outside the area (CP2.1) the outline
 * turns warning red — the clip is cutting whatever crosses it. */
function StageAreaGuide({
  layout,
  warning,
}: {
  layout: StageLayout;
  warning?: boolean;
}) {
  const area = layout.areaStageRect;
  const { spec, template } = layout;
  return (
    <>
      <Rect
        x={area.x}
        y={area.y}
        width={area.width}
        height={area.height}
        fill={warning ? "rgba(239,68,68,0.06)" : "rgba(114,88,232,0.035)"}
        stroke={warning ? "#ef4444" : "#bfb5ff"}
        strokeWidth={warning ? 2 : 1}
        dash={[5, 5]}
        cornerRadius={3}
      />
      <Text
        x={area.x}
        y={area.y + area.height + 6}
        width={area.width}
        text={
          spec
            ? `PRINT AREA · ${spec.printWidthPx}×${spec.printHeightPx}px @${spec.targetDpi} DPI`
            : `PRINT AREA · ${template.printAreaWidth}×${template.printAreaHeight}`
        }
        align="center"
        fontSize={8}
        fontFamily="DM Sans"
        fill="#b0a5ee"
        letterSpacing={1}
      />
    </>
  );
}

/* Supplier product photo as the mockup layer (contain-fit in stage). */
function MockupPhoto({ url }: { url: string }) {
  const [img] = useImage(canvasImageSrc(url), "anonymous");
  if (!img) return null;
  const maxW = STAGE_WIDTH - 24;
  const maxH = STAGE_HEIGHT - 24;
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;
  return (
    <KonvaImage
      image={img}
      x={(STAGE_WIDTH - w) / 2}
      y={(STAGE_HEIGHT - h) / 2}
      width={w}
      height={h}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Design-layer node renderer — one component per kind.                 */
/* ------------------------------------------------------------------ */

interface NodeRendererProps {
  node: DesignNode;
  isSelected: boolean;
  isEditing: boolean;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<DesignNode>) => void;
  onCommit: () => void;
  onStartEdit: (id: string) => void;
  registerRef: (id: string, node: Konva.Node | null) => void;
  /** Draw tool active — nothing drags. */
  drawing?: boolean;
  /** Inside a group — rendered but not individually interactive. */
  nested?: boolean;
}

function useCommonNodeProps(node: DesignNode, opts?: { drawing?: boolean; nested?: boolean }) {
  return {
    x: node.x,
    y: node.y,
    rotation: node.rotation,
    opacity: node.opacity,
    scaleX: node.scaleX,
    scaleY: node.scaleY,
    // Locked layers render + export but never drag or transform.
    draggable: !node.locked && !opts?.drawing && !opts?.nested,
    listening: !opts?.nested,
    name: node.name,
    id: node.id,
  };
}

type DragEndEvt = Konva.KonvaEventObject<DragEvent>;
type TransformEndEvt = Konva.KonvaEventObject<Event>;
type MouseEvt = Konva.KonvaEventObject<MouseEvent>;
type TouchEvt = Konva.KonvaEventObject<TouchEvent>;

function TextNodeView({
  node,
  isEditing,
  onSelect,
  onChange,
  onCommit,
  onStartEdit,
  registerRef,
  drawing,
  nested,
}: NodeRendererProps & { node: TextNode }) {
  const ref = useRef<Konva.Text>(null);
  const groupRef = useRef<Konva.Group>(null);
  useEffect(() => {
    registerRef(node.id, node.curve ? groupRef.current : ref.current);
    return () => registerRef(node.id, null);
  }, [node.id, registerRef, node.curve]);

  // Curved lettering: per-letter Text nodes placed on an arc inside a
  // Group (Konva has no native text-on-path). The group carries the
  // node's transform; letters are resolution-independent vectors.
  if (node.curve) {
    const { radius, spacingDeg } = node.curve;
    const chars = (isEditing ? "" : node.text).split("");
    const startAngle = -((chars.length - 1) * spacingDeg) / 2;
    return (
      <Group
        ref={groupRef}
        {...useCommonNodeProps(node, { drawing, nested })}
        onClick={(e: MouseEvt) => { e.cancelBubble = true; onSelect(node.id); }}
        onTap={(e: TouchEvt) => { e.cancelBubble = true; onSelect(node.id); }}
        onDblClick={() => onStartEdit(node.id)}
        onDblTap={() => onStartEdit(node.id)}
        onDragEnd={(e: DragEndEvt) => {
          onChange(node.id, { x: e.target.x(), y: e.target.y() });
          onCommit();
        }}
        onTransformEnd={(e: TransformEndEvt) => {
          const t = e.target as unknown as Konva.Group;
          onChange(node.id, {
            x: t.x(), y: t.y(),
            scaleX: t.scaleX(), scaleY: t.scaleY(),
            rotation: t.rotation(),
          });
          onCommit();
        }}
      >
        {chars.map((ch, i) => {
          const angle = startAngle + i * spacingDeg;
          const rad = (angle * Math.PI) / 180;
          return (
            <Text
              key={i}
              x={radius * Math.sin(rad)}
              y={-radius * Math.cos(rad)}
              text={ch}
              fontSize={node.fontSize}
              fontFamily={node.fontFamily}
              fontStyle={node.fontStyle}
              fill={node.fill}
              rotation={angle}
              offsetX={node.fontSize / 4}
              listening={false}
            />
          );
        })}
      </Group>
    );
  }

  return (
    <Text
      ref={ref}
      {...useCommonNodeProps(node, { drawing, nested })}
      text={isEditing ? "" : node.text}
      fontSize={node.fontSize}
      fontFamily={node.fontFamily}
      fontStyle={node.fontStyle}
      fill={node.fill}
      align={node.align}
      width={node.width}
      wrap="word"
      lineHeight={node.lineHeight ?? 1.15}
      letterSpacing={node.letterSpacing ?? 0}
      onClick={(e: MouseEvt) => {
        e.cancelBubble = true;
        onSelect(node.id);
      }}
      onTap={(e: TouchEvt) => {
        e.cancelBubble = true;
        onSelect(node.id);
      }}
      onDblClick={() => onStartEdit(node.id)}
      onDblTap={() => onStartEdit(node.id)}
      onDragEnd={(e: DragEndEvt) => {
        onChange(node.id, { x: e.target.x(), y: e.target.y() });
        onCommit();
      }}
      onTransformEnd={(e: TransformEndEvt) => {
        const t = e.target as Konva.Text;
        const sx = t.scaleX();
        const sy = t.scaleY();
        // For text we bake the scale's MAGNITUDE into fontSize for
        // crisp editing — but the SIGN stays on scaleX/scaleY, because
        // the sign is exactly how a flip is stored; resetting it to 1
        // would silently un-flip the layer.
        onChange(node.id, {
          scaleX: sx < 0 ? -1 : 1,
          scaleY: sy < 0 ? -1 : 1,
          fontSize: Math.max(6, Math.round(node.fontSize * Math.abs(sx))),
        });
        onCommit();
      }}
    />
  );
}

function RectNodeView({
  node,
  onSelect,
  onChange,
  onCommit,
  registerRef,
  drawing,
  nested,
}: NodeRendererProps & { node: RectNode }) {
  const ref = useRef<Konva.Rect>(null);
  useEffect(() => {
    registerRef(node.id, ref.current);
    return () => registerRef(node.id, null);
  }, [node.id, registerRef]);

  return (
    <Rect
      ref={ref}
      {...useCommonNodeProps(node, { drawing, nested })}
      width={node.width}
      height={node.height}
      fill={node.fill}
      stroke={node.stroke}
      strokeWidth={node.strokeWidth}
      cornerRadius={node.cornerRadius}
      onClick={(e: MouseEvt) => {
        e.cancelBubble = true;
        onSelect(node.id);
      }}
      onTap={(e: TouchEvt) => {
        e.cancelBubble = true;
        onSelect(node.id);
      }}
      onDragEnd={(e: DragEndEvt) => {
        onChange(node.id, { x: e.target.x(), y: e.target.y() });
        onCommit();
      }}
      onTransformEnd={(e: TransformEndEvt) => {
        const t = e.target as Konva.Rect;
        onChange(node.id, {
          x: t.x(),
          y: t.y(),
          scaleX: t.scaleX(),
          scaleY: t.scaleY(),
          rotation: t.rotation(),
        });
        onCommit();
      }}
    />
  );
}

function CircleNodeView({
  node,
  onSelect,
  onChange,
  onCommit,
  registerRef,
  drawing,
  nested,
}: NodeRendererProps & { node: CircleNode }) {
  const ref = useRef<Konva.Circle>(null);
  useEffect(() => {
    registerRef(node.id, ref.current);
    return () => registerRef(node.id, null);
  }, [node.id, registerRef]);

  return (
    <Circle
      ref={ref}
      {...useCommonNodeProps(node, { drawing, nested })}
      radius={node.radius}
      fill={node.fill}
      stroke={node.stroke}
      strokeWidth={node.strokeWidth}
      onClick={(e: MouseEvt) => {
        e.cancelBubble = true;
        onSelect(node.id);
      }}
      onTap={(e: TouchEvt) => {
        e.cancelBubble = true;
        onSelect(node.id);
      }}
      onDragEnd={(e: DragEndEvt) => {
        onChange(node.id, { x: e.target.x(), y: e.target.y() });
        onCommit();
      }}
      onTransformEnd={(e: TransformEndEvt) => {
        const t = e.target as Konva.Circle;
        onChange(node.id, {
          x: t.x(),
          y: t.y(),
          scaleX: t.scaleX(),
          scaleY: t.scaleY(),
          rotation: t.rotation(),
        });
        onCommit();
      }}
    />
  );
}

function LineNodeView({
  node,
  onSelect,
  onChange,
  onCommit,
  registerRef,
  drawing,
  nested,
}: NodeRendererProps & { node: LineNode }) {
  const ref = useRef<Konva.Line>(null);
  useEffect(() => {
    if (nested) return;
    registerRef(node.id, ref.current);
    return () => registerRef(node.id, null);
  }, [node.id, registerRef, nested]);
  return (
    <Line
      ref={ref}
      {...useCommonNodeProps(node, { drawing, nested })}
      points={node.points}
      stroke={node.stroke}
      strokeWidth={node.strokeWidth}
      tension={node.tension ?? 0}
      lineCap="round"
      lineJoin="round"
      hitStrokeWidth={Math.max(12, node.strokeWidth + 8)}
      onClick={(e: MouseEvt) => { e.cancelBubble = true; onSelect(node.id); }}
      onTap={(e: TouchEvt) => { e.cancelBubble = true; onSelect(node.id); }}
      onDragEnd={(e: DragEndEvt) => {
        onChange(node.id, { x: e.target.x(), y: e.target.y() });
        onCommit();
      }}
      onTransformEnd={(e: TransformEndEvt) => {
        const t = e.target;
        onChange(node.id, {
          x: t.x(), y: t.y(),
          scaleX: t.scaleX(), scaleY: t.scaleY(),
          rotation: t.rotation(),
        });
        onCommit();
      }}
    />
  );
}

function ArrowNodeView({
  node,
  onSelect,
  onChange,
  onCommit,
  registerRef,
  drawing,
  nested,
}: NodeRendererProps & { node: ArrowNode }) {
  const ref = useRef<Konva.Line>(null);
  useEffect(() => {
    if (nested) return;
    registerRef(node.id, ref.current);
    return () => registerRef(node.id, null);
  }, [node.id, registerRef, nested]);
  return (
    <Arrow
      ref={ref as never}
      {...useCommonNodeProps(node, { drawing, nested })}
      points={node.points}
      stroke={node.stroke}
      fill={node.stroke}
      strokeWidth={node.strokeWidth}
      pointerLength={node.pointerLength ?? 16}
      pointerWidth={node.pointerWidth ?? 13}
      lineCap="round"
      lineJoin="round"
      hitStrokeWidth={Math.max(12, node.strokeWidth + 8)}
      onClick={(e: MouseEvt) => { e.cancelBubble = true; onSelect(node.id); }}
      onTap={(e: TouchEvt) => { e.cancelBubble = true; onSelect(node.id); }}
      onDragEnd={(e: DragEndEvt) => {
        onChange(node.id, { x: e.target.x(), y: e.target.y() });
        onCommit();
      }}
      onTransformEnd={(e: TransformEndEvt) => {
        const t = e.target;
        onChange(node.id, {
          x: t.x(), y: t.y(),
          scaleX: t.scaleX(), scaleY: t.scaleY(),
          rotation: t.rotation(),
        });
        onCommit();
      }}
    />
  );
}

function GroupNodeView(props: NodeRendererProps & { node: GroupNode }) {
  const { node, registerRef, nested } = props;
  const ref = useRef<Konva.Group>(null);
  useEffect(() => {
    if (nested) return;
    registerRef(node.id, ref.current);
    return () => registerRef(node.id, null);
  }, [node.id, registerRef, nested]);
  const childProps: NodeRendererProps = {
    ...props,
    isSelected: false,
    isEditing: false,
    nested: true,
  };
  return (
    <Group
      ref={ref}
      {...useCommonNodeProps(node, { drawing: props.drawing, nested })}
      onClick={(e: MouseEvt) => { e.cancelBubble = true; props.onSelect(node.id); }}
      onTap={(e: TouchEvt) => { e.cancelBubble = true; props.onSelect(node.id); }}
      onDragEnd={(e: DragEndEvt) => {
        props.onChange(node.id, { x: e.target.x(), y: e.target.y() });
        props.onCommit();
      }}
      onTransformEnd={(e: TransformEndEvt) => {
        const t = e.target;
        props.onChange(node.id, {
          x: t.x(), y: t.y(),
          scaleX: t.scaleX(), scaleY: t.scaleY(),
          rotation: t.rotation(),
        });
        props.onCommit();
      }}
    >
      {node.children.map((child) => {
        switch (child.kind) {
          case "text":
            return <TextNodeView key={child.id} {...childProps} node={child} />;
          case "rect":
            return <RectNodeView key={child.id} {...childProps} node={child} />;
          case "circle":
            return <CircleNodeView key={child.id} {...childProps} node={child} />;
          case "image":
            return <ImageNodeView key={child.id} {...childProps} node={child} />;
          case "line":
            return <LineNodeView key={child.id} {...childProps} node={child} />;
          case "arrow":
            return <ArrowNodeView key={child.id} {...childProps} node={child} />;
          case "group":
            return <GroupNodeView key={child.id} {...childProps} node={child} />;
          default:
            return null;
        }
      })}
    </Group>
  );
}

/**
 * Chroma key — a custom Konva filter in the same pipeline as the
 * built-in Brighten/Contrast/HSL: pixels within `tolerance` (0..1 of
 * the max RGB distance) of the key color go transparent, with a
 * feathered band above the threshold so edges don't alias.
 */
function makeChromaKeyFilter(color: string, tolerance: number) {
  const hex = color.replace("#", "");
  const kr = parseInt(hex.slice(0, 2), 16) || 0;
  const kg = parseInt(hex.slice(2, 4), 16) || 0;
  const kb = parseInt(hex.slice(4, 6), 16) || 0;
  const maxDist = Math.sqrt(3 * 255 * 255);
  const threshold = tolerance * maxDist;
  const feather = Math.max(1, maxDist * 0.1);
  return (imageData: ImageData) => {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - kr;
      const dg = d[i + 1] - kg;
      const db = d[i + 2] - kb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < threshold) {
        d[i + 3] = 0;
      } else if (dist < threshold + feather) {
        d[i + 3] = Math.min(d[i + 3], ((dist - threshold) / feather) * 255);
      }
    }
  };
}

/* Mask shapes drawn on a 100x100 grid, scaled into the image box. */
const MASK_HEART_PATH =
  "M50 88 C20 62 4 44 4 28 C4 13 16 4 28 4 C38 4 47 10 50 19 C53 10 62 4 72 4 C84 4 96 13 96 28 C96 44 80 62 50 88 Z";
const MASK_STAR_PATH =
  "M50 2 L61.8 37.1 L98.5 38.2 L69.1 60.9 L79.4 96.8 L50 75.6 L20.6 96.8 L30.9 60.9 L1.5 38.2 L38.2 37.1 Z";

/**
 * The shape a mask keeps: drawn AFTER the image inside the node's
 * cached group with destination-in compositing, so only the pixels
 * inside the shape survive. The group cache is what scopes the
 * compositing to this node alone.
 */
function MaskShape({
  mask,
  width,
  height,
}: {
  mask: ImageMask;
  width: number;
  height: number;
}) {
  const op = "destination-in" as const;
  switch (mask.shape) {
    case "circle":
      return (
        <Circle
          x={width / 2}
          y={height / 2}
          radius={Math.min(width, height) / 2}
          fill="#000"
          globalCompositeOperation={op}
          listening={false}
        />
      );
    case "rect":
      return (
        <Rect
          width={width}
          height={height}
          cornerRadius={mask.cornerRadius ?? 18}
          fill="#000"
          globalCompositeOperation={op}
          listening={false}
        />
      );
    case "heart":
      return (
        <Path
          data={MASK_HEART_PATH}
          scaleX={width / 100}
          scaleY={height / 100}
          fill="#000"
          globalCompositeOperation={op}
          listening={false}
        />
      );
    case "star":
      return (
        <Path
          data={MASK_STAR_PATH}
          scaleX={width / 100}
          scaleY={height / 100}
          fill="#000"
          globalCompositeOperation={op}
          listening={false}
        />
      );
    case "text": {
      const text = (mask.text ?? "LOVE").toUpperCase() || "LOVE";
      const fontSize = Math.min(
        height * 0.92,
        (width / Math.max(1, text.length)) * 1.7,
      );
      return (
        <Text
          text={text}
          width={width}
          height={height}
          align="center"
          verticalAlign="middle"
          fontSize={fontSize}
          fontFamily={mask.fontFamily ?? "Space Grotesk"}
          fontStyle="bold"
          fill="#000"
          globalCompositeOperation={op}
          listening={false}
        />
      );
    }
  }
}

function ImageNodeView({
  node,
  onSelect,
  onChange,
  onCommit,
  registerRef,
  drawing,
  nested,
}: NodeRendererProps & { node: ImageNode }) {
  const ref = useRef<Konva.Image>(null);
  const groupRef = useRef<Konva.Group>(null);
  const [img] = useImage(canvasImageSrc(node.src), "anonymous");
  const masked = !!node.mask;
  useEffect(() => {
    // With a mask, the wrapping GROUP is the interactive/transformable
    // node; without one, the image itself is (unchanged behaviour).
    registerRef(node.id, masked ? groupRef.current : ref.current);
    return () => registerRef(node.id, null);
  }, [node.id, registerRef, masked]);

  // Report the asset's intrinsic size once — the DPI auditor needs it.
  const naturalReported = useRef(false);
  useEffect(() => {
    if (img && !node.naturalWidth && !naturalReported.current) {
      naturalReported.current = true;
      onChange(node.id, { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
    }
  }, [img, node.id, node.naturalWidth, onChange]);

  // Konva filter engine: Brighten / Contrast / HSL with node caching.
  // The chroma-key filter rides the SAME pipeline — any active piece
  // caches the node and runs the chain in order.
  useEffect(() => {
    const kimg = ref.current;
    if (!kimg || !img) return;
    const chain: unknown[] = [];
    if (node.filters) {
      chain.push(Konva.Filters.Brighten, Konva.Filters.Contrast, Konva.Filters.HSL);
    }
    if (node.chromaKey) {
      chain.push(makeChromaKeyFilter(node.chromaKey.color, node.chromaKey.tolerance));
    }
    if (chain.length) {
      kimg.filters(chain as never);
      if (node.filters) {
        kimg.brightness(node.filters.brightness);
        kimg.contrast(node.filters.contrast);
        kimg.saturation(node.filters.saturation);
      }
      kimg.cache();
    } else {
      kimg.filters([]);
      kimg.clearCache();
    }
    kimg.getLayer()?.batchDraw();
  }, [img, node.filters, node.chromaKey]);

  // Mask compositing lives in the wrapping group's cache: caching is
  // what scopes the destination-in shape to this node. Re-cache
  // whenever anything that changes the pixels changes. Export paths
  // re-cache at their capture ratio so print files stay sharp.
  useEffect(() => {
    const g = groupRef.current;
    if (!g || !img || !node.mask) return;
    const raf = requestAnimationFrame(() => {
      g.clearCache();
      g.cache();
      g.getLayer()?.batchDraw();
    });
    return () => cancelAnimationFrame(raf);
  }, [img, node.mask, node.crop, node.filters, node.chromaKey, node.width, node.height]);

  const common = useCommonNodeProps(node, { drawing, nested });
  const handlers = {
    onClick: (e: MouseEvt) => {
      e.cancelBubble = true;
      onSelect(node.id);
    },
    onTap: (e: TouchEvt) => {
      e.cancelBubble = true;
      onSelect(node.id);
    },
    onDragEnd: (e: DragEndEvt) => {
      onChange(node.id, { x: e.target.x(), y: e.target.y() });
      onCommit();
    },
    onTransformEnd: (e: TransformEndEvt) => {
      const t = e.target;
      onChange(node.id, {
        x: t.x(),
        y: t.y(),
        scaleX: t.scaleX(),
        scaleY: t.scaleY(),
        rotation: t.rotation(),
      });
      onCommit();
    },
  };
  const cropProps = node.crop
    ? {
        cropX: node.crop.x,
        cropY: node.crop.y,
        cropWidth: node.crop.width,
        cropHeight: node.crop.height,
      }
    : {};
  const blendOp = node.blend === "multiply" ? "multiply" : "source-over";

  if (!node.mask) {
    return (
      <KonvaImage
        ref={ref}
        {...common}
        image={img}
        width={node.width}
        height={node.height}
        {...cropProps}
        globalCompositeOperation={blendOp}
        {...handlers}
      />
    );
  }

  return (
    <Group ref={groupRef} {...common} name={`mask-group ${node.name}`} {...handlers}>
      <KonvaImage
        ref={ref}
        image={img}
        width={node.width}
        height={node.height}
        {...cropProps}
        globalCompositeOperation={blendOp}
        listening={false}
      />
      <MaskShape mask={node.mask} width={node.width} height={node.height} />
    </Group>
  );
}

/* ------------------------------------------------------------------ */
/* Inline text editor — HTML textarea overlay positioned over the      */
/* active text node. Standard react-konva editing pattern.            */
/* ------------------------------------------------------------------ */

/**
 * The CP2 stage composite's affine chain (frame fit ∘ design map),
 * flattened to numbers: it takes a text node's design-space position
 * to the stage-space point where the composite actually renders it,
 * so the inline editor overlay tracks composited text exactly.
 */
export interface StageTextMap {
  frameX: number;
  frameY: number;
  frameScale: number;
  mapX: number;
  mapY: number;
  mapScaleX: number;
  mapScaleY: number;
}

interface TextEditorOverlayProps {
  stageRef: React.RefObject<Konva.Stage | null>;
  node: TextNode | null;
  zoom: number;
  /** Changes whenever the view-only pan/zoom transform changes. */
  viewKey?: string;
  /** CP2 stage composite mapping; null = plain design space. */
  stageMap?: StageTextMap | null;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

function TextEditorOverlay({
  stageRef,
  node,
  zoom,
  viewKey,
  stageMap,
  onCommit,
  onCancel,
}: TextEditorOverlayProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // The parent remounts this component with `key={node.id}`, so a lazy
  // initializer is enough — no effect needed to sync `text` from props.
  const [text, setText] = useState(() => node?.text ?? "");

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta && node) {
      ta.focus();
      ta.select();
    }
  }, [node]);

  // Re-position the textarea whenever the node moves or the zoom changes.
  // This is a legitimate "sync React state with measured DOM" effect — the
  // lint rule fires because of the setState calls, but they are required to
  // reflect the latest stage-container bounding box (an external system).
  const [position, setPosition] = useState<{ left: number; top: number; width: number; height: number; scale: number } | null>(null);
  useEffect(() => {
    if (!node || !stageRef.current) {
      setPosition(null);
      return;
    }
    const containerRect = stageRef.current.container().getBoundingClientRect();
    // Node screen position via the stage's absolute transform, so the
    // overlay tracks the node under the view pan/zoom as well as the
    // plain zoom prop (ignores rotation — text nodes are rarely
    // rotated before editing). Under the CP2 stage composite the
    // node's design-space position first passes through the stage
    // mapping (frame fit ∘ design map) — the point where the text
    // is actually rendered inside the garment frame.
    const rendered = stageMap
      ? {
          x:
            stageMap.frameX +
            stageMap.frameScale *
              (stageMap.mapX + stageMap.mapScaleX * node.x),
          y:
            stageMap.frameY +
            stageMap.frameScale *
              (stageMap.mapY + stageMap.mapScaleY * node.y),
        }
      : { x: node.x, y: node.y };
    const abs = stageRef.current.getAbsoluteTransform().point(rendered);
    const stageScale = stageRef.current.getAbsoluteScale().x || zoom;
    const effZoomX =
      stageScale * (stageMap ? stageMap.frameScale * stageMap.mapScaleX : 1);
    const effZoomY =
      stageScale * (stageMap ? stageMap.frameScale * stageMap.mapScaleY : 1);
    setPosition({
      left: containerRect.left + abs.x,
      top: containerRect.top + abs.y,
      width: Math.max(40, node.width * effZoomX),
      height: Math.max(28, node.fontSize * 1.4 * effZoomY),
      scale: effZoomY,
    });
  }, [node?.id, node?.x, node?.y, node?.width, node?.fontSize, zoom, stageRef, node, viewKey, stageMap]);

  if (!node || !position) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onCommit(text);
    }
  };

  return (
    <textarea
      ref={textareaRef}
      data-tip="Type your words here. Click anywhere else (or press Ctrl+Enter) to keep them; Escape cancels and restores the old words."
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(text)}
      onKeyDown={handleKeyDown}
      style={{
        position: "fixed",
        left: position.left,
        top: position.top,
        width: position.width,
        minHeight: position.height,
        border: "1px solid #007c7d",
        borderRadius: 4,
        padding: "2px 4px",
        margin: 0,
        background: "rgba(255,255,255,0.96)",
        color: node.fill,
        fontSize: Math.max(8, node.fontSize * position.scale),
        fontFamily: node.fontFamily,
        fontWeight: node.fontStyle.includes("bold") ? 700 : 400,
        fontStyle: node.fontStyle.includes("italic") ? "italic" : "normal",
        textAlign: node.align,
        lineHeight: 1.15,
        overflow: "hidden",
        resize: "none",
        outline: "none",
        zIndex: 50,
        boxShadow: "0 4px 14px #0000001a",
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* The editor itself.                                                  */
/* ------------------------------------------------------------------ */

export const CanvasEditor = forwardRef<CanvasEditorHandle, CanvasEditorProps>(
  function CanvasEditor(props, ref) {
    const {
      productType,
      garmentColor,
      nodes,
      selectedId,
      zoom,
      side,
      templateMeta,
      productStage,
      stageVariantIds,
      onSelect,
      onChange,
      onCommit,
      onTextEditMode,
      textEditId,
      tool = "select",
      drawStroke = { stroke: "#202126", strokeWidth: 4 },
      onDrawComplete,
      eraseRadius = 14,
      onEraseComplete,
      blankPage = null,
      panMode = false,
      onZoomChange,
    } = props;

    const stageRef = useRef<Konva.Stage | null>(null);
    /** The editor's root element (.fabric-canvas-frame) — the fit
     *  measurement walks up from here to the canvas-area box. */
    const frameDivRef = useRef<HTMLDivElement | null>(null);
    const bgLayerRef = useRef<Konva.Layer | null>(null);
    const guideLayerRef = useRef<Konva.Layer | null>(null);
    const designLayerRef = useRef<Konva.Layer | null>(null);
    const ghostLayerRef = useRef<Konva.Layer | null>(null);
    /** Stage-fix shading overlay layers (screen-only realism). */
    const shadingLayerRef = useRef<Konva.Layer | null>(null);
    const sheenLayerRef = useRef<Konva.Layer | null>(null);
    const snapLayerRef = useRef<Konva.Layer | null>(null);
    const transformerRef = useRef<Konva.Transformer | null>(null);
    const nodeRefs = useRef<Map<string, Konva.Node>>(new Map());

    const registerRef = useCallback(
      (id: string, node: Konva.Node | null) => {
        if (node) {
          nodeRefs.current.set(id, node);
        } else {
          nodeRefs.current.delete(id);
        }
      },
      [],
    );

    const selectedNode =
      (selectedId && nodes.find((n) => n.id === selectedId)) || null;
    void selectedNode; // kept for future inspector sync; transformer uses nodeRefs map
    const editingTarget = textEditId
      ? ((nodes.find(
          (n) => n.id === textEditId && n.kind === "text",
        ) as TextNode | undefined) ?? null)
      : null;

    // ── REAL product stage (CP2) ──────────────────────────────────
    // The captured stage for the active side, resolved against the
    // design zone artwork is authored in (the resolved template's
    // trim, or the product template's print area — the same zone the
    // DPI auditor measures through, so canvas, auditor and Rule B
    // export all read ONE geometry). Null = no captured stage for
    // this product/side: every layer below renders exactly as before.
    // Stable key for the selected colorway's variant ids, so the
    // layout memo only re-resolves when the colorway actually
    // changes (the parent builds a fresh array on each render).
    const stageVariantKey = stageVariantIds
      ? stageVariantIds.join(",")
      : null;
    const stageLayout = useMemo(() => {
      if (blankPage || !productStage) return null;
      const designZone =
        templateMeta?.stage.trim ?? getProductTemplate(productType).printArea;
      return computeStageLayout(
        productStage,
        side,
        designZone,
        stageVariantIds,
      );
    }, [blankPage, productStage, templateMeta, productType, side, stageVariantIds, stageVariantKey]);
    // Stage-fix tint fallback: the resolved template was captured
    // for a DIFFERENT colorway than the selected one (no captured
    // row covers the selection), so its garment photo is tinted
    // with the selected garment color in the base layer below.
    const stageTinted = stageLayout
      ? !stageTemplateMatchesVariants(stageLayout.template, stageVariantIds)
      : false;
    // Stage-fix shading overlay source: the garment photo when one
    // was captured, else the template (ghost) image itself.
    const shadingSourceUrl = stageLayout
      ? (stageLayout.template.backgroundUrl ??
        stageLayout.template.storedImagePath ??
        stageLayout.template.imageUrl)
      : null;
    const stageShading = useStageShading(shadingSourceUrl);
    // Ref mirror for the imperative handlers (exports, snapping,
    // pointer math), which must read the CURRENT layout without
    // re-binding on every placement switch.
    const stageLayoutRef = useRef<StageLayout | null>(null);
    stageLayoutRef.current = stageLayout;
    // Ref mirror of the node model for the spill test's imperative
    // handlers, which must resolve a rendered Konva node back to its
    // DesignNode without re-binding on every model change.
    const nodesRef = useRef<DesignNode[]>(nodes);
    nodesRef.current = nodes;
    // Flattened mapping for the inline text editor overlay.
    const stageTextMap = useMemo<StageTextMap | null>(
      () =>
        stageLayout
          ? {
              frameX: stageLayout.frame.x,
              frameY: stageLayout.frame.y,
              frameScale: stageLayout.frame.scale,
              mapX: stageLayout.designMap.x,
              mapY: stageLayout.designMap.y,
              mapScaleX: stageLayout.designMap.scaleX,
              mapScaleY: stageLayout.designMap.scaleY,
            }
          : null,
      [stageLayout],
    );

    // Attach/detach the transformer whenever selection changes or nodes change.
    // Pan mode keeps it detached: resizing through a transformer anchor
    // would modify the artwork the admin is only inspecting.
    useEffect(() => {
      const tr = transformerRef.current;
      if (!tr) return;
      if (selectedId && !textEditId && !panMode) {
        const model = nodes.find((n) => n.id === selectedId);
        const node = model?.locked ? null : nodeRefs.current.get(selectedId);
        if (node) {
          tr.nodes([node]);
          tr.getLayer()?.batchDraw();
          return;
        }
      }
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
    }, [selectedId, textEditId, nodes, panMode]);

    // A press on empty stage (mouse, select tool) arms a possible
    // view pan: if the press turns into a drag, the move handler
    // promotes it to a real pan (see handleMouseMoveAny); a press
    // released without dragging stays a plain click and clears the
    // selection on mouse-up, exactly as a stage click always has.
    const panCandidate = useRef<{
      px: number;
      py: number;
      vx: number;
      vy: number;
    } | null>(null);

    const handleStageMouseDown = useCallback(
      (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
        // Clicking the empty stage area (background or guide, which have
        // listening={false}) lands on the stage itself — clear selection.
        if (e.target === stageRef.current) {
          if (e.type === "mousedown" && tool === "select") {
            const stage = stageRef.current;
            const p = stage?.getPointerPosition();
            if (stage && p) {
              panCandidate.current = {
                px: p.x,
                py: p.y,
                vx: stage.x(),
                vy: stage.y(),
              };
              return;
            }
          }
          onSelect(null);
        }
      },
      [onSelect, tool],
    );

    // ── Print-area spill warning (CP2.1) ──────────────────────────
    // While artwork is dragged or transformed, its rendered box is
    // tested against the ACTIVE captured print-area rect — the same
    // rect the clip cuts against. Any part outside turns the area
    // guide's stroke warning red and raises a plain-language chip:
    // the admin sees the moment a print would be cut. With no
    // captured stage there is no test and no warning — the legacy
    // template zones already draw their own bleed/trim/safe guides.
    const [spill, setSpill] = useState(false);
    // A node's box in stage design units, from the SHARED geometry
    // the Publish wizard's Step 2 fit check uses: the node's model
    // bounds (nodeBounds, lib/fabric/preflight — for text, the
    // rendered GLYPH extent, never the stored frame width) mapped
    // through the layout's frame + design-map affine
    // (designNodeStageBox). The Konva client rect is NOT used here:
    // for a text node it reports the frame box, so a layer whose
    // letters sit inside the print area inside a wider frame fired
    // this warning while the wizard (correctly) passed it. The
    // Konva node's LIVE transform is overlaid on the model first,
    // because mid-drag / mid-transform the model still holds the
    // pre-gesture position and scale.
    const stageBoxOfNode = useCallback(
      (target: Konva.Node, layout: StageLayout): StageBox | null => {
        const model = nodesRef.current.find((n) => n.id === target.id());
        if (!model) return null;
        const live: DesignNode = {
          ...model,
          x: target.x(),
          y: target.y(),
          scaleX: target.scaleX(),
          scaleY: target.scaleY(),
          rotation: target.rotation(),
        };
        return designNodeStageBox(live, layout);
      },
      [],
    );
    // Live test while the Transformer resizes/rotates the selection
    // (anchor drags are transform events, not node drags, so the
    // stage drag handler below never sees them).
    const handleTransformSpill = useCallback(() => {
      const layout = stageLayoutRef.current;
      if (!layout) return;
      const node = transformerRef.current?.nodes()[0];
      if (!node) return;
      const box = stageBoxOfNode(node, layout);
      if (box) setSpill(boxSpillsArea(box, layout.areaStageRect));
    }, [stageBoxOfNode]);
    // Settled state: after any committed change (drop, transform
    // commit, rail nudge, undo, side/product switch), re-test every
    // top-level node's rendered box so artwork left hanging outside
    // the area keeps its warning until it is back inside.
    useEffect(() => {
      if (!stageLayout) {
        setSpill(false);
        return;
      }
      let any = false;
      nodeRefs.current.forEach((kn) => {
        if (any || !kn || !kn.visible()) return;
        const box = stageBoxOfNode(kn, stageLayout);
        if (box && boxSpillsArea(box, stageLayout.areaStageRect)) any = true;
      });
      setSpill(any);
    }, [nodes, stageLayout, stageBoxOfNode]);

    // ── CP2.1 ghost blend ─────────────────────────────────────────
    // Konva layers are separate canvas elements stacked in the DOM:
    // the ghost image's multiply composite op (set on the node)
    // blends it against its own layer canvas, and the layer canvas
    // itself needs mix-blend-mode to burn into the design layer
    // beneath it on the live stage. Scoped to the ghost layer only;
    // fully transparent ghost pixels leave the backdrop untouched,
    // so nothing outside the garment frame is affected. Idempotent
    // style write, re-applied every render so it survives any
    // canvas re-creation.
    useEffect(() => {
      const el = ghostLayerRef.current?.getCanvas()._canvas;
      if (el) el.style.mixBlendMode = stageLayout ? "multiply" : "";
    });

    // ── Stage-fix shading blend ───────────────────────────────────
    // Same DOM-blend mechanism as the ghost layer above, scoped to
    // the shading layer only: its opaque amplified-luminance sheet
    // multiplies into the design (and garment) beneath it on the
    // live stage. The sheen layer deliberately gets NO blend — it
    // paints the garment photo over the artwork at low opacity so
    // dark ink picks up fold grain (multiply cannot lift black).
    useEffect(() => {
      const el = shadingLayerRef.current?.getCanvas()._canvas;
      if (el) el.style.mixBlendMode = stageLayout ? "multiply" : "";
    });

    // ── Snapping (smart guides) ───────────────────────────────────
    // While a node is dragged, snap its bounding box to the stage
    // centre/edges, the print-area (trim) edges/centre and the other
    // top-level nodes' edges/centres. Matched lines render on a
    // dedicated overlay layer. Snapping reads the node's live Konva
    // position and nudges it — the node's own drag-end handler then
    // commits the snapped position into the design model, so saved
    // coordinates are always plain design-space numbers.
    const [snapGuides, setSnapGuides] = useState<{ v: number[]; h: number[] }>({
      v: [],
      h: [],
    });
    const handleDragSnap = useCallback(
      (e: Konva.KonvaEventObject<DragEvent>) => {
        if (tool !== "select") return;
        const stage = stageRef.current;
        const target = e.target;
        if (!stage || target === stage) return;
        if (target.getClassName() === "Transformer") return;
        const draggedId = target.id();
        if (!draggedId || !nodeRefs.current.has(draggedId)) return;
        const s = stage.scaleX() || 1;
        const rect = target.getClientRect();
        const box = {
          x: (rect.x - stage.x()) / s,
          y: (rect.y - stage.y()) / s,
          w: rect.width / s,
          h: rect.height / s,
        };
        // Snap targets are stage-space rects: under the CP2 stage
        // composite the visible print area is the captured rect as it
        // sits on the garment frame; otherwise the resolved trim /
        // sheet / product print area, as before.
        const layout = stageLayoutRef.current;
        const trim =
          layout?.areaStageRect ??
          templateMeta?.stage.trim ??
          (blankPage
            ? {
                x: blankPage.x,
                y: blankPage.y,
                width: blankPage.width,
                height: blankPage.height,
              }
            : getProductTemplate(productType).printArea);
        const vTargets: number[] = [
          0,
          STAGE_WIDTH / 2,
          STAGE_WIDTH,
          trim.x,
          trim.x + trim.width / 2,
          trim.x + trim.width,
        ];
        const hTargets: number[] = [
          0,
          STAGE_HEIGHT / 2,
          STAGE_HEIGHT,
          trim.y,
          trim.y + trim.height / 2,
          trim.y + trim.height,
        ];
        // Owner's rule (2026-11-02): the item lays on the grid and
        // snaps to it — the workspace dot grid is 18 screen px, so
        // grid lines at that spacing (in stage units) join the
        // snap targets.
        const gridStep = 18 / s;
        for (let gx = gridStep; gx < STAGE_WIDTH; gx += gridStep) vTargets.push(gx);
        for (let gy = gridStep; gy < STAGE_HEIGHT; gy += gridStep) hTargets.push(gy);
        nodeRefs.current.forEach((kn, id) => {
          if (id === draggedId || kn === target) return;
          const r = kn.getClientRect();
          const bx = (r.x - stage.x()) / s;
          const by = (r.y - stage.y()) / s;
          const bw = r.width / s;
          const bh = r.height / s;
          vTargets.push(bx, bx + bw / 2, bx + bw);
          hTargets.push(by, by + bh / 2, by + bh);
        });
        const threshold = 6 / s; // ≈6 screen px of magnetic pull
        const snapAxis = (edges: number[], targets: number[]) => {
          let best: { delta: number; line: number } | null = null;
          for (const edge of edges) {
            for (const t of targets) {
              const d = t - edge;
              if (
                Math.abs(d) <= threshold &&
                (!best || Math.abs(d) < Math.abs(best.delta))
              ) {
                best = { delta: d, line: t };
              }
            }
          }
          return best;
        };
        const vSnap = snapAxis([box.x, box.x + box.w / 2, box.x + box.w], vTargets);
        const hSnap = snapAxis([box.y, box.y + box.h / 2, box.y + box.h], hTargets);
        // The winning delta is measured in stage units; the dragged
        // node's local axes may sit under the CP2 composite's groups,
        // whose accumulated scale converts it back to local units.
        const kx = layout ? layout.frame.scale * layout.designMap.scaleX : 1;
        const ky = layout ? layout.frame.scale * layout.designMap.scaleY : 1;
        if (vSnap) target.x(target.x() + vSnap.delta / kx);
        if (hSnap) target.y(target.y() + hSnap.delta / ky);
        // CP2.1 spill test, against the captured print-area rect —
        // the rect the artwork clip cuts against. Runs AFTER the snap
        // nudge above so the verdict reads the node's final live
        // position for this move, and NOT on `box` above (the Konva
        // client rect, kept for snapping only): the spill verdict
        // reads the shared designNodeStageBox geometry, so a text
        // layer is judged by its rendered glyphs, not its frame.
        if (layout) {
          const spillBox = stageBoxOfNode(target, layout);
          if (spillBox) setSpill(boxSpillsArea(spillBox, layout.areaStageRect));
        }
        const next = {
          v: vSnap ? [vSnap.line] : [],
          h: hSnap ? [hSnap.line] : [],
        };
        setSnapGuides((prev) =>
          prev.v.join() === next.v.join() && prev.h.join() === next.h.join()
            ? prev
            : next,
        );
      },
      [tool, templateMeta, productType, blankPage, stageBoxOfNode],
    );
    const clearSnapGuides = useCallback(
      () => setSnapGuides({ v: [], h: [] }),
      [],
    );

    // ── Pan / zoom (view-only transform) ──────────────────────────
    // A multiplier + offset layered over the `zoom` prop: wheel zooms
    // toward the cursor, Space-drag and middle-drag pan. The transform
    // is view-only — node coordinates always stay in design space, and
    // every export resets the stage to (zoom, 0, 0) before capturing.
    const [view, setView] = useState({ k: 1, x: 0, y: 0 });
    const viewRef = useRef(view);
    viewRef.current = view;

    // ── Fit-to-column baseline (owner order 2026-10-30) ──────────
    // The stage used to render at a hard-fixed 420×500 CSS px
    // (STAGE_WIDTH × STAGE_HEIGHT at zoom 1) no matter how wide the
    // canvas column is — the owner's screenshot showed the small
    // board marooned in dead dotted space. Now the board EXPANDS to
    // the space it is given: `fit` is the largest uniform scale at
    // which the whole 420×500 design space fits inside the measured
    // .canvas-area box (its content box, padding excluded), and the
    // rendered stage scale becomes zoom × fit × view.k. The `zoom`
    // prop is thereby RE-BASED: 100% = fit-to-column, and the
    // parent's % label, +/− buttons and Reset all speak relative to
    // fit with no parent change. Design units never change — design
    // space stays 420×500, and every export ratio that used to
    // divide by `zoom` now divides by effZoom, so print grids and
    // export dimensions are computed exactly as before.
    // Fit is the min of the two axis fits (aspect kept, whole board
    // visible, centered by the area's place-items): a purely
    // width-driven fit would overflow the area's height more than
    // twofold at the owner's own screen size, and .canvas-area is
    // overflow:hidden — the board would be clipped, not fitted.
    // The observed box (.canvas-area) does not resize when fit
    // changes (flex:1, overflow hidden), so no observer loop.
    const [fit, setFit] = useState(1);
    useLayoutEffect(() => {
      const host =
        frameDivRef.current?.closest(".canvas-area") ??
        frameDivRef.current?.parentElement?.parentElement ??
        null;
      if (!host) return;
      const measure = () => {
        const cs = window.getComputedStyle(host);
        const w =
          host.clientWidth -
          (parseFloat(cs.paddingLeft) || 0) -
          (parseFloat(cs.paddingRight) || 0);
        const h =
          host.clientHeight -
          (parseFloat(cs.paddingTop) || 0) -
          (parseFloat(cs.paddingBottom) || 0);
        if (w <= 0 || h <= 0) return;
        const next = Math.min(w / STAGE_WIDTH, h / STAGE_HEIGHT);
        const clamped = Math.min(5, Math.max(0.4, next));
        setFit((prev) =>
          Math.abs(prev - clamped) > 0.002 ? clamped : prev,
        );
      };
      measure();
      if (typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(measure);
      ro.observe(host);
      return () => ro.disconnect();
    }, []);
    /** Effective baseline scale: the zoom prop re-based onto fit. */
    const effZoom = zoom * fit;
    // Synchronous mirror of the panMode prop (same pattern as
    // spaceHeldRef below): the pointer handlers read it inside the
    // event itself, so a press that lands in the same frame as the
    // rail toggle is still recognised as a pan.
    const panModeRef = useRef(false);
    panModeRef.current = panMode;
    // Keep the parent's % readout (bottom rail) on the live total —
    // the same number getZoom() returns: zoom prop × view multiplier,
    // so wheel zooms move the readout too.
    useEffect(() => {
      onZoomChange?.(zoom * view.k);
    }, [view, zoom, onZoomChange]);
    const [spaceHeld, setSpaceHeld] = useState(false);
    // Synchronous mirror of spaceHeld: the key listener sets it in the
    // event handler itself, so a press that lands in the same frame as
    // the mouse-down is still recognised as a pan (React state alone
    // can lag one render behind the native event).
    const spaceHeldRef = useRef(false);
    const [panning, setPanning] = useState(false);
    const panStart = useRef<{
      px: number;
      py: number;
      vx: number;
      vy: number;
    } | null>(null);

    useEffect(() => {
      const isTyping = () => {
        const a = document.activeElement;
        return (
          a instanceof HTMLInputElement ||
          a instanceof HTMLTextAreaElement ||
          (a instanceof HTMLElement && a.isContentEditable)
        );
      };
      const down = (e: KeyboardEvent) => {
        if (e.code === "Space" && !isTyping()) {
          e.preventDefault();
          spaceHeldRef.current = true;
          setSpaceHeld(true);
        }
      };
      const up = (e: KeyboardEvent) => {
        if (e.code === "Space") {
          spaceHeldRef.current = false;
          setSpaceHeld(false);
        }
      };
      window.addEventListener("keydown", down);
      window.addEventListener("keyup", up);
      return () => {
        window.removeEventListener("keydown", down);
        window.removeEventListener("keyup", up);
      };
    }, []);

    const handleWheel = useCallback(
      (e: Konva.KonvaEventObject<WheelEvent>) => {
        e.evt.preventDefault();
        const stage = stageRef.current;
        if (!stage) return;
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        const cur = viewRef.current;
        const total = effZoom * cur.k;
        const designPt = {
          x: (pointer.x - cur.x) / total,
          y: (pointer.y - cur.y) / total,
        };
        const factor = e.evt.deltaY < 0 ? 1.09 : 1 / 1.09;
        const k = Math.min(3, Math.max(0.45, cur.k * factor));
        const totalNext = effZoom * k;
        setView({
          k,
          x: pointer.x - designPt.x * totalNext,
          y: pointer.y - designPt.y * totalNext,
        });
      },
      [effZoom],
    );

    // The one pan-start path: Space-drag, middle-drag and the bottom
    // rail's Pan Canvas mode all begin a view pan here, so every entry
    // point drives the identical panStart/handlePanMove machinery.
    const beginViewPan = useCallback(
      (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): boolean => {
        const stage = stageRef.current;
        const p = stage?.getPointerPosition();
        if (!p) return true;
        panStart.current = {
          px: p.x,
          py: p.y,
          vx: viewRef.current.x,
          vy: viewRef.current.y,
        };
        setPanning(true);
        return true;
      },
      [],
    );
    const maybeStartPan = useCallback(
      (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>): boolean => {
        const evt = e.evt as MouseEvent;
        const isMiddle = typeof evt.button === "number" && evt.button === 1;
        if (!isMiddle && !spaceHeldRef.current) return false;
        evt.preventDefault();
        return beginViewPan(e);
      },
      [beginViewPan],
    );
    const handlePanMove = useCallback(() => {
      const start = panStart.current;
      const stage = stageRef.current;
      if (!start || !stage) return;
      const p = stage.getPointerPosition();
      if (!p) return;
      setView((v) => ({
        ...v,
        x: start.vx + (p.x - start.px),
        y: start.vy + (p.y - start.py),
      }));
    }, []);
    const endPan = useCallback(() => {
      if (panStart.current) {
        panStart.current = null;
        setPanning(false);
      }
    }, []);

    // ── Freehand drawing ──────────────────────────────────────────
    // Pointer positions come from the design layer's relative
    // pointer (accounts for stage zoom), so committed points land in
    // the same coordinate space as every other node.
    const [draftPoints, setDraftPoints] = useState<number[] | null>(null);
    const drawingStroke = useRef(false);
    const layerPos = useCallback(() => {
      const p =
        designLayerRef.current?.getRelativePointerPosition() ?? null;
      if (!p) return null;
      const layout = stageLayoutRef.current;
      if (!layout) return p;
      // The pointer arrives in stage units, but strokes are committed
      // in design (model) space — invert the CP2 composite's affine
      // chain (frame fit ∘ design map) so a stroke lands exactly
      // where it renders inside the print area.
      const tx = (p.x - layout.frame.x) / layout.frame.scale;
      const ty = (p.y - layout.frame.y) / layout.frame.scale;
      return {
        x: (tx - layout.designMap.x) / layout.designMap.scaleX,
        y: (ty - layout.designMap.y) / layout.designMap.scaleY,
      };
    }, []);
    const handleDrawStart = useCallback(() => {
      if (tool !== "draw" && tool !== "line" && tool !== "arrow") return;
      const p = layerPos();
      if (!p) return;
      drawingStroke.current = true;
      // Straight tools anchor both ends at the press point; the move
      // handler stretches the second end. Freehand appends samples.
      setDraftPoints(tool === "draw" ? [p.x, p.y] : [p.x, p.y, p.x, p.y]);
      onSelect(null);
    }, [tool, layerPos, onSelect]);
    const handleDrawMove = useCallback(() => {
      if (!drawingStroke.current) return;
      const p = layerPos();
      if (!p) return;
      setDraftPoints((prev) => {
        if (!prev) return prev;
        if (tool === "line" || tool === "arrow") {
          return [prev[0], prev[1], p.x, p.y];
        }
        return [...prev, p.x, p.y];
      });
    }, [layerPos, tool]);
    const handleDrawEnd = useCallback(() => {
      if (!drawingStroke.current) return;
      drawingStroke.current = false;
      setDraftPoints((prev) => {
        if (prev && prev.length >= 4 && onDrawComplete) {
          const base = {
            x: 0,
            y: 0,
            rotation: 0,
            opacity: 1,
            scaleX: 1,
            scaleY: 1,
            points: prev,
            stroke: drawStroke.stroke,
            strokeWidth: drawStroke.strokeWidth,
          };
          if (tool === "arrow") {
            onDrawComplete({
              ...base,
              id: `arrow-${Math.random().toString(36).slice(2, 10)}`,
              kind: "arrow",
              name: "Arrow",
              pointerLength: 16,
              pointerWidth: 13,
            });
          } else {
            onDrawComplete({
              ...base,
              id: `line-${Math.random().toString(36).slice(2, 10)}`,
              kind: "line",
              name: tool === "line" ? "Line" : "Drawing",
              tension: tool === "line" ? 0 : 0.4,
            });
          }
        }
        return null;
      });
    }, [onDrawComplete, drawStroke, tool]);

    // ── Eraser ────────────────────────────────────────────────────
    // The gesture collects the swept path in design coordinates with
    // a live trail + brush cursor preview; on release the whole path
    // is committed ONCE through onEraseComplete, so one eraser pass
    // is one history entry in the parent.
    const erasing = useRef(false);
    const erasePath = useRef<{ x: number; y: number }[]>([]);
    const [eraseTrail, setEraseTrail] = useState<number[] | null>(null);
    const [eraseCursor, setEraseCursor] = useState<{ x: number; y: number } | null>(null);
    const handleEraseStart = useCallback(() => {
      if (tool !== "erase") return;
      const p = layerPos();
      if (!p) return;
      erasing.current = true;
      erasePath.current = [p];
      setEraseTrail([p.x, p.y]);
    }, [tool, layerPos]);
    const handleEraseMove = useCallback(() => {
      if (tool !== "erase") return;
      const p = layerPos();
      if (!p) return;
      setEraseCursor(p);
      if (!erasing.current) return;
      erasePath.current = [...erasePath.current, p];
      setEraseTrail((prev) => (prev ? [...prev, p.x, p.y] : prev));
    }, [tool, layerPos]);
    const handleEraseEnd = useCallback(() => {
      if (!erasing.current) return;
      erasing.current = false;
      const path = erasePath.current;
      erasePath.current = [];
      setEraseTrail(null);
      if (path.length > 0 && onEraseComplete) {
        onEraseComplete(path, eraseRadius);
      }
    }, [onEraseComplete, eraseRadius]);

    // Combined stage pointer handlers: pan (space / middle-drag) takes
    // precedence, then the draw tool, then selection.
    const handleMouseDownAny = useCallback(
      (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
        // Pan mode (bottom rail) takes precedence in the select tool:
        // any press pans the view and layers are never grabbed — nodes
        // render non-draggable while panMode is on (see the design
        // layer's `drawing` flag below), so a press on artwork starts
        // a pan here instead of a layer drag.
        if (tool === "select" && panModeRef.current) {
          e.evt.preventDefault();
          beginViewPan(e);
          return;
        }
        if (maybeStartPan(e)) return;
        if (tool === "draw" || tool === "line" || tool === "arrow") {
          handleDrawStart();
        } else if (tool === "erase") {
          handleEraseStart();
        } else {
          handleStageMouseDown(e);
        }
      },
      [maybeStartPan, beginViewPan, tool, handleDrawStart, handleEraseStart, handleStageMouseDown],
    );
    const handleMouseMoveAny = useCallback(() => {
      // Promote an armed empty-stage press into a real view pan once
      // it travels past the click threshold — dragging empty stage
      // pans; node drags never arm the candidate, so layer dragging
      // and selection are untouched.
      if (!panStart.current && panCandidate.current) {
        const stage = stageRef.current;
        const p = stage?.getPointerPosition();
        if (p) {
          const c = panCandidate.current;
          if (Math.hypot(p.x - c.px, p.y - c.py) > 4) {
            panStart.current = { px: c.px, py: c.py, vx: c.vx, vy: c.vy };
            panCandidate.current = null;
            setPanning(true);
          }
        }
      }
      if (panStart.current) {
        handlePanMove();
        return;
      }
      if (tool === "erase") {
        handleEraseMove();
        return;
      }
      handleDrawMove();
    }, [handlePanMove, handleDrawMove, handleEraseMove, tool]);
    const handleMouseUpAny = useCallback(() => {
      if (panCandidate.current) {
        // An empty-stage press that never became a drag was a click:
        // clear the selection, as a stage click always has.
        panCandidate.current = null;
        onSelect(null);
        return;
      }
      if (panStart.current) {
        endPan();
        return;
      }
      if (tool === "erase") {
        handleEraseEnd();
        return;
      }
      handleDrawEnd();
    }, [endPan, handleDrawEnd, handleEraseEnd, tool, onSelect]);

    // Run `fn` with the stage transform reset to the fitted baseline
    // scale (effZoom, no pan), so exports never see the view-only
    // pan/zoom transform — and never the fit either, beyond the same
    // baseline the export ratios divide back out.
    const withViewReset = useCallback(
      <T,>(fn: () => T): T => {
        const stage = stageRef.current;
        if (!stage) return fn();
        const prev = {
          sx: stage.scaleX(),
          sy: stage.scaleY(),
          x: stage.x(),
          y: stage.y(),
        };
        stage.scale({ x: effZoom, y: effZoom });
        stage.position({ x: 0, y: 0 });
        stage.draw();
        try {
          return fn();
        } finally {
          stage.scale({ x: prev.sx, y: prev.sy });
          stage.position({ x: prev.x, y: prev.y });
          stage.draw();
        }
      },
      [effZoom],
    );

    // Masked images render through a cached group; re-cache those
    // groups at the capture ratio so exports stay sharp, then put the
    // screen-resolution cache back.
    const withMaskRatio = useCallback(<T,>(ratio: number, fn: () => T): T => {
      const groups = designLayerRef.current?.find(".mask-group") ?? [];
      groups.forEach((g) => (g as Konva.Group).cache({ pixelRatio: ratio }));
      try {
        return fn();
      } finally {
        groups.forEach((g) => (g as Konva.Group).cache());
      }
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        resetView: () => setView({ k: 1, x: 0, y: 0 }),
        clientToDesign: (clientX: number, clientY: number) => {
          const stage = stageRef.current;
          const layout = stageLayoutRef.current;
          if (!stage || !layout) return null;
          const rect = stage.container().getBoundingClientRect();
          const px = clientX - rect.left;
          const py = clientY - rect.top;
          if (px < 0 || py < 0 || px > rect.width || py > rect.height) return null;
          const sp = stage
            .getAbsoluteTransform()
            .copy()
            .invert()
            .point({ x: px, y: py });
          const { frame, designMap } = layout;
          return {
            x: ((sp.x - frame.x) / frame.scale - designMap.x) / designMap.scaleX,
            y: ((sp.y - frame.y) / frame.scale - designMap.y) / designMap.scaleY,
          };
        },
        exportRegionPng: async (rect, pixelRatio = 2, opts) => {
          const layer = designLayerRef.current;
          const bg = bgLayerRef.current;
          const tr = transformerRef.current;
          if (!layer) return null;
          tr?.nodes([]);
          try {
            // Only the design layer (and optionally the bg layer)
            // are ever captured here — the screen-only shading /
            // sheen overlay layers cannot enter a region export.
            const part = (l: Konva.Layer | null) =>
              l?.toDataURL({
                mimeType: "image/png",
                pixelRatio,
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              }) ?? null;
            const designUrl = withViewReset(() =>
              withMaskRatio(pixelRatio, () => part(layer)),
            );
            if (!designUrl) return null;
            if (!opts?.includeBackground || !bg) return designUrl;
            const bgUrl = withViewReset(() => part(bg));
            if (!bgUrl) return designUrl;
            const load = (src: string) =>
              new Promise<HTMLImageElement>((resolve, reject) => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = reject;
                i.src = src;
              });
            const [bgImg, designImg] = await Promise.all([
              load(bgUrl),
              load(designUrl),
            ]);
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(rect.width * pixelRatio));
            canvas.height = Math.max(1, Math.round(rect.height * pixelRatio));
            const ctx = canvas.getContext("2d");
            if (!ctx) return designUrl;
            ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
            ctx.drawImage(designImg, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL("image/png");
          } finally {
            if (selectedId) {
              const node = nodeRefs.current.get(selectedId);
              if (node) tr?.nodes([node]);
            }
            tr?.getLayer()?.batchDraw();
          }
        },
        exportPNG: (pixelRatio = 3) => {
          const stage = stageRef.current;
          const bg = bgLayerRef.current;
          const guide = guideLayerRef.current;
          const tr = transformerRef.current;
          if (!stage) return null;
          const prevBgVisible = bg ? bg.visible() : true;
          const prevGuideVisible = guide ? guide.visible() : true;
          const ghost = ghostLayerRef.current;
          const prevGhostVisible = ghost ? ghost.visible() : true;
          const snap = snapLayerRef.current;
          const prevSnapVisible = snap ? snap.visible() : true;
          // Stage-fix: the shading/sheen overlay is a screen-only
          // realism aid — hidden here exactly like the ghost, so
          // this capture is identical to the pre-overlay behaviour.
          const shading = shadingLayerRef.current;
          const prevShadingVisible = shading ? shading.visible() : true;
          const sheen = sheenLayerRef.current;
          const prevSheenVisible = sheen ? sheen.visible() : true;
          bg?.visible(false);
          guide?.visible(false);
          // The ghost shading template is mockup dressing, not design
          // content — a design-only capture must not bake it in.
          ghost?.visible(false);
          shading?.visible(false);
          sheen?.visible(false);
          snap?.visible(false);
          tr?.nodes([]);
          const url = withViewReset(() =>
            withMaskRatio(pixelRatio, () => stage.toDataURL({ pixelRatio })),
          );
          bg?.visible(prevBgVisible);
          guide?.visible(prevGuideVisible);
          ghost?.visible(prevGhostVisible);
          shading?.visible(prevShadingVisible);
          sheen?.visible(prevSheenVisible);
          snap?.visible(prevSnapVisible);
          // Re-attach transformer if we still have a selection
          if (selectedId) {
            const node = nodeRefs.current.get(selectedId);
            if (node) tr?.nodes([node]);
          }
          tr?.getLayer()?.batchDraw();
          return url;
        },
        exportMockup: (pixelRatio = 2, mimeType = "image/png") => {
          const stage = stageRef.current;
          const guide = guideLayerRef.current;
          const snap = snapLayerRef.current;
          const tr = transformerRef.current;
          if (!stage) return null;
          const prevGuideVisible = guide ? guide.visible() : true;
          const prevSnapVisible = snap ? snap.visible() : true;
          // Stage-fix: mockup export keeps today's content exactly
          // (bg + design + ghost) — the screen-only shading/sheen
          // overlay layers are hidden for the capture and restored.
          const shading = shadingLayerRef.current;
          const prevShadingVisible = shading ? shading.visible() : true;
          const sheen = sheenLayerRef.current;
          const prevSheenVisible = sheen ? sheen.visible() : true;
          guide?.visible(false);
          snap?.visible(false);
          shading?.visible(false);
          sheen?.visible(false);
          tr?.nodes([]);
          const url = withViewReset(() =>
            withMaskRatio(pixelRatio, () => {
              if (mimeType !== "image/jpeg") {
                return stage.toDataURL({ pixelRatio, mimeType, quality: 0.92 });
              }
              // JPEG has no alpha: composite the stage onto white so
              // the margins around the contain-fit product photo
              // render white, never black.
              const src = stage.toCanvas({ pixelRatio });
              const out = document.createElement("canvas");
              out.width = src.width;
              out.height = src.height;
              const ctx = out.getContext("2d");
              if (!ctx) {
                return stage.toDataURL({ pixelRatio, mimeType, quality: 0.92 });
              }
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(0, 0, out.width, out.height);
              ctx.drawImage(src as HTMLCanvasElement, 0, 0);
              return out.toDataURL("image/jpeg", 0.92);
            }),
          );
          guide?.visible(prevGuideVisible);
          snap?.visible(prevSnapVisible);
          shading?.visible(prevShadingVisible);
          sheen?.visible(prevSheenVisible);
          if (selectedId) {
            const node = nodeRefs.current.get(selectedId);
            if (node) tr?.nodes([node]);
          }
          tr?.getLayer()?.batchDraw();
          return url;
        },
        exportPrintFile: () => {
          const layer = designLayerRef.current;
          const tr = transformerRef.current;
          if (!layer) return null;
          // CP2 Rule B: when a captured stage is active, the print
          // file is the artwork inside the CAPTURED print area,
          // rendered at the CAPTURED spec's exact pixel grid — the
          // same supplier_print_specs row the DPI auditor reads.
          const layout = stageLayoutRef.current;
          if (layout?.spec) {
            const area = layout.areaStageRect;
            tr?.nodes([]);
            const ratio =
              layout.spec.printWidthPx / (area.width * effZoom);
            const url = withViewReset(() =>
              withMaskRatio(ratio, () =>
                layer.toDataURL({
                  mimeType: "image/png",
                  pixelRatio: ratio,
                  x: area.x,
                  y: area.y,
                  width: area.width,
                  height: area.height,
                }),
              ),
            );
            if (selectedId) {
              const node = nodeRefs.current.get(selectedId);
              if (node) tr?.nodes([node]);
            }
            tr?.getLayer()?.batchDraw();
            return url;
          }
          if (!templateMeta) return null;
          const trim = templateMeta.stage.trim;
          tr?.nodes([]);
          // Output must land on the exact spec grid regardless of the
          // on-screen zoom: layer coords are pre-zoom, the layer's
          // absolute scale includes the fitted baseline, so divide
          // it back out.
          const ratio = templateMeta.spec.widthPx / (trim.width * effZoom);
          const url = withViewReset(() =>
            withMaskRatio(ratio, () =>
              layer.toDataURL({
                mimeType: "image/png",
                pixelRatio: ratio,
                x: trim.x,
                y: trim.y,
                width: trim.width,
                height: trim.height,
              }),
            ),
          );
          if (selectedId) {
            const node = nodeRefs.current.get(selectedId);
            if (node) tr?.nodes([node]);
          }
          tr?.getLayer()?.batchDraw();
          return url;
        },
        // Total zoom RELATIVE TO FIT — the same number the parent's
        // % label shows (100% = fit-to-column, wheel zoom included).
        getZoom: () => zoom * viewRef.current.k,
      }),
      [zoom, selectedId, templateMeta, withViewReset, withMaskRatio],
    );

    // Stage dimensions scale with the fitted baseline (zoom × fit):
    // at 100% the board fills the measured canvas column.
    const stageWidth = STAGE_WIDTH * effZoom;
    const stageHeight = STAGE_HEIGHT * effZoom;
    // CP2 ghost: our stored copy of the supplier's template shading
    // image once ingested, else the supplier CDN original.
    const ghostUrl = stageLayout
      ? (stageLayout.template.storedImagePath ?? stageLayout.template.imageUrl)
      : null;

    return (
      <div
        ref={frameDivRef}
        className="fabric-canvas-frame"
        style={{ width: stageWidth, height: stageHeight, position: "relative" }}
        data-zoom={zoom}
      >
        {/* One stage label only — it lives in the studio chrome above the canvas. */}
        {/* CP2.1 spill warning: sits at the canvas's bottom edge.
            HTML, so no export ever sees it. */}
        {stageLayout && spill ? (
          <span
            role="alert"
            style={{
              position: "absolute",
              bottom: 14,
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "DM Sans, sans-serif",
              color: "#ffffff",
              background: "#b91c1c",
              padding: "7px 14px",
              borderRadius: 30,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              boxShadow: "0 6px 20px rgba(185,28,28,0.35)",
              zIndex: 6,
            }}
          >
            Part of your design is outside the print area — that part
            won&rsquo;t print.
          </span>
        ) : null}
        <Stage
          ref={stageRef}
          width={stageWidth}
          height={stageHeight}
          scaleX={effZoom * view.k}
          scaleY={effZoom * view.k}
          x={view.x}
          y={view.y}
          onWheel={handleWheel}
          onMouseDown={handleMouseDownAny}
          onTouchStart={tool === "draw" ? handleDrawStart : handleStageMouseDown}
          onMouseMove={handleMouseMoveAny}
          onTouchMove={handleDrawMove}
          onMouseUp={handleMouseUpAny}
          onTouchEnd={handleDrawEnd}
          onDragMove={handleDragSnap}
          onDragEnd={clearSnapGuides}
          style={{
            cursor: panning
              ? "grabbing"
              : spaceHeld || panMode
                ? "grab"
                : tool === "erase"
                  ? "crosshair"
                  : undefined,
          }}
        >
          {/* 1. Background layer — a plain sheet of paper in
                 blank-page mode; else the supplier photo mockup when
                 a real catalog product is loaded, else the vector
                 silhouette. */}
          <Layer ref={bgLayerRef} listening={false}>
            {blankPage ? (
              <Rect
                x={blankPage.x}
                y={blankPage.y}
                width={blankPage.width}
                height={blankPage.height}
                fill="#ffffff"
                stroke="#d9d9e2"
                strokeWidth={1}
                shadowColor="#1c1c22"
                shadowBlur={14}
                shadowOpacity={0.14}
                shadowOffsetY={3}
              />
            ) : stageLayout ? (
              /* CP2 composite BASE: the garment inside the captured
                 template frame — the supplier's background photo when
                 one was captured, else the template's background
                 color, else the garment color from Product setup. */
              <Group
                x={stageLayout.frame.x}
                y={stageLayout.frame.y}
                scaleX={stageLayout.frame.scale}
                scaleY={stageLayout.frame.scale}
              >
                <Rect
                  x={0}
                  y={0}
                  width={stageLayout.template.templateWidth}
                  height={stageLayout.template.templateHeight}
                  fill={
                    stageTinted
                      ? garmentColor
                      : (stageLayout.template.backgroundColor ?? garmentColor)
                  }
                />
                {stageLayout.template.backgroundUrl ? (
                  <StageFrameImage
                    url={stageLayout.template.backgroundUrl}
                    width={stageLayout.template.templateWidth}
                    height={stageLayout.template.templateHeight}
                  />
                ) : null}
                {stageTinted && stageLayout.template.backgroundUrl ? (
                  /* Stage-fix tint fallback: no captured template
                     covers the selected colorway, so the captured
                     garment photo is re-colored in place — a
                     multiply rect in the selected garment color,
                     drawn over the photo inside this same layer
                     (canvas multiply against the photo beneath it).
                     The photo's folds and shading survive; its
                     colorway follows the Product-tab selection.
                     Screen composite only: this layer is hidden /
                     uncaptured in every export, as before. */
                  <Rect
                    x={0}
                    y={0}
                    width={stageLayout.template.templateWidth}
                    height={stageLayout.template.templateHeight}
                    fill={garmentColor}
                    opacity={0.92}
                    globalCompositeOperation="multiply"
                  />
                ) : null}
              </Group>
            ) : templateMeta?.mockupUrl ? (
              <MockupPhoto url={templateMeta.mockupUrl} />
            ) : templateMeta || nodes.length ? (
              <ProductSilhouette productType={productType} color={garmentColor} />
            ) : null}
          </Layer>

          {/* 2. Guide layer — bleed / trim / safe zones (or the sheet
                 outline in blank-page mode). Non-interactive. */}
          <Layer ref={guideLayerRef} listening={false}>
            {blankPage ? (
              <>
                <Rect
                  x={blankPage.x}
                  y={blankPage.y}
                  width={blankPage.width}
                  height={blankPage.height}
                  stroke="#b9b9c9"
                  strokeWidth={1}
                  dash={[6, 5]}
                />
                <Text
                  x={blankPage.x}
                  y={blankPage.y + blankPage.height + 8}
                  width={blankPage.width}
                  align="center"
                  text={blankPage.label}
                  fontSize={12}
                  fill="#8a8a96"
                  fontFamily="DM Sans, sans-serif"
                />
              </>
            ) : stageLayout ? (
              <StageAreaGuide layout={stageLayout} warning={spill} />
            ) : (
              <PrintAreaGuide productType={productType} templateMeta={templateMeta} />
            )}
          </Layer>

          {/* 3. Design layer — user content + Transformer. Under the
                 CP2 composite the artwork stack renders inside the
                 stage groups (frame → print-area clip → design map);
                 without a captured stage the wrap is a passthrough. */}
          <Layer ref={designLayerRef}>
            <StageArtworkGroups layout={stageLayout}>
            {nodes.map((node) => {
              const rendererProps: NodeRendererProps = {
                node,
                isSelected: node.id === selectedId,
                isEditing: node.id === textEditId,
                onSelect,
                onChange,
                onCommit,
                onStartEdit: onTextEditMode,
                registerRef,
                drawing: tool !== "select" || panning || spaceHeld || panMode,
              };
              switch (node.kind) {
                case "text":
                  return <TextNodeView key={node.id} {...rendererProps} node={node} />;
                case "rect":
                  return <RectNodeView key={node.id} {...rendererProps} node={node} />;
                case "circle":
                  return <CircleNodeView key={node.id} {...rendererProps} node={node} />;
                case "image":
                  return <ImageNodeView key={node.id} {...rendererProps} node={node} />;
                case "line":
                  return <LineNodeView key={node.id} {...rendererProps} node={node} />;
                case "arrow":
                  return <ArrowNodeView key={node.id} {...rendererProps} node={node} />;
                case "group":
                  return <GroupNodeView key={node.id} {...rendererProps} node={node} />;
                default:
                  return null;
              }
            })}
            {draftPoints && tool === "arrow" ? (
              <Arrow
                points={draftPoints}
                stroke={drawStroke.stroke}
                fill={drawStroke.stroke}
                strokeWidth={drawStroke.strokeWidth}
                pointerLength={16}
                pointerWidth={13}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            ) : draftPoints ? (
              <Line
                points={draftPoints}
                stroke={drawStroke.stroke}
                strokeWidth={drawStroke.strokeWidth}
                tension={tool === "line" ? 0 : 0.4}
                lineCap="round"
                lineJoin="round"
                listening={false}
              />
            ) : null}
            </StageArtworkGroups>
            <Transformer
              ref={transformerRef}
              rotateEnabled
              onTransform={handleTransformSpill}
              onTransformEnd={handleTransformSpill}
              enabledAnchors={[
                "top-left",
                "top-right",
                "bottom-left",
                "bottom-right",
              ]}
              borderStroke="#007c7d"
              anchorStroke="#007c7d"
              anchorFill="#ffffff"
              anchorSize={8}
              borderDash={[4, 3]}
              padding={5}
              ignoreStroke
            />
          </Layer>

          {/* 3a. Shading overlay (stage-fix) — SCREEN-ONLY realism:
                 the garment's own amplified luminance over the
                 artwork, clipped to the captured print area, so
                 folds/shadow streaks shade the design instead of
                 the design floating flat on top. Two layers:
                 multiply shading (this layer's canvas carries CSS
                 mix-blend-mode: multiply — see the blend effect)
                 and a low-opacity sheen of the garment photo
                 (next layer) so near-black ink picks up fold
                 grain. Both non-interactive, both hidden from /
                 uncaptured by every export path. */}
          <Layer ref={shadingLayerRef} listening={false}>
            {stageLayout && stageShading.shading ? (
              <Group
                x={stageLayout.frame.x}
                y={stageLayout.frame.y}
                scaleX={stageLayout.frame.scale}
                scaleY={stageLayout.frame.scale}
              >
                <Group
                  clipFunc={(ctx) => {
                    const t = stageLayout.template;
                    ctx.beginPath();
                    ctx.rect(
                      t.printAreaLeft,
                      t.printAreaTop,
                      t.printAreaWidth,
                      t.printAreaHeight,
                    );
                    ctx.closePath();
                  }}
                >
                  <KonvaImage
                    image={stageShading.shading}
                    x={0}
                    y={0}
                    width={stageLayout.template.templateWidth}
                    height={stageLayout.template.templateHeight}
                    opacity={SHADING_MULTIPLY_OPACITY}
                    globalCompositeOperation="multiply"
                  />
                </Group>
              </Group>
            ) : null}
          </Layer>
          <Layer ref={sheenLayerRef} listening={false}>
            {stageLayout && stageShading.photo ? (
              <Group
                x={stageLayout.frame.x}
                y={stageLayout.frame.y}
                scaleX={stageLayout.frame.scale}
                scaleY={stageLayout.frame.scale}
              >
                <Group
                  clipFunc={(ctx) => {
                    const t = stageLayout.template;
                    ctx.beginPath();
                    ctx.rect(
                      t.printAreaLeft,
                      t.printAreaTop,
                      t.printAreaWidth,
                      t.printAreaHeight,
                    );
                    ctx.closePath();
                  }}
                >
                  <KonvaImage
                    image={stageShading.photo}
                    x={0}
                    y={0}
                    width={stageLayout.template.templateWidth}
                    height={stageLayout.template.templateHeight}
                    opacity={SHADING_SHEEN_OPACITY}
                  />
                </Group>
              </Group>
            ) : null}
          </Layer>

          {/* 3b. Ghost layer (CP2) — the supplier's template shading
                 over the artwork, so the print sits inside the fabric.
                 Non-interactive. Mockup captures include it; the
                 design-only capture hides it. CP2.1: the shading
                 MULTIPLIES into the artwork (blend on the image +
                 mix-blend-mode on this layer's canvas — see the
                 blend effect above), never source-over. */}
          <Layer ref={ghostLayerRef} listening={false}>
            {stageLayout && ghostUrl ? (
              <Group
                x={stageLayout.frame.x}
                y={stageLayout.frame.y}
                scaleX={stageLayout.frame.scale}
                scaleY={stageLayout.frame.scale}
              >
                <StageFrameImage
                  url={ghostUrl}
                  width={stageLayout.template.templateWidth}
                  height={stageLayout.template.templateHeight}
                  blend="multiply"
                />
              </Group>
            ) : null}
          </Layer>

          {/* 4. Snap-guide overlay — smart guides shown while dragging.
                 Non-interactive and hidden from every export. */}
          <Layer ref={snapLayerRef} listening={false}>
            {snapGuides.v.map((x) => (
              <Line
                key={`snap-v-${x}`}
                points={[x, -60, x, STAGE_HEIGHT + 60]}
                stroke="#e45173"
                strokeWidth={1 / effZoom}
                dash={[5 / effZoom, 4 / effZoom]}
              />
            ))}
            {snapGuides.h.map((y) => (
              <Line
                key={`snap-h-${y}`}
                points={[-60, y, STAGE_WIDTH + 60, y]}
                stroke="#e45173"
                strokeWidth={1 / effZoom}
                dash={[5 / effZoom, 4 / effZoom]}
              />
            ))}
            {/* Eraser preview: the swept trail and the brush circle.
                Same overlay layer, so exports never see them. The
                trail lives in design space, so under the CP2
                composite it takes the same stage wrap as the artwork
                (passthrough without a captured stage). */}
            <StageArtworkGroups layout={stageLayout}>
            {eraseTrail && eraseTrail.length >= 2 && (
              <Line
                points={eraseTrail}
                stroke="#e45173"
                strokeWidth={1.5 / effZoom}
                dash={[4 / effZoom, 3 / effZoom]}
                lineCap="round"
                lineJoin="round"
              />
            )}
            {tool === "erase" && eraseCursor && (
              <Circle
                x={eraseCursor.x}
                y={eraseCursor.y}
                radius={eraseRadius}
                stroke="#e45173"
                strokeWidth={1.2 / effZoom}
                fill="#e451730d"
              />
            )}
            </StageArtworkGroups>
          </Layer>
        </Stage>

        {/* HTML overlay for inline text editing — lives outside the Stage.
            A `key` prop forces remount when the target node changes so the
            textarea's internal state resets cleanly via useState lazy
            initializer rather than a prop-sync effect. */}
        <TextEditorOverlay
          key={editingTarget?.id ?? "none"}
          stageRef={stageRef}
          node={editingTarget}
          zoom={effZoom}
          stageMap={stageTextMap}
          viewKey={`${view.k},${view.x},${view.y}`}
          onCommit={(text) => {
            if (editingTarget) {
              onChange(editingTarget.id, { text });
              onCommit();
            }
            onTextEditMode(null);
          }}
          onCancel={() => onTextEditMode(null)}
        />
      </div>
    );
  },
);
