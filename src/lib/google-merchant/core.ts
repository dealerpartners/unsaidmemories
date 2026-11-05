// ---------------------------------------------------------------------------
// Google Merchant API v1 product sync — PURE decision core (no DB,
// no Next runtime). The client (client.ts), the sync engine
// (sync.ts), the cron route, and the admin status surface are all
// built from these functions; scripts/google-merchant.test.mjs
// drives them directly.
//
// What lives here:
//   - the Merchant API v1 bases, the content scope (minted through
//     the ONE Google credential gate in lib/google-indexing), and
//     the seeded account / data-source ids
//   - the offerId rule: the catalog slug, capped at the API's
//     50-char limit — longer slugs become slug[0:38] + "-" +
//     sha256(slug).hex[0:8] (47 chars), deterministic, so the
//     product the coordinator proved the insert path with
//     (wondercide-dog-flea-tick-peppermint-co-00d9faab) is ADOPTED
//     by the first run as an update of the same product input,
//     never duplicated under a second id
//   - the catalog-item -> ProductInput mapping (the proven v1
//     shape: productAttributes with title / description / link /
//     imageLink / additionalImageLinks / availability / price /
//     condition / brand / itemGroupId)
//   - the content hash over the pushed attributes (the incremental
//     sync's change signal) and the sync plan: hash differs or
//     never pushed -> insert/update; departed from the catalog ->
//     delete; unchanged -> skip
//
// The catalog items are the Google Shopping feed's own item set
// (lib/shop/google-feed.ts getGoogleFeedItems — the platform's ONE
// sellable definition); this module maps them, it does not query.
//
// Credential VALUES never appear here — the gate in
// lib/google-indexing/client.ts resolves them and the client hands
// parsed API responses in.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto"

// ---------------------------------------------------------------------------
// Bases, scope, seeded ids
// ---------------------------------------------------------------------------

export const MERCHANT_API_BASE = "https://merchantapi.googleapis.com"
export const MERCHANT_PRODUCTS_API_BASE = `${MERCHANT_API_BASE}/products/v1`
export const MERCHANT_ACCOUNTS_API_BASE = `${MERCHANT_API_BASE}/accounts/v1`

/** The OAuth scope for Merchant API product writes, minted through
 *  the shared gate (getGoogleAccessTokenForScopes). */
export const GOOGLE_MERCHANT_CONTENT_SCOPE = "https://www.googleapis.com/auth/content"

// The platform's own Merchant Center identifiers (supplied by the
// owner, verified live 2026-10-25). IDENTIFIERS, not credentials.
// The API data source is the API-input primary source created for
// this sync — inserts into the pre-existing FILE data source are
// rejected by Google ("must have an API input type"), and the XML
// feed flow on that source stays untouched. Runtime precedence:
// app_settings (google.merchant_account_id /
// google.merchant_data_source_id, seeded by migration record
// 20261200) → these constants.
export const KNOWN_MERCHANT_ACCOUNT_ID = "5879428613"
export const KNOWN_MERCHANT_DATA_SOURCE_ID = "10786941263"

export const MERCHANT_CONTENT_LANGUAGE = "en"
export const MERCHANT_FEED_LABEL = "US"

// ---------------------------------------------------------------------------
// The offerId rule
// ---------------------------------------------------------------------------

export const OFFER_ID_MAX_LENGTH = 50

/** offerId for a catalog slug. Slugs up to the API's 50-char limit
 *  pass through unchanged (they are the feed's <g:id> — one product,
 *  one id, across both submission paths). Longer slugs are capped
 *  deterministically at 47 chars: the first 38 of the slug, a dash,
 *  and the first 8 hex chars of the slug's sha256 — collision-safe
 *  in practice and stable across runs, so re-pushes update the same
 *  product input instead of creating a new one. */
export function merchantOfferId(slug: string): string {
  const s = String(slug || "")
  if (s.length <= OFFER_ID_MAX_LENGTH) return s
  const digest = createHash("sha256").update(s, "utf8").digest("hex").slice(0, 8)
  return `${s.slice(0, 38)}-${digest}`
}

/** The itemGroupId for a variant family: the family key itself when
 *  it fits the same 50-char cap, else the same hashed truncation.
 *  Null when there is no family or the family has a single member
 *  in the pushed set — a lone product is not a group. */
export function merchantItemGroupId(familyKey: string | null, memberCount: number): string | null {
  const key = String(familyKey ?? "").trim()
  if (!key || memberCount < 2) return null
  return merchantOfferId(key)
}

// ---------------------------------------------------------------------------
// Catalog item -> Merchant API v1 ProductInput
// ---------------------------------------------------------------------------

/** The catalog shape this module maps — structurally the feed's
 *  GoogleFeedItem (lib/shop/google-feed.ts), declared here so the
 *  pure core stays importable without the Next runtime. */
export type MerchantCatalogItem = {
  id: string
  slug: string
  name: string
  brand: string | null
  description: string | null
  shortDescription: string | null
  price: number
  inStock: boolean
  /** The variant's live count, when the catalog holds one (the CJ
   *  inventory sync's stock_quantity). Pushed as the product's
   *  quantity custom attribute — Merchant Center requires the count
   *  on every product; its absence is what kept the catalog from
   *  publishing. Null = no count recorded yet = attribute omitted. */
  stockQuantity?: number | null
  image: string | null
  additionalImages?: string[] | null
  familyKey?: string | null
}

export type MerchantPrice = { amountMicros: string; currencyCode: string }

export type MerchantProductAttributes = {
  title: string
  description: string
  link: string
  imageLink?: string
  additionalImageLinks?: string[]
  availability: "in_stock" | "out_of_stock"
  price: MerchantPrice
  condition: string
  brand?: string
  itemGroupId?: string
  /** Generic-form attributes (the API's sanctioned way to submit a
   *  data-spec attribute with no dedicated field). Carries the
   *  product's quantity count. */
  customAttributes?: { name: string; value: string }[]
}

export type MerchantProductInput = {
  offerId: string
  contentLanguage: string
  feedLabel: string
  productAttributes: MerchantProductAttributes
}

/** A mapped product, ready for the sync plan: the wire payload plus
 *  the ledger identity (offerId / catalog item id) and the content
 *  hash over exactly what will be pushed. */
export type MappedMerchantProduct = {
  catalogItemId: string
  offerId: string
  input: MerchantProductInput
  contentHash: string
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

/** Dollars -> the API's micros string (1 USD = 1,000,000 micros),
 *  rounded to the nearest micro. Non-finite / negative prices clamp
 *  to 0 — the feed's sellable set already guarantees price > 0, so
 *  a clamp here is a guard, never the norm. */
export function priceToMicros(price: number): string {
  const n = Number(price)
  if (!Number.isFinite(n) || n < 0) return "0"
  return String(Math.round(n * 1_000_000))
}

export function availabilityFor(inStock: boolean): "in_stock" | "out_of_stock" {
  return inStock ? "in_stock" : "out_of_stock"
}

/** Family sizes across a mapped set: familyKey -> how many pushed
 *  items carry it. itemGroupId is assigned from this — a family of
 *  one gets no group id. */
export function familyMemberCounts(
  items: readonly Pick<MerchantCatalogItem, "familyKey">[],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = String(item.familyKey ?? "").trim()
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/** Map one catalog item to its Merchant API v1 product input.
 *  Mirrors the feed's own presentation rules: title capped at 150,
 *  description = the real description (HTML stripped) falling back
 *  to the short description, then the name, capped at 5000; the
 *  canonical product URL is the item's own www address. */
export function catalogItemToProductInput(
  item: MerchantCatalogItem,
  opts: { siteBase: string; itemGroupId?: string | null },
): MerchantProductInput {
  const description =
    stripHtml(item.description || item.shortDescription || item.name).slice(0, 5000) ||
    item.name.slice(0, 5000)
  const attributes: MerchantProductAttributes = {
    title: item.name.slice(0, 150),
    description,
    link: `${String(opts.siteBase).replace(/\/$/, "")}/products/${item.slug}`,
    availability: availabilityFor(item.inStock),
    price: { amountMicros: priceToMicros(item.price), currencyCode: "USD" },
    condition: "new",
  }
  if (item.image) attributes.imageLink = item.image
  const extras: string[] = []
  for (const url of item.additionalImages ?? []) {
    const u = String(url || "").trim()
    if (u && u !== item.image && !extras.includes(u)) extras.push(u)
    if (extras.length >= 10) break
  }
  if (extras.length > 0) attributes.additionalImageLinks = extras
  const brand = String(item.brand ?? "").trim()
  if (brand) attributes.brand = brand
  if (opts.itemGroupId) attributes.itemGroupId = opts.itemGroupId
  // The count. Included in the content hash (the hash covers the whole
  // input), so a count change alone re-pushes the product on the next
  // incremental run — Google's standing "update your products" ask is
  // answered by the number itself moving.
  if (item.stockQuantity != null && Number.isFinite(Number(item.stockQuantity))) {
    attributes.customAttributes = [
      { name: "quantity", value: String(Math.max(0, Math.trunc(Number(item.stockQuantity)))) },
    ]
  }
  return {
    offerId: merchantOfferId(item.slug),
    contentLanguage: MERCHANT_CONTENT_LANGUAGE,
    feedLabel: MERCHANT_FEED_LABEL,
    productAttributes: attributes,
  }
}

// ---------------------------------------------------------------------------
// Content hash — the incremental sync's change signal. sha256 over
// a canonical JSON rendering (object keys sorted recursively), so
// the hash moves exactly when a pushed attribute moves.
// ---------------------------------------------------------------------------

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`
}

export function productInputContentHash(input: MerchantProductInput): string {
  return createHash("sha256").update(stableStringify(input), "utf8").digest("hex")
}

/** Map + hash a whole catalog set, assigning family group ids from
 *  the set's own family counts. Order preserved. */
export function mapCatalogItems(
  items: readonly MerchantCatalogItem[],
  opts: { siteBase: string },
): MappedMerchantProduct[] {
  const counts = familyMemberCounts(items)
  return items.map((item) => {
    const groupId = merchantItemGroupId(
      item.familyKey ?? null,
      counts.get(String(item.familyKey ?? "").trim()) ?? 0,
    )
    const input = catalogItemToProductInput(item, { siteBase: opts.siteBase, itemGroupId: groupId })
    return {
      catalogItemId: String(item.id),
      offerId: input.offerId,
      input,
      contentHash: productInputContentHash(input),
    }
  })
}

// ---------------------------------------------------------------------------
// API response parsers
// ---------------------------------------------------------------------------

export type ParsedProductInputResult = {
  /** The productInput resource name (accounts/{a}/productInputs/{offerId}). */
  name: string | null
  /** The processed product resource name, when the response carries it. */
  productName: string | null
}

/** productInputs:insert response -> the names the ledger records.
 *  Tolerant by design: the insert's success is the HTTP status; the
 *  names are bookkeeping. */
export function parseProductInputResult(json: unknown): ParsedProductInputResult {
  const root = (json ?? {}) as { name?: unknown; product?: unknown; productId?: unknown }
  const productName =
    typeof root.product === "string" && root.product
      ? root.product
      : typeof root.productId === "string" && root.productId
        ? root.productId
        : null
  return {
    name: typeof root.name === "string" && root.name ? root.name : null,
    productName,
  }
}

export type ProcessedProduct = { name: string; offerId: string | null }

/** products.list page (the processed products — Google's view after
 *  ingestion) -> names + the offerId tail of each resource name,
 *  plus the pagination token. */
export function parseProcessedProductsPage(json: unknown): {
  products: ProcessedProduct[]
  nextPageToken: string | null
} {
  const root = (json ?? {}) as { products?: unknown; nextPageToken?: unknown }
  const list = Array.isArray(root.products) ? root.products : []
  const products: ProcessedProduct[] = []
  for (const entry of list) {
    const e = (entry ?? {}) as { name?: unknown; offerId?: unknown; id?: unknown }
    const name = String(e.name ?? "")
    if (!name) continue
    const tail = name.slice(name.lastIndexOf("/") + 1)
    const offerId =
      typeof e.offerId === "string" && e.offerId
        ? e.offerId
        : tail && tail !== name
          ? tail
          : null
    products.push({ name, offerId })
  }
  return {
    products,
    nextPageToken:
      typeof root.nextPageToken === "string" && root.nextPageToken ? root.nextPageToken : null,
  }
}

// ---------------------------------------------------------------------------
// Retry posture — 429 and 5xx are worth a bounded backoff; a 4xx is
// the request's own verdict and retrying it is hammering.
// ---------------------------------------------------------------------------

export function isRetryableMerchantStatus(httpStatus: number): boolean {
  return httpStatus === 429 || httpStatus >= 500
}

/** Exponential backoff (ms) for retry attempt n (1-based):
 *  500, 1000, 2000, … capped at 8s. */
export function merchantRetryBackoffMs(attempt: number): number {
  const n = Math.max(1, Math.trunc(attempt) || 1)
  return Math.min(8000, 500 * 2 ** (n - 1))
}

// ---------------------------------------------------------------------------
// The sync plan — pure decision logic (the engine executes it; the
// tests drive it with a mocked client boundary).
//
//   full:        every catalog item is (re)pushed — kind "update"
//                when the ledger already holds it as pushed, else
//                "insert" — and departed ledger entries are deleted.
//   incremental: an item is pushed only when the ledger has no row
//                for it, its last push failed, its catalog row was
//                replaced under the same slug (item id changed), or
//                its content hash differs. Unchanged items skip.
//   departed:    a ledger row in state pushed/failed whose offerId
//                is no longer in the catalog set -> delete. Rows
//                already deleted are left alone.
// ---------------------------------------------------------------------------

export type MerchantLedgerRow = {
  offerId: string
  catalogItemId: string
  contentHash: string
  state: "pushed" | "failed" | "deleted"
}

export type PlannedInsert = { product: MappedMerchantProduct; kind: "insert" | "update" }
export type PlannedDelete = { offerId: string; catalogItemId: string }

export type MerchantSyncPlan = {
  inserts: PlannedInsert[]
  deletes: PlannedDelete[]
  skipped: number
}

export function planMerchantSync(
  mapped: readonly MappedMerchantProduct[],
  ledger: readonly MerchantLedgerRow[],
  mode: "full" | "incremental",
): MerchantSyncPlan {
  const byOfferId = new Map(ledger.map((r) => [r.offerId, r]))
  const inserts: PlannedInsert[] = []
  let skipped = 0
  for (const product of mapped) {
    const row = byOfferId.get(product.offerId)
    if (mode === "full") {
      inserts.push({ product, kind: row && row.state === "pushed" ? "update" : "insert" })
      continue
    }
    if (
      !row ||
      row.state !== "pushed" ||
      row.catalogItemId !== product.catalogItemId ||
      row.contentHash !== product.contentHash
    ) {
      inserts.push({ product, kind: row && row.state === "pushed" ? "update" : "insert" })
    } else {
      skipped += 1
    }
  }
  const liveOfferIds = new Set(mapped.map((m) => m.offerId))
  const deletes: PlannedDelete[] = []
  for (const row of ledger) {
    if (row.state === "deleted") continue
    if (!liveOfferIds.has(row.offerId)) {
      deletes.push({ offerId: row.offerId, catalogItemId: row.catalogItemId })
    }
  }
  return { inserts, deletes, skipped }
}
