// ---------------------------------------------------------------------------
// Repository — Supabase ONLY.
//   All reads/writes go to Supabase (Postgres via the PostgREST API +
//   Storage for uploads). All 47 tables live in Supabase. There is no
//   local fallback backend.
//   If the Supabase env keys are not set yet, reads return empty results
//   (so the site renders) and writes fail with a clear error telling you
//   to set the keys in .env.
// ---------------------------------------------------------------------------

import { cached, invalidate as invalidateCache } from "@/lib/cache"
import { resolveTenantId } from "@/lib/tenant-id";

export type Row = Record<string, any>

export type CmsResource =
  | "services" | "commerce_products" | "gallery" | "packages" | "addons"
  | "faqs" | "policies" | "testimonials" | "consultations" | "messages"
  | "commerce_orders" | "commerce_order_items" | "commerce_coupons" | "commerce_promotions" | "commerce_brands"
  | "orders" | "order_items" | "products"
  | "customers" | "dogs" | "activity_log" | "dog_breeds"
  | "staff" | "haircut_styles"
  | "coat_types" | "coat_textures" | "coat_lengths" | "coat_conditions" | "shedding_levels"
  | "clip_lengths" | "body_styles" | "leg_styles" | "face_styles" | "head_styles"
  | "ear_styles" | "tail_styles" | "feet_styles"
  | "sanitary_options" | "nail_services" | "paw_pad_services" | "ear_services"
  | "teeth_services" | "deshedding_services" | "coat_techniques"
  | "dog_grooming_profiles" | "appointment_grooming_requests"
  | "blocked_times" | "availability" | "service_pricing"
  | "invoices" | "invoice_items" | "email_messages" | "communications"
  | "customer_notifications"
  | "product_reviews"
  | "pet_product_categories" | "pet_product_filters" | "pet_product_filter_values" | "pet_category_filters"
  | "serviceItems"
  | "crm_customers" | "commerce_payments" | "commerce_sales" | "commerce_receipts"
  | "acct_ar_receipts" | "commerce_payment_methods"

const TABLE: Record<CmsResource, string> = {
  services: "services",
  commerce_products: "commerce_products",
  gallery: "gallery_photos",
  packages: "pricing_packages",
  addons: "add_ons",
  faqs: "faqs",
  policies: "policies",
  testimonials: "testimonials",
  consultations: "consultations",
  messages: "contact_messages",
  commerce_orders: "commerce_orders",
  commerce_order_items: "commerce_order_items",
  commerce_coupons: "commerce_coupons",
  commerce_promotions: "commerce_promotions",
  commerce_brands: "commerce_brands",
  orders: "orders",
  order_items: "order_items",
  products: "commerce_products",
  customers: "customers",
  dogs: "dogs",
  activity_log: "activity_log",
  dog_breeds: "dog_breeds",
  staff: "staff",
  haircut_styles: "haircut_styles",
  coat_types: "coat_types", coat_textures: "coat_textures", coat_lengths: "coat_lengths",
  coat_conditions: "coat_conditions", shedding_levels: "shedding_levels", clip_lengths: "clip_lengths",
  body_styles: "body_styles", leg_styles: "leg_styles", face_styles: "face_styles",
  head_styles: "head_styles", ear_styles: "ear_styles", tail_styles: "tail_styles",
  feet_styles: "feet_styles", sanitary_options: "sanitary_options", nail_services: "nail_services",
  paw_pad_services: "paw_pad_services", ear_services: "ear_services", teeth_services: "teeth_services",
  deshedding_services: "deshedding_services", coat_techniques: "coat_techniques",
  dog_grooming_profiles: "dog_grooming_profiles",
  appointment_grooming_requests: "appointment_grooming_requests",
  blocked_times: "blocked_times",
  availability: "availability",
  service_pricing: "service_pricing",
  // Invoice resources resolve to the single invoice record — the
  // enterprise AR tables (the duplicate storefront invoices/invoice_items
  // tables were consolidated into them and dropped, 2026-10-13).
  invoices: "acct_ar_invoices",
  invoice_items: "acct_ar_invoice_lines",
  email_messages: "email_messages",
  customer_notifications: "customer_notifications",
  communications: "communications",
  product_reviews: "product_reviews",
  pet_product_categories: "pet_product_categories",
  pet_product_filters: "pet_product_filters",
  pet_product_filter_values: "pet_product_filter_values",
  pet_category_filters: "pet_category_filters",
  serviceItems: "service_items",
  crm_customers: "crm_customers",
  commerce_payments: "commerce_payments",
  commerce_sales: "commerce_sales",
  commerce_receipts: "commerce_receipts",
  acct_ar_receipts: "acct_ar_receipts",
  commerce_payment_methods: "commerce_payment_methods",
}

// Explicit PostgREST order overrides for tables that have no createdAt column.
// NOTE: the live Supabase tables use snake_case created_at — the repo's
// default `createdAt.desc` would 400 against these. Each snake_case table
// needs an explicit override here.
const CUSTOM_ORDER: Partial<Record<CmsResource, string>> = {
  // Invoice resources now resolve to the enterprise AR tables
  // (snake_case created_at; lines have no created_at — order by line_no).
  invoices: "created_at.desc",
  invoice_items: "line_no.asc",
  commerce_products: "sort_order.asc",
  commerce_orders: "created_at.desc",
  commerce_order_items: "created_at.asc",
  // commerce_coupons / commerce_promotions have NO created_at — order by
  // their unique code so the list is deterministic.
  commerce_coupons: "code.asc",
  commerce_promotions: "code.asc",
  pet_product_categories: "id.asc",
  pet_product_filters: "display_order.asc,id.asc",
  pet_product_filter_values: "display_order.asc,id.asc",
  pet_category_filters: "display_order.asc",
  commerce_brands: "sort_order.asc,name.asc",
  // Customer receipts feed — snake_case tables; acct_ar_receipts and
  // commerce_receipts have no created_at, order by their own date columns.
  crm_customers: "created_at.desc",
  commerce_payments: "created_at.desc",
  commerce_sales: "created_at.desc",
  commerce_receipts: "issued_at.desc",
  acct_ar_receipts: "receipt_date.desc",
  commerce_payment_methods: "name.asc",
  // Legacy camelCase tables — order by their actual camelCase column.
  orders: '"createdAt".desc',
  order_items: '"createdAt".asc',
  product_reviews: '"createdAt".desc',
  products: "sort_order.asc",
}

const ORDERED = new Set<CmsResource>([
  "services", "gallery", "packages", "addons", "faqs", "policies", "testimonials", "serviceItems",
])

// Use NEXT_PUBLIC_ vars (available on both server and client) with fallback
// to the non-public versions for backwards compatibility.
// Values straight from .env.example (e.g. "https://your-project.supabase.co",
// "your-service-role-key") are treated as unconfigured placeholders.
const isPlaceholder = (v: string | undefined) =>
  !v || v.startsWith("your-") || v.includes("your-project") || v.startsWith("sk_live_or_test")
const SB_URL = isPlaceholder(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)
  ? undefined
  : (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.replace(/\/$/, "")
const SB_KEY = isPlaceholder(process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? undefined
  : process.env.SUPABASE_SERVICE_ROLE_KEY
export const supabaseReady = !!(SB_URL && SB_KEY)
export const supabaseConfig = { url: SB_URL, key: SB_KEY }

/** Escape a literal value for a PostgREST ilike pattern (same convention as
 *  /api/account's ilikeLiteral): backslash-escape the LIKE wildcards, then
 *  URI-encode. An escaped ilike with no wildcards is a case-insensitive
 *  exact match — the query-level form of the old JS `toLowerCase()` compare. */
export function ilikeLiteral(value: string): string {
  return encodeURIComponent(value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_"))
}

const NOT_CONFIGURED = new Error(
  "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env, then restart the dev server.",
)

// BL-13 (twin-store consolidation): the "policies" resource reads/writes
// the ONE policy store — public.seller_policies (published rows) — never
// public.policies and no longer the doc store's policy content-type.
// Rows are mapped back to the legacy policy shape
// ({id,title,body,"order",createdAt,updatedAt}) callers already consume;
// seller_policies has no sort column, so "order" maps null and lists
// order by title.
function mapSellerPolicyRow(r: Row): Row {
  return {
    id: r.id, title: r.title, body: r.body ?? null,
    order: null, slug: r.slug, status: r.status,
    createdAt: r.created_at ?? null, updatedAt: r.updated_at ?? null,
    tenant_id: r.tenant_id,
  }
}
const SELLER_POLICY_SELECT = "id,tenant_id,title,slug,body,status,created_at,updated_at"

// ---- Supabase REST helper ----
async function sb<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  if (!SB_URL || !SB_KEY) throw NOT_CONFIGURED
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  })
  if (!res.ok) {
    const t = await res.text().catch(() => res.statusText)
    throw new Error(`Supabase ${res.status}: ${t}`)
  }
  if (res.status === 204) return null as T
  const txt = await res.text()
  return (txt ? JSON.parse(txt) : null) as T
}

// ---- Shared shape ----
export type Repo = {
  list(resource: CmsResource): Promise<Row[]>
  listWhere(resource: CmsResource, query: string): Promise<Row[]>
  get(resource: CmsResource, id: string): Promise<Row | null>
  create(resource: CmsResource, data: Row): Promise<Row>
  update(resource: CmsResource, id: string, data: Row): Promise<Row>
  remove(resource: CmsResource, id: string): Promise<{ ok: boolean }>
  stats(): Promise<any>
  getSettings(tenantId?: string): Promise<Record<string, string>>
  saveSettings(obj: Record<string, string>, tenantId?: string): Promise<void>
  addNewsletter(email: string): Promise<Row>
  listNewsletter(): Promise<Row[]>
}

// ---- Chrome read cache -----------------------------------------------------
// The site chrome fetches settings/testimonials/services on EVERY page view;
// each PostgREST call is a REMOTE HTTPS round trip (~300-800ms cold) — that
// was the 1s API responses in the logs. Public-facing reads now cache 60s in
// process; every write to a resource (admin edit, settings save) invalidates
// that resource's cache so the admin sees their own change immediately.
const READ_CACHE_TTL_MS = 60 * 1000
const CACHEABLE_LISTS = new Set<CmsResource>([
  "services", "gallery", "packages", "addons", "faqs", "policies",
  "testimonials", "serviceItems", "haircut_styles",
  // The legacy PDP fallback lists the WHOLE review table on every product
  // view — remote round trip per view. Cache 60s; writes invalidate.
  "product_reviews",
])
/** Drop a cms:* cache key (list or settings) after a write lands. */
function invalidateCms(prefix: string): void {
  invalidateCache(prefix)
}

// ===========================================================================
// Supabase implementation (PostgREST via fetch) — the only backend
// ===========================================================================
export const repo: Repo = {
  async list(r) {
    if (!supabaseReady) return []
    if (r === "policies") {
      const fetchPolicies = async () => {
        try {
          const rows = await sb<Row[]>(`seller_policies?select=${SELLER_POLICY_SELECT}&status=eq.published&order=title.asc`)
          return (rows || []).map(mapSellerPolicyRow)
        } catch (e) {
          console.error("[repo] list failed for policies (seller_policies):", e instanceof Error ? e.message : String(e))
          return []
        }
      }
      return cached(`cms:list:policies`, READ_CACHE_TTL_MS, fetchPolicies)
    }
    const t = TABLE[r]
    const order = CUSTOM_ORDER[r] ?? (ORDERED.has(r) ? "order.asc" : "createdAt.desc")
    const fetchRows = async () => {
      try {
        return (await sb<Row[]>(`${t}?order=${order}`)) || []
      } catch (e) {
        console.error(`[repo] list failed for ${r}:`, e instanceof Error ? e.message : String(e))
        return []
      }
    }
    // Chrome/public lists render per page view — 60s TTL, invalidated on write.
    if (CACHEABLE_LISTS.has(r)) return cached(`cms:list:${r}`, READ_CACHE_TTL_MS, fetchRows)
    return fetchRows()
  },
  // Scoped list: the caller supplies PostgREST filter predicates (tenant +
  // identity) that become WHERE clauses in the database query itself —
  // e.g. listWhere("commerce_orders", "tenant_id=eq.<t>&or=(email.ilike.<e>)").
  // Customer-facing routes MUST use this (never the unscoped list above):
  // an unfiltered full-table fetch must never leave the data layer on a
  // customer path. Scoped results are never cached. The resource's standard
  // order is appended unless the query already carries one.
  async listWhere(r, query) {
    if (!supabaseReady) return []
    const t = TABLE[r]
    const order = CUSTOM_ORDER[r] ?? (ORDERED.has(r) ? "order.asc" : "createdAt.desc")
    const qs = query.includes("order=") ? query : `${query}${query ? "&" : ""}order=${order}`
    try {
      return (await sb<Row[]>(`${t}?${qs}`)) || []
    } catch (e) {
      console.error(`[repo] listWhere failed for ${r}:`, e instanceof Error ? e.message : String(e))
      return []
    }
  },
  async get(r, id) {
    if (!supabaseReady) return null
    if (r === "policies") {
      const rows = await sb<Row[]>(`seller_policies?select=${SELLER_POLICY_SELECT}&id=eq.${encodeURIComponent(id)}&limit=1`)
      return rows && rows[0] ? mapSellerPolicyRow(rows[0]) : null
    }
    const t = TABLE[r]
    const rows = await sb<Row[]>(`${t}?id=eq.${encodeURIComponent(id)}&limit=1`)
    return (rows && rows[0]) || null
  },
  async create(r, data) {
    invalidateCms(`cms:list:${r}`)
    invalidateCms("cms:settings")
    if (r === "policies") {
      const title = String(data.title || "").trim()
      const slug = title.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120)
      const rows = await sb<Row[]>("seller_policies", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ tenant_id: TENANT_ID, title, slug, layer: "Policy", category: "Site policy", status: "published", body: data.body ?? null, current_version: 1 }),
      })
      return rows && rows[0] ? mapSellerPolicyRow(rows[0]) : data
    }
    const t = TABLE[r]
    const rows = await sb<Row[]>(t, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(stripNulls(data)),
    })
    return (rows && rows[0]) || data
  },
  async update(r, id, data) {
    invalidateCms(`cms:list:${r}`)
    invalidateCms("cms:settings")
    if (r === "policies") {
      const patch: Row = {}
      if (data.title !== undefined) patch.title = data.title
      if (data.body !== undefined) patch.body = data.body
      if (data.title !== undefined) patch.slug = String(data.title).toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120)
      const rows = await sb<Row[]>(`seller_policies?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(patch),
      })
      return rows && rows[0] ? mapSellerPolicyRow(rows[0]) : data
    }
    const t = TABLE[r]
    const rows = await sb<Row[]>(`${t}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(stripNulls(data)),
    })
    return (rows && rows[0]) || data
  },
  async remove(r, id) {
    invalidateCms(`cms:list:${r}`)
    invalidateCms("cms:settings")
    if (r === "policies") {
      await sb(`seller_policies?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status: "archived" }),
      })
      return { ok: true }
    }
    const t = TABLE[r]
    await sb(`${t}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" })
    return { ok: true }
  },
  async stats() {
    if (!supabaseReady) {
      return {
        counts: {}, pendingBookings: 0, unreadMessages: 0, pendingConsultations: 0,
        recentBookings: [], recentMessages: [],
      }
    }
    // seller_policies, bookings and consultations do not exist in
    // this schema — fetching them made sb() throw and stats() fail
    // outright. Their counts report 0 (removed 2026-11-02).
    const [services, commerceProducts, gallery, packages, addons, faqs,
      testimonials, messages, newsletter] = await Promise.all([
      sb<Row[]>("services?select=id"), sb<Row[]>("commerce_products?select=id"),
      sb<Row[]>("gallery_photos?select=id"), sb<Row[]>("pricing_packages?select=id"),
      sb<Row[]>("add_ons?select=id"), sb<Row[]>("faqs?select=id"),
      sb<Row[]>("testimonials?select=id"),
      sb<Row[]>("contact_messages?select=*&order=createdAt.desc&limit=50"),
      sb<Row[]>("newsletter?select=id"),
    ])
    const arr = (x: Row[] | null) => x || []
    const b: Row[] = [], m = arr(messages)
    return {
      counts: {
        services: arr(services).length, products: arr(commerceProducts).length,
        gallery: arr(gallery).length, packages: arr(packages).length,
        addons: arr(addons).length, faqs: arr(faqs).length, policies: 0,
        testimonials: arr(testimonials).length, bookings: 0,
        consultations: 0, messages: m.length, newsletter: arr(newsletter).length,
      },
      pendingBookings: 0,
      unreadMessages: m.filter((x) => x.status === "UNREAD").length,
      pendingConsultations: 0,
      recentBookings: b.slice(0, 5),
      recentMessages: m.slice(0, 5),
    }
  },
  async getSettings(tenantId?: string) {
    if (!supabaseReady) return {}
    // Site settings live in the owner's cms_global_content table
    // (content_group general/contact/social/hours/footer). No parallel
    // key-value table exists anymore. Cached 60s — the chrome reads this on
    // every page; invalidated on saveSettings.
    // S5: an optional tenant id binds the read to that tenant (the public
    // site resolves it from the request host). When omitted the behavior
    // is exactly the historical one — the TENANT_ID constant and the flat
    // "cms:settings" cache key. A tenant-scoped read caches under its own
    // key so it can never serve another tenant's settings.
    const cacheKey = tenantId ? `cms:settings:${tenantId}` : "cms:settings"
    return cached(cacheKey, READ_CACHE_TTL_MS, async () => {
      const rows = await sb<Row[]>(`cms_global_content?select=content_key,value_text&tenant_id=eq.${tenantId || TENANT_ID}&locale=eq.en-US`)
      const obj: Record<string, string> = {}
      for (const r of rows || []) obj[r.content_key] = r.value_text ?? ""
      return obj
    })
  },
  async saveSettings(obj, tenantId?: string) {
    for (const [key, value] of Object.entries(obj)) {
      await sb("cms_global_content", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({
          tenant_id: tenantId || TENANT_ID,
          locale: "en-US",
          content_key: key,
          label: prettifyKey(key),
          value_text: String(value),
          content_group: contentGroupFor(key),
        }),
      })
    }
    invalidateCms(tenantId ? `cms:settings:${tenantId}` : "cms:settings")
  },
  async addNewsletter(email) {
    const rows = await sb<Row[]>("newsletter", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ email }),
    })
    return (rows && rows[0]) || { email }
  },
  async listNewsletter() {
    if (!supabaseReady) return []
    const rows = await sb<Row[]>("newsletter?order=createdAt.desc")
    return rows || []
  },
}

function stripNulls(data: Row): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) out[k] = v === null ? undefined : v
  }
  return out
}

// ---- site settings helpers (cms_global_content) ----
const TENANT_ID = resolveTenantId()

function contentGroupFor(key: string): string {
  if (["phone", "email", "addressLine1", "addressLine2", "address", "city", "state", "postalCode"].includes(key)) return "contact"
  if (["facebook", "instagram", "twitter", "youtube", "tiktok"].includes(key)) return "social"
  if (/^hours/i.test(key)) return "hours"
  if (/^footer/i.test(key)) return "footer"
  return "general"
}

function prettifyKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
}

// ---- backend status ----
// The only backend is Supabase. `usingSupabase()` reports whether the env
// keys are present. Reads before keys are set return empty data; writes
// throw the NOT_CONFIGURED error above.
export async function getBackend() {
  return "supabase" as const
}
export async function usingSupabase() {
  return supabaseReady
}
