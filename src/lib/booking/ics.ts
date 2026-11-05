// ---------------------------------------------------------------------------
// ICS calendar events — the appointment as Google/Apple/Outlook all
// understand it. Two consumers:
//   1. The booking-confirmed EMAIL carries the .ics as an attachment
//      (Google & Outlook auto-recognize the attachment as an event).
//   2. The confirmation panel + portal link to /api/bookings/ics?bookingId=
//      (download) and to the Google/Outlook add-event URLs.
//
// The salon is in America/Chicago — the slot's wall time ("9:30 AM" on
// 2026-10-06) is converted to UTC with the REAL DST offset for that date
// (CDT -5 / CST -6), not a fixed offset.
// ---------------------------------------------------------------------------

const SALON = {
  name: "UnSaid Memories",
  // Owner-confirmed current line (matches design.ts BRAND.phone). Keep the
  // calendar attachment on the same number every other surface shows.
  address: "Memphis, TN",
  phone: "(901) 722-1114",
}

/** The America/Chicago UTC offset (ms) in effect at the given instant. */
function chicagoOffsetMs(at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const parts = dtf.formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0)
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  )
  return asUTC - at.getTime()
}

/** "9:30 AM" → minutes since midnight (570). */
function timeToMinutes(time: string): number {
  const m = String(time || "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!m) return NaN
  let h = Number(m[1]) % 12
  if (/PM/i.test(m[3])) h += 12
  return h * 60 + Number(m[2])
}

/**
 * The slot as a UTC instant. `date` is "YYYY-MM-DD" (the salon's local
 * date), `time` is the wall-clock slot ("9:30 AM"), both America/Chicago.
 */
export function slotToUtc(date: string, time: string): Date | null {
  const mins = timeToMinutes(time)
  if (!Number.isFinite(mins) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  // First guess: treat the wall time as UTC, then correct by the offset
  // that is actually in effect at that moment (handles the DST edges).
  const naive = new Date(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), Math.floor(mins / 60), mins % 60),
  )
  const offset = chicagoOffsetMs(naive)
  const utc = new Date(naive.getTime() - offset)
  // A 30-minute offset disagreement means the guess straddled a transition —
  // re-derive once with the neighboring minute's offset.
  const offset2 = chicagoOffsetMs(utc)
  if (Math.abs(offset2 - offset) > 60_000) return new Date(naive.getTime() - offset2)
  return utc
}

function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

function icsEscape(s: string): string {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

export type BookingIcsInput = {
  bookingId: string
  dogName?: string | null
  serviceNames: string[]
  date: string // YYYY-MM-DD
  time: string // "9:30 AM"
  durationMinutes?: number
  totalDisplay?: string
  balanceDisplay?: string
}

export type IcsTimes = { startUtc: string; endUtc: string }

/** The UTC ISO pair for Google/Outlook add-event URLs. */
export function bookingIcsTimes(input: BookingIcsInput): IcsTimes | null {
  const start = slotToUtc(input.date, input.time)
  if (!start) return null
  const end = new Date(start.getTime() + (input.durationMinutes || 120) * 60_000)
  return { startUtc: start.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""), endUtc: end.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "") }
}

/** A complete, valid VCALENDAR — CRLF line endings per RFC 5545. */
export function buildBookingIcs(input: BookingIcsInput): string {
  const start = slotToUtc(input.date, input.time)
  const safeStart = start || new Date()
  const end = new Date(safeStart.getTime() + (input.durationMinutes || 120) * 60_000)
  const dog = icsEscape(String(input.dogName || "your pup"))
  const services = (input.serviceNames.length > 0 ? input.serviceNames : ["Grooming appointment"]).map(icsEscape)
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UnSaid Memories//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.bookingId}@unsaidmemories.com`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(safeStart)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${dog}'s groom — UnSaid Memories`,
    `LOCATION:${icsEscape(SALON.address)}`,
    `DESCRIPTION:${icsEscape(
      [
        services.join(" + "),
        input.totalDisplay ? `Total: ${input.totalDisplay}` : "",
        input.balanceDisplay && input.balanceDisplay !== "$0.00" ? `Balance due at the salon: ${input.balanceDisplay}` : "",
        `Questions? ${SALON.phone}`,
        `Manage: https://www.unsaidmemories.com/customer/appointments`,
      ].filter(Boolean).join("\\n"),
    )}`,
    `STATUS:CONFIRMED`,
    "BEGIN:VALARM",
    "TRIGGER:-PT24H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${dog}'s groom tomorrow — UnSaid Memories`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return lines.join("\r\n") + "\r\n"
}

/** The Google Calendar "add event" URL for the confirmation panel. */
export function googleCalendarUrl(input: BookingIcsInput): string | null {
  const t = bookingIcsTimes(input)
  if (!t) return null
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${input.dogName || "Your pup"}'s groom — UnSaid Memories`,
    dates: `${t.startUtc}/${t.endUtc}`,
    location: SALON.address,
    details: `${(input.serviceNames.length > 0 ? input.serviceNames : ["Grooming appointment"]).join(" + ")}${input.totalDisplay ? ` — ${input.totalDisplay}` : ""} · Manage: https://www.unsaidmemories.com/customer/appointments`,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** The Outlook web "add event" URL for the confirmation panel. */
export function outlookCalendarUrl(input: BookingIcsInput): string | null {
  const t = bookingIcsTimes(input)
  if (!t) return null
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: `${input.dogName || "Your pup"}'s groom — UnSaid Memories`,
    startdt: t.startUtc,
    enddt: t.endUtc,
    location: SALON.address,
    body: `${(input.serviceNames.length > 0 ? input.serviceNames : ["Grooming appointment"]).join(" + ")}${input.totalDisplay ? ` — ${input.totalDisplay}` : ""}`,
  })
  return `https://outlook.live.com/calendar/0/action/compose?${params.toString()}`
}
