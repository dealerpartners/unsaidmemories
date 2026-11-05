import { notifySupportStaff } from "./notifications"

export interface MentionAuthor {
  staffId: string
  label: string
}

// ============================================================================
// §8 @MENTIONS in internal notes (support-gaps build).
//
// notifications.ts carried the honest header for the whole lineage:
// "@mentions need no separate path once §8 lands a mention PARSER —
// none existed." This is that parser.
//
// TOKEN GRAMMAR: `@<token>` where token is [A-Za-z0-9._-]+ at a word
// boundary. A token MATCHES a staffer of the tenant when it equals,
// case-insensitively, the staffer's email local-part or their name
// slug (display name / "first last" with spaces and punctuation
// folded to '-': @brea-stewart). SILENT CORRECTNESS (the tree's
// rule): a token that matches NOBODY notifies nobody and says so
// nowhere in the UI; a token that matches MORE THAN ONE staffer is
// ambiguous and also notifies nobody — a wrong-person notification
// is worse than a missed one.
//
// DELIVERY: each matched staffer gets exactly ONE notification per
// note, through notifySupportStaff (kind 'mention', channel 'in_app'
// — a mention is a desk event; the recipient's §10 prefs still apply
// inside the notification path). The author never notifies
// themselves. The note body itself is stored untouched — the desk
// renders the mention from the same grammar.
// ============================================================================

const MENTION_RE = /(^|[\s(])@([A-Za-z0-9][A-Za-z0-9._-]*)/g

export function extractMentionTokens(body: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of String(body || "").matchAll(MENTION_RE)) {
    const token = m[2].toLowerCase()
    if (!seen.has(token)) {
      seen.add(token)
      out.push(token)
    }
  }
  return out
}

function nameSlug(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

interface StaffRow {
  id: string
  display_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
}

/** Resolve tokens to staff rows: token → exactly one staffer or none. */
export async function resolveMentions(
  client: any, tenantId: string, tokens: string[],
): Promise<StaffRow[]> {
  if (!tokens.length) return []
  const r = await client.query(
    `SELECT id::text AS id, display_name, first_name, last_name, email
       FROM public.crm_staff WHERE tenant_id = $1::uuid`,
    [tenantId],
  )
  const byKey = new Map<string, StaffRow[]>()
  const add = (key: string, row: StaffRow) => {
    if (!key) return
    const list = byKey.get(key) ?? []
    if (!list.some((x) => x.id === row.id)) list.push(row)
    byKey.set(key, list)
  }
  for (const row of r.rows as StaffRow[]) {
    if (row.email) add(row.email.split("@")[0].toLowerCase(), row)
    add(nameSlug(row.display_name), row)
    add(nameSlug(row.first_name, row.last_name), row)
    if (row.first_name) add(row.first_name.toLowerCase(), row)
  }
  const out: StaffRow[] = []
  const picked = new Set<string>()
  for (const token of tokens) {
    const matches = byKey.get(token) ?? []
    if (matches.length === 1 && !picked.has(matches[0].id)) {
      picked.add(matches[0].id)
      out.push(matches[0])
    }
    // 0 matches: not staff — silent. >1: ambiguous — silent.
  }
  return out
}

/**
 * Parse a note body and notify each uniquely-matched staffer once.
 * Returns the notified staff ids (for tests/audit; the UI shows
 * nothing about unmatched tokens). Fail-soft: a mention failure
 * never fails the note that carries it.
 */
export async function notifyMentions(
  client: any,
  args: {
    tenantId: string
    ticketId: string
    ticketRef: string | null
    body: string
    author: MentionAuthor | null
  },
): Promise<string[]> {
  try {
    const tokens = extractMentionTokens(args.body)
    if (!tokens.length) return []
    const staff = await resolveMentions(client, args.tenantId, tokens)
    const notified: string[] = []
    for (const s of staff) {
      if (args.author && s.id === args.author.staffId) continue
      const ok = await notifySupportStaff(client, args.tenantId, {
        recipientStaffId: s.id,
        kind: "mention",
        channel: "in_app",
        ticketId: args.ticketId,
        ref: args.ticketRef,
      })
      if (ok) notified.push(s.id)
    }
    return notified
  } catch {
    return []
  }
}
