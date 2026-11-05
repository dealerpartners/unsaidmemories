'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DawgNavSection, LocationItem } from '@/lib/types';
import { MASTER_ONLY_SECTION_IDS } from '@/lib/admin/portal-nav';
import { SELLER_NAV_CHILDREN } from '@/lib/sellers/nav';
import {
  PawPrint,
  LayoutGrid,
  Users,
  Calendar,
  CreditCard,
  Repeat,
  FileText,
  Coins,
  Wallet,
  RotateCcw,
  Gift,
  Tag,
  CalendarClock,
  Package,
  BarChart3,
  Settings,
  ChevronDown,
  X,
  Receipt,
  FileSearch,
  Truck,
  Landmark,
  ArrowDownLeft,
  Inbox,
  Terminal,
  BookOpen,
  Scale,
  CalendarRange,
  MessageSquare,
  Share2,
  Scissors,
  ClipboardCheck,
  Phone,
  GraduationCap,
  Handshake,
  Library,
  PlayCircle,
  Award,
  FolderOpen,
  UserCheck,
  Heart,
  Stethoscope,
  Pill,
  Building2,
  ShieldCheck,
  House,
  Bell,
  BellRing,
  LifeBuoy,
  LogOut,
  CalendarPlus,
  Store,
  Video,
  Plus,
  Minus,
  Boxes,
  Bot,
  Gauge,
  Megaphone,
  Radio,
  Rocket,
  ClipboardList,
  BadgeDollarSign,
  Undo2,
  Lock,
  KeyRound,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ============================================================================
// Portal-aware Sidebar.
//
// Each of the five doors gets its OWN sidebar identity — no shared "Service
// Portal" label and no admin business nav bleeding into the customer or
// groomer rail. The variant decides which nav groups render and the brand
// subtitle shown in the header.
//
//   admin      — the full OS: CRM / ORDERS / ACCOUNTING (the only place these
//                sections belong — groomers and customers never see them)
//   customer   — PET PARENT: the owner's exact My Account tree (My Orders /
//                My Appointments / Learn Courses / My Pet Health / My Profile /
//                Need Help? / Sign Out). Route-driven: every item is a <Link>,
//                active state comes from usePathname — NOT the section store —
//                so direct visits, back/forward and in-page links all highlight
//                correctly. Admin/groomer/seller keep the section-id store
//                mechanism unchanged.
//   groomer    — GROOMER STATION: station dashboard, assigned appointments,
//                shifts, handling notes, style records
//   seller  — SELLER CENTER: the real seller-center tree (dashboard,
//                onboarding, catalog, inventory, orders, returns, shipping,
//                payments, pricing, analytics, performance, governance,
//                communication, account). The FULL tree always renders;
//                the layout passes visibleSections (the whole tree) plus
//                lockedSections from GET /api/seller/shell — the seller's
//                database state locks what it doesn't grant, with the
//                reason on the item (an applicant sees the marketplace
//                sections locked until activation, never hidden).
//   lms        — LEARNING CENTER: my learning, catalog, in progress,
//                completed, certificates, resources
// ============================================================================

export type SidebarVariant = 'admin' | 'customer' | 'groomer' | 'seller' | 'lms';

interface SidebarProps {
  activeSection: DawgNavSection;
  onSelectSection: (section: DawgNavSection) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  selectedLocation: string;
  onSelectLocation: (loc: string) => void;
  locationsList?: LocationItem[];
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Which door's sidebar to render. Defaults to 'admin' for backward compat. */
  variant?: SidebarVariant;
  /** Admin variant only: whether the active tenant is the master tenant.
   *  false = child (franchise) tenant — master-only sections (Marketplace,
   *  Trust & Safety, AI Ops, Policies, Website Templates) are removed from
   *  the tree at every role. Omitted/true = master, tree unchanged. */
  tenantIsMaster?: boolean;
  /** Customer variant only: fires the pinned Sign Out button (POST logout,
   * then redirect). Other variants ignore it. */
  onSignOut?: () => void;
  /** Seller variant only: when provided, it names the whole tree (the
   * navigation renders entire) — access is expressed through
   * lockedSections, not by trimming this list. Other variants ignore it
   * and render their full groups. */
  visibleSections?: DawgNavSection[];
  /** Seller variant only: when provided, the sections it names render
   * LOCKED — visible in the tree (the tree is the navigation), inert,
   * with the lock reason the layout derived from the seller's database
   * state. Grants lock access; they never hide the node. Other variants
   * ignore it. */
  lockedSections?: Partial<Record<DawgNavSection, string>>;
  /** Seller variant only: live count badges per section id (open
   * violations, unread notifications). Other variants ignore it. */
  sectionBadges?: Partial<Record<DawgNavSection, string>>;
}

interface NavGroup {
  category?: string;
  categoryDefaultSection?: DawgNavSection;
  items: {
    id: DawgNavSection;
    label: string;
    icon: React.ElementType;
    badge?: string;
    /** Seller variant only: the section renders locked with this reason. */
    lockedReason?: string;
    /** Seller variant only: the section's child pages, rendered under
     * the parent (the tree is the navigation — children always
     * visible, a locked parent locks its children with it). */
    children?: { label: string; href: string }[];
  }[];
}

interface VariantConfig {
  /** Brand subtitle shown under "Unsaid" in the sidebar header. */
  subtitle: string;
  /** Section-id nav groups (admin/groomer/seller/lms). The customer
   * variant navigates by route instead — see CUSTOMER_NAV below. */
  groups?: NavGroup[];
}

const VARIANT_CONFIG: Record<SidebarVariant, VariantConfig> = {
  admin: {
    subtitle: 'Admin OS',
    groups: [
      {
        category: 'CRM',
        categoryDefaultSection: 'dashboard',
        items: [
          { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
          { id: 'customers', label: 'Customers', icon: Users },
          { id: 'staff', label: 'Staff', icon: Users },
        ],
      },
      {
        // The Support Desk — its own first-class section (Sunny,
        // 2026-10-13): one queue for every user type's tickets, DMCA
        // included. Gated by the 'support' module (portal-nav).
        category: 'SUPPORT',
        categoryDefaultSection: 'messages',
        items: [
          { id: 'messages', label: 'Support Desk', icon: LifeBuoy },
        ],
      },
      {
        category: 'ORDERS',
        categoryDefaultSection: 'orders',
        items: [
          { id: 'orders', label: 'Orders & POS', icon: Receipt },
          { id: 'order-details', label: 'Order Details', icon: FileSearch },
          { id: 'inventory', label: 'Products & Inventory', icon: Package },
          { id: 'shipping', label: 'Shipping Station', icon: Truck },
          { id: 'returns', label: 'Returns & RMA', icon: ArrowDownLeft },
          { id: 'purchase-orders', label: 'Purchase Orders', icon: Inbox },
          { id: 'supplier-orders', label: 'Supplier Orders', icon: Truck },
        ],
      },
      {
        category: 'ACCOUNTING',
        categoryDefaultSection: 'invoices',
        items: [
          // P0-4: Hidden — no backend (was mock/fiction). Re-enable when wired.
          // { id: 'books', label: 'Books & Records', icon: BookOpen },
          { id: 'invoices', label: 'Invoices & Sales', icon: FileText },
          { id: 'payments', label: 'Payments & Register', icon: CreditCard },
          { id: 'bills', label: 'Bills & Purchases', icon: Receipt },
          { id: 'banking', label: 'Banking', icon: Landmark },
          { id: 'deposits', label: 'Deposits & Escrow', icon: Coins },
          { id: 'refunds', label: 'Refunds & Disputes', icon: RotateCcw },
          { id: 'gift-cards', label: 'Gift Cards & Credits', icon: Gift },
          { id: 'payroll', label: 'Payroll & Commissions', icon: Users },
          { id: 'taxes', label: 'Taxes & Compliance', icon: Scale },
          { id: 'reports', label: 'Financial Reports', icon: BarChart3 },
          // P0-4: Hidden — Save button was alert(). Re-enable when wired.
          // { id: 'financial-settings', label: 'Financial Settings', icon: Settings },
        ],
      },
      {
        category: 'POS',
        categoryDefaultSection: 'pos',
        items: [
          { id: 'pos', label: 'Cloud Register', icon: CreditCard },
          { id: 'subscriptions', label: 'Subscriptions', icon: Repeat },
        ],
      },
      {
        category: 'MARKETPLACE',
        categoryDefaultSection: 'sellers',
        items: [
          { id: 'sellers', label: 'Sellers', icon: Store },
          { id: 'sellers/review-queue', label: 'Seller Review Queue', icon: ClipboardCheck },
          { id: 'sellers/advertising', label: 'Seller Advertising', icon: Megaphone },
          { id: 'listings', label: 'Listings Review', icon: Package },
          { id: 'catalog-review', label: 'Catalog Review', icon: ClipboardCheck },
          { id: 'fees', label: 'Fees', icon: Coins },
        ],
      },
      {
        category: 'TRUST & SAFETY',
        categoryDefaultSection: 'trust-safety',
        items: [
          { id: 'trust-safety', label: 'Trust & Safety', icon: ShieldCheck },
          { id: 'policies', label: 'Policies', icon: FileText },
        ],
      },
      {
        category: 'SYSTEM',
        categoryDefaultSection: 'ai-ops',
        items: [
          { id: 'ai-ops', label: 'AI Ops', icon: Terminal },
          { id: 'audit', label: 'Audit Log', icon: FileSearch },
          { id: 'identity-grants', label: 'Identity Grants', icon: KeyRound },
          { id: 'docs', label: 'Document Center', icon: BookOpen },
        ],
      },
      {
        // The tenant's own storefront (S6): every tenant manages its own
        // site in My Website; assigning templates across tenants is the
        // master's Website Templates surface (master-only section — child
        // tenants never see it; see MASTER_ONLY_SECTION_IDS).
        category: 'WEBSITE',
        categoryDefaultSection: 'franchise',
        items: [
          { id: 'franchise', label: 'Franchises', icon: Store },
        ],
      },
    ],
  },

  customer: {
    // The customer rail is the owner's exact My Account tree, rendered as
    // <Link> rows (route-driven) — see CUSTOMER_NAV. No section-id groups.
    subtitle: 'Pet Parent Portal',
  },

  groomer: {
    subtitle: 'Employee Portal',
    groups: [
      {
        category: 'EMPLOYEE PORTAL',
        categoryDefaultSection: 'dashboard',
        items: [
          { id: 'dashboard', label: 'Station Dashboard', icon: LayoutGrid },
          { id: 'appointments', label: 'Assigned Appointments', icon: Calendar },
          { id: 'schedule', label: 'My Shifts', icon: CalendarClock },
          { id: 'pay', label: 'My Pay', icon: Wallet },
          { id: 'hr', label: 'HR & Profile', icon: ClipboardCheck },
          { id: 'grooming-records', label: 'Handling Notes', icon: FileText },
          { id: 'pets', label: 'Style Records', icon: Scissors },
          { id: 'messages', label: 'Support', icon: LifeBuoy },
        ],
      },
    ],
  },

  seller: {
    subtitle: 'Seller Center',
    groups: [
      {
        category: 'SELLER CENTER',
        categoryDefaultSection: 'dashboard',
        items: [
          { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
          { id: 'onboarding', label: 'Onboarding', icon: Rocket },
        ],
      },
      {
        category: 'CATALOG',
        categoryDefaultSection: 'catalog',
        items: [
          { id: 'catalog', label: 'Products', icon: Package },
          { id: 'inventory', label: 'Inventory', icon: Boxes },
          { id: 'brands', label: 'Brands', icon: Award },
        ],
      },
      {
        category: 'SALES',
        categoryDefaultSection: 'orders',
        items: [
          { id: 'orders', label: 'Orders', icon: Receipt },
          { id: 'customers', label: 'Customers', icon: Users },
          { id: 'returns', label: 'Returns', icon: RotateCcw },
          { id: 'shipping', label: 'Shipping', icon: Truck },
        ],
      },
      {
        category: 'MONEY',
        categoryDefaultSection: 'payments',
        items: [
          { id: 'payments', label: 'Payments', icon: Wallet },
          { id: 'tax', label: 'Tax', icon: Landmark },
          { id: 'pricing', label: 'Pricing', icon: BadgeDollarSign },
          { id: 'promotions', label: 'Promotions', icon: Tag },
          { id: 'advertising', label: 'Advertising', icon: Megaphone },
          { id: 'live', label: 'Go Live', icon: Radio },
        ],
      },
      {
        category: 'GROWTH',
        categoryDefaultSection: 'analytics',
        items: [
          { id: 'analytics', label: 'Analytics', icon: BarChart3 },
          { id: 'performance', label: 'Performance', icon: Gauge },
          { id: 'reports', label: 'Reports', icon: ClipboardList },
          { id: 'success', label: 'Success Hub', icon: Rocket },
          { id: 'social', label: 'Social Push', icon: Share2 },
          { id: 'ai-ops', label: 'AI Ops', icon: Bot },
        ],
      },
      {
        category: 'ACCOUNT',
        categoryDefaultSection: 'account',
        items: [
          { id: 'governance', label: 'Governance', icon: ShieldCheck },
          { id: 'communication', label: 'Messages', icon: MessageSquare },
          { id: 'account', label: 'Settings', icon: Users },
          { id: 'docs', label: 'Seller U', icon: BookOpen },
        ],
      },
    ],
  },

  lms: {
    subtitle: 'Learning Center',
    groups: [
      {
        category: 'LEARN',
        categoryDefaultSection: 'my-learning',
        items: [
          { id: 'my-learning', label: 'My Learning', icon: GraduationCap },
          { id: 'course-catalog', label: 'Course Catalog', icon: Library },
          { id: 'in-progress', label: 'In Progress', icon: PlayCircle },
          { id: 'completed', label: 'Completed', icon: Award },
          { id: 'certificates', label: 'Certificates', icon: Award },
          { id: 'resources', label: 'Resources', icon: FolderOpen },
        ],
      },
    ],
  },
};

// ----------------------------------------------------------------------------
// CUSTOMER_NAV — the owner's exact My Account menu tree (verbatim, in order).
// Enterprise pattern: group headers as muted uppercase labels (never
// collapsible — children always visible), children as indented rows with
// icons, standalone items (Learn Courses, Need Help?) as top-level rows.
// Every row navigates by ROUTE (next/link); the active row is derived from
// usePathname, so the rail is correct on direct visits, back/forward, and
// in-page links alike — not just on sidebar clicks.
// ----------------------------------------------------------------------------

interface CustomerNavItem {
  label: string;
  icon: React.ElementType;
  href: string;
}

interface CustomerNavBlock {
  /** Muted uppercase group header. Omitted for standalone top-level items. */
  category?: string;
  items: CustomerNavItem[];
}

const CUSTOMER_NAV: CustomerNavBlock[] = [
  // The two tenets the portal owes every signed-in visitor: a way BACK to
  // the public site (shop/services) and a way to start the NEXT booking —
  // both pinned at the very top of the rail, above everything else.
  {
    items: [
      { label: 'Book a New Appointment', icon: CalendarPlus, href: '/book/appointment' },
      { label: 'Back to the Shop', icon: Store, href: '/shop' },
    ],
  },
  {
    items: [{ label: 'Notifications', icon: BellRing, href: '/customer/notifications' }],
  },
  {
    category: 'My Orders',
    items: [
      { label: 'Order History', icon: Receipt, href: '/customer/orders' },
      { label: 'Receipts', icon: Receipt, href: '/customer/receipts' },
      { label: 'Buy Again', icon: RotateCcw, href: '/customer/orders/buy-again' },
      { label: 'Wish List', icon: Heart, href: '/customer/orders/wish-list' },
      { label: 'Reship', icon: Repeat, href: '/customer/orders/reship' },
      { label: 'Subscriptions', icon: CalendarClock, href: '/customer/orders/subscriptions' },
      { label: 'Perks Dashboard', icon: Gift, href: '/customer/orders/perks' },
      { label: 'Gift Cards', icon: Gift, href: '/customer/orders/gift-cards' },
      { label: 'Start a Return', icon: Undo2, href: '/customer/orders/returns' },
    ],
  },
  {
    category: 'My Appointments',
    items: [
      { label: 'Grooming Appointments', icon: Calendar, href: '/customer/appointments' },
      { label: 'Vet Appointments', icon: Stethoscope, href: '/customer/appointments/vet' },
    ],
  },
  {
    category: 'My Pet Health',
    items: [
      { label: 'Records', icon: FileText, href: '/customer/health/records' },
      { label: 'My Prescriptions', icon: Pill, href: '/customer/health/prescriptions' },
      { label: 'My Vet', icon: Building2, href: '/customer/health/my-vet' },
      { label: 'Insurance', icon: ShieldCheck, href: '/customer/health/insurance' },
      { label: 'Telemedicine', icon: Video, href: '/customer/health/telemedicine' },
      { label: 'Book a Vet Visit', icon: CalendarPlus, href: '/customer/health/telemedicine/book' },
      { label: 'Vet Directory', icon: Users, href: '/customer/health/telemedicine/directory' },
      { label: 'Symptom Triage', icon: ClipboardList, href: '/customer/health/telemedicine/triage' },
      { label: 'Health File Cabinet', icon: FolderOpen, href: '/customer/health/telemedicine/cabinet' },
    ],
  },
  {
    category: 'My Profile',
    items: [
      { label: 'My Pets', icon: PawPrint, href: '/customer/pets' },
      { label: 'Payment Methods', icon: CreditCard, href: '/customer/profile/payment-methods' },
      { label: 'Address Book', icon: House, href: '/customer/profile/address-book' },
      { label: 'Communication Preferences', icon: Bell, href: '/customer/profile/communication-preferences' },
      { label: 'Kinnect & AI', icon: Bot, href: '/customer/profile/ai-preferences' },
      { label: 'Documents', icon: FileText, href: '/customer/documents' },
      { label: 'Pet Gallery', icon: PawPrint, href: '/customer/pets/gallery' },
    ],
  },
  {
    // Messages (§6.8 / §6.14) — the customer's seller-message inbox.
    // Census fix 2026-10-23: the page and its API were fully built
    // but NO surface linked here — the rail is the door the tree
    // promises, at the position the Learning Center note below
    // already assumed ("after Profile/Messages").
    items: [{ label: 'Messages', icon: MessageSquare, href: '/customer/messages' }],
  },
  {
    // The second door into partnering (owner ruling 2026-10-17): inside
    // the portal the person is already authenticated, so each path on
    // the Become a Partner page starts its application at step 1
    // directly — the same per-type flow the public category pages feed.
    category: 'Partner With Us',
    items: [{ label: 'Become a Partner', icon: Handshake, href: '/customer/become-a-partner' }],
  },
  {
    // Learning Center at its tree position (canonical §6.16) — deep inside
    // the portal, after Profile/Messages, never a top-level rail peer.
    // The door opens the classroom CANVAS (owner's ruling 2026-10-22):
    // enrolled → your course inside the canvas; not enrolled → the
    // published catalog presented inside the canvas to start learning.
    // The canvas is mounted at the portal's own Learn home
    // (/customer/learn) — the door stays inside the portal's chrome
    // rather than navigating out to the standalone /learn/classroom.
    category: 'Learning Center',
    items: [{ label: 'Learn Courses', icon: GraduationCap, href: '/customer/learn' }],
  },
  {
    items: [{ label: 'Support', icon: LifeBuoy, href: '/customer/support' }],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  mobileOpen,
  onCloseMobile,
  selectedLocation,
  onSelectLocation,
  locationsList,
  isCollapsed = false,
  onToggleCollapse,
  variant = 'admin',
  tenantIsMaster,
  onSignOut,
  visibleSections,
  lockedSections,
  sectionBadges,
}) => {
  const pathname = usePathname();
  const [showLocationMenu, setShowLocationMenu] = React.useState(false);
  // Collapsible category state — each parent (CRM / ORDERS / ACCOUNTING / …)
  // can be expanded/collapsed so the sidebar never runs off the bottom.
  // Default: ALL COLLAPSED (Sunny's standing rule, 2026-10-24 — sidebars
  // start closed everywhere; the reader opens what they need). When
  // collapsed, only the header shows.
  const [collapsedCategories, setCollapsedCategories] = React.useState<Set<string>>(
    () =>
      new Set(
        (VARIANT_CONFIG[variant].groups ?? [])
          .map((g) => g.category)
          .filter((c): c is string => Boolean(c)),
      ),
  );

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  // Real locations only — fed from the store, which the portal layouts
  // hydrate from the active tenant's tenant_locations. There is NO
  // fallback list: a tenant with no locations shows none.
  const displayLocations =
    locationsList && locationsList.length > 0
      ? locationsList.map((l) => l.name)
      : [];

  const config = VARIANT_CONFIG[variant];
  // Seller shell: the layout passes the FULL tree as visibleSections
  // (the tree is the navigation — nothing is hidden) plus the lock map
  // derived from the seller's database state (see lib/sellers/nav.ts).
  // Filtering to the visible set happens here only as the legacy
  // no-prop fallback; with the lock map present, locked items render
  // inert with their reason. Empty groups drop out, and live count
  // badges layer onto the static item defs.
  const navGroups: NavGroup[] =
    variant === 'seller' && visibleSections
      ? (config.groups ?? [])
          .map((group) => ({
            ...group,
            items: group.items
              .filter((item) => visibleSections.includes(item.id))
              .map((item) => ({
                ...item,
                badge: sectionBadges?.[item.id] ?? item.badge,
                lockedReason: lockedSections?.[item.id],
                children: SELLER_NAV_CHILDREN[item.id],
              })),
          }))
          .filter((group) => group.items.length > 0)
      : variant === 'admin' && tenantIsMaster === false
        ? // Franchise gating: a child tenant's admin tree drops every
          // master-only section (Marketplace, Trust & Safety, AI Ops,
          // Policies, Website Templates); emptied groups drop out. The
          // API guard (requireModuleApi) enforces the same rule server-
          // side — this only shapes what the tenant sees.
          (config.groups ?? [])
            .map((group) => ({
              ...group,
              items: group.items.filter(
                (item) => !MASTER_ONLY_SECTION_IDS.includes(item.id),
              ),
            }))
            .filter((group) => group.items.length > 0)
        : (config.groups ?? []);

  const navButtonClass = (isActive: boolean) =>
    cn(
      'group/item relative w-full flex items-center rounded-lg text-[13px] leading-none transition-colors duration-150 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar',
      isCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2',
      isActive
        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
    );

  // Customer rows are <Link>s — same visual language as navButtonClass, with
  // an extra indent for children under a group header (the enterprise
  // parent/child pattern: header label + indented child rows).
  const customerLinkClass = (isActive: boolean, isChild: boolean) =>
    cn(
      'group/item relative flex w-full items-center rounded-lg text-[13px] leading-none transition-colors duration-150 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar',
      isCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2',
      !isCollapsed && isChild && 'pl-9',
      isActive
        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
    );

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-foreground/50 backdrop-blur-xs lg:hidden"
        />
      )}

      <TooltipProvider delayDuration={150}>
        <aside
          className={cn(
            'fixed top-0 bottom-0 left-0 z-50 flex flex-col flex-shrink-0 h-screen overflow-hidden select-none bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 ease-in-out',
            mobileOpen ? 'translate-x-0 w-60' : '-translate-x-full lg:translate-x-0',
            isCollapsed ? 'lg:w-16' : 'lg:w-60'
          )}
        >
          {/* Brand Header — sticky at top. Subtitle is per-variant so each
              door has its own identity (not the generic "Service Portal"). */}
          <div
            className={cn(
              'sticky top-0 z-10 flex items-center justify-between flex-shrink-0 border-b border-sidebar-border bg-sidebar',
              isCollapsed ? 'flex-col gap-2 px-3 h-14' : 'h-14 px-5'
            )}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/favicon-512x512.png"
                alt="Unsaid"
                className="h-9 w-9 shrink-0 rounded-full object-contain"
              />
              {!isCollapsed && (
                <div className="min-w-0">
                  <h1 className="truncate font-bar text-[15px] font-semibold leading-none tracking-tight text-sidebar-foreground">
                    Unsaid
                  </h1>
                  <p className="mt-1 text-[10px] font-medium text-sidebar-foreground/60">
                    {config.subtitle}
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={onCloseMobile}
              type="button"
              aria-label="Close Mobile Navigation"
              className="lg:hidden inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Navigation — variant decides the mechanism.
              customer: the owner's exact My Account tree as ROUTE <Link>s
              (active state from usePathname; group headers are labels,
              children always visible and indented).
              admin/groomer/seller/lms: the section-id groups exactly as
              before — collapsible categories, store-driven active state. */}
          <nav className="custom-scrollbar flex-1 overflow-y-auto py-1 text-sidebar-foreground">
            {variant === 'customer'
              ? CUSTOMER_NAV.map((block, bIdx) => {
                  const isChild = Boolean(block.category);
                  return (
                    <div key={bIdx} className="space-y-0.5">
                      {block.category && !isCollapsed && (
                        <div className="px-3 pt-3 pb-1">
                          <p className="font-bar text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
                            {block.category}
                          </p>
                        </div>
                      )}
                      {isCollapsed && bIdx > 0 && (
                        <div className="divider-hair mx-3 my-2 h-px" />
                      )}
                      <ul key={pathname ?? "nav"} className="space-y-0.5 px-2">
                        {block.items.map((item) => {
                          const Icon = item.icon;
                          const isActive = pathname === item.href;

                          const link = (
                            <Link
                              href={item.href}
                              onClick={onCloseMobile}
                              aria-current={isActive ? 'page' : undefined}
                              className={customerLinkClass(isActive, isChild)}
                            >
                              <Icon
                                className={cn(
                                  'h-4 w-4 shrink-0 transition-colors duration-150',
                                  isActive
                                    ? 'text-sidebar-accent-foreground'
                                    : 'text-sidebar-foreground/70 group-hover/item:text-sidebar-accent-foreground'
                                )}
                              />
                              {!isCollapsed && (
                                <span className="truncate">{item.label}</span>
                              )}
                            </Link>
                          );

                          return (
                            <li key={item.href} className="relative">
                              {isCollapsed ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                                  <TooltipContent side="right" sideOffset={8}>
                                    {item.label}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                link
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })
              : navGroups.map((group, gIdx) => {
              const isCatCollapsed = group.category ? collapsedCategories.has(group.category) : false;
              return (
              <div key={gIdx} className="space-y-0.5">
                {group.category && !isCollapsed && (
                  <div className="px-3 pt-3 pb-1">
                    <button
                      onClick={() => toggleCategory(group.category!)}
                      className="flex w-full items-center justify-between font-bar text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground/80 cursor-pointer text-left"
                    >
                      <span>{group.category}</span>
                      {isCatCollapsed ? (
                        <Plus
                          className="h-3.5 w-3.5 text-sidebar-foreground/60"
                          strokeWidth={2.5}
                        />
                      ) : (
                        <Minus
                          className="h-3.5 w-3.5 text-sidebar-foreground/60"
                          strokeWidth={2.5}
                        />
                      )}
                    </button>
                  </div>
                )}
                {isCollapsed && gIdx > 0 && (
                  <div className="divider-hair mx-3 my-2 h-px" />
                )}
                {!isCatCollapsed && (
                <ul key={pathname ?? "nav"} className="space-y-0.5 px-2">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeSection === item.id;
                    const lockedReason = item.lockedReason;

                    const button = lockedReason ? (
                      <button
                        type="button"
                        aria-disabled="true"
                        title={lockedReason}
                        className={cn(navButtonClass(false), 'cursor-not-allowed opacity-50 hover:bg-transparent')}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-sidebar-foreground/50" />
                        {!isCollapsed && (
                          <span className="truncate">{item.label}</span>
                        )}
                        {!isCollapsed && (
                          <Lock className="ml-auto h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60" aria-label={lockedReason} />
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          onSelectSection(item.id);
                          onCloseMobile();
                        }}
                        className={navButtonClass(isActive)}
                      >
                        <Icon
                          className={cn(
                            'h-4 w-4 shrink-0 transition-colors duration-150',
                            isActive
                              ? 'text-sidebar-accent-foreground'
                              : 'text-sidebar-foreground/70 group-hover/item:text-sidebar-accent-foreground'
                          )}
                        />
                        {!isCollapsed && (
                          <span className="truncate">{item.label}</span>
                        )}
                        {!isCollapsed && item.badge && !isActive && (
                          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );

                    // Seller children: the section's sub-pages live
                    // under their parent in the rail — always visible
                    // (never click-to-reveal), indented like the
                    // customer tree's children. A locked parent renders
                    // its children inert with the same reason.
                    const childRows =
                      variant === 'seller' &&
                      !isCollapsed &&
                      item.children &&
                      item.children.length > 0 ? (
                        <ul className="mt-0.5 space-y-0.5 ml-4 border-l border-sidebar-border">
                          {item.children.map((child) => {
                            const childActive =
                              !child.href.includes('#') &&
                              (pathname === child.href ||
                                (pathname?.startsWith(child.href + '/') ?? false));
                            return (
                              <li key={child.href}>
                                {lockedReason ? (
                                  <span
                                    title={lockedReason}
                                    aria-disabled="true"
                                    className="flex w-full cursor-not-allowed items-center rounded-lg py-[6px] pr-3 pl-3 text-[13px] leading-none text-sidebar-foreground/40"
                                  >
                                    {child.label}
                                  </span>
                                ) : (
                                  <Link
                                    href={child.href}
                                    onClick={onCloseMobile}
                                    aria-current={childActive ? 'page' : undefined}
                                    className={cn(
                                      'flex w-full items-center rounded-lg py-[6px] pr-3 pl-3 text-[13px] leading-none transition-colors duration-150',
                                      childActive
                                        ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                                    )}
                                  >
                                    {child.label}
                                  </Link>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null;

                    return (
                      <li key={item.id} className="relative">
                        {isCollapsed ? (
                          <Tooltip>
                            <TooltipTrigger asChild>{button}</TooltipTrigger>
                            <TooltipContent side="right" sideOffset={8}>
                              {lockedReason ? `${item.label} — ${lockedReason}` : item.label}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          button
                        )}
                        {childRows}
                      </li>
                    );
                  })}
                </ul>
                )}
              </div>
              );
            })}
          </nav>

          {/* Customer variant only: Sign Out pinned at the bottom of the
              rail (the drawer pattern the owner specified). Fires the
              layout's sign-out handler — POST /api/auth/logout, clear the
              store, redirect home. */}
          {variant === 'customer' && onSignOut && (
            <div className="flex-shrink-0 border-t border-sidebar-border px-2 py-2.5">
              {isCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={onSignOut}
                      aria-label="Sign Out"
                      className={navButtonClass(false)}
                    >
                      <LogOut className="h-4 w-4 shrink-0 text-sidebar-foreground/70" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    Sign Out
                  </TooltipContent>
                </Tooltip>
              ) : (
                <button
                  type="button"
                  onClick={onSignOut}
                  className={navButtonClass(false)}
                >
                  <LogOut className="h-4 w-4 shrink-0 text-sidebar-foreground/70 group-hover/item:text-sidebar-accent-foreground" />
                  <span>Sign Out</span>
                </button>
              )}
            </div>
          )}
        </aside>
      </TooltipProvider>
    </>
  );
};
