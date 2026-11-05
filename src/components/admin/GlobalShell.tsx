"use client";

/**
 * GlobalShell — the ONE admin chrome, converted flat from the owner's
 * Global Shell mockup (Global_Shell__2.html, 2026-11-02). The mockup
 * IS the spec: 52px topbar + 44px tabstrip, 72px main rail with the
 * bottom pin bar, 260px side rail, the Enterprise Navigation Hub
 * flyout, and the Universal Create flyout — all driven by the exact
 * manifest data in @/lib/admin/global-manifest. The side rail follows
 * the owner's revamp (GLONALSHELLREVAMP2.html, "Finance Refined",
 * 2026-11-02): QuickBooks-style border-separated group sections with
 * colored circular icon badges, an "All Apps" header row for Finance,
 * and no route filter.
 *
 * The shell does NOT bend to the pages; everything else carries this
 * design weight.
 *
 * TAB SYSTEM (the feature that goes beyond QuickBooks): tabs are
 * never discarded. A domain tab keeps its place, and clicking a tab
 * or rail icon returns to THAT DOMAIN'S LAST-VISITED ROUTE (per-domain
 * route memory) — not its first route. Tab set + per-domain last
 * routes persist in localStorage (the tab set reuses the existing
 * workspace-tabs key, "uns.admin.tabs.v1", from the retired
 * AdminShell).
 *
 * Only ?embed=1 frames render BARE — no chrome — because tab frames
 * depend on embed rendering. The studio renders inside this chrome
 * like every other page (owner's order, 2026-11-02).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight, ArrowRight, BadgeCheck, Banknote, BookOpen, Building2, ChartColumn,
  ChevronDown, ChevronRight, CircleAlert, CircleDollarSign, CircleHelp, CirclePlus,
  ClipboardCheck, ClipboardList, Code, CreditCard, DollarSign, Download, File, FilePlus2,
  FileText, Folder, Headset, History, Images, Landmark, LayoutDashboard, LayoutGrid,
  ListFilter, Mail, Megaphone, Menu, Network, Package, Palette, PiggyBank, Pin, Play,
  Plus, Receipt, ReceiptText, Repeat,
  ScrollText, Search, Settings, Share2, Shirt, ShoppingBag, ShoppingCart, SlidersHorizontal,
  Sparkles, SquarePlus, Star, Store, Ticket, Truck, Undo2, Upload, UserPlus, Users,
  Wrench, X, Zap, PanelLeftOpen, ShieldCheck, HandCoins,
  type LucideIcon,
} from "lucide-react";
import {
  CREATE_CATEGORIES, HUB_PILLARS, MANIFEST, RAIL_ORDER,
  type DomainKey, type ManifestRoute,
} from "@/lib/admin/global-manifest";
import type { ModuleCode } from "@/lib/admin/modules";
import TooltipHost from "@/components/admin/Tooltip";
import "./global-shell.css";

/* ── Material Symbols (mock) → Lucide (codebase) ─────────────────
   The manifest keeps the mock's icon NAMES as data; this table is
   the one explicit translation to the app's Lucide set. */
const ICONS: Record<string, LucideIcon> = {
  grid_view: LayoutGrid,
  dashboard: LayoutDashboard,
  group: Users,
  groups: Users,
  inventory_2: Package,
  assignment: ClipboardList,
  account_balance: Landmark,
  campaign: Megaphone,
  support_agent: Headset,
  settings: Settings,
  menu: Menu,
  arrow_drop_down: ChevronDown,
  expand_more: ChevronDown,
  search: Search,
  auto_awesome: Sparkles,
  add: Plus,
  close: X,
  menu_open: PanelLeftOpen,
  add_circle: CirclePlus,
  star: Star,
  bar_chart: ChartColumn,
  mail: Mail,
  help: CircleHelp,
  filter_list: ListFilter,
  chevron_right: ChevronRight,
  error: CircleAlert,
  add_box: SquarePlus,
  download: Download,
  bolt: Zap,
  post_add: FilePlus2,
  add_shopping_cart: ShoppingCart,
  palette: Palette,
  construction: Wrench,
  shield_person: ShieldCheck,
  code: Code,
  menu_book: BookOpen,
  swap_horiz: ArrowLeftRight,
  keep: Pin,
  verified: BadgeCheck,
  tune: SlidersHorizontal,
  history: History,
  confirmation_number: Ticket,
  payments: Banknote,
  shopping_cart_checkout: ShoppingCart,
  hub: Network,
  arrow_forward: ArrowRight,
  local_shipping: Truck,
  receipt_long: ReceiptText,
  price_check: CircleDollarSign,
  request_quote: FileText,
  point_of_sale: Store,
  assignment_return: Undo2,
  summarize: ScrollText,
  person_add: UserPlus,
  credit_card: CreditCard,
  description: File,
  outbox: Upload,
  shopping_bag: ShoppingBag,
  domain_add: Building2,
  savings: PiggyBank,
  fact_check: ClipboardCheck,
  event_repeat: Repeat,
  assured_workload: HandCoins,
  checkroom: Shirt,
  view_carousel: Images,
  headset_mic: Headset,
  share: Share2,
  play_arrow: Play,
  receipt: Receipt,
  attach_money: DollarSign,
  folder: Folder,
};

function MIcon({ name, size = 20 }: { name: string; size?: number }) {
  const Cmp = ICONS[name] ?? CircleHelp;
  return <Cmp size={size} aria-hidden="true" />;
}

/* The mock's hub pillar metadata carries Tailwind class strings
   (tagCls / iconBg) and the create categories carry dot classes.
   They are data in the manifest; the visual values are resolved
   here, once. */
const PILLAR_TAG_STYLES: Record<string, CSSProperties> = {
  "bg-primary/10 text-primary": { background: "rgba(10,100,0,.1)", color: "#0a6400" },
  "bg-secondary/15 text-secondary": { background: "rgba(0,108,71,.15)", color: "#006c47" },
  "bg-tertiary/15 text-tertiary": { background: "rgba(0,85,165,.15)", color: "#0055a5" },
  "bg-secondary-container/40 text-on-secondary-fixed-variant": { background: "rgba(138,245,190,.4)", color: "#003824" },
};
const PILLAR_ICON_STYLES: Record<string, CSSProperties> = {
  "bg-primary/10 text-primary": { background: "rgba(10,100,0,.1)", color: "#0a6400" },
  "bg-secondary/10 text-secondary": { background: "rgba(0,108,71,.1)", color: "#006c47" },
  "bg-primary-container/20 text-primary": { background: "rgba(16,128,0,.2)", color: "#0a6400" },
  "bg-tertiary/10 text-tertiary": { background: "rgba(0,85,165,.1)", color: "#0055a5" },
  "bg-secondary-container/30 text-secondary": { background: "rgba(138,245,190,.3)", color: "#006c47" },
  "bg-tertiary-container/20 text-tertiary": { background: "rgba(30,109,201,.2)", color: "#0055a5" },
};
const DOT_COLORS: Record<string, string> = {
  "bg-primary": "#0a6400",
  "bg-secondary": "#006c47",
  "bg-tertiary": "#0055a5",
};

/* Siderail group badges (revamp): the manifest carries each group's
   icon name + Tailwind bg class as data (only the Finance groups
   specify them); the hex is resolved here, once. A group without
   icon/iconBg data gets the revamp's default — folder on bg-gray-500. */
const GROUP_BADGE_DEFAULT_ICON = "folder";
const GROUP_BADGE_BG: Record<string, string> = {
  "bg-blue-900": "#1e3a8a",
  "bg-qb-maroon": "#6b1e28",
  "bg-qb-green": "#1e5a38",
  "bg-qb-teal": "#0e5e6f",
  "bg-qb-navy": "#1f2937",
  "bg-gray-500": "#6b7280",
};
const GROUP_BADGE_BG_DEFAULT = "#6b7280";

/* Create items that correspond to a real route in the manifest
   navigate there; everything else closes the flyout and shows the
   mock's toast — no invented forms. */
const CREATE_ROUTES: Record<string, string> = {
  Invoice: "/admin/invoices",
  Customer: "/admin/crm/new-customer",
  Product: "/admin/products",
  Order: "/admin/orders/new",
  Ticket: "/admin/support",
  Design: "/admin/studio/new-design",
  Banner: "/admin/website/banners",
};

const HUB_QUICK: { key: string; label: string; icon: string; route: string }[] = [
  { key: "invoice", label: "+ New Invoice", icon: "post_add", route: "/admin/invoices" },
  { key: "product", label: "+ Create Product", icon: "add_shopping_cart", route: "/admin/products" },
  { key: "konva", label: "Konva Studio", icon: "palette", route: "/admin/studio" },
  { key: "banner", label: "+ Create Promo Banner", icon: "campaign", route: "/admin/website/banners" },
  { key: "ticket", label: "+ Log Support Ticket", icon: "support_agent", route: "/admin/support" },
];

const FREQUENTLY_USED: { label: string; icon: string; kbd?: string }[] = [
  { label: "Invoice", icon: "receipt_long", kbd: "⌘I" },
  { label: "Customer", icon: "person_add" },
  { label: "Product", icon: "checkroom", kbd: "POD" },
  { label: "Bill", icon: "payments" },
  { label: "Ticket", icon: "confirmation_number" },
  { label: "Order", icon: "shopping_cart_checkout" },
];

const CONNECTED_NODES = ["Printful US API", "Printify Global", "Gelato POD Routing", "Stripe Connect Gateway"];

const TABS_KEY = "uns.admin.tabs.v1";
const LAST_ROUTES_KEY = "uns.admin.last-routes.v1";

/* Dashboard Queues counts (owner's DASHBOARD_VIEW.html, 2026-11-02):
   his view file's sidebar carries LIVE counts on the Dashboard domain's
   Queues group and its three routes — the one place the revamp's
   no-badge siderail gains badges. Counts come from
   /api/admin/dashboard/views (the same payload the three queue pages
   render from, so rail and pages always agree) and are keyed here by
   route; the manifest itself is unchanged. */
const QUEUE_COUNT_ROUTES: Record<string, "attention" | "customers" | "sellers"> = {
  "/admin/notifications": "attention",
  "/admin/notifications/customers": "customers",
  "/admin/notifications/seller": "sellers",
};

type FlatRoute = ManifestRoute & { group: string };

function flatRoutes(domain: DomainKey): FlatRoute[] {
  return MANIFEST[domain].groups.flatMap((g) => g.routes.map((r) => ({ ...r, group: g.group })));
}
function firstRoute(domain: DomainKey): string {
  return MANIFEST[domain].groups[0].routes[0].route;
}
function patternRegex(route: string): RegExp {
  return new RegExp("^" + route.replace(/\[[^\]]+\]/g, "[^/]+") + "$");
}
/** Where a siderail click actually goes: dynamic pattern entries
    navigate to their static parent list. */
function navTarget(route: string): string {
  const cut = route.indexOf("/[");
  return cut >= 0 ? route.slice(0, cut) || "/admin" : route;
}

function humanizeSegment(seg: string): string {
  let decoded = seg;
  try { decoded = decodeURIComponent(seg); } catch { /* keep raw */ }
  const words = decoded.replace(/[-_]+/g, " ").trim();
  if (!words) return "";
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
}

/* Header breadcrumb (owner's order, 2026-11-02): the trail lives in
   the topbar — tenant (the switcher is the root) / Domain / Group /
   Page — never on the page. Domain/Group/Page labels come from the
   manifest via matchPath. A page nested below a manifest route, and
   a route outside the manifest entirely, fall back to the humanized
   final pathname segment. When nothing can be determined, no trail
   renders rather than a guessed one. */
function buildCrumbs(pathname: string, matched: RouteMatch | null): string[] {
  if (matched) {
    const parts = [MANIFEST[matched.domain].label, matched.route.group];
    if (matched.route.route === pathname || matched.route.route.includes("[")) {
      if (matched.route.label !== matched.route.group) parts.push(matched.route.label);
    } else {
      const last = pathname.split("/").filter(Boolean).pop() ?? "";
      const h = humanizeSegment(last);
      if (h && h !== matched.route.group) parts.push(h);
    }
    return parts.filter(Boolean);
  }
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length < 2 || segs[0] !== "admin") return [];
  const h = humanizeSegment(segs[segs.length - 1]);
  return h ? [h] : [];
}

interface RouteMatch { domain: DomainKey; route: FlatRoute }

function matchPath(pathname: string): RouteMatch | null {
  // exact
  for (const key of RAIL_ORDER) {
    for (const r of flatRoutes(key)) {
      if (r.route === pathname) return { domain: key, route: r };
    }
  }
  // dynamic patterns, e.g. /admin/orders/[id]
  for (const key of RAIL_ORDER) {
    for (const r of flatRoutes(key)) {
      if (r.route.includes("[") && patternRegex(r.route).test(pathname)) return { domain: key, route: r };
    }
  }
  // longest static prefix (nested pages under a manifest route)
  let best: RouteMatch | null = null;
  for (const key of RAIL_ORDER) {
    for (const r of flatRoutes(key)) {
      if (r.route === "/admin" || r.route.includes("[")) continue;
      if (pathname.startsWith(r.route + "/") && (!best || r.route.length > best.route.route.length)) {
        best = { domain: key, route: r };
      }
    }
  }
  return best;
}

/* ── Topbar search (owner's order, 2026-11-02: "Wire the search") ──
   The input queries /api/admin/search (type=all) and shows REAL
   records grouped by entity — it never opens navigation. ⌘K focuses
   this input; the Hub keeps its hamburger button. The documents type
   is a live endpoint type with no admin route anywhere, so its rows
   cannot land anywhere real and the panel omits that group. */
type SearchGroup = { type: string; data: Record<string, any>[]; total: number };
type SearchItem = {
  key: string;
  type: string;
  label: string;
  sub: string | null;
  route: string;
  flat: number;
};

const SEARCH_TYPE_ORDER = [
  "customers", "orders", "products", "invoices", "payments", "messages", "sellers",
] as const;
const SEARCH_TYPE_LABELS: Record<string, string> = {
  customers: "Customers",
  orders: "Orders",
  products: "Products",
  invoices: "Invoices",
  payments: "Payments",
  messages: "Messages",
  sellers: "Sellers",
};

function sstr(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return "";
}

function searchItemFor(type: string, row: Record<string, any>): Omit<SearchItem, "flat"> | null {
  const id = sstr(row.id);
  switch (type) {
    case "customers": {
      const name = [sstr(row.first_name), sstr(row.last_name)].filter(Boolean).join(" ");
      const label = name || sstr(row.email) || sstr(row.phone) || id;
      if (!label) return null;
      return {
        key: `customers:${id || label}`, type, label,
        sub: sstr(row.email) || sstr(row.phone) || null,
        route: id ? `/admin/customers/${id}` : "/admin/customers",
      };
    }
    case "orders": {
      const label = sstr(row.customer_email) || sstr(row.tracking_number) || id;
      if (!label) return null;
      return {
        key: `orders:${id || label}`, type, label,
        sub: sstr(row.status) || (sstr(row.tracking_number) ? `Tracking ${sstr(row.tracking_number)}` : null),
        route: id ? `/admin/orders/${id}` : "/admin/orders",
      };
    }
    case "products": {
      const label = sstr(row.name) || sstr(row.title);
      if (!label) return null;
      return {
        key: `products:${id || label}`, type, label,
        sub: sstr(row.brand) || sstr(row.status) || null,
        route: "/admin/catalog",
      };
    }
    case "invoices": {
      const label = sstr(row.invoice_number) || sstr(row.external_id) || id;
      if (!label) return null;
      return {
        key: `invoices:${id || label}`, type, label,
        sub: sstr(row.status) || null,
        route: "/admin/invoices",
      };
    }
    case "payments": {
      const label =
        sstr(row.payment_number) || sstr(row.processor_transaction_id) ||
        sstr(row.external_reference) || id;
      if (!label) return null;
      return {
        key: `payments:${id || label}`, type, label,
        sub: sstr(row.status) || null,
        route: "/admin/payments",
      };
    }
    case "messages": {
      const subject = sstr(row.subject);
      const from = sstr(row.from_address);
      const label = subject || from || sstr(row.body).slice(0, 60);
      if (!label) return null;
      return {
        key: `messages:${id || label}`, type, label,
        sub: subject && from ? from : sstr(row.channel) || null,
        route: "/admin/messages",
      };
    }
    case "sellers": {
      const label = sstr(row.display_name) || sstr(row.email);
      if (!label) return null;
      return {
        key: `sellers:${id || label}`, type, label,
        sub: sstr(row.display_name) ? sstr(row.email) || null : null,
        route: "/admin/sellers",
      };
    }
    default:
      return null;
  }
}

export default function GlobalShell({
  allowedModules: _allowedModules,
  email,
  role: _role,
  children,
}: {
  /** Accepted for parity with the previous shell's interface. The
      manifest has no module-grant codes; grant filtering is not
      applied to this chrome yet. */
  allowedModules: ModuleCode[] | null;
  email: string | null;
  role: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/admin";
  const router = useRouter();

  const [hydrated, setHydrated] = useState(false);
  const [openTabs, setOpenTabs] = useState<DomainKey[]>([...RAIL_ORDER]);
  const [lastRoutes, setLastRoutes] = useState<Partial<Record<DomainKey, string>>>({});
  const [lastDomain, setLastDomain] = useState<DomainKey>("dashboard");
  const [openGroups, setOpenGroups] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const k of RAIL_ORDER) init[k] = [MANIFEST[k].groups[0].group];
    return init;
  });
  const [hubOpen, setHubOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [hubQuery, setHubQuery] = useState("");
  const [createQuery, setCreateQuery] = useState("");
  const [queueCounts, setQueueCounts] = useState<{ attention: number; customers: number; sellers: number } | null>(null);
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [embed, setEmbed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [searchGroups, setSearchGroups] = useState<SearchGroup[]>([]);
  const [searchActive, setSearchActive] = useState(0);

  const toastTimer = useRef<number | undefined>(undefined);
  const hubSearchRef = useRef<HTMLInputElement>(null);
  const createSearchRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const searchSeq = useRef(0);

  const matched = useMemo(() => matchPath(pathname), [pathname]);
  const activeDomain: DomainKey = matched?.domain ?? lastDomain;
  const activeRoute: string | null = matched && matched.domain === activeDomain ? matched.route.route : null;

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 1800);
  }, []);

  const closeFlyouts = useCallback(() => {
    setHubOpen(false);
    setCreateOpen(false);
  }, []);

  const openHub = useCallback(() => {
    setCreateOpen(false);
    setHubOpen(true);
    window.setTimeout(() => hubSearchRef.current?.focus(), 60);
  }, []);

  const openCreate = useCallback(() => {
    setHubOpen(false);
    setCreateOpen(true);
    window.setTimeout(() => createSearchRef.current?.focus(), 60);
  }, []);

  /* ── persistence: hydrate once, then write through ── */
  useEffect(() => {
    try {
      const rawTabs = window.localStorage.getItem(TABS_KEY);
      if (rawTabs) {
        const parsed = (JSON.parse(rawTabs) as string[]).filter(
          (v): v is DomainKey => (RAIL_ORDER as string[]).includes(v),
        );
        if (parsed.length) setOpenTabs([...new Set(parsed)]);
      }
      const rawRoutes = window.localStorage.getItem(LAST_ROUTES_KEY);
      if (rawRoutes) {
        const parsed = JSON.parse(rawRoutes) as Record<string, string>;
        const clean: Partial<Record<DomainKey, string>> = {};
        for (const k of RAIL_ORDER) {
          const v = parsed[k];
          if (typeof v === "string" && v.startsWith("/admin")) clean[k] = v;
        }
        setLastRoutes(clean);
      }
    } catch { /* fresh state */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(TABS_KEY, JSON.stringify(openTabs)); } catch { /* ignore */ }
  }, [openTabs, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(LAST_ROUTES_KEY, JSON.stringify(lastRoutes)); } catch { /* ignore */ }
  }, [lastRoutes, hydrated]);

  /* ── Dashboard Queues counts: refresh on every navigation ── */
  useEffect(() => {
    let live = true;
    fetch("/api/admin/dashboard/views", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j?.data?.counts) setQueueCounts(j.data.counts); })
      .catch(() => { /* no counts → no pills; the rail renders as the revamp left it */ });
    return () => { live = false; };
  }, [pathname]);

  /* ── derive domain + remember the route ── */
  useEffect(() => {
    if (!matched) return;
    setLastDomain(matched.domain);
    setLastRoutes((prev) =>
      prev[matched.domain] === pathname ? prev : { ...prev, [matched.domain]: pathname },
    );
    setOpenGroups((prev) => {
      const cur = prev[matched.domain] ?? [];
      return cur.includes(matched.route.group)
        ? prev
        : { ...prev, [matched.domain]: [...cur, matched.route.group] };
    });
  }, [matched, pathname]);

  /* The current domain always has a tab (the retired shell's
     auto-add behavior, kept). */
  useEffect(() => {
    setOpenTabs((prev) => (prev.includes(activeDomain) ? prev : [...prev, activeDomain]));
  }, [activeDomain]);

  /* ── Topbar search: grouped model + flat list for keyboard ── */
  const searchModel = useMemo(() => {
    const byType = new Map(searchGroups.map((g) => [g.type, g]));
    let flat = 0;
    return SEARCH_TYPE_ORDER.flatMap((t) => {
      const g = byType.get(t);
      if (!g || g.data.length === 0) return [];
      const items = g.data
        .map((row) => searchItemFor(t, row))
        .filter((x): x is Omit<SearchItem, "flat"> => !!x)
        .map((it) => ({ ...it, flat: flat++ }));
      return items.length ? [{ type: t, total: g.total, items }] : [];
    });
  }, [searchGroups]);
  const searchFlat = useMemo(() => searchModel.flatMap((g) => g.items), [searchModel]);

  /* Debounced live query against /api/admin/search (type=all). The
     sequence guard drops responses that land after a newer query. */
  useEffect(() => {
    const q = searchQuery.trim();
    const seq = ++searchSeq.current;
    if (q.length < 2) {
      setSearchGroups([]);
      setSearchLoading(false);
      setSearchFailed(false);
      return;
    }
    setSearchLoading(true);
    const t = window.setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(q)}&type=all`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j) => {
          if (searchSeq.current !== seq) return;
          setSearchGroups(Array.isArray(j?.results) ? j.results : []);
          setSearchFailed(false);
          setSearchLoading(false);
          setSearchActive(0);
        })
        .catch(() => {
          if (searchSeq.current !== seq) return;
          setSearchGroups([]);
          setSearchFailed(true);
          setSearchLoading(false);
        });
    }, 250);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  /* The panel closes on navigation and on any click outside it. */
  useEffect(() => { setSearchOpen(false); }, [pathname]);
  useEffect(() => {
    if (!searchOpen) return;
    const onDown = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [searchOpen]);

  const runSearchSelect = useCallback(
    (item: SearchItem) => {
      setSearchOpen(false);
      searchRef.current?.blur();
      if (item.route !== pathname) router.push(item.route);
    },
    [pathname, router],
  );

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSearchOpen(true);
      setSearchActive((i) => Math.min(i + 1, Math.max(searchFlat.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSearchActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const item = searchFlat[searchActive];
      if (searchOpen && item) {
        e.preventDefault();
        runSearchSelect(item);
      }
    } else if (e.key === "Escape") {
      setSearchOpen(false);
    }
  };

  /* Date chip renders client-side only (avoids hydration mismatch). */
  useEffect(() => {
    setToday(
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    );
  }, []);

  /* ?embed=1 frames render without chrome. */
  useEffect(() => {
    try { setEmbed(new URLSearchParams(window.location.search).get("embed") === "1"); }
    catch { setEmbed(false); }
  }, [pathname]);

  /* Body scroll lock while a flyout is open (mock behavior). */
  useEffect(() => {
    if (hubOpen || createOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [hubOpen, createOpen]);

  /* Esc dismisses; ⌘K focuses the topbar SEARCH (owner's order,
     2026-11-02 — supersedes the revamp file's ⌘K→Hub assignment; the
     Hub keeps its hamburger button and logo access). (The revamp
     removes the siderail route filter, and the ⌘F shortcut goes with
     it.) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { closeFlyouts(); setTabMenuOpen(false); setSearchOpen(false); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeFlyouts]);

  /* ── navigation ── */
  const goToRoute = useCallback(
    (route: string) => {
      const target = navTarget(route);
      if (target !== pathname) router.push(target);
    },
    [pathname, router],
  );

  const activateDomain = useCallback(
    (domain: DomainKey) => {
      setOpenTabs((prev) => (prev.includes(domain) ? prev : [...prev, domain]));
      const target = lastRoutes[domain] ?? firstRoute(domain);
      if (target !== pathname) router.push(target);
    },
    [lastRoutes, pathname, router],
  );

  const closeTab = useCallback(
    (domain: DomainKey) => {
      if (openTabs.length <= 1) return; // a tab set never reaches zero
      const remaining = openTabs.filter((t) => t !== domain);
      setOpenTabs(remaining);
      if (domain === activeDomain) {
        const fallback = remaining[remaining.length - 1];
        if (fallback) {
          const target = lastRoutes[fallback] ?? firstRoute(fallback);
          if (target !== pathname) router.push(target);
        }
      }
    },
    [openTabs, activeDomain, lastRoutes, pathname, router],
  );

  const onCreateItem = useCallback(
    (label: string) => {
      closeFlyouts();
      const target = CREATE_ROUTES[label];
      if (target) {
        if (target !== pathname) router.push(target);
      } else {
        toast(`Create → ${label}`);
      }
    },
    [closeFlyouts, pathname, router, toast],
  );

  const jumpTo = useCallback(
    (route: string) => {
      closeFlyouts();
      goToRoute(route);
    },
    [closeFlyouts, goToRoute],
  );

  const initials = (email ?? "").replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase() || "A";
  const domain = MANIFEST[activeDomain];
  const crumbs = buildCrumbs(pathname, matched);
  const closedDomains = RAIL_ORDER.filter((k) => !openTabs.includes(k));

  /* ── BARE frames: only ?embed=1 frames render without chrome.
        The studio is a page inside the site chrome like every other
        page — its tab stays in the tabstrip and a user can always
        navigate away (owner's order, 2026-11-02). (All hooks are
        above this line.) ── */
  if (embed) {
    return (
      <>
        {children}
        <TooltipHost />
      </>
    );
  }

  return (
    <div className="portal-theme gs-root">
      {/* ═══════════ HEADER ═══════════ */}
      <header className="gs-header">
        <div className="gs-topbar">
          <div className="gs-topbar-left">
            <button
              type="button"
              className="gs-icon-btn"
              title="Enterprise Navigation Hub"
              aria-haspopup="dialog"
              aria-expanded={hubOpen}
              onClick={openHub}
            >
              <MIcon name="menu" size={20} />
            </button>
            <button
              type="button"
              className="gs-tenant-btn"
              onClick={() => toast("ManageKube LLC — Unsaid")}
            >
              <span>ManageKube LLC — Unsaid</span>
              <MIcon name="arrow_drop_down" size={16} />
            </button>
            {crumbs.length > 0 ? (
              <nav className="gs-crumbs" aria-label="Breadcrumb">
                {crumbs.flatMap((c, i) => {
                  const last = i === crumbs.length - 1;
                  const seg = (
                    <span
                      key={`c${i}`}
                      className={`gs-crumb${last ? " current" : ""}`}
                      {...(last ? { "aria-current": "page" as const } : {})}
                    >
                      {c}
                    </span>
                  );
                  return i === 0
                    ? [seg]
                    : [
                        <span key={`s${i}`} className="gs-crumb-sep" aria-hidden="true">
                          <MIcon name="chevron_right" size={14} />
                        </span>,
                        seg,
                      ];
                })}
              </nav>
            ) : null}
          </div>
          <div className="gs-search" ref={searchWrapRef}>
            <div className="gs-search-inner">
              <span className="gs-search-icon"><MIcon name="search" size={18} /></span>
              <input
                ref={searchRef}
                className="gs-search-input"
                placeholder="Search transactions, contacts, reports, ⌘K"
                type="search"
                value={searchQuery}
                aria-label="Search customers, orders, products, invoices, payments, messages and sellers"
                aria-expanded={searchOpen && searchQuery.trim().length >= 2}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => { if (searchQuery.trim().length >= 2) setSearchOpen(true); }}
                onKeyDown={onSearchKeyDown}
              />
              <span className="gs-search-kbd">⌘K</span>
              {searchOpen && searchQuery.trim().length >= 2 ? (
                <div className="gs-search-panel" role="listbox" aria-label="Search results">
                  {searchLoading && searchFlat.length === 0 ? (
                    <div className="gs-search-note">Searching…</div>
                  ) : searchFailed ? (
                    <div className="gs-search-note">Search is unavailable right now.</div>
                  ) : searchFlat.length === 0 ? (
                    <div className="gs-search-note">{`No results for "${searchQuery.trim()}"`}</div>
                  ) : (
                    searchModel.map((g) => (
                      <div key={g.type} className="gs-search-group">
                        <div className="gs-search-group-head">
                          <span>{SEARCH_TYPE_LABELS[g.type]}</span>
                          <span className="gs-search-group-count">{g.total}</span>
                        </div>
                        {g.items.map((it) => (
                          <button
                            key={it.key}
                            type="button"
                            role="option"
                            aria-selected={it.flat === searchActive}
                            className={`gs-search-row${it.flat === searchActive ? " active" : ""}`}
                            onMouseEnter={() => setSearchActive(it.flat)}
                            onClick={() => runSearchSelect(it)}
                          >
                            <span className="gs-search-row-label">{it.label}</span>
                            {it.sub ? <span className="gs-search-row-sub">{it.sub}</span> : null}
                            <span className="gs-search-row-type">{SEARCH_TYPE_LABELS[it.type]}</span>
                          </button>
                        ))}
                      </div>
                    ))
                  )}
                  {searchLoading && searchFlat.length > 0 ? (
                    <div className="gs-search-note">Searching…</div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="gs-topbar-right">
            <button
              type="button"
              className="gs-kinnect-btn"
              aria-label="Open Kinnect AI"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("kinnect:open", { detail: { context: "manage" } }),
                )
              }
            >
              <MIcon name="auto_awesome" size={16} />
              <span>Kinnect AI</span>
            </button>
            <button type="button" className="gs-create-btn" onClick={openCreate}>
              <MIcon name="add" size={16} />
              <span>Create</span>
            </button>
            {today ? <span className="gs-date">{today}</span> : null}
            <div className="gs-avatar" aria-hidden="true">{initials}</div>
          </div>
        </div>
        <div className="gs-tabstrip">
          <nav className="gs-tabs" role="tablist" aria-label="Open domains">
            {openTabs.map((key) => {
              const active = key === activeDomain;
              return (
                <div
                  key={key}
                  role="tab"
                  aria-selected={active}
                  className={`gs-tab${active ? " active" : ""}`}
                  onClick={() => activateDomain(key)}
                >
                  <span>{MANIFEST[key].label}</span>
                  <button
                    type="button"
                    className="gs-tab-x"
                    aria-label={`Close ${MANIFEST[key].label} tab`}
                    onClick={(e) => { e.stopPropagation(); closeTab(key); }}
                  >
                    <MIcon name="close" size={14} />
                  </button>
                </div>
              );
            })}
          </nav>
          <div className="gs-tab-add-wrap">
            <button
              type="button"
              className="gs-tab-add"
              title="Open a domain tab"
              aria-haspopup="menu"
              aria-expanded={tabMenuOpen}
              onClick={() => setTabMenuOpen((v) => !v)}
            >
              <MIcon name="add" size={18} />
            </button>
            {tabMenuOpen ? (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 55 }}
                  onClick={() => setTabMenuOpen(false)}
                />
                <div className="gs-tab-menu" role="menu" style={{ zIndex: 60 }}>
                  {closedDomains.length === 0 ? (
                    <button type="button" disabled>All domains are open</button>
                  ) : (
                    closedDomains.map((key) => (
                      <button
                        key={key}
                        type="button"
                        role="menuitem"
                        onClick={() => { setTabMenuOpen(false); activateDomain(key); }}
                      >
                        {MANIFEST[key].label}
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {/* ═══════════ MAIN RAIL ═══════════ */}
      <aside className="gs-mainrail">
        <div className="gs-rail-top">
          <div className="gs-mark">U</div>
          <nav className="gs-rail-nav" aria-label="Domains">
            {RAIL_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                className={`gs-rail-btn${key === activeDomain ? " active" : ""}`}
                title={MANIFEST[key].label}
                onClick={() => activateDomain(key)}
              >
                <MIcon name={MANIFEST[key].icon} size={20} />
              </button>
            ))}
          </nav>
        </div>
        <div className="gs-pinbar">
          <button type="button" className="gs-rail-btn" title="Master Modules" onClick={openHub}>
            <MIcon name="menu_open" size={20} />
          </button>
          <button type="button" className="gs-rail-btn gs-pin-btn primary" title="Persistent Create" onClick={openCreate}>
            <MIcon name="add_circle" size={20} />
          </button>
          <button type="button" className="gs-rail-btn" title="Favorites" onClick={() => toast("Favorites")}>
            <MIcon name="star" size={20} />
          </button>
          <button type="button" className="gs-rail-btn" title="Reports" onClick={() => toast("Reports")}>
            <MIcon name="bar_chart" size={20} />
          </button>
          <button type="button" className="gs-rail-btn gs-pin-btn" title="Inbox" onClick={() => toast("Inbox")}>
            <MIcon name="mail" size={20} />
            <span className="gs-badge">4</span>
          </button>
          <button type="button" className="gs-rail-btn" title="Settings" onClick={() => goToRoute("/admin/settings")}>
            <MIcon name="settings" size={20} />
          </button>
          <button type="button" className="gs-rail-btn" title="Help" onClick={() => goToRoute("/admin/help")}>
            <MIcon name="help" size={20} />
          </button>
          <button type="button" className="gs-avatar gs-pin-avatar" title="Profile" onClick={() => toast("Profile")}>
            {initials}
          </button>
        </div>
      </aside>

      {/* ═══════════ SIDE RAIL (revamp: QuickBooks style) ═══════════ */}
      {sideCollapsed ? (
        <aside className="gs-siderail-strip">
          <button
            type="button"
            className="gs-tune-btn"
            title="Expand sidebar"
            aria-label="Expand sidebar"
            onClick={() => setSideCollapsed(false)}
          >
            <MIcon name="menu_open" size={18} />
          </button>
        </aside>
      ) : (
      <aside className="gs-siderail">
        <div className="gs-side-head">
          <span className="gs-side-title">
            {domain.label}
          </span>
          <button
            type="button"
            className="gs-tune-btn"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            onClick={() => setSideCollapsed(true)}
          >
            <MIcon name="tune" size={18} />
          </button>
        </div>
        <div className="gs-side-nav">
          <nav style={{ display: "flex", flexDirection: "column" }}>
            {domain.groups.map((g) => {
              const open = (openGroups[activeDomain] ?? []).includes(g.group);
              const badgeBg = GROUP_BADGE_BG[g.iconBg ?? ""] ?? GROUP_BADGE_BG_DEFAULT;
              return (
                <div className="gs-group" key={g.group}>
                  <button
                    type="button"
                    className="gs-group-btn"
                    onClick={() =>
                      setOpenGroups((prev) => {
                        const cur = prev[activeDomain] ?? [];
                        return {
                          ...prev,
                          [activeDomain]: cur.includes(g.group)
                            ? cur.filter((x) => x !== g.group)
                            : [...cur, g.group],
                        };
                      })
                    }
                  >
                    <span className="gs-group-left">
                      <span className="gs-group-badge" style={{ background: badgeBg }}>
                        <MIcon name={g.icon ?? GROUP_BADGE_DEFAULT_ICON} size={14} />
                      </span>
                      <span className="gs-group-name">{g.group}</span>
                      {activeDomain === "dashboard" && g.group === "Queues" && queueCounts
                        && queueCounts.attention + queueCounts.customers + queueCounts.sellers > 0 ? (
                        <span className="gs-count-pill gs-count-pill-group">
                          {queueCounts.attention + queueCounts.customers + queueCounts.sellers}
                        </span>
                      ) : null}
                    </span>
                    <span className={`gs-group-chevron${open ? " open" : ""}`}>
                      <MIcon name="expand_more" size={18} />
                    </span>
                  </button>
                  {open ? (
                    <div className="gs-group-routes">
                      {g.routes.map((r) => (
                        <button
                          key={r.route}
                          type="button"
                          className={`gs-route-btn${r.route === activeRoute ? " active" : ""}`}
                          onClick={() => goToRoute(r.route)}
                        >
                          <span className="gs-route-label">{r.label}</span>
                          {activeDomain === "dashboard" && queueCounts && QUEUE_COUNT_ROUTES[r.route]
                            && queueCounts[QUEUE_COUNT_ROUTES[r.route]] > 0 ? (
                            <span className={`gs-count-pill${r.route === "/admin/notifications" ? " gs-count-pill-alert" : ""}`}>
                              {queueCounts[QUEUE_COUNT_ROUTES[r.route]]}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>
        </div>
        <div className="gs-side-foot">
          <div className="gs-foot-btns">
            <button type="button" className="gs-foot-btn" onClick={() => toast("Workspace")}>
              <MIcon name="add_box" size={14} />
              <span>Workspace</span>
            </button>
            <button type="button" className="gs-foot-btn" onClick={() => toast("Export")}>
              <MIcon name="download" size={14} />
              <span>Export</span>
            </button>
          </div>
          <div className="gs-sync-row">
            <span><span className="gs-sync-dot" />Sync: 2s ago</span>
            <span>v3.8.4</span>
          </div>
        </div>
      </aside>
      )}

      {/* ═══════════ CONTENT ═══════════ */}
      <div className={sideCollapsed ? "gs-content gs-content-wide" : "gs-content"}>
        <main className="gs-main">{children}</main>
      </div>

      {/* ═══════════ FLYOUT 1: Enterprise Navigation Hub ═══════════ */}
      {hubOpen ? (
        <div className="gs-scrim" onClick={(e) => { if (e.target === e.currentTarget) closeFlyouts(); }}>
          <div className="gs-panel gs-hub-panel" role="dialog" aria-label="Enterprise Navigation Hub">
            <div className="gs-hub-head">
              <div className="gs-hub-title-row">
                <div className="gs-hub-brand">
                  <div className="gs-hub-logo"><MIcon name="grid_view" size={26} /></div>
                  <div>
                    <div className="gs-hub-title-line">
                      <h1 className="gs-hub-title">Enterprise Navigation Hub</h1>
                      <span className="gs-hub-badge">Production Spine v4.2</span>
                    </div>
                    <p className="gs-hub-sub">Master command center • Unified multi-pillar operational architecture</p>
                  </div>
                </div>
                <div className="gs-hub-actions">
                  <div className="gs-hub-search">
                    <span className="gs-hub-search-icon"><MIcon name="search" size={20} /></span>
                    <input
                      ref={hubSearchRef}
                      className="gs-hub-search-input"
                      placeholder="Jump to module, tool, ledger, or queue... (Cmd+K)"
                      type="text"
                      value={hubQuery}
                      onChange={(e) => setHubQuery(e.target.value)}
                      aria-label="Search the Navigation Hub"
                    />
                    <div className="gs-hub-search-keys">
                      <kbd className="gs-kbd">⌘K</kbd>
                      <kbd className="gs-kbd">ESC</kbd>
                    </div>
                  </div>
                  <button type="button" className="gs-hub-close" title="Close (Esc)" onClick={closeFlyouts}>
                    <MIcon name="close" size={22} />
                  </button>
                </div>
              </div>
              <div className="gs-quick-strip">
                <div className="gs-quick-left">
                  <span className="gs-quick-label">
                    <MIcon name="bolt" size={15} /> Quick Launch:
                  </span>
                  {HUB_QUICK.map((q) => (
                    <button
                      key={q.key}
                      type="button"
                      className="gs-quick-btn"
                      onClick={() => jumpTo(q.route)}
                    >
                      <MIcon name={q.icon} size={16} /> {q.label}
                    </button>
                  ))}
                </div>
                <div className="gs-hub-live">
                  <span className="gs-live-dot" />
                  <span>Auto-Router Active • Latency 28ms</span>
                </div>
              </div>
            </div>
            <div className="gs-hub-grid-wrap">
              <div className="gs-hub-grid">
                {HUB_PILLARS.map((p) => {
                  const d = MANIFEST[p.key];
                  const links = d.groups.slice(0, 4).map((g) => ({
                    label: g.group,
                    route: g.routes[0].route,
                    count: g.routes.length,
                  }));
                  const cardText = (p.label + " " + p.blurb + " " + links.map((l) => l.label).join(" ")).toLowerCase();
                  if (hubQuery.trim() && !cardText.includes(hubQuery.trim().toLowerCase())) return null;
                  return (
                    <div className="gs-pillar-card" key={p.key}>
                      <div>
                        <div className="gs-pillar-head">
                          <div className="gs-pillar-head-left">
                            <div className="gs-pillar-icon" style={PILLAR_ICON_STYLES[p.iconBg]}>
                              <MIcon name={p.icon} size={20} />
                            </div>
                            <span className="gs-pillar-name">{p.num}. {p.label}</span>
                          </div>
                          <span className="gs-pillar-tag" style={PILLAR_TAG_STYLES[p.tagCls]}>{p.tag}</span>
                        </div>
                        <p className="gs-pillar-blurb">{p.blurb}</p>
                        <div className="gs-pillar-links">
                          {links.map((l) => (
                            <button
                              key={l.label}
                              type="button"
                              className="gs-pillar-link"
                              onClick={() => jumpTo(l.route)}
                            >
                              <span className="gs-pillar-link-left">
                                <MIcon name="chevron_right" size={16} />
                                {l.label}
                              </span>
                              <span className="gs-pillar-link-count">{l.count}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="gs-pillar-foot">
                        <span>{d.groups.length} groups · {flatRoutes(p.key).length} routes</span>
                        <button
                          type="button"
                          className="gs-pillar-explore"
                          onClick={() => jumpTo(d.overview.route)}
                        >
                          Explore <MIcon name="chevron_right" size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="gs-nodes-card">
                  <div>
                    <div className="gs-pillar-head">
                      <div className="gs-pillar-head-left">
                        <div className="gs-nodes-icon"><MIcon name="hub" size={20} /></div>
                        <span className="gs-pillar-name">Connected Nodes</span>
                      </div>
                      <span className="gs-nodes-dot" />
                    </div>
                    <p className="gs-pillar-blurb">Live webhook sync &amp; supplier fulfillment network status.</p>
                    <div className="gs-nodes-list">
                      {CONNECTED_NODES.map((n) => (
                        <div className="gs-node-row" key={n}>
                          <span className="gs-node-name"><span className="gs-node-dot" />{n}</span>
                          <span className="gs-node-live">Live</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ paddingTop: 12 }}>
                    <button
                      type="button"
                      className="gs-nodes-manage"
                      onClick={() => jumpTo("/admin/integrations")}
                    >
                      Manage all 14 integrations <MIcon name="arrow_forward" size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="gs-hub-foot">
              <div className="gs-hub-utils">
                <span className="gs-hub-utils-label">
                  <MIcon name="construction" size={15} /> Utilities:
                </span>
                <button type="button" className="gs-util-btn" onClick={() => jumpTo("/admin/settings")}>
                  <MIcon name="settings" size={18} /> Global Settings
                </button>
                <button type="button" className="gs-util-btn" onClick={() => jumpTo("/admin/users")}>
                  <MIcon name="shield_person" size={18} /> Staff &amp; Roles
                </button>
                <button type="button" className="gs-util-btn" onClick={() => jumpTo("/admin/integrations")}>
                  <MIcon name="code" size={18} /> API Keys &amp; Webhooks
                </button>
                <button type="button" className="gs-util-btn" onClick={() => jumpTo("/admin/docs")}>
                  <MIcon name="menu_book" size={18} /> Documentation
                </button>
                <button type="button" className="gs-util-btn" onClick={() => jumpTo("/admin/support")}>
                  <MIcon name="help" size={18} /> Enterprise Support
                </button>
              </div>
              <div className="gs-hub-status">
                <div className="gs-tenant-chip">
                  <div className="gs-tenant-dot" />
                  <span className="gs-tenant-chip-name">Production US-East</span>
                  <span className="gs-tenant-chip-id">Tenant #00281</span>
                </div>
                <button type="button" className="gs-switch-org" onClick={() => toast("Switch Org")}>
                  <MIcon name="swap_horiz" size={16} /> Switch Org
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ═══════════ FLYOUT 2: Universal Create ═══════════ */}
      {createOpen ? (
        <div className="gs-scrim" onClick={(e) => { if (e.target === e.currentTarget) closeFlyouts(); }}>
          <div className="gs-panel gs-create-panel" role="dialog" aria-label="Create New">
            <div className="gs-create-gradient" />
            <div className="gs-create-head">
              <div className="gs-create-title-row">
                <div className="gs-create-brand">
                  <div className="gs-create-logo"><MIcon name="add_box" size={24} /></div>
                  <div>
                    <div className="gs-create-title-line">
                      <span className="gs-create-title">Create New</span>
                      <span className="gs-chip-p1">P1 Universal Factory</span>
                      <span className="gs-chip-count">38 Entities</span>
                    </div>
                    <p className="gs-create-sub">Universal enterprise creation suite across commerce, accounts, banking &amp; production pipelines.</p>
                  </div>
                </div>
                <div className="gs-create-head-btns">
                  <button type="button" className="gs-pin-keep" onClick={() => toast("Pin")}>
                    <MIcon name="keep" size={16} /> Pin
                  </button>
                  <button type="button" className="gs-create-close" title="Close (Esc)" onClick={closeFlyouts}>
                    <MIcon name="close" size={18} />
                  </button>
                </div>
              </div>
              <div className="gs-create-search">
                <span className="gs-create-search-icon"><MIcon name="search" size={20} /></span>
                <input
                  ref={createSearchRef}
                  className="gs-create-search-input"
                  placeholder="Search all 38 creates... (invoice, product, lead, PO, bill)"
                  type="text"
                  value={createQuery}
                  onChange={(e) => setCreateQuery(e.target.value)}
                  aria-label="Search creates"
                />
                <div className="gs-create-search-hint">
                  <kbd className="gs-kbd-sm">TAB</kbd>
                  <span>to jump</span>
                </div>
              </div>
              <div className="gs-freq">
                <span className="gs-freq-label">
                  <MIcon name="history" size={14} /> Frequently Used:
                </span>
                {FREQUENTLY_USED.map((f) => (
                  <button
                    key={f.label}
                    type="button"
                    className="gs-freq-chip"
                    onClick={() => onCreateItem(f.label)}
                  >
                    <MIcon name={f.icon} size={14} /> {f.label}
                    {f.kbd ? <span className="gs-freq-key">{f.kbd}</span> : null}
                  </button>
                ))}
              </div>
            </div>
            <div className="gs-create-grid">
              {CREATE_CATEGORIES.map((cat) => (
                <div className="gs-create-cat" key={cat.title}>
                  <div className="gs-create-cat-head">
                    <div className="gs-create-cat-title">
                      <span className="gs-create-cat-dot" style={{ background: DOT_COLORS[cat.dot] ?? "#0a6400" }} />
                      <span className="gs-create-cat-name">{cat.title}</span>
                    </div>
                    <span className="gs-create-cat-count">{cat.items.length} items</span>
                  </div>
                  <nav className="gs-create-items">
                    {cat.items.map((it) => {
                      const q = createQuery.trim().toLowerCase();
                      if (q && !(it.label + " " + it.desc).toLowerCase().includes(q)) return null;
                      return (
                        <button
                          key={it.label}
                          type="button"
                          className="gs-create-item"
                          onClick={() => onCreateItem(it.label)}
                        >
                          <span className="gs-create-item-top">
                            <span className="gs-create-item-label">
                              <MIcon name={it.icon} size={16} />
                              {it.label}
                            </span>
                          </span>
                          <span className="gs-create-item-desc">{it.desc}</span>
                        </button>
                      );
                    })}
                  </nav>
                </div>
              ))}
            </div>
            <div className="gs-create-foot">
              <div className="gs-save-grammar">
                <MIcon name="verified" size={16} />
                <span>
                  Universal Save Grammar: <strong>Save</strong> • <strong>Save &amp; New</strong> • <strong>Save &amp; Close</strong>
                </span>
              </div>
              <div className="gs-create-foot-right">
                <button type="button" className="gs-customize-btn" onClick={() => toast("Customize Flyout")}>
                  <MIcon name="tune" size={16} /> Customize Flyout (Pick 10)
                </button>
                <span className="gs-foot-sep">|</span>
                <div className="gs-kbd-hints">
                  <span><kbd className="gs-kbd-key gs-kbd-key-sm">↑</kbd> <kbd className="gs-kbd-key gs-kbd-key-sm">↓</kbd> navigate</span>
                  <span>•</span>
                  <span><kbd className="gs-kbd-key">↵</kbd> open</span>
                  <span>•</span>
                  <span><kbd className="gs-kbd-key">ESC</kbd> dismiss</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`gs-toast${toastMsg ? " show" : ""}`} role="status">{toastMsg}</div>
      <TooltipHost />
    </div>
  );
}
