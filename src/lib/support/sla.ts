// ============================================================================
// SLA clock (spec §10 + §2 clocks). Business-time computation over
// support_business_hours.schedule + support_holidays, in the business
// hours' own timezone — DST-correct via Intl (the platform's tz data),
// never via fixed offsets.
//
// Schedule jsonb shape (as seeded by the step-1 migration):
//   { "mon": [[9,17]], "tue": [[9,17]], … }   — local [startHour, endHour)
// Day keys: sun mon tue wed thu fri sat. Hours may be fractional
// (9.5 = 09:30). A local date present in the holiday set is fully
// non-business, whatever the weekday schedule says.
//
// Policy semantics (§10): the clock pauses while a ticket is pending
// or on_hold and resumes on requester reply; due timestamps are stored
// on the ticket (§2) — stampTicketSla computes and writes them, and
// evaluateTicketSla reads them back, deriving pause intervals from
// the append-only event stream (sla_paused → sla_resumed pairs, plus a
// currently-open pause when the ticket sits pending/on_hold now).
// ============================================================================

import {
  logEngineEvent, ts, iso,
  type SupportDb, type SupportTicketRow,
} from "./engine-shared"

export interface BusinessHoursDef {
  timezone: string
  /** day key → [startHour, endHour) local intervals */
  schedule: Record<string, [number, number][]>
}

export interface BusinessHoursRow {
  id: string
  timezone: string
  schedule: Record<string, [number, number][]> | string
}

export interface SlaPolicyRow {
  id: string
  first_response_minutes: number | null
  next_reply_minutes: number | null
  resolution_minutes: number | null
  uses_business_hours: boolean
  business_hours_id: string | null
}

export function parseBusinessHours(row: BusinessHoursRow): BusinessHoursDef {
  const schedule = typeof row.schedule === "string" ? JSON.parse(row.schedule) : row.schedule
  return { timezone: row.timezone || "UTC", schedule: schedule ?? {} }
}

/** Holiday local dates ('YYYY-MM-DD') for one business-hours calendar. */
export function holidayDateSet(
  rows: { holiday_date: string | Date; business_hours_id?: string | null }[],
  businessHoursId?: string | null,
): Set<string> {
  const set = new Set<string>()
  for ( const r of rows) {
    if (businessHoursId && r.business_hours_id && r.business_hours_id !== businessHoursId) continue
    const d = r.holiday_date instanceof Date ? r.holiday_date : new Date(r.holiday_date)
    // holiday_date is a DATE column: pg hands back a UTC-midnight Date
    // (or the bare string) — the calendar date is its UTC date.
    const s = typeof r.holiday_date === "string" ? r.holiday_date.slice(0, 10) : d.toISOString().slice(0, 10)
    set.add(s)
  }
  return set
}

// ── Zoned-time primitives ───────────────────────────────────────────
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
const dtfCache = new Map<string, Intl.DateTimeFormat>()

function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    })
    dtfCache.set(tz, f)
  }
  return f
}

interface ZonedParts { y: number; mo: number; d: number; h: number; mi: number; s: number }

function zonedParts(instant: Date, tz: string): ZonedParts {
  const parts = dtf(tz).formatToParts(instant)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour") % 24, mi: get("minute"), s: get("second") }
}

/** Offset of tz at an instant: (wall-clock-as-UTC) − UTC, in ms. */
function offsetMs(instant: Date, tz: string): number {
  const p = zonedParts(instant, tz)
  const wall = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s)
  return wall - Math.floor(instant.getTime() / 1000) * 1000
}

/** UTC ms for a local wall time in tz (two-pass offset refinement). */
function zonedTimeToUtcMs(tz: string, y: number, mo: number, d: number, minutesOfDay: number): number {
  const h = Math.floor(minutesOfDay / 60)
  const mi = Math.floor(minutesOfDay % 60)
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0)
  let utc = guess - offsetMs(new Date(guess), tz)
  utc = guess - offsetMs(new Date(utc), tz)
  return utc
}

function dateKey(y: number, mo: number, d: number): string {
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

/** Business windows (UTC ms [start, end)) for one local calendar date. */
function windowsForLocalDate(
  y: number, mo: number, d: number,
  def: BusinessHoursDef, holidays: Set<string>,
): [number, number][] {
  if (holidays.has(dateKey(y, mo, d))) return []
  const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
  const intervals = def.schedule[DAY_KEYS[weekday]] ?? []
  return intervals
    .map(([s, e]) => [
      zonedTimeToUtcMs(def.timezone, y, mo, d, s * 60),
      zonedTimeToUtcMs(def.timezone, y, mo, d, e * 60),
    ] as [number, number])
    .sort((a, b) => a[0] - b[0])
}

/** Local calendar dates (y/mo/d triples) from a's date to b's date, inclusive. */
function localDateRange(a: Date, b: Date, tz: string): [number, number, number][] {
  const pa = zonedParts(a, tz)
  const pb = zonedParts(b, tz)
  const out: [number, number, number][] = []
  let cur = Date.UTC(pa.y, pa.mo - 1, pa.d)
  const end = Date.UTC(pb.y, pb.mo - 1, pb.d)
  while (cur <= end) {
    const dt = new Date(cur)
    out.push([dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()])
    cur += 86400000
  }
  return out
}

// ── Business-time arithmetic ────────────────────────────────────────

/** Business minutes in [a, b]. Signed: negative when b < a. */
export function businessMinutesBetween(
  a: Date, b: Date, def: BusinessHoursDef, holidays: Set<string>,
): number {
  if (a.getTime() === b.getTime()) return 0
  if (b.getTime() < a.getTime()) return -businessMinutesBetween(b, a, def, holidays)
  let ms = 0
  for (const [y, mo, d] of localDateRange(a, b, def.timezone)) {
    for (const [ws, we] of windowsForLocalDate(y, mo, d, def, holidays)) {
      const lo = Math.max(ws, a.getTime())
      const hi = Math.min(we, b.getTime())
      if (hi > lo) ms += hi - lo
    }
  }
  return Math.round((ms / 60000) * 1000) / 1000
}

/** The instant `minutes` business minutes after `start`. */
export function addBusinessMinutes(
  start: Date, minutes: number, def: BusinessHoursDef, holidays: Set<string>,
): Date {
  if (minutes <= 0) return new Date(start)
  let t = start.getTime()
  let remaining = minutes
  const p0 = zonedParts(start, def.timezone)
  let cur = Date.UTC(p0.y, p0.mo - 1, p0.d)
  for (let day = 0; day < 3700; day++) {
    const dt = new Date(cur)
    const windows = windowsForLocalDate(
      dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), def, holidays,
    )
    for (const [ws, we] of windows) {
      if (t >= we) continue
      if (t < ws) t = ws
      const avail = (we - t) / 60000
      if (remaining <= avail) return new Date(t + remaining * 60000)
      remaining -= avail
      t = we
    }
    cur += 86400000
  }
  throw new Error("addBusinessMinutes: no business window found within 3700 days")
}

export function isWithinBusinessHours(
  instant: Date, def: BusinessHoursDef, holidays: Set<string>,
): boolean {
  const p = zonedParts(instant, def.timezone)
  return windowsForLocalDate(p.y, p.mo, p.d, def, holidays)
    .some(([ws, we]) => instant.getTime() >= ws && instant.getTime() < we)
}

/** Wall-clock minutes in [a, b] — the non-business-hours basis. */
export function wallMinutesBetween(a: Date, b: Date): number {
  return Math.round(((b.getTime() - a.getTime()) / 60000) * 1000) / 1000
}

// ── Due-date computation (§2 clocks, snapshotted at creation) ──────

export interface SlaDues {
  firstResponseDueAt: string | null
  nextReplyDueAt: string | null
  resolutionDueAt: string | null
}

export function computeDueDates(
  policy: SlaPolicyRow,
  createdAt: Date,
  def: BusinessHoursDef | null,
  holidays: Set<string>,
): SlaDues {
  const add = (mins: number | null): string | null => {
    if (mins == null) return null
    if (policy.uses_business_hours && def) {
      return addBusinessMinutes(createdAt, mins, def, holidays).toISOString()
    }
    return new Date(createdAt.getTime() + mins * 60000).toISOString()
  }
  return {
    firstResponseDueAt: add(policy.first_response_minutes),
    nextReplyDueAt: add(policy.next_reply_minutes),
    resolutionDueAt: add(policy.resolution_minutes),
  }
}

/** Persist a policy assignment + its due stamps onto a ticket (§2). */
export async function stampTicketSla(
  db: SupportDb,
  tenantId: string,
  ticket: Pick<SupportTicketRow, "id" | "created_at">,
  policy: SlaPolicyRow,
  def: BusinessHoursDef | null,
  holidays: Set<string>,
): Promise<SlaDues> {
  const created = ts(ticket.created_at) ?? new Date()
  const dues = computeDueDates(policy, created, def, holidays)
  await db.query(
    `UPDATE public.support_tickets
        SET sla_policy_id = $3::uuid, business_hours_id = $4::uuid,
            first_response_due_at = $5::timestamptz,
            next_reply_due_at = $6::timestamptz,
            resolution_due_at = $7::timestamptz,
            updated_at = now()
      WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [
      tenantId, ticket.id, policy.id, policy.business_hours_id,
      dues.firstResponseDueAt, dues.nextReplyDueAt, dues.resolutionDueAt,
    ],
  )
  await logEngineEvent(db, tenantId, ticket.id, {
    type: "sla_assigned", actorType: "system",
    detail: { sla_policy_id: policy.id, ...dues },
  })
  return dues
}

// ── Live evaluation ─────────────────────────────────────────────────

export interface SlaPauseInterval { start: Date; end: Date | null }

/** Pause intervals from the event stream + the ticket's current state. */
export function derivePauseIntervals(
  ticket: SupportTicketRow,
  events: { event_type: string; created_at: string | Date }[],
): SlaPauseInterval[] {
  const intervals: SlaPauseInterval[] = []
  let open: Date | null = null
  const sorted = [...events].sort(
    (x, y) => (ts(x.created_at)?.getTime() ?? 0) - (ts(y.created_at)?.getTime() ?? 0),
  )
  for (const e of sorted) {
    const at = ts(e.created_at)
    if (!at) continue
    if (e.event_type === "sla_paused" && !open) open = at
    if (e.event_type === "sla_resumed" && open) {
      intervals.push({ start: open, end: at })
      open = null
    }
  }
  const pausedNow = !!ticket.on_hold || ticket.status === "pending"
  if (!open && pausedNow) {
    // The desk enters pending/on_hold without always writing sla_paused;
    // fall back to the ticket's last update as the pause start.
    open = ts(ticket.updated_at) ?? ts(ticket.created_at)
  }
  if (open) intervals.push({ start: open, end: null })
  return intervals
}

export interface SlaClockState {
  dueAt: string | null
  state: "met" | "breached" | "warning" | "ok" | "paused" | "none"
  /** Elapsed time in the policy's basis (business or wall), pause-adjusted. */
  elapsedMinutes: number | null
  /** Budget − elapsed; negative once breached. */
  remainingMinutes: number | null
  breachedAt: string | null
}

export interface SlaEvaluation {
  firstResponse: SlaClockState
  resolution: SlaClockState
  pausedNow: boolean
  pauseIntervals: { start: string; end: string | null }[]
}

/**
 * Load everything evaluateTicketSla needs for one ticket (its stamped
 * policy, that policy's business-hours calendar + holidays, and the
 * ticket's event stream for pause derivation) and evaluate it. The
 * desk detail reads through here; a ticket with no policy stamped
 * evaluates to null — no SLA is an honest state, not an error.
 */
export async function loadSlaEvaluation(
  db: SupportDb,
  tenantId: string,
  ticket: SupportTicketRow,
  now: Date = new Date(),
): Promise<{ policy: SlaPolicyRow; evaluation: SlaEvaluation } | null> {
  if (!ticket.sla_policy_id) return null
  const { rows: policies } = await db.query<SlaPolicyRow>(
    `SELECT * FROM public.support_sla_policies WHERE id = $1::uuid LIMIT 1`,
    [ticket.sla_policy_id],
  )
  const policy = policies[0]
  if (!policy) return null
  let def: BusinessHoursDef | null = null
  let holidays = new Set<string>()
  if (policy.business_hours_id) {
    const { rows: hoursRows } = await db.query<BusinessHoursRow>(
      `SELECT * FROM public.support_business_hours WHERE id = $1::uuid LIMIT 1`,
      [policy.business_hours_id],
    )
    if (hoursRows[0]) def = parseBusinessHours(hoursRows[0])
    const { rows: holidayRows } = await db.query<{ holiday_date: string; business_hours_id: string }>(
      `SELECT holiday_date::text AS holiday_date, business_hours_id::text AS business_hours_id
         FROM public.support_holidays WHERE business_hours_id = $1::uuid`,
      [policy.business_hours_id],
    )
    holidays = holidayDateSet(holidayRows, policy.business_hours_id)
  }
  const { rows: events } = await db.query<{ event_type: string; created_at: string }>(
    `SELECT event_type, created_at::text AS created_at
       FROM public.support_ticket_events
      WHERE tenant_id = $1::uuid AND ticket_id = $2::uuid
      ORDER BY created_at ASC`,
    [tenantId, ticket.id],
  )
  return { policy, evaluation: evaluateTicketSla(ticket, policy, def, holidays, events, now) }
}

export function evaluateTicketSla(
  ticket: SupportTicketRow,
  policy: SlaPolicyRow | null,
  def: BusinessHoursDef | null,
  holidays: Set<string>,
  events: { event_type: string; created_at: string | Date }[],
  now: Date = new Date(),
  opts: { warningMinutes?: number } = {},
): SlaEvaluation {
  const warningMinutes = opts.warningMinutes ?? 30
  const useBusiness = !!(policy?.uses_business_hours && def)
  const basis = (a: Date, b: Date) =>
    useBusiness ? businessMinutesBetween(a, b, def as BusinessHoursDef, holidays)
                : wallMinutesBetween(a, b)
  const created = ts(ticket.created_at) ?? now
  const pauses = derivePauseIntervals(ticket, events)
  const pausedNow = pauses.length > 0 && pauses[pauses.length - 1].end === null

  const pausedMinutesWithin = (from: Date, to: Date): number => {
    let sum = 0
    for (const p of pauses) {
      const s = Math.max(p.start.getTime(), from.getTime())
      const e = Math.min((p.end ?? to).getTime(), to.getTime())
      if (e > s) sum += basis(new Date(s), new Date(e))
    }
    return sum
  }

  // First response: pauses never apply before the first public reply.
  const frDue = ts(ticket.first_response_due_at)
  const frActual = ts(ticket.first_public_reply_at)
  let firstResponse: SlaClockState
  if (!frDue) {
    firstResponse = { dueAt: null, state: "none", elapsedMinutes: null, remainingMinutes: null, breachedAt: iso(ticket.first_response_breached_at) }
  } else if (frActual) {
    const met = frActual.getTime() <= frDue.getTime()
    firstResponse = {
      dueAt: frDue.toISOString(),
      state: met ? "met" : "breached",
      elapsedMinutes: basis(created, frActual),
      remainingMinutes: basis(frActual, frDue),
      breachedAt: iso(ticket.first_response_breached_at) ?? (met ? null : frDue.toISOString()),
    }
  } else {
    const elapsed = basis(created, now)
    const budget = basis(created, frDue)
    const remaining = budget - elapsed
    firstResponse = {
      dueAt: frDue.toISOString(),
      state: remaining < 0 ? "breached" : remaining <= warningMinutes ? "warning" : "ok",
      elapsedMinutes: elapsed,
      remainingMinutes: remaining,
      breachedAt: iso(ticket.first_response_breached_at) ?? (remaining < 0 ? frDue.toISOString() : null),
    }
  }

  // Resolution: elapsed is pause-adjusted (§10).
  const resDue = ts(ticket.resolution_due_at)
  const resolvedAt = ts(ticket.resolved_at) ?? ts(ticket.closed_at)
  let resolution: SlaClockState
  if (!resDue) {
    resolution = { dueAt: null, state: "none", elapsedMinutes: null, remainingMinutes: null, breachedAt: iso(ticket.resolution_breached_at) }
  } else {
    const budget = basis(created, resDue)
    const end = resolvedAt ?? now
    const elapsed = basis(created, end) - pausedMinutesWithin(created, end)
    const remaining = budget - elapsed
    let state: SlaClockState["state"]
    if (resolvedAt) state = remaining >= 0 ? "met" : "breached"
    else if (remaining < 0) state = "breached"
    else if (pausedNow) state = "paused"
    else if (remaining <= warningMinutes) state = "warning"
    else state = "ok"
    resolution = {
      dueAt: resDue.toISOString(),
      state,
      elapsedMinutes: Math.round(elapsed * 1000) / 1000,
      remainingMinutes: Math.round(remaining * 1000) / 1000,
      breachedAt: iso(ticket.resolution_breached_at) ?? (state === "breached" ? resDue.toISOString() : null),
    }
  }

  return {
    firstResponse,
    resolution,
    pausedNow,
    pauseIntervals: pauses.map((p) => ({ start: p.start.toISOString(), end: iso(p.end) })),
  }
}
