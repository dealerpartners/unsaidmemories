"use client";

/**
 * Print post-processing — Fabric.js, deliberately separate from Konva.
 *
 * The two canvas libraries are NEVER overlaid or mounted in the same
 * surface: Konva owns the live design editor; this panel owns the
 * sequential hand-off step for vector artwork (architecture decision —
 * overlaying both makes each library fight over DOM events and offsets
 * coordinates). Here an SVG is loaded into its own Fabric canvas on its
 * own DOM node, its objects are recolored / re-texted, and the result
 * is rasterized at full print width and uploaded as the design's
 * post-processed print file. The SVG source itself is stored with the
 * design first, so the hand-off is durable, not a browser download.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

interface FabricObjectInfo {
  index: number;
  type: string;
  fill: string;
  text?: string;
}

interface Props {
  designId: string | null;
  /** Target print width in px for the raster export (from the template spec). */
  printWidthPx?: number;
  onUploaded?: (ref: string) => void;
}

const DISPLAY_W = 560;
const DISPLAY_H = 420;

export default function PostProcessor({ designId, printWidthPx, onUploaded }: Props) {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);
  const groupRef = useRef<any>(null);
  const [svgText, setSvgText] = useState("");
  const [objects, setObjects] = useState<FabricObjectInfo[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshObjectList = useCallback(() => {
    const group = groupRef.current;
    if (!group) {
      setObjects([]);
      return;
    }
    const kids = typeof group.getObjects === "function" ? group.getObjects() : [group];
    setObjects(
      kids.map((o: any, i: number) => ({
        index: i,
        type: String(o.type ?? "object"),
        fill: typeof o.fill === "string" ? o.fill : "#000000",
        text: typeof o.text === "string" ? o.text : undefined,
      })),
    );
  }, []);

  const loadSvg = useCallback(async (svg: string) => {
    if (!svg.includes("<svg")) {
      setStatus("That does not look like SVG markup.");
      return;
    }
    setBusy(true);
    try {
      const fabric = await import("fabric");
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }
      const el = canvasElRef.current;
      if (!el) return;
      const canvas = new fabric.StaticCanvas(el, {
        width: DISPLAY_W,
        height: DISPLAY_H,
        backgroundColor: "#ffffff",
      });
      fabricRef.current = canvas;
      const parsed: any = await fabric.loadSVGFromString(svg);
      const group: any = fabric.util.groupSVGElements(parsed.objects, parsed.options);
      const scale = Math.min(
        (DISPLAY_W - 40) / (group.width || DISPLAY_W),
        (DISPLAY_H - 40) / (group.height || DISPLAY_H),
        1,
      );
      group.set({
        left: (DISPLAY_W - (group.width || 0) * scale) / 2,
        top: (DISPLAY_H - (group.height || 0) * scale) / 2,
        scaleX: scale,
        scaleY: scale,
      });
      canvas.add(group);
      canvas.renderAll();
      groupRef.current = group;
      setSelected(null);
      refreshObjectList();
      setStatus(
        `Loaded ${objects.length || ""}SVG — ${(group.getObjects?.() ?? [group]).length} objects. Edit fills/text, then export the print PNG.`,
      );
    } catch (e: any) {
      setStatus("Fabric failed to parse that SVG: " + (e?.message ?? "unknown error"));
    } finally {
      setBusy(false);
    }
  }, [objects.length, refreshObjectList]);

  useEffect(() => {
    return () => {
      fabricRef.current?.dispose?.();
      fabricRef.current = null;
    };
  }, []);

  const applyFill = useCallback(
    (index: number, fill: string) => {
      const group = groupRef.current;
      const canvas = fabricRef.current;
      if (!group || !canvas) return;
      const kids = typeof group.getObjects === "function" ? group.getObjects() : [group];
      const obj = kids[index];
      if (!obj) return;
      obj.set("fill", fill);
      canvas.renderAll();
      refreshObjectList();
    },
    [refreshObjectList],
  );

  const applyText = useCallback(
    (index: number, text: string) => {
      const group = groupRef.current;
      const canvas = fabricRef.current;
      if (!group || !canvas) return;
      const kids = typeof group.getObjects === "function" ? group.getObjects() : [group];
      const obj = kids[index];
      if (!obj) return;
      obj.set("text", text);
      canvas.renderAll();
      refreshObjectList();
    },
    [refreshObjectList],
  );

  const saveSource = useCallback(async () => {
    if (!designId) {
      setStatus("Save the design first — the SVG source is stored with the design.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/designs/${designId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "svg-source", svgText, provider: "fabric-postprocess" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setStatus("SVG source stored with the design.");
    } catch (e: any) {
      setStatus("Could not store SVG source: " + e.message);
    } finally {
      setBusy(false);
    }
  }, [designId, svgText]);

  const exportPrintPng = useCallback(async () => {
    const canvas = fabricRef.current;
    const group = groupRef.current;
    if (!canvas || !group) {
      setStatus("Load an SVG first.");
      return;
    }
    if (!designId) {
      setStatus("Save the design first — the print file is stored with the design.");
      return;
    }
    setBusy(true);
    try {
      const targetW = printWidthPx ?? 3000;
      const currentW = (group.width || DISPLAY_W) * (group.scaleX || 1);
      const multiplier = Math.max(1, targetW / currentW);
      const dataUrl = canvas.toDataURL({ format: "png", multiplier });
      const res = await fetch(`/api/admin/designs/${designId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "postprocessed",
          surface: "Front",
          dataUrl,
          provider: "fabric-postprocess",
          width: Math.round(currentW * multiplier),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setStatus(`Print PNG exported at ${Math.round(currentW * multiplier)}px wide and stored as the design's print file.`);
      onUploaded?.(data.ref);
    } catch (e: any) {
      setStatus("Export failed: " + e.message);
    } finally {
      setBusy(false);
    }
  }, [designId, printWidthPx, onUploaded]);

  const picked = selected !== null ? objects[selected] : null;

  return (
    <div className="postprocess-panel">
      <div className="section-head">
        <h3>Print post-processing · Fabric.js</h3>
        <span className="badge">SVG → print file</span>
      </div>
      <p className="small-muted">
        Separate from the Konva editor by design: paste or upload vector artwork,
        recolor or re-text its objects here, then rasterize at full print width.
      </p>
      <div className="field">
        <label>SVG markup</label>
        <textarea
          value={svgText}
          onChange={(e) => setSvgText(e.target.value)}
          placeholder="<svg …>…</svg>"
          rows={5}
          style={{ fontFamily: "monospace", fontSize: 11 }}
        />
      </div>
      <div className="field-row">
        <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>
          Upload .svg
          <input
            type="file"
            accept=".svg,image/svg+xml"
            style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setSvgText(await f.text());
            }}
          />
        </label>
        <button className="btn btn-primary btn-sm" disabled={busy || !svgText} onClick={() => loadSvg(svgText)}>
          Load into Fabric canvas
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy || !svgText} onClick={saveSource}>
          Store SVG source
        </button>
      </div>
      <div style={{ marginTop: 12, border: "1px solid #e6e6ec", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
        <canvas ref={canvasElRef} width={DISPLAY_W} height={DISPLAY_H} />
      </div>
      {objects.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: 14 }}>
            <h3>Objects</h3>
            <span className="small-muted">{objects.length} in SVG group</span>
          </div>
          <div className="category-list">
            {objects.slice(0, 40).map((o) => (
              <button
                key={o.index}
                className={`category ${selected === o.index ? "active" : ""}`}
                onClick={() => setSelected(o.index)}
              >
                <span
                  className="cat-icon"
                  style={{ background: o.fill, border: "1px solid #ddd", width: 14, height: 14, borderRadius: 3 }}
                />
                <span>{o.type}{o.text ? ` — “${o.text.slice(0, 24)}”` : ""}</span>
              </button>
            ))}
          </div>
          {picked && (
            <div className="field-row" style={{ marginTop: 10 }}>
              <div className="field">
                <label>Fill color</label>
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(picked.fill) ? picked.fill : "#000000"}
                  onChange={(e) => applyFill(picked.index, e.target.value)}
                />
              </div>
              {picked.text !== undefined && (
                <div className="field" style={{ flex: 1 }}>
                  <label>Text</label>
                  <input
                    value={picked.text}
                    onChange={(e) => applyText(picked.index, e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
          <div className="action-stack" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" disabled={busy} onClick={exportPrintPng}>
              Export print PNG{printWidthPx ? ` (${printWidthPx}px)` : ""} → design
            </button>
          </div>
        </>
      )}
      {status && <p className="small-muted" style={{ marginTop: 10 }}>{status}</p>}
    </div>
  );
}
