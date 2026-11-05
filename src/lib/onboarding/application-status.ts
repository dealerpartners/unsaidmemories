// ---------------------------------------------------------------------------
// application-status.ts — the in-flight application, as the account
// drawer tells it.
//
// The owner's identity model: ONE person, ONE customer identity; portals
// are switchable contexts of that identity (the Stripe pattern), and the
// account slide-out is the switcher. During an application — before any
// partner context exists — that same slot in the slide-out carries the
// application's live status in plain words, and tapping it resumes the
// application. On approval the slot becomes the work-console row
// (portal-session membership role → workConsoleFor) — one mechanism,
// never a parallel tracking page or an email thread.
//
// This module is the single source for: which case states count as
// in-flight, the plain-language status line per state, and the lookup
// (latest in-flight case for the signed-in person). The slide-out reads
// it through /api/auth/portal-session (an additive payload field); the
// onboarding API's find-or-resume uses the same state set.
// ---------------------------------------------------------------------------

import { pgQuery } from "@/lib/pg"

/** States in which an application is still the applicant's to finish or
 *  await. Post-decision states (ACTIVE, RESTRICTED, SUSPENDED, REJECTED,
 *  OFFBOARDED) are not in-flight applications: the earned partner context
 *  (or the decision email) carries those. */
export const IN_FLIGHT_CASE_STATES = [
  "DRAFT", "CLASSIFIED", "AGE_CLEARED", "ACCOUNT_VERIFIED", "IN_GATES",
  "NEEDS_INFO", "BLOCKED_PENDING", "READY_FOR_REVIEW", "UNDER_REVIEW", "APPROVED",
]

const TYPE_LABELS: Record<string, string> = {
  individual_seller: "Seller",
  business_seller: "Seller",
  manufacturer: "Manufacturer",
  groomer: "Groomer",
  pharmacy: "Pharmacy",
  veterinarian: "Veterinarian",
  franchise: "Franchise",
}

export function applicationTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? "Partner"
}

/** The drawer's status line for a case state — plain words, written for
 *  the applicant, true at every state the engine can be in. */
export function applicationStatusText(state: string, type: string): string {
  const label = applicationTypeLabel(type)
  switch (state) {
    case "NEEDS_INFO":
      return `Your ${label} application needs a little more information — tap to continue.`
    case "BLOCKED_PENDING":
      return `Your ${label} application needs attention — tap to review it.`
    case "READY_FOR_REVIEW":
    case "UNDER_REVIEW":
      return `Your ${label} application is waiting for approval — it will update here.`
    case "APPROVED":
      return `You're approved — we're setting up your ${label} account.`
    default:
      return `Your ${label} application is in progress — tap to continue.`
  }
}

export interface InFlightApplication {
  caseId: string
  type: string
  typeLabel: string
  state: string
  statusText: string
  href: string
}

/** The signed-in person's latest in-flight application, if any. Reads
 *  the engine's case state — the source of truth — so the drawer is
 *  never stale about where an application stands. */
export async function inFlightApplicationForUser(userId: string): Promise<InFlightApplication | null> {
  if (!userId) return null
  const rows = await pgQuery<{ id: string; type: string; state: string }>(
    `select id::text as id, type, state from public.onboarding_cases
      where user_id = $1::uuid and state = any($2)
      order by updated_at desc limit 1`,
    [userId, IN_FLIGHT_CASE_STATES],
  ).catch(() => [] as { id: string; type: string; state: string }[])
  const row = rows[0]
  if (!row) return null
  return {
    caseId: row.id,
    type: row.type,
    typeLabel: applicationTypeLabel(row.type),
    state: row.state,
    statusText: applicationStatusText(row.state, row.type),
    href: `/onboarding/${row.id}`,
  }
}
