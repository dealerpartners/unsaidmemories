"use client";

/**
 * New Design wizard — CHECKPOINT 1 (stepper shell + steps 1–3) and
 * CHECKPOINT 2 (steps 4–6: Supplier, Organize, Canvas handoff).
 *
 * Wizard #1 in notes/wizard-catalog.md, built under its rules:
 * one job (start a design on a real product), ONE decision per step,
 * defaults/checks from REAL data, Back always allowed. The full step
 * list is Category → Subcategory → Product → Supplier → Organize →
 * Canvas (notes/design-entry-pricing-architecture.md).
 *
 * Data contracts — the SAME ones the studio itself uses, no parallel
 * reads:
 *   GET /api/admin/studio/catalog
 *     ?level=children[&parent=<id>]  → { cards, path, parentCount }
 *       category cards for one tree level, each with its live subtree
 *       product count and hasChildren; `path` is the root→parent chain.
 *     ?category=<id>&limit&offset    → { total, products }
 *       one page of products in that category's whole subtree, each
 *       with category_path, supplier, image, variant count, min price.
 *   /api/admin/studio/catalog/<id> → one product + variants (used
 *     only to resolve the ?catalogProduct= preselect below).
 *   GET /api/admin/studio/supplier-options?catalogProductId=<id>
 *     (Step 4) → the suppliers with captured data for this product's
 *     blank, resolved through the product-stage path in
 *     lib/fabric/product-stage: real print specs from
 *     supplier_print_specs, template presence from
 *     supplier_mockup_templates, cost ONLY from
 *     supplier_product_costs (null cost = "price not captured yet" —
 *     never a derived or guessed number).
 *   GET/POST /api/admin/collections (Step 5) → the studio's own
 *     collection folders — the exact endpoints the studio's
 *     “Collection / folder” picker reads and the collections module
 *     writes. There is NO separate folder storage in this codebase:
 *     collections carry the folder semantics (migration
 *     20261030010000), so folder and collection are one pick here.
 *
 * Entry points:
 *   - the studio action bar's “✦ New design” link (additive),
 *   - /admin/products “+ New Design” and its row “Design” actions,
 *   - ?catalogProduct=<supplier_catalog_products id> — when present,
 *     the wizard resolves that product and its real category chain
 *     and lands on Step 4 (Supplier).
 *
 * Canvas handoff (Step 6): the finish is a link into the studio —
 * /admin/studio?catalogProduct=<id>&projectName=<name>
 * &collectionId=<id> — which the studio now honors on load (see the
 * handoff effect in design-studio.tsx): the product binds through
 * the same chooseCatalogProduct path a picker click uses, and the
 * organize choices land in the studio's own projectName /
 * collectionId state, so its existing Save persists them.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import "./new-design-wizard.css";

/** One category card from the catalog API's browse mode — mirrors
 *  BrowseCard in design-studio.tsx (the studio picker's own type). */
interface BrowseCard {
  id: string;
  name: string;
  slug: string;
  count: number;
  hasChildren: boolean;
}

/** One product from the catalog API's products mode — mirrors
 *  CatalogListItem in design-studio.tsx. */
interface CatalogProduct {
  id: string;
  name: string;
  brand_name: string | null;
  supplier_name: string | null;
  supplier_slug: string | null;
  image_url: string | null;
  variant_count: number | null;
  category_id: string | null;
  category_path: string[];
  category_name: string | null;
  kind: string;
  productType: string | null;
  minPrice: number | null;
}

/** One captured print spec from the supplier-options response —
 *  mirrors StagePrintSpec in lib/fabric/product-stage. */
interface SupplierSpec {
  placement: string;
  printWidthPx: number;
  printHeightPx: number;
  targetDpi: number;
}

/** One supplier option from GET /api/admin/studio/supplier-options —
 *  mirrors SupplierOption in lib/fabric/product-stage. cost comes
 *  from a captured row when one exists, else from the product's own
 *  variant prices (owner ruling 2026-11-02); null only when the
 *  listing itself carries no price. product is the garment the
 *  option represents, so the step can show it. */
interface SupplierOption {
  supplier: string;
  displayName: string;
  isOwnSupplier: boolean;
  specs: SupplierSpec[];
  hasTemplate: boolean;
  templateCount: number;
  product: {
    id: string;
    name: string;
    imageUrl: string | null;
    variantCount: number | null;
  } | null;
  cost: {
    minBaseCostUsd: number;
    variantCount: number;
    anyInStock: boolean;
    lastCheckedAt: string;
  } | null;
}

/** One same-blank listing from another supplier — mirrors
 *  SupplierGroupProduct in lib/fabric/product-stage. */
interface SupplierGroupProduct {
  id: string;
  name: string;
  brandName: string | null;
  supplier: string;
  supplierName: string | null;
  imageUrl: string | null;
  variantCount: number | null;
  minPrice: number | null;
  categoryId: string | null;
}

/** One collection folder from GET /api/admin/collections — the
 *  studio's own folder list (same endpoint its picker reads). */
interface CollectionFolder {
  id: string;
  name: string;
  design_count: number;
  product_count: number;
}

/** The wizard's selection, carried step to step. Steps 4–6 add:
 *  supplier (Step 4), projectName + collection (Step 5). */
interface WizardSelection {
  category: BrowseCard | null;
  subcategory: BrowseCard | null;
  product: CatalogProduct | null;
  supplier: SupplierOption | null;
  projectName: string;
  collectionId: string | null;
  collectionName: string | null;
}

const PAGE_SIZE = 18;

const STEP_LABELS = [
  "Category",
  "Subcategory",
  "Product",
  "Supplier",
  "Organize",
  "Canvas",
] as const;

type Step = 1 | 2 | 3 | 4 | 5 | 6;

export default function NewDesignWizard() {
  const [step, setStep] = useState<Step>(1);
  const [selection, setSelection] = useState<WizardSelection>({
    category: null,
    subcategory: null,
    product: null,
    supplier: null,
    projectName: "",
    collectionId: null,
    collectionName: null,
  });
  /* ---- Steps 4–6 state ---- */
  /** Supplier options for the chosen product (Step 4). supFor is the
   *  product id the options were loaded for, so Back/forward
   *  navigation does not refetch the same product. */
  const [supOptions, setSupOptions] = useState<SupplierOption[]>([]);
  const [supGroup, setSupGroup] = useState<SupplierGroupProduct[]>([]);
  const [supCanonical, setSupCanonical] = useState<{ slug: string; name: string } | null>(null);
  const [supFor, setSupFor] = useState<string | null>(null);
  const [supBusy, setSupBusy] = useState(false);
  const [supError, setSupError] = useState<string | null>(null);
  /** Collection folders for Step 5 (the studio's own list). */
  const [folders, setFolders] = useState<CollectionFolder[]>([]);
  const [foldersLoaded, setFoldersLoaded] = useState(false);
  const [foldersBusy, setFoldersBusy] = useState(false);
  /** Step 5's filing choice: an existing folder, a brand-new one, or
   *  an explicit "decide later in the studio". */
  const [folderMode, setFolderMode] = useState<"pick" | "new" | "later">("pick");
  const [newFolderName, setNewFolderName] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  /** Drill path INSIDE step 2, below the chosen category: the taxonomy
   *  is up to 4 levels deep, so a subcategory can itself hold narrower
   *  groups. Mirrors the studio browser's browsePath. */
  const [subPath, setSubPath] = useState<BrowseCard[]>([]);
  const [cards, setCards] = useState<BrowseCard[]>([]);
  const [cardsFor, setCardsFor] = useState<string>("roots");
  const [parentCount, setParentCount] = useState(0);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productsTotal, setProductsTotal] = useState(0);
  const [page, setPage] = useState(1);
  // Starts busy: the mount effect immediately loads the first cards
  // (or resolves a preselect), so the first paint must not flash the
  // empty state.
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preselectNote, setPreselectNote] = useState<string | null>(null);
  const startedRef = useRef(false);

  /* ---- Catalog reads (the studio picker's contract) ---- */

  const loadCards = useCallback(async (parent: BrowseCard | null) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/studio/catalog?level=children${parent ? `&parent=${encodeURIComponent(parent.id)}` : ""}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The category list could not be loaded.");
      setCards(data.cards ?? []);
      setParentCount(data.parentCount ?? 0);
      setCardsFor(parent ? parent.id : "roots");
    } catch (e) {
      setCards([]);
      setError(
        e instanceof Error
          ? e.message
          : "The category list could not be loaded. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const loadProducts = useCallback(async (node: BrowseCard, pageNum: number) => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        category: node.id,
        limit: String(PAGE_SIZE),
        offset: String((pageNum - 1) * PAGE_SIZE),
      });
      const res = await fetch(`/api/admin/studio/catalog?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The product list could not be loaded.");
      setProducts(data.products ?? []);
      setProductsTotal(data.total ?? 0);
    } catch (e) {
      setProducts([]);
      setProductsTotal(0);
      setError(
        e instanceof Error
          ? e.message
          : "The product list could not be loaded. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  /* ---- Step 4 read: supplier options (product-stage path) ---- */
  const loadSuppliers = useCallback(async (productId: string) => {
    setSupBusy(true);
    setSupError(null);
    try {
      const res = await fetch(
        `/api/admin/studio/supplier-options?catalogProductId=${encodeURIComponent(productId)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The supplier list could not be loaded.");
      setSupOptions(data.options ?? []);
      setSupGroup(data.group ?? []);
      setSupCanonical(data.canonical ?? null);
      setSupFor(productId);
    } catch (e) {
      setSupOptions([]);
      setSupGroup([]);
      setSupCanonical(null);
      // supFor is set even on failure — it records the product the
      // load was ATTEMPTED for, so the Step-4 effect does not retry
      // in a loop; the panel's Try again button calls this directly.
      setSupFor(productId);
      setSupError(
        e instanceof Error
          ? e.message
          : "The supplier list could not be loaded. Check your connection and try again.",
      );
    } finally {
      setSupBusy(false);
    }
  }, []);

  /* ---- Step 5 read: the studio's collection folders ---- */
  const loadFolders = useCallback(async () => {
    setFoldersBusy(true);
    try {
      const res = await fetch("/api/admin/collections");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The collection list could not be loaded.");
      setFolders(
        (data.collections ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          design_count: c.design_count ?? 0,
          product_count: c.product_count ?? 0,
        })),
      );
      setFoldersLoaded(true);
    } catch {
      // The picker simply stays empty; Step 5 still offers
      // create-new and decide-later, and the studio can file the
      // design later — a failed list read must not trap the wizard.
      setFolders([]);
      setFoldersLoaded(true);
    } finally {
      setFoldersBusy(false);
    }
  }, []);

  /* Entering Step 4 with a product loads its supplier options once
   * per product; entering Step 5 loads the folder list once. */
  useEffect(() => {
    if (step === 4 && selection.product && supFor !== selection.product.id && !supBusy) {
      void loadSuppliers(selection.product.id);
    }
  }, [step, selection.product, supFor, supBusy, loadSuppliers]);
  useEffect(() => {
    if (step === 5 && !foldersLoaded && !foldersBusy) {
      void loadFolders();
    }
  }, [step, foldersLoaded, foldersBusy, loadFolders]);

  /* ---- First load: roots, or a ?catalogProduct= preselect ---- */
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const cp = new URLSearchParams(window.location.search).get("catalogProduct");
      if (!cp) {
        void loadCards(null);
        return;
      }
      // Preselect: resolve the product, then its category chain from
      // the same browse contract (path = root→leaf for its category).
      setBusy(true);
      try {
        const res = await fetch(`/api/admin/studio/catalog/${encodeURIComponent(cp)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "That product could not be found.");
        const detail = data as {
          product: {
            id: string;
            name: string;
            brand_name: string | null;
            supplier_name: string | null;
            supplier_slug: string | null;
            category_id: string | null;
            category_name: string | null;
            image_url: string | null;
          };
          variants: { price_snapshot: number | null }[];
        };
        let category: BrowseCard | null = null;
        let subcategory: BrowseCard | null = null;
        let pathNames: string[] = [];
        if (detail.product.category_id) {
          const cres = await fetch(
            `/api/admin/studio/catalog?level=children&parent=${encodeURIComponent(detail.product.category_id)}`,
          );
          if (cres.ok) {
            const cdata = await cres.json();
            const chain = (cdata.path ?? []) as { id: string; name: string; slug: string }[];
            pathNames = chain.map((n) => n.name);
            if (chain.length > 0) {
              category = {
                ...chain[0],
                count: cdata.parentCount ?? 0,
                hasChildren: chain.length > 1,
              };
            }
            if (chain.length > 1) {
              subcategory = {
                ...chain[chain.length - 1],
                count: cdata.parentCount ?? 0,
                hasChildren: (cdata.cards ?? []).length > 0,
              };
            }
          }
        }
        const prices = detail.variants
          .map((v) => v.price_snapshot)
          .filter((p): p is number => p != null);
        setSelection({
          category,
          subcategory,
          product: {
            id: detail.product.id,
            name: detail.product.name,
            brand_name: detail.product.brand_name,
            supplier_name: detail.product.supplier_name,
            supplier_slug: detail.product.supplier_slug,
            image_url: detail.product.image_url,
            variant_count: detail.variants.length,
            category_id: detail.product.category_id,
            category_path: pathNames,
            category_name: detail.product.category_name,
            kind: "",
            productType: null,
            minPrice: prices.length ? Math.min(...prices) : null,
          },
          supplier: null,
          projectName: detail.product.name,
          collectionId: null,
          collectionName: null,
        });
        setStep(4);
      } catch (e) {
        setPreselectNote(
          `The product link could not be opened (${e instanceof Error ? e.message : "unknown error"}). Start from Step 1 instead — nothing was changed.`,
        );
        void loadCards(null);
      } finally {
        setBusy(false);
      }
    })();
  }, [loadCards]);

  /* ---- Step transitions (Back is always allowed — rule 6) ---- */

  /** The node whose children step 2 is currently showing. */
  const currentSubNode: BrowseCard | null =
    subPath.length > 0 ? subPath[subPath.length - 1] : selection.category;

  const chooseCategory = (card: BrowseCard) => {
    setSelection({
      category: card,
      subcategory: null,
      product: null,
      supplier: null,
      projectName: "",
      collectionId: null,
      collectionName: null,
    });
    setSubPath([]);
    setProducts([]);
    setPage(1);
    if (!card.hasChildren) {
      // A category with no subcategories: it IS the shelf — go
      // straight to its products (same rule as the studio browser's
      // leaf cards). subcategory stays null, which is how Back knows
      // step 2 never happened for this category.
      setStep(3);
      void loadProducts(card, 1);
      return;
    }
    setStep(2);
    void loadCards(card);
  };

  const chooseSubcategoryCard = (card: BrowseCard) => {
    if (card.hasChildren) {
      // Drill one level deeper inside step 2 — the decision is still
      // "which subcategory", just at the narrower level.
      setSubPath((p) => [...p, card]);
      void loadCards(card);
      return;
    }
    setSelection((s) => ({ ...s, subcategory: card, product: null }));
    setPage(1);
    setStep(3);
    void loadProducts(card, 1);
  };

  /** "All products in <node>" — the studio browser's own escape hatch:
   *  design on anything in this group's whole subtree. */
  const chooseAllIn = (node: BrowseCard) => {
    setSelection((s) => ({ ...s, subcategory: node, product: null }));
    setPage(1);
    setStep(3);
    void loadProducts(node, 1);
  };

  const chooseProduct = (p: CatalogProduct) => {
    // A (re)chosen product resets everything downstream: the supplier
    // belongs to the product, and the project name prefills from it
    // (Step 5 lets her change it before the canvas opens).
    setSelection((s) => ({
      ...s,
      product: p,
      supplier: null,
      projectName: p.name,
      collectionId: null,
      collectionName: null,
    }));
    setFolderMode("pick");
    setNewFolderName("");
    setFolderError(null);
    setStep(4);
  };

  const chooseSupplier = (option: SupplierOption) => {
    setSelection((s) => ({ ...s, supplier: option }));
  };

  /* Step 5 — create a collection folder through the studio's own
   * endpoint, then file this design into it. */
  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setFolderError("Give the new collection a name first.");
      return;
    }
    setFolderBusy(true);
    setFolderError(null);
    try {
      const res = await fetch("/api/admin/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The collection could not be created.");
      const created = data.collection as { id: string; name: string };
      setFolders((f) => [
        { id: created.id, name: created.name, design_count: 0, product_count: 0 },
        ...f,
      ]);
      setSelection((s) => ({ ...s, collectionId: created.id, collectionName: created.name }));
      setFolderMode("pick");
      setNewFolderName("");
    } catch (e) {
      setFolderError(
        e instanceof Error ? e.message : "The collection could not be created. Try again.",
      );
    } finally {
      setFolderBusy(false);
    }
  };

  const back = () => {
    setError(null);
    if (step === 6) {
      setStep(5);
      return;
    }
    if (step === 5) {
      setStep(4);
      return;
    }
    if (step === 4) {
      // Back to the product list. The product stays in the selection
      // (Step 4 is still "done" context) until a different one is
      // picked — choosing one resets the downstream steps.
      setStep(3);
      if (products.length === 0) {
        const node = selection.subcategory ?? selection.category;
        if (node) void loadProducts(node, 1);
      }
      return;
    }
    if (step === 3) {
      if (!selection.subcategory) {
        // Leaf-category shortcut: step 2 never happened — Back goes
        // all the way to the category list.
        setStep(1);
        void loadCards(null);
        return;
      }
      // Restore step 2 at the level the subcategory was picked from:
      // that level's parent node is the current drill node.
      setStep(2);
      void loadCards(currentSubNode);
      return;
    }
    if (step === 2) {
      if (subPath.length > 0) {
        const next = subPath.slice(0, -1);
        setSubPath(next);
        void loadCards(next.length > 0 ? next[next.length - 1] : selection.category);
        return;
      }
      setStep(1);
      void loadCards(null);
    }
  };

  const startAgain = () => {
    setSelection({
      category: null,
      subcategory: null,
      product: null,
      supplier: null,
      projectName: "",
      collectionId: null,
      collectionName: null,
    });
    setSubPath([]);
    setProducts([]);
    setPage(1);
    setFolderMode("pick");
    setNewFolderName("");
    setFolderError(null);
    setStep(1);
    void loadCards(null);
  };

  const goToPage = (next: number) => {
    const node = selection.subcategory ?? selection.category;
    if (!node) return;
    setPage(next);
    void loadProducts(node, next);
  };

  /* ---- Stepper header ---- */
  const stepState = (n: number): "done" | "current" | "todo" =>
    n < step ? "done" : n === step ? "current" : "todo";
  /** Clicking a finished step's label goes back to it (rule 6). */
  const jumpBack = (n: number) => {
    if (n >= step) return;
    setError(null);
    if (n === 1) {
      startAgain();
      return;
    }
    if (n === 2) {
      // Restore step 2 at the drill level in use. A preselect arrival
      // has no drill path — show the chosen category's level.
      setStep(2);
      void loadCards(subPath.length > 0 ? currentSubNode : selection.category);
      return;
    }
    if (n === 3) {
      setStep(3);
      // A preselect arrival never loaded the product list — load it
      // now for the chosen subcategory/category.
      if (products.length === 0) {
        const node = selection.subcategory ?? selection.category;
        if (node) void loadProducts(node, 1);
      }
      return;
    }
    // Steps 4 and 5 need no reload: their state (supplier options,
    // folder list) is kept and refreshes itself when the product or
    // list changes.
    setStep(n as Step);
  };

  /* ---- Step 6 handoff ---- */
  /** True when a supplier other than the product's own was picked:
   *  its blank has captured data, but no listing of THIS product from
   *  that supplier is linked, so the canvas cannot honestly bind it. */
  const supplierMismatch =
    selection.supplier != null && !selection.supplier.isOwnSupplier;
  const ownSupplierOption = supOptions.find((o) => o.isOwnSupplier) ?? null;
  /** The studio URL the wizard finishes on — the params the studio's
   *  handoff effect reads (design-studio.tsx). */
  const studioHref = (() => {
    if (!selection.product) return "/admin/studio";
    const q = new URLSearchParams({ catalogProduct: selection.product.id });
    if (selection.projectName.trim()) q.set("projectName", selection.projectName.trim());
    if (selection.collectionId) q.set("collectionId", selection.collectionId);
    return `/admin/studio?${q.toString()}`;
  })();
  /** Step 5 is complete when the project has a name and the filing is
   *  decided: a folder picked/created, or "later" chosen on purpose. */
  const organizeComplete =
    selection.projectName.trim().length > 0 &&
    (folderMode === "later" || selection.collectionId != null);

  const chosenPath = [
    selection.category?.name,
    ...(subPath.map((n) => n.name).filter((name) => name !== selection.subcategory?.name)),
    selection.subcategory && selection.subcategory.id !== selection.category?.id
      ? selection.subcategory.name
      : null,
  ].filter(Boolean) as string[];

  return (
    <div className="ndw-wrap">
      <div className="ndw-head">
        <h1>New design</h1>
      </div>

      <ol className="ndw-steps" aria-label="New design steps">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const state = stepState(n);
          const labelEl = (
            <>
              <span className="ndw-step-num" aria-hidden="true">
                {state === "done" ? "✓" : n}
              </span>
              <span className="ndw-step-label">{label}</span>
            </>
          );
          return (
            <li key={label} className={`ndw-step ${state}`} aria-current={state === "current" ? "step" : undefined}>
              {state === "done" ? (
                <button type="button" onClick={() => jumpBack(n)} data-tip={`Go back to the ${label} step — your later choices stay until you change this one.`}>
                  {labelEl}
                </button>
              ) : (
                labelEl
              )}
            </li>
          );
        })}
      </ol>

      {preselectNote && <div className="ndw-error" role="alert">{preselectNote}</div>}
      {error && (
        <div className="ndw-error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="ndw-btn"
            onClick={() => {
              if (step === 3) {
                const node = selection.subcategory ?? selection.category;
                if (node) void loadProducts(node, page);
              } else if (step === 2) {
                void loadCards(currentSubNode);
              } else if (step === 4 && selection.product) {
                void loadSuppliers(selection.product.id);
              } else if (step === 5) {
                setFoldersLoaded(false);
                void loadFolders();
              } else if (step === 1) {
                void loadCards(null);
              }
            }}
          >
            Try again
          </button>
        </div>
      )}

      {/* ================= STEP 1 — Category ================= */}
      {step === 1 && (
        <section className="ndw-panel" aria-label="Step 1: pick a category">
          <h2>Step 1 of 6 — What kind of product?</h2>
          <p className="ndw-lede">
            Pick the shelf it belongs on. The numbers are the real products on each
            shelf right now, counted from the suppliers’ catalogs.
          </p>
          {busy ? (
            <p className="ndw-loading">Loading the categories…</p>
          ) : cards.length === 0 && !error ? (
            <p className="ndw-empty">No categories yet — the catalog has not been loaded.</p>
          ) : (
            <div className="ndw-cards">
              {cards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className="ndw-card"
                  onClick={() => chooseCategory(card)}
                  data-tip={`Design on a product in ${card.name}.`}
                >
                  <p className="ndw-card-name">{card.name}{card.hasChildren ? " ›" : ""}</p>
                  <p className="ndw-card-meta">{card.count.toLocaleString()} products</p>
                </button>
              ))}
            </div>
          )}
          <div className="ndw-actions">
            <a className="ndw-btn" href="/admin/studio" data-tip="Skip the guided steps and open the Design Studio directly — its own product picker is on the Product tab.">
              Skip the guide — open the studio
            </a>
          </div>
        </section>
      )}

      {/* ================= STEP 2 — Subcategory ================= */}
      {step === 2 && selection.category && (
        <section className="ndw-panel" aria-label="Step 2: pick a subcategory">
          <h2>Step 2 of 6 — Narrow it down</h2>
          <p className="ndw-lede">
            Pick the subcategory inside <b>{selection.category.name}</b>. One decision —
            you can always go back and pick a different one.
          </p>
          <nav className="ndw-crumbs" aria-label="Where you are">
            <button type="button" onClick={startAgain}>All categories</button>
            <span className="ndw-sep" aria-hidden="true">›</span>
            {subPath.length === 0 ? (
              <span className="ndw-here">{selection.category.name}</span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSubPath([]);
                    void loadCards(selection.category);
                  }}
                >
                  {selection.category.name}
                </button>
                {subPath.map((node, i) => (
                  <span key={node.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span className="ndw-sep" aria-hidden="true">›</span>
                    {i === subPath.length - 1 ? (
                      <span className="ndw-here">{node.name}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const next = subPath.slice(0, i + 1);
                          setSubPath(next);
                          void loadCards(node);
                        }}
                      >
                        {node.name}
                      </button>
                    )}
                  </span>
                ))}
              </>
            )}
          </nav>
          {busy ? (
            <p className="ndw-loading">Loading the subcategories…</p>
          ) : (
            <div className="ndw-cards">
              {currentSubNode && (
                <button
                  type="button"
                  className="ndw-card ndw-card-all"
                  onClick={() => chooseAllIn(currentSubNode)}
                  data-tip={`See every product in ${currentSubNode.name}, including all of its subcategories.`}
                >
                  <p className="ndw-card-name">All products in {currentSubNode.name}</p>
                  <p className="ndw-card-meta">
                    {(cardsFor === currentSubNode.id ? parentCount : currentSubNode.count).toLocaleString()} products
                  </p>
                </button>
              )}
              {cards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className="ndw-card"
                  onClick={() => chooseSubcategoryCard(card)}
                  data-tip={
                    card.hasChildren
                      ? `Open ${card.name} — see the narrower groups inside it.`
                      : `See the products in ${card.name}.`
                  }
                >
                  <p className="ndw-card-name">{card.name}{card.hasChildren ? " ›" : ""}</p>
                  <p className="ndw-card-meta">{card.count.toLocaleString()} products</p>
                </button>
              ))}
              {cards.length === 0 && !error && (
                <p className="ndw-empty">Nothing narrower in here — use “All products in {currentSubNode?.name}” above to see everything on this shelf.</p>
              )}
            </div>
          )}
          <div className="ndw-actions">
            <button type="button" className="ndw-btn" onClick={back} data-tip="Go back one step. Nothing you picked is final until the end.">
              ← Back
            </button>
          </div>
        </section>
      )}

      {/* ================= STEP 3 — Product ================= */}
      {step === 3 && (selection.subcategory ?? selection.category) && (
        <section className="ndw-panel" aria-label="Step 3: pick the product">
          <h2>Step 3 of 6 — Pick the product</h2>
          <p className="ndw-lede">
            These are the real products in{" "}
            <b>{(selection.subcategory ?? selection.category)?.name}</b>
            {chosenPath.length > 1 ? <> — under {chosenPath.slice(0, -1).join(" › ")}</> : null}.
            Pick the one blank you want to design on; the supplier choices for it come next.
          </p>
          {busy ? (
            <p className="ndw-loading">Loading the products…</p>
          ) : products.length === 0 && !error ? (
            <p className="ndw-empty">
              No products here yet. Go back and pick a different subcategory.
            </p>
          ) : (
            <>
              <div className="ndw-cards">
                {products.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="ndw-card"
                    onClick={() => chooseProduct(p)}
                    data-tip="Design on this product — the supplier, print size, and prices all come from it."
                  >
                    {p.image_url ? (
                      <img src={p.image_url} alt="" />
                    ) : null}
                    <p className="ndw-card-name">{p.name}</p>
                    <p className="ndw-card-meta">
                      {p.supplier_name ?? ""}
                      {p.productType ? ` · ${p.productType}` : ""}
                      {p.minPrice != null ? ` · from $${p.minPrice.toFixed(2)}` : ""}
                      {p.variant_count != null ? ` · ${p.variant_count} variants` : ""}
                    </p>
                    {p.category_path.length > 0 && (
                      <p className="ndw-card-meta">{p.category_path.join(" › ")}</p>
                    )}
                  </button>
                ))}
              </div>
              {productsTotal > PAGE_SIZE && (
                <div className="ndw-pager">
                  <button
                    type="button"
                    className="ndw-btn"
                    disabled={busy || page <= 1}
                    onClick={() => goToPage(Math.max(1, page - 1))}
                    data-tip="Show the previous page of products."
                  >
                    ← Prev
                  </button>
                  <span>
                    Showing {products.length} of {productsTotal.toLocaleString()} — page {page} of{" "}
                    {Math.max(1, Math.ceil(productsTotal / PAGE_SIZE))}
                  </span>
                  <button
                    type="button"
                    className="ndw-btn"
                    disabled={busy || page * PAGE_SIZE >= productsTotal}
                    onClick={() => goToPage(page + 1)}
                    data-tip="Show the next page of products."
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
          <div className="ndw-actions">
            <button type="button" className="ndw-btn" onClick={back} data-tip="Go back one step. Nothing you picked is final until the end.">
              ← Back
            </button>
          </div>
        </section>
      )}

      {/* ================= STEP 4 — Supplier ================= */}
      {step === 4 && selection.product && (
        <section className="ndw-panel" aria-label="Step 4: pick the supplier">
          <h2>Step 4 of 6 — Who prints it?</h2>
          <p className="ndw-lede">
            These are the suppliers with real information captured for{" "}
            <b>{selection.product.name}</b>
            {supCanonical ? (
              <> — the blank our records call <b>{supCanonical.name}</b></>
            ) : null}
            . Print sizes and costs come from each product's own supplier data —
            cheapest first. Nothing here is guessed: if a supplier's listing
            carries no price, the card says so.
          </p>
          <div className="ndw-pick">
            {selection.product.image_url ? (
              <img src={selection.product.image_url} alt="" className="ndw-pick-img" />
            ) : null}
            <div className="ndw-pick-body">
              <p className="ndw-pick-name">{selection.product.name}</p>
              <p className="ndw-card-meta">
                {selection.product.supplier_name ?? ""}
                {selection.product.variant_count != null
                  ? ` · ${selection.product.variant_count} variants`
                  : ""}
                {selection.product.minPrice != null
                  ? ` · from $${selection.product.minPrice.toFixed(2)}`
                  : ""}
              </p>
              <p className="ndw-badge">Your pick</p>
            </div>
          </div>
          {supError && (
            <div className="ndw-error" role="alert">
              {supError}{" "}
              <button
                type="button"
                className="ndw-btn"
                onClick={() => {
                  if (selection.product) void loadSuppliers(selection.product.id);
                }}
              >
                Try again
              </button>
            </div>
          )}
          {supBusy ? (
            <p className="ndw-loading">Loading the suppliers for this product…</p>
          ) : supOptions.length === 0 && !supError ? (
            <p className="ndw-empty">
              No supplier information could be loaded for this product. Go back and
              pick the product again, or open the studio and pick it there.
            </p>
          ) : (
            <div className="ndw-cards ndw-cards-wide">
              {supOptions.map((option) => {
                const chosen = selection.supplier?.supplier === option.supplier;
                return (
                  <button
                    key={option.supplier}
                    type="button"
                    className={`ndw-card${chosen ? " ndw-card-selected" : ""}`}
                    aria-pressed={chosen}
                    onClick={() => chooseSupplier(option)}
                    data-tip="Use this supplier for the design. The studio locks the design to the supplier you pick here."
                  >
                    <p className="ndw-card-name">
                      {option.displayName}
                      {chosen ? " ✓" : ""}
                    </p>
                    {option.isOwnSupplier && (
                      <p className="ndw-badge">This product’s supplier</p>
                    )}
                    {option.product?.imageUrl ? (
                      <img src={option.product.imageUrl} alt="" className="ndw-card-img" />
                    ) : null}
                    {option.product ? (
                      <p className="ndw-card-meta">
                        {option.product.name}
                        {option.product.variantCount != null
                          ? ` · ${option.product.variantCount} variants`
                          : ""}
                      </p>
                    ) : null}
                    {option.specs.length > 0 ? (
                      option.specs.map((s) => (
                        <p key={s.placement} className="ndw-card-meta">
                          {s.placement} print: {s.printWidthPx.toLocaleString()}×
                          {s.printHeightPx.toLocaleString()}px at {s.targetDpi} DPI
                          (supplier spec)
                        </p>
                      ))
                    ) : (
                      <p className="ndw-card-meta">
                        No print size in this supplier's catalog data — the studio
                        will use its standard stage for this product.
                      </p>
                    )}
                    <p className="ndw-card-meta">
                      {option.hasTemplate
                        ? "This supplier’s print placement is on file — the canvas uses its real print area."
                        : "The canvas shows this product’s own photo with its print area."}
                    </p>
                    {option.cost ? (
                      <p className="ndw-card-meta">
                        Cost from ${option.cost.minBaseCostUsd.toFixed(2)} — cheapest of{" "}
                        {option.cost.variantCount} variant
                        {option.cost.variantCount === 1 ? "" : "s"}
                        {option.cost.anyInStock ? "" : " · currently out of stock"} ·
                        checked{" "}
                        {new Date(option.cost.lastCheckedAt).toLocaleDateString()}
                      </p>
                    ) : (
                      <p className="ndw-card-meta">
                        No price in this supplier’s listing — this supplier can still
                        print the design; its price step comes at publish time.
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {!supCanonical && !supBusy && supOptions.length > 0 && supGroup.length === 0 && (
            <div className="ndw-note">
              Only this product's own supplier is listed, with the print data from
              its catalog listing. When the same blank is carried by more suppliers,
              they will appear here too, cheapest first.
            </div>
          )}
          {!supBusy && supGroup.length > 0 && (
            <>
              <h3 className="ndw-group-title">Similar blanks — the same shirt family</h3>
              <div className="ndw-cards">
                {supGroup.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className="ndw-card"
                    onClick={() => {
                      window.location.href = `/admin/studio/new-design?catalogProduct=${encodeURIComponent(g.id)}`;
                    }}
                    data-tip="Design on this listing instead — the wizard restarts the supplier step with this product."
                  >
                    {g.imageUrl ? (
                      <img src={g.imageUrl} alt="" />
                    ) : (
                      <p className="ndw-card-meta">No photo in this supplier’s catalog data.</p>
                    )}
                    <p className="ndw-card-name">{g.name}</p>
                    <p className="ndw-card-meta">
                      {g.supplierName ?? g.supplier}
                      {g.variantCount != null ? ` · ${g.variantCount} variants` : ""}
                      {g.minPrice != null ? ` · from $${g.minPrice.toFixed(2)}` : ""}
                    </p>
                    <p className="ndw-card-meta">Design on this one instead →</p>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="ndw-actions">
            <button type="button" className="ndw-btn" onClick={back} data-tip="Go back to the product list and pick a different product.">
              ← Back
            </button>
            <button
              type="button"
              className="ndw-btn ndw-btn-primary"
              disabled={!selection.supplier}
              onClick={() => setStep(5)}
              data-tip="Continue to Step 5: name the project and file it in a collection folder."
            >
              Continue — file the design →
            </button>
          </div>
        </section>
      )}

      {/* ================= STEP 5 — Organize ================= */}
      {step === 5 && selection.product && (
        <section className="ndw-panel" aria-label="Step 5: organize the design">
          <h2>Step 5 of 6 — Name it and file it</h2>
          <p className="ndw-lede">
            The design is born organized — never designed first and filed later. Give
            the project its name, then say which collection folder it lives in. In
            the studio, designs are filed in <b>collection folders</b> — the same
            list its “Collection / folder” picker uses — and a collection is also
            the set that can be published together. A collection uses one supplier:
            this design will use <b>{selection.supplier?.displayName ?? "the supplier you picked"}</b>{" "}
            in whichever folder you choose, and the studio checks that when you save.
          </p>

          <div className="ndw-field">
            <label htmlFor="ndw-project-name">Project name</label>
            <input
              id="ndw-project-name"
              type="text"
              value={selection.projectName}
              onChange={(e) =>
                setSelection((s) => ({ ...s, projectName: e.target.value }))
              }
              data-tip="The name this design project is saved under in the studio. It starts as the product's name — change it to anything you'll recognise."
            />
            <p className="ndw-field-hint">
              Prefilled from the product — change it to anything you will recognise
              later. The studio saves the design under this name.
            </p>
          </div>

          <fieldset className="ndw-fieldset">
            <legend>Collection folder</legend>
            {foldersBusy ? (
              <p className="ndw-loading">Loading your collection folders…</p>
            ) : (
              <div className="ndw-radio-list">
                {folders.map((folder) => (
                  <label key={folder.id} className="ndw-radio-row">
                    <input
                      type="radio"
                      name="ndw-folder"
                      checked={folderMode === "pick" && selection.collectionId === folder.id}
                      onChange={() => {
                        setFolderMode("pick");
                        setSelection((s) => ({
                          ...s,
                          collectionId: folder.id,
                          collectionName: folder.name,
                        }));
                      }}
                    />
                    <span>
                      <b>{folder.name}</b>{" "}
                      <span className="ndw-radio-meta">
                        — {folder.design_count} design{folder.design_count === 1 ? "" : "s"}
                        {folder.product_count > 0
                          ? ` · ${folder.product_count} published product${folder.product_count === 1 ? "" : "s"}`
                          : ""}
                      </span>
                    </span>
                  </label>
                ))}
                {folders.length === 0 && (
                  <p className="ndw-empty">
                    No collection folders yet — create the first one below, or decide
                    later in the studio.
                  </p>
                )}
                <label className="ndw-radio-row">
                  <input
                    type="radio"
                    name="ndw-folder"
                    checked={folderMode === "new"}
                    onChange={() => setFolderMode("new")}
                  />
                  <span>
                    <b>Create a new collection folder</b>
                  </span>
                </label>
                {folderMode === "new" && (
                  <div className="ndw-inline-create">
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="New collection name"
                      aria-label="New collection name"
                      data-tip="Name the new collection folder. It is created in the same list the studio and the shop use."
                    />
                    <button
                      type="button"
                      className="ndw-btn ndw-btn-primary"
                      disabled={folderBusy || !newFolderName.trim()}
                      onClick={() => void createFolder()}
                      data-tip="Create this collection folder now and file the design into it."
                    >
                      {folderBusy ? "Creating…" : "Create and use it"}
                    </button>
                  </div>
                )}
                {folderError && (
                  <div className="ndw-error" role="alert">{folderError}</div>
                )}
                {folderMode === "pick" && selection.collectionId && selection.collectionName && (
                  <p className="ndw-note">
                    Filing into <b>{selection.collectionName}</b>.
                  </p>
                )}
                <label className="ndw-radio-row">
                  <input
                    type="radio"
                    name="ndw-folder"
                    checked={folderMode === "later"}
                    onChange={() => {
                      setFolderMode("later");
                      setSelection((s) => ({ ...s, collectionId: null, collectionName: null }));
                    }}
                  />
                  <span>
                    <b>Decide later in the studio</b>{" "}
                    <span className="ndw-radio-meta">
                      — the design starts unfiled; the studio’s Collection / folder
                      picker can file it any time.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </fieldset>

          <div className="ndw-actions">
            <button type="button" className="ndw-btn" onClick={back} data-tip="Go back to the supplier step.">
              ← Back
            </button>
            <button
              type="button"
              className="ndw-btn ndw-btn-primary"
              disabled={!organizeComplete}
              onClick={() => setStep(6)}
              data-tip="Continue to the last step: check everything, then open the canvas."
            >
              Continue — check and open →
            </button>
          </div>
          {!organizeComplete && (
            <p className="ndw-field-hint">
              To continue: the project needs a name, and the filing needs a decision —
              pick a folder, create one, or choose “Decide later”.
            </p>
          )}
        </section>
      )}

      {/* ================= STEP 6 — Canvas handoff ================= */}
      {step === 6 && selection.product && (
        <section className="ndw-panel" aria-label="Step 6: open the canvas">
          <h2>Step 6 of 6 — Open the canvas</h2>
          <p className="ndw-lede">
            Everything is chosen. Check it once, then open the canvas — the studio
            starts with all of this already set.
          </p>
          <div className="ndw-summary">
            {selection.product.image_url ? (
              <img src={selection.product.image_url} alt="" />
            ) : null}
            <dl>
              <dt>Product</dt>
              <dd>{selection.product.name}</dd>
              <dt>Category</dt>
              <dd>
                {selection.product.category_path.length > 0
                  ? selection.product.category_path.join(" › ")
                  : chosenPath.join(" › ") || "—"}
              </dd>
              <dt>Supplier</dt>
              <dd>{selection.supplier?.displayName ?? "—"}</dd>
              <dt>Project name</dt>
              <dd>{selection.projectName.trim() || "—"}</dd>
              <dt>Collection folder</dt>
              <dd>{selection.collectionName ?? "Decide later in the studio"}</dd>
            </dl>
          </div>
          {supplierMismatch ? (
            <>
              <div className="ndw-error" role="alert">
                <b>{selection.supplier?.displayName}</b> has captured print
                information for this blank, but there is no linked{" "}
                {selection.supplier?.displayName} listing of this product to design
                on yet — so the canvas cannot open on it honestly. Pick{" "}
                <b>{ownSupplierOption?.displayName ?? "the product’s own supplier"}</b>{" "}
                in Step 4 to open the canvas on this product.
              </div>
              <div className="ndw-actions">
                <button type="button" className="ndw-btn" onClick={back} data-tip="Go back to the organize step.">
                  ← Back
                </button>
                <button
                  type="button"
                  className="ndw-btn ndw-btn-primary"
                  onClick={() => setStep(4)}
                  data-tip="Return to Step 4 and pick the product's own supplier."
                >
                  Go back to Step 4 — pick the supplier
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="ndw-note">
                The studio opens with this product already loaded — its “Template
                loaded” message confirms the real print size it will use. Your
                project name and collection folder are already set there; press{" "}
                <b>Save design</b> in the studio to keep the work, exactly as with
                any design started in the studio itself.
              </div>
              <div className="ndw-actions">
                <button type="button" className="ndw-btn" onClick={back} data-tip="Go back to the organize step.">
                  ← Back
                </button>
                <button type="button" className="ndw-btn" onClick={startAgain} data-tip="Clear these choices and start the wizard again from Step 1.">
                  Start again
                </button>
                <a
                  className="ndw-btn ndw-btn-primary"
                  href={studioHref}
                  data-tip="Open the Design Studio with this product, supplier, project name, and collection already chosen."
                >
                  Open the canvas in the Design Studio →
                </a>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
