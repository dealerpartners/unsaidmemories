/**
 * Global Shell manifest — the sidebar's STRUCTURE is the owner's
 * feature tree (~/workspace/user/files/unsaidfeture_tree.txt,
 * 2026-11-02): domains -> child capabilities (groups) -> pages
 * (routes), exactly as he structured them. Nothing sits in a domain
 * unless his tree puts it there; existing pages his tree gives no
 * place are HELD off-manifest (kept in the app, listed in the
 * 2026-11-02 sidebar census) — never stuffed into a domain and
 * never deleted. Banners & Popups live under Catalog -> Website /
 * CMS, per the tree — not Marketing.
 *
 * Presentation data (group icon / iconBg badges) follows the
 * revamp standard (GLONALSHELLREVAMP2.html): the Finance groups
 * keep the revamp's QB badge pairs where their pages landed; new
 * tree groups are badged from the same palette (the five QB badge
 * colors + the shell's Lucide-mapped icon names). CREATE_CATEGORIES
 * and HUB_PILLARS remain the shell mockups' data, unchanged.
 */

export type DomainKey =
  | "dashboard"
  | "contacts"
  | "catalog"
  | "orders"
  | "finance"
  | "marketing"
  | "support"
  | "settings";

export type ManifestRouteState = "works" | "partial" | "shell";
export type ManifestOverviewState = "MISSING" | "OK";

export interface ManifestRoute {
  route: string;
  label: string;
  type: string;
  state: ManifestRouteState;
  comp: string;
  overview?: boolean;
  missing?: boolean;
}

export interface ManifestGroup {
  group: string;
  /** Material Symbols icon name + Tailwind bg class, as data from
      the revamp mock — only the Finance groups specify them; every
      other group renders the mock's default (folder on bg-gray-500). */
  icon?: string;
  iconBg?: string;
  routes: ManifestRoute[];
}

export interface ManifestOverview {
  route: string;
  state: ManifestOverviewState;
  note: string;
}

export interface ManifestDomain {
  label: string;
  icon: string;
  overview: ManifestOverview;
  groups: ManifestGroup[];
}

export const RAIL_ORDER: DomainKey[] = [
  "dashboard",
  "contacts",
  "catalog",
  "orders",
  "finance",
  "marketing",
  "support",
  "settings"
];

export const MANIFEST: Record<DomainKey, ManifestDomain> = {
  "dashboard": {
    "label": "Dashboard",
    "icon": "grid_view",
    "overview": {
      "route": "/admin",
      "state": "OK",
      "note": "Operations Vitals page"
    },
    "groups": [
      {
        "group": "Overview",
        "icon": "dashboard",
        "iconBg": "bg-blue-900",
        "routes": [
          {
            "route": "/admin",
            "label": "Overview",
            "type": "Overview",
            "state": "works",
            "comp": "OperationsVitalsPage",
            "overview": true
          },
          {
            "route": "/admin/dashboard",
            "label": "Dashboard",
            "type": "Overview",
            "state": "partial",
            "comp": "DashboardPage"
          }
        ]
      },
      {
        "group": "Analytics",
        "icon": "bar_chart",
        "iconBg": "bg-qb-teal",
        "routes": [
          {
            "route": "/admin/analytics",
            "label": "Analytics",
            "type": "Overview",
            "state": "works",
            "comp": "AnalyticsView + PlatformAnalyticsView"
          },
          {
            "route": "/admin/analytics/explorer",
            "label": "Explorer",
            "type": "List",
            "state": "partial",
            "comp": "AnalyticsExplorerView"
          }
        ]
      },
      {
        "group": "Notifications",
        "icon": "mail",
        "iconBg": "bg-qb-maroon",
        "routes": [
          {
            "route": "/admin/notifications",
            "label": "Notifications",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/notifications/customers",
            "label": "Customer notifications",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/notifications/seller",
            "label": "Seller notifications",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      }
    ]
  },
  "contacts": {
    "label": "Contacts",
    "icon": "group",
    "overview": {
      "route": "/admin/crm",
      "state": "MISSING",
      "note": "redirect-only; the CRM workspace pages sit under it"
    },
    "groups": [
      {
        "group": "CRM overview",
        "icon": "hub",
        "iconBg": "bg-blue-900",
        "routes": [
          {
            "route": "/admin/crm",
            "label": "Overview",
            "type": "Overview",
            "state": "shell",
            "comp": "— redirect()",
            "overview": true,
            "missing": true
          }
        ]
      },
      {
        "group": "Customers",
        "icon": "groups",
        "iconBg": "bg-qb-teal",
        "routes": [
          {
            "route": "/admin/customers",
            "label": "Customers",
            "type": "List",
            "state": "partial",
            "comp": "CustomersView +6"
          },
          {
            "route": "/admin/customers/[id]",
            "label": "Customer detail",
            "type": "Record",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/crm/customers/[id]",
            "label": "Customer record",
            "type": "Record",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/customers",
            "label": "Accounting customers",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Vendors",
        "icon": "domain_add",
        "iconBg": "bg-qb-green",
        "routes": [
          {
            "route": "/admin/vendors",
            "label": "Vendors",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/purchases/vendors",
            "label": "Purchase vendors",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Leads, segments, and relationship tools",
        "icon": "filter_list",
        "iconBg": "bg-qb-navy",
        "routes": [
          {
            "route": "/admin/leads",
            "label": "Leads",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/crm/leads",
            "label": "CRM leads",
            "type": "List",
            "state": "shell",
            "comp": "— redirect()",
            "missing": true
          },
          {
            "route": "/admin/crm/segments",
            "label": "Segments",
            "type": "List",
            "state": "shell",
            "comp": "— redirect()",
            "missing": true
          },
          {
            "route": "/admin/crm/segments/[id]",
            "label": "Segment detail",
            "type": "Record",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/crm/templates",
            "label": "Templates",
            "type": "List",
            "state": "shell",
            "comp": "— redirect()",
            "missing": true
          },
          {
            "route": "/admin/crm/automations",
            "label": "Automations",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Seller relationships",
        "icon": "point_of_sale",
        "iconBg": "bg-qb-maroon",
        "routes": [
          {
            "route": "/admin/sellers",
            "label": "Sellers",
            "type": "List",
            "state": "partial",
            "comp": "SellerStatusBadge + PageHead"
          },
          {
            "route": "/admin/sellers/[id]",
            "label": "Seller detail",
            "type": "Record",
            "state": "partial",
            "comp": "SellerStatusBadge"
          },
          {
            "route": "/admin/sellers/feed",
            "label": "Seller feed",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Onboarding",
        "icon": "person_add",
        "iconBg": "bg-qb-green",
        "routes": [
          {
            "route": "/admin/onboarding",
            "label": "Onboarding",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/onboarding/[id]",
            "label": "Onboarding detail",
            "type": "Record",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "CRM tools",
        "icon": "tune",
        "iconBg": "bg-qb-navy",
        "routes": [
          {
            "route": "/admin/crm/new-customer",
            "label": "New customer",
            "type": "Create-Wizard",
            "state": "works",
            "comp": "NewCustomerWizard"
          },
          {
            "route": "/admin/crm/search",
            "label": "Search",
            "type": "Unclassified",
            "state": "partial",
            "comp": "GlobalSearch"
          },
          {
            "route": "/admin/crm/dedupe",
            "label": "Dedupe",
            "type": "List",
            "state": "shell",
            "comp": "— redirect()",
            "missing": true
          }
        ]
      }
    ]
  },
  "catalog": {
    "label": "Catalog",
    "icon": "inventory_2",
    "overview": {
      "route": "/admin/catalog",
      "state": "MISSING",
      "note": "Record/List root; no Overview"
    },
    "groups": [
      {
        "group": "Design Studio",
        "icon": "palette",
        "iconBg": "bg-qb-teal",
        "routes": [
          {
            "route": "/admin/studio",
            "label": "Studio",
            "type": "Canvas",
            "state": "works",
            "comp": "StudioClient"
          },
          {
            "route": "/admin/studio/new-design",
            "label": "New design",
            "type": "Create-Wizard",
            "state": "works",
            "comp": "NewDesignWizard"
          },
          {
            "route": "/admin/studio/collection-builder",
            "label": "Collection builder",
            "type": "Canvas",
            "state": "works",
            "comp": "CollectionBuilderClient"
          },
          {
            "route": "/admin/studio/publish",
            "label": "Publish",
            "type": "Canvas",
            "state": "works",
            "comp": "PublishClient"
          }
        ]
      },
      {
        "group": "Products and listings",
        "icon": "inventory_2",
        "iconBg": "bg-blue-900",
        "routes": [
          {
            "route": "/admin/catalog",
            "label": "Overview",
            "type": "Overview",
            "state": "partial",
            "comp": "listing-editor + joined-catalog",
            "overview": true,
            "missing": true
          },
          {
            "route": "/admin/products",
            "label": "Products",
            "type": "List",
            "state": "partial",
            "comp": "listing-editor + joined-catalog"
          },
          {
            "route": "/admin/listings",
            "label": "Listings",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/catalog/bundles",
            "label": "Bundles",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/catalog/blanks",
            "label": "Blanks",
            "type": "List",
            "state": "works",
            "comp": "inline"
          },
          {
            "route": "/admin/catalog-review",
            "label": "Catalog review",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/catalog/items",
            "label": "Catalog items",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Categories, collections, and filters",
        "icon": "filter_list",
        "iconBg": "bg-qb-green",
        "routes": [
          {
            "route": "/admin/categories",
            "label": "Categories",
            "type": "Record",
            "state": "partial",
            "comp": "PromotionDealForm"
          },
          {
            "route": "/admin/collections",
            "label": "Collections",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/filters",
            "label": "Filters",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/catalog/collections",
            "label": "Catalog collections",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Brands",
        "icon": "verified",
        "iconBg": "bg-qb-navy",
        "routes": [
          {
            "route": "/admin/brands",
            "label": "Brands",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/brand-registry",
            "label": "Brand registry",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Ecommerce",
        "icon": "point_of_sale",
        "iconBg": "bg-qb-maroon",
        "routes": [
          {
            "route": "/admin/ecommerce",
            "label": "Ecommerce",
            "type": "Settings",
            "state": "partial",
            "comp": "StaffDenied"
          },
          {
            "route": "/admin/ecommerce/collections",
            "label": "Collections",
            "type": "Settings",
            "state": "partial",
            "comp": "CollectionActiveToggle"
          },
          {
            "route": "/admin/ecommerce/publishing",
            "label": "Publishing",
            "type": "Settings",
            "state": "partial",
            "comp": "PublishToggle"
          },
          {
            "route": "/admin/ecommerce/returns",
            "label": "Returns",
            "type": "Settings",
            "state": "partial",
            "comp": "SettingsForm"
          },
          {
            "route": "/admin/ecommerce/shipping",
            "label": "Shipping",
            "type": "Settings",
            "state": "partial",
            "comp": "ShippingProfileEditor"
          },
          {
            "route": "/admin/ecommerce/taxes",
            "label": "Taxes",
            "type": "Settings",
            "state": "partial",
            "comp": "SettingsForm"
          }
        ]
      },
      {
        "group": "Catalog channels, pricing, and publication",
        "icon": "hub",
        "iconBg": "bg-qb-teal",
        "routes": [
          {
            "route": "/admin/accounting/catalog/channels",
            "label": "Channels",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/catalog/pricing",
            "label": "Pricing",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/catalog/publishing",
            "label": "Publishing",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Website / CMS",
        "icon": "view_carousel",
        "iconBg": "bg-qb-navy",
        "routes": [
          {
            "route": "/admin/website",
            "label": "Website",
            "type": "Settings",
            "state": "partial",
            "comp": "SettingsForm + SettingsImageUpload"
          },
          {
            "route": "/admin/website/cms",
            "label": "CMS",
            "type": "Settings",
            "state": "partial",
            "comp": "CmsDashboard"
          },
          {
            "route": "/admin/website/content",
            "label": "Content",
            "type": "Settings",
            "state": "partial",
            "comp": "ContentAddForms"
          },
          {
            "route": "/admin/website/banners",
            "label": "Banners",
            "type": "List",
            "state": "partial",
            "comp": "WebsiteItemManager"
          },
          {
            "route": "/admin/website/popups",
            "label": "Popups",
            "type": "List",
            "state": "partial",
            "comp": "WebsiteItemManager"
          },
          {
            "route": "/admin/website/analytics",
            "label": "Website analytics",
            "type": "Settings",
            "state": "partial",
            "comp": "StaffDenied"
          },
          {
            "route": "/admin/media",
            "label": "Media",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      }
    ]
  },
  "orders": {
    "label": "Orders",
    "icon": "assignment",
    "overview": {
      "route": "/admin/orders",
      "state": "MISSING",
      "note": "List root; no Overview"
    },
    "groups": [
      {
        "group": "Order management",
        "icon": "assignment",
        "iconBg": "bg-blue-900",
        "routes": [
          {
            "route": "/admin/orders",
            "label": "Overview",
            "type": "Overview",
            "state": "partial",
            "comp": "ShippingLabelModal",
            "overview": true,
            "missing": true
          },
          {
            "route": "/admin/orders/new",
            "label": "New order",
            "type": "Create-Wizard",
            "state": "works",
            "comp": "CreateOrderForm"
          },
          {
            "route": "/admin/orders/[id]",
            "label": "Order detail",
            "type": "Record",
            "state": "partial",
            "comp": "SupplierPush"
          },
          {
            "route": "/admin/orders/[id]/packing-slip",
            "label": "Packing slip",
            "type": "Record",
            "state": "works",
            "comp": "PrintButton"
          },
          {
            "route": "/admin/orders/order-problem",
            "label": "Order problem",
            "type": "Create-Wizard",
            "state": "works",
            "comp": "OrderProblemWizard"
          },
          {
            "route": "/admin/orders/reports",
            "label": "Reports",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/order-details",
            "label": "Order details",
            "type": "Record",
            "state": "partial",
            "comp": "OrderDetailsView"
          },
          {
            "route": "/admin/ecommerce/orders",
            "label": "Ecommerce orders",
            "type": "List",
            "state": "partial",
            "comp": "StatusBadge"
          }
        ]
      },
      {
        "group": "Purchasing and suppliers",
        "icon": "shopping_bag",
        "iconBg": "bg-qb-green",
        "routes": [
          {
            "route": "/admin/purchase-orders",
            "label": "Purchase orders",
            "type": "List",
            "state": "partial",
            "comp": "PurchaseOrdersView"
          },
          {
            "route": "/admin/purchasing",
            "label": "Purchasing",
            "type": "List",
            "state": "partial",
            "comp": "ReceivePoButton"
          },
          {
            "route": "/admin/supplier-orders",
            "label": "Supplier orders",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/vendors",
            "label": "Vendors",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/purchases",
            "label": "Purchases",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/purchases/receipts",
            "label": "Receipts",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/purchases/services",
            "label": "Services",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/purchases/vendors",
            "label": "Purchase vendors",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Inventory",
        "icon": "inventory_2",
        "iconBg": "bg-qb-teal",
        "routes": [
          {
            "route": "/admin/inventory",
            "label": "Inventory",
            "type": "List",
            "state": "partial",
            "comp": "TransferForm + PageHead"
          },
          {
            "route": "/admin/inventory/stock",
            "label": "Stock",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/inventory/counts",
            "label": "Counts",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/inventory/locations-pos",
            "label": "Locations POS",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/inventory/reorder",
            "label": "Reorder",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/inventory/stock",
            "label": "Inventory stock",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/inventory/warehouses",
            "label": "Warehouses",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Fulfillment and shipping",
        "icon": "local_shipping",
        "iconBg": "bg-qb-navy",
        "routes": [
          {
            "route": "/admin/fulfillment",
            "label": "Fulfillment",
            "type": "List",
            "state": "partial",
            "comp": "ShippingLabelModal"
          },
          {
            "route": "/admin/shipping",
            "label": "Shipping",
            "type": "List",
            "state": "partial",
            "comp": "ShippingStationView"
          },
          {
            "route": "/admin/accounting/inventory/fulfillment",
            "label": "Inventory fulfillment",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/inventory/shipping",
            "label": "Inventory shipping",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Returns",
        "icon": "assignment_return",
        "iconBg": "bg-qb-maroon",
        "routes": [
          {
            "route": "/admin/returns",
            "label": "Returns",
            "type": "List",
            "state": "partial",
            "comp": "ReturnsOversight + ReturnsView"
          },
          {
            "route": "/admin/accounting/inventory/returns",
            "label": "Inventory returns",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      }
    ]
  },
  "finance": {
    "label": "Finance",
    "icon": "account_balance",
    "overview": {
      "route": "/admin/accounting",
      "state": "OK",
      "note": "PageHeader + KpiTiles"
    },
    "groups": [
      {
        "group": "Financial overview",
        "icon": "play_arrow",
        "iconBg": "bg-blue-900",
        "routes": [
          {
            "route": "/admin/accounting",
            "label": "Overview",
            "type": "Overview",
            "state": "partial",
            "comp": "KpiTiles",
            "overview": true
          }
        ]
      },
      {
        "group": "Receivables",
        "icon": "attach_money",
        "iconBg": "bg-qb-teal",
        "routes": [
          {
            "route": "/admin/invoices",
            "label": "Invoices",
            "type": "List",
            "state": "partial",
            "comp": "InvoiceEditor"
          },
          {
            "route": "/admin/accounting/invoices",
            "label": "Accounting invoices",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/invoices/[id]",
            "label": "Invoice detail",
            "type": "Record",
            "state": "partial",
            "comp": "ApiButton + Pill"
          },
          {
            "route": "/admin/accounting/invoices/new",
            "label": "New invoice",
            "type": "Create-Wizard",
            "state": "partial",
            "comp": "LinesForm"
          },
          {
            "route": "/admin/estimates",
            "label": "Estimates",
            "type": "List",
            "state": "partial",
            "comp": "EstimatesView"
          },
          {
            "route": "/admin/recurring-invoices",
            "label": "Recurring invoices",
            "type": "List",
            "state": "partial",
            "comp": "RecurringInvoicesView"
          },
          {
            "route": "/admin/accounting/sales",
            "label": "Sales",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/sales/checkouts",
            "label": "Checkouts",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/sales/estimates",
            "label": "Sales estimates",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/sales/recurring",
            "label": "Sales recurring",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/sales/statements",
            "label": "Statements",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Payables",
        "icon": "receipt",
        "iconBg": "bg-qb-green",
        "routes": [
          {
            "route": "/admin/bills",
            "label": "Bills",
            "type": "List",
            "state": "works",
            "comp": "BillsView"
          },
          {
            "route": "/admin/accounting/purchases/bills",
            "label": "Purchase bills",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/purchases/payment-runs",
            "label": "Payment runs",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Payments",
        "icon": "attach_money",
        "iconBg": "bg-qb-navy",
        "routes": [
          {
            "route": "/admin/payments",
            "label": "Payments",
            "type": "List",
            "state": "partial",
            "comp": "PaymentsView"
          },
          {
            "route": "/admin/payments/checkouts",
            "label": "Payment checkouts",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/payments/reconciliation",
            "label": "Payment reconciliation",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/payments",
            "label": "Accounting payments",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/payments/[id]",
            "label": "Payment detail",
            "type": "Record",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/payouts",
            "label": "Payouts",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/sellers/payments",
            "label": "Seller payments",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Refunds and deposits",
        "icon": "receipt",
        "iconBg": "bg-qb-maroon",
        "routes": [
          {
            "route": "/admin/refunds",
            "label": "Refunds",
            "type": "List",
            "state": "partial",
            "comp": "RefundsView"
          },
          {
            "route": "/admin/accounting/refunds",
            "label": "Accounting refunds",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/refunds/disputes",
            "label": "Disputes",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/deposits",
            "label": "Deposits",
            "type": "List",
            "state": "partial",
            "comp": "DepositsView"
          },
          {
            "route": "/admin/accounting/deposits",
            "label": "Accounting deposits",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Banking",
        "icon": "play_arrow",
        "iconBg": "bg-qb-teal",
        "routes": [
          {
            "route": "/admin/banking",
            "label": "Banking",
            "type": "List",
            "state": "partial",
            "comp": "BankingView"
          },
          {
            "route": "/admin/accounting/banking",
            "label": "Accounting banking",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/banking/cash-flow",
            "label": "Cash flow",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/banking/payouts",
            "label": "Banking payouts",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/banking/reconciliation",
            "label": "Bank reconciliation",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/banking/triage",
            "label": "Triage",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Books",
        "icon": "description",
        "iconBg": "bg-blue-900",
        "routes": [
          {
            "route": "/admin/books",
            "label": "Books",
            "type": "List",
            "state": "partial",
            "comp": "BooksView"
          },
          {
            "route": "/admin/accounting/books",
            "label": "Accounting books",
            "type": "List",
            "state": "partial",
            "comp": "BooksView"
          },
          {
            "route": "/admin/accounting/books/ledger",
            "label": "Ledger",
            "type": "List",
            "state": "partial",
            "comp": "DataTable"
          },
          {
            "route": "/admin/accounting/books/accounts",
            "label": "Accounts",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/books/accounts/wizard",
            "label": "Accounts wizard",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/books/audit-trail",
            "label": "Audit trail",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/books/controls",
            "label": "Controls",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/books/entities",
            "label": "Entities",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/books/journal",
            "label": "Journal",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/books/multi-currency",
            "label": "Multi-currency",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/books/period-close",
            "label": "Period close",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/books/reclassifications",
            "label": "Reclassifications",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/books/transfers",
            "label": "Transfers",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Reports and valuation",
        "icon": "description",
        "iconBg": "bg-qb-green",
        "routes": [
          {
            "route": "/admin/reports",
            "label": "Reports",
            "type": "List",
            "state": "partial",
            "comp": "ReportsView"
          },
          {
            "route": "/admin/accounting/inventory/valuation",
            "label": "Valuation",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/reports/balance-sheet",
            "label": "Balance sheet",
            "type": "List",
            "state": "partial",
            "comp": "StatementNav"
          },
          {
            "route": "/admin/accounting/reports/cash-flow",
            "label": "Cash flow",
            "type": "List",
            "state": "partial",
            "comp": "StatementNav"
          },
          {
            "route": "/admin/accounting/reports/funnel",
            "label": "Funnel",
            "type": "List",
            "state": "partial",
            "comp": "StatementNav"
          },
          {
            "route": "/admin/accounting/reports/margin-matrix",
            "label": "Margin matrix",
            "type": "List",
            "state": "partial",
            "comp": "StatementNav"
          },
          {
            "route": "/admin/accounting/reports/profit-loss",
            "label": "Profit loss",
            "type": "List",
            "state": "partial",
            "comp": "StatementNav"
          },
          {
            "route": "/admin/accounting/reports/retained-earnings",
            "label": "Retained earnings",
            "type": "List",
            "state": "partial",
            "comp": "StatementNav"
          },
          {
            "route": "/admin/accounting/reports/revenue",
            "label": "Revenue",
            "type": "List",
            "state": "partial",
            "comp": "StatementNav"
          },
          {
            "route": "/admin/accounting/reports/revenue-bridge",
            "label": "Revenue bridge",
            "type": "List",
            "state": "partial",
            "comp": "StatementNav"
          },
          {
            "route": "/admin/accounting/reports/settlement-clearing",
            "label": "Settlement clearing",
            "type": "List",
            "state": "partial",
            "comp": "StatementNav"
          },
          {
            "route": "/admin/accounting/reports/trial-balance",
            "label": "Trial balance",
            "type": "List",
            "state": "partial",
            "comp": "StatementNav"
          },
          {
            "route": "/admin/accounting/reports/budgets",
            "label": "Budgets",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/reports/segments",
            "label": "Segments",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Taxes and payroll",
        "icon": "description",
        "iconBg": "bg-qb-maroon",
        "routes": [
          {
            "route": "/admin/taxes",
            "label": "Taxes",
            "type": "List",
            "state": "partial",
            "comp": "TaxesView"
          },
          {
            "route": "/admin/accounting/taxes",
            "label": "Accounting taxes",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/accounting/taxes/1099",
            "label": "1099",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/sellers/tax",
            "label": "Seller tax",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/sellers/tax/1099k/[id]",
            "label": "1099-K detail",
            "type": "Record",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/payroll",
            "label": "Payroll",
            "type": "List",
            "state": "partial",
            "comp": "PayrollView"
          }
        ]
      },
      {
        "group": "Gift cards and subscriptions",
        "icon": "receipt",
        "iconBg": "bg-qb-navy",
        "routes": [
          {
            "route": "/admin/gift-cards",
            "label": "Gift cards",
            "type": "List",
            "state": "partial",
            "comp": "GiftCardsAdmin"
          },
          {
            "route": "/admin/accounting/gift-cards",
            "label": "Accounting gift cards",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/subscriptions",
            "label": "Subscriptions",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/subscriptions/offers",
            "label": "Subscription offers",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Financial configuration",
        "icon": "play_arrow",
        "iconBg": "bg-qb-maroon",
        "routes": [
          {
            "route": "/admin/fees",
            "label": "Fees",
            "type": "Settings",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/financial-settings",
            "label": "Financial settings",
            "type": "Settings",
            "state": "partial",
            "comp": "FinancialSettingsView"
          },
          {
            "route": "/admin/system/financial-settings",
            "label": "System financial settings",
            "type": "Settings",
            "state": "partial",
            "comp": "SettingsForm"
          }
        ]
      }
    ]
  },
  "marketing": {
    "label": "Marketing",
    "icon": "campaign",
    "overview": {
      "route": "/admin/advertising",
      "state": "MISSING",
      "note": "no domain overview page in the tree; Advertising is the first parent"
    },
    "groups": [
      {
        "group": "Advertising / Ad Center",
        "icon": "campaign",
        "iconBg": "bg-qb-maroon",
        "routes": [
          {
            "route": "/admin/advertising",
            "label": "Advertising",
            "type": "List",
            "state": "partial",
            "comp": "inline",
            "overview": true,
            "missing": true
          },
          {
            "route": "/admin/sellers/advertising",
            "label": "Seller advertising",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Social publishing",
        "icon": "share",
        "iconBg": "bg-qb-teal",
        "routes": [
          {
            "route": "/admin/social",
            "label": "Publishing Studio",
            "type": "Canvas",
            "state": "partial",
            "comp": "PublishingStudio"
          },
          {
            "route": "/admin/social/calendar",
            "label": "Calendar",
            "type": "Canvas",
            "state": "works",
            "comp": "PublishingStudio"
          },
          {
            "route": "/admin/social/channels",
            "label": "Channels",
            "type": "Canvas",
            "state": "works",
            "comp": "PublishingStudio"
          },
          {
            "route": "/admin/social/create",
            "label": "Create post",
            "type": "Canvas",
            "state": "works",
            "comp": "PublishingStudio"
          },
          {
            "route": "/admin/social/library",
            "label": "Content library",
            "type": "Canvas",
            "state": "works",
            "comp": "PublishingStudio"
          },
          {
            "route": "/admin/social/performance",
            "label": "Performance",
            "type": "Canvas",
            "state": "works",
            "comp": "PublishingStudio"
          },
          {
            "route": "/admin/social/queue",
            "label": "Publishing queue",
            "type": "Canvas",
            "state": "works",
            "comp": "PublishingStudio"
          },
          {
            "route": "/admin/social/oversight",
            "label": "Oversight",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Promotions",
        "icon": "confirmation_number",
        "iconBg": "bg-qb-green",
        "routes": [
          {
            "route": "/admin/promotions",
            "label": "Promotions",
            "type": "Record",
            "state": "partial",
            "comp": "TargetPicker"
          }
        ]
      },
      {
        "group": "Newsletter",
        "icon": "mail",
        "iconBg": "bg-blue-900",
        "routes": [
          {
            "route": "/admin/newsletter",
            "label": "Newsletter",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Automation",
        "icon": "bolt",
        "iconBg": "bg-qb-navy",
        "routes": [
          {
            "route": "/admin/automation",
            "label": "Automation",
            "type": "List",
            "state": "partial",
            "comp": "AutomationPage"
          }
        ]
      }
    ]
  },
  "support": {
    "label": "Support",
    "icon": "support_agent",
    "overview": {
      "route": "/admin/support",
      "state": "MISSING",
      "note": "intake queue root; no Overview"
    },
    "groups": [
      {
        "group": "Support Desk",
        "icon": "support_agent",
        "iconBg": "bg-blue-900",
        "routes": [
          {
            "route": "/admin/support",
            "label": "Overview",
            "type": "Overview",
            "state": "partial",
            "comp": "SupportControls (intake)",
            "overview": true,
            "missing": true
          },
          {
            "route": "/admin/support/[id]",
            "label": "Ticket detail",
            "type": "Record",
            "state": "partial",
            "comp": "FieldEditors"
          },
          {
            "route": "/admin/support/customers",
            "label": "Customers",
            "type": "List",
            "state": "partial",
            "comp": "CreateModalButton"
          },
          {
            "route": "/admin/support/forms",
            "label": "Forms",
            "type": "List",
            "state": "partial",
            "comp": "CreateModalButton"
          },
          {
            "route": "/admin/support/queues",
            "label": "Queues",
            "type": "List",
            "state": "partial",
            "comp": "SupportSearch"
          },
          {
            "route": "/admin/support/knowledge",
            "label": "Knowledge",
            "type": "List",
            "state": "partial",
            "comp": "SupportSearch"
          },
          {
            "route": "/admin/support/sla",
            "label": "SLA",
            "type": "List",
            "state": "partial",
            "comp": "CreateModalButton"
          },
          {
            "route": "/admin/support/automations",
            "label": "Automations",
            "type": "List",
            "state": "partial",
            "comp": "Toggle"
          },
          {
            "route": "/admin/support/channels",
            "label": "Channels",
            "type": "List",
            "state": "partial",
            "comp": "ConfigToggle"
          },
          {
            "route": "/admin/support/config",
            "label": "Config",
            "type": "Settings",
            "state": "partial",
            "comp": "ConfigSection"
          },
          {
            "route": "/admin/support/teams",
            "label": "Teams",
            "type": "List",
            "state": "partial",
            "comp": "Toggle"
          },
          {
            "route": "/admin/support/profile",
            "label": "Profile",
            "type": "Settings",
            "state": "partial",
            "comp": "ProfileForm"
          },
          {
            "route": "/admin/support/analytics",
            "label": "Analytics",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/support/notifications",
            "label": "Notifications",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/support/ops",
            "label": "Ops",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/support/reporting",
            "label": "Reporting",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/support/workspace",
            "label": "Workspace",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Messages",
        "icon": "mail",
        "iconBg": "bg-qb-teal",
        "routes": [
          {
            "route": "/admin/messages",
            "label": "Messages",
            "type": "List",
            "state": "partial",
            "comp": "SupportNotificationsPanel"
          },
          {
            "route": "/admin/messages/approvals",
            "label": "Approvals",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/messages/settings",
            "label": "Message settings",
            "type": "Settings",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Help Center and documentation",
        "icon": "menu_book",
        "iconBg": "bg-qb-green",
        "routes": [
          {
            "route": "/admin/help",
            "label": "Help Center",
            "type": "List",
            "state": "partial",
            "comp": "HelpHome"
          },
          {
            "route": "/admin/help/[slug]",
            "label": "Help article",
            "type": "Record",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/docs",
            "label": "Docs",
            "type": "List",
            "state": "partial",
            "comp": "TypeBadge"
          },
          {
            "route": "/admin/docs/[domain]",
            "label": "Docs domain",
            "type": "Record",
            "state": "partial",
            "comp": "TypeBadge"
          },
          {
            "route": "/admin/docs/[domain]/[section]",
            "label": "Docs section",
            "type": "Record",
            "state": "partial",
            "comp": "Modal"
          },
          {
            "route": "/admin/docs/article/[id]",
            "label": "Docs article",
            "type": "Record",
            "state": "partial",
            "comp": "Modal"
          },
          {
            "route": "/admin/docs/article/[id]/versions",
            "label": "Article versions",
            "type": "Record",
            "state": "partial",
            "comp": "StatusPill"
          },
          {
            "route": "/admin/docs/guides",
            "label": "Guides",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/docs/guides/[article]",
            "label": "Guide article",
            "type": "Record",
            "state": "partial",
            "comp": "HCDocumentBody"
          },
          {
            "route": "/admin/docs/marketplace",
            "label": "Marketplace docs",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/docs/sections/new",
            "label": "New section",
            "type": "Create-Wizard",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Trust & Safety",
        "icon": "shield_person",
        "iconBg": "bg-qb-maroon",
        "routes": [
          {
            "route": "/admin/trust",
            "label": "Trust & Safety",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/trust/appeals",
            "label": "Appeals",
            "type": "List",
            "state": "partial",
            "comp": "DecideButtons"
          },
          {
            "route": "/admin/trust/compliance",
            "label": "Compliance",
            "type": "List",
            "state": "partial",
            "comp": "DecideButtons"
          },
          {
            "route": "/admin/trust/moderation",
            "label": "Moderation",
            "type": "List",
            "state": "partial",
            "comp": "DecideButtons"
          },
          {
            "route": "/admin/trust/verification",
            "label": "Verification",
            "type": "List",
            "state": "partial",
            "comp": "DecideButtons"
          },
          {
            "route": "/admin/trust/fraud",
            "label": "Fraud",
            "type": "List",
            "state": "partial",
            "comp": "CreateCaseForm"
          },
          {
            "route": "/admin/trust/risk",
            "label": "Risk",
            "type": "List",
            "state": "partial",
            "comp": "CreateCaseForm"
          },
          {
            "route": "/admin/trust/policies",
            "label": "Policies",
            "type": "List",
            "state": "partial",
            "comp": "PolicyManager"
          },
          {
            "route": "/admin/trust/audit",
            "label": "Audit",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/trust/disputes",
            "label": "Disputes",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Trust & Safety pages",
        "icon": "shield_person",
        "iconBg": "bg-qb-navy",
        "routes": [
          {
            "route": "/admin/trust-safety",
            "label": "Trust & Safety pages",
            "type": "List",
            "state": "partial",
            "comp": "TrustSafetyNav"
          },
          {
            "route": "/admin/trust-safety/appeals",
            "label": "Appeals",
            "type": "List",
            "state": "partial",
            "comp": "TrustSafetyNav"
          },
          {
            "route": "/admin/trust-safety/fraud-queue",
            "label": "Fraud queue",
            "type": "List",
            "state": "partial",
            "comp": "TrustSafetyNav"
          },
          {
            "route": "/admin/trust-safety/investigations",
            "label": "Investigations",
            "type": "List",
            "state": "partial",
            "comp": "TrustSafetyNav"
          },
          {
            "route": "/admin/trust-safety/moderation",
            "label": "Moderation",
            "type": "List",
            "state": "partial",
            "comp": "TrustSafetyNav"
          },
          {
            "route": "/admin/trust-safety/moderation/ai-review",
            "label": "AI review",
            "type": "List",
            "state": "partial",
            "comp": "TrustSafetyNav"
          },
          {
            "route": "/admin/trust-safety/moderation/flags",
            "label": "Flags",
            "type": "List",
            "state": "partial",
            "comp": "TrustSafetyNav"
          },
          {
            "route": "/admin/trust-safety/moderation/forum",
            "label": "Forum",
            "type": "List",
            "state": "partial",
            "comp": "TrustSafetyNav"
          },
          {
            "route": "/admin/trust-safety/moderation/photos",
            "label": "Photos",
            "type": "List",
            "state": "partial",
            "comp": "TrustSafetyNav"
          },
          {
            "route": "/admin/trust-safety/payouts",
            "label": "Payouts",
            "type": "List",
            "state": "partial",
            "comp": "TrustSafetyNav"
          },
          {
            "route": "/admin/trust-safety/repeat-offenders",
            "label": "Repeat offenders",
            "type": "List",
            "state": "partial",
            "comp": "TrustSafetyNav"
          },
          {
            "route": "/admin/trust-safety/violations",
            "label": "Violations",
            "type": "List",
            "state": "partial",
            "comp": "TrustSafetyNav"
          },
          {
            "route": "/admin/trust-safety/zero-tolerance",
            "label": "Zero tolerance",
            "type": "List",
            "state": "partial",
            "comp": "TrustSafetyNav"
          }
        ]
      },
      {
        "group": "Seller review and enforcement",
        "icon": "fact_check",
        "iconBg": "bg-qb-teal",
        "routes": [
          {
            "route": "/admin/sellers/review-queue",
            "label": "Review queue",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/sellers/verification",
            "label": "Seller verification",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/sellers/remediation",
            "label": "Remediation",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/sellers/reinstatements",
            "label": "Reinstatements",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Policy management",
        "icon": "description",
        "iconBg": "bg-qb-navy",
        "routes": [
          {
            "route": "/admin/policies",
            "label": "Policies",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/policies/acceptances",
            "label": "Acceptances",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/policies/editor",
            "label": "Policy editor",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/policies/marketplace",
            "label": "Marketplace policies",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/policies/precedence",
            "label": "Precedence",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/policies/versions",
            "label": "Versions",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      }
    ]
  },
  "settings": {
    "label": "Settings",
    "icon": "settings",
    "overview": {
      "route": "/admin/settings",
      "state": "OK",
      "note": "SettingsView"
    },
    "groups": [
      {
        "group": "Admin Users and access",
        "icon": "groups",
        "iconBg": "bg-blue-900",
        "routes": [
          {
            "route": "/admin/users",
            "label": "Users",
            "type": "List",
            "state": "partial",
            "comp": "StaffWidgets"
          },
          {
            "route": "/admin/users/[id]",
            "label": "User detail",
            "type": "Record",
            "state": "partial",
            "comp": "StaffEditForm"
          },
          {
            "route": "/admin/users/invitations",
            "label": "Invitations",
            "type": "List",
            "state": "partial",
            "comp": "StaffStatusButton"
          },
          {
            "route": "/admin/users/portal-accounts",
            "label": "Portal accounts",
            "type": "List",
            "state": "partial",
            "comp": "PortalAccountActions"
          },
          {
            "route": "/admin/users/roles",
            "label": "Roles",
            "type": "List",
            "state": "partial",
            "comp": "PermissionsMatrix"
          },
          {
            "route": "/admin/staff",
            "label": "Staff",
            "type": "List",
            "state": "partial",
            "comp": "StaffView"
          },
          {
            "route": "/admin/identity-grants",
            "label": "Identity grants",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/impersonation",
            "label": "Impersonation",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/profile",
            "label": "Profile",
            "type": "Settings",
            "state": "partial",
            "comp": "PortalThemeSetting"
          }
        ]
      },
      {
        "group": "Integrations",
        "icon": "hub",
        "iconBg": "bg-qb-teal",
        "routes": [
          {
            "route": "/admin/integrations",
            "label": "Integrations",
            "type": "List",
            "state": "partial",
            "comp": "IntegrationsCatalog"
          },
          {
            "route": "/admin/integrations/connect",
            "label": "Connect",
            "type": "List",
            "state": "partial",
            "comp": "ConnectWizard"
          },
          {
            "route": "/admin/integrations/connections",
            "label": "Connections",
            "type": "List",
            "state": "partial",
            "comp": "ConnectionsClient"
          },
          {
            "route": "/admin/integrations/partners",
            "label": "Partners",
            "type": "List",
            "state": "partial",
            "comp": "PartnersClient"
          },
          {
            "route": "/admin/integrations/calendar",
            "label": "Calendar",
            "type": "List",
            "state": "partial",
            "comp": "CalendarClient"
          },
          {
            "route": "/admin/integrations/share",
            "label": "Share",
            "type": "List",
            "state": "partial",
            "comp": "Subnav"
          },
          {
            "route": "/admin/integrations/share/[productId]",
            "label": "Share product",
            "type": "Record",
            "state": "partial",
            "comp": "ShareComposer"
          },
          {
            "route": "/admin/integrations/social",
            "label": "Social",
            "type": "List",
            "state": "partial",
            "comp": "SocialClient"
          },
          {
            "route": "/admin/integrations/social-post",
            "label": "Social post",
            "type": "List",
            "state": "partial",
            "comp": "SocialPostWizard"
          },
          {
            "route": "/admin/integrations/activity",
            "label": "Activity",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/system/integrations",
            "label": "System integrations",
            "type": "Settings",
            "state": "partial",
            "comp": "SupplierEditor"
          }
        ]
      },
      {
        "group": "AI operations",
        "icon": "bolt",
        "iconBg": "bg-qb-maroon",
        "routes": [
          {
            "route": "/admin/ai-ops",
            "label": "AI ops",
            "type": "List",
            "state": "partial",
            "comp": "Badge"
          },
          {
            "route": "/admin/ai-ops/ab-tests",
            "label": "A/B tests",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/ai-ops/agents",
            "label": "Agents",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/ai-ops/cost",
            "label": "Cost",
            "type": "List",
            "state": "partial",
            "comp": "Badge"
          },
          {
            "route": "/admin/ai-ops/disclosures",
            "label": "Disclosures",
            "type": "List",
            "state": "partial",
            "comp": "Badge"
          },
          {
            "route": "/admin/ai-ops/evals",
            "label": "Evals",
            "type": "List",
            "state": "partial",
            "comp": "Badge"
          },
          {
            "route": "/admin/ai-ops/functions",
            "label": "Functions",
            "type": "List",
            "state": "partial",
            "comp": "Badge"
          },
          {
            "route": "/admin/ai-ops/incidents",
            "label": "Incidents",
            "type": "List",
            "state": "partial",
            "comp": "Badge"
          },
          {
            "route": "/admin/ai-ops/models",
            "label": "Models",
            "type": "List",
            "state": "partial",
            "comp": "Badge"
          },
          {
            "route": "/admin/ai-ops/prompts",
            "label": "Prompts",
            "type": "List",
            "state": "partial",
            "comp": "Badge"
          },
          {
            "route": "/admin/ai-ops/operator",
            "label": "Operator",
            "type": "List",
            "state": "partial",
            "comp": "Badge"
          }
        ]
      },
      {
        "group": "System administration",
        "icon": "settings",
        "iconBg": "bg-qb-navy",
        "routes": [
          {
            "route": "/admin/system",
            "label": "System",
            "type": "Settings",
            "state": "partial",
            "comp": "StaffDenied"
          },
          {
            "route": "/admin/system/audit",
            "label": "System audit",
            "type": "Settings",
            "state": "partial",
            "comp": "SettingsForm"
          },
          {
            "route": "/admin/system/brand",
            "label": "Brand",
            "type": "Settings",
            "state": "partial",
            "comp": "SettingsForm"
          },
          {
            "route": "/admin/system/documents",
            "label": "Documents",
            "type": "Settings",
            "state": "partial",
            "comp": "DocumentCenterEditor"
          },
          {
            "route": "/admin/system/health",
            "label": "Health",
            "type": "Settings",
            "state": "partial",
            "comp": "HealthPanel"
          },
          {
            "route": "/admin/system/locations",
            "label": "Locations",
            "type": "Settings",
            "state": "partial",
            "comp": "LocationActiveToggle"
          },
          {
            "route": "/admin/system/operations",
            "label": "Operations",
            "type": "Settings",
            "state": "partial",
            "comp": "SettingsForm"
          },
          {
            "route": "/admin/system/organization",
            "label": "Organization",
            "type": "Settings",
            "state": "partial",
            "comp": "SettingsForm"
          },
          {
            "route": "/admin/system/security",
            "label": "Security",
            "type": "Settings",
            "state": "partial",
            "comp": "StatusBadge"
          },
          {
            "route": "/admin/audit",
            "label": "Audit",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/feature-flags",
            "label": "Feature flags",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/overrides",
            "label": "Overrides",
            "type": "List",
            "state": "partial",
            "comp": "inline"
          }
        ]
      },
      {
        "group": "Settings",
        "icon": "tune",
        "iconBg": "bg-qb-green",
        "routes": [
          {
            "route": "/admin/settings",
            "label": "Overview",
            "type": "Settings",
            "state": "partial",
            "comp": "SettingsView",
            "overview": true
          },
          {
            "route": "/admin/settings/backups",
            "label": "Backups",
            "type": "Settings",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/settings/locations",
            "label": "Locations",
            "type": "Settings",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/settings/printing",
            "label": "Printing",
            "type": "Settings",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/settings/shipping",
            "label": "Shipping",
            "type": "Settings",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/settings/users",
            "label": "Users",
            "type": "Settings",
            "state": "partial",
            "comp": "inline"
          },
          {
            "route": "/admin/settings/video",
            "label": "Video",
            "type": "Settings",
            "state": "partial",
            "comp": "inline"
          }
        ]
      }
    ]
  }
};

export interface CreateCategoryItem {
  label: string;
  desc: string;
  icon: string;
}

export interface CreateCategory {
  title: string;
  dot: string;
  items: CreateCategoryItem[];
}

export const CREATE_CATEGORIES: CreateCategory[] = [
  {
    "title": "Customers",
    "dot": "bg-primary",
    "items": [
      {
        "label": "Invoice",
        "desc": "Universal form • 4 tab styles",
        "icon": "receipt_long"
      },
      {
        "label": "Receive Payment",
        "desc": "Apply customer tender & credit",
        "icon": "price_check"
      },
      {
        "label": "Estimate",
        "desc": "B2B commercial bid pipeline",
        "icon": "request_quote"
      },
      {
        "label": "Receipt",
        "desc": "Instant OTC & kiosk settlement",
        "icon": "point_of_sale"
      },
      {
        "label": "Credit",
        "desc": "Customer balance reduction / RMA",
        "icon": "assignment_return"
      },
      {
        "label": "Statement",
        "desc": "Batch billing summary cycle",
        "icon": "summarize"
      },
      {
        "label": "Customer",
        "desc": "Master party profile & credit limit",
        "icon": "person_add"
      }
    ]
  },
  {
    "title": "Expenses",
    "dot": "bg-secondary",
    "items": [
      {
        "label": "Expense",
        "desc": "Direct paid petty cash or credit card",
        "icon": "credit_card"
      },
      {
        "label": "Bill",
        "desc": "Enter vendor invoice payable",
        "icon": "description"
      },
      {
        "label": "Payment",
        "desc": "Batch ACH / wire check disbursement",
        "icon": "outbox"
      },
      {
        "label": "Order",
        "desc": "Blank supplier procurement (PO)",
        "icon": "shopping_bag"
      },
      {
        "label": "Vendor",
        "desc": "Payables party + W-9 auto-invite",
        "icon": "domain_add"
      },
      {
        "label": "Refund",
        "desc": "Supplier refund or merchant reward",
        "icon": "savings"
      }
    ]
  },
  {
    "title": "Banking",
    "dot": "bg-tertiary",
    "items": [
      {
        "label": "Deposit",
        "desc": "Combine funds to primary clearing",
        "icon": "account_balance"
      },
      {
        "label": "Transfer",
        "desc": "Inter-account treasury movements",
        "icon": "swap_horiz"
      },
      {
        "label": "Journal",
        "desc": "Double-entry debit / credit adjustment",
        "icon": "menu_book"
      },
      {
        "label": "Reconcile",
        "desc": "Plaid feed & statement tie-out",
        "icon": "fact_check"
      },
      {
        "label": "Recurring",
        "desc": "Scheduled automated transaction",
        "icon": "event_repeat"
      },
      {
        "label": "Settlement",
        "desc": "Stripe / Shopify net payout split",
        "icon": "assured_workload"
      }
    ]
  },
  {
    "title": "Catalog",
    "dot": "bg-primary",
    "items": [
      {
        "label": "Product",
        "desc": "Launch item in Konva visual studio",
        "icon": "checkroom"
      },
      {
        "label": "Design",
        "desc": "Vector canvas & print placement",
        "icon": "palette"
      },
      {
        "label": "Banner",
        "desc": "Storefront slot placement & CTA",
        "icon": "view_carousel"
      },
      {
        "label": "Campaign",
        "desc": "Meta, TikTok & Google Ads launch",
        "icon": "campaign"
      },
      {
        "label": "Ticket",
        "desc": "Care escalation & order replacement",
        "icon": "headset_mic"
      },
      {
        "label": "Post",
        "desc": "Multi-channel scheduled content",
        "icon": "share"
      }
    ]
  }
];

export interface HubPillar {
  key: DomainKey;
  num: string;
  label: string;
  tag: string;
  tagCls: string;
  blurb: string;
  iconBg: string;
  icon: string;
}

export const HUB_PILLARS: HubPillar[] = [
  {
    "key": "dashboard",
    "num": "1",
    "label": "Dashboard",
    "tag": "Core",
    "tagCls": "bg-primary/10 text-primary",
    "blurb": "Operations control tower, vital KPI monitoring, and triage queue.",
    "iconBg": "bg-primary/10 text-primary",
    "icon": "dashboard"
  },
  {
    "key": "marketing",
    "num": "2",
    "label": "Marketing",
    "tag": "Growth",
    "tagCls": "bg-secondary/15 text-secondary",
    "blurb": "Content pipelines, storefront banners, creative popups, and ad channels.",
    "iconBg": "bg-secondary/10 text-secondary",
    "icon": "campaign"
  },
  {
    "key": "catalog",
    "num": "3",
    "label": "Catalog",
    "tag": "Studio",
    "tagCls": "bg-primary/10 text-primary",
    "blurb": "Design engines, canvas launchers, blank supplier inventory, variants.",
    "iconBg": "bg-primary-container/20 text-primary",
    "icon": "inventory_2"
  },
  {
    "key": "orders",
    "num": "4",
    "label": "Orders",
    "tag": "Routing",
    "tagCls": "bg-tertiary/15 text-tertiary",
    "blurb": "Fulfillment pipelines, routing rules, batch slips, automated shipping labels.",
    "iconBg": "bg-tertiary/10 text-tertiary",
    "icon": "local_shipping"
  },
  {
    "key": "finance",
    "num": "5",
    "label": "Finance",
    "tag": "Fiscal",
    "tagCls": "bg-primary/10 text-primary",
    "blurb": "General ledger, double-entry books, chart of accounts, automated tax feeds.",
    "iconBg": "bg-primary/10 text-primary",
    "icon": "account_balance"
  },
  {
    "key": "contacts",
    "num": "6",
    "label": "Contacts",
    "tag": "CRM",
    "tagCls": "bg-secondary-container/40 text-on-secondary-fixed-variant",
    "blurb": "Customer registry, dynamic segmentation, lifetime value, wholesale clients.",
    "iconBg": "bg-secondary-container/30 text-secondary",
    "icon": "groups"
  },
  {
    "key": "support",
    "num": "7",
    "label": "Support",
    "tag": "Help Desk",
    "tagCls": "bg-tertiary/15 text-tertiary",
    "blurb": "Unified inbox, ticket routing, macros, SLA compliance, trust & safety.",
    "iconBg": "bg-tertiary-container/20 text-tertiary",
    "icon": "support_agent"
  }
];
