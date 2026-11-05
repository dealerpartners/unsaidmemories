"use client";

/**
 * Design Studio window shell — the pop-out the owner ordered
 * (2026-11-02 13:11 CST): "Give the design studio a pop out button so
 * that it can pop and break free and become the entire screen. It can
 * be moved — make it a split screen, it can share a screen side by
 * side."
 *
 * NO-REMOUNT BY CONSTRUCTION: the render tree below is byte-stable in
 * every mode — one frame div, one header (hidden while docked), one
 * body holding the studio, plus the drag handles (hidden unless their
 * mode applies). A mode change only restyles the frame (position /
 * geometry) and unhides the chrome, so the studio component instance,
 * the Konva stage and all design state survive untouched. No route
 * changes either.
 *
 * The Konva stage refits on its own: canvas-editor.tsx measures
 * `.canvas-area` with a ResizeObserver, so any geometry change here
 * re-fits the stage; a window `resize` event is also dispatched when
 * a mode change (or a finished drag) settles, for good measure.
 *
 * Modes:
 *   docked — the studio sits in the shell canvas, exactly as before.
 *   float  — a floating window over the admin: draggable by its
 *            header, resizable from the bottom-right corner.
 *   full   — the window covers the entire viewport (header retained,
 *            so the user is never trapped).
 *   split  — the window docks to one half of the viewport (right by
 *            default, swappable); the admin stays visible and usable
 *            on the other half; the divider drags between 30% and 70%.
 * Esc: full → float, float/split → docked.
 *
 * Fidelity (owner's standard, 2026-11-02 13:13 CST): shell tokens
 * carried as literal values from global-shell.css — primary green
 * #0a6400 (container #108000), topbar height 52px, padding 0 24px,
 * cluster gap 12px — and white text on the colored Dock control is
 * set explicitly inline, because the legacy unlayered CSS stack can
 * override Tailwind's layered text-white utility.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeftRight,
  Columns2,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  X,
} from "lucide-react";

export type StudioWindowMode = "docked" | "float" | "full" | "split";

type StudioWindowApi = {
  mode: StudioWindowMode;
  setMode: (m: StudioWindowMode) => void;
};

const StudioWindowContext = createContext<StudioWindowApi>({
  mode: "docked",
  setMode: () => {},
});

export const useStudioWindow = () => useContext(StudioWindowContext);

type Geom = { x: number; y: number; w: number; h: number };

const GREEN = "#171420";
const GREEN_CONTAINER = "#000000";
const INK = "#171420";
const LINE = "#dcdce4";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function defaultGeom(): Geom {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(1440, Math.max(680, vw - 64));
  const h = Math.min(920, Math.max(480, vh - 64));
  return { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w, h };
}

const fireRefit = () => {
  // The stage's own ResizeObserver does the real work; this nudges any
  // other listener keyed to window resize once geometry has settled.
  window.setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
};

/** Quiet icon+label control (white surface, dark ink — always readable). */
const quietBtn: React.CSSProperties = {
  height: 32,
  padding: "0 10px",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "#ffffff",
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  color: INK,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

/** The one colored control: shell green, white text carried explicitly. */
const primaryBtn: React.CSSProperties = {
  ...quietBtn,
  background: GREEN,
  border: `1px solid ${GREEN}`,
  color: "#ffffff",
};

export default function StudioWindowShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mode, setModeState] = useState<StudioWindowMode>("docked");
  const [geom, setGeom] = useState<Geom | null>(null);
  const [splitPct, setSplitPct] = useState(50);
  const [splitSide, setSplitSide] = useState<"right" | "left">("right");
  const [dragging, setDragging] = useState(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const setMode = useCallback((m: StudioWindowMode) => {
    if (m === "float") setGeom((g) => g ?? defaultGeom());
    setModeState(m);
  }, []);

  // Refit the canvas once a mode change has painted.
  useEffect(() => {
    if (mode !== "docked") fireRefit();
  }, [mode]);

  // Esc unwinds one level: full → float, float/split → docked.
  useEffect(() => {
    if (mode === "docked") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (modeRef.current === "full") setMode("float");
      else if (modeRef.current !== "docked") setMode("docked");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, setMode]);

  /** Shared pointer-drag engine for moving, resizing and the divider. */
  const beginPointerDrag = (
    e: React.PointerEvent,
    onMove: (dx: number, dy: number, ev: PointerEvent) => void,
  ) => {
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    setDragging(true);
    const move = (ev: PointerEvent) => onMove(ev.clientX - sx, ev.clientY - sy, ev);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(false);
      fireRefit();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onHeaderPointerDown = (e: React.PointerEvent) => {
    if (modeRef.current !== "float") return;
    if ((e.target as HTMLElement).closest("button")) return;
    const orig = geom ?? defaultGeom();
    beginPointerDrag(e, (dx, dy) => {
      setGeom({
        ...orig,
        x: clamp(orig.x + dx, -(orig.w - 180), window.innerWidth - 90),
        y: clamp(orig.y + dy, 0, window.innerHeight - 44),
      });
    });
  };

  const onResizePointerDown = (e: React.PointerEvent) => {
    const orig = geom ?? defaultGeom();
    beginPointerDrag(e, (dx, dy) => {
      setGeom({
        ...orig,
        w: clamp(orig.w + dx, 680, Math.max(680, window.innerWidth - orig.x - 8)),
        h: clamp(orig.h + dy, 460, Math.max(460, window.innerHeight - orig.y - 8)),
      });
    });
  };

  const onDividerPointerDown = (e: React.PointerEvent) => {
    beginPointerDrag(e, (_dx, _dy, ev) => {
      const pct =
        splitSide === "right"
          ? ((window.innerWidth - ev.clientX) / window.innerWidth) * 100
          : (ev.clientX / window.innerWidth) * 100;
      setSplitPct(clamp(pct, 30, 70));
    });
  };

  const popped = mode !== "docked";
  const g = geom ?? { x: 60, y: 40, w: 1200, h: 800 };

  const frameStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    background: "#ffffff",
    ...(popped
      ? {
          position: "fixed" as const,
          zIndex: 200,
          border: `1px solid ${LINE}`,
          boxShadow: "0 24px 80px rgba(23, 20, 32, 0.28)",
          overflow: "hidden",
          ...(mode === "full"
            ? { inset: 0 }
            : mode === "split"
              ? splitSide === "right"
                ? { top: 0, right: 0, bottom: 0, width: `${splitPct}%` }
                : { top: 0, left: 0, bottom: 0, width: `${splitPct}%` }
              : {
                  left: g.x,
                  top: g.y,
                  width: g.w,
                  height: g.h,
                  borderRadius: 12,
                }),
        }
      : { height: "100%" }),
  };

  const btnFor = (m: StudioWindowMode) =>
    mode === m ? { ...quietBtn, borderColor: GREEN, color: GREEN } : quietBtn;

  return (
    <StudioWindowContext.Provider value={{ mode, setMode }}>
      <div style={frameStyle} role={popped ? "dialog" : undefined} aria-label={popped ? "Design Studio — popped out" : undefined}>
        {/* Window header — always in the tree, hidden while docked, so
            the studio below it never changes parents. */}
        <div
          onPointerDown={onHeaderPointerDown}
          style={{
            height: 52,
            padding: "0 24px",
            flex: "none",
            display: popped ? "flex" : "none",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            background: "#ffffff",
            borderBottom: `1px solid ${LINE}`,
            cursor: mode === "float" ? (dragging ? "grabbing" : "grab") : "default",
            userSelect: "none",
            touchAction: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <PictureInPicture2 size={17} color={GREEN} aria-hidden="true" />
            <span style={{ fontSize: 14, fontWeight: 600, color: INK, whiteSpace: "nowrap" }}>
              Design Studio
            </span>
            <span style={{ fontSize: 12, color: "#5c5e6a", whiteSpace: "nowrap" }}>
              {mode === "float"
                ? "Floating — drag this bar to move it"
                : mode === "full"
                  ? "Full screen"
                  : splitSide === "right"
                    ? "Split — docked right, drag the edge to resize"
                    : "Split — docked left, drag the edge to resize"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "none" }}>
            <button
              type="button"
              style={{ ...btnFor("split"), display: mode === "full" ? "none" : "inline-flex" }}
              onClick={() => setMode("split")}
              title="Dock the studio to half the screen, side by side with the page"
            >
              <Columns2 size={15} aria-hidden="true" /> Split
            </button>
            <button
              type="button"
              style={{ ...btnFor("float"), display: mode === "float" ? "none" : "inline-flex" }}
              onClick={() => setMode("float")}
              title="Float the studio as a movable window"
            >
              <PictureInPicture2 size={15} aria-hidden="true" /> Float
            </button>
            <button
              type="button"
              style={{ ...quietBtn, display: mode === "split" ? "inline-flex" : "none" }}
              onClick={() => setSplitSide((s) => (s === "right" ? "left" : "right"))}
              title="Move the studio to the other half of the screen"
            >
              <ArrowLeftRight size={15} aria-hidden="true" /> Other side
            </button>
            <button
              type="button"
              style={{ ...quietBtn, display: mode === "full" ? "none" : "inline-flex" }}
              onClick={() => setMode("full")}
              title="Make the studio the entire screen"
            >
              <Maximize2 size={15} aria-hidden="true" /> Full screen
            </button>
            <button
              type="button"
              style={{ ...quietBtn, display: mode === "full" ? "inline-flex" : "none" }}
              onClick={() => setMode("float")}
              title="Back to a floating window"
            >
              <Minimize2 size={15} aria-hidden="true" /> Restore
            </button>
            <button
              type="button"
              style={primaryBtn}
              onMouseEnter={(e) => (e.currentTarget.style.background = GREEN_CONTAINER)}
              onMouseLeave={(e) => (e.currentTarget.style.background = GREEN)}
              onClick={() => setMode("docked")}
              title="Put the studio back in its tab, exactly as it was"
            >
              <X size={15} color="#ffffff" aria-hidden="true" /> Dock back
            </button>
          </div>
        </div>

        {/* The studio — same element, same parent, every mode. */}
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>{children}</div>

        {/* Float resize handle (bottom-right corner). */}
        <div
          onPointerDown={onResizePointerDown}
          title="Drag to resize"
          style={{
            position: "absolute",
            right: 3,
            bottom: 3,
            width: 18,
            height: 18,
            cursor: "nwse-resize",
            touchAction: "none",
            borderRight: "2px solid #b9bac4",
            borderBottom: "2px solid #b9bac4",
            borderBottomRightRadius: 10,
            zIndex: 5,
            display: mode === "float" ? "block" : "none",
          }}
        />

        {/* Split divider (the edge facing the admin page). */}
        <div
          onPointerDown={onDividerPointerDown}
          title="Drag to resize the split"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 9,
            cursor: "ew-resize",
            touchAction: "none",
            zIndex: 5,
            display: mode === "split" ? "block" : "none",
            ...(splitSide === "right"
              ? { left: -4, borderLeft: `2px solid ${GREEN}` }
              : { right: -4, borderRight: `2px solid ${GREEN}` }),
          }}
        />
      </div>
    </StudioWindowContext.Provider>
  );
}
