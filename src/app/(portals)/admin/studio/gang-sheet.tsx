"use client";

/**
 * DTF gang-sheet editor — a sheet measured in INCHES, filled with many
 * artworks (from the design's own layers, its asset vault, or fresh
 * uploads), arranged freely, and exported as ONE transparent print PNG
 * at exactly 300 DPI on the sheet's true grid.
 *
 * The view stage is a scaled-down proxy (a 22"×60" sheet would be
 * 6600×18000 px); item geometry lives in inches in the GangSheet model
 * and persists inside the design's canvas_state. The export renders
 * band-by-band through the streaming PNG encoder (lib/fabric/
 * png-encode) because a full-size canvas cannot exist in a browser.
 */

import { canvasImageSrc } from "@/lib/image-proxy";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Image as KImage, Layer, Rect, Stage, Transformer } from "react-konva";
import type Konva from "konva";
import type { GangItem, GangSheet } from "@/lib/fabric/preflight";
import { buildPngBlob } from "@/lib/fabric/png-encode";

export const GANG_DPI = 300;
export const GANG_SIZES: Array<{ label: string; widthIn: number; heightIn: number }> = [
  { label: "22″ × 60″ — full roll", widthIn: 22, heightIn: 60 },
  { label: "22″ × 36″", widthIn: 22, heightIn: 36 },
  { label: "22″ × 24″", widthIn: 22, heightIn: 24 },
  { label: "24″ × 36″", widthIn: 24, heightIn: 36 },
  { label: "12″ × 18″ — test sheet", widthIn: 12, heightIn: 18 },
];

function useHtmlImage(src: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) { setImg(null); return; }
    const el = new window.Image();
    el.crossOrigin = "anonymous";
    el.onload = () => setImg(el);
    el.onerror = () => setImg(null);
    el.src = canvasImageSrc(src);
    return () => { el.onload = null; el.onerror = null; };
  }, [src]);
  return img;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new window.Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("image failed to load"));
    el.src = canvasImageSrc(src);
  });
}

export interface GangExportResult {
  blob: Blob;
  widthPx: number;
  heightPx: number;
  dpi: number;
}

export interface GangSheetHandle {
  /** Render the sheet as one transparent PNG at exactly 300 DPI. */
  exportSheetPng: () => Promise<GangExportResult>;
}

interface Props {
  sheet: GangSheet;
  selectedItemId: string | null;
  onSelectItem: (id: string | null) => void;
  onChange: (sheet: GangSheet) => void;
}

const GangSheetEditor = forwardRef<GangSheetHandle, Props>(function GangSheetEditor(
  { sheet, selectedItemId, onSelectItem, onChange },
  ref,
) {
  const viewScale = Math.min(620 / sheet.widthIn, 560 / sheet.heightIn);
  const stageW = Math.round(sheet.widthIn * viewScale);
  const stageH = Math.round(sheet.heightIn * viewScale);
  const trRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Image>());

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = selectedItemId ? nodeRefs.current.get(selectedItemId) : undefined;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedItemId, sheet.items.length]);

  const patchItem = (id: string, patch: Partial<GangItem>) =>
    onChange({ ...sheet, items: sheet.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });

  useImperativeHandle(ref, () => ({
    async exportSheetPng() {
      const widthPx = Math.round(sheet.widthIn * GANG_DPI);
      const heightPx = Math.round(sheet.heightIn * GANG_DPI);
      const images = new Map<string, HTMLImageElement>();
      for (const item of sheet.items) {
        if (!images.has(item.src)) images.set(item.src, await loadImage(item.src));
      }
      const renderBand = async (bandY: number, bandHeightPx: number) => {
        const canvas = document.createElement("canvas");
        canvas.width = widthPx;
        canvas.height = bandHeightPx;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable for sheet export.");
        for (const item of sheet.items) {
          const img = images.get(item.src);
          if (!img) continue;
          ctx.save();
          ctx.translate(item.xIn * GANG_DPI, item.yIn * GANG_DPI - bandY);
          ctx.rotate(((item.rotation || 0) * Math.PI) / 180);
          ctx.drawImage(img, 0, 0, item.wIn * GANG_DPI, item.wIn * item.aspect * GANG_DPI);
          ctx.restore();
        }
        const data = ctx.getImageData(0, 0, widthPx, bandHeightPx);
        return { data: data.data, rows: bandHeightPx };
      };
      const blob = await buildPngBlob(widthPx, heightPx, renderBand, 900);
      return { blob, widthPx, heightPx, dpi: GANG_DPI };
    },
  }), [sheet]);

  return (
    <div style={{ display: "grid", placeItems: "center", padding: 12, overflow: "auto", maxHeight: "100%" }}>
      <Stage
        width={stageW}
        height={stageH}
        onMouseDown={(e) => { if (e.target === e.target.getStage() || e.target.name() === "sheet-bg") onSelectItem(null); }}
        style={{ background: "#ececf1", borderRadius: 8 }}
      >
        <Layer>
          <Rect name="sheet-bg" x={0} y={0} width={stageW} height={stageH} fill="#ffffff" stroke="#c9c9d4" strokeWidth={1} />
          {sheet.items.map((item) => (
            <GangItemView
              key={item.id}
              item={item}
              viewScale={viewScale}
              selected={item.id === selectedItemId}
              registerRef={(node) => {
                if (node) nodeRefs.current.set(item.id, node);
                else nodeRefs.current.delete(item.id);
              }}
              onSelect={() => onSelectItem(item.id)}
              onDragEnd={(xIn, yIn) => patchItem(item.id, { xIn, yIn })}
              onTransformEnd={(patch) => patchItem(item.id, patch)}
            />
          ))}
          <Transformer
            ref={trRef}
            rotateEnabled
            keepRatio
            boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 12 ? oldBox : newBox)}
          />
        </Layer>
      </Stage>
    </div>
  );
});

function GangItemView({
  item, viewScale, selected, registerRef, onSelect, onDragEnd, onTransformEnd,
}: {
  item: GangItem;
  viewScale: number;
  selected: boolean;
  registerRef: (node: Konva.Image | null) => void;
  onSelect: () => void;
  onDragEnd: (xIn: number, yIn: number) => void;
  onTransformEnd: (patch: Partial<GangItem>) => void;
}) {
  const img = useHtmlImage(item.src);
  return (
    <KImage
      ref={registerRef}
      image={img ?? undefined}
      x={item.xIn * viewScale}
      y={item.yIn * viewScale}
      width={item.wIn * viewScale}
      height={item.wIn * item.aspect * viewScale}
      rotation={item.rotation || 0}
      draggable
      stroke={selected ? "#007c7d" : undefined}
      strokeWidth={selected ? 1.5 : 0}
      onMouseDown={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => onDragEnd(e.target.x() / viewScale, e.target.y() / viewScale)}
      onTransformEnd={(e) => {
        const node = e.target as Konva.Image;
        const wIn = (node.width() * node.scaleX()) / viewScale;
        onTransformEnd({ wIn, xIn: node.x() / viewScale, yIn: node.y() / viewScale, rotation: node.rotation() });
        node.scaleX(1);
        node.scaleY(1);
      }}
    />
  );
}

export default GangSheetEditor;
