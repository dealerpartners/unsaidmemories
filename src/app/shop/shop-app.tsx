"use client";

/**
 * ShopApp — the PLP (category page) client.
 *
 * Sidebar: SCOPED to the page (owner rule 2026-10-30). On a category
 * page it shows ONLY that category and its subtree (src/lib/taxonomy.ts
 * — 13 departments, 265 nodes, four levels); on /shop it shows the 13
 * departments, collapsed. Product counts are never rendered in the
 * sidebar. The DB is never the sidebar's render source. Every tree
 * node links to its real /shop page — no dead links.
 *
 * Toolbar: WORKING controls: search (instant, over the current page),
 * Filters (brand / size / color facets with counts + max-price, the
 * search-PLP instant-apply pattern), Sort (featured / price /
 * name), and, on shop pages only, a per-page control (25 / 50 /
 * 100). Facets apply to the current page's products.
 *
 * Products seed from server props (no fetch, no loading state on first
 * paint). On shop pages (paged), numbered pagination replaces Load
 * More: page changes fetch that page via /api/products (same
 * static to DB mapping as the server first page) and the page and
 * per-page live in the URL, so back, forward, and shared links land
 * on the right page. Other pages that reuse this grid keep the Load
 * More behavior exactly (paged defaults to false).
 */

import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  Shirt, Coffee, Home, Image, Printer, Heart, Gift, Briefcase,
  BookOpen, Calendar, Gamepad2, Smartphone, Sparkles, Folder,
  PartyPopper, HeartHandshake, ShoppingBag,
  Star, Watch,
  Headphones, Laptop, Mouse, Phone, Footprints, Package,
  Baby, PersonStanding, Waves, ArrowUpDown,
  Layers, Grid3x3, Tag, Box, Container,
  KeyRound, PenTool,
  Bed, ChefHat, Utensils,
  Bath, Sticker,
  Frame,
  Gem, ArrowLeft, ChevronRight, X, SlidersHorizontal,
} from "lucide-react";
import {
  taxonomy,
  findCategoryByPath,
  type TaxonomyNode,
} from "@/lib/taxonomy";
import { TaxonomySizeGuide } from "@/components/taxonomy-size-guide";
import { CatalogCard, type CatalogProduct } from "@/components/catalog-card";
import { PromoBand } from "@/components/promo-band";
import {
  PER_PAGE_OPTIONS,
  parsePage,
  parsePerPage,
  totalPages as calcTotalPages,
  clampPage,
  pageWindow,
} from "@/lib/shop-pagination";

// Unique icon for every department and common subcategory
function catIcon(name: string, parentName: string = ""): React.ReactNode {
  const n = name.toLowerCase();
  const p = parentName.toLowerCase();

  if (n.includes("apparel")) return <Shirt size={15} className="dept-ico" />;
  if (n.includes("accessories") && !p) return <ShoppingBag size={15} className="dept-ico" />;
  if (n.includes("drinkware")) return <Coffee size={15} className="dept-ico" />;
  if (n.includes("home") && n.includes("living")) return <Home size={15} className="dept-ico" />;
  if (n.includes("wall art")) return <Image size={15} className="dept-ico" />;
  if (n.includes("prints") && n.includes("posters")) return <Printer size={15} className="dept-ico" />;
  if (n.includes("keepsake")) return <Heart size={15} className="dept-ico" />;
  if (n.includes("office") || n.includes("desk")) return <Briefcase size={15} className="dept-ico" />;
  if (n.includes("wellness")) return <Sparkles size={15} className="dept-ico" />;
  if (n.includes("celebration")) return <PartyPopper size={15} className="dept-ico" />;
  if (n.includes("games") || n.includes("puzzle")) return <Gamepad2 size={15} className="dept-ico" />;
  if (n.includes("technology")) return <Smartphone size={15} className="dept-ico" />;
  if (n.includes("books") || n.includes("magazine")) return <BookOpen size={15} className="dept-ico" />;
  if (n.includes("cards") || n.includes("stationery")) return <PenTool size={15} className="dept-ico" />;
  if (n.includes("business")) return <Briefcase size={15} className="dept-ico" />;
  if (n.includes("digital") || n.includes("memory")) return <Sparkles size={15} className="dept-ico" />;
  if (n.includes("furniture") || n.includes("storage")) return <Folder size={15} className="dept-ico" />;
  if (n.includes("unsaid") && n.includes("holidays")) return <Calendar size={15} className="dept-ico" />;
  if (n.includes("relationship")) return <HeartHandshake size={15} className="dept-ico" />;

  if (n.includes("backpack")) return <Package size={14} className="dept-ico" />;
  if (n.includes("drawstring")) return <Container size={14} className="dept-ico" />;
  if (n.includes("duffle")) return <Box size={14} className="dept-ico" />;
  if (n.includes("fanny")) return <ShoppingBag size={14} className="dept-ico" />;
  if (n.includes("handbag")) return <ShoppingBag size={14} className="dept-ico" />;
  if (n.includes("tote")) return <ShoppingBag size={14} className="dept-ico" />;
  if (n.includes("bags") || n.includes("bag")) return <ShoppingBag size={14} className="dept-ico" />;

  if (n.includes("flip flop")) return <Footprints size={14} className="dept-ico" />;
  if (n.includes("shoe")) return <Footprints size={14} className="dept-ico" />;
  if (n.includes("sock")) return <Footprints size={14} className="dept-ico" />;

  if (n.includes("beanie")) return <Tag size={14} className="dept-ico" />;
  if (n.includes("cap")) return <Tag size={14} className="dept-ico" />;
  if (n.includes("hat")) return <Tag size={14} className="dept-ico" />;
  if (n.includes("headwear")) return <Tag size={14} className="dept-ico" />;

  if (n.includes("earphone")) return <Headphones size={14} className="dept-ico" />;
  if (n.includes("laptop")) return <Laptop size={14} className="dept-ico" />;
  if (n.includes("mouse")) return <Mouse size={14} className="dept-ico" />;
  if (n.includes("phone")) return <Phone size={14} className="dept-ico" />;
  if (n.includes("tech")) return <Smartphone size={14} className="dept-ico" />;
  if (n.includes("gaming")) return <Gamepad2 size={14} className="dept-ico" />;
  if (n.includes("watch")) return <Watch size={14} className="dept-ico" />;
  if (n.includes("tablet")) return <Smartphone size={14} className="dept-ico" />;

  if (n.includes("men")) return <PersonStanding size={14} className="dept-ico" />;
  if (n.includes("women")) return <PersonStanding size={14} className="dept-ico" />;
  if (n.includes("kids")) return <Baby size={14} className="dept-ico" />;
  if (n.includes("babies") || n.includes("baby")) return <Baby size={14} className="dept-ico" />;
  if (n.includes("dress")) return <Shirt size={14} className="dept-ico" />;
  if (n.includes("hoodie") || n.includes("sweatshirt")) return <Shirt size={14} className="dept-ico" />;
  if (n.includes("t-shirt") || n.includes("tee")) return <Shirt size={14} className="dept-ico" />;
  if (n.includes("swim")) return <Waves size={14} className="dept-ico" />;
  if (n.includes("outerwear") || n.includes("jacket")) return <Layers size={14} className="dept-ico" />;
  if (n.includes("bottom") || n.includes("pant")) return <ArrowUpDown size={14} className="dept-ico" />;
  if (n.includes("top")) return <Shirt size={14} className="dept-ico" />;

  if (n.includes("apron")) return <ChefHat size={14} className="dept-ico" />;
  if (n.includes("bed")) return <Bed size={14} className="dept-ico" />;
  if (n.includes("bath")) return <Bath size={14} className="dept-ico" />;
  if (n.includes("candle")) return <Sparkles size={14} className="dept-ico" />;
  if (n.includes("pillow") || n.includes("cushion")) return <Home size={14} className="dept-ico" />;
  if (n.includes("blanket") || n.includes("throw") || n.includes("rug")) return <Home size={14} className="dept-ico" />;
  if (n.includes("mug") || n.includes("tumbler") || n.includes("bottle")) return <Coffee size={14} className="dept-ico" />;
  if (n.includes("coaster")) return <Grid3x3 size={14} className="dept-ico" />;
  if (n.includes("sticker") || n.includes("magnet")) return <Sticker size={14} className="dept-ico" />;
  if (n.includes("kitchen") || n.includes("dining") || n.includes("utensil")) return <Utensils size={14} className="dept-ico" />;
  if (n.includes("frame") || n.includes("canvas")) return <Frame size={14} className="dept-ico" />;
  if (n.includes("poster")) return <Printer size={14} className="dept-ico" />;
  if (n.includes("pet")) return <Heart size={14} className="dept-ico" />;

  if (n.includes("journal") || n.includes("notebook")) return <BookOpen size={14} className="dept-ico" />;
  if (n.includes("keychain") || n.includes("key")) return <KeyRound size={14} className="dept-ico" />;
  if (n.includes("locket") || n.includes("charm") || n.includes("necklace")) return <Gem size={14} className="dept-ico" />;
  if (n.includes("bracelet")) return <Gem size={14} className="dept-ico" />;
  if (n.includes("memory box") || n.includes("photo")) return <Box size={14} className="dept-ico" />;

  if (n.includes("kin keeper")) return <Heart size={14} className="dept-ico" />;
  if (n.includes("work bestie")) return <Star size={14} className="dept-ico" />;
  if (n.includes("chosen family")) return <HeartHandshake size={14} className="dept-ico" />;
  if (n.includes("caregiver")) return <Heart size={14} className="dept-ico" />;
  if (n.includes("mentor")) return <Sparkles size={14} className="dept-ico" />;
  if (n.includes("godparent")) return <Gem size={14} className="dept-ico" />;
  if (n.includes("sister")) return <Heart size={14} className="dept-ico" />;
  if (n.includes("ride or die")) return <Star size={14} className="dept-ico" />;

  if (n.includes("kin keeper month")) return <Calendar size={14} className="dept-ico" />;
  if (n.includes("family by choice")) return <HeartHandshake size={14} className="dept-ico" />;
  if (n.includes("just because")) return <Gift size={14} className="dept-ico" />;
  if (n.includes("day ones")) return <Star size={14} className="dept-ico" />;
  if (n.includes("holiday") || n.includes("christmas")) return <Calendar size={14} className="dept-ico" />;
  if (n.includes("halloween")) return <Sparkles size={14} className="dept-ico" />;

  if (n.includes("glass") || n.includes("pint")) return <Coffee size={14} className="dept-ico" />;
  if (n.includes("ceramic") || n.includes("travel mug")) return <Coffee size={14} className="dept-ico" />;
  if (n.includes("insulated") || n.includes("water")) return <Coffee size={14} className="dept-ico" />;

  return <Tag size={14} className="dept-ico" />;
}

// ── Full-tree sidebar ───────────────────────────────────────

function TreeNode({
  node,
  path,
  depth,
  activePath,
  expanded,
  onToggle,
}: {
  node: TaxonomyNode;
  path: string[];
  depth: number;
  activePath: string;
  expanded: Set<string>;
  onToggle: (key: string) => void;
}) {
  const key = path.join("/");
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(key);
  const isActive = activePath === key;
  const onActiveTrail = activePath.startsWith(key + "/");
  return (
    <li className="shop-tree-node">
      <div
        className={`shop-tree-row ${isActive ? "active" : ""} ${onActiveTrail ? "trail" : ""}`}
        style={{ paddingLeft: `${10 + depth * 13}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className={`shop-tree-toggle ${isOpen ? "open" : ""}`}
            aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
            aria-expanded={isOpen}
            onClick={() => onToggle(key)}
          >
            <ChevronRight size={13} />
          </button>
        ) : (
          <span className="shop-tree-toggle-spacer" />
        )}
        <Link href={`/shop/${key}`} className="shop-tree-link">
          {catIcon(node.name)}
          <span>{node.name}</span>
        </Link>
      </div>
      {hasChildren && isOpen && (
        <ul className="shop-tree-children">
          {node.children.map((child, i) => (
            <TreeNode
              key={`${child.slug}-${i}`}
              node={child}
              path={[...path, child.slug]}
              depth={depth + 1}
              activePath={activePath}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// ── PLP ─────────────────────────────────────────────────────

type SortKey = "featured" | "price-asc" | "price-desc" | "name";

interface ShopAppProps {
  slugs: string[];
  /** First page, server-fetched (unstable_cache, 5-min revalidate). */
  initialProducts: CatalogProduct[];
  initialTotal: number;
  perPage: number;
  /** Shop pages only: numbered pagination + per-page control, with
      page state in the URL. Other grid pages leave this unset and
      keep the Load More behavior exactly. */
  paged?: boolean;
  /** Server-clamped first page (from the URL, or 1). */
  initialPage?: number;
  /** Display name for pages that are not taxonomy paths (curated DB
   *  collections, relationship pages): the heading and breadcrumb say
   *  the page's own name instead of falling back to "All products". */
  title?: string;
}

export default function ShopApp({ slugs, initialProducts, initialTotal, perPage, paged = false, initialPage = 1, title }: ShopAppProps) {
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(perPage);
  const [products, setProducts] = useState<CatalogProduct[]>(initialProducts);
  const [total, setTotal] = useState<number>(initialTotal);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);
  // Refs so the popstate handler always sees current values.
  const pageRef = useRef(page);
  const sizeRef = useRef(pageSize);
  const totalRef = useRef(total);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { sizeRef.current = pageSize; }, [pageSize]);
  useEffect(() => { totalRef.current = total; }, [total]);

  // Working toolbar state.
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("featured");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [brandSel, setBrandSel] = useState<Set<string>>(new Set());
  const [sizeSel, setSizeSel] = useState<Set<string>>(new Set());
  const [colorSel, setColorSel] = useState<Set<string>>(new Set());
  // Taxonomy facet selections, keyed "Group|Label" (groups: Product type,
  // Occasion, Relationship, Collection — attached server-side from
  // product_taxonomy_links).
  const [taxSel, setTaxSel] = useState<Set<string>>(new Set());
  const [maxPrice, setMaxPrice] = useState<number | null>(null);

  // Sidebar expansion: the active path's ancestors start expanded.
  // /shop starts with every department collapsed.
  const activePath = slugs.join("/");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (let i = 1; i <= slugs.length; i++) s.add(slugs.slice(0, i).join("/"));
    return s;
  });
  const toggleNode = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const current = slugs.length ? findCategoryByPath(slugs) : null;
  const currentCategory = title ?? current?.node.name ?? "All products";
  const breadcrumbNodes = current ? [...current.ancestors, current.node] : [];
  const breadcrumbText = [
    "SHOP",
    ...breadcrumbNodes.map((b) => b.name.toUpperCase()),
    ...(current || !title ? [] : [title.toUpperCase()]),
  ].join(" / ");
  const parentHref = slugs.length > 1 ? `/shop/${slugs.slice(0, -1).join("/")}` : slugs.length === 1 ? "/shop" : null;
  const parentLabel = current && current.ancestors.length
    ? current.ancestors[current.ancestors.length - 1].name
    : "Shop all";

  // "Load More" — the ONLY place fetch() is used. Appends the next page
  // (same static→DB product mapping as the server first page).
  const loadMore = useCallback(() => {
    if (loadingMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    fetch(`/api/products?path=${encodeURIComponent(slugs.join("/"))}&page=${nextPage}&perPage=${perPage}`)
      .then((r) => r.json())
      .then((data) => {
        const more: CatalogProduct[] = data.products || [];
        setProducts((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...more.filter((p) => !seen.has(p.id))];
        });
        if (typeof data.total === "number") setTotal(data.total);
        setPage(nextPage);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  }, [slugs, page, perPage, loadingMore]);

  const hasMore = products.length < total;
  const pages = calcTotalPages(total, pageSize);

  // Paged navigation (shop pages only). A page change replaces the
  // grid with that page's products via /api/products and writes the
  // page + per-page into the URL with history.pushState, so no server
  // re-render runs; back / forward are handled by the popstate
  // listener below. Sort, filters, and search state are left alone
  // across page changes and apply to the new page.
  const buildPageUrl = (n: number, size: number) => {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(n));
    params.set("perPage", String(size));
    return `${window.location.pathname}?${params.toString()}`;
  };

  const fetchPage = useCallback((targetPage: number, size: number) => {
    setLoadingPage(true);
    return fetch(`/api/products?path=${encodeURIComponent(slugs.join("/"))}&page=${targetPage}&perPage=${size}`)
      .then((r) => r.json())
      .then((data) => {
        setProducts(data.products || []);
        if (typeof data.total === "number") setTotal(data.total);
        setPage(targetPage);
        setPageSize(size);
        setLoadingPage(false);
      })
      .catch(() => setLoadingPage(false));
  }, [slugs]);

  const goToPage = (n: number, scroll = true) => {
    if (loadingPage) return;
    const target = clampPage(n, calcTotalPages(totalRef.current, sizeRef.current));
    if (target === pageRef.current) return;
    window.history.pushState(null, "", buildPageUrl(target, sizeRef.current));
    if (scroll) document.getElementById("shop-top")?.scrollIntoView();
    void fetchPage(target, sizeRef.current);
  };

  const changePerPage = (size: number) => {
    if (loadingPage || size === sizeRef.current) return;
    window.history.pushState(null, "", buildPageUrl(1, size));
    document.getElementById("shop-top")?.scrollIntoView();
    void fetchPage(1, size);
  };

  // On mount, if the server clamped the requested page (out-of-range
  // URL), correct the URL without adding a history entry.
  useEffect(() => {
    if (!paged) return;
    const params = new URLSearchParams(window.location.search);
    const urlPage = parsePage(params.get("page"));
    const urlSize = parsePerPage(params.get("perPage"));
    if (urlPage !== initialPage || urlSize !== perPage) {
      params.set("page", String(initialPage));
      params.set("perPage", String(perPage));
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    }
    // Run once on mount: the server already seeded these values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back / forward: restore the page from the URL, no scroll jump.
  useEffect(() => {
    if (!paged) return;
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const size = parsePerPage(params.get("perPage"));
      const target = clampPage(parsePage(params.get("page")), calcTotalPages(totalRef.current, size));
      if (target === pageRef.current && size === sizeRef.current) return;
      void fetchPage(target, size);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [paged, fetchPage]);

  // Facets from the current page's products.
  const facets = useMemo(() => {
    const brands = new Map<string, number>();
    const sizes = new Map<string, number>();
    const colors = new Map<string, number>();
    const tax = new Map<string, Map<string, number>>();
    let priceCeil = 0;
    for (const p of products) {
      if (p.brand) brands.set(p.brand, (brands.get(p.brand) ?? 0) + 1);
      for (const s of p.sizes) sizes.set(s, (sizes.get(s) ?? 0) + 1);
      for (const c of p.colors) colors.set(c, (colors.get(c) ?? 0) + 1);
      for (const f of p.facets ?? []) {
        const g = tax.get(f.group) ?? new Map<string, number>();
        g.set(f.label, (g.get(f.label) ?? 0) + 1);
        tax.set(f.group, g);
      }
      if (p.minPrice != null) priceCeil = Math.max(priceCeil, Math.ceil(p.minPrice));
    }
    const byCount = (a: [string, number], b: [string, number]) => b[1] - a[1];
    const GROUP_ORDER = ["Product type", "Occasion", "Relationship", "Collection"];
    return {
      brands: [...brands.entries()].sort(byCount),
      sizes: [...sizes.entries()].sort(byCount),
      colors: [...colors.entries()].sort(byCount),
      taxGroups: GROUP_ORDER.filter((g) => tax.has(g)).map((g) => ({
        group: g,
        entries: [...(tax.get(g) as Map<string, number>).entries()].sort(byCount),
      })),
      priceCeil,
    };
  }, [products]);

  const activeFilterCount =
    brandSel.size + sizeSel.size + colorSel.size + taxSel.size + (maxPrice != null ? 1 : 0);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = products.filter((p) => {
      if (q && !`${p.name} ${p.brand ?? ""}`.toLowerCase().includes(q)) return false;
      if (brandSel.size && !(p.brand && brandSel.has(p.brand))) return false;
      if (sizeSel.size && !p.sizes.some((s) => sizeSel.has(s))) return false;
      if (colorSel.size && !p.colors.some((c) => colorSel.has(c))) return false;
      if (taxSel.size) {
        // OR within a facet group, AND across groups.
        const byGroup = new Map<string, Set<string>>();
        for (const key of taxSel) {
          const [g, label] = key.split("|");
          const s = byGroup.get(g) ?? new Set<string>();
          s.add(label);
          byGroup.set(g, s);
        }
        for (const [g, labels] of byGroup) {
          if (!(p.facets ?? []).some((f) => f.group === g && labels.has(f.label))) return false;
        }
      }
      if (maxPrice != null && (p.minPrice == null || p.minPrice > maxPrice)) return false;
      return true;
    });
    if (sort === "price-asc") out = [...out].sort((a, b) => (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity));
    if (sort === "price-desc") out = [...out].sort((a, b) => (b.minPrice ?? -1) - (a.minPrice ?? -1));
    if (sort === "name") out = [...out].sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [products, query, sort, brandSel, sizeSel, colorSel, taxSel, maxPrice]);

  const countLine = paged
    ? query.trim() || activeFilterCount > 0
      ? `${visible.length} of ${total} products on this page`
      : total === 0
        ? "0 products"
        : `Showing ${(page - 1) * pageSize + 1} to ${Math.min(page * pageSize, total)} of ${total} products`
    : `${visible.length} of ${total} products${products.length < total ? ` · ${products.length} loaded` : ""}`;

  const toggleIn = (setFn: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) =>
    setFn((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });

  const clearFilters = () => {
    setBrandSel(new Set());
    setSizeSel(new Set());
    setColorSel(new Set());
    setTaxSel(new Set());
    setMaxPrice(null);
    setQuery("");
  };

  return (
    <div className="shop-shell">
      <div className="shop-layout">
        {/* SIDEBAR — SCOPED to the page (owner rule 2026-10-30). A
            category page shows ONLY that category and its subtree;
            /shop shows the 13 departments, collapsed. No counts.
            Static client-side render; the DB is never the source. */}
        <aside className="shop-sidebar">
          {parentHref ? (
            <nav className="shop-nav">
              <Link href={parentHref} className="shop-nav-item shop-back">
                <ArrowLeft size={15} /><span>{parentLabel}</span>
              </Link>
            </nav>
          ) : (
            <nav className="shop-nav">
              <Link href="/shop" className="shop-nav-item active">
                <ShoppingBag size={16} /><span>Shop all</span>
              </Link>
            </nav>
          )}

          {current ? (
            <>
              <div className="shop-nav-label">{current.node.name.toUpperCase()}</div>
              <ul className="shop-tree">
                <TreeNode
                  key={slugs.join("/")}
                  node={current.node}
                  path={slugs}
                  depth={0}
                  activePath={activePath}
                  expanded={expanded}
                  onToggle={toggleNode}
                />
              </ul>
            </>
          ) : (
            <>
              <div className="shop-nav-label">ALL DEPARTMENTS</div>
              <ul className="shop-tree">
                {taxonomy.map((dept) => (
                  <TreeNode
                    key={dept.slug}
                    node={dept}
                    path={[dept.slug]}
                    depth={0}
                    activePath={activePath}
                    expanded={expanded}
                    onToggle={toggleNode}
                  />
                ))}
              </ul>
            </>
          )}

          <div className="shop-nav-label">COLLECTIONS</div>
          <nav className="shop-nav">
            <Link href="/relationships" className="shop-nav-item"><HeartHandshake size={15} /><span>Relationships</span></Link>
            <Link href="/collections" className="shop-nav-item"><Gift size={15} /><span>Collections</span></Link>
            <Link href="/signature" className="shop-nav-item"><Star size={15} /><span>UnSaid Signature</span></Link>
          </nav>

          <div className="sidebar-footer">
            <div className="help-card">
              <div className="tiny">NEED HELP?</div>
              <p>Find the right words.</p>
              <button type="button" className="shoppy-textbtn" onClick={() => useStore.getState().setAssistantOpen(true)}>Ask Shoppy ↗</button>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <div className="shop-content" id="shop-top">
          <div className="shop-crumb">{breadcrumbText}</div>

          <div className="shop-toolbar">
            <div>
              <h2 className="shop-title">{currentCategory}</h2>
              <p className="shop-count">{countLine}</p>
            </div>
            <div className="shop-toolbar-right">
              <input
                className="shop-search"
                type="search"
                placeholder="Search this category…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search this category"
              />
              <button
                className={`shop-filter-btn ${filtersOpen ? "is-open" : ""}`}
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
              >
                <SlidersHorizontal size={14} /> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </button>
              <select
                className="shop-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort products"
              >
                <option value="featured">Featured</option>
                <option value="price-asc">Price: Low to high</option>
                <option value="price-desc">Price: High to low</option>
                <option value="name">Name: A to Z</option>
              </select>
              {paged && (
                <label className="shop-perpage">
                  <span>Show</span>
                  <select
                    className="shop-sort"
                    value={pageSize}
                    onChange={(e) => changePerPage(Number(e.target.value))}
                    disabled={loadingPage}
                    aria-label="Products per page"
                  >
                    {PER_PAGE_OPTIONS.map((n) => (
                      <option key={n} value={n}>{n} per page</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>

          {filtersOpen && (
            <div className="shop-filters">
              {/* Mobile drawer head — CSS shows this only in the ≤900px
                  drawer presentation (owner order 2026-11-02: filters live
                  behind the hamburger, not in an inline bar). */}
              <div className="shop-filters-head">
                <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</span>
                <button type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)}>
                  <X size={18} />
                </button>
              </div>
              {facets.taxGroups.map(({ group, entries }) => (
                <fieldset key={group} className="shop-filter-group">
                  <legend>{group}</legend>
                  {entries.slice(0, 12).map(([label, count]) => (
                    <label key={label} className="shop-filter-check">
                      <input
                        type="checkbox"
                        checked={taxSel.has(`${group}|${label}`)}
                        onChange={() => toggleIn(setTaxSel, `${group}|${label}`)}
                      />
                      <span>{label}</span>
                      <span className="shop-filter-count">{count}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
              {facets.brands.length > 0 && (
                <fieldset className="shop-filter-group">
                  <legend>Brand</legend>
                  {facets.brands.slice(0, 12).map(([brand, count]) => (
                    <label key={brand} className="shop-filter-check">
                      <input
                        type="checkbox"
                        checked={brandSel.has(brand)}
                        onChange={() => toggleIn(setBrandSel, brand)}
                      />
                      <span>{brand}</span>
                      <span className="shop-filter-count">{count}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              {facets.sizes.length > 0 && (
                <fieldset className="shop-filter-group">
                  <legend>Size</legend>
                  <div className="shop-filter-chips">
                    {facets.sizes.slice(0, 16).map(([size, count]) => (
                      <button
                        key={size}
                        type="button"
                        className={`shop-filter-chip ${sizeSel.has(size) ? "active" : ""}`}
                        onClick={() => toggleIn(setSizeSel, size)}
                        aria-pressed={sizeSel.has(size)}
                      >
                        {size} · {count}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              {facets.colors.length > 0 && (
                <fieldset className="shop-filter-group">
                  <legend>Color</legend>
                  <div className="shop-filter-chips">
                    {facets.colors.slice(0, 16).map(([color, count]) => (
                      <button
                        key={color}
                        type="button"
                        className={`shop-filter-chip ${colorSel.has(color) ? "active" : ""}`}
                        onClick={() => toggleIn(setColorSel, color)}
                        aria-pressed={colorSel.has(color)}
                      >
                        {color} · {count}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
              {facets.priceCeil > 0 && (
                <fieldset className="shop-filter-group">
                  <legend>Max price</legend>
                  <input
                    type="range"
                    min={1}
                    max={facets.priceCeil}
                    value={maxPrice ?? facets.priceCeil}
                    onChange={(e) => setMaxPrice(Number(e.target.value))}
                    aria-label="Maximum price"
                  />
                  <span className="shop-filter-price">
                    {maxPrice != null ? `Up to $${maxPrice}` : "Any price"}
                  </span>
                  {maxPrice != null && (
                    <button type="button" className="shop-filter-clear-one" onClick={() => setMaxPrice(null)}>
                      <X size={12} /> Clear
                    </button>
                  )}
                </fieldset>
              )}
              {activeFilterCount > 0 && (
                <button type="button" className="shop-filter-clear" onClick={clearFilters}>
                  Clear all filters
                </button>
              )}
              <button type="button" className="shop-filters-done" onClick={() => setFiltersOpen(false)}>
                Show results
              </button>
            </div>
          )}

          {/* Product grid — server-seeded on first paint, no loading state.
              Paged shop pages fetch a page via /api/products on page
              change; other grid pages use "Load More" the same way. */}
          <div className="shop-grid">
            {visible.length === 0 ? (
              <div className="shop-empty" style={{ gridColumn: "1/-1" }}>
                <h3>{products.length === 0 ? "No products here yet" : "No products match those filters"}</h3>
                <p>
                  {products.length === 0
                    ? "This category’s catalog is still being populated."
                    : paged
                      ? "Try widening the filters, or try another page."
                      : "Try widening the filters, or load more products below."}
                </p>
                {products.length > 0 && activeFilterCount > 0 && (
                  <button type="button" className="button" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              visible.map((p, i) => (
                <Fragment key={p.id}>
                  <CatalogCard p={p} index={i} />
                  {/* One banner per page (owner rule, 2026-10-30): PromoBand renders at most once, at the first insertion point only. */}
                  {i === 7 && i < visible.length - 1 && (
                    <div style={{ gridColumn: "1/-1" }}>
                      <PromoBand />
                    </div>
                  )}
                </Fragment>
              ))
            )}
          </div>

          {/* Paged shop pages: numbered pagination (page state in the
              URL). Other grid pages keep Load More, unchanged. */}
          {paged ? (
            <nav className="shop-pagination" aria-label="Product pages">
              <button
                type="button"
                className="shop-page-btn"
                disabled={page <= 1 || loadingPage}
                onClick={() => goToPage(page - 1)}
                aria-label="Previous page"
              >
                Previous
              </button>
              {pageWindow(page, pages).map((item, i) =>
                item === "…" ? (
                  <span key={`gap-${i}`} className="shop-page-ellipsis" aria-hidden="true">…</span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={`shop-page-btn${item === page ? " active" : ""}`}
                    aria-current={item === page ? "page" : undefined}
                    aria-label={`Go to page ${item}`}
                    disabled={loadingPage}
                    onClick={() => goToPage(item)}
                  >
                    {item}
                  </button>
                )
              )}
              <button
                type="button"
                className="shop-page-btn"
                disabled={page >= pages || loadingPage}
                onClick={() => goToPage(page + 1)}
                aria-label="Next page"
              >
                Next
              </button>
              <span className="shop-page-status">
                {loadingPage ? "Loading…" : `Page ${page} of ${pages}`}
              </span>
            </nav>
          ) : (
            hasMore && (
              <div className="shop-load-more" style={{ textAlign: "center", marginTop: 24 }}>
                <button
                  type="button"
                  className="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading…" : `Load more (${total - products.length} remaining)`}
                </button>
              </div>
            )
          )}

          {/* The owner's taxonomy rule: a department's child page
              renders the size guide for its product type, under the
              products, with the collection named in the copy. */}
          <TaxonomySizeGuide names={breadcrumbNodes.map((b) => b.name)} />
        </div>
      </div>

      {/* PromoBand is the ONE promo banner on a shop page (owner rule
          2026-10-30): it renders at most once, at the first insertion
          point only. No other band renders on shop pages. */}
    </div>
  );
}
