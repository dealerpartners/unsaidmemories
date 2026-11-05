// ============================================================================
// Pawzsly tool-calling operator loop — framework installation I-6.
//
// Until now POST /api/pawzly/chat decided in code and let the LLM only word
// the answer. This module gives the model real tools, executed through the
// SAME server paths a human click uses:
//
//   search_products  → searchAlgoliaProducts (the chat/shop pick source) with
//                      the enterprise catalog search as the constrained
//                      fallback (searchEnterpriseProducts) — the two search
//                      paths the route already runs. Only an explicit
//                      in_stock=false excludes a result; unknown availability
//                      is NOT out of stock.
//   add_to_bag       → validates the product against the live catalog
//                      (getCatalogProductById) and returns the pick plus an
//                      `add_to_bag` action the panel executes through its
//                      existing cart path (useCart().add — the same call the
//                      product card's Add to Bag button makes). The bag is
//                      client state, so the server never pretends to have
//                      added anything itself.
//   list_my_pets     → the signed-in user's real pets, from the same stores
//                      petContext reads (customers → dogs, plus booking pets).
//   create_pet       → the SAME write path as POST /api/customer/pets:
//                      find-or-create the customer row by the verified
//                      session identity, then repo.create("dogs") with the
//                      size tier derived by sizeTierFromWeight. Guests keep
//                      the details in-conversation — no fake save.
//   lookup_orders    → the signed-in user's orders via the customer orders
//                      data path (commerce_orders, tenant + identity scoped
//                      at the query, the Manage-context query shape).
//   get_breed_info   → getBreedProfile from @/lib/pawzly/breeds — the
//                      platform's breed catalogue (public.breeds) with
//                      attributed API enrichment merged under it. The
//                      module is statically imported below (loadBreeds
//                      adapts its positional signature); when a breed
//                      isn't catalogued the tool says so plainly — no
//                      invented breed facts, ever.
//   propose_booking / create_booking → Book Mode (see booking-tools below).
//
// GOVERNOR: capabilityAllowed({ userId, tenantId, capability }) +
// recordGovernorDecline from @/lib/pawzly/governor, statically imported
// below and checked BEFORE every tool executes (loadGovernor adapts its
// signatures to this module's contract types). There is deliberately NO
// local always-true copy of the governor in this file.
//
// AUDIT: every tool call writes logAiInvocation (feature "pawzsly_tool",
// metadata {tool, args summary, status}); write tools also write an
// ai_tasks row (public.ai_tasks: function, subject_type, subject_id,
// input/output jsonb, state) — the same store the admin AI Ops desk reads.
// Both writes are fail-soft: an audit failure never breaks the chat.
// ============================================================================

import { searchAlgoliaProducts, type SearchProductResult } from "@/lib/algolia"
import {
  getCatalogProductById,
  getCatalogStockByIds,
  searchEnterpriseProducts,
} from "@/lib/enterprise/catalog"
import { TENANT_ID, withPg } from "@/lib/crm/enterprise"
import { repo, ilikeLiteral } from "@/lib/repo"
import { logAiInvocation } from "@/lib/ai/log-invocation"
import { sizeTierFromWeight } from "@/lib/booking/pricing"

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export type ToolCard = {
  id: string
  name: string
  slug: string
  brand: string
  short_description: string
  price: number
  image: string
  reason: string
  inStock?: boolean
}

/** An action the panel executes. `context` is the pre-existing kind;
 *  `add_to_bag` is the additive kind the panel handles through its
 *  existing cart path. */
export type ToolAction =
  | { type: "context"; context: string; label: string }
  | { type: "add_to_bag"; productId: string; label: string }

export type ToolExecContext = {
  user: { email?: string; authUserId?: string; name?: string } | null
  tenantId: string
  /** M6 RETIRED (archived, never read — DOCX §5.1 cookie replay is
   *  retired): origin + cookie for the internal booking-checkout call
   *  (Book Mode). The fields stay on the type so no caller breaks, but
   *  no code path reads them; AI execution authority is the scoped
   *  actor token below, minted per intent by lib/ai/intent-router.ts.
   *  Any value passed here is ignored. */
  origin?: string
  cookie?: string
  /** M6: the scoped actor token minted for this exact tool execution
   *  (one actor + one grant + one purpose + one capability set, 15-min
   *  expiry). When present it is verified before execution; a token
   *  minted for another tool/purpose never executes here. */
  actorToken?: string
  /** The shopper's current message, for server-side fallbacks when the model
   *  omits a tool argument it should have set (e.g. a price ceiling it
   *  understood in prose but never passed as maxPriceCents). */
  userMessage?: string
}

export type ToolResult = {
  /** Text handed back to the model — the ONLY facts its final answer may use. */
  text: string
  cards?: ToolCard[]
  actions?: ToolAction[]
  /** Set when the governor prevented execution. */
  declined?: { capability: string }
}

type ToolArgs = Record<string, unknown>

const str = (v: unknown, max = 120): string => String(v ?? "").trim().slice(0, max)
const num = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ---------------------------------------------------------------------------
// Governor + breeds — parallel crews' modules, resolved at runtime against
// their documented signatures (see header). No local fallbacks that fake
// their behavior.
// ---------------------------------------------------------------------------

type GovernorModule = {
  capabilityAllowed: (a: {
    userId: string | null
    tenantId: string
    capability: string
  }) => Promise<{ allowed: boolean; reason?: string } | boolean>
  recordGovernorDecline: (a: {
    userId: string | null
    tenantId: string
    capability: string
    tool: string
    reason?: string
  }) => Promise<void>
}

type BreedsModule = {
  getBreedProfile: (a: {
    species: string
    breedName: string
  }) => Promise<Record<string, unknown> | null>
}

import { capabilityAllowed as governorCapabilityAllowed, recordGovernorDecline as governorRecordDecline } from "@/lib/pawzly/governor"
import { getBreedProfile as breedsGetProfile } from "@/lib/pawzly/breeds"
import { verifyActorToken } from "@/lib/ai/actor-token"
import { TOOL_INTENTS } from "@/lib/ai/tool-intents"

async function loadGovernor(): Promise<GovernorModule | null> {
  // Static import (the governor module landed with this integration).
  // Adapted to this module's local contract types: the governor's
  // capabilityAllowed returns a boolean; recordGovernorDecline takes a
  // `feature` label (the calling tool name).
  return {
    capabilityAllowed: async (a) => governorCapabilityAllowed(a),
    recordGovernorDecline: async (a) =>
      governorRecordDecline({ userId: a.userId, tenantId: a.tenantId, capability: a.capability, feature: a.tool }),
  }
}

async function loadBreeds(): Promise<BreedsModule | null> {
  // Static import (the breeds module landed with this integration); the
  // library function is positional (species, breedName).
  return { getBreedProfile: async (a) => (await breedsGetProfile(a.species, a.breedName)) as unknown as Record<string, unknown> | null }
}

/** The capability each tool is gated on (governor contract keys). */
export const TOOL_CAPABILITY: Record<string, string> = {
  search_products: "shopping_help",
  add_to_bag: "shopping_help",
  list_my_pets: "pet_records",
  create_pet: "pet_creation",
  lookup_orders: "order_lookup",
  get_breed_info: "care_reminders",
  propose_booking: "booking_on_behalf",
  create_booking: "booking_on_behalf",
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

function argsSummary(args: ToolArgs): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "string") out[k] = v.slice(0, 80)
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v
    else if (v != null) out[k] = "[structured]"
  }
  return out
}

async function auditTool(
  tool: string,
  args: ToolArgs,
  status: "success" | "error",
  extra: Record<string, unknown> = {},
): Promise<void> {
  await logAiInvocation({
    feature: "pawzsly_tool",
    provider: "vercel-ai-gateway",
    tenantId: TENANT_ID(),
    status,
    metadata: { tool, args: argsSummary(args), ...extra },
  }).catch(() => {})
}

/** Write an ai_tasks row (the admin AI Ops store). Returns the row id or
 *  null — fail-soft by design, a failed record never breaks the chat and
 *  is never claimed. */
export async function recordAiTask(args: {
  function: string
  subjectType?: string | null
  subjectId?: string | null
  input: Record<string, unknown>
  output?: Record<string, unknown>
  outputText?: string | null
  state?: string
}): Promise<string | null> {
  // withPg never rejects (a failed write resolves null), so no catch is
  // needed to keep this record fail-soft: a failure returns null below.
  const id = await withPg(async (c) => {
      const r = await c.query(
        `INSERT INTO public.ai_tasks (tenant_id, function, subject_type, subject_id, input, output, output_text, state)
         VALUES ($1,$2,$3,$4::uuid,$5::jsonb,$6::jsonb,$7,$8) RETURNING id`,
        [
          TENANT_ID(),
          args.function,
          args.subjectType ?? null,
          args.subjectId ?? null,
          JSON.stringify(args.input ?? {}),
          JSON.stringify(args.output ?? {}),
          args.outputText ?? null,
          args.state ?? "proposed",
        ],
      )
    return r.rows[0]?.id ? String(r.rows[0].id) : null
  })
  return id ?? null
}

export async function updateAiTask(
  id: string,
  state: string,
  output: Record<string, unknown>,
): Promise<void> {
  try {
    await withPg(async (c) => {
      await c.query(
        `UPDATE public.ai_tasks SET state=$1, output=$2::jsonb, updated_at=now() WHERE id=$3::uuid AND tenant_id=$4`,
        [state, JSON.stringify(output ?? {}), id, TENANT_ID()],
      )
    })
  } catch { /* fail-soft */ }
}

// ---------------------------------------------------------------------------
// Tool definitions (OpenAI tools format for the Vercel AI Gateway)
// ---------------------------------------------------------------------------

export const PAWZSLY_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_products",
      description:
        "Search the store's real catalog for products. Use whenever the shopper wants to buy, browse, or compare products. Results are the only products you may name or price.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "2-5 plain words a store search would match, e.g. 'dog treats'." },
          species: { type: "string", enum: ["dog", "cat"], description: "Species the product is for, when known." },
          maxPriceCents: { type: "number", description: "Price ceiling IN CENTS (e.g. $50 means 5000, $25.99 means 2599). ALWAYS set this when the shopper names any price ceiling ('under $50', 'less than $30', 'cheap'). Only products at or under this price are returned." },
          category: { type: "string", description: "Category words to fold into the search, e.g. 'food', 'toys'." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_to_bag",
      description:
        "Add a product from the search results to the shopper's bag. Only call with a productId returned by search_products in this conversation, and only when the shopper asked to add or buy it.",
      parameters: {
        type: "object",
        properties: { productId: { type: "string", description: "The id of a product returned by search_products." } },
        required: ["productId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_my_pets",
      description: "List the signed-in shopper's pets on file. Use when they ask about their pets or before booking for a pet.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "create_pet",
      description:
        "Save a new pet for the shopper. New-pet owners are a primary path: gather name, species, breed and weight and call this. For guests the details are kept in the conversation and they are guided to sign in — never claim a guest's pet was saved.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          species: { type: "string", enum: ["dog", "cat"] },
          breed: { type: "string" },
          weightLbs: { type: "number" },
          ageOrBirth: { type: "string", description: "Birth date (YYYY-MM-DD) or age description, when given." },
        },
        required: ["name", "species"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_orders",
      description: "Look up the signed-in shopper's recent orders and their statuses in plain language.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_breed_info",
      description: "Get factual breed information (temperament, care, exercise, grooming needs) for a species + breed.",
      parameters: {
        type: "object",
        properties: {
          species: { type: "string", enum: ["dog", "cat"] },
          breedName: { type: "string" },
        },
        required: ["species", "breedName"],
      },
    },
  },
] as const

export const PAWZSLY_TOOL_NAMES = new Set<string>([
  ...PAWZSLY_TOOLS.map((t) => t.function.name),
  "propose_booking",
  "create_booking",
])

// ---------------------------------------------------------------------------
// Tool implementations — each calls the same server path a human click uses
// ---------------------------------------------------------------------------

function algoliaCard(p: SearchProductResult, reason: string): ToolCard {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    brand: p.brand || "",
    short_description: "",
    price: p.priceCents,
    image: p.image || "",
    reason,
    inStock: undefined,
  }
}

async function attachStock(cards: ToolCard[]): Promise<ToolCard[]> {
  if (!cards.length) return cards
  try {
    const stock = await getCatalogStockByIds(cards.map((c) => c.id))
    for (const c of cards) {
      const v = stock.get(c.id)
      if (v !== undefined) c.inStock = v
    }
  } catch { /* cards ship without the flag rather than not at all */ }
  // Only an explicit in_stock=false excludes a card.
  return cards.filter((c) => c.inStock !== false)
}

/** Server-side price-ceiling fallback: "under $50", "less than $30",
 *  "below $25.99", "up to $40", "max $20", "cheaper than $15" → cents.
 *  Used ONLY when the model did not pass maxPriceCents. Returns null when
 *  no ceiling phrase is present. */
export function priceCeilingFromMessage(message: string | undefined): number | null {
  if (!message) return null
  const m = message
    .toLowerCase()
    .match(/(?:under|below|less than|at most|max|cheaper than|up to)\s*\$?\s*(\d+(?:\.\d{1,2})?)/)
  if (!m) return null
  const dollars = Number(m[1])
  if (!Number.isFinite(dollars) || dollars <= 0) return null
  return Math.round(dollars * 100)
}

async function toolSearchProducts(args: ToolArgs, ctx?: ToolExecContext): Promise<ToolResult> {
  const query = str(args.query, 80)
  const species = str(args.species, 10).toLowerCase()
  const category = str(args.category, 40)
  // Price ceiling: the model's maxPriceCents first; if the model understood
  // a ceiling in prose ("under $50") but never passed the argument — the
  // exact failure behind the live "under $50" chat returning $79/$66/$95
  // cards, since the old post-filter only ran when the argument existed —
  // derive it server-side from the shopper's message. Deterministic, not
  // model-dependent. Only the first ceiling phrase wins; "under $50 and
  // over $20" keeps the under-$50 ceiling.
  let maxPrice = num(args.maxPriceCents)
  if (maxPrice == null || maxPrice <= 0) maxPrice = priceCeilingFromMessage(ctx?.userMessage)
  if (query.length < 2) return { text: "No search was run — the query was too short. Ask what they're looking for." }
  const fullQuery = [species === "dog" || species === "cat" ? species : "", category, query]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
  let cards: ToolCard[] = []
  const hits = await searchAlgoliaProducts(fullQuery, 8, { maxPriceCents: maxPrice }).catch(() => [] as SearchProductResult[])
  cards = hits.map((p) => algoliaCard(p, "Matches what you asked about"))
  if (!cards.length) {
    // Constrained fallback: the enterprise catalog search (the /shop path).
    const ent = await searchEnterpriseProducts({ q: fullQuery, perPage: 8 })
    if (ent) {
      cards = ent.items
        .filter((i) => i.inStock !== false)
        .map((i) => ({
          id: i.id,
          name: i.name,
          slug: i.slug,
          brand: i.brand || "",
          short_description: i.shortDescription || "",
          price: i.priceCents,
          image: i.image || "",
          reason: "Matches what you asked about",
          inStock: i.inStock,
        }))
    }
  }
  cards = await attachStock(cards)
  // Backstop for the enterprise fallback path (its own maxPrice is dollars,
  // so it is deliberately NOT passed there — this cents comparison is the
  // guard for that path). The Algolia path is already filtered at the index.
  if (maxPrice != null && maxPrice > 0) cards = cards.filter((c) => c.price <= maxPrice)
  cards = cards.slice(0, 4)
  if (!cards.length) {
    return { text: `The store search for "${fullQuery}" returned no products. Say plainly that nothing matched and offer to try different words — do not name any product.` }
  }
  const lines = cards.map((c) => `- ${c.name}${c.brand ? ` (${c.brand})` : ""} — $${(c.price / 100).toFixed(2)} [id ${c.id}]`).join("\n")
  return {
    text: `Real products from the store for "${fullQuery}":\n${lines}\nYou may name ONLY these products and these prices.`,
    cards,
  }
}

async function toolAddToBag(args: ToolArgs, seen: Map<string, ToolCard>): Promise<ToolResult> {
  const productId = str(args.productId, 80)
  const known = seen.get(productId)
  if (!known) {
    return { text: `add_to_bag was NOT executed: "${productId}" is not a product returned by search_products in this conversation. Search first, then add by the id from the results.` }
  }
  // Validate against the live catalog — the same record the PDP sells.
  const live = await getCatalogProductById(productId)
  if (live && live.visible === false) {
    return { text: `"${known.name}" isn't available to buy right now, so it was not added. Tell the shopper plainly and offer the other results.` }
  }
  const card: ToolCard = live
    ? { ...known, name: live.name, slug: live.slug, brand: live.brand || known.brand, price: live.priceCents, image: live.image || known.image }
    : known
  if (card.inStock === false) {
    return { text: `"${card.name}" is sold out, so it was not added. Tell the shopper plainly.` }
  }
  return {
    text: `"${card.name}" ($${(card.price / 100).toFixed(2)}) is being added to the shopper's bag by the panel's Add to Bag action. Confirm it by name and price.`,
    cards: [card],
    actions: [{ type: "add_to_bag", productId: card.id, label: `Add ${card.name} to Bag` }],
  }
}

type OnFilePet = { id: string | null; name: string; breedName: string | null; weightLbs: number | null }

async function petsOnFile(user: NonNullable<ToolExecContext["user"]>): Promise<OnFilePet[]> {
  const out: OnFilePet[] = []
  const email = String(user.email || "").toLowerCase()
  const customers = (await repo.list("customers")) as any[]
  const customer = customers.find(
    (c) => String(c.email || "").toLowerCase() === email || c.userId === user.authUserId,
  )
  if (customer) {
    const dogs = (await repo.list("dogs")) as any[]
    for (const d of dogs.filter((d) => d.customerId === customer.id).slice(0, 6)) {
      out.push({
        id: d.id ? String(d.id) : null,
        name: String(d.name || ""),
        breedName: d.breedName || d.breed || null,
        weightLbs: d.weightLbs ? Number(d.weightLbs) : null,
      })
    }
  }
  // A second leg used to derive pets from booking rows (dogName on
  // public.bookings) — that table does not exist in this schema, so
  // the leg could only ever return nothing. Removed 2026-11-02.
  return out.filter((p) => p.name)
}

async function toolListMyPets(ctx: ToolExecContext): Promise<ToolResult> {
  if (!ctx.user) {
    return { text: "The visitor is a guest — no pets on file can be shown. Invite them to sign in, or to tell you about their pet so you can help in this conversation." }
  }
  const pets = await petsOnFile(ctx.user)
  if (!pets.length) {
    return { text: "The signed-in shopper has no pets on file yet. This is a primary path, not an error: offer to add their pet — ask for the pet's name, species, breed and weight, then call create_pet." }
  }
  const lines = pets.map((p) => `- ${p.name}${p.breedName ? ` — ${p.breedName}` : ""}${p.weightLbs ? `, ${p.weightLbs} lbs` : ""}`).join("\n")
  return { text: `The shopper's pets on file:\n${lines}` }
}

async function toolCreatePet(args: ToolArgs, ctx: ToolExecContext): Promise<ToolResult> {
  const name = str(args.name, 60)
  const species = str(args.species, 10).toLowerCase()
  const breed = str(args.breed, 80)
  const weight = num(args.weightLbs)
  const ageOrBirth = str(args.ageOrBirth, 40)
  if (!name) return { text: "create_pet needs the pet's name first — ask for it." }
  if (!ctx.user) {
    return {
      text: `Guest path: keep ${name}'s details in this conversation (${species || "pet"}${breed ? `, ${breed}` : ""}${weight ? `, ${weight} lbs` : ""}) and help using them. The pet is NOT saved — say plainly that signing in saves the pet to their account for next time. Never claim it was saved.`,
    }
  }
  // The pets write path (POST /api/customer/pets) requires breed + weight —
  // gather them in conversation rather than failing the save.
  if (!breed || weight == null || weight <= 0 || weight > 300) {
    return {
      text: `To save ${name} I still need ${!breed ? "the breed" : ""}${!breed && (weight == null || weight <= 0 || weight > 300) ? " and " : ""}${weight == null || weight <= 0 || weight > 300 ? "a weight in pounds" : ""}. Ask for ${!breed && (weight == null || weight <= 0 || weight > 300) ? "both" : "it"} in one short question, then call create_pet again.`,
    }
  }
  const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(ageOrBirth) ? ageOrBirth : null
  // SAME write path as POST /api/customer/pets: find-or-create the customer
  // by the verified session identity, then create the dogs row.
  const email = String(ctx.user.email || "").toLowerCase()
  const tenant = ctx.tenantId
  const customers = (await repo
    .listWhere(
      "customers",
      `and=(or(email.ilike.${ilikeLiteral(email)},userId.eq.${encodeURIComponent(String(ctx.user.authUserId || ""))}),or(tenant_id.eq.${tenant},tenant_id.is.null))&limit=5`,
    )
    ) as any[]
  let customer = customers.find(
    (c) => String(c.email || "").toLowerCase() === email || c.userId === ctx.user!.authUserId,
  )
  if (!customer && email) {
    const byEmail = (await repo.listWhere("customers", `email.ilike.${ilikeLiteral(email)}&limit=5`)) as any[]
    customer = byEmail.find((c) => String(c.email || "").toLowerCase() === email)
  }
  if (!customer) {
    const ownerName = String(ctx.user.name || email.split("@")[0] || "Customer")
    customer = await repo.create("customers", {
      firstName: ownerName.split(" ")[0] || "",
      lastName: ownerName.split(" ").slice(1).join(" ") || "",
      email,
      customerStatus: "PENDING",
      userId: ctx.user.authUserId,
    })
  }
  const dog = await repo.create("dogs", {
    customerId: customer.id,
    name,
    breedName: breed,
    breedId: null,
    birthDate,
    weightLbs: String(weight),
    size: sizeTierFromWeight(weight),
  })
  const petId = dog?.id ? String(dog.id) : null
  await recordAiTask({
    function: "front_door",
    subjectType: "pet",
    subjectId: petId && /^[0-9a-f-]{36}$/i.test(petId) ? petId : null,
    input: { tool: "create_pet", name, species, breed, weightLbs: weight },
    output: { petId, saved: true },
    outputText: `Pet ${name} saved via Pawzsly create_pet.`,
    state: "recorded",
  })
  return {
    text: `${name} (${breed}, ${weight} lbs) is saved to the shopper's account. Confirm the save by name, breed and weight.`,
  }
}

const ORDER_STATUS_WORDS: Record<string, string> = {
  PENDING: "being prepared",
  PAID: "paid and being prepared",
  PROCESSING: "being prepared",
  FULFILLED: "fulfilled",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  CANCELED: "cancelled",
  REFUNDED: "refunded",
}

async function toolLookupOrders(ctx: ToolExecContext): Promise<ToolResult> {
  if (!ctx.user) {
    return { text: "The visitor is a guest — orders can only be shown to the signed-in owner. Invite them to sign in to see their orders." }
  }
  const user = ctx.user
  const email = String(user.email || "").toLowerCase()
  const rows = await withPg(async (c) => {
    const cust = await c.query(
      `SELECT id FROM customers WHERE tenant_id=$1 AND (lower(email)=lower($2) OR "userId"=$3) LIMIT 1`,
      [ctx.tenantId, email, user.authUserId || ""],
    )
    const customerId: string | null = cust.rowCount ? String(cust.rows[0].id) : null
    const q = await c.query(
      `SELECT id, total_amount, status, fulfillment_status, tracking_number, created_at
         FROM commerce_orders
        WHERE tenant_id=$1 AND (customer_id=$2 OR lower(customer_email)=lower($3) OR lower(email)=lower($3))
        ORDER BY created_at DESC LIMIT 5`,
      [ctx.tenantId, customerId || "", email],
    )
    return q.rows as any[]
  })
  if (rows === null) {
    return { text: "The orders lookup couldn't reach the account data just now. Say so plainly and point them to their orders page — do not guess at any order." }
  }
  if (!rows.length) {
    return { text: "The signed-in shopper has no orders on file. Say so plainly — no orders is an honest answer, not an error." }
  }
  const lines = rows.map((o) => {
    const placed = o.created_at ? new Date(o.created_at).toISOString().slice(0, 10) : ""
    const status = ORDER_STATUS_WORDS[String(o.status || "").toUpperCase()] || String(o.status || "being prepared").toLowerCase()
    const total = o.total_amount != null ? `, total $${o.total_amount}` : ""
    const tracking = o.tracking_number ? `, tracking ${o.tracking_number}` : ""
    return `- Order ${String(o.id).slice(0, 8)}${placed ? ` placed ${placed}` : ""} — ${status}${o.fulfillment_status ? ` (${o.fulfillment_status})` : ""}${total}${tracking}`
  })
  return { text: `The shopper's recent orders:\n${lines.join("\n")}\nReport ONLY these orders, statuses and totals.` }
}

async function toolGetBreedInfo(args: ToolArgs): Promise<ToolResult> {
  const species = str(args.species, 10).toLowerCase()
  const breedName = str(args.breedName, 80)
  if (!breedName) return { text: "get_breed_info needs a breed name — ask which breed they mean." }
  const breeds = await loadBreeds()
  if (!breeds) {
    // The breeds module failed to load — honest unavailability, no
    // invented breed facts.
    return { text: `Breed facts for ${breedName} aren't available in Pawzsly yet. Say so plainly and answer only in general terms you're sure of, without presenting breed specifics as sourced facts.` }
  }
  const profile = await breeds.getBreedProfile({ species, breedName })
  if (!profile) {
    await recordAiTask({
      function: "get_breed_info",
      subjectType: "breed",
      subjectId: null,
      input: { tool: "get_breed_info", species, breedName },
      output: { found: false },
      outputText: `Breed lookup for ${breedName} (${species}): not in the platform catalogue.`,
      state: "recorded",
    })
    return { text: `No breed profile was found for ${breedName}. Say so plainly — do not invent breed facts.` }
  }
  await recordAiTask({
    function: "get_breed_info",
    subjectType: "breed",
    subjectId: null,
    input: { tool: "get_breed_info", species, breedName },
    output: { found: true, name: profile.name ?? breedName, lifeSpan: profile.lifeSpan ?? null },
    outputText: `Breed profile for ${breedName} (${species}) served from the platform breed catalogue.`,
    state: "recorded",
  })
  return { text: `Breed profile for ${breedName} (${species}):\n${JSON.stringify(profile).slice(0, 1500)}\nAnswer ONLY from this profile; where it credits an outside source, keep the attribution.` }
}

// ---------------------------------------------------------------------------
// Dispatcher — governor gate first, execution second, audit always.
// ---------------------------------------------------------------------------

export async function executePawzslyTool(
  name: string,
  args: ToolArgs,
  ctx: ToolExecContext,
  seen: Map<string, ToolCard>,
): Promise<ToolResult> {
  const capability = TOOL_CAPABILITY[name] || "shopping_help"
  // M6: when a scoped actor token is presented, it is verified against
  // THIS tool's purpose/capability/object before anything executes — a
  // token minted for another tool, or replayed past expiry, never runs.
  // (The router mints the token; this is the executor's own gate, so a
  // future caller cannot bypass the router by calling the executor.)
  // No token presented = an internal server caller, not a model-driven
  // execution; the router is the only model path, and it always mints.
  const map = TOOL_INTENTS[name]
  if (ctx.actorToken && map) {
    // Object binding where the executor knows the object: a token
    // minted for one product/breed never executes for another.
    const objectId =
      name === "add_to_bag"
        ? str(args.productId) || undefined
        : name === "get_breed_info"
          ? str(args.breedName) || undefined
          : undefined
    const tokenOk = verifyActorToken(ctx.actorToken, {
      purpose: map.purpose,
      capability: map.capability,
      objectType: map.objectType,
      ...(objectId !== undefined ? { objectId } : {}),
    })
    if (!tokenOk.ok) {
      await auditTool(name, args, "success", { router: "token_refused", token_reason: tokenOk.code, capability })
      return {
        text: `The ${name} action was refused: the actor token does not authorize this tool. Answer plainly that the action was refused and offer what remains allowed. Do not attempt the action another way.`,
        declined: { capability },
      }
    }
  }
  let governorState = "unavailable"
  const governor = await loadGovernor()
  if (governor) {
    governorState = "checked"
    try {
      const verdict = await governor.capabilityAllowed({
        userId: ctx.user?.authUserId ?? null,
        tenantId: ctx.tenantId,
        capability,
      })
      const allowed = typeof verdict === "boolean" ? verdict : verdict?.allowed !== false
      if (!allowed) {
        const reason = typeof verdict === "object" ? verdict?.reason : undefined
        await governor
          .recordGovernorDecline({
            userId: ctx.user?.authUserId ?? null,
            tenantId: ctx.tenantId,
            capability,
            tool: name,
            reason,
          })
          .catch(() => {})
        await auditTool(name, args, "success", { governor: "declined", capability })
        return {
          text: `The ${name} action is turned off for this account in Manage controls. Answer plainly: name that the Manage controls govern this, and offer what remains allowed (browsing, care answers, the booking flow link). Do not attempt the action another way.`,
          declined: { capability },
        }
      }
    } catch {
      governorState = "error"
    }
  }

  let result: ToolResult
  let status: "success" | "error" = "success"
  try {
    switch (name) {
      case "search_products":
        result = await toolSearchProducts(args, ctx)
        for (const c of result.cards || []) seen.set(c.id, c)
        break
      case "add_to_bag":
        result = await toolAddToBag(args, seen)
        break
      case "list_my_pets":
        result = await toolListMyPets(ctx)
        break
      case "create_pet":
        result = await toolCreatePet(args, ctx)
        break
      case "lookup_orders":
        result = await toolLookupOrders(ctx)
        break
      case "get_breed_info":
        result = await toolGetBreedInfo(args)
        break
      default:
        result = { text: `Unknown tool "${name}" — it was not executed.` }
    }
  } catch {
    status = "error"
    result = { text: `The ${name} step didn't go through just now. Tell the shopper plainly it didn't work and offer to try again — never claim it succeeded.` }
  }
  await auditTool(name, args, status, { governor: governorState, capability })
  return result
}
