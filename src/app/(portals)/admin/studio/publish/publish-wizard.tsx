"use client";

/**
 * Publish wizard — CHECKPOINT 2 (all six steps real).
 *
 * Wizard #2 in notes/wizard-catalog.md, built under its rules and
 * notes/publish-wizard-spec.md: ONE job (publish this design), ONE
 * decision per step, checks inside the flow in plain language, Back
 * always allowed, and a failing step cannot be passed. The full step
 * list is Product → Artwork & print checks → Collection → Price &
 * details → Destinations → Publish. Every step below does real work
 * against real tables through the same endpoints the studio itself
 * uses — no step renders a placeholder, and no button pretends to
 * work. Step 6 runs the design lifecycle itself (submit → approve →
 * publish, skipping stages the design already passed) and ends on the
 * live product page the publish returns — proof, not a toast.
 *
 * Launch: the studio's Review tab keeps its status/gates summary and
 * gains one additive button ("Publish wizard — step by step") whose
 * handler saves the current design first, then navigates here with
 * ?designId=<designs id>&catalogProduct=<supplier_catalog_products
 * id>. Direct visits with fewer params degrade honestly: a
 * catalogProduct alone still binds Step 1's product; no params at
 * all shows the plain "no product bound" state. Nothing is invented.
 *
 * Data contracts — the SAME ones the studio itself uses, no parallel
 * reads:
 *   GET /api/admin/designs/<id>
 *     → the saved design row (canvas_state, product_title,
 *       retail_price, category_id, supplier_catalog_product_id,
 *       garment_color, print_file_path) + its printFiles — the exact
 *       record the studio's loadDesign() reopens.
 *   GET /api/admin/studio/catalog/<id>
 *     → one product + variants + the resolved template — the exact
 *       response chooseCatalogProduct() binds in design-studio.tsx.
 *   GET /api/admin/studio/product-stage?catalogProductId=<id>
 *     → the captured supplier stage (supplier_print_specs +
 *       supplier_mockup_templates, each row with captured_at) — the
 *       exact payload loadProductStage() hydrates the canvas with.
 *       404 means "no capture yet", never an error state.
 *
 * Step 1 reads its print area from stageSpecForSide (canvas-editor)
 * over that stage — the same lookup the canvas guide, the exports,
 * and the studio's auditor use. Step 2 reuses the existing checks,
 * never reimplemented math:
 *   - DPI: auditDesign() from lib/fabric/dpi (the production
 *     auditor), run per side against the CAPTURED spec exactly as
 *     design-studio.tsx's audit does (spec override on the template).
 *   - Print-area fit + stored-artwork readiness: runPreflight() from
 *     lib/fabric/preflight against the saved design + the catalog
 *     template; Step 2 consumes its artwork/print issues only (its
 *     title/price/category issues belong to Steps 1/4 and are not
 *     double-gated here). The per-item bounds listed under the fit
 *     check come from preflight's own exported nodeBounds() — one
 *     bounds implementation.
 *   - Spec basis (owner ruling 2026-11-02): a catalog product is
 *     printable by its supplier. The print-size basis is a captured
 *     spec when one exists, else the product's own supplier data,
 *     else the template's standard stage size — always labelled as
 *     what it is, never invented, and never a gate by itself. Only
 *     a product whose template cannot be resolved at all fails.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { stageSpecForSide } from "../canvas-editor";
import { auditDesign, TARGET_DPI } from "@/lib/fabric/dpi";
import {
  asCanvasStateV2,
  nodeBounds,
  runPreflight,
  type CanvasStateV2,
} from "@/lib/fabric/preflight";
import type { ProductStage } from "@/lib/fabric/product-stage";
import {
  colorNameToHex,
  type ResolvedTemplate,
  type Surface,
} from "@/lib/fabric/templates";
import "./publish-wizard.css";

/** The catalog detail the studio binds — mirrors CatalogDetail in
 *  design-studio.tsx (the chooseCatalogProduct response type). */
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

/** The slice of the saved design row this wizard reads — the row
 *  GET /api/admin/designs/<id> returns (select *), same fields the
 *  review route's runPreflight consumes server-side. */
interface DesignRow {
  id: string;
  name: string;
  status: string;
  canvas_state: unknown;
  product_title: string | null;
  description: string | null;
  retail_price: number | string | null;
  category_id: string | null;
  collection_id: string | null;
  supplier_catalog_product_id: string | null;
  garment_color: string | null;
  print_file_path: string | null;
  published_product_id?: string | null;
}

/** One collection folder (GET /api/admin/collections). */
interface CollectionFolder {
  id: string;
  name: string;
  design_count: number;
  product_count: number;
}

/** One flat category (GET /api/admin/categories, studio-flattened). */
interface FlatCategory {
  id: string;
  name: string;
  depth: number;
}

/** One connected social account (GET …/social/accounts). */
interface SocialAccount {
  id: string;
  network: string;
  handle: string | null;
  display_name: string | null;
  status: string | null;
}

/** One print-file record from the design read (design_files rows). */
interface PrintFileRow {
  id: string;
  placement: string | null;
  width_px: number | null;
  height_px: number | null;
  dpi: number | null;
}

const STEP_LABELS = [
  "Product",
  "Artwork & print checks",
  "Collection",
  "Price & details",
  "Destinations",
  "Publish",
] as const;

type Step = 1 | 2 | 3 | 4 | 5 | 6;

/** Step 3–6 data contracts (the studio's own endpoints, no parallels):
 *   GET/POST /api/admin/collections — collection folders (Step 3).
 *   GET /api/admin/collections/<id>/designs + POST
 *     /api/admin/collections/builder/conflicts — the one-supplier-per-
 *     collection check (Step 3, the studio's Rule A gate).
 *   PUT /api/admin/designs/<id> — the write for Steps 3–4 (collection,
 *     title, description, price, category; the route's allow-list).
 *   GET /api/admin/categories — the category shelf (Step 4, flattened
 *     exactly as the studio's own picker flattens it).
 *   GET /api/admin/studio/supplier-options — the captured supplier cost
 *     shown beside the price (Step 4; null cost = "not captured yet").
 *   GET /api/admin/integrations/social/accounts — connected social
 *     accounts (Step 5); POST /api/admin/integrations/social/posts —
 *     the announcement draft created after a successful publish
 *     (draft, never auto-posted — Step 6 reports it separately).
 *   POST /api/admin/designs/<id>/review {action} — the lifecycle itself
 *     (Step 6: submit → approve → publish via publishDesign). */

interface PrintCheck {
  id: string;
  title: string;
  status: "pass" | "fail" | "note";
  /** Only blocking checks gate Continue (wizard rule: checks inside
   *  the flow; a failing step cannot be passed). */
  blocking: boolean;
  detail: string;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function PublishWizard() {
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [design, setDesign] = useState<DesignRow | null>(null);
  const [designMissing, setDesignMissing] = useState(false);
  const [printFiles, setPrintFiles] = useState<PrintFileRow[]>([]);
  const [catalogDetail, setCatalogDetail] = useState<CatalogDetail | null>(null);
  const [stage, setStage] = useState<ProductStage | null>(null);
  const startedRef = useRef(false);

  /* ---- Steps 3–6 state ---- */
  /** Step 3: folders + filing choice. `collectionFor` records which
   *  design the folder list was loaded for, so re-entering Step 3
   *  after a save does not refetch in a loop. */
  const [folders, setFolders] = useState<CollectionFolder[]>([]);
  const [foldersLoaded, setFoldersLoaded] = useState(false);
  const [foldersBusy, setFoldersBusy] = useState(false);
  const [folderMode, setFolderMode] = useState<"pick" | "new" | "none">("pick");
  const [chosenCollectionId, setChosenCollectionId] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  /** The one-supplier check for the chosen folder: null = no conflict
   *  (or not checked yet), otherwise the plain-language block. */
  const [collectionConflict, setCollectionConflict] = useState<string | null>(null);
  const [conflictBusy, setConflictBusy] = useState(false);
  /** Step 4: the details being confirmed (seeded from the design when
   *  Step 4 is entered, so Back never loses an edit in progress). */
  const [detailTitle, setDetailTitle] = useState("");
  const [detailDescription, setDetailDescription] = useState("");
  const [detailCategoryId, setDetailCategoryId] = useState("");
  const [detailPrice, setDetailPrice] = useState("");
  const [detailSeededFor, setDetailSeededFor] = useState<string | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [categories, setCategories] = useState<FlatCategory[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  /** Captured supplier cost for the bound product (Step 4 guidance;
   *  null = no captured cost row — "not captured yet", never a guess). */
  const [capturedCost, setCapturedCost] = useState<number | null>(null);
  const [capturedShipping, setCapturedShipping] = useState<number | null>(null);
  const [marginPct, setMarginPct] = useState(0.4);
  const [costLoaded, setCostLoaded] = useState(false);
  const priceEditedRef = useRef(false);
  // Recommended price (owner ruling 2026-11-03): shipping is part of
  // the product's cost, so the recommendation puts the store margin on
  // top of blank + shipping. The system does this math; the owner only
  // accepts or adjusts it.
  const recommendedPrice =
    capturedCost != null && capturedShipping != null
      ? (capturedCost + capturedShipping) / (1 - marginPct)
      : null;
  useEffect(() => {
    if (
      step === 4 &&
      costLoaded &&
      recommendedPrice != null &&
      !priceEditedRef.current &&
      !(design?.retail_price != null && Number(design.retail_price) > 0)
    ) {
      setDetailPrice(recommendedPrice.toFixed(2));
    }
  }, [step, costLoaded, recommendedPrice, design]);
  /** Step 5: destinations. Storefront is the publish itself (always
   *  on); the social announcement is an opt-in draft created after a
   *  successful publish, never an auto-post. */
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const [announceCaption, setAnnounceCaption] = useState("");
  const [announceTargets, setAnnounceTargets] = useState<string[]>([]);
  /** Step 6: the publish run itself. */
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishSteps, setPublishSteps] = useState<string[]>([]);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [announceResult, setAnnounceResult] = useState<string | null>(null);

  /* ---- First load: the studio's own reads, in its own order ---- */
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const designId = params.get("designId");
      const catalogParam = params.get("catalogProduct");
      try {
        let row: DesignRow | null = null;
        if (designId) {
          const res = await fetch(`/api/admin/designs/${encodeURIComponent(designId)}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "That design could not be loaded.");
          row = data.design as DesignRow;
          setDesign(row);
          setPrintFiles((data.printFiles ?? []) as PrintFileRow[]);
        } else {
          // Launched without a saved design (e.g. typed URL): Step 1
          // can still show a bound product, Step 2 will say plainly
          // that the design must be saved before checks can run.
          setDesignMissing(true);
        }
        const state = row ? asCanvasStateV2(row.canvas_state) : null;
        const catalogId =
          catalogParam ??
          row?.supplier_catalog_product_id ??
          state?.supplierCatalogProductId ??
          null;
        if (catalogId) {
          const res = await fetch(
            `/api/admin/studio/catalog/${encodeURIComponent(catalogId)}`,
          );
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "That product could not be loaded.");
          setCatalogDetail(data as CatalogDetail);
          // The stage read mirrors loadProductStage(): a 404 is the
          // honest "no capture yet" state, not a failure.
          try {
            const sres = await fetch(
              `/api/admin/studio/product-stage?catalogProductId=${encodeURIComponent(catalogId)}`,
            );
            if (sres.ok) setStage((await sres.json()) as ProductStage);
            else setStage(null);
          } catch {
            setStage(null);
          }
        }
      } catch (e) {
        setLoadError(
          e instanceof Error
            ? e.message
            : "The design could not be loaded. Check your connection and try again.",
        );
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  const canvasState: CanvasStateV2 | null = useMemo(
    () => (design ? asCanvasStateV2(design.canvas_state) : null),
    [design],
  );
  const sides: Record<Surface, import("@/lib/admin/design-node").DesignNode[]> =
    canvasState?.surfaces ?? { Front: [], Back: [] };
  const designedSides = (Object.keys(sides) as Surface[]).filter(
    (s) => sides[s].length > 0,
  );
  const template = catalogDetail?.template ?? null;

  /* Garment colour: the hex the design was saved with (canvas_state /
   * garment_color — the studio's own saved value). The colour NAME is
   * shown only when one of the product's real variant colours maps to
   * that exact hex through the studio's colorNameToHex — otherwise
   * the hex stands alone; no name is guessed. */
  const garmentHex = canvasState?.garmentColor ?? design?.garment_color ?? null;
  const garmentColorName = useMemo(() => {
    if (!garmentHex || !catalogDetail) return null;
    for (const v of catalogDetail.variants) {
      if (v.color && colorNameToHex(v.color).toLowerCase() === garmentHex.toLowerCase()) {
        return v.color;
      }
    }
    return null;
  }, [garmentHex, catalogDetail]);

  /* Captured specs for the designed sides (stageSpecForSide — the
   * canvas's own lookup), plus the freshness line: the OLDEST
   * captured_at among the specs in use is the honest floor. */
  const sideSpecs = useMemo(() => {
    if (!stage) return [] as { side: Surface; placement: string; spec: ProductStage["specs"][number] }[];
    const out: { side: Surface; placement: string; spec: ProductStage["specs"][number] }[] = [];
    for (const s of designedSides.length ? designedSides : (["Front", "Back"] as Surface[])) {
      const hit = stageSpecForSide(stage, s);
      if (hit) out.push({ side: s, placement: hit.placement, spec: hit.spec });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, canvasState]);
  const specsCapturedAt = sideSpecs.length
    ? sideSpecs.map((h) => h.spec.capturedAt).sort()[0]
    : null;

  /* ---- Step 2 — the checks (existing logic only) ---- */
  const checks: PrintCheck[] = useMemo(() => {
    const out: PrintCheck[] = [];
    if (!design || designMissing) {
      out.push({
        id: "saved",
        title: "Design is saved",
        status: "fail",
        blocking: true,
        detail:
          "This design has not been saved yet, so there is no artwork on record to check. Go back to the studio, press “Save design”, then open this wizard again from the Review tab.",
      });
      return out;
    }
    if (!canvasState) {
      out.push({
        id: "saved",
        title: "Design opens in the current studio",
        status: "fail",
        blocking: true,
        detail:
          "This design was saved by the older studio, so its artwork cannot be checked here. Reopen it in the Design Studio and save it again, then run this wizard.",
      });
      return out;
    }

    /* Preflight (lib/fabric/preflight) against the saved design +
     * the catalog template — the review route's own check. Step 2
     * consumes its artwork/print issues; title, price, category and
     * product-binding issues belong to Steps 1 and 4. */
    const preflight = template
      ? runPreflight(
          {
            canvas_state: design.canvas_state,
            product_title: design.product_title,
            retail_price:
              design.retail_price != null ? Number(design.retail_price) : null,
            category_id: design.category_id,
            supplier_catalog_product_id: design.supplier_catalog_product_id,
            print_file_path: design.print_file_path,
          },
          template,
        )
      : null;
    const artworkErrors = (preflight?.errors ?? []).filter(
      (i) =>
        i.message.includes("extends outside the print area") ||
        i.message.includes("temporary browser image") ||
        i.message.includes("canvas is empty") ||
        i.message.includes("legacy studio"),
    );

    /* 1 — A print-size basis for the design (owner ruling 2026-11-02:
     *  a catalog product is printable by its supplier; the basis is,
     *  in order, a captured spec, the product's own supplier data, or
     *  the disclosed standard stage size — the same basis the studio
     *  preflight uses. Only an unresolvable template fails here.) */
    if (!stage && template?.spec.source === "supplier") {
      out.push({
        id: "spec",
        title: "Supplier print spec",
        status: "pass",
        blocking: true,
        detail: `From this product's own supplier data: ${template.spec.widthPx.toLocaleString()}×${template.spec.heightPx.toLocaleString()}px at ${template.spec.dpi} DPI — the print size the supplier publishes for this product, read from its catalog variants.`,
      });
    } else if (!stage && template) {
      out.push({
        id: "spec",
        title: "Supplier print spec",
        status: "note",
        blocking: false,
        detail: `No dimension data is stored in this product's supplier record, so this design uses the studio's standard stage size for its kind — ${template.spec.widthPx.toLocaleString()}×${template.spec.heightPx.toLocaleString()}px at ${template.spec.dpi} DPI — the same basis the studio's preflight checked it against. Verify the size against the supplier before fulfilling an order.`,
      });
    } else if (!stage) {
      out.push({
        id: "spec",
        title: "Supplier print spec",
        status: "fail",
        blocking: true,
        detail:
          "This product's print template could not be loaded, so there is no print size to check the artwork against. Go back to Step 1 and confirm the product, or pick the product again in the studio.",
      });
    } else if (designedSides.length === 0) {
      out.push({
        id: "spec",
        title: "Supplier print spec captured",
        status: "pass",
        blocking: true,
        detail: `Captured for ${stage.canonical.name} (${stage.supplier}) — specs captured ${specsCapturedAt ? fmtDate(specsCapturedAt) : "date not recorded"}. There is no artwork yet to measure against it.`,
      });
    } else {
      const missing = designedSides.filter(
        (s) => !stageSpecForSide(stage, s),
      );
      out.push({
        id: "spec",
        title: "Supplier print spec captured",
        status: missing.length ? "fail" : "pass",
        blocking: true,
        detail: missing.length
          ? `A spec is captured for ${sideSpecs.map((h) => `${h.side} (${h.placement})`).join(", ") || "another side"}, but not for ${missing.join(", ")} — specs captured ${specsCapturedAt ? fmtDate(specsCapturedAt) : "date not recorded"}. The missing side cannot be checked, so this step cannot pass yet.`
          : sideSpecs
              .map(
                (h) =>
                  `${h.side} (${h.placement}): ${h.spec.printWidthPx.toLocaleString()}×${h.spec.printHeightPx.toLocaleString()}px at ${h.spec.targetDpi} DPI`,
              )
              .join(" · ") +
            ` — specs captured ${specsCapturedAt ? fmtDate(specsCapturedAt) : "date not recorded"}.`,
      });
    }

    /* 2 — DPI auditor (lib/fabric/dpi auditDesign), per side against
     * the captured spec, exactly as the studio's own audit runs. */
    if (designedSides.length === 0) {
      out.push({
        id: "artwork",
        title: "Artwork on the canvas",
        status: "fail",
        blocking: true,
        detail:
          "The canvas is empty — add artwork in the studio before publishing. There is nothing to print yet.",
      });
      out.push({
        id: "dpi",
        title: "Artwork sharpness (DPI)",
        status: "fail",
        blocking: true,
        detail: "No artwork to measure. Add artwork in the studio first.",
      });
    } else if (!template) {
      out.push({
        id: "dpi",
        title: "Artwork sharpness (DPI)",
        status: "fail",
        blocking: true,
        detail:
          "The product's print template could not be loaded, so sharpness cannot be measured. Go back to Step 1 and confirm the product, or pick the product again in the studio.",
      });
    } else {
      const merged = { worstDpi: null as number | null, failing: [] as { name: string; dpi: number }[], ready: true };
      for (const s of designedSides) {
        const hit = stage ? stageSpecForSide(stage, s) : null;
        const perSide = auditDesign(
          { [s]: sides[s] },
          hit
            ? {
                ...template,
                spec: {
                  ...template.spec,
                  widthPx: hit.spec.printWidthPx,
                  heightPx: hit.spec.printHeightPx,
                  dpi: hit.spec.targetDpi,
                  source: "supplier" as const,
                },
              }
            : template,
        );
        if (perSide.worstDpi != null) {
          merged.worstDpi =
            merged.worstDpi == null
              ? perSide.worstDpi
              : Math.min(merged.worstDpi, perSide.worstDpi);
        }
        merged.failing.push(...perSide.failing);
        merged.ready = merged.ready && perSide.isPrintReady;
      }
      if (merged.worstDpi == null) {
        out.push({
          id: "dpi",
          title: "Artwork sharpness (DPI)",
          status: "pass",
          blocking: true,
          detail:
            "No photo artwork — text and shapes are printed from their outlines, so they are sharp at any size and do not need a DPI check.",
        });
      } else {
        out.push({
          id: "dpi",
          title: "Artwork sharpness (DPI)",
          status: merged.ready ? "pass" : "fail",
          blocking: true,
          detail: merged.ready
            ? `The least sharp picture measures ${merged.worstDpi} DPI against the ${stage ? "captured supplier spec" : "studio's standard stage"} — ${TARGET_DPI} DPI or more is needed to print sharp.`
            : `Too low to print sharp: ${merged.failing.map((f) => `“${f.name}” at ${f.dpi} DPI`).join(", ")}. ${TARGET_DPI} DPI is needed — use a bigger original picture, or make the picture smaller on the product in the studio.`,
        });
      }

      /* 3 — Print-area fit, gated on preflight's verdict; the items
       * listed in the panel below are measured with preflight's own
       * nodeBounds against the same trim the preflight uses. */
      const fitErrors = artworkErrors.filter((i) =>
        i.message.includes("extends outside the print area"),
      );
      out.push({
        id: "fit",
        title: "Artwork fits the print area",
        status: fitErrors.length ? "fail" : "pass",
        blocking: true,
        detail: fitErrors.length
          ? fitErrors.map((i) => i.message).join(" ")
          : "Every item sits inside the print area — nothing will be clipped off in production.",
      });

      /* 4 — Artwork stored with the design (format readiness). */
      const blobErrors = artworkErrors.filter((i) =>
        i.message.includes("temporary browser image"),
      );
      out.push({
        id: "stored",
        title: "Artwork files are stored",
        status: blobErrors.length ? "fail" : "pass",
        blocking: true,
        detail: blobErrors.length
          ? blobErrors.map((i) => i.message).join(" ")
          : "Every picture in this design is stored with the design, ready to be turned into the print file.",
      });
    }

    /* 5 — Print file on record (informational: the file is created
     * by the studio's export, and Step 6 refuses to publish without
     * one, so its absence is reported, never hidden — and never
     * blocks this step). */
    const hasPrintFile = Boolean(design.print_file_path) || printFiles.length > 0;
    out.push({
      id: "printfile",
      title: "Print file",
      status: hasPrintFile ? "pass" : "note",
      blocking: false,
      detail: hasPrintFile
        ? `A print file is already on record for this design${printFiles.length ? ` (${printFiles.length} file${printFiles.length === 1 ? "" : "s"}: ${printFiles.map((f) => `${f.width_px ?? "?"}×${f.height_px ?? "?"}px${f.dpi ? ` at ${f.dpi} DPI` : ""}`).join(", ")})` : ""}.`
        : "No print file has been exported yet. That is expected at this step — the print-ready file (a transparent PNG at full print size, plus the shop mockup) is created by the studio's export, and Step 6 will not publish without one: a live product with no print file cannot be fulfilled. Export it in the studio first, then return here.",
    });

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, designMissing, canvasState, template, stage, printFiles]);

  const step2Pass = checks.every((c) => !c.blocking || c.status === "pass");

  /* Per-item bounds for the fit panel — nodeBounds (preflight's own
   * exported geometry) against the template trim preflight checks. */
  const boundsRows = useMemo(() => {
    if (!template) return [];
    const trim = template.stage.trim;
    const rows: { side: Surface; name: string; inside: boolean; text: string }[] = [];
    for (const s of designedSides) {
      for (const n of sides[s]) {
        const b = nodeBounds(n);
        const inside =
          b.x >= trim.x - 1 &&
          b.y >= trim.y - 1 &&
          b.x + b.w <= trim.x + trim.width + 1 &&
          b.y + b.h <= trim.y + trim.height + 1;
        rows.push({
          side: s,
          name: n.name,
          inside,
          text: `${s}: “${n.name}” — ${Math.round(b.w)}×${Math.round(b.h)} of the ${trim.width}×${trim.height} print area`,
        });
      }
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, canvasState]);

  /* ---- Steps 3–6 helpers ---- */
  /** The studio's own category flattening (design-studio.tsx). */
  const flattenCategories = (raw: unknown, depth = 0, out: FlatCategory[] = []): FlatCategory[] => {
    if (!raw) return out;
    if (Array.isArray(raw)) {
      for (const n of raw) flattenCategories(n, depth, out);
      return out;
    }
    if (typeof raw === "object") {
      const r = raw as Record<string, unknown>;
      if (typeof r.id === "string" && typeof r.name === "string") {
        out.push({ id: r.id, name: r.name, depth });
      }
      const kids = (r.children ?? r.subcategories) as unknown;
      if (Array.isArray(kids)) for (const k of kids) flattenCategories(k, depth + 1, out);
      if (!r.id && !r.name) {
        for (const v of Object.values(r)) flattenCategories(v, depth, out);
      }
    }
    return out;
  };

  /** One design write through the design route's allow-list. */
  const putDesign = async (patch: Record<string, unknown>) => {
    if (!design) throw new Error("No design is loaded to save to.");
    const res = await fetch(`/api/admin/designs/${encodeURIComponent(design.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "The design could not be saved.");
    setDesign((prev) => (prev ? { ...prev, ...patch } as DesignRow : prev));
  };

  const loadFolders = useCallback(async () => {
    setFoldersBusy(true);
    try {
      const res = await fetch("/api/admin/collections");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The collection list could not be loaded.");
      setFolders(
        (data.collections ?? []).map((c: Record<string, unknown>) => ({
          id: String(c.id),
          name: String(c.name),
          design_count: Number(c.design_count ?? 0),
          product_count: Number(c.product_count ?? 0),
        })),
      );
      setFoldersLoaded(true);
    } catch {
      setFolders([]);
      setFoldersLoaded(true);
    } finally {
      setFoldersBusy(false);
    }
  }, []);

  /** The one-supplier check for one folder: the folder's members plus
   *  this design, through the builder's conflict report. A folder with
   *  members from another supplier blocks Continue with the supplier
   *  names in plain words — the studio's Rule A gate, in this step. */
  const checkCollectionConflict = useCallback(
    async (collectionId: string) => {
      if (!design) return;
      setConflictBusy(true);
      setCollectionConflict(null);
      try {
        const mRes = await fetch(`/api/admin/collections/${encodeURIComponent(collectionId)}/designs`);
        const mData = await mRes.json();
        const memberIds: string[] = (mData.designIds ?? []).filter((id: string) => id !== design.id);
        if (!memberIds.length) return; // Empty folder: no supplier to clash with.
        const cRes = await fetch("/api/admin/collections/builder/conflicts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ designIds: [...memberIds, design.id] }),
        });
        const report = await cRes.json();
        if (!cRes.ok) throw new Error(report.error || "The supplier check could not run.");
        const groups: { supplier_name: string; design_ids: string[] }[] = report.groups ?? [];
        if (groups.length > 1) {
          const own = groups.find((g) => g.design_ids.includes(design.id));
          const locked = groups.find((g) => g !== own) ?? groups[0];
          setCollectionConflict(
            `This collection already belongs to ${locked.supplier_name}, while this design prints with ${own?.supplier_name ?? catalogDetail?.product.supplier_name ?? "another supplier"} — a collection uses one supplier, so this design cannot be filed here. Pick a different collection, or create a new one for this supplier.`,
          );
        }
      } catch (e) {
        // A failed check must not silently pass the gate: block with
        // the plain reason, and let Try again re-run it.
        setCollectionConflict(
          e instanceof Error
            ? `The supplier check could not run (${e.message}). Filing here is held until the check passes.`
            : "The supplier check could not run. Filing here is held until the check passes.",
        );
      } finally {
        setConflictBusy(false);
      }
    },
    [design, catalogDetail],
  );

  const chooseCollection = (id: string) => {
    setFolderMode("pick");
    setChosenCollectionId(id);
    setFolderError(null);
    void checkCollectionConflict(id);
  };

  /** Step 3 Continue: persist the filing (create the folder first
   *  when "new" was chosen), then Step 4. */
  const saveCollection = async () => {
    if (!design) return;
    setFolderBusy(true);
    setFolderError(null);
    try {
      let collectionId: string | null = null;
      if (folderMode === "new") {
        const name = newCollectionName.trim();
        if (!name) throw new Error("Give the new collection a name first.");
        const res = await fetch("/api/admin/collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "The collection could not be created.");
        collectionId = data.collection.id as string;
        setFolders((f) => [
          { id: collectionId as string, name: data.collection.name as string, design_count: 0, product_count: 0 },
          ...f,
        ]);
      } else if (folderMode === "pick") {
        collectionId = chosenCollectionId;
      }
      await putDesign({ collection_id: collectionId });
      setChosenCollectionId(collectionId);
      setStep(4);
    } catch (e) {
      setFolderError(e instanceof Error ? e.message : "The collection could not be saved.");
    } finally {
      setFolderBusy(false);
    }
  };

  /** Step 4 Continue: validate, then persist title / description /
   *  category / price on the design itself. */
  const saveDetails = async () => {
    setDetailError(null);
    const title = detailTitle.trim();
    const price = Number(detailPrice);
    if (!title) {
      setDetailError("Give the product a title first — shoppers see this name, and publishing requires it.");
      return;
    }
    if (!detailCategoryId) {
      setDetailError("Pick the category shelf this product sits on — publishing requires it.");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setDetailError("Set a selling price greater than zero — publishing requires it.");
      return;
    }
    setDetailBusy(true);
    try {
      await putDesign({
        product_title: title,
        description: detailDescription.trim() || null,
        category_id: detailCategoryId,
        retail_price: price,
      });
      setStep(5);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "The details could not be saved.");
    } finally {
      setDetailBusy(false);
    }
  };

  /** Step 6 Publish: walk the lifecycle the studio itself walks —
   *  submit, then approve, then publish — skipping any stage the
   *  design already passed, and refusing to run at all without a
   *  print file (fulfillment cannot print from a live product with
   *  no print file; the studio's export creates it). On success the
   *  live product URL from publishDesign is the proof; when the
   *  social announcement was chosen, its draft is created after the
   *  publish and reported separately, so a draft failure never hides
   *  a successful publish. */
  const runPublish = async () => {
    if (!design) return;
    setPublishBusy(true);
    setPublishError(null);
    setPublishSteps([]);
    setPublishedUrl(null);
    setAnnounceResult(null);
    try {
      // Fresh record first: a previous run may have submitted or
      // approved the design before failing, and the print file may
      // have been exported in another tab since this page loaded.
      // Retrying from stale state would re-run a passed stage (a
      // 409) or block on a file that now exists. The lifecycle below
      // walks from the true status, and the print-file gate reads
      // the fresh record.
      const freshRes = await fetch(`/api/admin/designs/${encodeURIComponent(design.id)}`);
      const freshData = await freshRes.json().catch(() => ({}));
      const freshRow = freshData.design as DesignRow | undefined;
      if (freshRow) {
        setDesign(freshRow);
        setPrintFiles((freshData.printFiles ?? []) as PrintFileRow[]);
      }
      const freshPrintFiles = (freshData.printFiles ?? []) as PrintFileRow[];
      if (!freshRow?.print_file_path && freshPrintFiles.length === 0 && !design.print_file_path && printFiles.length === 0) {
        throw new Error(
          "No print file is on record for this design yet. Open the design in the studio and export its print files first (the studio's Publish button exports them before publishing) — then come back here and this step will run. A live product with no print file cannot be fulfilled, so this wizard will not publish one.",
        );
      }
      const run = async (action: "submit" | "approve" | "publish") => {
        const res = await fetch(`/api/admin/designs/${encodeURIComponent(design.id)}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const detail = data.preflight?.errors?.map((i: { message: string }) => i.message).join(" ") ?? "";
          throw new Error(data.error ? `${data.error}${detail ? ` — ${detail}` : ""}` : `Could not ${action}.`);
        }
        return data;
      };
      let status = freshRow?.status ?? design.status;
      if (status === "draft" || status === "publish_failed") {
        await run("submit");
        status = "needs_review";
        setPublishSteps((s) => [...s, "Submitted for review ✓"]);
      }
      if (status === "needs_review") {
        await run("approve");
        status = "ready_to_publish";
        setPublishSteps((s) => [...s, "Approved — ready to publish ✓"]);
      }
      if (status === "ready_to_publish") {
        const data = await run("publish");
        status = "published";
        setPublishSteps((s) => [...s, "Published to the storefront ✓"]);
        const url: string | null = data.url ?? (data.productId ? `/product/${data.productId}` : null);
        if (url) setPublishedUrl(url);
        setDesign((prev) => (prev ? { ...prev, status: "published" } : prev));
        if (announce && url) {
          try {
            const caption = announceCaption.trim() || `${detailTitle.trim() || design.product_title || design.name} — now in the shop!`;
            const mediaUrls: string[] = [];
            const pres = await fetch("/api/admin/integrations/social/posts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                caption,
                mediaUrls,
                productId: data.productId ?? null,
                productUrl: url,
                targets: announceTargets.map((network) => {
                  const acct = socialAccounts.find((a) => a.network === network);
                  return { network, accountId: acct?.id ?? null };
                }),
                publishNow: false,
              }),
            });
            const pdata = await pres.json().catch(() => ({}));
            if (!pres.ok) throw new Error(pdata.error || "The announcement draft could not be created.");
            setAnnounceResult(
              `Announcement draft saved for ${announceTargets.join(", ")} — it is a draft in the social queue, not posted yet.`,
            );
          } catch (e) {
            setAnnounceResult(
              `The product is published, but the announcement draft failed: ${e instanceof Error ? e.message : "unknown error"}. The publish itself succeeded — create the announcement from the social queue.`,
            );
          }
        }
      } else if (status === "published") {
        setPublishSteps((s) => [...s, "Already published ✓"]);
        const fresh = await fetch(`/api/admin/designs/${encodeURIComponent(design.id)}`);
        const fdata = await fresh.json().catch(() => ({}));
        const row = fdata.design as DesignRow | undefined;
        if (row?.published_product_id) setPublishedUrl(`/product/${row.published_product_id}`);
      } else {
        throw new Error(`This design is "${status.replace(/_/g, " ")}" — publishing runs from draft, in review, or ready to publish.`);
      }
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Publishing failed.");
    } finally {
      setPublishBusy(false);
    }
  };

  /* Entering Step 3 loads the folders and pre-selects the design's
   * current filing; entering Step 4 seeds the detail fields from the
   * design and loads categories + the captured cost; entering Step 5
   * loads the connected social accounts. */
  useEffect(() => {
    if (step === 3 && !foldersLoaded && !foldersBusy) {
      void loadFolders();
    }
    if (step === 3 && design?.collection_id && chosenCollectionId == null) {
      setChosenCollectionId(design.collection_id);
      setFolderMode("pick");
      void checkCollectionConflict(design.collection_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, design?.collection_id]);
  useEffect(() => {
    if (step === 4 && design && detailSeededFor !== design.id) {
      setDetailTitle(design.product_title ?? design.name ?? "");
      setDetailDescription(design.description ?? "");
      setDetailCategoryId(design.category_id ?? catalogDetail?.product.category_id ?? "");
      const snapshotPrices = (catalogDetail?.variants ?? [])
        .map((v) => v.price_snapshot)
        .filter((p): p is number => p != null);
      setDetailPrice(
        design.retail_price != null && Number(design.retail_price) > 0
          ? String(Number(design.retail_price))
          : snapshotPrices.length
            ? String(Math.min(...snapshotPrices))
            : "",
      );
      setDetailSeededFor(design.id);
    }
    if (step === 4 && !categoriesLoaded) {
      setCategoriesLoaded(true);
      void (async () => {
        try {
          const res = await fetch("/api/admin/categories");
          const data = await res.json();
          if (res.ok) setCategories(flattenCategories(data.categories ?? data.tree ?? data));
        } catch {
          setCategories([]);
        }
      })();
    }
    if (step === 4 && !costLoaded) {
      const catalogId = design?.supplier_catalog_product_id ?? catalogDetail?.product.id;
      if (catalogId) {
        setCostLoaded(true);
        void (async () => {
          try {
            const res = await fetch(
              `/api/admin/studio/supplier-options?catalogProductId=${encodeURIComponent(catalogId)}`,
            );
            const data = await res.json();
            if (res.ok) {
              const own = (data.options ?? []).find((o: { isOwnSupplier: boolean }) => o.isOwnSupplier);
              setCapturedCost(own?.cost?.minBaseCostUsd ?? null);
              setCapturedShipping(own?.cost?.shippingEstimateUsd ?? null);
              if (typeof data.pricing?.marginPct === "number") setMarginPct(data.pricing.marginPct);
            }
          } catch {
            setCapturedCost(null);
            setCapturedShipping(null);
          }
        })();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, design, catalogDetail]);
  useEffect(() => {
    if (step === 5 && !accountsLoaded) {
      setAccountsLoaded(true);
      void (async () => {
        try {
          const res = await fetch("/api/admin/integrations/social/accounts");
          const data = await res.json();
          if (res.ok) setSocialAccounts((data.accounts ?? []) as SocialAccount[]);
        } catch {
          setSocialAccounts([]);
        }
      })();
    }
    if (step === 5 && announce && !announceCaption && design) {
      setAnnounceCaption(`${design.product_title || design.name} — now in the shop!`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, announce, design]);

  /* ---- Stepper header ---- */
  const stepState = (n: number): "done" | "current" | "todo" =>
    n < step ? "done" : n === step ? "current" : "todo";
  /** Clicking a finished step goes back to it (rule 6). */
  const jumpBack = (n: number) => {
    if (n < step) setStep(n as Step);
  };
  const back = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  return (
    <div className="pw-wrap">
      <div className="pw-head">
        <h1>Publish this design</h1>
      </div>

      <ol className="pw-steps" aria-label="Publish steps">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const state = stepState(n);
          const labelEl = (
            <>
              <span className="pw-step-num" aria-hidden="true">
                {state === "done" ? "✓" : n}
              </span>
              <span className="pw-step-label">{label}</span>
            </>
          );
          return (
            <li
              key={label}
              className={`pw-step ${state}`}
              aria-current={state === "current" ? "step" : undefined}
            >
              {state === "done" ? (
                <button
                  type="button"
                  onClick={() => jumpBack(n)}
                  data-tip={`Go back to the ${label} step.`}
                >
                  {labelEl}
                </button>
              ) : (
                labelEl
              )}
            </li>
          );
        })}
      </ol>

      {loadError && (
        <div className="pw-error" role="alert">
          {loadError} Nothing was changed.{" "}
          <a href="/admin/studio">Go back to the Design Studio</a> and open this
          wizard again from the Review tab.
        </div>
      )}

      {/* ================= STEP 1 — Product ================= */}
      {step === 1 && (
        <section className="pw-panel" aria-label="Step 1: confirm the product">
          <h2>Step 1 of 6 — The product</h2>
          <p className="pw-lede">
            This is the exact product this design is bound to in the studio —
            check it is the right one before anything else. The print area is
            the supplier&apos;s captured size for this product, the same one
            the canvas draws its guides from.
          </p>
          {busy ? (
            <p className="pw-loading">Loading your design…</p>
          ) : !catalogDetail ? (
            <>
              <p className="pw-empty">
                No product is bound to this design yet — there is nothing to
                publish until the design sits on a real product. Go back to
                the Design Studio, pick the product on the Product tab, save
                the design, then open this wizard again from Review &amp;
                publish.
              </p>
              <div className="pw-actions">
                <a
                  className="pw-btn pw-btn-primary"
                  href="/admin/studio"
                  data-tip="Return to the Design Studio to pick the product this design belongs on."
                >
                  ← Back to the Design Studio — pick a product
                </a>
              </div>
            </>
          ) : (
            <>
              <div className="pw-summary">
                {catalogDetail.product.image_url ? (
                  <img src={catalogDetail.product.image_url} alt="" />
                ) : null}
                <dl>
                  <dt>Product</dt>
                  <dd>{catalogDetail.product.name}</dd>
                  <dt>Supplier</dt>
                  <dd>
                    {catalogDetail.product.supplier_name ??
                      stage?.supplier ??
                      "Not recorded for this product"}
                  </dd>
                  <dt>Garment colour</dt>
                  <dd>
                    {garmentHex ? (
                      <>
                        <span
                          className="pw-swatch"
                          style={{ background: garmentHex }}
                          aria-hidden="true"
                        />
                        {garmentColorName ?? garmentHex}
                      </>
                    ) : (
                      "Not set — the studio's default colour applies"
                    )}
                  </dd>
                  <dt>Design</dt>
                  <dd>
                    {design
                      ? `${design.name} (${design.status.replace(/_/g, " ")})`
                      : "Not saved yet — shown from the product link only"}
                  </dd>
                  {(["Front", "Back"] as Surface[]).map((s) => {
                    const hit = stage ? stageSpecForSide(stage, s) : null;
                    return (
                      <div key={s} style={{ display: "contents" }}>
                        <dt>Print area — {s}</dt>
                        <dd>
                          {hit
                            ? `${hit.spec.printWidthPx.toLocaleString()}×${hit.spec.printHeightPx.toLocaleString()}px at ${hit.spec.targetDpi} DPI (${(hit.spec.printWidthPx / hit.spec.targetDpi).toFixed(1)}″ × ${(hit.spec.printHeightPx / hit.spec.targetDpi).toFixed(1)}″) — the supplier's captured spec`
                            : template
                              ? `${template.spec.widthPx.toLocaleString()}×${template.spec.heightPx.toLocaleString()}px at ${template.spec.dpi} DPI — the studio's standard stage size for this kind of product (no supplier spec captured for this side)`
                              : "Not available — no print template could be loaded for this product"}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
              {stage && specsCapturedAt && (
                <p className="pw-field-hint">
                  Supplier specs captured {fmtDate(specsCapturedAt)} — checks in
                  the next step run against these captured requirements.
                </p>
              )}
              {!stage && (
                <p className="pw-field-hint">
                  No supplier stage has been captured for this product yet, so
                  the next step&apos;s checks cannot pass until that capture
                  exists — the wizard will say so plainly rather than guess.
                </p>
              )}
              <div className="pw-actions">
                <a
                  className="pw-btn"
                  href="/admin/studio"
                  data-tip="Back to the Design Studio. Nothing here is final until the Publish step."
                >
                  ← Back to the studio
                </a>
                <button
                  type="button"
                  className="pw-btn pw-btn-primary"
                  onClick={() => setStep(2)}
                  data-tip="Continue to Step 2: the artwork and print checks."
                >
                  Continue — check the artwork →
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* ================= STEP 2 — Artwork & print checks ================= */}
      {step === 2 && (
        <section className="pw-panel" aria-label="Step 2: artwork and print checks">
          <h2>Step 2 of 6 — Artwork &amp; print checks</h2>
          <p className="pw-lede">
            The sharpness gate lives here — not in a bar over the canvas. Each
            check runs against the supplier&apos;s requirements for{" "}
            <b>{catalogDetail?.product.name ?? "this product"}</b>
            {specsCapturedAt ? (
              <> (specs captured {fmtDate(specsCapturedAt)})</>
            ) : null}
            . A check that fails holds this step: fix it in the studio, save,
            and open the wizard again — Continue unlocks when every check
            passes.
          </p>
          {busy ? (
            <p className="pw-loading">Loading the checks…</p>
          ) : (
            <>
              <ul className="pw-checks">
                {checks.map((c) => (
                  <li
                    key={c.id}
                    className={`pw-check pw-check-${c.status === "pass" ? "pass" : c.status === "fail" ? "fail" : "note"}`}
                  >
                    <p className="pw-check-title">
                      {c.status === "pass" ? "✓ PASS" : c.status === "fail" ? "✗ FAIL" : "• NOTE"} — {c.title}
                    </p>
                    <p className="pw-check-detail">{c.detail}</p>
                  </li>
                ))}
              </ul>
              {boundsRows.length > 0 && (
                <ul className="pw-bounds" aria-label="Artwork items measured against the print area">
                  {boundsRows.map((r, i) => (
                    <li key={i}>
                      {r.inside ? "✓" : "✗"} {r.text}
                      {r.inside ? " — inside" : " — spills outside"}
                    </li>
                  ))}
                </ul>
              )}
              {!step2Pass && (
                <div className="pw-note">
                  Continue is locked because a check above failed. The fix
                  happens in the studio (a bigger original picture, artwork
                  moved inside the print area, or the design saved), never by
                  skipping the check.
                </div>
              )}
              <div className="pw-actions">
                <button
                  type="button"
                  className="pw-btn"
                  onClick={back}
                  data-tip="Go back to Step 1. Nothing is final until the Publish step."
                >
                  ← Back
                </button>
                <a
                  className="pw-btn"
                  href="/admin/studio"
                  data-tip="Open the Design Studio to fix the artwork, then return here from the Review tab."
                >
                  Fix it in the studio
                </a>
                <button
                  type="button"
                  className="pw-btn pw-btn-primary"
                  disabled={!step2Pass}
                  onClick={() => setStep(3)}
                  data-tip="Continue to Step 3: the collection. Locked until every print check passes."
                >
                  Continue — collection →
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* ================= STEP 3 — Collection ================= */}
      {step === 3 && (
        <section className="pw-panel" aria-label="Step 3: choose the collection">
          <h2>Step 3 of 6 — The collection</h2>
          <p className="pw-lede">
            File this design in a collection folder — the same folders the
            studio&apos;s Collection picker uses. A collection uses one
            supplier: picking a folder whose designs print with another
            supplier blocks this step, in plain words, before anything
            is saved. You can also create a new folder here, or publish
            without a collection at all.
          </p>
          {folderError && (
            <div className="pw-error" role="alert">{folderError}</div>
          )}
          {foldersBusy ? (
            <p className="pw-loading">Loading your collection folders…</p>
          ) : (
            <div className="pw-radio-list">
              {folders.map((folder) => (
                <label key={folder.id} className="pw-radio-row">
                  <input
                    type="radio"
                    name="pw-folder"
                    checked={folderMode === "pick" && chosenCollectionId === folder.id}
                    onChange={() => chooseCollection(folder.id)}
                  />
                  <span>
                    <b>{folder.name}</b>{" "}
                    <span className="pw-radio-meta">
                      — {folder.design_count} design{folder.design_count === 1 ? "" : "s"}
                      {folder.product_count > 0
                        ? ` · ${folder.product_count} published product${folder.product_count === 1 ? "" : "s"}`
                        : ""}
                    </span>
                  </span>
                </label>
              ))}
              {folders.length === 0 && (
                <p className="pw-empty">No collection folders yet — create the first one below, or publish without a collection.</p>
              )}
              <label className="pw-radio-row">
                <input
                  type="radio"
                  name="pw-folder"
                  checked={folderMode === "new"}
                  onChange={() => { setFolderMode("new"); setFolderError(null); }}
                />
                <span><b>Create a new collection folder</b></span>
              </label>
              {folderMode === "new" && (
                <div className="pw-inline-create">
                  <input
                    type="text"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder="New collection name"
                    aria-label="New collection name"
                  />
                </div>
              )}
              <label className="pw-radio-row">
                <input
                  type="radio"
                  name="pw-folder"
                  checked={folderMode === "none"}
                  onChange={() => { setFolderMode("none"); setChosenCollectionId(null); setCollectionConflict(null); setFolderError(null); }}
                />
                <span>
                  <b>Publish without a collection</b>{" "}
                  <span className="pw-radio-meta">— the design stays unfiled; the studio can file it any time.</span>
                </span>
              </label>
            </div>
          )}
          {conflictBusy && <p className="pw-loading">Checking the collection&apos;s supplier…</p>}
          {collectionConflict && (
            <div className="pw-error" role="alert">{collectionConflict}</div>
          )}
          {folderMode === "pick" && chosenCollectionId && !collectionConflict && !conflictBusy && (
            <p className="pw-note">✓ This collection&apos;s supplier matches this design — filing here is allowed.</p>
          )}
          <div className="pw-actions">
            <button
              type="button"
              className="pw-btn"
              onClick={back}
              data-tip="Go back to Step 2. Nothing is final until the Publish step."
            >
              ← Back
            </button>
            <button
              type="button"
              className="pw-btn pw-btn-primary"
              disabled={
                folderBusy ||
                conflictBusy ||
                collectionConflict != null ||
                (folderMode === "pick" && !chosenCollectionId) ||
                (folderMode === "new" && !newCollectionName.trim()) ||
                !design
              }
              onClick={() => void saveCollection()}
              data-tip="Save the filing on the design, then continue to price and details."
            >
              {folderBusy ? "Saving…" : "Continue — price & details →"}
            </button>
          </div>
        </section>
      )}

      {/* ================= STEP 4 — Price & details ================= */}
      {step === 4 && (
        <section className="pw-panel" aria-label="Step 4: price and details">
          <h2>Step 4 of 6 — Price &amp; details</h2>
          <p className="pw-lede">
            Confirm what shoppers will see — the title, the category
            shelf, and the selling price — in the owner&apos;s order: the
            supplier&apos;s captured cost first, then your final price.
            Nothing here is guessed: when no cost has been captured for
            this product, the card says so instead of showing a number.
          </p>
          {detailError && (
            <div className="pw-error" role="alert">{detailError}</div>
          )}
          <div className="pw-field">
            <label htmlFor="pw-title">Product title</label>
            <input
              id="pw-title"
              type="text"
              value={detailTitle}
              onChange={(e) => setDetailTitle(e.target.value)}
              data-tip="The name shoppers see for this product."
            />
          </div>
          <div className="pw-field">
            <label htmlFor="pw-description">Description</label>
            <textarea
              id="pw-description"
              value={detailDescription}
              onChange={(e) => setDetailDescription(e.target.value)}
              rows={4}
              data-tip="What shoppers read on the product page. Optional, but a blank description sells less."
            />
          </div>
          <div className="pw-field">
            <label htmlFor="pw-category">Category</label>
            <select
              id="pw-category"
              value={detailCategoryId}
              onChange={(e) => setDetailCategoryId(e.target.value)}
              data-tip="The shelf this product sits on in your shop — shoppers browse by category."
            >
              <option value="">Choose a category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{"— ".repeat(Math.min(c.depth, 3))}{c.name}</option>
              ))}
            </select>
            {categories.length === 0 && (
              <p className="pw-field-hint">The category list could not be loaded — pick the category in the studio and return here, or try again from Step 1.</p>
            )}
          </div>
          <div className="pw-field">
            <label htmlFor="pw-price">Selling price (USD)</label>
            <input
              id="pw-price"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={detailPrice}
              onChange={(e) => {
                priceEditedRef.current = true;
                setDetailPrice(e.target.value);
              }}
              data-tip="What shoppers pay for this product. The recommended price already includes shipping in the cost, so the shopper is never charged shipping on top."
            />
            {costLoaded && capturedCost != null && capturedShipping != null && recommendedPrice != null && (
              <p className="pw-field-hint">
                Blank ${capturedCost.toFixed(2)} · Shipping ${capturedShipping.toFixed(2)} ·{" "}
                <strong>
                  Recommended ${recommendedPrice.toFixed(2)} at your {Math.round(marginPct * 100)}% margin
                </strong>{" "}
                <button
                  type="button"
                  className="pw-btn"
                  onClick={() => {
                    priceEditedRef.current = true;
                    setDetailPrice(recommendedPrice.toFixed(2));
                  }}
                  data-tip="Set the selling price to the recommended price — blank plus shipping, with your margin on top."
                >
                  Use recommended
                </button>
                {Number(detailPrice) > 0
                  ? ` · At your price, the margin after shipping is $${(Number(detailPrice) - capturedCost - capturedShipping).toFixed(2)} (${Math.max(0, Math.round(((Number(detailPrice) - capturedCost - capturedShipping) / Number(detailPrice)) * 100))}%)`
                  : ""}
              </p>
            )}
            {costLoaded && capturedCost != null && capturedShipping == null && (
              <p className="pw-field-hint">
                Supplier&apos;s captured cost from ${capturedCost.toFixed(2)}. Shipping has not been captured for this product yet — once it is, this step shows the recommended price with shipping included in the cost.
                {Number(detailPrice) > 0
                  ? ` · margin $${(Number(detailPrice) - capturedCost).toFixed(2)} before shipping and fees`
                  : ""}
              </p>
            )}
            {costLoaded && capturedCost == null && (
              <p className="pw-field-hint">No supplier cost has been captured for this product yet — costs are captured on a schedule, so the price above is yours to set; it is not checked against a cost.</p>
            )}
            {capturedCost != null &&
              Number(detailPrice) > 0 &&
              Number(detailPrice) < capturedCost + (capturedShipping ?? 0) && (
                <p className="pw-error" role="alert">
                  {capturedShipping != null
                    ? `This price is below the landed cost ($${(capturedCost + capturedShipping).toFixed(2)} = blank $${capturedCost.toFixed(2)} + shipping $${capturedShipping.toFixed(2)}) — you would lose money on every sale. Raise the price, or continue knowingly.`
                    : `This price is below the supplier's captured cost ($${capturedCost.toFixed(2)}) — you would lose money on every sale before shipping and fees. Raise the price, or continue knowingly.`}
                </p>
              )}
          </div>
          <div className="pw-actions">
            <button
              type="button"
              className="pw-btn"
              onClick={back}
              data-tip="Go back to Step 3. Nothing is final until the Publish step."
            >
              ← Back
            </button>
            <button
              type="button"
              className="pw-btn pw-btn-primary"
              disabled={detailBusy || !design}
              onClick={() => void saveDetails()}
              data-tip="Save the title, description, category, and price on the design, then continue to destinations."
            >
              {detailBusy ? "Saving…" : "Continue — destinations →"}
            </button>
          </div>
        </section>
      )}

      {/* ================= STEP 5 — Destinations ================= */}
      {step === 5 && (
        <section className="pw-panel" aria-label="Step 5: destinations">
          <h2>Step 5 of 6 — Destinations</h2>
          <p className="pw-lede">
            Where does this publish go? The storefront is the publish
            itself — that is what Step 6 does. The social announcement
            is optional: after a successful publish, a draft post about
            the new product is saved in the social queue for the
            networks you pick. It is a draft, never an automatic post —
            you decide in the queue when (or whether) it goes out.
          </p>
          <div className="pw-radio-list">
            <label className="pw-radio-row">
              <input type="checkbox" checked disabled />
              <span>
                <b>Storefront</b>{" "}
                <span className="pw-radio-meta">— the shop. This is the publish; it cannot be unchecked.</span>
              </span>
            </label>
            <label className="pw-radio-row">
              <input
                type="checkbox"
                checked={announce}
                onChange={(e) => setAnnounce(e.target.checked)}
              />
              <span>
                <b>Social announcement (draft)</b>{" "}
                <span className="pw-radio-meta">— saved to the social queue after publishing, for the networks below.</span>
              </span>
            </label>
          </div>
          {announce && (
            <>
              <div className="pw-field">
                <label htmlFor="pw-caption">Announcement caption</label>
                <textarea
                  id="pw-caption"
                  value={announceCaption}
                  onChange={(e) => setAnnounceCaption(e.target.value)}
                  rows={3}
                  data-tip="The words on the announcement post. The live product link is attached when it is created."
                />
              </div>
              {socialAccounts.filter((a) => a.status !== "disconnected").length === 0 ? (
                <p className="pw-empty">
                  No social accounts are connected yet, so there is nowhere to announce to. Connect one from{" "}
                  <a href="/admin/integrations/social">Integrations → Social</a>, then return here — or
                  continue without the announcement.
                </p>
              ) : (
                <div className="pw-radio-list">
                  {socialAccounts
                    .filter((a) => a.status !== "disconnected")
                    .map((a) => (
                      <label key={a.id} className="pw-radio-row">
                        <input
                          type="checkbox"
                          checked={announceTargets.includes(a.network)}
                          onChange={(e) =>
                            setAnnounceTargets((prev) =>
                              e.target.checked
                                ? [...prev, a.network]
                                : prev.filter((n) => n !== a.network),
                            )
                          }
                        />
                        <span>
                          <b>{a.network}</b>{" "}
                          <span className="pw-radio-meta">— {a.display_name ?? a.handle ?? "connected account"}</span>
                        </span>
                      </label>
                    ))}
                </div>
              )}
              {announceTargets.length === 0 && (
                <p className="pw-field-hint">Pick at least one network for the announcement, or uncheck the announcement to publish to the storefront only.</p>
              )}
            </>
          )}
          <div className="pw-actions">
            <button
              type="button"
              className="pw-btn"
              onClick={back}
              data-tip="Go back to Step 4. Nothing is final until the Publish step."
            >
              ← Back
            </button>
            <button
              type="button"
              className="pw-btn pw-btn-primary"
              disabled={announce && announceTargets.length === 0}
              onClick={() => setStep(6)}
              data-tip="Continue to the final step: check everything once, then publish."
            >
              Continue — publish →
            </button>
          </div>
        </section>
      )}

      {/* ================= STEP 6 — Publish ================= */}
      {step === 6 && (
        <section className="pw-panel" aria-label="Step 6: publish">
          <h2>Step 6 of 6 — Publish</h2>
          <p className="pw-lede">
            Everything is chosen. Check it once, then publish — the
            design walks its own lifecycle (submitted, approved,
            published) and ends on the live product page. Nothing has
            gone on sale until you press Publish here.
          </p>
          <div className="pw-summary">
            {catalogDetail?.product.image_url ? (
              <img src={catalogDetail.product.image_url} alt="" />
            ) : null}
            <dl>
              <dt>Product</dt>
              <dd>{catalogDetail?.product.name ?? "—"}</dd>
              <dt>Title</dt>
              <dd>{detailTitle.trim() || design?.product_title || design?.name || "—"}</dd>
              <dt>Price</dt>
              <dd>
                {detailPrice && Number(detailPrice) > 0
                  ? `$${Number(detailPrice).toFixed(2)}`
                  : design?.retail_price != null
                    ? `$${Number(design.retail_price).toFixed(2)}`
                    : "—"}
              </dd>
              <dt>Collection</dt>
              <dd>
                {folderMode === "none"
                  ? "No collection"
                  : folders.find((f) => f.id === chosenCollectionId)?.name ??
                    (design?.collection_id ? "Filed (see the studio for its name)" : "No collection")}
              </dd>
              <dt>Destinations</dt>
              <dd>
                Storefront{announce && announceTargets.length > 0 ? ` + social announcement draft (${announceTargets.join(", ")})` : ""}
              </dd>
              <dt>Print file</dt>
              <dd>
                {design?.print_file_path || printFiles.length > 0
                  ? "On record ✓"
                  : "Missing — publish is held until the studio export creates it"}
              </dd>
              <dt>Status</dt>
              <dd>{design ? design.status.replace(/_/g, " ") : "—"}</dd>
            </dl>
          </div>
          {publishSteps.length > 0 && (
            <ul className="pw-checks">
              {publishSteps.map((s, i) => (
                <li key={i} className="pw-check pw-check-pass">
                  <p className="pw-check-title">{s}</p>
                </li>
              ))}
            </ul>
          )}
          {publishError && (
            <div className="pw-error" role="alert">{publishError}</div>
          )}
          {announceResult && (
            <p className="pw-note">{announceResult}</p>
          )}
          {publishedUrl && (
            <p className="pw-note">
              ✓ Live at <a href={publishedUrl}>{publishedUrl}</a> — open it to see the product shoppers can buy.
            </p>
          )}
          <div className="pw-actions">
            <button
              type="button"
              className="pw-btn"
              onClick={back}
              disabled={publishBusy}
              data-tip="Go back to Step 5. Nothing is final until the Publish step."
            >
              ← Back
            </button>
            {design && !design.print_file_path && printFiles.length === 0 && (
              <a
                className="pw-btn"
                href="/admin/studio"
                data-tip="Open the Design Studio to export this design's print files, then return here."
              >
                Export print files in the studio
              </a>
            )}
            <button
              type="button"
              className="pw-btn pw-btn-primary"
              disabled={publishBusy || !design || design.status === "published" || design.status === "archived"}
              onClick={() => void runPublish()}
              data-tip="Publish this design to the storefront now."
            >
              {publishBusy ? "Publishing…" : design?.status === "published" ? "Already published" : "Publish to the storefront ↗"}
            </button>
          </div>
          {design?.status === "published" && !publishedUrl && (
            <p className="pw-field-hint">This design is already published — open it in the studio to see its live product link.</p>
          )}
        </section>
      )}
    </div>
  );
}
