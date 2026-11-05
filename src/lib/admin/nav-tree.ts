/**
 * STATIC admin navigation tree for Unsaid — rendered client-side from
 * this file only. NEVER rendered from the database (Sunny's standing
 * rule: DB-rendered sidebars caused multi-day outages at UnSaid Memories).
 *
 * One-to-one mapping of the UnSaid Memories Admin Center tree, adapted for a
 * print-on-demand business: appointments, pets, grooming, learn, seller
 * portal and affiliate branches are removed; "Marketplace"
 * is the management tooling for Unsaid's own storefront (listings,
 * orders, fulfillment, payments, returns, analytics, settings).
 * Advertising returned under the UnSaid Memories replication program
 * (2026-10-30): the Ad Center transplants in its own checkpoint; the
 * "ads" section below is its door card, pointing at /advertise.
 *
 * `module` ties a section to the permissions matrix (modules.ts): the
 * shell hides sections the signed-in user has no grant for. Sections
 * without a module are always visible to any admin.
 */
import type { ModuleCode } from "./modules";

export interface AdminNavItem {
  label: string;
  href: string;
  /** Intent category shown as a group header in the module sidebar (ERP section). */
  group?: string;
  /** Plain-language tooltip shown on the module sidebar link. */
  tip?: string;
}

export interface AdminNavSection {
  id: string;
  label: string;
  icon: string; // lucide icon key, resolved in the sidebar component
  module?: ModuleCode;
  href?: string; // section landing (when it has no children)
  children?: AdminNavItem[];
}

export const ADMIN_NAV_TREE: AdminNavSection[] = [
  { id: "dashboard", label: "Dashboard", icon: "LayoutGrid", href: "/admin" },
  {
    id: "studio",
    label: "Design Studio",
    icon: "Palette",
    module: "studio",
    children: [
      { label: "Studio", href: "/admin/studio" },
      { label: "Collection Builder", href: "/admin/studio/collection-builder" },
      { label: "Designs", href: "/admin/studio" },
      { label: "Collections", href: "/admin/collections" },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    icon: "Users",
    module: "crm",
    children: [
      { label: "Customers", href: "/admin/customers", tip: "Everyone who has bought from you or asked about your work — contact details, orders, and history in one place." },
      { label: "Leads", href: "/admin/leads", tip: "People who showed interest but haven't bought yet — follow up here so they don't slip away." },
      { label: "Automations", href: "/admin/automation", tip: "Messages the shop sends by itself — welcome notes, reminders, and follow-ups you set up once." },
      { label: "Global Search", href: "/admin/crm/search", tip: "Find any customer, order, or product by name, email, or order number." },
    ],
  },
  {
    id: "orders",
    label: "Orders",
    icon: "Package",
    module: "orders",
    children: [
      { label: "Orders", href: "/admin/orders" },
      { label: "Fulfillment", href: "/admin/fulfillment" },
      { label: "Returns & Issues", href: "/admin/returns" },
      { label: "Purchasing", href: "/admin/purchasing" },
      { label: "Shipping & Labels", href: "/admin/shipping" },
      { label: "Operations Reporting", href: "/admin/orders/reports" },
    ],
  },
  {
    id: "accounting",
    label: "ERP",
    icon: "Landmark",
    module: "accounting",
    children: [
      { label: "Dashboard", href: "/admin/accounting", tip: "Your money at a glance — what came in, what went out, and what's still owed." },
      { group: "Books", label: "Books", href: "/admin/accounting/books", tip: "The full ledger — every sale, bill, and payment, recorded and balanced." },
      { group: "Books", label: "Reclassifications", href: "/admin/accounting/books/reclassifications", tip: "Move an amount from one account to another when something was recorded in the wrong place — the original entry stays on record." },
      { group: "Books", label: "Period Close & Locks", href: "/admin/accounting/books/period-close", tip: "Close out a month so its numbers can't change — a checklist walks you through it first." },
      { group: "Books", label: "Transfers & Adjustments", href: "/admin/accounting/books/transfers", tip: "Stock moving between warehouses, and what's still in transit." },
      { group: "Books", label: "Audit Trail", href: "/admin/accounting/books/audit-trail", tip: "Every change to the books — who did it, when, and what it looked like before and after." },
      { group: "Books", label: "Entities & Consolidation", href: "/admin/accounting/books/entities", tip: "Your companies and how their numbers roll up into one set of books." },
      { group: "Books", label: "Multi-currency", href: "/admin/accounting/books/multi-currency", tip: "Money in other currencies — exchange rates and what foreign balances are worth in dollars." },
      { group: "Books", label: "Controls & Compliance", href: "/admin/accounting/books/controls", tip: "The checks that keep the books trustworthy — approvals, limits, and sign-offs." },
      { group: "Sales", label: "Sales", href: "/admin/accounting/sales", tip: "Money customers owe you and have paid you — sales and receipts." },
      { group: "Sales", label: "Customers", href: "/admin/accounting/customers", tip: "Everyone who owes you or has paid you — balances, credit limits, and payment health for each customer." },
      { group: "Sales", label: "Invoices", href: "/admin/accounting/invoices", tip: "Bills you send customers. Create one, send it, and track when it's paid." },
      { group: "Sales", label: "Estimates", href: "/admin/accounting/sales/estimates", tip: "Quotes you send before the sale — turn an accepted estimate into an invoice in one click." },
      { group: "Sales", label: "Recurring Sales", href: "/admin/accounting/sales/recurring", tip: "Sales that repeat on a schedule — subscriptions and standing orders, and what they've actually brought in." },
      { group: "Sales", label: "Deposits", href: "/admin/accounting/deposits", tip: "Payments you've received and matched to your bank." },
      { group: "Sales", label: "Payments", href: "/admin/accounting/payments", tip: "Money moving out and in — record a payment or see how a customer paid." },
      { group: "Sales", label: "Refunds & Disputes", href: "/admin/accounting/refunds", tip: "Money back to customers, and payment disputes that need your answer." },
      { group: "Sales", label: "Gift Cards & Store Credit", href: "/admin/accounting/gift-cards", tip: "Gift cards and store credit you've issued and what's still unspent." },
      { group: "Purchases", label: "Purchases", href: "/admin/accounting/purchases", tip: "What you bought for the business — supplier bills and expenses." },
      { group: "Purchases", label: "Vendors", href: "/admin/accounting/purchases/vendors", tip: "The suppliers and contractors you pay — contact details, tax forms, and what each is owed." },
      { group: "Purchases", label: "Bills & Expenses", href: "/admin/accounting/purchases/bills", tip: "Bills that have come in and are waiting to be paid — enter one and it lands in the books." },
      { group: "Purchases", label: "Payment Runs", href: "/admin/accounting/purchases/payment-runs", tip: "Pay a batch of bills at once — approve the run and every payment is recorded." },
      { group: "Purchases", label: "Receipt Capture", href: "/admin/accounting/purchases/receipts", tip: "Snap or upload receipts and attach them to expenses so nothing is lost at tax time." },
      { group: "Purchases", label: "Services", href: "/admin/accounting/purchases/services", tip: "Service lines you buy and sell, and the margin each one makes." },
      { group: "Banking", label: "Banking", href: "/admin/accounting/banking", tip: "Your bank accounts and matching the books to what the bank says." },
      { group: "Banking", label: "Bank Feeds & Triage", href: "/admin/accounting/banking/triage", tip: "Bank transactions waiting for a match — confirm what each one was and it files itself." },
      { group: "Banking", label: "Reconciliation", href: "/admin/accounting/banking/reconciliation", tip: "Prove the books match the bank statement, line by line, until the difference is zero." },
      { group: "Banking", label: "Cash Flow & Forecasting", href: "/admin/accounting/banking/cash-flow", tip: "What's coming in and going out over the next 30, 60, 90 days — and whether cash stays above your safety line." },
      { group: "Taxes", label: "Taxes", href: "/admin/accounting/taxes", tip: "Sales tax you've collected and what you owe, by period." },
      { group: "Taxes", label: "1099 & Contractor Tax", href: "/admin/accounting/taxes/1099", tip: "What you paid contractors this year and the 1099 forms owed for each — staged from real payments." },
      { group: "Reports", label: "Financial Reports", href: "/admin/accounting/reports/trial-balance", tip: "Reports for you and your accountant — balances, profit and loss, and more." },
      { group: "Reports", label: "Balance Sheet", href: "/admin/accounting/reports/balance-sheet", tip: "What you own and what you owe, as of today and compared to last period — it must always balance." },
      { group: "Reports", label: "Profit & Loss", href: "/admin/accounting/reports/profit-loss", tip: "What you earned and spent over a period — this period next to the last one." },
      { group: "Reports", label: "Cash Flow Statement", href: "/admin/accounting/reports/cash-flow", tip: "Where cash actually came from and went — operations, investing, and financing." },
      { group: "Reports", label: "Retained Earnings", href: "/admin/accounting/reports/retained-earnings", tip: "Profits kept in the business over time, after any money the owner took out." },
      { group: "Reports", label: "Revenue", href: "/admin/accounting/reports/revenue", tip: "Sales by period and product — what's selling and how it's trending." },
      { group: "Reports", label: "Revenue Bridge", href: "/admin/accounting/reports/revenue-bridge", tip: "From gross sales to real money in the bank — refunds, chargebacks, and fees taken out step by step." },
      { group: "Reports", label: "Settlement Clearing", href: "/admin/accounting/reports/settlement-clearing", tip: "Money Stripe holds between a sale and its payout — what you're still waiting to receive." },
      { group: "Reports", label: "Margin Matrix", href: "/admin/accounting/reports/margin-matrix", tip: "Profit on every product after its supplier cost — see what actually makes money." },
      { group: "Reports", label: "Sales Funnel", href: "/admin/accounting/reports/funnel", tip: "From order placed to money captured — where sales drop off." },
      { group: "Reports", label: "Segment P&L", href: "/admin/accounting/reports/segments", tip: "Profit and loss sliced by channel, location, or line of business — see which parts make money." },
      { group: "Reports", label: "Budgets & Forecasts", href: "/admin/accounting/reports/budgets", tip: "What you planned to spend and earn vs what actually happened, side by side." },
      { group: "Catalog", label: "Items", href: "/admin/accounting/catalog/items", tip: "Everything you sell, in one catalog — prices, costs, and where each item is published." },
      { group: "Catalog", label: "Collections", href: "/admin/accounting/catalog/collections", tip: "Groups of products you sell together — what's in each collection and how it performs." },
      { group: "Catalog", label: "Pricing & Bundles", href: "/admin/accounting/catalog/pricing", tip: "Price books for different buyers, and bundles sold as one item." },
      { group: "Catalog", label: "Channels", href: "/admin/accounting/catalog/channels", tip: "Where your products are sold — your store and any connected marketplaces." },
      { group: "Catalog", label: "Publishing", href: "/admin/accounting/catalog/publishing", tip: "Send finished designs to products and publish them to the store." },
      { group: "Inventory", label: "Inventory Valuation", href: "/admin/accounting/inventory/valuation", tip: "What your stock is worth — and whether it matches the books." },
      { group: "Inventory", label: "Stock on Hand", href: "/admin/accounting/inventory/stock", tip: "How much of everything you have, what's reserved, and what's available to sell." },
      { group: "Inventory", label: "Stock Counts", href: "/admin/accounting/inventory/counts", tip: "Count what's really on the shelf and correct the records." },
      { group: "Inventory", label: "Warehouses", href: "/admin/accounting/inventory/warehouses", tip: "The places stock lives — warehouses and storage locations." },
      { group: "Inventory", label: "Reorder", href: "/admin/accounting/inventory/reorder", tip: "What's running low and purchase orders to restock it." },
      { group: "Inventory", label: "Shipping", href: "/admin/accounting/inventory/shipping", tip: "Carriers and shipping methods, and what delivery costs." },
      { group: "Inventory", label: "Locations & POS", href: "/admin/accounting/inventory/locations-pos", tip: "Store locations and point-of-sale — what's set up and what's still to connect." },
      { group: "Inventory", label: "Returns", href: "/admin/accounting/inventory/returns", tip: "Customer returns — approve them, receive the goods, and refund." },
      { group: "Inventory", label: "Fulfillment Queue", href: "/admin/accounting/inventory/fulfillment", tip: "Paid orders waiting to go to their supplier — review each one and send it with one click." },

    ],
  },
  // Ad Center — the advertiser portal (/ads). Brought into the admin
  // sidebar as a module with its key surfaces as children, so it is
  // navigable from the admin chrome like every other module (not an
  // isolated leaf that bounces out to a standalone portal).
  {
    id: "ads",
    label: "Ad Center",
    icon: "Megaphone",
    href: "/ads/dashboard",
    children: [
      { label: "Dashboard", href: "/ads/dashboard", tip: "How your ads are doing at a glance — spend, clicks, and sales they brought in." },
      { label: "Campaigns", href: "/ads/ads-manager/campaigns", tip: "Your ad campaigns — the big buckets that hold your ad groups and ads." },
      { label: "Ad Groups", href: "/ads/ads-manager/ad-groups", tip: "Groups of ads inside a campaign, each aimed at one audience." },
      { label: "Ads", href: "/ads/ads-manager/ads", tip: "The individual ads themselves — the words and pictures people see." },
      { label: "Audiences", href: "/ads/audiences", tip: "Who your ads are shown to — the groups of people you choose." },
      { label: "Creatives", href: "/ads/creatives/library", tip: "Your library of ad pictures and videos, ready to use in any ad." },
      { label: "Analytics", href: "/ads/analytics", tip: "Deeper numbers on your ads — what worked, what didn't, and what it cost." },
      { label: "Catalog Manager", href: "/ads/catalog", tip: "The product catalog your ads pull from — keep it current so ads show real products." },
      { label: "Billing", href: "/ads/billing", tip: "What you've spent on ads and how you pay for them." },
      { label: "Account", href: "/ads/account", tip: "Your advertising account settings." },
    ],
  },
  {
    id: "trust-safety",
    label: "Marketplace & Trust",
    icon: "ShieldCheck",
    module: "trust_safety",
    children: [
      { label: "Overview", href: "/admin/trust" },
      { label: "Sellers", href: "/admin/sellers" },
      { label: "Seller Review Queue", href: "/admin/sellers/review-queue" },
      { label: "Seller Verification", href: "/admin/sellers/verification" },
      { label: "Listings", href: "/admin/listings" },
      { label: "Identity & Business Verification", href: "/admin/trust/verification" },
      { label: "Customer & Seller Risk", href: "/admin/trust/risk" },
      { label: "Disputes & Chargebacks", href: "/admin/trust/disputes" },
      { label: "Fraud Review", href: "/admin/trust/fraud" },
      { label: "Policy Management", href: "/admin/trust/policies" },
      { label: "Compliance Documents", href: "/admin/trust/compliance" },
      { label: "Moderation", href: "/admin/trust/moderation" },
      { label: "Appeals", href: "/admin/trust/appeals" },
      { label: "Audit Log", href: "/admin/trust/audit" },
    ],
  },
  {
    id: "social",
    label: "Social",
    icon: "Share2",
    module: "social",
    children: [
      { label: "Publishing Studio", href: "/admin/social", tip: "Make, schedule, and publish posts to your social accounts from one studio." },
      { label: "Create Post", href: "/admin/social/create", tip: "Write a new post, tailor it for each account, and send it now or schedule it." },
      { label: "Content Calendar", href: "/admin/social/calendar", tip: "See your scheduled posts on a calendar — drag your plans into place." },
      { label: "Content Library", href: "/admin/social/library", tip: "Posts and media you've made before, ready to reuse." },
      { label: "Publishing Queue", href: "/admin/social/queue", tip: "Posts waiting to go out, in order — pause or remove one here." },
      { label: "Connected Channels", href: "/admin/social/channels", tip: "Your connected Facebook, Instagram, TikTok and other accounts. Posts can only go to accounts connected here." },
      { label: "Performance", href: "/admin/social/performance", tip: "How your posts did — likes, comments, and reach for each one." },
      { label: "Oversight", href: "/admin/social/oversight", tip: "The engine room: publishing health, attempts, and anything that failed to send." },
    ],
  },
  {
    id: "support",
    label: "Support Desk",
    icon: "LifeBuoy",
    module: "support",
    children: [
      { label: "Dashboard", href: "/admin/support" },
      { label: "Agent Workspace", href: "/admin/support/workspace" },
      { label: "Queues & Workload", href: "/admin/support/queues" },
      { label: "Customers", href: "/admin/support/customers" },
      { label: "Analytics & Reports", href: "/admin/support/analytics" },
      { label: "Knowledge Base", href: "/admin/support/knowledge" },
      { label: "Automations", href: "/admin/support/automations" },
      { label: "Teams & Routing", href: "/admin/support/teams" },
      { label: "SLA Policies", href: "/admin/support/sla" },
      { label: "Ticket Forms", href: "/admin/support/forms" },
      { label: "Channels & Voice", href: "/admin/support/channels" },
      { label: "Administration", href: "/admin/support/config" },
      { label: "My Notifications", href: "/admin/support/notifications" },
      { label: "My Profile & Status", href: "/admin/support/profile" },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: "Globe",
    module: "integrations",
    children: [
      { label: "Overview", href: "/admin/integrations" },
      { label: "Connections & Keys", href: "/admin/integrations/connections" },
      { label: "Social Accounts", href: "/admin/integrations/social" },
      { label: "Scheduling Calendar", href: "/admin/integrations/calendar" },
      { label: "Share a Product", href: "/admin/integrations/share" },
      { label: "Partner Portals", href: "/admin/integrations/partners" },
    ],
  },
  {
    id: "analytics",
    label: "Analytics & Reports",
    icon: "BarChart3",
    module: "analytics",
    children: [
      { label: "Dashboard", href: "/admin/analytics", tip: "Your shop's numbers at a glance — sales, visitors, and best sellers." },
      { label: "Reports Explorer", href: "/admin/analytics/explorer", tip: "Dig into the numbers yourself — pick dates and compare what changed." },
    ],
  },
  {
    id: "ecommerce",
    label: "Ecommerce & Inventory",
    icon: "ShoppingBag",
    module: "ecommerce",
    children: [
      { label: "Overview", href: "/admin/ecommerce" },
      { label: "Inventory", href: "/admin/inventory" },
      { label: "Product Catalog", href: "/admin/products" },
      { label: "Product Collections", href: "/admin/ecommerce/collections" },
      { label: "Product Publishing", href: "/admin/ecommerce/publishing" },
      { label: "Shipping Settings", href: "/admin/ecommerce/shipping" },
      { label: "Taxes", href: "/admin/ecommerce/taxes" },
      { label: "Returns", href: "/admin/ecommerce/returns" },
    ],
  },
  {
    id: "website",
    label: "CMS",
    icon: "Globe",
    module: "website",
    children: [
      { label: "Website Settings", href: "/admin/website", tip: "Your storefront's settings — name, pages, and how the shop looks to visitors." },
      { label: "Website Analytics", href: "/admin/website/analytics", tip: "Who visited your store, what they looked at, and where they came from." },
      { group: "CMS", label: "CMS Overview", href: "/admin/website/cms", tip: "Edit your site's pages, banners, and pop-ups — pick a page, place your message, publish." },
      { group: "CMS — Content", label: "Content Blocks", href: "/admin/website/cms/blocks", tip: "Create and manage reusable content components." },
      { group: "CMS — Content", label: "Content Blocks JSON Schema", href: "/admin/website/cms/block-schemas", tip: "Schema definitions, node types, field validation." },
      { group: "CMS — Content", label: "Content Blocks Slot Catalog", href: "/admin/website/cms/slot-catalog", tip: "Slot definitions, placement rules, allowed components." },
      { group: "CMS — Content", label: "Component Prop Validators", href: "/admin/website/cms/prop-validators", tip: "Storefront contracts, Zod schemas, prop validation." },
      { group: "CMS — Content", label: "Pages & Routes", href: "/admin/website/cms/pages", tip: "Page definitions, SEO config, layout templates." },
      { group: "CMS — Storefront", label: "Storefront Engine & Canonical SEO", href: "/admin/website/cms/storefront-engine", tip: "Rendering engine, canonical URLs, JSON-LD, robots.txt." },
      { group: "CMS — Storefront", label: "Storefront Preview", href: "/admin/website/cms/storefront-preview", tip: "Live storefront preview with CMS content." },
      { group: "CMS — Storefront", label: "Storefront Menus & Navigation", href: "/admin/website/cms/nav", tip: "Header menus, mega menu builder, mobile drawer." },
      { group: "CMS — Storefront", label: "Mega Menu Builder", href: "/admin/website/cms/mega-menu-builder", tip: "Header mega menu columns, slots, featured content." },
      { group: "CMS — Storefront", label: "Footer Columns & Utility Nav", href: "/admin/website/cms/footer-builder", tip: "Footer column builder, utility navigation links." },
      { group: "CMS — Storefront", label: "Mobile App Drawer & Slide-out", href: "/admin/website/cms/mobile-drawer", tip: "Mobile navigation drawer, slide-out menu config." },
      { group: "CMS — Media", label: "Media Library & CDN Optimizer", href: "/admin/website/cms/media", tip: "Images, CDN optimization, responsive profiles." },
      { group: "CMS — Media", label: "Media Taxonomy & CDN Storage", href: "/admin/website/cms/media-taxonomy", tip: "Media categories, tags, CDN storage profiles." },
      { group: "CMS — Media", label: "Edge Image Optimization", href: "/admin/website/cms/edge-optimization", tip: "Responsive CDN profiles, format conversion, lazy load." },
      { group: "CMS — Copy & Locales", label: "Global Copy & Design Tokens", href: "/admin/website/cms/tokens", tip: "Colors, typography, spacing, translatable copy." },
      { group: "CMS — Copy & Locales", label: "Global Copy Editor", href: "/admin/website/cms/copy", tip: "Translatable strings, context, status management." },
      { group: "CMS — Copy & Locales", label: "Locale Translation Sync", href: "/admin/website/cms/locale-sync", tip: "Translation confidence, worker status, sync engine." },
      { group: "CMS — Copy & Locales", label: "Regional Locales & Currency", href: "/admin/website/cms/locales", tip: "Locale matrix, currency exchange, Geo-IP simulation." },
      { group: "CMS — Promotions", label: "Discount Offers", href: "/admin/website/cms/offers", tip: "Promo codes, offer types, usage limits, scheduling." },
      { group: "CMS — Promotions", label: "Volume Tier Matrix & Bundle Rules", href: "/admin/website/cms/volume-tiers", tip: "Quantity-based pricing, bundle discounts, tier calculator." },
      { group: "CMS — Promotions", label: "Cart Threshold & Progress Engine", href: "/admin/website/cms/thresholds", tip: "Free shipping bars, tiered progress, reward engine." },
      { group: "CMS — Promotions", label: "Banners & Announcement Bars", href: "/admin/website/cms/banners", tip: "Banner management, announcement bars, modal config." },
      { group: "CMS — Promotions", label: "Campaign Scheduling", href: "/admin/website/cms/campaigns", tip: "Campaign calendar, deployment timeline, scheduling." },
      { group: "CMS — Promotions", label: "Audience Targeting & Segments", href: "/admin/website/cms/audience", tip: "Segmentation rules, trigger logic, audience builder." },
      { group: "CMS — Insights", label: "Funnel Conversion & Telemetry", href: "/admin/website/cms/funnel", tip: "Browse-to-confirmation sequence, drop-off analytics." },
      { group: "CMS — Insights", label: "Storefront Analytics & Heatmap", href: "/admin/website/cms/analytics", tip: "Component heatmap, impressions, clicks, conversion." },
      { group: "CMS — Insights", label: "Core Web Vitals & Performance", href: "/admin/website/cms/web-vitals", tip: "LCP, CLS, INP benchmarks, payload budget, diagnostics." },
      { group: "CMS — System", label: "Version Revisions & Rollback", href: "/admin/website/cms/versions", tip: "Revision history, rollback studio, environment diff." },
      { group: "CMS — System", label: "Audit History & Security", href: "/admin/website/cms/audit", tip: "Security stream, change history, action log." },
      { group: "CMS — System", label: "Fallback Pages & Error Handling", href: "/admin/website/cms/fallback-pages", tip: "404/500 config, error page templates, redirect rules." },
      { group: "CMS — System", label: "URL Redirects", href: "/admin/website/cms/redirects", tip: "301/302/307/308 redirects, active management." },
      { group: "CMS — System", label: "Integrations & API Keys", href: "/admin/website/cms/integrations", tip: "Webhook gateways, API key management, provider config." },
    ],
  },
  {
    id: "admin-users",
    label: "Admin Users & Settings",
    icon: "UserCog",
    module: "administration",
    children: [
      { label: "Users", href: "/admin/users" },
      { label: "Staff", href: "/admin/staff" },
      { label: "Roles & Permissions", href: "/admin/users/roles" },
      { label: "Portal Accounts", href: "/admin/users/portal-accounts" },
      { label: "Pending Invitations", href: "/admin/users/invitations" },
      { label: "Organization", href: "/admin/system/organization" },
      { label: "Locations & Branches", href: "/admin/system/locations" },
      { label: "Brand & Identity", href: "/admin/system/brand" },
      { label: "Operations Settings", href: "/admin/system/operations" },
      { label: "Financial Settings", href: "/admin/system/financial-settings" },
      { label: "System Health", href: "/admin/system/health" },
      { label: "Audit & Data Governance", href: "/admin/system/audit" },
      { label: "Security & 2FA", href: "/admin/system/security" },
      { label: "Document Center", href: "/admin/system/documents" },
    ],
  },
  // No module code: the Help Center is visible to every signed-in
  // admin, always. Plain-language guides for the whole admin.
  {
    id: "developers",
    label: "Developers",
    icon: "Code2",
    children: [
      { label: "Developer Portal", href: "/developers", tip: "The developer portal — the store and ad APIs, keys, and what you can build on them." },
      { label: "Store API Guide", href: "/admin/help/store-api", tip: "How the Store API works — keys, the product feed, and safe ways to connect other tools." },
    ],
  },
  { id: "help", label: "Help Center", icon: "CircleHelp", href: "/admin/help" },
];

/** Every href the tree points at — used by the completeness sweep. */
export function allNavHrefs(): string[] {
  const out: string[] = [];
  for (const s of ADMIN_NAV_TREE) {
    if (s.href) out.push(s.href);
    for (const c of s.children ?? []) out.push(c.href);
  }
  return [...new Set(out)];
}
