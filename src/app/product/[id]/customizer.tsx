"use client";

/**
 * PdpCustomizer — the shopper-facing customization card on the product
 * page, in the spirit of the owner's reference: product mockup with a
 * dashed PRINT AREA overlay, a live stats row (Artwork Scale ·
 * Position Offset · Base Cost), a mockup selector, artwork chips,
 * an artwork size slider with a Multiplier readout, and base variant
 * color swatches.
 *
 * The preview is a real Konva stage (the studio's engine): the chosen
 * design's Front-surface nodes render over the product photo with the
 * studio's multiply-blend technique, inside a group whose transform
 * IS the customization — drag the artwork to move it, slide to scale.
 *
 * Add to Bag saves through /api/customize (a real design record +
 * print file + publication) and then adds the exact variant to the
 * real cart with that publication, so checkout and fulfillment carry
 * the customization exactly like a studio-published design.
 * Customization never changes the price — there is no personalization
 * fee anywhere in the data, so Base Cost is simply the variant price.
 */

import { canvasImageSrc } from "@/lib/image-proxy";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import {
  Stage,
  Layer,
  Group,
  Rect,
  Circle,
  Text,
  Line,
  Image as KonvaImage,
} from "react-konva";
import useImage from "use-image";
import type { PdpCustomizerData, PdpVariant } from "./product-detail";
import {
  loadGoogleFont,
  type CircleNode,
  type DesignNode,
  type ImageNode,
  type LineNode,
  type RectNode,
  type TextNode,
} from "@/lib/admin/design-node";
import { colorNameToHex } from "@/lib/fabric/templates";
import { money } from "@/lib/pdp-display";
import { addToCart, fetchCurrentCustomerId } from "@/lib/commerce/cart-client";
import { useStore } from "@/lib/store";

const STAGE_W = 420;
const STAGE_H = 500;

/* ------------------------------------------------------------------ */
/* Mini node renderers — the preview side of the studio's node model.  */
/* ------------------------------------------------------------------ */

function ArtImage({ node }: { node: ImageNode }) {
  const [img] = useImage(canvasImageSrc(node.src), "anonymous");
  if (!img) return null;
  return (
    <KonvaImage
      image={img}
      x={node.x}
      y={node.y}
      width={node.width}
      height={node.height}
      rotation={node.rotation}
      opacity={node.opacity}
      scaleX={node.scaleX}
      scaleY={node.scaleY}
      globalCompositeOperation={node.blend === "multiply" ? "multiply" : "source-over"}
    />
  );
}

function ArtText({ node }: { node: TextNode }) {
  if (node.curve) {
    const { radius, spacingDeg } = node.curve;
    const chars = node.text.split("");
    const startAngle = -((chars.length - 1) * spacingDeg) / 2;
    return (
      <Group
        x={node.x}
        y={node.y}
        rotation={node.rotation}
        opacity={node.opacity}
        scaleX={node.scaleX}
        scaleY={node.scaleY}
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
      x={node.x}
      y={node.y}
      text={node.text}
      fontSize={node.fontSize}
      fontFamily={node.fontFamily}
      fontStyle={node.fontStyle}
      fill={node.fill}
      align={node.align}
      width={node.width}
      wrap="word"
      lineHeight={node.lineHeight ?? 1.15}
      letterSpacing={node.letterSpacing ?? 0}
      rotation={node.rotation}
      opacity={node.opacity}
      scaleX={node.scaleX}
      scaleY={node.scaleY}
    />
  );
}

function ArtNode({ node }: { node: DesignNode }) {
  switch (node.kind) {
    case "text":
      return <ArtText node={node} />;
    case "rect": {
      const n = node as RectNode;
      return (
        <Rect
          x={n.x} y={n.y} width={n.width} height={n.height}
          fill={n.fill} stroke={n.stroke} strokeWidth={n.strokeWidth}
          cornerRadius={n.cornerRadius} rotation={n.rotation}
          opacity={n.opacity} scaleX={n.scaleX} scaleY={n.scaleY}
        />
      );
    }
    case "circle": {
      const n = node as CircleNode;
      return (
        <Circle
          x={n.x} y={n.y} radius={n.radius}
          fill={n.fill} stroke={n.stroke} strokeWidth={n.strokeWidth}
          rotation={n.rotation} opacity={n.opacity}
          scaleX={n.scaleX} scaleY={n.scaleY}
        />
      );
    }
    case "image":
      return <ArtImage node={node as ImageNode} />;
    case "line": {
      const n = node as LineNode;
      return (
        <Line
          points={n.points} stroke={n.stroke} strokeWidth={n.strokeWidth}
          tension={n.tension ?? 0} lineCap="round" lineJoin="round"
          x={n.x} y={n.y} rotation={n.rotation} opacity={n.opacity}
          scaleX={n.scaleX} scaleY={n.scaleY}
        />
      );
    }
    case "group":
      return (
        <Group
          x={node.x} y={node.y} rotation={node.rotation}
          opacity={node.opacity} scaleX={node.scaleX} scaleY={node.scaleY}
        >
          {node.children.map((c) => (
            <ArtNode key={c.id} node={c} />
          ))}
        </Group>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Imperative Konva builders for the offscreen print / mockup renders. */
/* ------------------------------------------------------------------ */

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = canvasImageSrc(src);
  });
}

async function buildKonvaNode(
  node: DesignNode,
): Promise<Konva.Group | Konva.Shape | null> {
  const base = {
    x: node.x, y: node.y, rotation: node.rotation,
    opacity: node.opacity, scaleX: node.scaleX, scaleY: node.scaleY,
  };
  switch (node.kind) {
    case "text": {
      const n = node as TextNode;
      if (n.curve) {
        const g = new Konva.Group(base);
        const { radius, spacingDeg } = n.curve;
        const chars = n.text.split("");
        const startAngle = -((chars.length - 1) * spacingDeg) / 2;
        chars.forEach((ch, i) => {
          const angle = startAngle + i * spacingDeg;
          const rad = (angle * Math.PI) / 180;
          g.add(new Konva.Text({
            x: radius * Math.sin(rad), y: -radius * Math.cos(rad),
            text: ch, fontSize: n.fontSize, fontFamily: n.fontFamily,
            fontStyle: n.fontStyle, fill: n.fill, rotation: angle,
            offsetX: n.fontSize / 4, listening: false,
          }));
        });
        return g;
      }
      return new Konva.Text({
        ...base, text: n.text, fontSize: n.fontSize, fontFamily: n.fontFamily,
        fontStyle: n.fontStyle, fill: n.fill, align: n.align, width: n.width,
        wrap: "word", lineHeight: n.lineHeight ?? 1.15, letterSpacing: n.letterSpacing ?? 0,
      });
    }
    case "rect": {
      const n = node as RectNode;
      return new Konva.Rect({
        ...base, width: n.width, height: n.height, fill: n.fill,
        stroke: n.stroke, strokeWidth: n.strokeWidth, cornerRadius: n.cornerRadius,
      });
    }
    case "circle": {
      const n = node as CircleNode;
      return new Konva.Circle({
        ...base, radius: n.radius, fill: n.fill, stroke: n.stroke, strokeWidth: n.strokeWidth,
      });
    }
    case "image": {
      const n = node as ImageNode;
      const img = await loadImg(n.src);
      if (!img) return null;
      return new Konva.Image({
        ...base, image: img, width: n.width, height: n.height,
        ...(n.crop ? { crop: n.crop } : {}),
      });
    }
    case "line": {
      const n = node as LineNode;
      return new Konva.Line({
        ...base, points: n.points, stroke: n.stroke, strokeWidth: n.strokeWidth,
        tension: n.tension ?? 0, lineCap: "round", lineJoin: "round",
      });
    }
    case "group": {
      const g = new Konva.Group(base);
      for (const child of node.children) {
        const built = await buildKonvaNode(child);
        if (built) g.add(built);
      }
      return g;
    }
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* The panel.                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  data: PdpCustomizerData;
  productId: string;
  title: string;
  media: { url: string; alt: string | null }[];
  variants: PdpVariant[];
  qty: number;
  sizeLabel: string | null;
  colorLabel: string | null;
  onToast: (msg: string) => void;
}

export default function PdpCustomizer({
  data,
  title,
  media,
  variants,
  qty,
  sizeLabel,
  colorLabel,
  onToast,
}: Props) {
  const setStoreSize = useStore((s) => s.setSize);
  const storeAddToBag = useStore((s) => s.addToBag);

  const trim = data.trim;
  const cx = trim.x + trim.width / 2;
  const cy = trim.y + trim.height / 2;

  const [artworkId, setArtworkId] = useState<string>(
    () => data.artworks.find((a) => a.isOwn)?.id ?? data.artworks[0]?.id ?? "",
  );
  const artwork = data.artworks.find((a) => a.id === artworkId) ?? data.artworks[0];
  const nodes = useMemo(
    () => (artwork?.frontNodes ?? []) as unknown as DesignNode[],
    [artwork],
  );

  const [multiplier, setMultiplier] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [mockupIdx, setMockupIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [, setFontTick] = useState(0);
  const groupRef = useRef<Konva.Group | null>(null);

  /* Responsive stage: the design space stays 420×500 (the studio's),
   * the Stage element fits the card and Konva scales the scene —
   * the same zoom mechanism the studio canvas uses. (CSS-stretching
   * the canvas instead collapses its height to 0.) */
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [boxW, setBoxW] = useState(420);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth || 420));
    ro.observe(el);
    setBoxW(el.clientWidth || 420);
    return () => ro.disconnect();
  }, []);
  const stageScale = boxW / STAGE_W;

  /* Variant dimensions — cross-filtered like a real configurator. */
  const allSizes = useMemo(
    () => [...new Set(variants.map((v) => v.size).filter(Boolean))] as string[],
    [variants],
  );
  const allColors = useMemo(
    () => [...new Set(variants.map((v) => v.color).filter(Boolean))] as string[],
    [variants],
  );
  const [size, setSize] = useState<string | null>(
    () => (sizeLabel && allSizes.includes(sizeLabel) ? sizeLabel : allSizes[0] ?? null),
  );
  const [color, setColor] = useState<string | null>(() => {
    if (colorLabel && allColors.includes(colorLabel)) return colorLabel;
    // Prefer the color the design itself was made on, when it maps.
    const own = data.artworks.find((a) => a.isOwn) ?? data.artworks[0];
    if (own?.garmentColor) {
      const match = allColors.find(
        (c) => colorNameToHex(c).toLowerCase() === own.garmentColor!.toLowerCase(),
      );
      if (match) return match;
    }
    return allColors[0] ?? null;
  });

  const sizesForColor = useMemo(
    () =>
      color
        ? [...new Set(variants.filter((v) => v.color === color).map((v) => v.size).filter(Boolean))] as string[]
        : allSizes,
    [variants, color, allSizes],
  );
  const variant = useMemo(
    () =>
      variants.find((v) => (v.size ?? null) === size && (v.color ?? null) === color) ??
      variants.find((v) => (v.color ?? null) === color && (v.size ?? null) === (sizesForColor[0] ?? null)) ??
      variants.find((v) => (v.color ?? null) === color) ??
      variants.find((v) => (v.size ?? null) === size) ??
      variants[0] ??
      null,
    [variants, size, color, sizesForColor],
  );

  const pickColor = (c: string) => {
    setColor(c);
    const available = [...new Set(variants.filter((v) => v.color === c).map((v) => v.size).filter(Boolean))] as string[];
    if (size && available.length && !available.includes(size)) setSize(available[0]);
  };

  /* Load the artwork's fonts so canvas text renders true. */
  useEffect(() => {
    let live = true;
    (async () => {
      const families = new Set<string>();
      const walk = (list: DesignNode[]) => {
        for (const n of list) {
          if (n.kind === "text") families.add(n.fontFamily);
          if (n.kind === "group") walk(n.children);
        }
      };
      walk(nodes);
      await Promise.all([...families].map((f) => loadGoogleFont(f)));
      if (live) setFontTick((t) => t + 1);
    })();
    return () => {
      live = false;
    };
  }, [nodes]);

  const nudge = (dx: number, dy: number) =>
    setOffset((o) => ({
      x: Math.max(-trim.width, Math.min(trim.width, o.x + dx)),
      y: Math.max(-trim.height, Math.min(trim.height, o.y + dy)),
    }));

  /* ---- Offscreen renders for the save ---- */
  const renderArtworkGroup = useCallback(
    async (target: Konva.Group) => {
      for (const n of nodes) {
        const built = await buildKonvaNode(n);
        if (built) target.add(built);
      }
    },
    [nodes],
  );

  const renderPrintPng = useCallback(async (): Promise<string | null> => {
    const container = document.createElement("div");
    container.style.cssText = "position:absolute;left:-10000px;top:0;visibility:hidden;";
    document.body.appendChild(container);
    const stage = new Konva.Stage({ container, width: trim.width, height: trim.height });
    try {
      const layer = new Konva.Layer();
      stage.add(layer);
      const group = new Konva.Group({
        x: cx + offset.x - trim.x,
        y: cy + offset.y - trim.y,
        offsetX: cx,
        offsetY: cy,
        scaleX: multiplier,
        scaleY: multiplier,
      });
      layer.add(group);
      await renderArtworkGroup(group);
      layer.draw();
      return layer.toDataURL({
        mimeType: "image/png",
        pixelRatio: data.spec.widthPx / trim.width,
      });
    } finally {
      stage.destroy();
      container.remove();
    }
  }, [trim, cx, cy, offset, multiplier, data.spec.widthPx, renderArtworkGroup]);

  const renderMockupJpeg = useCallback(async (): Promise<string | null> => {
    const photoUrl = media[mockupIdx]?.url ?? media[0]?.url;
    if (!photoUrl) return null;
    const photo = await loadImg(photoUrl);
    if (!photo) return null;
    const container = document.createElement("div");
    container.style.cssText = "position:absolute;left:-10000px;top:0;visibility:hidden;";
    document.body.appendChild(container);
    const stage = new Konva.Stage({ container, width: STAGE_W, height: STAGE_H });
    try {
      const layer = new Konva.Layer();
      stage.add(layer);
      const scale = Math.min(STAGE_W / photo.width, STAGE_H / photo.height);
      // White ground first: the photo is contain-fit, and a JPEG
      // export turns the uncovered stage margins BLACK without it.
      // Product-image surfaces are white — the mockup is too.
      layer.add(
        new Konva.Rect({ x: 0, y: 0, width: STAGE_W, height: STAGE_H, fill: "#ffffff" }),
      );
      layer.add(
        new Konva.Image({
          image: photo,
          width: photo.width * scale,
          height: photo.height * scale,
          x: (STAGE_W - photo.width * scale) / 2,
          y: (STAGE_H - photo.height * scale) / 2,
        }),
      );
      const group = new Konva.Group({
        x: cx + offset.x,
        y: cy + offset.y,
        offsetX: cx,
        offsetY: cy,
        scaleX: multiplier,
        scaleY: multiplier,
      });
      layer.add(group);
      // In the composite, image artwork weaves into the garment.
      await renderArtworkGroup(group);
      group.getChildren().forEach((child) => {
        if (child instanceof Konva.Image) child.globalCompositeOperation("multiply");
      });
      layer.draw();
      return stage.toDataURL({ mimeType: "image/jpeg", quality: 0.9, pixelRatio: 1.5 });
    } finally {
      stage.destroy();
      container.remove();
    }
  }, [media, mockupIdx, cx, cy, offset, multiplier, renderArtworkGroup]);

  const handleAdd = async () => {
    if (!artwork || !variant) {
      setStatus("Choose an artwork and a variant first.");
      return;
    }
    setBusy(true);
    setStatus("Saving your design…");
    try {
      const [printPng, mockupJpeg] = await Promise.all([
        renderPrintPng().catch(() => null),
        renderMockupJpeg().catch(() => null),
      ]);
      const customerId = await fetchCurrentCustomerId().catch(() => null);
      const res = await fetch("/api/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_design_id: artwork.id,
          supplier_catalog_variant_id: variant.id,
          multiplier,
          offset_x: Math.round(offset.x),
          offset_y: Math.round(offset.y),
          print_file_data_url: printPng ?? undefined,
          mockup_data_url: mockupJpeg ?? undefined,
          customer_id: customerId ?? undefined,
        }),
      });
      const saved = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(saved.error || "Could not save your design.");
      const n = Math.max(1, Math.min(99, qty));
      await addToCart({
        customerId,
        supplier_catalog_variant_id: variant.id,
        design_publication_id: saved.design_publication_id,
        quantity: n,
      });
      setStoreSize(size ?? color ?? "One size");
      for (let i = 0; i < n; i++) storeAddToBag();
      setStatus("Saved — your custom design is in the bag.");
      onToast(`Added ${n > 1 ? `${n} × ` : ""}${title} — custom design ✓`);
    } catch (e: any) {
      setStatus(e?.message || "Something went wrong saving your design — your choices are still here.");
    } finally {
      setBusy(false);
    }
  };

  if (!artwork) return null;
  const baseCost = variant?.price ?? null;
  const photo = media[mockupIdx]?.url ?? media[0]?.url ?? null;
  const zone = {
    left: `${(trim.x / STAGE_W) * 100}%`,
    top: `${(trim.y / STAGE_H) * 100}%`,
    width: `${(trim.width / STAGE_W) * 100}%`,
    height: `${(trim.height / STAGE_H) * 100}%`,
  };

  return (
    <section className="customizer" aria-label="Customize this design">
      <div className="cz-head">
        <h2>Make it yours</h2>
        <p>Pick an artwork, size it, place it — we print exactly what you see.</p>
      </div>

      {/* Mockup preview — photo + live Konva artwork + print-area guide */}
      <div className="cz-stage">
        {photo ? (
          <img className="cz-photo" src={photo} alt={title} referrerPolicy="no-referrer" />
        ) : (
          <div className="cz-photo cz-photo-empty" aria-hidden="true" />
        )}
        <div className="cz-konva" ref={wrapRef}>
          <Stage
            width={boxW}
            height={Math.round(STAGE_H * stageScale)}
            scaleX={stageScale}
            scaleY={stageScale}
          >
            <Layer>
              <Group
                ref={groupRef}
                x={cx + offset.x}
                y={cy + offset.y}
                offsetX={cx}
                offsetY={cy}
                scaleX={multiplier}
                scaleY={multiplier}
                draggable
                onDragMove={(e) => {
                  setOffset({
                    x: Math.round(e.target.x() - cx),
                    y: Math.round(e.target.y() - cy),
                  });
                }}
                onDragEnd={(e) => {
                  setOffset({
                    x: Math.round(e.target.x() - cx),
                    y: Math.round(e.target.y() - cy),
                  });
                }}
              >
                {nodes.map((n) => (
                  <ArtNode key={n.id} node={n} />
                ))}
              </Group>
            </Layer>
          </Stage>
        </div>
        <div className="cz-zone" style={zone} aria-hidden="true">
          <span>Print Area</span>
        </div>
        <span className="cz-product-chip">
          <i aria-hidden="true" /> {title}
        </span>
      </div>

      {/* Live stats — the reference's signature row */}
      <div className="cz-stats">
        <div>
          <span>Artwork Scale</span>
          <strong>{Math.round(multiplier * 100)}%</strong>
        </div>
        <div>
          <span>Position Offset</span>
          <strong>
            {Math.round(offset.x)}, {Math.round(offset.y)}
          </strong>
        </div>
        <div>
          <span>Base Cost</span>
          <strong className="cz-cost">{baseCost != null ? money(baseCost) : "—"}</strong>
        </div>
      </div>

      {/* Mockup + size selectors */}
      <div className="cz-row2">
        <div className="cz-field">
          <label htmlFor="cz-mockup">Select Product Mockup</label>
          <select
            id="cz-mockup"
            value={mockupIdx}
            onChange={(e) => setMockupIdx(Number(e.target.value))}
          >
            {media.map((m, i) => (
              <option key={`${m.url}-${i}`} value={i}>
                {i === 0 ? title : `${title} — view ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
        {allSizes.length > 0 && (
          <div className="cz-field">
            <label htmlFor="cz-size">Size</label>
            <select
              id="cz-size"
              value={size ?? ""}
              onChange={(e) => setSize(e.target.value)}
            >
              {(sizesForColor.length ? sizesForColor : allSizes).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Artwork chips */}
      <div className="cz-field">
        <label>Artwork Graphic Design</label>
        <div className="cz-chips" role="radiogroup" aria-label="Artwork graphic design">
          {data.artworks.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={a.id === artwork.id}
              className={`cz-chip ${a.id === artwork.id ? "active" : ""}`}
              onClick={() => setArtworkId(a.id)}
            >
              {a.name.replace(/\s+—\s+seed$/i, "")}
            </button>
          ))}
        </div>
      </div>

      {/* Size tuning slider */}
      <div className="cz-field">
        <label htmlFor="cz-scale">Artwork Size Tuning</label>
        <div className="cz-slider-row">
          <input
            id="cz-scale"
            type="range"
            min={40}
            max={200}
            step={1}
            value={Math.round(multiplier * 100)}
            onChange={(e) => setMultiplier(Number(e.target.value) / 100)}
            aria-label="Artwork size tuning"
          />
          <span className="cz-mult">Multiplier: {multiplier.toFixed(2)}x</span>
        </div>
      </div>

      {/* Position nudges */}
      <div className="cz-field">
        <label>Position — drag the artwork, or nudge it</label>
        <div className="cz-nudge">
          <button type="button" onClick={() => nudge(-4, 0)} aria-label="Move artwork left">←</button>
          <button type="button" onClick={() => nudge(0, -4)} aria-label="Move artwork up">↑</button>
          <button type="button" onClick={() => nudge(0, 4)} aria-label="Move artwork down">↓</button>
          <button type="button" onClick={() => nudge(4, 0)} aria-label="Move artwork right">→</button>
          <button
            type="button"
            className="cz-reset"
            onClick={() => {
              setOffset({ x: 0, y: 0 });
              setMultiplier(1);
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Base variant color swatches */}
      {allColors.length > 0 && (
        <div className="cz-colors">
          <span>Product Base Variant Color:</span>
          <div className="cz-swatches">
            {allColors.map((c) => (
              <button
                key={c}
                type="button"
                className={`cz-swatch ${c === color ? "active" : ""}`}
                style={{ background: colorNameToHex(c) }}
                aria-label={`Color ${c}`}
                aria-pressed={c === color}
                title={c}
                onClick={() => pickColor(c)}
              />
            ))}
          </div>
        </div>
      )}
      {color && <p className="cz-colorname">{color}{size ? ` · ${size}` : ""}</p>}

      <button type="button" className="cz-add" onClick={handleAdd} disabled={busy || !variant}>
        {busy
          ? "Saving your design…"
          : `Add to bag — custom design${baseCost != null ? ` · ${money(baseCost * Math.max(1, qty))}` : ""}`}
      </button>
      <p className="cz-status" aria-live="polite">
        {status}
      </p>
      <p className="cz-note">
        Your placement is saved with the order and printed as shown. Customizing never
        changes the price — the base cost above is the full cost.
      </p>
    </section>
  );
}
