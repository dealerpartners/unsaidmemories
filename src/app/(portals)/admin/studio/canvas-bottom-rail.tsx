"use client";

/**
 * CanvasBottomRailControls — the floating bottom rail of the design
 * studio's canvas viewport (owner's reference image, ordered
 * 2026-10-30): a white rounded panel floating over the bottom of the
 * canvas area holding, horizontally, Pan Canvas / Fit to Screen / the
 * zoom slider with − / + anchors and a live % readout.
 *
 * The rail owns no view state of its own: Pan toggles the parent's
 * isPanActive, Fit runs the parent's handleFitToScreen (zoom-to-fit +
 * the editor's resetView), and the slider drives the parent's zoom
 * float through handleZoomChange (setCanvasZoom, clamped 65%–135% —
 * the ZOOM_MIN/ZOOM_MAX below mirror that clamp). The % readout shows
 * the LIVE total zoom the editor reports (zoom × mouse-wheel
 * multiplier), so it stays honest after a wheel zoom.
 */

export const ZOOM_MIN = 0.65;
export const ZOOM_MAX = 1.35;

export interface CanvasBottomRailControlsProps {
  /** The zoom float the slider drives (1 = fit-to-column). */
  zoom: number;
  /** Live total zoom reported by the editor, for the % readout. */
  totalZoom: number;
  /** Pan Canvas mode on/off (the parent's isPanActive). */
  isPanActive: boolean;
  togglePanMode: () => void;
  handleFitToScreen: () => void;
  handleZoomChange: (next: number) => void;
}

export function CanvasBottomRailControls({
  zoom,
  totalZoom,
  isPanActive,
  togglePanMode,
  handleFitToScreen,
  handleZoomChange,
}: CanvasBottomRailControlsProps) {
  return (
    <div className="canvas-bottom-rail" role="group" aria-label="Canvas view controls">
      <button
        type="button"
        className={`rail-btn rail-pan${isPanActive ? " active" : ""}`}
        aria-pressed={isPanActive}
        onClick={togglePanMode}
        data-tip="Pan mode: drag anywhere on the canvas to move the whole view — your layers stay exactly where they are. Click again to go back to moving layers."
      >
        ✋ Pan Canvas
      </button>
      <button
        type="button"
        className="rail-btn"
        onClick={handleFitToScreen}
        data-tip="Fit the whole product back into view at its normal size. This also undoes any pan or mouse-wheel zooming."
      >
        🔍 Fit to Screen
      </button>
      <div className="rail-zoom">
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => handleZoomChange(zoom - 0.1)}
          data-tip="Zoom out — see more of the workspace at once."
        >
          −
        </button>
        <input
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={0.01}
          value={zoom}
          onChange={(e) => handleZoomChange(Number(e.target.value))}
          aria-label="Zoom"
          data-tip="Slide to zoom in or out. 100% is the size that fits your screen."
        />
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => handleZoomChange(zoom + 0.1)}
          data-tip="Zoom in — a closer look at the details."
        >
          ＋
        </button>
      </div>
      <span className="rail-pct">{Math.round(totalZoom * 100)}%</span>
    </div>
  );
}
