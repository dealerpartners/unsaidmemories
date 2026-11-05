// ---------------------------------------------------------------------------
// kole-feed.ts — Kole Imports product-feed adapter.
//
// Kole's dropship feed is a single XML download (the URL itself carries the
// feed access key). It does NOT match the Shopify products.json shape the
// other supplier feeds use, so this module parses the documented Kole XML
// schema and normalizes each item into the SAME internal feed shape the
// enterprise upsert path consumes (see supabase/functions/feed-sync):
//
//   { supplier, source_product_id, title, handle, description, vendor,
//     product_type, images[], variants[{ sku, title, price,
//     compare_at_price, in_stock, stock_quantity, option_size,
//     option_color, weight }] }
//
// Documented feed schema (Kole Support KB, "Product feed field types"):
//   <catalog><meta/><products><item> with children:
//   id (SKU), md5, title, description, type, brand, colors, materials,
//   attributes, upc, inventory, is_closeout, category, subcategory,
//   images/image[@size=small|medium|large], item_weight, modified,
//   pricing/tier[pack,price] + case[pack,price], sale/on_sale.
//
// Rules baked in (Sunny's feed decisions, 2026-10-13):
//   • Pet Supplies ONLY — anything else is excluded here, never imported.
//   • Display/pallet pack types are EXCLUDED (retail display tools, not
//     consumer products): floor display, dump display, pdq, half pallet,
//     starter pallet.
//   • Closeouts are INCLUDED (flagged in metadata downstream; they are
//     never restocked and vanish from the feed when sold out — the sync
//     deactivates vanished SKUs).
//   • Brand / colors / materials / attributes are carried through to real
//     fields — never dropped, never stuffed into a notes field.
//   • Images: the LARGE variant is the listing image.
//   • Pricing is per PACK (Tier Pack 1 is the minimum dropship quantity —
//     Kole typically does not break cases). The normalized variant IS the
//     pack: price = tier-1 pack price, pack_qty preserved in metadata.
//     Nothing is silently exploded into single units.
//
// No XML parser exists in the dependency tree, so the parser below is a
// small focused one for Kole's documented, well-formed feed/response XML.
// ---------------------------------------------------------------------------

export const KOLE_SUPPLIER_ID = "koleimports"

/** Item `type` values that are display/pallet packs, not consumer products. */
export const KOLE_DISPLAY_TYPES = new Set([
  "floor display",
  "dump display",
  "pdq",
  "half pallet",
  "starter pallet",
])

// ---------------------------------------------------------------------------
// Minimal XML reader (elements, attributes, CDATA, entities). Good enough
// for Kole's documented schemas; it is not a general-purpose XML library.
// ---------------------------------------------------------------------------

export type XmlNode = {
  tag: string
  attrs: Record<string, string>
  children: XmlNode[]
  text: string
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([A-Za-z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) attrs[m[1]] = decodeEntities(m[2] ?? m[3] ?? "")
  return attrs
}

/** Parse a well-formed XML document into a node tree (root element). */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { tag: "#root", attrs: {}, children: [], text: "" }
  const stack: XmlNode[] = [root]
  const tokenRe =
    /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<(\/?)([A-Za-z0-9_:-]+)((?:\s+[A-Za-z0-9_:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
  let m: RegExpExecArray | null
  while ((m = tokenRe.exec(xml))) {
    const top = stack[stack.length - 1]
    if (m[1] !== undefined) {
      top.text += m[1] // CDATA content
    } else if (m[6] !== undefined) {
      top.text += decodeEntities(m[6])
    } else if (m[3] !== undefined) {
      const closing = m[2] === "/"
      const tag = m[3]
      if (closing) {
        // Pop to the matching open tag (tolerant of minor malformation).
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].tag === tag) {
            stack.length = i
            break
          }
        }
      } else {
        const node: XmlNode = { tag, attrs: parseAttrs(m[4] || ""), children: [], text: "" }
        top.children.push(node)
        if (m[5] !== "/") stack.push(node)
      }
    }
    // comments / processing instructions / doctype: ignored
  }
  const first = root.children[0]
  if (!first) throw new Error("XML parse failed: no root element")
  return first
}

export function childNodes(node: XmlNode, tag: string): XmlNode[] {
  return node.children.filter((c) => c.tag === tag)
}

export function childText(node: XmlNode, tag: string): string {
  const c = node.children.find((x) => x.tag === tag)
  return c ? c.text.trim() : ""
}

/** Generic element → JS value (used for Kole API XML responses):
 *  leaf → text; element children grouped by tag (repeats become arrays);
 *  attributes land under "@attrs" when present. */
export function xmlToValue(node: XmlNode): unknown {
  if (node.children.length === 0) {
    const text = node.text.trim()
    if (Object.keys(node.attrs).length === 0) return text
    return { "@attrs": node.attrs, "#text": text }
  }
  const out: Record<string, unknown> = {}
  if (Object.keys(node.attrs).length) out["@attrs"] = node.attrs
  for (const child of node.children) {
    const v = xmlToValue(child)
    if (child.tag in out) {
      const prev = out[child.tag]
      out[child.tag] = Array.isArray(prev) ? [...prev, v] : [prev, v]
    } else {
      out[child.tag] = v
    }
  }
  const ownText = node.text.trim()
  if (ownText) out["#text"] = ownText
  return out
}

// ---------------------------------------------------------------------------
// Feed parsing — the documented Kole XML schema.
// ---------------------------------------------------------------------------

export type KolePriceTier = { pack: number; price: number }

export type KoleFeedItem = {
  sku: string
  md5: string
  title: string
  description: string
  /** import | premium item | floor display | dump display | pdq | … */
  type: string
  brand: string
  colors: string[]
  materials: string[]
  attributes: string[]
  upc: string
  /** Pieces in stock at Kole. */
  inventory: number
  isCloseout: boolean
  category: string
  subcategory: string
  images: { small?: string; medium?: string; large?: string }
  /** Weight per piece (lb). */
  itemWeight: number
  modified: string
  tiers: KolePriceTier[]
  casePack: KolePriceTier | null
  onSale: boolean
}

function splitList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
}

function num(s: string, fallback = 0): number {
  const n = Number(String(s).replace(/[^0-9.\-]/g, ""))
  return Number.isFinite(n) ? n : fallback
}

export function parseKoleFeed(xml: string): KoleFeedItem[] {
  const root = parseXml(xml)
  if (root.tag !== "catalog") {
    throw new Error(`Kole feed: expected <catalog> root, got <${root.tag}>`)
  }
  const products = root.children.find((c) => c.tag === "products")
  if (!products) throw new Error("Kole feed: missing <products> element")
  const items: KoleFeedItem[] = []
  for (const item of childNodes(products, "item")) {
    const images: KoleFeedItem["images"] = {}
    const imagesNode = item.children.find((c) => c.tag === "images")
    if (imagesNode) {
      for (const img of childNodes(imagesNode, "image")) {
        const size = (img.attrs.size || "").toLowerCase()
        const url = img.text.trim()
        if (!url) continue
        if (size === "small" || size === "medium" || size === "large") images[size] = url
        else if (!images.large) images.large = url
      }
    }
    const tiers: KolePriceTier[] = []
    let casePack: KolePriceTier | null = null
    const pricing = item.children.find((c) => c.tag === "pricing")
    if (pricing) {
      for (const tier of childNodes(pricing, "tier")) {
        const pack = Math.trunc(num(childText(tier, "pack")))
        const price = num(childText(tier, "price"))
        if (pack > 0) tiers.push({ pack, price })
      }
      const caseNode = pricing.children.find((c) => c.tag === "case")
      if (caseNode) {
        const pack = Math.trunc(num(childText(caseNode, "pack")))
        const price = num(childText(caseNode, "price"))
        if (pack > 0) casePack = { pack, price }
      }
    }
    tiers.sort((a, b) => a.pack - b.pack)
    const sale = item.children.find((c) => c.tag === "sale")
    items.push({
      sku: childText(item, "id"),
      md5: childText(item, "md5"),
      title: childText(item, "title"),
      description: childText(item, "description"),
      type: childText(item, "type").toLowerCase(),
      brand: childText(item, "brand"),
      colors: splitList(childText(item, "colors")),
      materials: splitList(childText(item, "materials")),
      attributes: splitList(childText(item, "attributes")),
      upc: childText(item, "upc"),
      inventory: Math.trunc(num(childText(item, "inventory"))),
      isCloseout: childText(item, "is_closeout") === "1",
      category: childText(item, "category"),
      subcategory: childText(item, "subcategory"),
      images,
      itemWeight: num(childText(item, "item_weight")),
      modified: childText(item, "modified"),
      tiers,
      casePack,
      onSale: sale ? childText(sale, "on_sale") === "1" : false,
    })
  }
  return items
}

// ---------------------------------------------------------------------------
// Category classification — Kole's pet subcategories → the platform's
// mapping keys. The keys match supplier_category_mapping.lookup_key rows
// seeded for supplier 'koleimports' (see the migration). Kole's real
// subcategory strings are descriptor-style ("harness/leash/collar/chain"),
// so classification is keyword-based over the normalized subcategory.
// ---------------------------------------------------------------------------

export const KOLE_GROUPS = {
  toys: "pet toys",
  collars: "collars leashes and harnesses",
  bowls: "pet bowls feeders and waterers",
  grooming: "pet grooming",
  cleanup: "pet cleanup",
  apparel: "pet apparel",
  furniture: "pet furniture",
} as const

export type KoleGroupKey = (typeof KOLE_GROUPS)[keyof typeof KOLE_GROUPS]

/** Same normalization the feed pipeline uses for mapping lookups. */
export function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function classifyKoleSubcategory(subcategory: string): KoleGroupKey | null {
  const s = normKey(subcategory)
  if (!s) return null
  if (/\b(toy|toys|play)\b/.test(s)) return KOLE_GROUPS.toys
  if (/(collar|leash|harness|chain)/.test(s)) return KOLE_GROUPS.collars
  if (/(bowl|feeder|waterer|dish|feeding|drink)/.test(s)) return KOLE_GROUPS.bowls
  if (/(groom|bath|shampoo|brush|comb)/.test(s)) return KOLE_GROUPS.grooming
  if (/(cleanup|clean up|waste|litter|potty|poop)/.test(s)) return KOLE_GROUPS.cleanup
  if (/(apparel|clothing|costume|clothes|sweater)/.test(s)) return KOLE_GROUPS.apparel
  if (/(furniture|bed|beds|house|scratcher|perch|hammock|condo|tree)/.test(s)) return KOLE_GROUPS.furniture
  return null
}

// ---------------------------------------------------------------------------
// Normalization → the internal feed shape the enterprise upsert consumes.
// ---------------------------------------------------------------------------

export type KoleVariant = {
  sku: string
  title: string
  /** Price PER PACK (the sellable unit). */
  price: number
  compare_at_price: number | null
  in_stock: boolean
  /** Whole packs available (floor of piece inventory / pack size). */
  stock_quantity: number
  option_size: string | null
  option_color: string | null
  /** Weight per pack (lb). */
  weight: number | null
}

export type KoleNormalizedProduct = {
  supplier: typeof KOLE_SUPPLIER_ID
  source_product_id: string
  title: string
  handle: string
  description: string
  /** Real brand — lands on the brand column, not metadata. */
  vendor: string
  /** supplier_category_mapping lookup key for the subcategory group. */
  product_type: string
  images: string[]
  variants: KoleVariant[]
  kole: {
    md5: string
    upc: string
    colors: string[]
    materials: string[]
    attributes: string[]
    is_closeout: boolean
    on_sale: boolean
    feed_type: string
    category: string
    subcategory: string
    group: KoleGroupKey
    /** Tier Pack 1 size — the minimum dropship quantity. */
    pack_qty: number
    /** All price tiers (per pack), ascending by pack size. */
    tiers: KolePriceTier[]
    case_pack: KolePriceTier | null
    /** Wholesale cost per single piece at tier 1 (pack price / pack size). */
    unit_cost: number
    inventory_pieces: number
  }
}

export type KoleExcluded = {
  sku: string
  reason: "non_pet_category" | "display_pack" | "no_pricing" | "unclassified_subcategory"
  category: string
  subcategory: string
  type: string
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "product"
}

export function normalizeKoleItem(
  item: KoleFeedItem,
): { product: KoleNormalizedProduct } | { excluded: KoleExcluded } {
  const base = { sku: item.sku, category: item.category, subcategory: item.subcategory, type: item.type }
  if (normKey(item.category) !== "pet supplies") {
    return { excluded: { ...base, reason: "non_pet_category" } }
  }
  if (KOLE_DISPLAY_TYPES.has(item.type)) {
    return { excluded: { ...base, reason: "display_pack" } }
  }
  const tier1 = item.tiers[0] ?? item.casePack
  if (!tier1 || tier1.price <= 0) {
    return { excluded: { ...base, reason: "no_pricing" } }
  }
  const group = classifyKoleSubcategory(item.subcategory)
  if (!group) {
    return { excluded: { ...base, reason: "unclassified_subcategory" } }
  }
  const packQty = tier1.pack
  const packPrice = tier1.price
  const stockPacks = Math.floor(item.inventory / packQty)
  const image = item.images.large || item.images.medium || item.images.small
  const variant: KoleVariant = {
    sku: item.sku,
    title: packQty > 1 ? `Pack of ${packQty}` : "Default",
    price: packPrice,
    compare_at_price: null,
    in_stock: stockPacks > 0,
    stock_quantity: stockPacks,
    option_size: packQty > 1 ? `Pack of ${packQty}` : null,
    option_color: item.colors[0] ?? null,
    weight: item.itemWeight > 0 ? Number((item.itemWeight * packQty).toFixed(3)) : null,
  }
  return {
    product: {
      supplier: KOLE_SUPPLIER_ID,
      source_product_id: item.sku,
      title: item.title,
      handle: slugify(item.title),
      description: item.description || item.title,
      vendor: item.brand.trim(),
      product_type: group,
      images: image ? [image] : [],
      variants: [variant],
      kole: {
        md5: item.md5,
        upc: item.upc,
        colors: item.colors,
        materials: item.materials,
        attributes: item.attributes,
        is_closeout: item.isCloseout,
        on_sale: item.onSale,
        feed_type: item.type,
        category: item.category,
        subcategory: item.subcategory,
        group,
        pack_qty: packQty,
        tiers: item.tiers,
        case_pack: item.casePack,
        unit_cost: Number((packPrice / packQty).toFixed(4)),
        inventory_pieces: item.inventory,
      },
    },
  }
}

export function normalizeKoleFeed(items: KoleFeedItem[]): {
  products: KoleNormalizedProduct[]
  excluded: KoleExcluded[]
} {
  const products: KoleNormalizedProduct[] = []
  const excluded: KoleExcluded[] = []
  for (const item of items) {
    const r = normalizeKoleItem(item)
    if ("product" in r) products.push(r.product)
    else excluded.push(r.excluded)
  }
  return { products, excluded }
}
