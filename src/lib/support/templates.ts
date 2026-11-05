// ============================================================================
// Template + signature engine (spec §10: support_templates,
// support_signatures; locale fallback; DMCA/legal locked).
//
// Rendering is mustache-lite: {{ dotted.path }} against a context of
// { ticket, requester, staff, …extras }. Unknown paths render as the
// empty string and are reported in `missing` — a template with a typo
// degrades visibly instead of leaking raw braces to a requester.
//
// Resolution (§0 inheritance + §10 lock): tenant override, else master
// default — EXCEPT a master template row with locked = true can never
// be shadowed by a tenant row for the same code (statutory wording:
// DMCA / legal). Locale chain: exact locale → its language → 'en-US' →
// any locale the code exists in.
// ============================================================================

import {
  resolveEffectiveRows, ts,
  type ConfigRow, type SupportDb, type SupportTicketRow,
} from "./engine-shared"

export interface TemplateRow extends ConfigRow {
  code: string
  name: string
  channel: string
  subject: string | null
  body: string
  locale: string
  locked: boolean
  is_active: boolean
  locked_by_master: boolean
}

export interface SignatureRow {
  id: string
  tenant_id: string
  staff_id: string
  team_id: string | null
  body: string
  is_default: boolean
}

// ── Rendering ───────────────────────────────────────────────────────

export function renderTemplateString(
  body: string,
  ctx: Record<string, unknown>,
): { text: string; missing: string[] } {
  const missing: string[] = []
  const text = body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    let cur: unknown = ctx
    for (const part of path.split(".")) {
      if (cur == null || typeof cur !== "object") { cur = undefined; break }
      cur = (cur as Record<string, unknown>)[part]
    }
    if (cur === undefined || cur === null) {
      missing.push(path)
      return ""
    }
    return String(cur)
  })
  return { text, missing }
}

/** The standard render context for a ticket. */
export function buildRenderContext(
  ticket: SupportTicketRow,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ticket: {
      id: ticket.id,
      ref: ticket.ticket_ref,
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      created_at: ts(ticket.created_at)?.toISOString() ?? null,
    },
    requester: {
      name: ticket.requester_name,
      email: ticket.requester_email,
      type: ticket.requester_type,
    },
    ...extras,
  }
}

// ── Template resolution ─────────────────────────────────────────────

function localeChain(locale: string): string[] {
  const chain = [locale]
  const lang = locale.split("-")[0]
  if (lang && lang !== locale) chain.push(lang)
  if (!chain.includes("en-US")) chain.push("en-US")
  return chain
}

export interface ResolvedTemplate {
  row: TemplateRow
  resolvedScope: "master" | "tenant"
  resolvedLocale: string
  locked: boolean
}

export async function resolveTemplate(
  db: SupportDb,
  tenantId: string,
  code: string,
  locale = "en-US",
): Promise<ResolvedTemplate | null> {
  const { rows } = await db.query<TemplateRow>(
    `SELECT * FROM public.support_templates
      WHERE code = $2 AND is_active
        AND (scope = 'master' OR tenant_id = $1::uuid)`,
    [tenantId, code],
  )
  if (rows.length === 0) return null
  // A locked master row removes tenant rows from contention entirely.
  const masterLocked = rows.some((r) => r.scope === "master" && r.locked)
  const pool = masterLocked
    ? rows.filter((r) => r.scope === "master")
    : resolveEffectiveRows(rows, tenantId)
  for (const loc of localeChain(locale)) {
    const tenantHit = pool.find((r) => r.scope === "tenant" && r.locale === loc)
    if (tenantHit) return { row: tenantHit, resolvedScope: "tenant", resolvedLocale: loc, locked: tenantHit.locked }
    const masterHit = pool.find((r) => r.scope === "master" && r.locale === loc)
    if (masterHit) return { row: masterHit, resolvedScope: "master", resolvedLocale: loc, locked: masterHit.locked }
  }
  const any = pool[0]
  return any
    ? { row: any, resolvedScope: any.scope, resolvedLocale: any.locale, locked: any.locked }
    : null
}

/** Render a resolved template's subject + body against a ticket context. */
export function renderTemplate(
  resolved: ResolvedTemplate,
  ctx: Record<string, unknown>,
): { subject: string | null; body: string; missing: string[] } {
  const body = renderTemplateString(resolved.row.body, ctx)
  const subject = resolved.row.subject
    ? renderTemplateString(resolved.row.subject, ctx)
    : null
  return {
    subject: subject?.text ?? null,
    body: body.text,
    missing: [...body.missing, ...(subject?.missing ?? [])],
  }
}

// ── Signatures ──────────────────────────────────────────────────────

/** Staff signature: team default → staff default → latest signature. */
export async function resolveSignature(
  db: SupportDb,
  tenantId: string,
  staffId: string,
  teamId?: string | null,
): Promise<string | null> {
  const { rows } = await db.query<SignatureRow>(
    `SELECT * FROM public.support_signatures
      WHERE tenant_id = $1::uuid AND staff_id = $2::uuid
      ORDER BY created_at DESC`,
    [tenantId, staffId],
  )
  if (rows.length === 0) return null
  const teamDefault = teamId ? rows.find((r) => r.team_id === teamId && r.is_default) : undefined
  if (teamDefault) return teamDefault.body
  const staffDefault = rows.find((r) => r.team_id === null && r.is_default) ?? rows.find((r) => r.is_default)
  if (staffDefault) return staffDefault.body
  return rows[0].body
}
