"use client";

/**
 * Fabric Design Studio — product-first, fully wired.
 *
 * The chain this file closes (previously broken at every link):
 *   1. PRODUCT FIRST — pick a real supplier catalog product; the editor
 *      loads ITS template: print spec (px @ DPI), bleed/trim/safe zones,
 *      supplier mockup photo, variant colors.
 *   2. DESIGN — Konva canvas with per-surface (Front/Back) node state.
 *   3. SAVE + REOPEN — designs persist the v2 canvas_state plus the
 *      product setup; Open project reloads everything.
 *   4. FILES — print exports (stage.toDataURL pixelRatio 3), mockups,
 *      uploaded artwork and Pollinations inspiration all persist to
 *      Supabase Storage via /api/admin/designs/[id]/files.
 *   5. REVIEW → APPROVE → PUBLISH — preflight-gated lifecycle; publish
 *      creates the storefront product with mapped variants and design
 *      publications.
 *   6. POST-PROCESS — Fabric.js panel (separate canvas, never overlaid)
 *      for SVG → print-file conversion.
 */

import { canvasImageSrc } from "@/lib/image-proxy";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "./studio-fabric.css";
import {
  boxSpillsArea,
  CanvasEditor,
  computeStageLayout,
  designNodeStageBox,
  firstCapturedStageColorName,
  stageSpecForSide,
  type CanvasEditorHandle,
} from "./canvas-editor";
import { PictureInPicture2 } from "lucide-react";
import { useStudioWindow } from "./studio-window";
import GangSheetEditor, { GANG_SIZES, type GangSheetHandle } from "./gang-sheet";
import { CanvasBottomRailControls } from "./canvas-bottom-rail";
import {
  defaultImageNode,
  defaultRectNode,
  defaultTextNode,
  FONT_FAMILY_OPTIONS,
  loadGoogleFont,
  nextId,
  type ArrowNode,
  type DesignNode,
  type GroupNode,
  type ImageNode,
  type LineNode,
} from "@/lib/admin/design-node";
import { nodesToSvg } from "@/lib/fabric/svg-export";
import { buildMultiPagePdf, buildPrintPdf, type BookPdfPage } from "@/lib/fabric/pdf";
import { extractPdfPageImage } from "@/lib/fabric/pdf-extract";
import { eraseFromLines } from "@/lib/fabric/erase";
import { getProductTemplate, type ProductType } from "@/lib/admin/product-templates";
import { THEMES } from "@/lib/admin/studio-themes";
import {
  auditDesign,
  nodeCanvasSize,
  TARGET_DPI,
  type DesignAudit,
} from "@/lib/fabric/dpi";
import type { ProductStage } from "@/lib/fabric/product-stage";
import {
  classifyKind,
  colorNameToHex,
  type ResolvedTemplate,
  type Surface,
} from "@/lib/fabric/templates";
import { KIND_TO_PRODUCT_TYPE_FALLBACK } from "@/lib/fabric/catalog-shared";
import { nodeBounds } from "@/lib/fabric/preflight";
import type {
  AnnotationState,
  BookState,
  CanvasStateV2,
  GangItem,
  GangSheet,
  SketchBoard,
} from "@/lib/fabric/preflight";

const PostProcessor = dynamic(() => import("./post-processor"), {
  ssr: false,
  loading: () => <p className="small-muted">Loading post-processor…</p>,
});

/* Theme data lives in @/lib/admin/studio-themes — the catalogue
   copied verbatim from the owner's prototype. The theme grid imports
   THEMES from there; a theme click generates through Pollinations. */

const AI_PRESETS = [
  "Screen-print graphic",
  "Minimal line art",
  "Vintage tee",
  "Sticker style",
  "Portrait",
  "Mug graphic",
  "Embroidery concept",
];

/* Drag-and-drop payload type for catalog product cards dragged onto
 * the canvas. Carries ONLY the catalog product id; the drop resolves
 * the full list item from catalogResults and binds it through the
 * exact same chooseCatalogProduct path a click uses. The custom type
 * also lets the canvas tell a product drag apart from layer-reorder
 * drags and stray file/text drags (only `types` is readable during
 * dragover — the payload itself is protected until drop). */
const CATALOG_PRODUCT_DND_TYPE = "application/x-unsaid-catalog-product-id";
const STUDIO_IMAGE_DND_TYPE = "application/x-unsaid-studio-image";

interface CatalogListItem {
  id: string;
  name: string;
  supplier_name: string | null;
  supplier_slug: string | null;
  image_url: string | null;
  variant_count: number | null;
  category_path: string[];
  kind: string;
  productType: ProductType | null;
  minPrice: number | null;
  colors: string[];
}

/** One category card in the picker's three-level card browser. */
interface BrowseCard {
  id: string;
  name: string;
  slug: string;
  count: number;
  hasChildren: boolean;
}

interface CatalogDetail {
  product: {
    id: string;
    name: string;
    supplier_name: string | null;
    supplier_slug: string | null;
    category_id: string | null;
    category_name: string | null;
    image_url: string | null;
  };
  variants: {
    id: string;
    external_id: string;
    size: string | null;
    color: string | null;
    price_snapshot: number | null;
  }[];
  template: ResolvedTemplate;
}

interface DesignListItem {
  id: string;
  name: string;
  status: string;
  product_title: string | null;
  supplier_catalog_product_id: string | null;
  updated_at: string;
}

interface AssetItem {
  id: string;
  kind: string;
  surface: string | null;
  storage_path: string;
  bucket: string;
  prompt: string | null;
  provider: string | null;
}

interface FlatCategory {
  id: string;
  name: string;
  depth: number;
}

function flattenCategories(raw: any, depth = 0, out: FlatCategory[] = []): FlatCategory[] {
  if (!raw) return out;
  if (Array.isArray(raw)) {
    for (const n of raw) flattenCategories(n, depth, out);
    return out;
  }
  if (typeof raw === "object") {
    if (raw.id && raw.name) out.push({ id: raw.id, name: raw.name, depth });
    const kids = raw.children ?? raw.subcategories ?? null;
    if (Array.isArray(kids)) for (const k of kids) flattenCategories(k, depth + 1, out);
    if (!raw.id && !raw.name) {
      for (const v of Object.values(raw)) flattenCategories(v, depth, out);
    }
  }
  return out;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  needs_review: "In review",
  ready_to_publish: "Ready to publish",
  published: "Published",
  publish_failed: "Publish failed",
  archived: "Archived",
};

/* Blank-page geometry for the non-product workspace modes (module
 * scope: pure helpers shared by callbacks and render). */
const SKETCH_RECT = { x: 10, y: 10, width: 400, height: 480 };

/** Product picker page size (the catalog API returns total + offset pages). */
const CATALOG_PAGE_SIZE = 18;
/** Book trim presets (inches) — the code-level book archetype: a page
 *  size plus the shared node model; the print spec is trim x 300 DPI. */
const BOOK_TRIMS: Array<{ label: string; w: number; h: number }> = [
  { label: "8.5\u2033 \u00d7 11\u2033 \u2014 letter / contractor's book", w: 8.5, h: 11 },
  { label: "6\u2033 \u00d7 9\u2033 \u2014 paperback", w: 6, h: 9 },
  { label: "8\u2033 \u00d7 10\u2033 \u2014 keepsake book", w: 8, h: 10 },
  { label: "11\u2033 \u00d7 8.5\u2033 \u2014 landscape", w: 11, h: 8.5 },
];
function fitPageRect(wIn: number, hIn: number) {
  const s = Math.min(380 / Math.max(0.1, wIn), 440 / Math.max(0.1, hIn));
  const w = Math.round(wIn * s);
  const h = Math.round(hIn * s);
  return { x: Math.round((420 - w) / 2), y: Math.round((500 - h) / 2), width: w, height: h };
}

export default function DesignStudio() {
  /* ---- Design identity + lifecycle ---- */
  const [designId, setDesignId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [designStatus, setDesignStatus] = useState<string>("draft");
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  /* ---- Canvas state (per surface) ---- */
  const [sides, setSides] = useState<Record<Surface, DesignNode[]>>({ Front: [], Back: [] });
  const [side, setSide] = useState<Surface>("Front");

  /* ---- Workspace modes + additive canvas-state extensions ----
   * The studio edits one ACTIVE node list at a time: the product
   * surface, a sketch board, a book page, or the annotation board.
   * editorNodes / replaceEditorNodes (below) route every canvas
   * operation to the active list; the product surfaces behave
   * exactly as they always have. All of this rides the design's
   * canvas_state JSON — no new tables, no migration. */
  const [mode, setMode] = useState<"product" | "sketch" | "gang" | "book" | "annotate">("product");
  const [boards, setBoards] = useState<SketchBoard[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [gangSheets, setGangSheets] = useState<GangSheet[]>([]);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  const [book, setBook] = useState<BookState | null>(null);
  const [activePageIdx, setActivePageIdx] = useState(0);
  const [annotation, setAnnotation] = useState<AnnotationState | null>(null);
  const gangRef = useRef<GangSheetHandle | null>(null);
  const [gangSel, setGangSel] = useState<string | null>(null);
  const [gangBusy, setGangBusy] = useState(false);
  const [gangInfo, setGangInfo] = useState<string | null>(null);
  const [productRender, setProductRender] = useState<string | null>(null);
  const [bookBusy, setBookBusy] = useState(false);
  const [annotateBusy, setAnnotateBusy] = useState(false);
  const [annotateInfo, setAnnotateInfo] = useState<string | null>(null);
  const [bookInfo, setBookInfo] = useState<string | null>(null);
  /* Sketch → AI delivery state. */
  const [sketchPrompt, setSketchPrompt] = useState("");
  const [sketchBusy, setSketchBusy] = useState(false);
  const [sketchResult, setSketchResult] = useState<{
    imageUrl: string;
    mode: string;
    sketchImageUrl: string | null;
  } | null>(null);

  /* Undo/redo history (state-snapshot pattern): every committed
   * change to the whole document JSON (surfaces + workspace
   * extensions) pushes the previous snapshot; undo/redo swap
   * snapshots without re-recording. Cap 30, per the reference
   * StudioHistoryManager depth. */
  const docJson = JSON.stringify({
    sides,
    boards,
    gangSheets,
    book,
    annotations: annotation,
  });
  const historyRef = useRef<{ undo: string[]; redo: string[] }>({ undo: [], redo: [] });
  const lastSidesRef = useRef<string>("");
  const applyingHistoryRef = useRef(false);
  const [historyDepth, setHistoryDepth] = useState({ undo: 0, redo: 0 });
  useEffect(() => {
    lastSidesRef.current = docJson;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const current = docJson;
    if (applyingHistoryRef.current) {
      applyingHistoryRef.current = false;
      lastSidesRef.current = current;
      return;
    }
    const prev = lastSidesRef.current;
    if (prev && prev !== current) {
      const h = historyRef.current;
      h.undo.push(prev);
      if (h.undo.length > 30) h.undo.shift();
      h.redo = [];
      setHistoryDepth({ undo: h.undo.length, redo: 0 });
    }
    lastSidesRef.current = current;
  }, [docJson]);
  const applyHistorySnapshot = useCallback((json: string) => {
    applyingHistoryRef.current = true;
    lastSidesRef.current = json;
    const parsed = JSON.parse(json) as {
      sides?: Record<Surface, DesignNode[]>;
      boards?: SketchBoard[];
      gangSheets?: GangSheet[];
      book?: BookState | null;
      annotations?: AnnotationState | null;
    };
    // Snapshots taken before the workspace extensions existed were
    // bare `sides` objects — treat those as sides-only restores.
    if (parsed && typeof parsed === "object" && "sides" in parsed) {
      setSides(parsed.sides as Record<Surface, DesignNode[]>);
      setBoards(parsed.boards ?? []);
      // A snapshot can restore a boards array that no longer contains
      // the active board (or none at all) — reconcile, or the sketch
      // panel's Deliver block silently vanishes with no active board.
      setActiveBoardId((prev) => {
        const restored = parsed.boards ?? [];
        return prev && restored.some((b) => b.id === prev)
          ? prev
          : (restored[0]?.id ?? null);
      });
      setGangSheets(parsed.gangSheets ?? []);
      setBook(parsed.book ?? null);
      setAnnotation(parsed.annotations ?? null);
    } else {
      setSides(parsed as unknown as Record<Surface, DesignNode[]>);
    }
    setSelectedId(null);
    markDirty();
  }, []);
  const undo = useCallback(() => {
    const h = historyRef.current;
    const prev = h.undo.pop();
    if (!prev) return;
    h.redo.push(docJson);
    setHistoryDepth({ undo: h.undo.length, redo: h.redo.length });
    applyHistorySnapshot(prev);
  }, [docJson, applyHistorySnapshot]);
  const redo = useCallback(() => {
    const h = historyRef.current;
    const next = h.redo.pop();
    if (!next) return;
    h.undo.push(docJson);
    setHistoryDepth({ undo: h.undo.length, redo: h.redo.length });
    applyHistorySnapshot(next);
  }, [docJson, applyHistorySnapshot]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<"select" | "draw" | "erase" | "line" | "arrow">("select");
  const [eraseRadius, setEraseRadius] = useState(14);
  const [drawStroke, setDrawStroke] = useState({ stroke: "#202126", strokeWidth: 4 });
  const [multiIds, setMultiIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  // Bottom rail (owner's reference image, 2026-10-30): Pan Canvas mode
  // and the editor's live total zoom for the rail's % readout.
  const [isPanActive, setIsPanActive] = useState(false);
  const [liveZoom, setLiveZoom] = useState(1);
  const [textEditId, setTextEditId] = useState<string | null>(null);
  const nodes = sides[side];

  /* ---- Product + template ---- */
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogResults, setCatalogResults] = useState<CatalogListItem[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogBusy, setCatalogBusy] = useState(false);
  /* Three-level card browser (mirrors the marketplace): category cards →
   * subcategory cards → product cards. browsePath is the drilled-in
   * category chain; browseProductsFor pins the product list to one
   * category (a leaf card, or "all products in" a parent). Typing in the
   * search box overlays flat product results on top of the browser. */
  const [browsePath, setBrowsePath] = useState<{ id: string; name: string }[]>([]);
  const [browseCards, setBrowseCards] = useState<BrowseCard[]>([]);
  const [browseParentCount, setBrowseParentCount] = useState(0);
  const [browseBusy, setBrowseBusy] = useState(true);
  const [browseProductsFor, setBrowseProductsFor] = useState<{ id: string; name: string } | null>(null);
  const searching = catalogQuery.trim().length > 0;
  const [catalogDetail, setCatalogDetail] = useState<CatalogDetail | null>(null);
  /* Product drag-onto-canvas: true while a catalog product drag is
   * over the canvas area (drives the visible drop affordance).
   * catalogDragDepthRef counts nested dragenter/dragleave pairs from
   * the canvas area's children so the affordance does not flicker as
   * the drag crosses the frame, rail, and tip pill inside it. */
  const [catalogDropOver, setCatalogDropOver] = useState(false);
  const catalogDragDepthRef = useRef(0);
  // CP2: the bound product's captured supplier stage (specs + mockup
  // templates) from GET /api/admin/studio/product-stage. null = no
  // captured stage — the editor then behaves exactly as before.
  const [productStage, setProductStage] = useState<ProductStage | null>(null);
  const loadProductStage = useCallback(
    async (catalogProductId: string): Promise<ProductStage | null> => {
      try {
        const res = await fetch(
          `/api/admin/studio/product-stage?catalogProductId=${encodeURIComponent(catalogProductId)}`,
        );
        if (!res.ok) throw new Error("no-stage");
        const stage = (await res.json()) as ProductStage;
        setProductStage(stage);
        return stage;
      } catch {
        // 404 (no capture for this product) or a network hiccup: the
        // plain stage, zero visible disruption.
        setProductStage(null);
        return null;
      }
    },
    [],
  );
  const [productType, setProductType] = useState<ProductType>("Classic Tee");
  const [garmentColor, setGarmentColor] = useState("#ffffff");
  const [garmentColorName, setGarmentColorName] = useState<string | null>(null);

  /* ---- Product setup (controlled — saved with the design) ---- */
  const [projectName, setProjectName] = useState("Untitled project");
  const [productTitle, setProductTitle] = useState("");
  const [retailPrice, setRetailPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [categories, setCategories] = useState<FlatCategory[]>([]);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);

  /* ---- Library / AI / review ---- */
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPreset, setAiPreset] = useState(AI_PRESETS[0]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPreview, setAiPreview] = useState<{ url: string; prompt: string } | null>(null);
  const [aiAppliedNote, setAiAppliedNote] = useState<string | null>(null);
  const [aiRatio, setAiRatio] = useState<"1:1" | "4:5" | "3:2">("1:1");
  const [collectionLock, setCollectionLock] = useState<{ lockedSupplier: string; ownSupplier: string } | null>(null);
  const [dragLayerId, setDragLayerId] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<{ ok: boolean; errors: any[]; warnings: any[] } | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  /* Publish wizard launch state (Defect B fix): a launch that cannot
   * happen must say why, in plain words that STAY on screen next to
   * the launch buttons — never a silently inert button, and not only
   * a toast that disappears in seconds. */
  const [publishLaunchBusy, setPublishLaunchBusy] = useState(false);
  const [publishLaunchError, setPublishLaunchError] = useState<string | null>(null);
  const [showOpen, setShowOpen] = useState(false);
  const [designList, setDesignList] = useState<DesignListItem[]>([]);
  const [showPost, setShowPost] = useState(false);

  /* ---- Theme settings box (owner order 2026-10-30) ----
   * Drafts live here, per theme, so switching themes inside the box
   * never loses typing. Baselines (…Base) hold the last loaded/saved
   * values; Save only PUTs what actually changed. */
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  const [tsLoaded, setTsLoaded] = useState(false);
  const [tsLoading, setTsLoading] = useState(false);
  const [tsLoadError, setTsLoadError] = useState<string | null>(null);
  const [tsBrand, setTsBrand] = useState({ brandSummary: "", brandColors: "", brandVoice: "", promptGuidance: "" });
  const [tsBrandBase, setTsBrandBase] = useState({ brandSummary: "", brandColors: "", brandVoice: "", promptGuidance: "" });
  const [tsThemeName, setTsThemeName] = useState(THEMES[0]?.name ?? "");
  const [tsPrompts, setTsPrompts] = useState<Record<string, string>>({});
  const [tsPromptsBase, setTsPromptsBase] = useState<Record<string, string>>({});
  const [tsSaving, setTsSaving] = useState(false);
  const [tsSaveError, setTsSaveError] = useState<string | null>(null);
  const [tsSavedNote, setTsSavedNote] = useState<string | null>(null);

  /* ---- UI state ---- */
  const [leftTab, setLeftTab] = useState<"designs" | "text">("designs");
  const [rightTab, setRightTab] = useState<"design" | "product" | "review">("design");
  const [themeSearch, setThemeSearch] = useState("");
  const [selectedTheme, setSelectedTheme] = useState("Trending Now");
  const [saveStatus, setSaveStatus] = useState("New design — pick a product to begin");
  const [toastMsg, setToastMsg] = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  const studioWindow = useStudioWindow();

  const editorRef = useRef<CanvasEditorHandle>(null);
  const templateMeta = catalogDetail?.template ?? null;

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2600);
  }, []);

  const markDirty = useCallback(() => setSaveStatus("Unsaved changes"), []);

  /* ---- Theme settings: load + save (API: /api/admin/studio/theme-settings) ---- */
  const loadThemeSettings = useCallback(async () => {
    setTsLoading(true);
    setTsLoadError(null);
    try {
      const res = await fetch("/api/admin/studio/theme-settings");
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        brand?: { brandSummary?: string | null; brandColors?: string | null; brandVoice?: string | null; promptGuidance?: string | null } | null;
        themes?: Record<string, string>;
      };
      if (!res.ok) throw new Error(data.error ?? `Could not load your settings (${res.status}).`);
      const brand = {
        brandSummary: data.brand?.brandSummary ?? "",
        brandColors: data.brand?.brandColors ?? "",
        brandVoice: data.brand?.brandVoice ?? "",
        promptGuidance: data.brand?.promptGuidance ?? "",
      };
      const prompts: Record<string, string> = {};
      for (const t of THEMES) prompts[t.name] = data.themes?.[t.name] ?? "";
      setTsBrand(brand);
      setTsBrandBase(brand);
      setTsPrompts(prompts);
      setTsPromptsBase(prompts);
      setTsLoaded(true);
    } catch (e) {
      setTsLoadError(e instanceof Error ? e.message : "Could not load your settings.");
    } finally {
      setTsLoading(false);
    }
  }, []);

  const openThemeSettings = useCallback(() => {
    setShowThemeSettings(true);
    setTsSaveError(null);
    setTsSavedNote(null);
    if (!tsLoaded) void loadThemeSettings();
  }, [tsLoaded, loadThemeSettings]);

  const saveThemeSettings = useCallback(async () => {
    setTsSaveError(null);
    setTsSavedNote(null);
    const brandChanged =
      tsBrand.brandSummary !== tsBrandBase.brandSummary ||
      tsBrand.brandColors !== tsBrandBase.brandColors ||
      tsBrand.brandVoice !== tsBrandBase.brandVoice ||
      tsBrand.promptGuidance !== tsBrandBase.promptGuidance;
    const changedThemes = THEMES.filter(
      (t) => (tsPrompts[t.name] ?? "") !== (tsPromptsBase[t.name] ?? ""),
    );
    if (!brandChanged && changedThemes.length === 0) {
      setTsSavedNote("No changes to save yet.");
      return;
    }
    setTsSaving(true);
    const put = async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/admin/studio/theme-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Save failed (${res.status}).`);
      }
    };
    try {
      if (brandChanged) {
        await put({ brand: { ...tsBrand } });
        setTsBrandBase({ ...tsBrand });
      }
      for (const t of changedThemes) {
        const draft = tsPrompts[t.name] ?? "";
        await put({ themeName: t.name, prompt: draft });
        setTsPromptsBase((prev) => ({ ...prev, [t.name]: draft }));
      }
      setTsSavedNote("Saved — the AI will use these the next time it paints.");
    } catch (e) {
      setTsSaveError(
        e instanceof Error
          ? e.message
          : "Something went wrong while saving. Your writing is still here — try saving again.",
      );
    } finally {
      setTsSaving(false);
    }
  }, [tsBrand, tsBrandBase, tsPrompts, tsPromptsBase]);

  /* ---- Active-list adapter ----
   * editorNodes is the node list the canvas + inspector + layers
   * panel operate on right now; replaceEditorNodes rewrites it.
   * In product mode both are exactly the surface list, so every
   * existing behaviour is preserved bit-for-bit. */
  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;
  const activeSheet = gangSheets.find((sh) => sh.id === activeSheetId) ?? gangSheets[0] ?? null;
  const activePage = book?.pages[Math.min(activePageIdx, (book?.pages.length ?? 1) - 1)] ?? null;
  const editorNodes: DesignNode[] =
    mode === "sketch"
      ? (activeBoard?.nodes ?? [])
      : mode === "book"
        ? (activePage?.nodes ?? [])
        : mode === "annotate"
          ? (annotation?.nodes ?? [])
          : sides[side];
  /* The adapter reads its routing from a ref so the function itself is
   * STABLE: several editing callbacks (addText, addShape, …) were
   * memoized before this adapter existed and capture the first
   * replaceEditorNodes they ever saw — with a stable, ref-routed
   * adapter those old closures still write to the surface the user is
   * looking at NOW, whichever mode that is. */
  const routeRef = useRef({ mode, side, activeBoardId, activePageIdx });
  routeRef.current = { mode, side, activeBoardId, activePageIdx };
  const replaceEditorNodes = useCallback(
    (updater: (prev: DesignNode[]) => DesignNode[]) => {
      const route = routeRef.current;
      if (route.mode === "sketch") {
        setBoards((prev) =>
          prev.map((b) => (b.id === route.activeBoardId ? { ...b, nodes: updater(b.nodes) } : b)),
        );
      } else if (route.mode === "book") {
        setBook((prev) =>
          prev
            ? {
                ...prev,
                pages: prev.pages.map((p, i) =>
                  i === route.activePageIdx ? { ...p, nodes: updater(p.nodes) } : p,
                ),
              }
            : prev,
        );
      } else if (route.mode === "annotate") {
        setAnnotation((prev) => (prev ? { ...prev, nodes: updater(prev.nodes) } : prev));
      } else {
        setSides((prev) => ({ ...prev, [route.side]: updater(prev[route.side]) }));
      }
    },
    [],
  );

  /* ---- Canvas callbacks ---- */
  const handleSelect = useCallback((id: string | null) => setSelectedId(id), []);

  /** A finished stroke (freehand, straight line, or arrow) becomes a layer. */
  const handleDrawComplete = useCallback(
    (node: LineNode | ArrowNode) => {
      replaceEditorNodes((prev) => [...prev, node]);
      setSelectedId(node.id);
      setTool("select");
      markDirty();
    },
    [replaceEditorNodes, markDirty],
  );

  /** One eraser pass: remove the swept points from the active list's
   *  stroke layers (the strokes re-split into the surviving parts).
   *  The tool stays active so several passes can be made in a row. */
  const handleEraseComplete = useCallback(
    (path: { x: number; y: number }[], radius: number) => {
      replaceEditorNodes((prev) => eraseFromLines(prev, path, radius).nodes);
      markDirty();
    },
    [replaceEditorNodes, markDirty],
  );

  /* ---- Workspace mode switching + sketch boards ---- */
  const addBoard = useCallback(
    (name?: string) => {
      const board: SketchBoard = {
        id: `board_${Date.now().toString(36)}`,
        name: name ?? `Sketch ${boards.length + 1}`,
        nodes: [],
      };
      setBoards((prev) => [...prev, board]);
      setActiveBoardId(board.id);
      setSelectedId(null);
      markDirty();
      return board;
    },
    [boards.length, markDirty],
  );

  const switchMode = useCallback(
    (m: typeof mode) => {
      setMode(m);
      setSelectedId(null);
      setMultiIds([]);
      if (m === "sketch") {
        if (boards.length === 0) addBoard("Sketch 1");
        else if (!boards.some((b) => b.id === activeBoardId)) {
          setActiveBoardId(boards[0].id);
        }
        setTool("draw");
      } else if (m === "book") {
        setBook((prev) => prev ?? {
          trimWIn: 8.5,
          trimHIn: 11,
          pages: [
            { id: nextId("page"), label: "Cover", nodes: [] },
            { id: nextId("page"), label: "Page 2", nodes: [] },
          ],
        });
        setActivePageIdx(0);
        setTool("select");
      } else if (m === "gang") {
        setGangSheets((prev) => {
          if (prev.length) return prev;
          const sh: GangSheet = { id: nextId("gang"), name: "Gang sheet 1", widthIn: 22, heightIn: 60, items: [] };
          setActiveSheetId(sh.id);
          return [sh];
        });
        // Stash a render of the product design so it can be placed on the sheet.
        if (mode === "product" && editorRef.current) {
          try {
            const url = editorRef.current.exportPNG(2);
            if (url) setProductRender(url);
          } catch { /* the sheet still works with vault art and uploads */ }
        }
        setTool("select");
      } else {
        setTool("select");
      }
    },
    [boards, activeBoardId, addBoard, gangSheets.length, mode],
  );

  /** Put the AI's painting on the product canvas as a normal layer. */
  const addAiResultToCanvas = useCallback(() => {
    if (!sketchResult) return;
    // Fit-first: the old 180×180 box spilled past a 160-wide
    // garment trim. Clamp to the active print area, centered.
    const area = templateMeta?.stage.trim ?? getProductTemplate(productType).printArea;
    const fit = Math.min(1, area.width / 180, area.height / 180);
    const w = Math.round(180 * fit);
    const h = Math.round(180 * fit);
    const node: DesignNode = {
      id: `img_${Date.now().toString(36)}`,
      kind: "image",
      name: "AI painting from sketch",
      x: Math.round(area.x + (area.width - w) / 2),
      y: Math.round(area.y + Math.min(24, Math.max(0, area.height - h))),
      width: w,
      height: h,
      src: sketchResult.imageUrl,
      rotation: 0,
      opacity: 1,
      scaleX: 1,
      scaleY: 1,
    } as DesignNode;
    // Deliberately bypasses the active-list adapter: the painting
    // belongs on the product surface, whichever mode is on screen.
    setSides((prev) => ({ ...prev, [side]: [...prev[side], node] }));
    setMode("product");
    setSelectedId(node.id);
    markDirty();
    toast("AI painting added to the product canvas");
  }, [sketchResult, templateMeta, productType, side, markDirty, toast]);

  /* ---- Gang sheets ---- */
  const patchSheet = useCallback((next: GangSheet) => {
    setGangSheets((prev) => prev.map((sh) => (sh.id === next.id ? next : sh)));
    markDirty();
  }, [markDirty]);

  const addGangItem = useCallback((src: string, name: string) => {
    if (!activeSheet) return;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const aspect = img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : 1;
      const wIn = Math.min(8, activeSheet.widthIn - 1);
      const idx = activeSheet.items.length;
      const item: GangItem = {
        id: nextId("gangitem"),
        src,
        name,
        xIn: 0.5 + (idx % 3) * 0.6,
        yIn: 0.5 + (idx % 5) * 0.6,
        wIn,
        aspect,
        rotation: 0,
      };
      patchSheet({ ...activeSheet, items: [...activeSheet.items, item] });
      setGangSel(item.id);
    };
    img.onerror = () => toast("That picture could not be loaded onto the sheet.");
    img.src = canvasImageSrc(src);
  }, [activeSheet, patchSheet, toast]);


  /** Group the shift-clicked layers into one group layer. Children
   *  keep their anchors relative to the group's origin (the topmost
   *  member's slot in the stack wins the group's z-position). */
  const groupSelected = useCallback(() => {
    const members = editorNodes.filter((n) => multiIds.includes(n.id));
    if (members.length < 2) return;
    const gx = Math.min(...members.map((m) => m.x));
    const gy = Math.min(...members.map((m) => m.y));
    const memberSet = new Set(members.map((m) => m.id));
    const groupNode: GroupNode = {
      id: `group_${Date.now().toString(36)}`,
      kind: "group",
      name: `Group · ${members.length} layers`,
      x: gx,
      y: gy,
      rotation: 0,
      opacity: 1,
      scaleX: 1,
      scaleY: 1,
      children: members.map((m) => ({ ...m, x: m.x - gx, y: m.y - gy })),
    };
    replaceEditorNodes((arr) => {
      const lastIdx = Math.max(...arr.map((n, i) => (memberSet.has(n.id) ? i : -1)));
      const rest = arr.filter((n) => !memberSet.has(n.id));
      const insertAt = rest.length - (arr.length - 1 - lastIdx);
      return [...rest.slice(0, insertAt), groupNode, ...rest.slice(insertAt)];
    });
    setSelectedId(groupNode.id);
    setMultiIds([]);
    markDirty();
  }, [editorNodes, multiIds, replaceEditorNodes, markDirty]);

  /** Ungroup: children return to the surface with the group's full
   *  transform (translation + rotation + scale) applied, so nothing
   *  moves on screen. */
  const ungroupSelected = useCallback(() => {
    const found = editorNodes.find((n) => n.id === selectedId);
    if (!found || found.kind !== "group") return;
    const g = found as GroupNode;
    const rad = (g.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const freed = g.children.map((c) => {
      const lx = c.x * g.scaleX;
      const ly = c.y * g.scaleY;
      return {
        ...c,
        x: g.x + lx * cos - ly * sin,
        y: g.y + lx * sin + ly * cos,
        scaleX: c.scaleX * g.scaleX,
        scaleY: c.scaleY * g.scaleY,
        rotation: c.rotation + g.rotation,
        opacity: c.opacity * g.opacity,
      } as DesignNode;
    });
    replaceEditorNodes((arr) => {
      const idx = arr.findIndex((n) => n.id === g.id);
      return [...arr.slice(0, idx), ...freed, ...arr.slice(idx + 1)];
    });
    setSelectedId(freed[0]?.id ?? null);
    markDirty();
  }, [editorNodes, selectedId, replaceEditorNodes, markDirty]);
  const handleChange = useCallback(
    (id: string, patch: Partial<DesignNode>) => {
      replaceEditorNodes((prev) =>
        prev.map((n) => (n.id === id ? ({ ...n, ...patch } as DesignNode) : n)),
      );
    },
    [replaceEditorNodes],
  );
  const handleCommit = useCallback(() => markDirty(), [markDirty]);
  const handleTextEditMode = useCallback((id: string | null) => setTextEditId(id), []);


  const setCanvasZoom = useCallback((z: number) => {
    setZoom(Math.max(0.65, Math.min(1.35, z)));
  }, []);

  /* ---- Bottom rail controls (CanvasBottomRailControls) ---- */
  const togglePanMode = useCallback(() => setIsPanActive((v) => !v), []);
  // Fit to Screen: instantly restore the default fitted view — zoom
  // back to 100% (= fit-to-column) and reset the editor's view-only
  // pan/wheel-zoom transform. The same reset the old toolbar Fit
  // button and footer Reset button ran; the rail is its home now.
  const handleFitToScreen = useCallback(() => {
    setCanvasZoom(1);
    editorRef.current?.resetView();
  }, [setCanvasZoom]);
  const handleZoomChange = useCallback(
    (z: number) => setCanvasZoom(z),
    [setCanvasZoom],
  );
  // The editor reports its live total zoom (zoom × wheel multiplier)
  // so the rail's % readout stays honest after a wheel zoom.
  const handleEditorZoomChange = useCallback(
    (total: number) => setLiveZoom(total),
    [],
  );

  /* ---- Reference data ---- */
  useEffect(() => {
    (async () => {
      try {
        const [catRes, colRes] = await Promise.all([
          fetch("/api/admin/categories"),
          fetch("/api/admin/collections"),
        ]);
        if (catRes.ok) {
          const data = await catRes.json();
          setCategories(flattenCategories(data.categories ?? data.tree ?? data));
        }
        if (colRes.ok) {
          const data = await colRes.json();
          setCollections((data.collections ?? []).map((c: any) => ({ id: c.id, name: c.name })));
        }
      } catch {
        /* pickers stay empty; product setup still saves */
      }
    })();
  }, []);

  /* ---- Catalog products (debounced, paged) ----
   * Search mode: flat results for the query. Browse mode: the products
   * of the pinned category. In plain card-browsing mode nothing is
   * fetched here — the category-cards effect below drives the panel. */
  useEffect(() => {
    if (!searching && !browseProductsFor) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setCatalogBusy(true);
      try {
        const offset = (catalogPage - 1) * CATALOG_PAGE_SIZE;
        const params = new URLSearchParams({
          limit: String(CATALOG_PAGE_SIZE),
          offset: String(offset),
        });
        if (searching) params.set("search", catalogQuery.trim());
        else if (browseProductsFor) params.set("category", browseProductsFor.id);
        const res = await fetch(`/api/admin/studio/catalog?${params.toString()}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setCatalogResults(data.products ?? []);
          setCatalogTotal(data.total ?? 0);
        }
      } catch {
        if (!cancelled) {
          setCatalogResults([]);
          setCatalogTotal(0);
        }
      } finally {
        if (!cancelled) setCatalogBusy(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [catalogQuery, catalogPage, browseProductsFor, searching]);

  /* ---- Card browser: category cards for the current level ---- */
  useEffect(() => {
    if (searching || browseProductsFor) return;
    let cancelled = false;
    (async () => {
      setBrowseBusy(true);
      try {
        const parent = browsePath[browsePath.length - 1];
        const res = await fetch(
          `/api/admin/studio/catalog?level=children${parent ? `&parent=${encodeURIComponent(parent.id)}` : ""}`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setBrowseCards(data.cards ?? []);
          setBrowseParentCount(data.parentCount ?? 0);
        }
      } catch {
        if (!cancelled) setBrowseCards([]);
      } finally {
        if (!cancelled) setBrowseBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [browsePath, searching, browseProductsFor]);

  /* ---- Card browser navigation ---- */
  const openBrowseCard = (card: BrowseCard) => {
    if (card.hasChildren) {
      setBrowsePath((p) => [...p, { id: card.id, name: card.name }]);
    } else {
      setBrowseProductsFor({ id: card.id, name: card.name });
      setCatalogPage(1);
    }
  };
  const viewAllInCategory = (node: { id: string; name: string }) => {
    setBrowseProductsFor(node);
    setCatalogPage(1);
  };
  const browseCrumbTo = (index: number) => {
    setBrowsePath((p) => p.slice(0, index + 1));
    setBrowseProductsFor(null);
  };

  const chooseCatalogProduct = useCallback(
    async (item: CatalogListItem) => {
      try {
        const res = await fetch(`/api/admin/studio/catalog/${item.id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load product");
        const detail = data as CatalogDetail;
        setCatalogDetail(detail);
        // CP2: hydrate the editor's real product stage for this product.
        // Awaited so the toast below can announce the CAPTURED spec
        // when one is bound — the same numbers the canvas guide
        // shows — instead of the template's default spec.
        const stage = await loadProductStage(item.id);
        setProductType(detail.template.productType);
        if (!productTitle) setProductTitle(detail.product.name);
        if (!categoryId && detail.product.category_id) {
          setCategoryId(detail.product.category_id);
        }
        const priced = detail.variants.filter((v) => v.price_snapshot);
        if (!retailPrice && priced.length) {
          const min = Math.min(...priced.map((v) => v.price_snapshot!));
          setRetailPrice((Math.round(min * 2 * 100) / 100).toFixed(2));
        }
        /* Stage-fix: the DEFAULT color must agree with the stage
         * photo the canvas is about to show. Captured templates are
         * per-variant-set, so when a stage is bound, default to the
         * colorway its rows were captured for (for the Bella +
         * Canvas 3001: "Athletic Heather" — the only captured set,
         * whose photo is the heather-gray garment on canvas) rather
         * than the first variant in price order ("Black" — a label
         * that contradicted the photo). No captured stage (or no
         * captured colorway): the previous first-color default. */
        const firstColor =
          (stage ? firstCapturedStageColorName(stage, detail.variants) : null) ??
          detail.variants.find((v) => v.color)?.color ??
          null;
        if (firstColor) {
          setGarmentColorName(firstColor);
          setGarmentColor(colorNameToHex(firstColor));
        }
        markDirty();
        const stageHit = stage ? stageSpecForSide(stage, side) : null;
        toast(
          stageHit
            ? `Template loaded: ${stageHit.spec.printWidthPx}×${stageHit.spec.printHeightPx}px @${stageHit.spec.targetDpi} DPI (supplier spec)`
            : `Template loaded: ${detail.template.spec.widthPx}×${detail.template.spec.heightPx}px @${detail.template.spec.dpi} DPI (${detail.template.spec.source} spec)`,
        );
      } catch (e: any) {
        toast("Product load failed: " + e.message);
      }
    },
    [productTitle, categoryId, retailPrice, markDirty, toast, loadProductStage, side],
  );

  /* ---- Drag-onto-canvas ----
   * Three payloads land on the canvas:
   * 1. A catalog product card — dragstart stores the product id, and a
   *    drop resolves the item from the same catalogResults list the
   *    card was rendered from and calls chooseCatalogProduct(item) —
   *    same detail fetch, same stage hydration (loadProductStage),
   *    same toast. Nothing else in the binding path is duplicated.
   * 2. A studio image (an asset card, the AI preview) — dragstart
   *    stores {src, name}; a drop adds the picture as an image node
   *    centered on the drop point.
   * 3. Image files from the desktop — a drop runs each file through
   *    the same upload path as the file picker, placed at the drop
   *    point. A plain image URL dragged in from another tab is added
   *    the same way.
   * The drop point is converted to design coordinates through the
   * editor handle (clientToDesign); without a conversion the node
   * falls back to the print-area center, exactly like a click. */
  const isCatalogProductDrag = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes(CATALOG_PRODUCT_DND_TYPE);
  const isStudioImageDrag = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes(STUDIO_IMAGE_DND_TYPE);
  const isFileDrag = (e: React.DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const isCanvasDrag = (e: React.DragEvent) =>
    isCatalogProductDrag(e) || isStudioImageDrag(e) || isFileDrag(e);
  const [dropKind, setDropKind] = useState<"catalog" | "image" | null>(null);
  const handleCatalogProductDragStart = (e: React.DragEvent, item: CatalogListItem) => {
    e.dataTransfer.setData(CATALOG_PRODUCT_DND_TYPE, item.id);
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "copy";
  };
  const handleStudioImageDragStart = (e: React.DragEvent, src: string, name: string) => {
    e.dataTransfer.setData(STUDIO_IMAGE_DND_TYPE, JSON.stringify({ src, name }));
    e.dataTransfer.setData("text/plain", src);
    e.dataTransfer.effectAllowed = "copy";
  };
  const handleCatalogProductDragEnd = () => {
    catalogDragDepthRef.current = 0;
    setCatalogDropOver(false);
    setDropKind(null);
  };
  const handleCanvasDragEnter = (e: React.DragEvent) => {
    if (!isCanvasDrag(e)) return;
    e.preventDefault();
    catalogDragDepthRef.current += 1;
    setCatalogDropOver(true);
    setDropKind(isCatalogProductDrag(e) ? "catalog" : "image");
  };
  const handleCanvasDragOver = (e: React.DragEvent) => {
    if (!isCanvasDrag(e)) return;
    // preventDefault on dragover is what makes the area a drop target.
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setCatalogDropOver(true);
    setDropKind(isCatalogProductDrag(e) ? "catalog" : "image");
  };
  const handleCanvasDragLeave = (e: React.DragEvent) => {
    if (!isCanvasDrag(e)) return;
    catalogDragDepthRef.current = Math.max(0, catalogDragDepthRef.current - 1);
    if (catalogDragDepthRef.current === 0) {
      setCatalogDropOver(false);
      setDropKind(null);
    }
  };
  const handleCanvasDrop = (e: React.DragEvent) => {
    if (!isCanvasDrag(e)) return;
    e.preventDefault();
    catalogDragDepthRef.current = 0;
    setCatalogDropOver(false);
    setDropKind(null);
    if (isCatalogProductDrag(e)) {
      const id = e.dataTransfer.getData(CATALOG_PRODUCT_DND_TYPE);
      const item = catalogResults.find((p) => p.id === id);
      if (item) void chooseCatalogProduct(item);
      return;
    }
    const at = editorRef.current?.clientToDesign(e.clientX, e.clientY) ?? undefined;
    if (mode !== "product") {
      toast("Pictures drop onto the product canvas — switch to the product view first");
      return;
    }
    const raw = e.dataTransfer.getData(STUDIO_IMAGE_DND_TYPE);
    if (raw) {
      try {
        const payload = JSON.parse(raw) as { src?: string; name?: string };
        if (payload.src) {
          addImageNodeFromUrl(payload.src, payload.name || "Artwork", at);
          toast("Picture added to your design");
        }
      } catch {
        /* malformed payload — nothing to add */
      }
      return;
    }
    const files = Array.from(e.dataTransfer.files ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length > 0) {
      files.forEach((f) => void handleUploadArtwork(f, at));
      return;
    }
    const uri = (e.dataTransfer.getData("text/uri-list") || "")
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#"));
    if (uri && /^https?:\/\//i.test(uri)) {
      addImageNodeFromUrl(uri, "Dropped picture", at);
      toast("Picture added to your design");
    }
  };

  /* ---- Save / reopen ---- */
  const buildState = useCallback((): CanvasStateV2 => ({
    app: "Fabric Design Studio",
    version: 2,
    productName: projectName,
    productType,
    garmentColor,
    supplierCatalogProductId: catalogDetail?.product.id ?? null,
    templateKind: catalogDetail?.template.kind ?? "",
    surfaces: sides,
    // Workspace extensions — written only when they carry content,
    // so product-only designs keep their exact previous shape.
    ...(boards.length ? { boards } : {}),
    ...(gangSheets.length ? { gangSheets } : {}),
    ...(book ? { book } : {}),
    ...(annotation ? { annotations: annotation } : {}),
  }), [projectName, productType, garmentColor, catalogDetail, sides, boards, gangSheets, book, annotation]);

  const savedIdRef = useRef<string | null>(null);
  useEffect(() => {
    savedIdRef.current = designId;
  }, [designId]);
  const saveDesignOnce = useCallback(async (): Promise<string | null> => {
    const effectiveId = designId ?? savedIdRef.current;
    try {
      const payload = {
        name: projectName,
        canvas_state: buildState(),
        supplier_catalog_product_id: catalogDetail?.product.id ?? null,
        project_id: projectId,
        product_title: productTitle || null,
        description: description || null,
        retail_price: retailPrice ? Number(retailPrice) : null,
        category_id: categoryId || null,
        collection_id: collectionId || null,
        garment_color: garmentColor,
        product_type: productType,
      };
      const res = effectiveId
        ? await fetch(`/api/admin/designs/${effectiveId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/designs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      const id: string = data.design_id ?? effectiveId;
      savedIdRef.current = id;
      setDesignId(id);
      if (data.project_id) setProjectId(data.project_id);
      setSaveStatus("All changes saved");
      toast("Design saved");
      return id;
    } catch (e: any) {
      toast("Save failed: " + e.message);
      return null;
    }
  }, [buildState, catalogDetail, projectId, projectName, productTitle, description, retailPrice, categoryId, collectionId, garmentColor, productType, designId, toast]);
  /* Concurrent-save guard: while one save is in flight, every other
   * caller (a double-clicked Save, Save + Publish pressed together,
   * the annotator's timed save) joins the SAME request instead of
   * posting again — a fresh project has no id until the first POST
   * returns, so unguarded rapid saves each created a duplicate
   * design (three in one second, 2026-11-02). */
  const saveInFlightRef = useRef<Promise<string | null> | null>(null);
  const saveDesign = useCallback((): Promise<string | null> => {
    if (!saveInFlightRef.current) {
      saveInFlightRef.current = saveDesignOnce().finally(() => {
        saveInFlightRef.current = null;
      });
    }
    return saveInFlightRef.current;
  }, [saveDesignOnce]);
  // Always-current saveDesign for flows that set state and then need
  // that NEW state persisted (the annotator opening a page).
  const saveDesignRef = useRef(saveDesign);
  saveDesignRef.current = saveDesign;

  /* ---- Deep-link handoff: ?catalogProduct= / ?designId= (additive) ----
   * Senders emit /admin/studio?catalogProduct=<supplier_catalog_
   * products id>: the New Design wizard's final step (which also adds
   * projectName= and collectionId= from its Organize step) and the
   * /admin/catalog rows' "Quick add → Design Studio" links (which add
   * source= and name= — informational only; the catalog detail fetch
   * below is authoritative, so they need no handling). Until now the
   * studio ignored the param entirely.
   *
   * On first mount only: apply projectName / collectionId through the
   * SAME state the Product tab edits, so the existing saveDesign
   * payload persists them unchanged; then bind the product EXACTLY as
   * a picker click does — fetch its catalog detail (the endpoint
   * chooseCatalogProduct itself reads) and hand the item to
   * chooseCatalogProduct, which performs the binding + stage
   * hydration (loadProductStage) + toast. No params = no effect: the
   * studio behaves exactly as before. */
  const chooseCatalogProductRef = useRef(chooseCatalogProduct);
  chooseCatalogProductRef.current = chooseCatalogProduct;
  /* loadDesign is defined below; the handoff effect reaches it
   * through this ref (assigned during render, after its definition). */
  const loadDesignRef = useRef<((id: string) => Promise<void>) | null>(null);
  const handoffDoneRef = useRef(false);
  useEffect(() => {
    if (handoffDoneRef.current) return;
    handoffDoneRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const catalogProductId = params.get("catalogProduct");
    const projectNameParam = params.get("projectName");
    const collectionIdParam = params.get("collectionId");
    if (projectNameParam) setProjectName(projectNameParam);
    if (collectionIdParam) setCollectionId(collectionIdParam);
    const designIdParam = params.get("designId");
    if (designIdParam) {
      /* The Publish wizard's "Fix it in the studio" link carries the
       * design back (?designId= + ?catalogProduct=, the same params
       * the wizard itself was launched with). Reopen THAT design
       * through the studio's own loadDesign — it restores the saved
       * surfaces and binds the design's catalog product + captured
       * stage itself — instead of landing on an empty canvas bound
       * only to the product. Until now the studio read only
       * catalogProduct and ignored designId entirely. */
      if (loadDesignRef.current) void loadDesignRef.current(designIdParam);
      return;
    }
    if (!catalogProductId) return;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/studio/catalog/${encodeURIComponent(catalogProductId)}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load product");
        const detail = data as CatalogDetail;
        const prices = detail.variants
          .map((v) => v.price_snapshot)
          .filter((p): p is number => p != null);
        await chooseCatalogProductRef.current({
          id: detail.product.id,
          name: detail.product.name,
          supplier_name: detail.product.supplier_name,
          supplier_slug: detail.product.supplier_slug,
          image_url: detail.product.image_url,
          variant_count: detail.variants.length,
          category_path: detail.product.category_name
            ? [detail.product.category_name]
            : [],
          kind: "",
          productType: null,
          minPrice: prices.length ? Math.min(...prices) : null,
          colors: [],
        });
      } catch (e: any) {
        toast("Product link failed: " + e.message);
      }
    })();
  }, [toast]);

  /** Export the sheet at 300 DPI; save it as its own design when it fits the vault. */
  const exportGangSheet = useCallback(async () => {
    if (!activeSheet || !gangRef.current) return;
    setGangBusy(true);
    setGangInfo(null);
    try {
      const out = await gangRef.current.exportSheetPng();
      const mb = out.blob.size / 1048576;
      let note = `${out.widthPx.toLocaleString()} × ${out.heightPx.toLocaleString()} px @ ${out.dpi} DPI · ${mb.toFixed(2)} MB`;
      if (out.blob.size <= 20 * 1024 * 1024) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(new Error("Could not read the sheet file."));
          r.readAsDataURL(out.blob);
        });
        const state: CanvasStateV2 = {
          ...buildState(),
          productName: "DTF Gang Sheet",
          gangSheets: [activeSheet],
        };
        const res = await fetch("/api/admin/designs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `${projectName || "Untitled project"} — ${activeSheet.name}`,
            canvas_state: state,
            product_type: "gang-sheet",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Saving the sheet design failed");
        const newId: string = data.design_id;
        const fres = await fetch(`/api/admin/designs/${newId}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "print", dataUrl, name: `gang-${activeSheet.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` }),
        });
        if (!fres.ok) throw new Error("The sheet design saved, but its print file did not upload.");
        note += " · saved as its own design with the print file attached";
        toast("Gang sheet exported and saved");
      } else {
        const url = URL.createObjectURL(out.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${activeSheet.name.replace(/[^a-z0-9]+/gi, "-")}-300dpi.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        note += " · too large for the vault (25 MB limit) — downloaded to this computer instead";
        toast("Gang sheet downloaded (too large for the vault)");
      }
      setGangInfo(note);
    } catch (e) {
      toast("Gang sheet export failed: " + (e as Error).message);
    } finally {
      setGangBusy(false);
    }
  }, [activeSheet, buildState, projectName, toast]);


  const ensureDesign = useCallback(async (): Promise<string | null> => {
    if (designId) return designId;
    return saveDesign();
  }, [designId, saveDesign]);

  /** Render the active sketch board and hand it to the AI inspiration
   *  flow. The route saves the sketch to the design's vault and tries
   *  image-to-image; the answer says honestly which path ran. */
  const deliverSketchToAI = useCallback(async () => {
    if (!activeBoard || !editorRef.current) return;
    const prompt = sketchPrompt.trim() || activeBoard.name;
    setSketchBusy(true);
    try {
      const png = await editorRef.current.exportRegionPng(SKETCH_RECT, 2, {
        includeBackground: true,
      });
      if (!png) {
        toast("Could not render the sketch board");
        return;
      }
      const id = await ensureDesign();
      const res = await fetch("/api/admin/inspire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          designId: id,
          projectId,
          imageDataUrl: png,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI delivery failed");
      setSketchResult({
        imageUrl: data.imageUrl,
        mode: data.mode,
        sketchImageUrl: data.sketchImageUrl ?? null,
      });
      toast(
        data.mode === "img2img"
          ? "The AI painted from your sketch"
          : "Sketch saved to the vault — the AI painted from your words, with the sketch pinned as the reference",
      );
      if (id) {
        const d = await (await fetch(`/api/admin/designs/${id}`)).json();
        if (d.assets) setAssets(d.assets);
      }
    } catch (e: any) {
      toast("AI delivery failed: " + e.message);
    } finally {
      setSketchBusy(false);
    }
  }, [activeBoard, sketchPrompt, ensureDesign, projectId, toast]);

  const openDesignList = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/designs");
      const data = await res.json();
      if (res.ok) setDesignList(data.designs ?? []);
    } catch {
      setDesignList([]);
    }
    setShowOpen(true);
  }, []);

  const loadDesign = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/admin/designs/${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Load failed");
        const d = data.design;
        setDesignId(d.id);
        setProjectId(d.project_id ?? null);
        setDesignStatus(d.status);
        setProjectName(d.name);
        setProductTitle(d.product_title ?? "");
        setRetailPrice(d.retail_price != null ? String(d.retail_price) : "");
        setCategoryId(d.category_id ?? "");
        setDescription(d.description ?? "");
        setCollectionId(d.collection_id ?? "");
        setGarmentColor(d.garment_color ?? "#ffffff");
        setAssets(data.assets ?? []);
        setPublishedUrl(null);
        setPreflight(null);

        const cs = d.canvas_state ?? {};
        if (cs.version === 2 && cs.surfaces) {
          setSides({
            Front: cs.surfaces.Front ?? [],
            Back: cs.surfaces.Back ?? [],
          });
          if (cs.productType) setProductType(cs.productType);
        } else if (Array.isArray(cs.nodes)) {
          // Legacy v1 state: everything lived on one surface.
          setSides({ Front: cs.nodes, Back: [] });
          if (cs.product) setProductType(cs.product);
          if (cs.garmentColor) setGarmentColor(cs.garmentColor);
        } else {
          setSides({ Front: [], Back: [] });
        }
        // Workspace extensions (additive; absent on older designs).
        const loadedBoards: SketchBoard[] = Array.isArray(cs.boards) ? cs.boards : [];
        setBoards(loadedBoards);
        setActiveBoardId(loadedBoards[0]?.id ?? null);
        setGangSheets(Array.isArray(cs.gangSheets) ? cs.gangSheets : []);
        setActiveSheetId(
          Array.isArray(cs.gangSheets) && cs.gangSheets.length ? cs.gangSheets[0].id : null,
        );
        setBook(cs.book && Array.isArray(cs.book.pages) ? cs.book : null);
        setActivePageIdx(0);
        setAnnotation(cs.annotations ?? null);
        setMode("product");
        setSide("Front");
        setSelectedId(null);

        if (d.supplier_catalog_product_id) {
          // CP2: hydrate the editor's real product stage, same as a
          // fresh product pick.
          void loadProductStage(d.supplier_catalog_product_id);
          const cRes = await fetch(`/api/admin/studio/catalog/${d.supplier_catalog_product_id}`);
          if (cRes.ok) {
            const cData = await cRes.json();
            setCatalogDetail(cData as CatalogDetail);
            setProductType((cData as CatalogDetail).template.productType);
          }
        } else {
          setCatalogDetail(null);
          setProductStage(null);
        }
        setShowOpen(false);
        setSaveStatus("All changes saved");
        toast(`Opened “${d.name}” (${STATUS_LABEL[d.status] ?? d.status})`);
      } catch (e: any) {
        toast("Open failed: " + e.message);
      }
    },
    [toast, loadProductStage],
  );
  // Always-current loadDesign for the deep-link handoff above.
  loadDesignRef.current = loadDesign;

  const newDesign = useCallback(() => {
    setDesignId(null);
    setProjectId(null);
    setDesignStatus("draft");
    setProjectName("Untitled project");
    setProductTitle("");
    setRetailPrice("");
    setDescription("");
    setCollectionId("");
    setSides({ Front: [], Back: [] });
    setBoards([]);
    setActiveBoardId(null);
    setGangSheets([]);
    setActiveSheetId(null);
    setBook(null);
    setActivePageIdx(0);
    setAnnotation(null);
    setMode("product");
    setSide("Front");
    setSelectedId(null);
    setCatalogDetail(null);
    setProductStage(null);
    setAssets([]);
    setPreflight(null);
    setPublishedUrl(null);
    setSaveStatus("New design — pick a product to begin");
  }, []);

  /* ---- Files: uploads, exports, mockups ---- */
  const uploadFile = useCallback(
    async (kind: string, dataUrl: string, surface?: Surface, extra?: object) => {
      const id = await ensureDesign();
      if (!id) return null;
      const res = await fetch(`/api/admin/designs/${id}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, dataUrl, surface, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      // Keep the vault/asset lists truthful: a file uploaded a second
      // ago (a print PDF, a book PDF, artwork) must be openable right
      // away — e.g. exporting a print PDF and immediately annotating
      // it — without reopening the design first.
      try {
        const fresh = await fetch(`/api/admin/designs/${id}`);
        if (fresh.ok) {
          const fd = await fresh.json();
          if (Array.isArray(fd.assets)) setAssets(fd.assets);
        }
      } catch { /* the upload itself already succeeded */ }
      return data as { ref: string; url: string | null; asset_id: string };
    },
    [ensureDesign],
  );

  const handleUploadArtwork = useCallback(
    async (file: File, at?: { x: number; y: number }) => {
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        const up = await uploadFile("artwork", dataUrl, side, { filename: file.name });
        const src = up?.url ?? dataUrl;
        const img = new Image();
        img.onload = () => {
          // Fit-first: a picture wider than the trim (the old code
          // capped at 200px against a 160px garment trim) spilled
          // and failed Publish Step 2. Clamp to the trim, keeping
          // aspect, and center it inside the trim.
          const area = templateMeta?.stage.trim ?? getProductTemplate(productType).printArea;
          const fit = Math.min(1, 200 / img.width, area.width / img.width, area.height / img.height);
          const w = Math.max(1, Math.round(img.width * fit));
          const h = Math.max(1, Math.round(img.height * fit));
          const clampAxis = (v: number, lo: number, hi: number) =>
            Math.min(Math.max(v, lo), Math.max(lo, hi));
          const node: DesignNode = {
            id: `img_${Date.now().toString(36)}`,
            kind: "image",
            name: file.name.slice(0, 40),
            x: at
              ? clampAxis(Math.round(at.x - w / 2), area.x, area.x + area.width - w)
              : Math.round(area.x + (area.width - w) / 2),
            y: at
              ? clampAxis(Math.round(at.y - h / 2), area.y, area.y + area.height - h)
              : Math.round(area.y + Math.min(20, Math.max(0, area.height - h))),
            width: w,
            height: h,
            src,
            rotation: 0,
            opacity: 1,
            scaleX: 1,
            scaleY: 1,
          } as DesignNode;
          replaceEditorNodes((prev) => [...prev, node]);
          setSelectedId(node.id);
          markDirty();
          toast("Artwork added to canvas");
        };
        img.src = src;
      } catch (e: any) {
        toast("Upload failed: " + e.message);
      }
    },
    [uploadFile, side, templateMeta, productType, markDirty, toast],
  );

  const addImageNodeFromUrl = useCallback(
    (src: string, name: string, at?: { x: number; y: number }) => {
      // Fit-first: the old 180×180 box spilled past a 160-wide
      // garment trim. Clamp to the active print area, centered — or
      // centered on the drop point when the picture was dragged in,
      // clamped so it always lands inside the print area.
      const area = templateMeta?.stage.trim ?? getProductTemplate(productType).printArea;
      const fit = Math.min(1, area.width / 180, area.height / 180);
      const w = Math.round(180 * fit);
      const h = Math.round(180 * fit);
      const clampAxis = (v: number, lo: number, hi: number) =>
        Math.min(Math.max(v, lo), Math.max(lo, hi));
      const box = {
        x: at
          ? clampAxis(Math.round(at.x - w / 2), area.x, area.x + area.width - w)
          : Math.round(area.x + (area.width - w) / 2),
        y: at
          ? clampAxis(Math.round(at.y - h / 2), area.y, area.y + area.height - h)
          : Math.round(area.y + Math.min(24, Math.max(0, area.height - h))),
        width: w,
        height: h,
      };
      const node: DesignNode = {
        id: `img_${Date.now().toString(36)}`,
        kind: "image",
        name,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        src,
        rotation: 0,
        opacity: 1,
        scaleX: 1,
        scaleY: 1,
      } as DesignNode;
      replaceEditorNodes((prev) => [...prev, node]);
      setSelectedId(node.id);
      markDirty();
    },
    [side, templateMeta, productType, markDirty],
  );

  /* ---- Pollinations inspiration ---- */
  const generateInspiration = useCallback(
    async (surprise: boolean) => {
      setAiBusy(true);
      setAiAppliedNote(null);
      try {
        const res = await fetch("/api/admin/inspire", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: aiPrompt,
            style: aiPreset,
            surprise,
            designId,
            projectId,
            ratio: aiRatio,
            ...(selectedTheme ? { themeName: selectedTheme } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Generation failed");
        setAiPreview({ url: data.imageUrl, prompt: data.prompt });
        // The generated picture comes back ONTO the canvas — that is
        // where a design is built. The rail preview is a copy you can
        // re-add from, never the only place the asset lands.
        addImageNodeFromUrl(data.imageUrl, "AI inspiration");
        const appliedTheme =
          typeof data.appliedTheme === "string" ? data.appliedTheme : null;
        const appliedBrand = data.appliedBrand === true;
        setAiAppliedNote(
          appliedTheme && appliedBrand
            ? `Used your ${appliedTheme} prompt + brand settings.`
            : appliedTheme
              ? `Used your ${appliedTheme} prompt.`
              : appliedBrand
                ? "Used your brand settings."
                : null,
        );
        if (surprise && data.prompt) setAiPrompt(data.prompt);
        toast("Inspiration generated — it's on your canvas");
      } catch (e: any) {
        toast("AI generation failed: " + e.message);
      } finally {
        setAiBusy(false);
      }
    },
    [aiPrompt, aiPreset, aiRatio, designId, projectId, selectedTheme, toast, addImageNodeFromUrl],
  );

  /* ---- Export print files (all designed surfaces) + mockup ---- */
  /* ---- PDF annotator ----
   * Render path (stated honestly): there is no PDF renderer in this
   * bundle, so the annotator opens PDFs whose pages are embedded page
   * images — which is exactly what THIS studio's print PDFs are (see
   * lib/fabric/pdf-extract). The page image becomes a locked base
   * layer; everything drawn over it is a normal layer; the flattened
   * export re-renders page + marks into a fresh print PDF at the
   * page's true physical size. */
  const beginAnnotation = useCallback(
    async (sourceName: string, pageDataUrl: string, physWIn: number, physHIn: number) => {
      const up = await uploadFile("artwork", pageDataUrl, undefined, { filename: `page-${sourceName.replace(/[^a-z0-9]+/gi, "-")}.png` });
      const src = up?.url ?? pageDataUrl;
      const rect = fitPageRect(physWIn, physHIn);
      const base: DesignNode = {
        ...defaultImageNode(src, { name: sourceName }),
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        locked: true,
      } as DesignNode;
      setAnnotation({ sourceName, imageSrc: src, physWIn, physHIn, nodes: [base] });
      setSelectedId(null);
      markDirty();
      // Persist the opened page right away (the sketch Deliver flow
      // does the same) — the save runs after this render settles, so
      // it captures the annotation state set just above.
      setTimeout(() => { void saveDesignRef.current(); }, 700);
      toast(`“${sourceName}” is open — draw, write and mark it up, then export the flattened PDF`);
    },
    [uploadFile, markDirty, toast],
  );

  const openPdfBytes = useCallback(
    async (bytes: Uint8Array, name: string) => {
      const page = extractPdfPageImage(bytes);
      if (!page) {
        toast("That PDF's pages are drawn as vector shapes, not page pictures, so this annotator cannot open it. Open the design's print PNG instead — it annotates the same way.");
        return;
      }
      const blob = new Blob([page.jpegBytes as BlobPart], { type: "image/jpeg" });
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      await beginAnnotation(name, dataUrl, page.wIn, page.hIn);
    },
    [beginAnnotation, toast],
  );

  const handleAnnotateFile = useCallback(
    async (file: File) => {
      setAnnotateBusy(true);
      try {
        if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
          const bytes = new Uint8Array(await file.arrayBuffer());
          await openPdfBytes(bytes, file.name);
        } else if (file.type.startsWith("image/")) {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = reject;
            r.readAsDataURL(file);
          });
          const img = new window.Image();
          await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = dataUrl; });
          // A loose picture has no stated physical size — read it at
          // 300 DPI, the studio's print standard, and say so.
          await beginAnnotation(file.name, dataUrl, img.naturalWidth / 300, img.naturalHeight / 300);
          setAnnotateInfo(`“${file.name}” was read at 300 DPI (${(img.naturalWidth / 300).toFixed(1)}″ × ${(img.naturalHeight / 300).toFixed(1)}″).`);
        } else {
          toast("Open a PDF or a picture of the page (PNG or JPG).");
        }
      } catch (e) {
        toast("Could not open that file: " + (e as Error).message);
      } finally {
        setAnnotateBusy(false);
      }
    },
    [openPdfBytes, beginAnnotation, toast],
  );

  const openPdfAsset = useCallback(
    async (a: AssetItem) => {
      setAnnotateBusy(true);
      try {
        const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/design-files/${a.storage_path}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("the saved PDF could not be fetched");
        const bytes = new Uint8Array(await res.arrayBuffer());
        await openPdfBytes(bytes, a.storage_path.split("/").pop() ?? "print PDF");
      } catch (e) {
        toast("Could not open that PDF: " + (e as Error).message);
      } finally {
        setAnnotateBusy(false);
      }
    },
    [openPdfBytes, toast],
  );

  /** Flatten page + annotation layers into a new print PDF in the vault. */
  const exportAnnotatedPdf = useCallback(async () => {
    if (!annotation || !editorRef.current) return;
    setAnnotateBusy(true);
    try {
      const baseNode = annotation.nodes[0];
      const rect = baseNode && baseNode.kind === "image"
        ? { x: baseNode.x, y: baseNode.y, width: baseNode.width, height: baseNode.height }
        : fitPageRect(annotation.physWIn ?? 8.5, annotation.physHIn ?? 11);
      // Probe the page image's native size for a full-resolution
      // flatten; if it cannot be reloaded right now, fall back to a
      // 2x render rather than refusing the export outright.
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      const loaded = await new Promise<boolean>((resolve) => { img.onload = () => resolve(true); img.onerror = () => resolve(false); img.src = canvasImageSrc(annotation.imageSrc); });
      const ratio = loaded && img.naturalWidth > 0 ? img.naturalWidth / rect.width : 2;
      const png = await editorRef.current.exportRegionPng(rect, ratio, { includeBackground: true });
      if (!png) throw new Error("The annotated page could not be rendered.");
      const pdf = await buildPrintPdf(png, annotation.physWIn ?? 8.5, annotation.physHIn ?? 11);
      await uploadFile("print-pdf", pdf, undefined, { filename: "annotated.pdf" });
      setAnnotateInfo(`Flattened PDF saved into this design's files — ${(annotation.physWIn ?? 8.5).toFixed(1)}″ × ${(annotation.physHIn ?? 11).toFixed(1)}″, page + ${Math.max(0, annotation.nodes.length - 1)} annotation layer(s) baked in.`);
      toast("Annotated PDF exported");
    } catch (e) {
      toast("Annotated export failed: " + (e as Error).message);
    } finally {
      setAnnotateBusy(false);
    }
  }, [annotation, uploadFile, toast]);

  /** Render every book page at 300 DPI and bind them into one print PDF. */
  const exportBookPdf = useCallback(async () => {
    if (!book || !editorRef.current) return;
    setBookBusy(true);
    setBookInfo(null);
    try {
      const id = await ensureDesign();
      if (!id) throw new Error("Save the design first.");
      const rect = fitPageRect(book.trimWIn, book.trimHIn);
      const ratio = (book.trimWIn * 300) / rect.width;
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const pages: BookPdfPage[] = [];
      const original = activePageIdx;
      for (let i = 0; i < book.pages.length; i++) {
        setActivePageIdx(i);
        await wait(550);
        const png = await editorRef.current.exportRegionPng(rect, ratio, { includeBackground: true });
        if (!png) throw new Error(`Page ${i + 1} could not be rendered.`);
        pages.push({ pngDataUrl: png, wIn: book.trimWIn, hIn: book.trimHIn });
      }
      setActivePageIdx(original);
      const pdf = await buildMultiPagePdf(pages);
      await uploadFile("print-pdf", pdf, undefined, { filename: "book-print.pdf" });
      setBookInfo(`${pages.length} pages · ${book.trimWIn}″ × ${book.trimHIn}″ trim · saved into this design's files as the book print PDF`);
      toast("Book PDF exported");
    } catch (e) {
      toast("Book export failed: " + (e as Error).message);
    } finally {
      setBookBusy(false);
    }
  }, [book, activePageIdx, ensureDesign, uploadFile, toast]);

  const exportPrintFiles = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const id = await ensureDesign();
    if (!id) return;
    const designed = (Object.keys(sides) as Surface[]).filter((s) => sides[s].length > 0);
    if (!designed.length) {
      toast("Canvas is empty — nothing to export");
      return;
    }
    const originalSide = side;
    try {
      for (const s of designed) {
        if (s !== side) {
          setSide(s);
          await new Promise((r) => setTimeout(r, 400));
        }
        // Rule B: cropped design-layer export on the exact supplier
        // pixel grid; falls back to the 3x stage export only when no
        // supplier template is resolved.
        const url = editorRef.current?.exportPrintFile() ?? editorRef.current?.exportPNG(3);
        if (!url) throw new Error(`Export failed on ${s}`);
        // CP2: the stored metadata names the grid the file was
        // actually rendered on — the captured supplier spec for this
        // side when a stage exists, else the template spec.
        const stageSpec = productStage
          ? stageSpecForSide(productStage, s)?.spec
          : undefined;
        await uploadFile("print", url, s, {
          width: stageSpec?.printWidthPx ?? templateMeta?.spec.widthPx,
          height: stageSpec?.printHeightPx ?? templateMeta?.spec.heightPx,
          printDpi: stageSpec?.targetDpi ?? templateMeta?.spec.dpi,
        });
      }
      const mockup = editorRef.current?.exportMockup(1.5, "image/jpeg");
      if (mockup) await uploadFile("mockup", mockup, originalSide);
      if (originalSide !== side) setSide(originalSide);
      toast("Print files + mockup stored");
    } catch (e: any) {
      if (originalSide !== side) setSide(originalSide);
      toast("Export failed: " + e.message);
    }
  }, [ensureDesign, sides, side, uploadFile, templateMeta, toast, productStage]);

  const downloadPNG = useCallback(() => {
    const url = editorRef.current?.exportPNG(3);
    if (!url) {
      toast("Export failed");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName.replace(/[^a-z0-9_-]+/gi, "_") || "design"}-${side.toLowerCase()}.png`;
    a.click();
  }, [projectName, side, toast]);

  /* ---- SVG export: this surface as vectors on the print grid ---- */
  const downloadSVG = useCallback(() => {
    if (!templateMeta) {
      toast("Load a product first — the SVG needs its print grid");
      return;
    }
    const svg = nodesToSvg(nodes, templateMeta.stage.trim, templateMeta.spec);
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName.replace(/[^a-z0-9_-]+/gi, "_") || "design"}-${side.toLowerCase()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast("SVG exported on the print grid — it opens in the post-processor and any vector tool");
  }, [nodes, templateMeta, projectName, side, toast]);

  /* ---- Print-ready PDF: true-size page, artwork + alpha mask ---- */
  const exportPrintPdf = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || !templateMeta) {
      toast("Load a product first — the PDF needs its print size");
      return;
    }
    const png = editor.exportPrintFile();
    if (!png) {
      toast("Print render unavailable");
      return;
    }
    try {
      // CP2: true size comes from the captured supplier spec for
      // this side when a stage exists — the same grid the PNG was
      // rendered on — else the template spec.
      const stageSpec = productStage
        ? stageSpecForSide(productStage, side)?.spec
        : undefined;
      const spec = stageSpec
        ? {
            widthPx: stageSpec.printWidthPx,
            heightPx: stageSpec.printHeightPx,
            dpi: stageSpec.targetDpi,
          }
        : templateMeta.spec;
      const pdf = await buildPrintPdf(png, spec.widthPx / spec.dpi, spec.heightPx / spec.dpi);
      await uploadFile("print-pdf", pdf, side, {
        width: spec.widthPx,
        height: spec.heightPx,
        printDpi: spec.dpi,
      });
      toast(
        `Print PDF stored at true size (${(spec.widthPx / spec.dpi).toFixed(1)}″ × ${(spec.heightPx / spec.dpi).toFixed(1)}″) — the PNG remains the fulfillment file`,
      );
    } catch (e: any) {
      toast("PDF export failed: " + e.message);
    }
  }, [templateMeta, side, uploadFile, toast, productStage]);

  /* ---- Production gates (Konva spec): DPI auditor + Rule A lock ---- */
  // CP2: when a captured stage exists, the auditor measures each side
  // against the CAPTURED supplier spec for that side (supplier_print_
  // specs, via the stage payload) — the same geometry the stage
  // renders and Rule B exports on. A side with no captured spec falls
  // back to the template spec; with no stage at all, today's single
  // audit runs unchanged.
  const audit: DesignAudit = (() => {
    if (!productStage || !templateMeta) return auditDesign(sides, templateMeta);
    const merged: DesignAudit = {
      worstDpi: null,
      failing: [],
      perNode: new Map(),
      isPrintReady: true,
    };
    for (const s of Object.keys(sides) as Surface[]) {
      const hit = stageSpecForSide(productStage, s);
      const perSide = auditDesign(
        { [s]: sides[s] },
        hit
          ? {
              ...templateMeta,
              spec: {
                ...templateMeta.spec,
                widthPx: hit.spec.printWidthPx,
                heightPx: hit.spec.printHeightPx,
                dpi: hit.spec.targetDpi,
                source: "supplier",
              },
            }
          : templateMeta,
      );
      if (perSide.worstDpi != null) {
        merged.worstDpi =
          merged.worstDpi == null
            ? perSide.worstDpi
            : Math.min(merged.worstDpi, perSide.worstDpi);
      }
      merged.failing.push(...perSide.failing);
      for (const [k, v] of perSide.perNode) merged.perNode.set(k, v);
      merged.isPrintReady = merged.isPrintReady && perSide.isPrintReady;
    }
    return merged;
  })();
  const gateReasons: string[] = [];
  if (!audit.isPrintReady) {
    gateReasons.push(
      `Low resolution: ${audit.failing.map((f) => `${f.name} at ${f.dpi} DPI`).join(", ")} — ${TARGET_DPI} DPI required`,
    );
  }
  if (collectionLock) {
    gateReasons.push(
      `Collection locked to ${collectionLock.lockedSupplier}. This product belongs to ${collectionLock.ownSupplier}.`,
    );
  }
  /* Print-area fit — this gate previously checked ONLY sharpness
   * (DPI) and Rule A, so it read "All production gates pass" for a
   * design the Publish wizard's Step 2 failed on fit: two verdicts,
   * one design. It now runs the wizard's EXACT computation (the
   * CP2a path, same exported functions — never a parallel one):
   * with a captured stage layout, each node's stage box
   * (designNodeStageBox over nodeBounds) is tested with
   * boxSpillsArea against the layout's print-area rect; without a
   * layout for a side, preflight's own trim test over the same
   * nodeBounds stands in, exactly as the wizard falls back. Text
   * nodes measure by their rendered glyphs inside nodeBounds, so
   * this gate and the wizard cannot disagree on the same design. */
  const fitSpills: string[] = [];
  if (templateMeta) {
    for (const s of Object.keys(sides) as Surface[]) {
      const layout = productStage
        ? computeStageLayout(productStage, s, templateMeta.stage.trim)
        : null;
      for (const n of sides[s]) {
        const spills = layout
          ? boxSpillsArea(
              designNodeStageBox(n, layout),
              layout.areaStageRect,
            )
          : (() => {
              const b = nodeBounds(n);
              const trim = templateMeta.stage.trim;
              return (
                b.x < trim.x - 1 ||
                b.y < trim.y - 1 ||
                b.x + b.w > trim.x + trim.width + 1 ||
                b.y + b.h > trim.y + trim.height + 1
              );
            })();
        if (spills) fitSpills.push(`“${n.name}” on the ${s}`);
      }
    }
  }
  if (fitSpills.length) {
    gateReasons.push(
      `Artwork outside the print area: ${fitSpills.join(", ")} — it would be clipped in production. Move it inside the print area.`,
    );
  }
  const publishBlocked = gateReasons.length > 0;

  /* Rule A: whenever a target collection is chosen, verify this
     design's supplier against the collection's existing members. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!collectionId || !catalogDetail) {
        setCollectionLock(null);
        return;
      }
      try {
        const mRes = await fetch(`/api/admin/collections/${collectionId}/designs`);
        const mData = await mRes.json();
        const memberIds: string[] = (mData.designIds ?? []).filter(
          (id: string) => id !== designId,
        );
        const ids = designId ? [...memberIds, designId] : memberIds;
        if (!ids.length) {
          if (!cancelled) setCollectionLock(null);
          return;
        }
        const cRes = await fetch("/api/admin/collections/builder/conflicts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ designIds: ids }),
        });
        const report = await cRes.json();
        if (cancelled) return;
        const groups: any[] = report.groups ?? [];
        const ownName = catalogDetail.product.supplier_name ?? "";
        if (groups.length > 1) {
          const ownGroup = groups.find((g) =>
            designId ? g.design_ids.includes(designId) : g.supplier_name === ownName,
          );
          const locked = groups.find((g) => g !== ownGroup) ?? groups[0];
          setCollectionLock({
            lockedSupplier: locked.supplier_name,
            ownSupplier: ownGroup?.supplier_name ?? ownName,
          });
        } else if (groups.length === 1 && !designId && groups[0].supplier_name !== ownName) {
          setCollectionLock({ lockedSupplier: groups[0].supplier_name, ownSupplier: ownName });
        } else {
          setCollectionLock(null);
        }
      } catch {
        if (!cancelled) setCollectionLock(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collectionId, designId, catalogDetail]);


  /* ---- Lifecycle ---- */
  const runPreflightCheck = useCallback(async () => {
    const id = await ensureDesign();
    if (!id) return;
    const res = await fetch(`/api/admin/designs/${id}/review`);
    const data = await res.json();
    if (res.ok) {
      setPreflight(data.preflight);
      setDesignStatus(data.status);
    } else {
      toast("Preflight failed: " + (data.error ?? "unknown"));
    }
  }, [ensureDesign, toast]);

  /* ---- Publish wizard launch (additive) ----
   * The Review tab remains the status/gates summary; this handler is
   * its one new exit into the stepped Publish wizard (Wizard #2,
   * notes/publish-wizard-spec.md). When a product is bound, the
   * current design is saved first — the same save the lifecycle
   * buttons run through ensureDesign — so the wizard's Steps 1–2
   * check the artwork exactly as it stands on the canvas now, read
   * back through the studio's own design/catalog/product-stage
   * endpoints. With nothing bound, the wizard opens unbound and its
   * Step 1 says so plainly.
   *
   * Defect B fix: this handler is THE launch path for every Publish
   * launch point — the header "Review & publish ↗" button and the
   * Review panel's Publish buttons all call it. Before, the header
   * button only switched the right-rail tab (a no-op, with no
   * message, when the Review tab was already showing — the state a
   * design reopened through Open project is left in, because
   * loadDesign never resets rightTab), and the Review panel's
   * "Publish to storefront" button was wired to the direct
   * lifecycle instead and disabled for every draft, so clicking
   * either did nothing at all. */
  const launchPublishWizard = useCallback(async () => {
    setPublishLaunchError(null);
    setPublishLaunchBusy(true);
    try {
      const catalogId = catalogDetail?.product.id ?? null;
      const q = new URLSearchParams();
      if (catalogId) {
        const id = await saveDesign();
        if (!id) {
          /* Defect B fix: saveDesign reports its failure only as a
           * toast that vanishes in seconds, and the old launch then
           * carried on WITHOUT a designId (or, from the buttons that
           * never called this handler, did nothing at all) — a
           * silently broken launch. A design whose latest changes
           * could not be saved must NOT open the wizard on stale
           * artwork: stop here and say why, in plain words that stay
           * on screen next to the launch buttons. */
          setPublishLaunchError(
            "The Publish wizard was not opened, because this design could not be saved just now — the wizard must check the design exactly as it stands, and it cannot do that from an unsaved copy. Check your connection, press “Save design”, then press Publish again.",
          );
          return;
        }
        q.set("designId", id);
        q.set("catalogProduct", catalogId);
      } else if (designId) {
        /* A saved design with no product bound in this session yet
         * (e.g. reopened through Open project, whose catalog binding
         * loads separately): the wizard loads the design itself and
         * derives the product from its saved row, so the launch
         * still opens it — designId alone is enough. */
        q.set("designId", designId);
      }
      window.location.href = `/admin/studio/publish${q.toString() ? `?${q.toString()}` : ""}`;
    } catch (e: any) {
      setPublishLaunchError(
        `The Publish wizard was not opened: ${e?.message ?? "something went wrong while saving this design."} Nothing was published. Press “Save design”, then press Publish again.`,
      );
    } finally {
      setPublishLaunchBusy(false);
    }
  }, [catalogDetail, designId, saveDesign]);

  const lifecycle = useCallback(
    async (action: "submit" | "approve" | "publish" | "unpublish" | "archive") => {
      if (action === "publish" && publishBlocked) {
        // Hard gate (DPI auditor + Rule A): the publish pipeline
        // refuses to run until the configuration meets criteria.
        setRightTab("review");
        toast(`Publish locked — ${gateReasons[0]}`);
        return;
      }
      const id = await ensureDesign();
      if (!id) return;
      setLifecycleBusy(true);
      try {
        if (action === "publish") await exportPrintFiles();
        const res = await fetch(`/api/admin/designs/${id}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.preflight) setPreflight(data.preflight);
          throw new Error(data.error || `Could not ${action}`);
        }
        setDesignStatus(data.status);
        if (data.url) setPublishedUrl(data.url);
        if (action === "publish" || action === "unpublish") {
          // Cross-tab relay: product lists open in other tabs refresh.
          try {
            const { broadcastWorkspaceEvent } = await import("@/lib/workspace-bus");
            broadcastWorkspaceEvent("products:changed", { designId: id, action });
          } catch { /* relay is best-effort */ }
        }
        toast(
          action === "publish"
            ? `Published — ${data.url}`
            : `Design is now ${STATUS_LABEL[data.status] ?? data.status}`,
        );
      } catch (e: any) {
        toast(`${action} failed: ` + e.message);
      } finally {
        setLifecycleBusy(false);
      }
    },
    [ensureDesign, exportPrintFiles, toast, publishBlocked, gateReasons],
  );

  /* ---- Add text / shapes ---- */
  /* ---- Fit-first placement (Publish Step 2 root-cause fix) ----
   * The old add paths dropped nodes at hard-coded stage coordinates
   * (text at x=155 w=180, rect at x=190 w=110) that spill past the
   * garment trim (x=130..290 on a tee): the first thing a user added
   * failed the Publish wizard's print-area fit check, with no warning
   * on the canvas itself (the spill chip only renders for a captured
   * stage). Every add path below now centers its box inside the
   * ACTIVE print area — the resolved template's trim, or the
   * silhouette's print area when no template is bound — and shrinks
   * the box when the trim is narrower than the default size, so a
   * freshly added node genuinely fits instead of merely looking
   * close. fitBox returns a box fully inside `area`, preserving
   * aspect when both dimensions are constrained. */
  const activePrintArea = useCallback(
    () => templateMeta?.stage.trim ?? getProductTemplate(productType).printArea,
    [templateMeta, productType],
  );
  const fitBox = useCallback(
    (w: number, h: number) => {
      const area = activePrintArea();
      const scale = Math.min(1, area.width / w, area.height / h);
      const fw = Math.round(w * scale);
      const fh = Math.round(h * scale);
      return {
        x: Math.round(area.x + (area.width - fw) / 2),
        y: Math.round(area.y + (area.height - fh) / 2),
        width: fw,
        height: fh,
      };
    },
    [activePrintArea],
  );

  const addText = useCallback(
    (text: string, fontFamily = "Space Grotesk", fontSize = 28) => {
      const area = activePrintArea();
      const width = Math.min(180, area.width);
      const node = defaultTextNode({
        text: text || "Your text",
        fontFamily,
        fontSize,
        width,
        x: Math.round(area.x + (area.width - width) / 2),
        y: Math.round(area.y + Math.min(70, Math.max(0, area.height - fontSize * 1.3))),
      });
      replaceEditorNodes((prev) => [...prev, node]);
      setSelectedId(node.id);
      markDirty();
    },
    [side, markDirty, activePrintArea],
  );

  const addShape = useCallback(
    (kind: "rect" | "circle") => {
      const area = activePrintArea();
      const id = `${kind}_${Date.now().toString(36)}`;
      const base = {
        id,
        name: kind === "rect" ? "Rectangle" : "Circle",
        fill: "#007c7d",
        stroke: "#ffffff",
        strokeWidth: 0,
        rotation: 0,
        opacity: 1,
        scaleX: 1,
        scaleY: 1,
      };
      if (kind === "circle") {
        const radius = Math.min(52, Math.floor(area.width / 2), Math.floor(area.height / 2));
        const node = {
          ...base,
          kind: "circle",
          x: Math.round(area.x + area.width / 2),
          y: Math.round(area.y + area.height / 2),
          radius,
          strokeWidth: 2,
        } as DesignNode;
        replaceEditorNodes((prev) => [...prev, node]);
      } else {
        const box = fitBox(110, 76);
        const node = {
          ...base,
          kind: "rect",
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          cornerRadius: 12,
        } as DesignNode;
        replaceEditorNodes((prev) => [...prev, node]);
      }
      setSelectedId(id);
      markDirty();
    },
    [side, markDirty, fitBox, activePrintArea],
  );

  const filteredThemes = THEMES.filter((t) =>
    t.name.toLowerCase().includes(themeSearch.toLowerCase()),
  );

  /* ---- Theme click (owner's order, 2026-11-02): a theme is a
   * Pollinations generation seed. Clicking one generates artwork
   * through /api/admin/inspire with that theme — the server composes
   * the theme's saved prompt and the shop's brand guidance into the
   * generation — and the picture lands on the canvas. The theme's
   * name is the seed, never the artwork itself. */
  const onThemeClick = useCallback(
    async (name: string) => {
      setSelectedTheme(name);
      setAiBusy(true);
      setAiAppliedNote(null);
      try {
        const res = await fetch("/api/admin/inspire", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: name,
            style: aiPreset,
            surprise: false,
            designId,
            projectId,
            ratio: aiRatio,
            themeName: name,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Generation failed");
        const appliedTheme =
          typeof data.appliedTheme === "string" ? data.appliedTheme : null;
        const appliedBrand = data.appliedBrand === true;
        setAiAppliedNote(
          appliedTheme && appliedBrand
            ? `Used your ${appliedTheme} prompt + brand settings.`
            : appliedTheme
              ? `Used your ${appliedTheme} prompt.`
              : appliedBrand
                ? "Used your brand settings."
                : null,
        );
        addImageNodeFromUrl(data.imageUrl, name);
        toast(`${name} artwork added`);
      } catch (e: any) {
        toast("AI generation failed: " + e.message);
      } finally {
        setAiBusy(false);
      }
    },
    [aiPreset, aiRatio, designId, projectId, addImageNodeFromUrl, toast],
  );
  const selectedNode = editorNodes.find((n) => n.id === selectedId) || null;

  // Flip the selected layer: a flip is stored as the SIGN of the
  // node's scale (scaleX/scaleY -1), so it saves, reloads and prints
  // exactly like any other transform.
  const flipSelected = useCallback(
    (axis: "x" | "y") => {
      if (!selectedNode) return;
      handleChange(
        selectedNode.id,
        (axis === "x"
          ? { scaleX: -(selectedNode.scaleX || 1) }
          : { scaleY: -(selectedNode.scaleY || 1) }) as Partial<DesignNode>,
      );
      handleCommit();
    },
    [selectedNode, handleChange, handleCommit],
  );
  const selectedAudit = selectedNode ? audit.perNode.get(selectedNode.id) : undefined;

  /* ---- Alignment matrix (Vector Positioning Center) ---- */
  const alignSelected = (dir: "LEFT" | "CENTER_H" | "RIGHT" | "TOP" | "CENTER_V" | "BOTTOM") => {
    if (!selectedNode) return;
    const area = activeBlankPage ?? templateMeta?.stage.trim ?? getProductTemplate(productType).printArea;
    const { w, h } = nodeCanvasSize(selectedNode);
    // Text nodes anchor at their top-left with width = node.width; the
    // generic footprint covers image/rect/circle uniformly.
    const patch: Partial<DesignNode> = {};
    if (dir === "LEFT") (patch as any).x = area.x;
    if (dir === "CENTER_H") (patch as any).x = Math.round(area.x + (area.width - w) / 2);
    if (dir === "RIGHT") (patch as any).x = Math.round(area.x + area.width - w);
    if (dir === "TOP") (patch as any).y = area.y;
    if (dir === "CENTER_V") (patch as any).y = Math.round(area.y + (area.height - h) / 2);
    if (dir === "BOTTOM") (patch as any).y = Math.round(area.y + area.height - h);
    handleChange(selectedNode.id, patch);
    markDirty();
  };

  /* ---- Layer reorder (visual order = reversed array order) ---- */
  const moveLayer = (id: string, dir: 1 | -1) => {
    replaceEditorNodes((list) => {
      const arr = [...list].reverse(); // visual top-first
      const i = arr.findIndex((n) => n.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return list;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr.reverse();
    });
    markDirty();
  };
  const dropLayer = (targetId: string) => {
    if (!dragLayerId || dragLayerId === targetId) return;
    replaceEditorNodes((list) => {
      const arr = [...list].reverse();
      const from = arr.findIndex((n) => n.id === dragLayerId);
      const to = arr.findIndex((n) => n.id === targetId);
      if (from < 0 || to < 0) return list;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return arr.reverse();
    });
    setDragLayerId(null);
    markDirty();
  };
  const variantColors = Array.from(
    new Set((catalogDetail?.variants ?? []).map((v) => v.color).filter(Boolean) as string[]),
  );

  /* Stage-fix: the selected colorway's catalog variant ids, in the
   * numeric form supplier_mockup_templates.catalog_variant_ids
   * carries. The editor's stage resolver matches the captured
   * template row against these ids; no match → the editor tints the
   * captured garment photo with garmentColor instead of leaving
   * another colorway's photo under a new label. Null while no
   * colorway is selected (the editor then behaves as before). */
  const selectedStageVariantIds = useMemo<number[] | null>(() => {
    if (!catalogDetail || !garmentColorName) return null;
    return (catalogDetail.variants ?? [])
      .filter((v) => v.color === garmentColorName)
      .map((v) => Number(v.external_id))
      .filter((n) => Number.isFinite(n));
  }, [catalogDetail, garmentColorName]);

  /* ---- Blank-page geometry for the non-product modes ---- */
  const activeBlankPage =
    mode === "sketch"
      ? { ...SKETCH_RECT, label: activeBoard?.name ?? "Sketch board" }
      : mode === "book" && book
        ? { ...fitPageRect(book.trimWIn, book.trimHIn), label: activePage?.label ?? "Page" }
        : mode === "annotate" && annotation
          ? {
              ...(annotation.nodes[0]?.kind === "image"
                ? {
                    x: annotation.nodes[0].x,
                    y: annotation.nodes[0].y,
                    width: (annotation.nodes[0] as ImageNode).width,
                    height: (annotation.nodes[0] as ImageNode).height,
                  }
                : fitPageRect(annotation.physWIn ?? 8.5, annotation.physHIn ?? 11)),
              label: annotation.sourceName,
            }
          : null;

  /* Walk-fix (2026-10-30): the Product tab's print-size/resolution
   * readout follows the BOUND stage. When a captured stage is bound,
   * it presents the captured supplier spec for the active side — the
   * same numbers the canvas guide shows — not the template's default
   * spec. No captured stage (or none for this side) → null, and the
   * readout renders the template spec exactly as before. */
  const boundStageSpec =
    productStage && catalogDetail
      ? stageSpecForSide(productStage, side)?.spec ?? null
      : null;

  /* Product-card grid + pager, shared by search results and the card
   * browser's product level (Level 3). */
  const catalogProductGrid = (
    <div className="design-cards" style={{ maxHeight: 330, overflowY: "auto" }}>
      {catalogBusy && <p className="small-muted">{searching ? "Searching…" : "Loading…"}</p>}
      {!catalogBusy && catalogResults.length === 0 && (
        <p className="small-muted">
          {searching ? "No matches — try “mug”, “hoodie”, “tumbler”…" : "No products here yet."}
        </p>
      )}
      {catalogResults.map((p) => (
        <div
          key={p.id}
          className="design-card"
          data-tip="Design on this product — the canvas, print size, and prices all come from it. Click it, or drag it onto the canvas."
          draggable
          onDragStart={(e) => handleCatalogProductDragStart(e, p)}
          onDragEnd={handleCatalogProductDragEnd}
          onClick={() => chooseCatalogProduct(p)}
          style={catalogDetail?.product.id === p.id ? { outline: "2px solid #007c7d" } : undefined}
        >
          {p.image_url
            ? <img src={p.image_url} alt="" draggable={false} style={{ width: "100%", height: 64, objectFit: "cover", borderRadius: 6 }} />
            : <div className="design-art">▧</div>}
          <p style={{ fontWeight: 600 }}>{p.name}</p>
          <p className="small-muted">
            {/* Kind label: the route derives it from classifyKind for
                every card; the fallback re-derives it the same way so
                a card never renders without one. */}
            {p.supplier_name ?? ""} · {p.productType ?? KIND_TO_PRODUCT_TYPE_FALLBACK[classifyKind(p.name)]}
            {p.minPrice != null ? ` · from $${p.minPrice.toFixed(2)}` : ""}
            {p.variant_count != null ? ` · ${p.variant_count} variants` : ""}
          </p>
        </div>
      ))}
    </div>
  );
  const catalogPager = catalogTotal > 0 && (
    <div className="catalog-pager">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        data-tip="Show the previous page of products."
        disabled={catalogBusy || catalogPage <= 1}
        onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
      >
        ← Prev
      </button>
      <span className="small-muted">
        Showing {catalogResults.length} of {catalogTotal} — page {catalogPage}
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        data-tip="Show the next page of products."
        disabled={catalogBusy || catalogPage * CATALOG_PAGE_SIZE >= catalogTotal}
        onClick={() => setCatalogPage((p) => p + 1)}
      >
        Next →
      </button>
    </div>
  );

  return (
    <div className="studio-root">
      {/* ============ ACTION BAR — slim, no logo/brand (owner order 2026-10-30: the fabric logo is removed from the studio altogether; the project actions compress into this one bar) ============ */}
      <header className="studio-actionbar">
        {/* Section links — the studio section's pages live on this ONE bar
            (owner order 2026-10-30 15:37 CDT: one bar, not three). Same
            labels and hrefs as the shell's section strip (nav-tree studio
            children); the shell strip no longer renders for this page.
            "Studio" is this page (btn-soft = current). */}
        <nav className="studio-seclinks" aria-label="Design Studio pages">
          <a className="btn btn-soft btn-sm" href="/admin/studio" data-tip="The Design Studio — place your artwork on products, then publish them to the shop.">Studio</a>
          <a className="btn btn-ghost btn-sm" href="/admin/studio/collection-builder" data-tip="Build a collection — group designs into a set that's shown and sold together.">Collection Builder</a>
          <a className="btn btn-ghost btn-sm" href="/admin/studio" data-tip="Your designs — this studio, where every design is made and saved.">Designs</a>
          <a className="btn btn-ghost btn-sm" href="/admin/collections" data-tip="Your collections — groups of products shown and sold together in the shop.">Collections</a>
        </nav>
        <div className="crumb"><span>Studio</span> <span style={{ margin: "0 7px", color: "#c4c4cd" }}>/</span> <b>{projectName}</b></div>
        {/* Mode tools — moved up onto this bar from the workspace (same
            buttons, same handlers; the separate mode row is gone). */}
        <div className="mode-switch" style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
          <button className={`btn btn-sm ${mode === "product" ? "btn-primary" : "btn-ghost"}`} onClick={() => switchMode("product")} data-tip="Design on the product itself — the blank garment, mug or other product, with its print area, supplier and print rules.">🛍 Product</button>
          <button className={`btn btn-sm ${mode === "sketch" ? "btn-primary" : "btn-ghost"}`} onClick={() => switchMode("sketch")} data-tip="Sketch boards: rough out an idea freehand first — pencil, shapes, words — then hand the board to the AI to paint it into finished artwork.">✏️ Sketch board</button>
          <button className={`btn btn-sm ${mode === "gang" ? "btn-primary" : "btn-ghost"}`} onClick={() => switchMode("gang")} data-tip="Gang sheet: fill one big DTF transfer sheet (for example 22 by 60 inches) with many artworks at once, then export the whole sheet as a single print file at 300 DPI.">🧩 Gang sheet</button>
          <button className={`btn btn-sm ${mode === "book" ? "btn-primary" : "btn-ghost"}`} onClick={() => switchMode("book")} data-tip="Book: design a multi-page book — a cover plus as many inside pages as you like, each page with its own layers — then export one print-ready PDF with a page per sheet at the trim size.">📖 Book</button>
          <button className={`btn btn-sm ${mode === "annotate" ? "btn-primary" : "btn-ghost"}`} onClick={() => switchMode("annotate")} data-tip="Annotate a PDF: open a print PDF — one this studio made, or one you upload — and draw, write and mark changes over the page, then export a flattened PDF with your marks baked in.">🖊 Annotate PDF</button>
        </div>
        <a className="btn btn-ghost btn-sm" href="/admin/products" data-tip="Open the product list — every product you can design on or sell.">
          <span aria-hidden="true">▤</span> Products
        </a>
        <a className="btn btn-ghost btn-sm" href="/admin/studio/collection-builder" data-tip="Build a collection — group designs into a set that's shown and sold together.">
          <span aria-hidden="true">▦</span> Collections
        </a>
        <div className="topspacer"></div>
        <span className="badge" data-tip="Where this design stands: Draft (private), In review (waiting for a check), Approved (ready to publish), or Published (live in the shop).">{STATUS_LABEL[designStatus] ?? designStatus}</span>
        <div className="status" data-tip="The save state of this design. If it says “Unsaved changes”, press Save design before you leave."><span className="dot"></span><span>{saveStatus}</span></div>
        <a className="btn btn-ghost btn-sm" href="/admin/studio/new-design" data-tip="Start a new design the guided way — pick a category, then a subcategory, then the product, one step at a time.">✦ New design</a>
        <button className="btn btn-ghost btn-sm" onClick={newDesign} data-tip="Start a fresh, empty design. The one you're looking at stays saved.">＋ New</button>
        <button className="btn btn-ghost btn-sm" onClick={openDesignList} data-tip="Open one of your saved designs and carry on where you left off.">↥ <span>Open project</span></button>
        <button className="btn btn-ghost btn-sm" onClick={() => saveDesign()} data-tip="Save this design exactly as it looks now, so you can leave and come back to it at any time.">↧ <span>Save design</span></button>
        {studioWindow.mode === "docked" ? (
          <button
            className="btn btn-sm"
            style={{ background: "#0a6400", border: "1px solid #0a6400", color: "#ffffff" }}
            onClick={() => studioWindow.setMode("float")}
            data-tip="Pop the studio out of the page into its own window — drag it anywhere, make it the full screen, or split it side by side with the page. Your design stays exactly as it is."
          >
            <PictureInPicture2 size={14} color="#ffffff" aria-hidden="true" /> Pop out
          </button>
        ) : (
          <button
            className="btn btn-sm"
            style={{ background: "#ffffff", border: "1px solid #dcdce4", color: "#171420" }}
            onClick={() => studioWindow.setMode("docked")}
            data-tip="Put the studio back in its tab, exactly as it was."
          >
            <PictureInPicture2 size={14} color="#171420" aria-hidden="true" /> Dock back
          </button>
        )}
        <button className="btn btn-primary btn-sm" disabled={publishLaunchBusy} onClick={() => { setRightTab("review"); void launchPublishWizard(); }} data-tip="Open the Publish wizard — the final checks and publishing for this design, one step at a time. Your current design is saved first. Nothing goes on sale until the wizard's last step.">Review & publish ↗</button>
      </header>

      {/* The internal global-nav strip no longer renders — it duplicated the
          shell's navigation (owner order 2026-10-30). Its destinations remain
          reachable via the shell nav, and Print post-processing remains
          reachable from the Review tab ("Open SVG post-processing"). */}

      {/* ============ MAIN 3-COLUMN LAYOUT ============ */}
      <main className="layout" id="designStudioRoute">
        {/* ---- LEFT SIDEBAR ---- */}
        <aside className="sidebar leftbar">
          {mode === "product" && (
            <div className="tabrow">
              <button className={`tab ${leftTab === "designs" ? "active" : ""}`} onClick={() => setLeftTab("designs")} data-tip="Your design library — themes, your uploaded artwork, and AI picture-making.">Designs</button>
              <button className={`tab ${leftTab === "text" ? "active" : ""}`} onClick={() => setLeftTab("text")} data-tip="Add words to your design, in ready-made lettering styles.">Text</button>
            </div>
          )}

          {mode === "sketch" && (
            <section id="sketchPanel">
              <div className="left-section">
                <div className="section-head"><h3>Sketch boards</h3><span className="badge">{boards.length}</span></div>
                <p className="small-muted">Sketch the idea first — pencil, shapes and words on a plain board — then hand the board to the AI below. Boards save with the design.</p>
                <div className="category-list">
                  {boards.map((b) => (
                    <div key={b.id} className={`category ${b.id === activeBoardId ? "active" : ""}`} onClick={() => { setActiveBoardId(b.id); setSelectedId(null); }} data-tip="Open this sketch board on the canvas.">
                      <span className="cat-icon">✏️</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{b.name}</span>
                      <span className="small-muted">{b.nodes.length}</span>
                      <button type="button" title="Delete this board" data-tip="Delete this sketch board. The product design itself is not touched." disabled={boards.length <= 1} onClick={(e) => { e.stopPropagation(); setBoards((prev) => prev.filter((x) => x.id !== b.id)); if (activeBoardId === b.id) setActiveBoardId(boards.find((x) => x.id !== b.id)?.id ?? null); markDirty(); }}>✕</button>
                    </div>
                  ))}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => addBoard()} data-tip="Start another blank sketch board inside this design — one design can hold many boards.">+ New board</button>
                {activeBoard && (
                  <div className="field" style={{ marginTop: 10 }}><label>Board name</label>
                    <input value={activeBoard.name} onChange={(e) => { setBoards((prev) => prev.map((x) => (x.id === activeBoard.id ? { ...x, name: e.target.value } : x))); markDirty(); }} data-tip="Name this board so you remember what the sketch is for." />
                  </div>
                )}
              </div>
              <div className="left-section">
                <div className="section-head"><h3>Deliver to AI</h3></div>
                <p className="small-muted">The AI paints a finished picture from this board. When image-to-image is available it paints FROM your sketch; otherwise your sketch is saved into the design’s asset vault and pinned here as the reference while the AI paints from your words.</p>
                <div className="field"><label>Describe the finished picture</label>
                  <textarea value={sketchPrompt} onChange={(e) => setSketchPrompt(e.target.value)} rows={3} placeholder="e.g. a grandmother and granddaughter baking together, warm storybook style" data-tip="Tell the AI what this sketch should become — the subject, the mood, the style. Your sketch gives it the layout; your words give it the finish." />
                </div>
                <button className="btn btn-primary" disabled={sketchBusy || !activeBoard} onClick={deliverSketchToAI} data-tip="Send this board to the AI now. Your sketch is saved to the design's vault either way.">{sketchBusy ? "Painting…" : "✨ Deliver sketch to AI"}</button>
                {sketchResult && (
                  <div style={{ marginTop: 12 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sketchResult.imageUrl} alt="AI painting from your sketch" style={{ width: "100%", borderRadius: 10, border: "1px solid #e4e4ea" }} />
                    <p className="small-muted" style={{ marginTop: 6 }}>{sketchResult.mode === "img2img" ? "Painted from your sketch." : "Image-to-image was not available — the sketch is saved in the vault and was pinned as the reference; this picture was painted from your words."}</p>
                    {sketchResult.sketchImageUrl && (
                      <p className="small-muted">Reference sketch: <a href={sketchResult.sketchImageUrl} target="_blank" rel="noreferrer">open the saved sketch</a></p>
                    )}
                    <button className="btn btn-primary btn-sm" onClick={addAiResultToCanvas} data-tip="Put this painting on the product canvas as a normal picture layer you can move, mask, flip and print.">Add to product canvas</button>
                  </div>
                )}
              </div>
            </section>
          )}

          {mode === "gang" && (
            <section id="gangPanel">
              <div className="left-section">
                <div className="section-head"><h3>Gang sheets</h3><span className="badge">{gangSheets.length}</span></div>
                <p className="small-muted">One big DTF transfer sheet filled with many artworks, printed in a single pass. Sheets save with the design; the export is one transparent PNG at exactly 300 DPI.</p>
                <div className="category-list">
                  {gangSheets.map((sh) => (
                    <div key={sh.id} className={`category ${activeSheet?.id === sh.id ? "active" : ""}`} onClick={() => { setActiveSheetId(sh.id); setGangSel(null); }} data-tip="Open this gang sheet on the canvas.">
                      <span className="cat-icon">🧩</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{sh.name}</span>
                      <span className="small-muted">{sh.items.length}</span>
                      <button type="button" title="Delete this sheet" data-tip="Delete this gang sheet. The product design itself is not touched." disabled={gangSheets.length <= 1} onClick={(e) => { e.stopPropagation(); setGangSheets((prev) => prev.filter((x) => x.id !== sh.id)); if (activeSheetId === sh.id) setActiveSheetId(gangSheets.find((x) => x.id !== sh.id)?.id ?? null); markDirty(); }}>✕</button>
                    </div>
                  ))}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => { const sh: GangSheet = { id: nextId("gang"), name: `Gang sheet ${gangSheets.length + 1}`, widthIn: 22, heightIn: 60, items: [] }; setGangSheets((prev) => [...prev, sh]); setActiveSheetId(sh.id); markDirty(); }} data-tip="Start another empty gang sheet inside this design.">+ New sheet</button>
                {activeSheet && (
                  <>
                    <div className="field" style={{ marginTop: 10 }}><label>Sheet name</label>
                      <input value={activeSheet.name} onChange={(e) => patchSheet({ ...activeSheet, name: e.target.value })} data-tip="Name this sheet so you remember what it is for." />
                    </div>
                    <div className="field"><label>Sheet size</label>
                      <select value={`${activeSheet.widthIn}x${activeSheet.heightIn}`} onChange={(e) => { const [w, h] = e.target.value.split("x").map(Number); patchSheet({ ...activeSheet, widthIn: w, heightIn: h }); }} data-tip="The physical size of the transfer sheet. 22 by 60 inches is the standard full DTF roll sheet; smaller sheets are cheaper for tests.">
                        {GANG_SIZES.map((sz) => (<option key={sz.label} value={`${sz.widthIn}x${sz.heightIn}`}>{sz.label}</option>))}
                      </select>
                    </div>
                    <p className="small-muted">
                      Sheet use: <b>{activeSheet.items.length ? Math.min(100, Math.round((activeSheet.items.reduce((a, it) => a + it.wIn * (it.wIn * it.aspect), 0) / (activeSheet.widthIn * activeSheet.heightIn)) * 100)) : 0}%</b>
                      {" "}({activeSheet.items.reduce((a, it) => a + it.wIn * (it.wIn * it.aspect), 0).toFixed(1)} of {(activeSheet.widthIn * activeSheet.heightIn).toFixed(0)} sq in placed)
                    </p>
                  </>
                )}
              </div>
              {activeSheet && (
                <div className="left-section">
                  <div className="section-head"><h3>Add artwork</h3></div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {productRender && (
                      <button className="btn btn-ghost btn-sm" onClick={() => addGangItem(productRender, `${projectName || "Design"} (front)`)} data-tip="Place a picture of the product design you were just editing onto this sheet.">🛍 This design (front)</button>
                    )}
                    <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }} data-tip="Upload a picture from this computer and place it on the sheet.">
                      ⬆ Upload artwork…
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = () => addGangItem(String(r.result), f.name); r.readAsDataURL(f); } e.target.value = ""; }} />
                    </label>
                  </div>
                  {assets.filter((a) => ["artwork", "inspiration", "sketch", "mockup"].includes(a.kind) && /\.(png|jpe?g|webp)$/i.test(a.storage_path)).length > 0 && (
                    <>
                      <p className="small-muted" style={{ marginTop: 10 }}>From this design’s vault:</p>
                      <div className="design-cards">
                        {assets.filter((a) => ["artwork", "inspiration", "sketch", "mockup"].includes(a.kind) && /\.(png|jpe?g|webp)$/i.test(a.storage_path)).map((a) => {
                          const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/design-files/${a.storage_path}`;
                          return (
                            <div key={a.id} className="design-card" style={{ cursor: "pointer" }} onClick={() => addGangItem(url, a.prompt ? a.prompt.slice(0, 40) : a.kind)} data-tip="Place this saved picture on the gang sheet.">
                              <div className="design-art" style={{ fontSize: 12, padding: 0, overflow: "hidden" }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt={a.kind} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              </div>
                              <p className="small-muted">{a.kind}</p>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {gangSel && activeSheet.items.find((it) => it.id === gangSel) && (() => {
                    const it = activeSheet.items.find((x) => x.id === gangSel)!;
                    return (
                      <div style={{ marginTop: 12 }}>
                        <p className="small-muted">Selected: <b>{it.name}</b> — {it.wIn.toFixed(1)}″ × {(it.wIn * it.aspect).toFixed(1)}″ · rotated {Math.round(it.rotation || 0)}°</p>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => patchSheet({ ...activeSheet, items: activeSheet.items.map((x) => (x.id === it.id ? { ...x, rotation: (x.rotation || 0) - 15 } : x)) })} data-tip="Turn the selected artwork 15 degrees counter-clockwise.">↺ 15°</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => patchSheet({ ...activeSheet, items: activeSheet.items.map((x) => (x.id === it.id ? { ...x, rotation: (x.rotation || 0) + 15 } : x)) })} data-tip="Turn the selected artwork 15 degrees clockwise.">↻ 15°</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => { patchSheet({ ...activeSheet, items: activeSheet.items.filter((x) => x.id !== it.id) }); setGangSel(null); }} data-tip="Take the selected artwork off the sheet.">Remove</button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
              {activeSheet && (
                <div className="left-section">
                  <div className="section-head"><h3>Export sheet</h3></div>
                  <p className="small-muted">Renders every placed artwork onto one transparent PNG at the sheet’s true size and 300 DPI. Sheets up to 20 MB are also saved as their own design with the print file attached; bigger sheets download to this computer.</p>
                  <button className="btn btn-primary" disabled={gangBusy || activeSheet.items.length === 0} onClick={exportGangSheet} data-tip="Build the print file for this gang sheet now — one PNG, exact sheet size, 300 DPI.">{gangBusy ? "Rendering sheet…" : "⬇ Export sheet PNG · 300 DPI"}</button>
                  {gangInfo && <p className="small-muted" style={{ marginTop: 8 }}>{gangInfo}</p>}
                </div>
              )}
            </section>
          )}

          {mode === "book" && (
            <section id="bookPanel">
              <div className="left-section">
                <div className="section-head"><h3>Book pages</h3><span className="badge">{book?.pages.length ?? 0}</span></div>
                <p className="small-muted">A book is a cover plus inside pages — a contractor’s price book, a keepsake book, a catalog. Every page has its own layers, designed with the same tools as everything else. The book saves with the design.</p>
                <div className="field"><label>Book size (trim)</label>
                  <select
                    value={book ? `${book.trimWIn}x${book.trimHIn}` : "8.5x11"}
                    onChange={(e) => { const [w, h] = e.target.value.split("x").map(Number); setBook((prev) => (prev ? { ...prev, trimWIn: w, trimHIn: h } : prev)); markDirty(); }}
                    data-tip="The finished size of the book once printed and trimmed. Every page exports at exactly this size."
                  >
                    {BOOK_TRIMS.map((t) => (<option key={t.label} value={`${t.w}x${t.h}`}>{t.label}</option>))}
                  </select>
                </div>
                <div className="category-list">
                  {(book?.pages ?? []).map((pg, i) => (
                    <div key={pg.id} className={`category ${i === activePageIdx ? "active" : ""}`} onClick={() => { setActivePageIdx(i); setSelectedId(null); }} data-tip="Open this page on the canvas and design it.">
                      <span className="cat-icon">{i === 0 ? "📕" : "📄"}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{pg.label}</span>
                      <span className="small-muted">{pg.nodes.length}</span>
                    </div>
                  ))}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => { setBook((prev) => (prev ? { ...prev, pages: [...prev.pages, { id: nextId("page"), label: `Page ${prev.pages.length + 1}`, nodes: [] }] } : prev)); markDirty(); }} data-tip="Add a new blank page to the end of the book.">+ Add page</button>
                {book && activePage && (
                  <>
                    <div className="field" style={{ marginTop: 10 }}><label>Page name</label>
                      <input value={activePage.label} onChange={(e) => { const v = e.target.value; setBook((prev) => (prev ? { ...prev, pages: prev.pages.map((pg, i) => (i === activePageIdx ? { ...pg, label: v } : pg)) } : prev)); markDirty(); }} data-tip="Name this page — the cover, a chapter, a price list — so the page list stays readable." />
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setBook((prev) => { if (!prev) return prev; const copy = { ...prev.pages[activePageIdx], id: nextId("page"), label: `${prev.pages[activePageIdx].label} copy`, nodes: JSON.parse(JSON.stringify(prev.pages[activePageIdx].nodes)) as DesignNode[] }; const pages = [...prev.pages]; pages.splice(activePageIdx + 1, 0, copy); return { ...prev, pages }; }); markDirty(); }} data-tip="Duplicate this page — handy when inside pages share a layout.">Duplicate</button>
                      <button className="btn btn-ghost btn-sm" disabled={activePageIdx === 0} onClick={() => { setBook((prev) => { if (!prev || activePageIdx === 0) return prev; const pages = [...prev.pages]; [pages[activePageIdx - 1], pages[activePageIdx]] = [pages[activePageIdx], pages[activePageIdx - 1]]; return { ...prev, pages }; }); setActivePageIdx(activePageIdx - 1); markDirty(); }} data-tip="Move this page earlier in the book.">↑ Earlier</button>
                      <button className="btn btn-ghost btn-sm" disabled={activePageIdx >= book.pages.length - 1} onClick={() => { setBook((prev) => { if (!prev || activePageIdx >= prev.pages.length - 1) return prev; const pages = [...prev.pages]; [pages[activePageIdx + 1], pages[activePageIdx]] = [pages[activePageIdx], pages[activePageIdx + 1]]; return { ...prev, pages }; }); setActivePageIdx(activePageIdx + 1); markDirty(); }} data-tip="Move this page later in the book.">↓ Later</button>
                      <button className="btn btn-ghost btn-sm" disabled={book.pages.length <= 1} onClick={() => { setBook((prev) => (prev ? { ...prev, pages: prev.pages.filter((_, i) => i !== activePageIdx) } : prev)); setActivePageIdx(Math.max(0, activePageIdx - 1)); markDirty(); }} data-tip="Delete this page from the book.">Delete page</button>
                    </div>
                  </>
                )}
              </div>
              <div className="left-section">
                <div className="section-head"><h3>Export the book</h3></div>
                <p className="small-muted">Binds every page into one print-ready PDF — one page per sheet, each at the trim size above, rendered at 300 DPI. The PDF is saved into this design’s files.</p>
                <button className="btn btn-primary" disabled={bookBusy || !book || book.pages.length === 0} onClick={exportBookPdf} data-tip="Render every page and save the finished book PDF now.">{bookBusy ? "Binding pages…" : "📖 Export book PDF"}</button>
                {bookInfo && <p className="small-muted" style={{ marginTop: 8 }}>{bookInfo}</p>}
              </div>
            </section>
          )}

          {mode === "annotate" && (
            <section id="annotatePanel">
              <div className="left-section">
                <div className="section-head"><h3>Annotate a PDF</h3></div>
                <p className="small-muted">Open a print PDF and mark it up — circle the change, arrow the problem, write the note — then export a flattened PDF with your marks baked in. The page sits on the board as a locked bottom layer; everything you add is a normal layer you can move, restyle or delete. Annotations save with the design.</p>
                <p className="small-muted">One honest limit: this opens PDFs whose pages are page pictures — which is what this studio’s own print PDFs are. A PDF drawn entirely from vector shapes cannot be opened this way; its print PNG annotates the same.</p>
                {assets.filter((a) => a.kind === "print-pdf").length > 0 && (
                  <>
                    <p className="small-muted" style={{ marginTop: 8 }}>This design’s saved PDFs:</p>
                    <div style={{ display: "grid", gap: 6 }}>
                      {assets.filter((a) => a.kind === "print-pdf").map((a) => (
                        <button key={a.id} className="btn btn-ghost btn-sm" disabled={annotateBusy} onClick={() => openPdfAsset(a)} data-tip="Open this saved print PDF on the annotation board.">📄 {a.storage_path.split("/").pop()}</button>
                      ))}
                    </div>
                  </>
                )}
                <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer", marginTop: 8 }} data-tip="Open a PDF — or a picture of a page (PNG or JPG) — from this computer.">
                  ⬆ Open a PDF or page picture…
                  <input type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAnnotateFile(f); e.target.value = ""; }} />
                </label>
                {annotation && (
                  <p className="small-muted" style={{ marginTop: 10 }}>
                    Open now: <b>{annotation.sourceName}</b> — {(annotation.physWIn ?? 0).toFixed(1)}″ × {(annotation.physHIn ?? 0).toFixed(1)}″ · {Math.max(0, annotation.nodes.length - 1)} annotation layer(s)
                  </p>
                )}
              </div>
              {annotation && (
                <div className="left-section">
                  <div className="section-head"><h3>Export annotated PDF</h3></div>
                  <p className="small-muted">Flattens the page and every mark over it into one new print PDF at the page’s true size, saved into this design’s files.</p>
                  <button className="btn btn-primary" disabled={annotateBusy} onClick={exportAnnotatedPdf} data-tip="Bake the page and your annotations into one flattened PDF now.">{annotateBusy ? "Working…" : "🖊 Export flattened PDF"}</button>
                  {annotateInfo && <p className="small-muted" style={{ marginTop: 8 }}>{annotateInfo}</p>}
                </div>
              )}
            </section>
          )}

          {mode === "product" && leftTab === "designs" && (
            <section id="designsPanel">
              <div className="left-section">
                <div className="section-head"><h3>Design themes</h3>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span className="badge">34 themes</span>
                    <button className="btn btn-ghost btn-sm" onClick={openThemeSettings} data-tip="Set the prompts and brand guidance the AI uses for your themes.">⚙ Theme settings</button>
                  </span>
                </div>
                <div className="search"><span>⌕</span><input
                  placeholder="Search themes..."
                  data-tip="Find a theme by name."
                  value={themeSearch}
                  onChange={(e) => setThemeSearch(e.target.value)}
                /></div>
                <div className="theme-grid">
                  {filteredThemes.map((t) => (
                    <button
                      key={t.name}
                      className={`theme ${selectedTheme === t.name ? "selected" : ""}`} data-tip={`The “${t.name}” theme — click to start a design from its ready-made card and lettering.`}
                      onClick={() => onThemeClick(t.name)}
                    >
                      <span className="emoji">{t.emoji}</span>
                      <span>{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="divider"></div>
              <div className="left-section">
                <div className="section-head"><h3>Design library</h3>
                  <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }} data-tip="Upload a picture from your computer — your own photo or artwork — to use in this design.">
                    ＋ Upload
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadArtwork(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <div className="design-cards">
                  {assets.length === 0 && (
                    <p className="small-muted">Uploaded artwork and saved files for this design appear here.</p>
                  )}
                  {assets.map((a) => {
                    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/design-files/${a.storage_path}`;
                    const addable = ["artwork", "inspiration", "mockup"].includes(a.kind);
                    return (
                      <div
                        key={a.id}
                        className="design-card"
                        data-tip={addable ? "Click or drag to put this picture on the canvas — then drag it where you want it." : undefined}
                        draggable={addable}
                        onDragStart={(e) => { if (addable) handleStudioImageDragStart(e, publicUrl, a.kind === "inspiration" ? "AI inspiration" : "Artwork"); }}
                        onClick={() => { if (addable) addImageNodeFromUrl(publicUrl, a.kind === "inspiration" ? "AI inspiration" : "Artwork"); }}
                        style={addable ? { cursor: "pointer" } : undefined}
                      >
                        <div className="design-art" style={{ fontSize: 12, padding: 0, overflow: "hidden" }}>
                          {/\.(png|jpe?g|webp)$/i.test(a.storage_path)
                            ? <img src={publicUrl} alt={a.kind} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : a.kind}
                        </div>
                        <p className="small-muted">{a.prompt ? a.prompt.slice(0, 42) : a.storage_path.split("/").pop()}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="divider"></div>
              <div className="left-section">
                <div className="section-head"><h3>Create design with AI</h3><span className="badge">Pollinations</span></div>
                <div className="field"><label>Aspect Ratio Lock</label>
                  <div className="ratio-row" role="group" aria-label="Aspect ratio lock">
                    {(["1:1", "4:5", "3:2"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={`ratio-btn ${aiRatio === r ? "active" : ""}`}
                        onClick={() => setAiRatio(r)}
                        data-tip={r === "1:1" ? "Square (1:1) — the AI paints a square picture." : r === "4:5" ? "Apparel (4:5) — a tall rectangle, the classic shirt-print shape." : "Landscape (3:2) — a wide picture, wider than it is tall."}
                      >
                        {r === "1:1" ? "1:1 Square" : r === "4:5" ? "4:5 Apparel" : "3:2 Landscape"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field"><label>Idea</label>
                  <textarea
                    value={aiPrompt}
                    data-tip="Describe the picture you’re imagining, in your own words — the AI paints from this description."
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="A loyal dog waiting by a screen door at golden hour…"
                    rows={3}
                  />
                </div>
                <div className="field"><label>Style preset</label>
                  <select value={aiPreset} onChange={(e) => setAiPreset(e.target.value)} data-tip="A ready-made art style for the AI picture — it steers the look, like watercolor or a bold poster.">
                    {AI_PRESETS.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="field-row">
                  <button className="btn btn-primary" style={{ flex: 1 }} disabled={aiBusy} onClick={() => generateInspiration(false)} data-tip="Ask the AI to paint your idea. It takes a few moments.">
                    {aiBusy ? "Generating…" : "✦ Generate"}
                  </button>
                  <button className="btn btn-ghost" disabled={aiBusy} onClick={() => generateInspiration(true)} data-tip="Let the AI choose the idea itself and paint something unexpected.">Surprise me</button>
                </div>
                {aiAppliedNote && (
                  <p className="small-muted" style={{ marginTop: 8 }}>{aiAppliedNote}</p>
                )}
                {aiPreview && (
                  <div style={{ marginTop: 10 }}>
                    <img src={aiPreview.url} alt={aiPreview.prompt} draggable onDragStart={(e) => handleStudioImageDragStart(e, aiPreview.url, "AI inspiration")} data-tip="This picture is already on your canvas — drag to add another copy where you drop it." style={{ width: "100%", borderRadius: 8, border: "1px solid #e6e6ec" }} />
                    <p className="small-muted" style={{ marginTop: 6 }}>{aiPreview.prompt}</p>
                    <button
                      className="btn btn-primary"
                      style={{ width: "100%", marginTop: 6 }}
                      data-tip="Put this AI picture on the canvas, where you can move it, size it, and print it."
                      onClick={() => addImageNodeFromUrl(aiPreview.url, "AI inspiration")}
                    >Add to canvas</button>
                  </div>
                )}
              </div>
            </section>
          )}

          {mode === "product" && leftTab === "text" && (
            <section id="textPanel">
              <div className="section-head"><h3>Add typography</h3></div>
              <p className="small-muted">Make it yours with editable text on the canvas.</p>
              <div className="field"><label>Text content</label><input defaultValue="Your design starts here" id="quickText" data-tip="Type the words you want on the design, then press the button below to place them." /></div>
              <button
                className="btn btn-primary"
                style={{ width: "100%" }}
                data-tip="Place these words on the canvas as text you can move, size, and restyle."
                onClick={() => {
                  const input = document.getElementById("quickText") as HTMLInputElement;
                  addText(input?.value || "Your text");
                }}
              >＋ Add text to canvas</button>
              <div className="divider"></div>
              <p className="eyebrow">Text styles</p>
              <div className="design-cards">
                <div className="design-card" data-tip="Add this lettering style to the canvas — you can change the words afterwards." onClick={() => addText("GOOD VIBES ONLY", "Space Grotesk", 30)}>
                  <div className="design-art" style={{ fontSize: 15, fontWeight: 800, letterSpacing: -1 }}>GOOD<br />VIBES ONLY</div><p>Bold statement</p>
                </div>
                <div className="design-card" data-tip="Add this lettering style to the canvas — you can change the words afterwards." onClick={() => addText("made with love", "Georgia", 28)}>
                  <div className="design-art" style={{ font: "italic 23px Georgia" }}>made with love</div><p>Classic script</p>
                </div>
                <div className="design-card" data-tip="Add this lettering style to the canvas — you can change the words afterwards." onClick={() => addText("EST. 2026", "DM Sans", 25)}>
                  <div className="design-art" style={{ fontSize: 17, letterSpacing: 3 }}>EST. 2026</div><p>Minimal</p>
                </div>
                <div className="design-card" data-tip="Add this lettering style to the canvas — you can change the words afterwards." onClick={() => addText("MAIN CHARACTER", "Space Grotesk", 23)}>
                  <div className="design-art" style={{ fontSize: 13, fontWeight: 800 }}>MAIN<br />CHARACTER</div><p>Retro block</p>
                </div>
              </div>
            </section>
          )}
        </aside>

        {/* ---- WORKSPACE (canvas) ---- */}
        <section className="workspace">
          {/* Mode tools live on the consolidated action bar above
              (owner order 2026-10-30: one bar — no separate mode row). */}
          <div className="canvas-toolbar">
            <div className="tool-group">
              <span className="toolbar-label">Canvas</span>
              <button className="hist-btn" data-tip="Step back — undo the last change you made to the design. (Keyboard: Ctrl+Z)" disabled={historyDepth.undo === 0} onClick={undo}>↶ Undo Action</button>
              <button className="hist-btn" data-tip="Step forward — redo a change you just undid. (Keyboard: Ctrl+Shift+Z)" disabled={historyDepth.redo === 0} onClick={redo}>↷ Redo Change</button>
              {(historyDepth.undo > 0 || historyDepth.redo > 0) && (
                <span className="small-muted" style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: ".04em" }}>
                  Command State Stack Active · {historyDepth.undo}↩ {historyDepth.redo}↪
                </span>
              )}
              <button className={`iconbtn ${tool === "select" ? "active" : ""}`} title="Select / move" data-tip="The select tool — click anything on the canvas to pick it, then drag it where you want it." onClick={() => setTool("select")}>↖</button>
              <button className="iconbtn" title="Add text" data-tip="Add a line of text to the canvas." onClick={() => addText("Your text")}>T</button>
              <button className="iconbtn" title="Add rectangle" data-tip="Add a rectangle shape to the canvas — handy for color blocks and backdrops." onClick={() => addShape("rect")}>▭</button>
              <button className="iconbtn" title="Add circle" data-tip="Add a circle shape to the canvas." onClick={() => addShape("circle")}>◯</button>
              <button className={`iconbtn ${tool === "draw" ? "active" : ""}`} title="Draw freehand — drag on the canvas" data-tip="Draw freehand on the design. Your stroke becomes a layer you can move, recolor, and resize." onClick={() => setTool(tool === "draw" ? "select" : "draw")}>✎</button>
              <button className={`iconbtn ${tool === "erase" ? "active" : ""}`} title="Eraser — rub out parts of a drawing" data-tip="The eraser: drag it over a freehand drawing to rub out the parts you sweep across. The drawing splits where you erase. Shapes, text and pictures are not strokes — delete those as layers instead." onClick={() => setTool(tool === "erase" ? "select" : "erase")}>⌦</button>
              <button className={`iconbtn ${tool === "line" ? "active" : ""}`} title="Straight line — drag on the canvas" data-tip="Draw a perfectly straight line: press where it starts, drag to where it ends, let go. It becomes a layer you can move, recolor, thicken and rotate." onClick={() => setTool(tool === "line" ? "select" : "line")}>─</button>
              <button className={`iconbtn ${tool === "arrow" ? "active" : ""}`} title="Arrow — drag on the canvas" data-tip="Draw an arrow: press at the tail, drag to the head, let go. Point at the thing you mean — a name, a date, the guest of honor." onClick={() => setTool(tool === "arrow" ? "select" : "arrow")}>➤</button>
              {tool === "erase" && (
                <>
                  <input type="range" min={6} max={40} step={1} value={eraseRadius} onChange={(e) => setEraseRadius(Number(e.target.value))} title="Eraser size" data-tip="How wide the eraser is — slide right for a bigger eraser." style={{ width: 80 }} />
                  <b style={{ fontSize: 11 }}>{eraseRadius}px</b>
                </>
              )}
              {(tool === "draw" || tool === "line" || tool === "arrow") && (
                <>
                  <input type="color" value={drawStroke.stroke} onChange={(e) => setDrawStroke((p) => ({ ...p, stroke: e.target.value }))} title="Stroke color" style={{ width: 30, height: 26, padding: 0, border: "none", background: "none", cursor: "pointer" }} />
                  <input type="range" min={1} max={24} step={1} value={drawStroke.strokeWidth} onChange={(e) => setDrawStroke((p) => ({ ...p, strokeWidth: Number(e.target.value) }))} title="Stroke width" style={{ width: 80 }} />
                  <b style={{ fontSize: 11 }}>{drawStroke.strokeWidth}px</b>
                </>
              )}
              <button className="iconbtn" title="Flip selected sideways" data-tip="Mirror the selected piece left-to-right. Pick a layer on the canvas first." disabled={!selectedNode} onClick={() => flipSelected("x")}>⇋</button>
              <button className="iconbtn" title="Flip selected upside-down" data-tip="Flip the selected piece upside-down. Pick a layer on the canvas first." disabled={!selectedNode} onClick={() => flipSelected("y")}>⇅</button>
            </div>
            <div className="tool-group">
              <button
                className="btn btn-ghost btn-sm"
                data-tip="Switch between the front and the back of the product. Each side is its own design — what you place here stays on this side."
                onClick={() => { setSide(side === "Front" ? "Back" : "Front"); setSelectedId(null); }}
              >⇄ Flip to {side === "Front" ? "back" : "front"}</button>
              <span className="small-muted">
                {(["Front", "Back"] as Surface[]).map((s) => `${s}: ${sides[s].length}`).join(" · ")}
              </span>
              <button className="iconbtn" title="Download PNG (this surface)" data-tip="Download a PNG picture of this side of the design, exactly as it looks now." onClick={downloadPNG}>⇩</button>
              <button className="btn btn-ghost btn-sm" title="Download this surface as a vector SVG on the print grid" data-tip="Download this side of the design as a real vector file, sized to the print area — for the post-processor or any vector tool." onClick={downloadSVG}>⬇ SVG</button>
              {/* Fit to view lived here as a ⤢ icon button — removed
                  2026-10-30: the bottom rail's Fit to Screen button is
                  its home now (owner's rail order), so the studio
                  carries one Fit control, not two. */}
            </div>
          </div>
          <div
            className={`canvas-area${catalogDropOver ? " catalog-drop-over" : ""}`}
            id="canvasArea"
            onDragEnter={handleCanvasDragEnter}
            onDragOver={handleCanvasDragOver}
            onDragLeave={handleCanvasDragLeave}
            onDrop={handleCanvasDrop}
          >
            {catalogDropOver && (
              <div className="canvas-drop-affordance" aria-live="polite">
                {dropKind === "image"
                  ? "Drop to put this picture on your design."
                  : "Drop to design on this product — the canvas, print size, and prices will come from it."}
              </div>
            )}
            <div className="canvas-frame" id="canvasFrame">
              <div className="product-label">{mode === "product" ? `${productType.toUpperCase()} · ${side.toUpperCase()}` : mode === "sketch" ? "SKETCH BOARD" : mode === "book" ? "BOOK PAGE" : mode === "annotate" ? "PDF ANNOTATION" : "GANG SHEET"}</div>
              {mode === "gang" && activeSheet ? (
                <GangSheetEditor
                  ref={gangRef}
                  sheet={activeSheet}
                  selectedItemId={gangSel}
                  onSelectItem={setGangSel}
                  onChange={patchSheet}
                />
              ) : (
              <CanvasEditor
                ref={editorRef}
                productType={productType}
                garmentColor={garmentColor}
                nodes={editorNodes}
                selectedId={selectedId}
                zoom={zoom}
                panMode={isPanActive}
                onZoomChange={handleEditorZoomChange}
                side={side}
                templateMeta={mode === "product" ? templateMeta : null}
                productStage={mode === "product" ? productStage : null}
                stageVariantIds={mode === "product" ? selectedStageVariantIds : null}
                blankPage={activeBlankPage}
                onSelect={handleSelect}
                onChange={handleChange}
                onCommit={handleCommit}
                onTextEditMode={handleTextEditMode}
                textEditId={textEditId}
                tool={tool}
                drawStroke={drawStroke}
                onDrawComplete={handleDrawComplete}
                eraseRadius={eraseRadius}
                onEraseComplete={handleEraseComplete}
              />
              )}
            </div>
            {mode !== "gang" && (
              <CanvasBottomRailControls
                zoom={zoom}
                totalZoom={liveZoom}
                isPanActive={isPanActive}
                togglePanMode={togglePanMode}
                handleFitToScreen={handleFitToScreen}
                handleZoomChange={handleZoomChange}
              />
            )}
            <div className="canvas-tip">{mode === "sketch" ? "✦ Sketch with the pencil, shapes and words — everything on the board is a layer you can move, erase and restyle · When it reads right, Deliver to AI paints it" : mode === "gang" ? "✦ Drag artworks to arrange them on the sheet · Drag a corner to resize, the top handle to rotate · The export is one transparent PNG at exactly 300 DPI" : "✦ Select an element to edit · Drag to reposition · Double-click text to edit · ✎ draws freehand · 🔒 locks a layer in place · Guides: red = bleed, violet = trim, green = safe"}</div>
          </div>
          {/* The black production bar that lived here is gone (owner
              order 2026-10-30: DPI belongs in the publish flow, not in
              studio chrome — "a step, not a black bar"). The supplier
              assignment, the design's DPI verdict, and any gate lock
              live in the Review tab's Production gate box; the auditor
              logic above still feeds them and still blocks Publish. */}
          <div className="canvas-footer">
            <span>{catalogDetail ? catalogDetail.product.name : productType} · {side} view</span>
            {/* The footer's − / % / ＋ / Reset zoom control lived here —
                removed 2026-10-30: zoom lives on the floating bottom
                rail now (owner's rail order), one zoom control total.
                The footer keeps the product · side label. */}
          </div>
        </section>

        {/* ---- RIGHT SIDEBAR ---- */}
        <aside className="sidebar rightbar">
          <div className="right-tabs">
            <button className={`right-tab ${rightTab === "design" ? "active" : ""}`} onClick={() => setRightTab("design")} data-tip="Design tools — the size, color, and position of the piece you’ve selected.">Design</button>
            <button className={`right-tab ${rightTab === "product" ? "active" : ""}`} onClick={() => setRightTab("product")} data-tip="Product setup — its name, price, category, and the words shoppers read.">Product</button>
            <button className={`right-tab ${rightTab === "review" ? "active" : ""}`} onClick={() => setRightTab("review")} data-tip="Final checks, then publishing — the safety gate that must pass before anything goes on sale.">Review</button>
          </div>

          {rightTab === "design" && (
            <div id="designInspector">
              <div className="section-head"><h3>Customize design</h3><span className="badge">{selectedNode ? "Selected" : "No selection"}</span></div>
              {!selectedNode && (
                <div className="empty-state">Select an element on your canvas to customize its size, color, and position.</div>
              )}
              {selectedNode && (
                <div>
                  <div className="field"><label>Vector Positioning Center</label>
                    <div className="align-grid">
                      <button type="button" onClick={() => alignSelected("LEFT")} data-tip="Line the selected piece up with the left edge of the print area.">Align L</button>
                      <button type="button" onClick={() => alignSelected("CENTER_H")} data-tip="Center the selected piece side-to-side in the print area.">Center H</button>
                      <button type="button" onClick={() => alignSelected("RIGHT")} data-tip="Line the selected piece up with the right edge of the print area.">Align R</button>
                      <button type="button" onClick={() => alignSelected("TOP")} data-tip="Line the selected piece up with the top edge of the print area.">Align T</button>
                      <button type="button" onClick={() => alignSelected("CENTER_V")} data-tip="Center the selected piece top-to-bottom in the print area.">Center V</button>
                      <button type="button" onClick={() => alignSelected("BOTTOM")} data-tip="Line the selected piece up with the bottom edge of the print area.">Align B</button>
                    </div>
                  </div>
                  <div className="field"><label>Layer name</label>
                    <input
                      value={selectedNode.name || "Artwork"}
                      data-tip="This layer’s name — just for your own tidiness. Shoppers never see it."
                      onChange={(e) => handleChange(selectedNode.id, { name: e.target.value } as Partial<DesignNode>)}
                    />
                  </div>
                  <div className="field-row">
                    <div className="field"><label>X position</label>
                      <input type="number" value={Math.round(selectedNode.x)} onChange={(e) => handleChange(selectedNode.id, { x: Number(e.target.value) } as Partial<DesignNode>)} data-tip="How far the piece sits from the left edge of the canvas — a bigger number moves it right." />
                    </div>
                    <div className="field"><label>Y position</label>
                      <input type="number" value={Math.round(selectedNode.y)} onChange={(e) => handleChange(selectedNode.id, { y: Number(e.target.value) } as Partial<DesignNode>)} data-tip="How far the piece sits from the top of the canvas — a bigger number moves it down." />
                    </div>
                  </div>
                  <div className="field-row">
                    <div className="field"><label>Opacity</label>
                      <input type="number" min={0} max={1} step={0.05} value={selectedNode.opacity} onChange={(e) => handleChange(selectedNode.id, { opacity: Number(e.target.value) } as Partial<DesignNode>)} data-tip="How see-through the piece is: 1 is fully solid, 0 is invisible, and 0.5 lets the fabric half show through." />
                    </div>
                    <div className="field"><label>Rotation °</label>
                      <input type="number" value={Math.round(selectedNode.rotation)} onChange={(e) => handleChange(selectedNode.id, { rotation: Number(e.target.value) } as Partial<DesignNode>)} data-tip="Turn the piece, in degrees. 0 is straight — try a small number like 5 or −5 for a gentle tilt." />
                    </div>
                  </div>
                  <div className="field-row">
                    <div className="field"><label>Flip / mirror</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => flipSelected("x")} data-tip="Mirror the selected piece left-to-right, like looking at it in a mirror. Click again to flip it back.">⇋ Flip sideways</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => flipSelected("y")} data-tip="Flip the selected piece upside-down. Click again to flip it back.">⇅ Flip upside-down</button>
                      </div>
                    </div>
                  </div>
                  {selectedNode.kind === "image" && (() => {
                    const f = (selectedNode as any).filters ?? { brightness: 0, contrast: 0, saturation: 1 };
                    const setF = (patch: any) => {
                      const next = { ...f, ...patch };
                      const isDefault = next.brightness === 0 && next.contrast === 0 && next.saturation === 1;
                      handleChange(selectedNode.id, { filters: isDefault ? undefined : next } as Partial<DesignNode>);
                    };
                    return (
                      <div className="field"><label>Artwork Image Controls</label>
                        {([
                          ["Brightness", "brightness", -1, 1, 0.05],
                          ["Contrast", "contrast", -100, 100, 5],
                          ["Saturation", "saturation", 0, 2, 0.1],
                        ] as const).map(([label, key, min, max, step]) => (
                          <div className="slider-row" key={key}>
                            <span>{label}</span>
                            <input
                              type="range" min={min} max={max} step={step} value={f[key]}
                              data-tip={key === "brightness" ? "Brightness — slide right to lighten the picture, left to darken it." : key === "contrast" ? "Contrast — slide right for bolder differences between light and dark; left softens them." : "Saturation — slide right for richer, stronger color; left washes the color towards grey."}
                              onChange={(e) => setF({ [key]: Number(e.target.value) })}
                            />
                            <b>{f[key]}</b>
                          </div>
                        ))}
                        <div className="slider-row">
                          <span>Texture blend</span>
                          <button
                            type="button"
                            className={`ratio-btn ${(selectedNode as any).blend === "multiply" ? "active" : ""}`}
                            data-tip="Texture blend: with Multiply on, the artwork melts into the fabric like real ink instead of sitting flat on top. Click to switch it on or off."
                            onClick={() => handleChange(selectedNode.id, { blend: (selectedNode as any).blend === "multiply" ? "normal" : "multiply" } as Partial<DesignNode>)}
                          >Multiply</button>
                        </div>
                        {(() => {
                          const natW = (selectedNode as any).naturalWidth as number | undefined;
                          const natH = (selectedNode as any).naturalHeight as number | undefined;
                          const crop = (selectedNode as any).crop as { x: number; y: number; width: number; height: number } | undefined;
                          if (!natW || !natH) {
                            return <p className="small-muted">Crop unlocks as soon as the image finishes loading.</p>;
                          }
                          const c = crop ?? { x: 0, y: 0, width: natW, height: natH };
                          const pct = {
                            left: Math.round((c.x / natW) * 100),
                            right: Math.round(((natW - (c.x + c.width)) / natW) * 100),
                            top: Math.round((c.y / natH) * 100),
                            bottom: Math.round(((natH - (c.y + c.height)) / natH) * 100),
                          };
                          const setEdge = (edge: "left" | "right" | "top" | "bottom", value: number) => {
                            const next = { ...c };
                            if (edge === "left") {
                              const rightEdge = c.x + c.width;
                              next.x = Math.min((value / 100) * natW, rightEdge - natW * 0.1);
                              next.width = rightEdge - next.x;
                            } else if (edge === "right") {
                              next.width = Math.max(natW * 0.1, natW - (value / 100) * natW - c.x);
                            } else if (edge === "top") {
                              const bottomEdge = c.y + c.height;
                              next.y = Math.min((value / 100) * natH, bottomEdge - natH * 0.1);
                              next.height = bottomEdge - next.y;
                            } else {
                              next.height = Math.max(natH * 0.1, natH - (value / 100) * natH - c.y);
                            }
                            const isFull = next.x <= 0 && next.y <= 0 && next.width >= natW && next.height >= natH;
                            handleChange(selectedNode.id, { crop: isFull ? undefined : next } as unknown as Partial<DesignNode>);
                          };
                          return (
                            <>
                              <div className="small-muted" style={{ marginTop: 10 }}>Crop — trim the photo edges (the print file uses the cropped frame)</div>
                              {(["left", "right", "top", "bottom"] as const).map((edge) => (
                                <div className="slider-row" key={edge}>
                                  <span style={{ textTransform: "capitalize" }}>{edge}</span>
                                  <input type="range" min={0} max={45} step={1} value={pct[edge]} onChange={(e) => setEdge(edge, Number(e.target.value))} />
                                  <b>{pct[edge]}%</b>
                                </div>
                              ))}
                              {crop && (
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleChange(selectedNode.id, { crop: undefined } as unknown as Partial<DesignNode>)}>Reset crop</button>
                              )}
                            </>
                          );
                        })()}
                        {(() => {
                          const ck = (selectedNode as any).chromaKey as { color: string; tolerance: number } | null | undefined;
                          return (
                            <>
                              <div className="slider-row" style={{ marginTop: 10 }}>
                                <span>Chroma key</span>
                                <button
                                  type="button"
                                  className={`ratio-btn ${ck ? "active" : ""}`}
                                  data-tip="Remove a solid background color from this photo — the color you pick becomes see-through."
                                  onClick={() => handleChange(selectedNode.id, { chromaKey: ck ? null : { color: "#00ff00", tolerance: 0.25 } } as unknown as Partial<DesignNode>)}
                                >{ck ? "On" : "Off"}</button>
                              </div>
                              {ck && (
                                <>
                                  <div className="slider-row">
                                    <span>Key color</span>
                                    <input type="color" value={ck.color} onChange={(e) => handleChange(selectedNode.id, { chromaKey: { ...ck, color: e.target.value } } as unknown as Partial<DesignNode>)} />
                                  </div>
                                  <div className="slider-row">
                                    <span>Tolerance</span>
                                    <input type="range" min={0.02} max={0.6} step={0.02} value={ck.tolerance} onChange={(e) => handleChange(selectedNode.id, { chromaKey: { ...ck, tolerance: Number(e.target.value) } } as unknown as Partial<DesignNode>)} />
                                    <b>{ck.tolerance.toFixed(2)}</b>
                                  </div>
                                </>
                              )}
                            </>
                          );
                        })()}
                        {(() => {
                          const mk = (selectedNode as any).mask as { shape: string; text?: string; fontFamily?: string; cornerRadius?: number } | null | undefined;
                          const setMask = (m: unknown) => handleChange(selectedNode.id, { mask: m } as unknown as Partial<DesignNode>);
                          const MASK_SHAPES: { id: string; label: string; tip: string }[] = [
                            { id: "circle", label: "Circle", tip: "Show the picture inside a circle — everything outside the circle disappears." },
                            { id: "rect", label: "Rounded", tip: "Show the picture inside a rounded-corner frame." },
                            { id: "heart", label: "Heart", tip: "Show the picture inside a heart shape." },
                            { id: "star", label: "Star", tip: "Show the picture inside a star shape." },
                            { id: "text", label: "Word", tip: "Show the picture inside the letters of a word you type — the letters become windows onto the picture." },
                          ];
                          return (
                            <>
                              <div className="small-muted" style={{ marginTop: 10 }}>Mask — show the picture inside a shape</div>
                              <div className="slider-row">
                                <span>Shape</span>
                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                  <button type="button" className={`ratio-btn ${!mk ? "active" : ""}`} data-tip="No mask — the whole picture shows, edge to edge." onClick={() => setMask(null)}>None</button>
                                  {MASK_SHAPES.map((s) => (
                                    <button key={s.id} type="button" className={`ratio-btn ${mk?.shape === s.id ? "active" : ""}`} data-tip={s.tip} onClick={() => setMask({ shape: s.id, text: mk?.text ?? "KIN", fontFamily: mk?.fontFamily ?? "Space Grotesk", cornerRadius: mk?.cornerRadius ?? 24 })}>{s.label}</button>
                                  ))}
                                </div>
                              </div>
                              {mk?.shape === "text" && (
                                <div className="slider-row">
                                  <span>Word</span>
                                  <input type="text" value={mk.text ?? ""} maxLength={14} onChange={(e) => setMask({ ...mk, text: e.target.value })} data-tip="The word whose letters the picture shows through. Short words read best." style={{ flex: 1, minWidth: 90 }} />
                                </div>
                              )}
                              {mk?.shape === "rect" && (
                                <div className="slider-row">
                                  <span>Corner roundness</span>
                                  <input type="range" min={0} max={60} step={1} value={mk.cornerRadius ?? 24} onChange={(e) => setMask({ ...mk, cornerRadius: Number(e.target.value) })} data-tip="How round the frame's corners are." />
                                  <b>{mk.cornerRadius ?? 24}</b>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    );
                  })()}
                  {"fill" in selectedNode && (
                    <div className="field"><label>Color</label>
                      <input type="color" data-tip="Pick this piece’s color." value={/^#[0-9a-f]{6}$/i.test((selectedNode as any).fill) ? (selectedNode as any).fill : "#007c7d"}
                        onChange={(e) => handleChange(selectedNode.id, { fill: e.target.value } as Partial<DesignNode>)} />
                    </div>
                  )}
                  {selectedNode.kind === "text" && (
                    <>
                      <div className="field"><label>Text</label>
                        <input value={(selectedNode as any).text} data-tip="The words themselves — type to change what the text says." onChange={(e) => handleChange(selectedNode.id, { text: e.target.value } as Partial<DesignNode>)} />
                      </div>
                      <div className="field"><label>Font family</label>
                        <select
                          data-tip="Pick the lettering style. The font is fully loaded before it’s applied, so the print matches what you see."
                          value={(selectedNode as any).fontFamily}
                          onChange={async (e) => {
                            const family = e.target.value;
                            // Load + verify the webfont BEFORE applying,
                            // so canvas text and exports never fall back.
                            await loadGoogleFont(family);
                            handleChange(selectedNode.id, { fontFamily: family } as Partial<DesignNode>);
                          }}
                        >
                          {FONT_FAMILY_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                      <div className="field-row">
                        <div className="field"><label>Font size</label>
                          <input type="number" min={6} max={120} value={(selectedNode as any).fontSize} onChange={(e) => handleChange(selectedNode.id, { fontSize: Number(e.target.value) } as Partial<DesignNode>)} data-tip="How big the letters are." />
                        </div>
                        <div className="field"><label>Letter spacing</label>
                          <input type="number" min={-2} max={30} step={0.5} value={(selectedNode as any).letterSpacing ?? 0} onChange={(e) => handleChange(selectedNode.id, { letterSpacing: Number(e.target.value) } as Partial<DesignNode>)} data-tip="The gap between letters — bigger numbers spread the word wider." />
                        </div>
                      </div>
                      <div className="field"><label>Line height</label>
                        <input type="number" min={0.8} max={2.5} step={0.05} value={(selectedNode as any).lineHeight ?? 1.15} onChange={(e) => handleChange(selectedNode.id, { lineHeight: Number(e.target.value) } as Partial<DesignNode>)} data-tip="The gap between lines, when the text runs onto more than one line." />
                      </div>
                      <div className="field"><label>Curved Lettering</label>
                        <div className="slider-row">
                          <span>On arc</span>
                          <button
                            type="button"
                            className={`ratio-btn ${(selectedNode as any).curve ? "active" : ""}`}
                            data-tip="Bend the words along an arc — like lettering over a pocket or around a badge. Click to switch it on or off."
                            onClick={() => handleChange(selectedNode.id, { curve: (selectedNode as any).curve ? null : { radius: 150, spacingDeg: 12 } } as Partial<DesignNode>)}
                          >{(selectedNode as any).curve ? "On" : "Off"}</button>
                        </div>
                        {(selectedNode as any).curve && (
                          <>
                            <div className="slider-row">
                              <span>Radius</span>
                              <input type="range" min={50} max={500} step={5} value={(selectedNode as any).curve.radius}
                                data-tip="How tight the curve is: small numbers bend the words sharply, big numbers make a gentle arc."
                                onChange={(e) => handleChange(selectedNode.id, { curve: { ...(selectedNode as any).curve, radius: Number(e.target.value) } } as Partial<DesignNode>)} />
                              <b>{(selectedNode as any).curve.radius}px</b>
                            </div>
                            <div className="slider-row">
                              <span>Spacing</span>
                              <input type="range" min={2} max={30} step={1} value={(selectedNode as any).curve.spacingDeg}
                                data-tip="How far apart the letters sit along the curve."
                                onChange={(e) => handleChange(selectedNode.id, { curve: { ...(selectedNode as any).curve, spacingDeg: Number(e.target.value) } } as Partial<DesignNode>)} />
                              <b>{(selectedNode as any).curve.spacingDeg}°</b>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                  <div className="field-row">
                    <button className="btn btn-ghost btn-sm" data-tip="A locked layer stays exactly where it is — it still prints, but it can't be dragged or resized until you unlock it." onClick={() => handleChange(selectedNode.id, { locked: !selectedNode.locked } as Partial<DesignNode>)}>
                      {selectedNode.locked ? "🔒 Locked — unlock" : "🔓 Lock layer"}
                    </button>
                    {selectedNode.kind === "group" && (
                      <button className="btn btn-ghost btn-sm" data-tip="Split this group back into its separate layers, exactly where they sit now." onClick={ungroupSelected}>Ungroup</button>
                    )}
                  </div>
                  {(selectedNode.kind === "line" || selectedNode.kind === "arrow") && (
                    <div className="field"><label>Pen stroke</label>
                      <div className="slider-row">
                        <span>Color</span>
                        <input type="color" value={(selectedNode as any).stroke} onChange={(e) => handleChange(selectedNode.id, { stroke: e.target.value } as unknown as Partial<DesignNode>)} />
                      </div>
                      <div className="slider-row">
                        <span>Width</span>
                        <input type="range" min={1} max={40} step={1} value={(selectedNode as any).strokeWidth} onChange={(e) => handleChange(selectedNode.id, { strokeWidth: Number(e.target.value) } as unknown as Partial<DesignNode>)} />
                        <b>{(selectedNode as any).strokeWidth}px</b>
                      </div>
                    </div>
                  )}
                  <div className="field-row">
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      const copy = { ...selectedNode, id: `${selectedNode.kind}_${Date.now().toString(36)}`, x: selectedNode.x + 18, y: selectedNode.y + 18 } as DesignNode;
                      replaceEditorNodes((prev) => [...prev, copy]);
                      setSelectedId(copy.id);
                      markDirty();
                    }} data-tip="Make an exact copy of the selected piece, placed just beside the original.">⧉ Duplicate</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      replaceEditorNodes((prev) => prev.filter((n) => n.id !== selectedId));
                      setSelectedId(null);
                      markDirty();
                    }} data-tip="Remove the selected piece from this design. If you change your mind, Undo brings it back.">⌫ Delete</button>
                  </div>
                </div>
              )}
              <div className="divider"></div>
              <div className="section-head"><h3>Layers · {mode === "product" ? side : mode === "sketch" ? (activeBoard?.name ?? "Sketch") : mode === "book" ? (activePage?.label ?? "Page") : mode === "annotate" ? "Annotations" : "Gang sheet"}</h3><span className="small-muted">{editorNodes.length} items</span></div>
              {multiIds.length >= 2 ? (
                <button className="btn btn-primary btn-sm" style={{ marginBottom: 8 }} data-tip="Combine the selected layers into one group that moves, scales, and locks together." onClick={groupSelected}>⛓ Group {multiIds.length} layers</button>
              ) : (
                <p className="small-muted" style={{ margin: "0 0 8px" }}>Shift-click layers to select several, then group them.</p>
              )}
              <div className="category-list">
                {editorNodes.length === 0 && <div className="small-muted">Your canvas is ready for its first design.</div>}
                {[...editorNodes].reverse().map((n) => (
                  <div
                    key={n.id}
                    className={`category layer-row ${n.id === selectedId ? "active" : ""}`}
                    style={multiIds.includes(n.id) && n.id !== selectedId ? { outline: "2px solid #007c7d", outlineOffset: -2 } : undefined}
                    draggable
                    onDragStart={() => setDragLayerId(n.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dropLayer(n.id)}
                    onClick={(e) => {
                      if (e.shiftKey) {
                        setMultiIds((prev) => (prev.includes(n.id) ? prev.filter((id) => id !== n.id) : [...prev, n.id]));
                      } else {
                        setMultiIds([]);
                        setSelectedId(n.id);
                      }
                    }}
                    data-tip="One layer of your design. Click to select it — or drag it up or down this list to change what sits on top. Shift-click to select several at once."
                    title="Drag to reorder · Shift-click to multi-select"
                  >
                    <span className="cat-icon">{n.kind === "text" ? "T" : n.kind === "image" ? "🖼" : n.kind === "line" ? "✎" : n.kind === "arrow" ? "➤" : n.kind === "group" ? "▦" : "▧"}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{n.name || "Artwork"}</span>
                    <span className="layer-arrows">
                      <button type="button" title={n.locked ? "Unlock layer" : "Lock layer in place"} data-tip={n.locked ? "Unlock this layer so it can be moved and edited again." : "Lock this layer in place — it still prints, but it cannot be dragged or changed until you unlock it."} onClick={(e) => { e.stopPropagation(); handleChange(n.id, { locked: !n.locked } as Partial<DesignNode>); }}>{n.locked ? "🔒" : "🔓"}</button>
                      <button type="button" title="Bring forward" data-tip="Bring this layer one step forward — it will cover more of the layers beneath it." onClick={(e) => { e.stopPropagation(); moveLayer(n.id, -1); }}>↑</button>
                      <button type="button" title="Send backward" data-tip="Send this layer one step back — the layers above it will cover more of it." onClick={(e) => { e.stopPropagation(); moveLayer(n.id, 1); }}>↓</button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {rightTab === "product" && (
            <div id="productInspector">
              <div className="section-head"><h3>Product setup</h3></div>
              <div className="field"><label>Product</label>
                <div className="search"><span>⌕</span><input
                  placeholder="Search 20,000+ products…"
                  data-tip="Search the suppliers’ catalogs — try “mug”, “hoodie”, or “tumbler”."
                  value={catalogQuery}
                  onChange={(e) => {
                    setCatalogQuery(e.target.value);
                    setCatalogPage(1);
                  }}
                /></div>
                {searching ? (
                  <>
                    {catalogProductGrid}
                    {catalogPager}
                  </>
                ) : browseProductsFor ? (
                  <>
                    <div className="browse-crumbs">
                      <button type="button" onClick={() => setBrowseProductsFor(null)}>← Back</button>
                      <span className="small-muted">
                        {browseProductsFor.name}
                        {catalogBusy ? "" : ` · ${catalogTotal} products`}
                      </span>
                    </div>
                    {catalogProductGrid}
                    {catalogPager}
                  </>
                ) : (
                  <>
                    <div className="browse-crumbs">
                      <button type="button" disabled={browsePath.length === 0} onClick={() => browseCrumbTo(-1)}>
                        All categories
                      </button>
                      {browsePath.map((n, i) => (
                        <span key={n.id} className="crumb-step">
                          <span className="sep">›</span>
                          <button type="button" onClick={() => browseCrumbTo(i)}>{n.name}</button>
                        </span>
                      ))}
                    </div>
                    {browseBusy && <p className="small-muted">Loading…</p>}
                    {!browseBusy && (
                      <div className="design-cards" style={{ maxHeight: 330, overflowY: "auto" }}>
                        {browsePath.length > 0 && (
                          <div
                            className="browse-card"
                            data-tip="See every product in this category, including its subcategories."
                            onClick={() => viewAllInCategory(browsePath[browsePath.length - 1])}
                          >
                            <p style={{ fontWeight: 600 }}>All products in {browsePath[browsePath.length - 1].name}</p>
                            <p className="small-muted">{browseParentCount} products</p>
                          </div>
                        )}
                        {browseCards.map((card) => (
                          <div
                            key={card.id}
                            className="browse-card"
                            data-tip={card.hasChildren ? `Open ${card.name} — see its subcategories.` : `See the products in ${card.name}.`}
                            onClick={() => openBrowseCard(card)}
                          >
                            <p style={{ fontWeight: 600 }}>{card.name}{card.hasChildren ? " ›" : ""}</p>
                            <p className="small-muted">{card.count} products</p>
                          </div>
                        ))}
                        {browseCards.length === 0 && (
                          <p className="small-muted">Nothing in this category yet.</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              {catalogDetail && (
                <div className="field"><label>Template · {catalogDetail.template.kind}</label>
                  <div className="detail-list">
                    <div><span className="detail-label">Product</span><span className="detail-value">{catalogDetail.product.name}</span></div>
                    <div><span className="detail-label">Supplier</span><span className="detail-value">{catalogDetail.product.supplier_name ?? "—"}</span></div>
                    <div><span className="detail-label">Print size</span><span className="detail-value">{boundStageSpec ? `${boundStageSpec.printWidthPx}×${boundStageSpec.printHeightPx}px` : `${catalogDetail.template.spec.widthPx}×${catalogDetail.template.spec.heightPx}px`}</span></div>
                    <div><span className="detail-label">Resolution</span><span className="detail-value">{boundStageSpec ? `${boundStageSpec.targetDpi} DPI · supplier spec` : `${catalogDetail.template.spec.dpi} DPI · ${catalogDetail.template.spec.source} spec`}</span></div>
                    <div><span className="detail-label">Bleed / safe</span><span className="detail-value">{catalogDetail.template.spec.bleedPx}px / {catalogDetail.template.spec.safePx}px</span></div>
                    <div><span className="detail-label">Variants</span><span className="detail-value">{catalogDetail.variants.length}</span></div>
                  </div>
                </div>
              )}
              {variantColors.length > 0 && (
                <div className="field"><label>Garment color</label>
                  <select
                    data-tip="Preview your design on this color of the product — the safe way to check light artwork on dark fabric."
                    value={garmentColorName ?? ""}
                    onChange={(e) => {
                      setGarmentColorName(e.target.value);
                      setGarmentColor(colorNameToHex(e.target.value));
                      markDirty();
                    }}
                  >
                    {variantColors.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <div className="field"><label>Print area</label>
                {/* Stage-fix: this readout reads the SAME bound-stage
                    source as the spec block above (boundStageSpec,
                    from stageSpecForSide). It previously read only
                    templateMeta.spec, so with a captured stage bound
                    it showed a third, unrelated set of numbers
                    (the template default 4500×5400px · 300 DPI)
                    under a correctly bound 1800×2400px · 150 DPI
                    spec block. Bound stage → captured spec; no
                    stage → the template spec, like the rest. */}
                <input value={boundStageSpec ? `${boundStageSpec.printWidthPx}×${boundStageSpec.printHeightPx}px · ${boundStageSpec.targetDpi} DPI` : templateMeta ? `${templateMeta.spec.widthPx}×${templateMeta.spec.heightPx}px · ${templateMeta.spec.dpi} DPI` : "—"} readOnly data-tip="The printable area of the chosen product, from its supplier print spec — artwork is placed inside it and checked against it before publishing." />
              </div>
              <div className="field"><label>Project name</label>
                <input value={projectName} onChange={(e) => { setProjectName(e.target.value); markDirty(); }} placeholder="Name this design project" data-tip="Your private name for this project, so you can find it later. Only you see it." />
              </div>
              <div className="field"><label>Product title</label>
                <input value={productTitle} onChange={(e) => { setProductTitle(e.target.value); markDirty(); }} placeholder="Customer-facing product name" data-tip="The name shoppers see on the product page." />
              </div>
              <div className="field"><label>Retail price (USD)</label>
                <input type="number" min="0" step=".01" value={retailPrice} onChange={(e) => { setRetailPrice(e.target.value); markDirty(); }} data-tip="What shoppers pay, in dollars. The supplier’s cost and your estimated margin are shown just below." />
              </div>
              {catalogDetail && (() => {
                const costs = catalogDetail.variants.map((v) => v.price_snapshot).filter((p): p is number => p != null);
                const minCost = costs.length ? Math.min(...costs) : null;
                const price = Number(retailPrice) || 0;
                return minCost != null ? (
                  <p className="small-muted">
                    Supplier cost from ${minCost.toFixed(2)}
                    {price > 0 ? ` · est. margin $${(price - minCost).toFixed(2)} (${Math.round(((price - minCost) / price) * 100)}%) before shipping/fees` : ""}
                  </p>
                ) : null;
              })()}
              <div className="field"><label>Product category</label>
                <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); markDirty(); }} data-tip="The shelf this product sits on in your shop — shoppers browse by category.">
                  <option value="">Choose a category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{"— ".repeat(Math.min(c.depth, 3))}{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="field"><label>Collection / folder</label>
                <select value={collectionId} onChange={(e) => { setCollectionId(e.target.value); markDirty(); }} data-tip="The collection this product belongs to. A collection must use one printing supplier — if this choice mixes suppliers, the warning below explains.">
                  <option value="">No collection</option>
                  {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Product description</label>
                <textarea value={description} onChange={(e) => { setDescription(e.target.value); markDirty(); }} placeholder="Describe the product, materials, fit, and who it's for..." rows={4} data-tip="The words on the product page — what it is, what it’s made of, and who it’s for." />
              </div>
              <div className="divider"></div>
              <div className="action-stack">
                <button className="btn btn-primary" onClick={() => saveDesign()} data-tip="Save this designed product — the design, the product, the price, and the description, all together.">Save designed product ↗</button>
                <button className="btn btn-ghost" onClick={() => saveDesign()} data-tip="Save the design to your account's cloud storage, so it's there on any computer you sign in on.">↧ Save to cloud</button>
                <button className="btn btn-ghost" onClick={exportPrintFiles} data-tip="Create the actual print files now — the sharp, full-size artwork the printer will use — and store them ready for orders.">⇩ Export print files to storage</button>
                <button className="btn btn-ghost" onClick={downloadSVG} data-tip="Download this side of the design as a real vector file, sized to the print area.">⬇ Download SVG (this side)</button>
                <button className="btn btn-ghost" onClick={exportPrintPdf} data-tip="Create a print-ready PDF at the exact physical size of the print area, with the artwork's transparency preserved — for handing to a printer.">⇩ Export print-ready PDF</button>
              </div>
            </div>
          )}

          {rightTab === "review" && (
            <div id="reviewPanel">
              <div className="section-head"><h3>Review & publish</h3><span className="status-pill">{STATUS_LABEL[designStatus] ?? designStatus}</span></div>
              <p className="small-muted">
                Draft → in review → ready → published. Publishing creates the storefront
                product with variants mapped from {catalogDetail?.product.supplier_name ?? "the supplier"} and
                links this design to every variant.
              </p>
              <div className="gate-box" data-tip="The production gate is a safety check before anything goes on sale: is the picture sharp enough to print well (300 DPI), and does the whole collection use one supplier? If anything fails, Publish stays locked and the reason is written here, in red.">
                <p className="eyebrow">Production gate</p>
                <p className="small-muted">
                  Supplier: <b>{catalogDetail?.product.supplier_name ?? "Unassigned"}</b>
                  {collectionId ? " · Collection checked (Rule A)" : " · No collection"}
                </p>
                <p className="small-muted">
                  Resolution: {audit.worstDpi === null
                    ? "no raster artwork — vector/text only"
                    : audit.isPrintReady
                      ? <span style={{ color: "#22754a" }}>✓ lowest layer {audit.worstDpi} DPI (≥ {TARGET_DPI})</span>
                      : <span style={{ color: "#b3372f" }}>✗ lowest layer {audit.worstDpi} DPI — {TARGET_DPI} required</span>}
                </p>
                {selectedNode?.kind === "image" && selectedAudit && (
                  <p className="small-muted">
                    Selected picture: {selectedAudit.isPrintReady
                      ? <span style={{ color: "#22754a" }}>✓ {selectedAudit.dpi} DPI at {selectedAudit.physicalWidthIn.toFixed(1)}&quot; x {selectedAudit.physicalHeightIn.toFixed(1)}&quot; (original {selectedAudit.naturalResolution})</span>
                      : <span style={{ color: "#b3372f" }}>✗ {selectedAudit.dpi} DPI at {selectedAudit.physicalWidthIn.toFixed(1)}&quot; x {selectedAudit.physicalHeightIn.toFixed(1)}&quot; (original {selectedAudit.naturalResolution}) — too low, it would print blurry</span>}
                  </p>
                )}
                {gateReasons.map((r, i) => (
                  <p key={i} className="small-muted" style={{ color: "#b3372f" }}>⚠ {r}</p>
                ))}
                {!publishBlocked && <p className="small-muted" style={{ color: "#22754a" }}>✓ All production gates pass</p>}
              </div>
              <button className="btn btn-ghost" style={{ width: "100%" }} onClick={runPreflightCheck} data-tip="Run the final safety check — artwork sharpness (DPI), print area, and supplier rules — and see anything that would block publishing.">Run preflight</button>
              {preflight && (
                <div style={{ marginTop: 10 }}>
                  {preflight.ok
                    ? <p className="small-muted" style={{ color: "#22754a" }}>✓ Preflight passed{preflight.warnings.length ? ` with ${preflight.warnings.length} warning(s)` : ""}.</p>
                    : <p className="small-muted" style={{ color: "#b3372f" }}>✗ {preflight.errors.length} blocking issue(s).</p>}
                  {preflight.errors.map((i: any, k: number) => (
                    <p key={`e${k}`} className="small-muted" style={{ color: "#b3372f" }}>• {i.surface ? `${i.surface}: ` : ""}{i.message}</p>
                  ))}
                  {preflight.warnings.map((i: any, k: number) => (
                    <p key={`w${k}`} className="small-muted" style={{ color: "#9a6a12" }}>• {i.surface ? `${i.surface}: ` : ""}{i.message}</p>
                  ))}
                </div>
              )}
              <div className="divider"></div>
              <button className="btn btn-primary" style={{ width: "100%" }} disabled={publishLaunchBusy} onClick={() => void launchPublishWizard()} data-tip="Open the Publish wizard: step 1 confirms the product, step 2 runs the artwork and print checks (including the DPI sharpness gate) against the supplier's captured spec — then collection, price, destinations, and publish, one step at a time. Your current design is saved first, so the checks see the artwork exactly as it stands.">
                {publishLaunchBusy ? "Saving & opening…" : "Publish wizard — step by step ↗"}
              </button>
              <p className="small-muted" style={{ marginTop: 6 }}>
                The guided way to publish: product first, then the print
                checks. The buttons below remain the direct lifecycle for
                this tab.
              </p>
              {publishLaunchError && (
                <p className="small-muted" role="alert" style={{ color: "#b3372f", marginTop: 6 }}>
                  {publishLaunchError}
                </p>
              )}
              <div className="divider"></div>
              <div className="action-stack">
                <button className="btn btn-primary" disabled={lifecycleBusy || designStatus !== "draft" && designStatus !== "publish_failed"} onClick={() => lifecycle("submit")} data-tip="Send this design for a review — the step where it gets a careful check before it can go on sale.">
                  Submit for review
                </button>
                <button className="btn btn-primary" disabled={lifecycleBusy || designStatus !== "needs_review"} onClick={() => lifecycle("approve")} data-tip="Approve the design. It still isn't on sale — approving just says “this is ready to publish”.">
                  Approve — ready to publish
                </button>
                <span style={{ display: "block" }} data-tip={publishBlocked
                  ? `The production gate is holding this back right now: ${gateReasons[0] ?? "a check hasn't passed"}. This button still opens the Publish wizard — its Step 2 runs this same gate in plain words and shows exactly what to fix. DPI means how sharp your picture is: printers need 300 DPI. If a picture is too small for the space it's stretched over, it prints blurry — so nothing can go on sale until the artwork is sharp enough, and until the whole collection uses one supplier.`
                  : "Open the Publish wizard, which publishes this design to your shop: it runs the final checks, then collection, price and destinations, and the last step puts it on sale. Your current design is saved first."}>
                  <button className="btn btn-primary" style={{ width: "100%" }} disabled={publishLaunchBusy} onClick={() => void launchPublishWizard()}>
                    {publishLaunchBusy ? "Saving & opening…" : "Publish to storefront ↗"}
                  </button>
                </span>
                <button className="btn btn-ghost" disabled={lifecycleBusy || designStatus !== "published"} onClick={() => lifecycle("unpublish")} data-tip="Take this design off sale. It disappears from the shop, but the design itself stays saved — you can publish it again any time.">
                  Unpublish
                </button>
                <button className="btn btn-ghost" disabled={lifecycleBusy} onClick={() => lifecycle("archive")} data-tip="File this design away in the archive. It's removed from your working list but never deleted — you can bring it back.">
                  Archive design
                </button>
              </div>
              {publishedUrl && (
                <p className="small-muted" style={{ marginTop: 10 }}>
                  Live at <a href={publishedUrl}>{publishedUrl}</a>
                </p>
              )}
              <div className="divider"></div>
              <button className="btn btn-ghost" style={{ width: "100%" }} onClick={() => setShowPost(true)} data-tip="Post-processing — expert tools that polish the artwork file itself (vector traces, halftone effects) before printing. Most designs never need this.">
                ⚙ Open SVG post-processing (Fabric.js)
              </button>
            </div>
          )}
        </aside>
      </main>

      {/* ============ OPEN PROJECT MODAL ============ */}
      {showOpen && (
        <div className="studio-modal-backdrop" onClick={() => setShowOpen(false)}>
          <div className="studio-modal" onClick={(e) => e.stopPropagation()}>
            <div className="section-head"><h3>Open project</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowOpen(false)}>✕</button>
            </div>
            <div className="category-list">
              {designList.length === 0 && <p className="small-muted">No saved designs yet.</p>}
              {designList.map((d) => (
                <button key={d.id} className="category" onClick={() => loadDesign(d.id)}>
                  <span className="cat-icon">✎</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.product_title || d.name}
                  </span>
                  <span className="count">{STATUS_LABEL[d.status] ?? d.status}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============ THEME SETTINGS MODAL ============ */}
      {showThemeSettings && (
        <div className="studio-modal-backdrop" onClick={() => setShowThemeSettings(false)}>
          <div className="studio-modal studio-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="section-head"><h3>Theme settings</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowThemeSettings(false)}>✕</button>
            </div>
            <p className="small-muted" style={{ marginBottom: 14 }}>
              Tell the AI who your brand is and what each theme should look like. It reads all of this before it paints a picture.
            </p>
            {tsLoading && <p className="small-muted" style={{ marginBottom: 10 }}>Loading your settings…</p>}
            {tsLoadError && (
              <div style={{ marginBottom: 12 }}>
                <p className="small-muted" style={{ color: "#b3372f", marginBottom: 8 }}>{tsLoadError}</p>
                <button className="btn btn-ghost btn-sm" onClick={() => void loadThemeSettings()} data-tip="Try loading your settings again.">Try again</button>
              </div>
            )}
            <div className="section-head"><h3>Your brand</h3></div>
            <div className="field"><label>Brand summary</label>
              <textarea
                rows={3}
                disabled={tsLoading || !tsLoaded || tsSaving}
                value={tsBrand.brandSummary}
                onChange={(e) => setTsBrand((b) => ({ ...b, brandSummary: e.target.value }))}
                placeholder="What your shop is, who it is for, and what makes it yours."
                data-tip="What your brand is, in a few sentences — the AI reads this before it paints anything."
              />
            </div>
            <div className="field-row">
              <div className="field"><label>Brand colors</label>
                <input
                  disabled={tsLoading || !tsLoaded || tsSaving}
                  value={tsBrand.brandColors}
                  onChange={(e) => setTsBrand((b) => ({ ...b, brandColors: e.target.value }))}
                  placeholder="e.g. Deep purple, cream, and gold"
                  data-tip="The colors your brand uses — the AI leans on these in every picture."
                />
              </div>
              <div className="field"><label>Brand voice</label>
                <input
                  disabled={tsLoading || !tsLoaded || tsSaving}
                  value={tsBrand.brandVoice}
                  onChange={(e) => setTsBrand((b) => ({ ...b, brandVoice: e.target.value }))}
                  placeholder="e.g. Warm, playful, a little nostalgic"
                  data-tip="How your brand feels — playful, elegant, cozy — the AI matches this mood in its pictures."
                />
              </div>
            </div>
            <div className="field"><label>Extra prompt guidance</label>
              <textarea
                rows={2}
                disabled={tsLoading || !tsLoaded || tsSaving}
                value={tsBrand.promptGuidance}
                onChange={(e) => setTsBrand((b) => ({ ...b, promptGuidance: e.target.value }))}
                placeholder="Rules the AI should always follow, for every theme."
                data-tip="Any extra rules for the AI — things to always include, or never include, in its pictures."
              />
            </div>
            <div className="divider"></div>
            <div className="section-head"><h3>Theme prompts</h3></div>
            <p className="small-muted" style={{ marginBottom: 10 }}>
              Pick a theme, then write the instructions the AI follows whenever it paints for that theme. Leave a theme blank to use your brand guidance only.
            </p>
            <div className="field"><label>Theme</label>
              <select
                disabled={tsLoading || !tsLoaded || tsSaving}
                value={tsThemeName}
                onChange={(e) => setTsThemeName(e.target.value)}
                data-tip="Choose the theme you want to write a prompt for."
              >
                {THEMES.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.emoji} {t.name}{(tsPrompts[t.name] ?? "") !== "" ? " — has a prompt" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="field"><label>Prompt for this theme</label>
              <textarea
                rows={4}
                disabled={tsLoading || !tsLoaded || tsSaving}
                value={tsPrompts[tsThemeName] ?? ""}
                onChange={(e) => setTsPrompts((p) => ({ ...p, [tsThemeName]: e.target.value }))}
                placeholder="Describe the look you want for this theme — subjects, style, mood, colors."
                data-tip="The instructions the AI follows for this theme — describe the pictures you want back."
              />
            </div>
            {tsSaveError && <p className="small-muted" style={{ color: "#b3372f", marginBottom: 10 }}>{tsSaveError}</p>}
            {tsSavedNote && <p className="small-muted" style={{ marginBottom: 10 }}>{tsSavedNote}</p>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowThemeSettings(false)} data-tip="Close this box. Anything you have not saved stays unsaved.">Close</button>
              <button className="btn btn-primary" disabled={tsSaving || tsLoading || !tsLoaded} onClick={() => void saveThemeSettings()} data-tip="Save your brand and theme prompts — the AI uses them from the next picture on.">{tsSaving ? "Saving…" : "Save settings"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ============ POST-PROCESS DRAWER (Fabric.js — separate canvas) ============ */}
      {showPost && (
        <div className="studio-modal-backdrop" onClick={() => setShowPost(false)}>
          <div className="studio-modal studio-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="section-head"><h3>Print post-processing</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPost(false)}>✕ Close</button>
            </div>
            <PostProcessor
              designId={designId}
              printWidthPx={templateMeta?.spec.widthPx}
              onUploaded={() => toast("Post-processed print file stored")}
            />
          </div>
        </div>
      )}

      {/* Toast */}
      <div className={`toast ${toastVisible ? "show" : ""}`}>{toastMsg}</div>
    </div>
  );
}
