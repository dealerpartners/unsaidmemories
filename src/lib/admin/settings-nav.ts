/**
 * The Settings map — one entry per component in Sunny's
 * settings_admin.html, in his order. The sidebar, the Home card grid,
 * and every item route all render from this single list, so a
 * component exists in exactly one place and is described once.
 *
 * `description` is his card text. `drives` is what the setting controls
 * downstream (the API contract / table / behavior). `existing` points
 * at the fragment pages that fold into this home as sections land.
 */

export type SettingsItem = {
  slug: string;
  label: string;
  /** Label shown on the Home card when it differs from the nav label. */
  homeLabel?: string;
  icon: string;
  description: string;
  drives: string;
  tile: "purple" | "pink" | "blue" | "green" | "orange" | "teal";
  existing?: { label: string; href: string }[];
  warning?: boolean;
};

export type SettingsGroup = {
  id: string;
  label: string;
  items: SettingsItem[];
};

export const SETTINGS_HOME_PATH = "/admin/settings";

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { slug: "general", label: "General", icon: "Menu", tile: "purple",
        description: "Set your workspace name, time zone, languages, and more.",
        drives: "Store identity values in app_settings — the name, timezone and language every other module reads." },
      { slug: "teammates", label: "Teammates", icon: "IdCard", tile: "purple",
        description: "Manage or invite teammates and see all activity logs.",
        drives: "Team member access: roles and module grants written through /api/admin/permissions into portal_module_permissions; activity lands in portal_permission_audit_log.",
        existing: [
          { label: "Admin users", href: "/admin/users" },
          { label: "Roles", href: "/admin/users/roles" },
          { label: "Invitations", href: "/admin/users/invitations" },
        ] },
      { slug: "workspace-owners", label: "Workspace owners", icon: "UsersRound", tile: "purple",
        description: "Manage who receives important service announcements.",
        drives: "Owner contact list in app_settings — where platform announcements and critical alerts are sent." },
      { slug: "office-hours", label: "Office hours", icon: "Clock", tile: "purple",
        description: "Choose your office hours to manage customer expectations.",
        drives: "Support availability and storefront expectations read these hours." },
      { slug: "brands", label: "Brands", icon: "Store", tile: "purple",
        description: "Set up and manage your brands.",
        drives: "The brand registry the catalog and storefront resolve brands from.",
        existing: [{ label: "Brands", href: "/admin/brands" }, { label: "Brand registry", href: "/admin/brand-registry" }] },
      { slug: "security", label: "Security", icon: "Shield", tile: "purple", warning: true,
        description: "Configure all security settings for your workspace and data.",
        drives: "Workspace security policy: sessions, sign-in rules, and data protections." },
      { slug: "multilingual", label: "Multilingual", icon: "Languages", tile: "purple",
        description: "Set up and manage your multilingual settings.",
        drives: "Locale configuration the storefront and communications localize from." },
    ],
  },
  {
    id: "accounting",
    label: "Accounting & Finance",
    items: [
      { slug: "chart-of-accounts", label: "Chart of Accounts", icon: "Landmark", tile: "purple",
        description: "Manage account types, detail types, and opening balances.",
        drives: "The chart every document posts against — income and COGS mapping starts here." },
      { slug: "bank-rules", label: "Bank Rules", icon: "ArrowRightLeft", tile: "purple",
        description: "Automate bank transaction categorization and payee matching.",
        drives: "Bank-feed categorization rules the Accounting group applies on import." },
      { slug: "recurring-templates", label: "Recurring Templates", icon: "ReceiptText", tile: "purple",
        description: "Manage scheduled invoices, bills, and journal entries.",
        drives: "The recurring templates (acct_recurring_*) that generate documents on schedule." },
      { slug: "business-tax", label: "Business Tax", icon: "Gavel", tile: "purple",
        description: "Configure tax rates, sales tax, and year-end filing settings.",
        drives: "Tax rates and filing settings checkout and the Business Tax group compute from." },
      { slug: "reports-budgets", label: "Reports & Budgets", icon: "ChartColumn", tile: "purple",
        description: "Manage custom reports, saved views, and budgeting preferences.",
        drives: "Saved views and report definitions (saved_views) shared across modules." },
      { slug: "financial-settings", label: "Financial Settings", icon: "CircleDollarSign", tile: "purple",
        description: "Set multicurrency options, closing dates, and payment terms.",
        drives: "Finance-wide defaults in app_settings — currency, closing, terms.",
        existing: [{ label: "Financial settings (current page)", href: "/admin/financial-settings" }] },
    ],
  },
  {
    id: "crm",
    label: "CRM & Contacts",
    items: [
      { slug: "customer-hub", label: "Customer Hub", icon: "Users", tile: "pink",
        description: "Set default terms, credit limits, and customer portal access.",
        drives: "Customer defaults and the portal-access policy every customer record inherits." },
      { slug: "vendors-suppliers", label: "Vendors & Suppliers", icon: "Store", tile: "pink",
        description: "Manage 1099 tracking, W-9 requests, and default accounts.",
        drives: "Vendor and supplier defaults — tax tracking and default expense accounts." },
      { slug: "segments-lists", label: "Segments & Lists", icon: "Filter", tile: "pink",
        description: "Create dynamic segments and manage saved contact lists.",
        drives: "CRM segments and tag assignments the marketing and support lists are built from." },
      { slug: "lead-capture", label: "Lead Capture Forms", icon: "Mail", tile: "pink",
        description: "Configure form fields, routing, and welcome sequences.",
        drives: "Lead capture: where crm_leads come from and where they route." },
    ],
  },
  {
    id: "catalog",
    label: "Catalog & Design",
    items: [
      { slug: "design-studio", label: "Design Studio", icon: "Palette", tile: "blue",
        description: "Manage canvas templates, print areas, and preflight rules.",
        drives: "Studio configuration: the blank geometry (blank_assets) and preflight rules every design is checked against." },
      { slug: "products-bundles", label: "Products & Bundles", icon: "Package", tile: "blue",
        description: "Set default SKU formats, variant naming, and bundle logic.",
        drives: "Catalog defaults for SKUs, variant naming, and bundles." },
      { slug: "pricing-discounts", label: "Pricing & Discounts", icon: "Tag", tile: "blue",
        description: "Configure rounding rules, discount stacking, and promo limits.",
        drives: "Pricing rules in app_settings — the default margin (pricing.default_margin_pct) already prices the catalog from here." },
      { slug: "categories-tags", label: "Categories & Tags", icon: "Shapes", tile: "blue",
        description: "Organize catalog taxonomy and channel mappings.",
        drives: "The taxonomy and tag vocabulary products, collections, and channels share." },
    ],
  },
  {
    id: "marketing",
    label: "Marketing & Social",
    items: [
      { slug: "social-channels", label: "Social Channels", icon: "Megaphone", tile: "green",
        description: "Connect Facebook, Instagram, TikTok, and manage OAuth tokens.",
        drives: "Social channel connections the publishing engine posts through." },
      { slug: "publishing-queue", label: "Publishing Queue", icon: "Share2", tile: "green",
        description: "Manage posting schedules, retry policies, and approval flows.",
        drives: "Publishing schedules, retries, and approvals for social output." },
      { slug: "newsletter-email", label: "Newsletter & Email", icon: "Mail", tile: "green",
        description: "Configure sending domains, CAN-SPAM rules, and templates.",
        drives: "Email sending identity and rules — the Resend sending domain and sender the whole platform mails from." },
      { slug: "ad-center", label: "Ad Center", icon: "MousePointerClick", tile: "green",
        description: "Manage ad network connections (Meta, TikTok, Google), pixels, and audiences.",
        drives: "Ad network connections, pixel IDs, and audiences — where retargeting tags get their IDs." },
      { slug: "google-business", label: "Google My Business", icon: "MapPin", tile: "green",
        description: "Manage your local listings, reviews, and location sync.",
        drives: "Local listing connection and review sync." },
    ],
  },
  {
    id: "operations",
    label: "Operations & Orders",
    items: [
      { slug: "fulfillment-shipping", label: "Fulfillment & Shipping", icon: "Truck", tile: "orange",
        description: "Manage carriers, shipping zones, and packing slip templates.",
        drives: "Shipping behavior — including the included shipping rate baked into product prices — and fulfillment defaults.",
        existing: [
          { label: "Shipping (current page)", href: "/admin/settings/shipping" },
          { label: "Printing (current page)", href: "/admin/settings/printing" },
          { label: "Locations (current page)", href: "/admin/settings/locations" },
        ] },
      { slug: "inventory-warehouses", label: "Inventory & Warehouses", icon: "Warehouse", tile: "orange",
        description: "Configure reorder points, location mapping, and supplier routing.",
        drives: "Inventory thresholds and the supplier routing defaults dispatch reads." },
      { slug: "support-channels", label: "Support Channels", icon: "Headset", tile: "orange",
        description: "Manage SLAs, omnichannel routing, and ticket workflows.",
        drives: "Support channel configuration: SLAs, routing, and ticket workflow defaults." },
      { slug: "help-center", label: "Help Center", homeLabel: "UnSaid Memories Help Center", icon: "BookOpen", tile: "teal",
        description: "Add to or configure the content in this Help Center.",
        drives: "Help Center content and configuration (the CMS settings home)." },
      { slug: "outbound", label: "Outbound", icon: "BellRing", tile: "orange",
        description: "Let customers choose which communications they receive.",
        drives: "Outbound communications: subscriptions, newsfeeds, labels, and email templates." },
    ],
  },
  {
    id: "system",
    label: "System & Personal",
    items: [
      { slug: "integrations", label: "Integrations", icon: "Blocks", tile: "teal",
        description: "Connect and manage the services this workspace runs on.",
        drives: "The connections vault (integration_keys): suppliers, payments, mail, telephony — credentials enter here and are tested here.",
        existing: [
          { label: "Integrations (current page)", href: "/admin/integrations" },
          { label: "Connections & Keys (current page)", href: "/admin/integrations/connections" },
        ] },
      { slug: "data-privacy", label: "Data & Privacy", icon: "Lock", tile: "teal",
        description: "Manage data retention, privacy requests, and exports.",
        drives: "Retention, privacy-request handling, and data export policy." },
      { slug: "notifications", label: "Notifications", icon: "Bell", tile: "teal",
        description: "Manage your notification preferences.",
        drives: "Notification preferences — per-type Email and Text switches." },
      { slug: "api-tokens", label: "API Tokens", icon: "KeyRound", tile: "teal",
        description: "API tokens that allow apps to access this workspace.",
        drives: "Store API keys — issued, listed, and revoked here." },
    ],
  },
];

/** Home-only cards (sections on the Home grid with no sidebar group). */
export const SETTINGS_HOME_EXTRA: { section: string; items: SettingsItem[] }[] = [
  {
    section: "Help Center",
    items: [
      { slug: "help-centers-all", label: "All Help Centers", icon: "LayoutGrid", tile: "teal",
        description: "Manage all Help Centers created for this workspace.",
        drives: "Every help center in the workspace, in one list." },
      { slug: "help-centers-new", label: "New Help Center", icon: "Plus", tile: "teal",
        description: "Create a new Help Center for this workspace.",
        drives: "Creates a help center." },
    ],
  },
  {
    section: "Outbound",
    items: [
      { slug: "outbound-subscriptions", label: "Subscriptions", icon: "BellRing", tile: "orange",
        description: "Let customers choose which communications they receive.",
        drives: "Customer subscription choices for outbound communications." },
      { slug: "outbound-newsfeeds", label: "Newsfeeds", icon: "Megaphone", tile: "orange",
        description: "Deliver relevant News Items with targeted newsfeeds.",
        drives: "Newsfeed targeting for news items." },
      { slug: "outbound-news-labels", label: "News Labels", icon: "Tags", tile: "orange",
        description: "Categorize your News Items with customized labels.",
        drives: "The label vocabulary for news items." },
      { slug: "outbound-customization", label: "Customization", icon: "SlidersHorizontal", tile: "orange",
        description: "Manage your message settings and universal linking.",
        drives: "Message settings and universal linking for outbound." },
      { slug: "email-templates", label: "Email Templates", icon: "Mails", tile: "orange",
        description: "Create and manage reusable email templates.",
        drives: "The reusable email template library the platform sends from." },
    ],
  },
  {
    section: "Personal",
    items: [
      { slug: "personal-details", label: "Details", icon: "Menu", tile: "teal",
        description: "Set your email, profile picture, language and theme.",
        drives: "Your own account details — including the portal theme you see." },
      { slug: "personal-security", label: "Account security", icon: "Shield", tile: "teal", warning: true,
        description: "Configure security settings for your account.",
        drives: "Your account's sign-in and security settings." },
      { slug: "personal-visible", label: "Visible to you", icon: "Eye", tile: "teal",
        description: "People, company and message tags visible to you.",
        drives: "What is visible to you across people, companies, and tags." },
      { slug: "personal-account-access", label: "Account access", icon: "Headset", tile: "teal",
        description: "Give access to the support team for troubleshooting.",
        drives: "Support access grants to your account." },
    ],
  },
];

export function allSettingsItems(): SettingsItem[] {
  const fromGroups = SETTINGS_GROUPS.flatMap((g) => g.items);
  const fromHome = SETTINGS_HOME_EXTRA.flatMap((s) => s.items);
  const seen = new Set<string>();
  return [...fromGroups, ...fromHome].filter((i) =>
    seen.has(i.slug) ? false : (seen.add(i.slug), true),
  );
}

export function settingsItemBySlug(slug: string): SettingsItem | undefined {
  return allSettingsItems().find((i) => i.slug === slug);
}

export const findSettingsItem = settingsItemBySlug;
