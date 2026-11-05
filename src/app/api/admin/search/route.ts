// ---------------------------------------------------------------------------
// /api/admin/search/route.ts
//
// Global admin search — queries across customers, invoices, payments,
// messages, documents, orders, products, and sellers.
// Orders/products/sellers complete the §2.4 search contract (search by
// seller, SKU, product name, or buyer): buyers resolve through customers
// and through commerce_orders.customer_email; products and sellers are
// searchable here and in depth on the Inventory surface.
//
// There is NO appointments type: this database has no appointments
// entity at all (no public.crm_appointments, no bookings table — the
// same phantom the invoices/payments joins died on). The type was
// removed from the fan-out 2026-11-02; adminList masks a missing
// table as an honest empty, so it never errored — it just searched
// a table that does not exist.
//
// GET ?q=query&type=customers|invoices|payments|messages|documents|orders|products|sellers|all
// Returns: { data: [...], type, total }
//
// Uses adminList from @/lib/admin-api — missing tables return honest empty.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { adminList, resolveTenantId} from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEARCH_CONFIG: Record<
  string,
  { table: string; searchCols: string[]; order: string }
> = {
  customers: {
    table: "crm_customers",
    searchCols: ["first_name", "last_name", "email", "phone"],
    order: "created_at.desc",
  },
  // Column names verified against the live schema. The previous config
  // searched columns that don't exist (crm_appointments.customer_name /
  // pet_name / service_name / notes, acct_ar_receipts.customer_name, …) —
  // PostgREST errors the whole type query on one bad column, the fan-out
  // catch swallowed it, and five of seven entity types silently returned
  // nothing, forever.
  //   invoices → the single invoice record (public.acct_ar_invoices)
  //   payments → commerce_payments (acct_ar_receipts holds 0 rows and has
  //              no customer name/email columns at all)
  invoices: {
    table: "acct_ar_invoices",
    searchCols: ["invoice_number", "external_id"],
    order: "created_at.desc",
  },
  payments: {
    table: "commerce_payments",
    searchCols: ["payment_number", "processor_transaction_id", "external_reference"],
    order: "created_at.desc",
  },
  messages: {
    table: "crm_messages",
    searchCols: ["subject", "body", "from_address", "to_address"],
    order: "created_at.desc",
  },
  documents: {
    table: "crm_documents",
    searchCols: ["name"],
    order: "created_at.desc",
  },
  // §2.4 search contract — by seller, product, or buyer. Buyers are found
  // by the email on their orders (guest checkout writes customer_email;
  // the account email lands in `email`); commerce_orders has no order
  // number column, so tracking + processor ids are the other handles.
  orders: {
    table: "commerce_orders",
    searchCols: ["customer_email", "email", "tracking_number", "stripe_payment_intent_id", "stripe_checkout_id"],
    order: "created_at.desc",
  },
  // The tenant's own products live on public.products (name/title/
  // brand, tenant-scoped) — erp_products, this type's previous target,
  // holds 0 rows, so product search could never return the store's
  // actual products. Retargeted 2026-11-02. SKU text lives on
  // erp_product_skus and seller_listings.sku — those are searched in
  // depth on the Inventory surface (/api/admin/inventory), which joins.
  products: {
    table: "products",
    searchCols: ["name", "title", "brand"],
    order: "created_at.desc",
  },
  sellers: {
    table: "sellers",
    searchCols: ["display_name", "email"],
    order: "created_at.desc",
  },
};

export async function GET(req: NextRequest) {
  // Module gate — this route previously had NONE while every sibling
  // admin route gates. The dashboard-family contract is analytics/read
  // (same gate as /api/admin/dashboard, /kpis, /widgets): global search
  // is a dashboard surface, and it fans out over customers, invoices,
  // payments and messages — it must not answer unauthenticated or
  // ungranted callers.
  const gate = await requireModuleApi("analytics", "read");
  if (gate) return gate;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const type = (searchParams.get("type") || "all").toLowerCase();
  const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10) || 10, 50);

  if (!q) {
    return NextResponse.json({ data: [], type, total: 0 });
  }

  // Single type search
  if (type !== "all" && SEARCH_CONFIG[type]) {
    const cfg = SEARCH_CONFIG[type];
    const res = await adminList(cfg.table, { preGated: true, tenantId: resolveTenantId(req), 
      search: q,
      searchCols: cfg.searchCols,
      limit,
      order: cfg.order,
    });
    const j = await res.json();
    return NextResponse.json({ ...j, type });
  }

  // All types — fan out in parallel
  const types = Object.keys(SEARCH_CONFIG);
  const results = await Promise.all(
    types.map(async (t) => {
      const cfg = SEARCH_CONFIG[t];
      try {
        const res = await adminList(cfg.table, { preGated: true, tenantId: resolveTenantId(req), 
          search: q,
          searchCols: cfg.searchCols,
          limit: 5,
          order: cfg.order,
        });
        const j = await res.json();
        return { type: t, data: j.data || [], total: j.total || 0 };
      } catch {
        return { type: t, data: [], total: 0 };
      }
    }),
  );

  const total = results.reduce((sum, r) => sum + r.total, 0);
  return NextResponse.json({ results, type: "all", total });
}
