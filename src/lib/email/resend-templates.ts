// ---------------------------------------------------------------------------
// Resend templates — the bridge between the app's email types and the
// templates that live in the platform's Resend account.
//
// Owner rule: transactional email follows the templates in Resend (the
// branded design system — paw mark, nav strip, orange pill CTA, Memphis
// footer). The app must NOT hand-build HTML for a type that has a Resend
// template; it sends through the template with variable substitution.
//
// How a send flips to its template — per app template key, centrally:
//   1. The key is resolved against the template map (below). No map entry →
//      the send keeps the legacy in-code HTML path (the type is on the
//      owner's gap list until its template exists / is published).
//   2. A map entry names the Resend template by id OR alias. Only
//      PUBLISHED templates resolve in Resend; a draft or a wrong ref makes
//      the send FAIL LOUDLY (audit row FAILED with Resend's error) — a
//      mapped send never silently falls back to hand-built HTML.
//   3. The caller passes `variables` (see toResendVariables for the naming
//      contract); Resend renders the template with them.
//
// The map lives in two places, env winning over app settings:
//   - RESEND_TEMPLATE_MAP env var: JSON object {"booking_confirmed": "<id-or-alias>", ...}
//   - `resend_template_map` app setting: same JSON shape (repo settings).
//
// Template sends only apply when the send goes out on the PLATFORM Resend
// key (the env key): the templates live in the platform's Resend account.
// A franchise tenant sending on its own Resend key keeps the HTML path —
// its account, its templates, a separate mapping exercise.
//
// Variable contract (Resend's rules, enforced by toResendVariables):
//   - Keys: ASCII letters/digits/underscore, SCREAMING_SNAKE, ≤ 50 chars.
//   - FIRST_NAME / LAST_NAME / EMAIL / UNSUBSCRIBE_URL are RESEND built-ins
//     and can never be passed as send variables — they are renamed to
//     RECIPIENT_FIRST_NAME / RECIPIENT_LAST_NAME / RECIPIENT_EMAIL /
//     UNSUBSCRIBE_LINK. (If a Resend template uses the built-in spellings,
//     Resend fills those from its Contacts data, not from this API.)
//   - Values: strings ≤ 2000 chars, or numbers. Booleans become "true" /
//     "false", arrays join to text, nested objects flatten one level
//     (payment.total → PAYMENT_TOTAL).
// ---------------------------------------------------------------------------

import { repo } from "../repo"

export type ResendTemplateResolution = {
  /** Resend template id or alias the send will reference. */
  ref: string
  /** Where the mapping came from — recorded in the audit snapshot. */
  source: "env" | "settings"
}

type TemplateMap = Record<string, string>

const MAP_TTL_MS = 60_000
let mapCache: { at: number; value: TemplateMap } | null = null

function parseMap(raw: unknown): TemplateMap {
  if (!raw) return {}
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {}
    const out: TemplateMap = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = String(k).trim()
      const ref = typeof v === "string" ? v.trim() : ""
      if (key && ref) out[key] = ref
    }
    return out
  } catch {
    return {}
  }
}

async function readTemplateMap(): Promise<TemplateMap> {
  if (mapCache && Date.now() - mapCache.at < MAP_TTL_MS) return mapCache.value
  let fromSettings: TemplateMap = {}
  try {
    const s = await repo.getSettings()
    fromSettings = parseMap(s.resend_template_map)
  } catch {
    // Settings unreadable — env alone still resolves; nothing fakes.
  }
  const fromEnv = parseMap(process.env.RESEND_TEMPLATE_MAP)
  const value: TemplateMap = { ...fromSettings, ...fromEnv }
  mapCache = { at: Date.now(), value }
  return value
}

/** Drop the cached map so an owner edit is picked up on the next send. */
export function clearResendTemplateMapCache() {
  mapCache = null
}

/** The Resend template configured for an app template key, or null when the
 *  key is unmapped (the send then uses the in-code HTML path — the type
 *  belongs on the owner's gap list until its template is mapped). */
export async function resolveResendTemplate(
  appTemplateKey: string,
): Promise<ResendTemplateResolution | null> {
  if (!appTemplateKey) return null
  const map = await readTemplateMap()
  const ref = map[appTemplateKey]
  if (!ref) return null
  const envMap = parseMap(process.env.RESEND_TEMPLATE_MAP)
  return { ref, source: envMap[appTemplateKey] ? "env" : "settings" }
}

// ---------------------------------------------------------------------------
// Variable construction
// ---------------------------------------------------------------------------

const RESERVED_RENAMES: Record<string, string> = {
  FIRST_NAME: "RECIPIENT_FIRST_NAME",
  LAST_NAME: "RECIPIENT_LAST_NAME",
  EMAIL: "RECIPIENT_EMAIL",
  UNSUBSCRIBE_URL: "UNSUBSCRIBE_LINK",
}

/** The bridge's variable-key converter — shared with the hosted
 *  design renderer so one variables object serves every route. */
export function resendKeyOf(raw: string): string {
  const snake = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50)
  return RESERVED_RENAMES[snake] || snake
}

function valueOf(key: string, v: unknown): string | number | undefined {
  if (v == null) return undefined
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined
  if (typeof v === "boolean") return v ? "true" : "false"
  if (v instanceof Date) return v.toISOString()
  if (Array.isArray(v)) {
    const parts = v
      .map((item) => {
        if (item == null) return ""
        if (typeof item === "object") {
          // Line-item shaped arrays (order/booking lines) read best as
          // "qty × name — price" text lines.
          const o = item as Record<string, unknown>
          const name = o.name ?? o.label ?? o.title ?? ""
          const qty = o.qty ?? o.quantity ?? ""
          const price = o.price ?? o.amount ?? ""
          return [qty ? `${qty} ×` : "", String(name), price ? `— ${price}` : ""]
            .filter(Boolean)
            .join(" ")
        }
        return String(item)
      })
      .filter(Boolean)
    if (parts.length === 0) return undefined
    return parts.join(key.endsWith("_LINES") || key === "ITEMS" ? "\n" : ", ").slice(0, 2000)
  }
  if (typeof v === "object") return undefined // nested objects flatten in the caller loop
  return String(v).slice(0, 2000)
}

/** Build the Resend variable object for a send from the caller's data.
 *  Nested objects flatten one level (payment: {total} → PAYMENT_TOTAL);
 *  null/undefined values are dropped — a template that requires a dropped
 *  variable makes Resend reject the send, which surfaces as FAILED rather
 *  than a silently incomplete email. */
export function toResendVariables(
  input: Record<string, unknown>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  const put = (rawKey: string, v: unknown) => {
    const key = resendKeyOf(rawKey)
    if (!key) return
    const value = valueOf(key, v)
    if (value !== undefined && !(key in out)) out[key] = value
  }
  for (const [k, v] of Object.entries(input)) {
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        put(`${k}_${k2}`, v2)
      }
    } else {
      put(k, v)
    }
  }
  // Resend caps nothing explicitly per send, but keep the payload sane.
  const keys = Object.keys(out)
  if (keys.length > 100) {
    for (const k of keys.slice(100)) delete out[k]
  }
  return out
}
