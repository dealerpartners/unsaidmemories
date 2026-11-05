/**
 * The POD render core — ONE code path for the Studio (browser) and the
 * headless render worker (Sunny's POD Rendering & Publish Play, 2026-11-04).
 *
 * Canonical coordinates are PHYSICAL INCHES on the garment. Each blank
 * view stores its pixels-per-inch, so a placement spec written once
 * re-applies to any blank, any photo, any supplier.
 *
 * This module is pure: no canvas, no DOM, no I/O. buildStage() returns a
 * StagePlan (ordered layer operations in absolute pixels); the Studio
 * mounts the plan in Konva, the worker executes the same plan headless.
 * If the two ever disagree, the plan or the box math is wrong — that is
 * what the parity test renders.
 */

export interface PrintBoxIn {
  xIn: number;
  yIn: number;
  wIn: number;
  hIn: number;
}

export interface BlankViewAssets {
  /** Template/photo width and height in pixels. */
  width: number;
  height: number;
  /** Pixels per inch for this view's photo. */
  pxPerInch: number;
  /** The print-area box, in inches on the garment. */
  box: PrintBoxIn;
  /** Storage path / URL of the shading (ghost) asset for this view. */
  shadingRef: string;
  /** sha256 of the shading asset — part of the render cache key. */
  shadingSha: string;
}

/**
 * What the Studio produces: a placement, not a picture.
 * Offsets are inches INSIDE the print-area box; omitted fields mean
 * auto-fit (preserve aspect, fit inside the box, centered).
 */
export interface PlacementSpec {
  designSha: string;
  /** Design height / width, from the design file itself. */
  designAspect: number;
  xIn?: number;
  yIn?: number;
  wIn?: number;
  rotation?: number;
}

export interface StagePlan {
  canvas: { width: number; height: number };
  pxPerInch: number;
  boxPx: { left: number; top: number; width: number; height: number };
  designRectPx: { left: number; top: number; width: number; height: number };
  rotation: number;
  layers: Array<
    | { op: "background"; color: string }
    | { op: "garment"; colorHex: string; shadingRef: string }
    | { op: "design"; rectPx: { left: number; top: number; width: number; height: number }; rotation: number }
    | { op: "shading-pass"; shadingRef: string; opacity: number }
    | { op: "mask" }
  >;
}

/** Shared by studio and worker — the one inches→pixels conversion. */
export function boxToPixels(
  box: { xIn: number; yIn: number; wIn: number; hIn: number },
  pxPerInch: number
) {
  return {
    left: Math.round(box.xIn * pxPerInch),
    top: Math.round(box.yIn * pxPerInch),
    width: Math.round(box.wIn * pxPerInch),
    height: Math.round(box.hIn * pxPerInch),
  };
}

/**
 * Compose the stage for one blank view + color + placement.
 * colorHex is the garment tint (applied over the shading layer).
 * Background is white — the storefront's product-image law.
 */
export function buildStage(
  assets: BlankViewAssets,
  colorHex: string,
  placement: PlacementSpec,
  shadingPassOpacity = 0.28
): StagePlan {
  const ppi = assets.pxPerInch;
  const boxPx = boxToPixels(assets.box, ppi);

  // Resolve the design rect inside the box, in inches first.
  let wIn = placement.wIn ?? assets.box.wIn;
  let hIn = wIn * placement.designAspect;
  if (hIn > assets.box.hIn) {
    hIn = assets.box.hIn;
    wIn = hIn / placement.designAspect;
  }
  if (wIn > assets.box.wIn) {
    wIn = assets.box.wIn;
    hIn = wIn * placement.designAspect;
  }
  const xIn = assets.box.xIn + (placement.xIn ?? (assets.box.wIn - wIn) / 2);
  const yIn = assets.box.yIn + (placement.yIn ?? (assets.box.hIn - hIn) / 2);
  const designRectPx = boxToPixels({ xIn, yIn, wIn, hIn }, ppi);
  const rotation = placement.rotation ?? 0;

  return {
    canvas: { width: assets.width, height: assets.height },
    pxPerInch: ppi,
    boxPx,
    designRectPx,
    rotation,
    layers: [
      { op: "background", color: "#ffffff" },
      { op: "garment", colorHex, shadingRef: assets.shadingRef },
      { op: "design", rectPx: designRectPx, rotation },
      { op: "shading-pass", shadingRef: assets.shadingRef, opacity: shadingPassOpacity },
      { op: "mask" },
    ],
  };
}

/**
 * Canonical string for the render cache key. Callers hash this with
 * sha256 (worker: node crypto; browser: SubtleCrypto) to get
 * renders.input_hash. A reprint of the same inputs is a cache hit.
 */
export function stagePlanKey(
  blankId: string,
  view: string,
  color: string,
  plan: StagePlan,
  placement: PlacementSpec,
  shadingSha: string
): string {
  return JSON.stringify({
    blankId,
    view,
    color,
    shadingSha,
    designSha: placement.designSha,
    box: plan.boxPx,
    designRect: plan.designRectPx,
    rotation: plan.rotation,
    canvas: plan.canvas,
  });
}
