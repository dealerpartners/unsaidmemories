// ---------------------------------------------------------------------------
// The commitment machine (M4, DOCX §3.2 / §7.5) — the ONE status vocabulary.
// A booking is one commitment (crm_appointments) with three lenses; the
// legacy bookings shape survives only as the bookings VIEW over it, whose
// status column is the legacy translation (bookingStatusFromCommitment).
// Everything new reads/writes commitment statuses; the three pre-M4 maps
// (mapAppointmentStatus, APPOINTMENT_STATUS_DISPLAY, the admin actions
// STATUS_MAP) stay in the tree marked @deprecated and are no longer on
// any live path.
//   draft -> requested(precheck) -> held (deposit) -> scheduled ->
//   checked_in -> in_service -> ready -> completed
//   terminals: cancelled, no_show, expired (legacy ABANDONED)
// Six pre-M4 values are NOT states and are never written as such:
//   deposit_paid  a money fact (commerce_payments / commerce_deposits) -> held
//   assigned      a relation (commitment_relations) — the column stays for
//                 the employee portal, the relation row is the record
//   waiting_checkin derived: now() vs starts_at, never stored -> scheduled
//   confirmed     a flag; the state is scheduled (confirm action keeps the
//                 confirmed value for palette compatibility, it is not a
//                 separate machine state going forward)
//   hold          a flag -> held
//   rescheduled   an event; the state is whatever it was rescheduled to
//                 (the reschedule action still records 'rescheduled' with
//                 history — that event value is out of M4's scope to remove)
// ---------------------------------------------------------------------------

export const COMMITMENT_STATUSES = [
  "draft",
  "precheck",
  "held",
  "scheduled",
  "assigned",
  "confirmed",
  "checked_in",
  "in_service",
  "ready",
  "completed",
  "cancelled",
  "no_show",
  "rescheduled",
  "expired",
] as const;

export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

const TERMINALS: ReadonlySet<string> = new Set(["cancelled", "no_show", "expired"]);

// Canonical display label for one commitment status, shared by every
// audience in the same change (admin list, employee schedule, customer
// portal). Legacy bookings strings normalize through the same function so
// a view row and a CRM row label identically.
export function commitmentLabel(raw: any): string {
  const s = String(raw || "").toUpperCase().replace(/[\s-]+/g, "_");
  switch (s) {
    case "DRAFT": return "Draft";
    case "PRECHECK": return "Precheck";
    case "HELD":
    case "HOLD": return "Held";
    case "SCHEDULED": return "Scheduled";
    case "ASSIGNED": return "Assigned";
    case "CONFIRMED": return "Confirmed";
    case "CHECKED_IN":
    case "CHECKEDIN": return "Checked In";
    case "IN_SERVICE":
    case "IN_PROGRESS": return "In Progress";
    case "READY":
    case "READY_FOR_PICKUP": return "Ready for pickup";
    case "COMPLETED": return "Completed";
    case "CANCELLED":
    case "CANCELED": return "Cancelled";
    case "NO_SHOW": return "No Show";
    case "RESCHEDULED": return "Rescheduled";
    case "EXPIRED":
    case "ABANDONED": return "Expired";
    case "PAYMENT_PENDING":
    case "PENDING_PAYMENT": return "Pending payment";
    case "WAITING_CHECKIN": return "Waiting check-in";
    case "DEPOSIT_PAID": return "Held";
    default: return "Scheduled";
  }
}

// Booking/app status -> commitment status. Canonical values pass through
// unchanged; legacy values map once, here, and nowhere else.
export function commitmentStatusFromBooking(appStatus: any): CommitmentStatus {
  const s = String(appStatus || "").toUpperCase().replace(/[\s-]+/g, "_");
  switch (s) {
    case "": return "precheck";
    case "PAYMENT_PENDING":
    case "PENDING_PAYMENT":
    case "PENDING":
    case "REQUESTED": return "precheck";
    case "DRAFT": return "draft";
    case "PRECHECK": return "precheck";
    case "HELD":
    case "HOLD":
    case "DEPOSIT_PAID": return "held";
    case "SCHEDULED": return "scheduled";
    case "ASSIGNED": return "assigned";
    case "WAITING_CHECKIN": return "scheduled";
    case "CONFIRMED": return "confirmed";
    case "CHECKED_IN":
    case "CHECKEDIN": return "checked_in";
    case "IN_SERVICE":
    case "IN_PROGRESS": return "in_service";
    case "READY":
    case "READY_FOR_PICKUP": return "ready";
    case "COMPLETED":
    case "COMPLETED_CHECKOUT":
    case "CHECKOUT": return "completed";
    case "CANCELLED":
    case "CANCELED":
    case "CANCEL": return "cancelled";
    case "NO_SHOW":
    case "MISSING": return "no_show";
    case "ABANDONED":
    case "EXPIRED": return "expired";
    case "RESCHEDULED": return "rescheduled";
    default: return "scheduled";
  }
}

// The admin bookings list's display status, under the M4 identical-reads
// rule: rows in the legacy vocabulary render exactly as they did before
// M4 (PAYMENT_PENDING -> "Scheduled", everything else verbatim), so no
// existing consumer matching on those strings changes behaviour. Only
// states that never appeared in this list before (the salon moved the
// commitment: checked_in / in_service / ready / no_show) get commitment
// labels — there is no old rendering to preserve for them.
export function bookingsListStatus(b: any): string {
  const legacy = String(b?.status || "");
  if (legacy === "PAYMENT_PENDING") return "Scheduled";
  if (["CONFIRMED", "CANCELLED", "CANCELED", "Completed", "ABANDONED"].includes(legacy)) return legacy;
  return commitmentLabel(b?.commitment_status || legacy);
}

// Commitment status -> legacy bookings-view status (the SQL function
// m4_commitment_status_to_booking is the same map; keep them in lockstep).
export function bookingStatusFromCommitment(commitmentStatus: any): string {
  const s = String(commitmentStatus || "").toUpperCase().replace(/[\s-]+/g, "_");
  switch (s) {
    case "DRAFT":
    case "PRECHECK": return "PAYMENT_PENDING";
    case "HELD":
    case "SCHEDULED":
    case "ASSIGNED":
    case "WAITING_CHECKIN":
    case "CONFIRMED":
    case "RESCHEDULED":
    case "HOLD":
    case "DEPOSIT_PAID": return "CONFIRMED";
    case "CHECKED_IN": return "CHECKED_IN";
    case "IN_SERVICE": return "IN_SERVICE";
    case "READY":
    case "READY_FOR_PICKUP": return "READY_FOR_PICKUP";
    case "COMPLETED": return "Completed";
    case "CANCELLED":
    case "CANCELED": return "CANCELLED";
    case "NO_SHOW": return "NO_SHOW";
    case "EXPIRED":
    case "ABANDONED": return "ABANDONED";
    default: return "PAYMENT_PENDING";
  }
}

export function isTerminalStatus(status: any): boolean {
  return TERMINALS.has(String(status || "").toLowerCase());
}

// waiting_checkin, derived — never stored (DOCX §3.2): a booked commitment
// whose start time has arrived but which has not been checked in.
export function isWaitingCheckin(
  status: any,
  startsAt: any,
  checkedInAt: any,
  nowMs: number = Date.now(),
): boolean {
  const s = String(status || "").toLowerCase();
  if (!["scheduled", "confirmed", "held"].includes(s)) return false;
  if (checkedInAt) return false;
  const t = Date.parse(startsAt || "");
  if (!Number.isFinite(t)) return false;
  return t <= nowMs;
}

// Money facts for one commitment, read from the money tables (DOCX §3.1:
// money = commerce_payments + commerce_deposits). Best-effort: null on any
// read failure so callers can fall back to the booking snapshot. The
// snapshot (paidCents on the view row) stays the displayed paid total —
// the money tables are not a consistent paid-total source for pre-M4 rows
// (a paid legacy booking's deposits sum to $0 while its payments sum past
// its paid total), so this block is additive evidence, never an override.
export async function commitmentMoney(opts: {
  bookingId?: string | null;
  commitmentId?: string | null;
  tenantId?: string | null;
}): Promise<{
  depositsCents: number;
  paymentsCents: number;
  depositRows: number;
  paymentRows: number;
} | null> {
  try {
    const { pgQuery } = await import("@/lib/pg");
    const bookingId = String(opts.bookingId || "");
    const commitmentId = String(opts.commitmentId || "");
    if (!bookingId && !commitmentId) return null;
    const dep = await pgQuery<{ cents: string; n: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS cents, COUNT(*)::text AS n
         FROM public.commerce_deposits
        WHERE (notes IS NOT NULL AND notes LIKE '{%'
               AND (notes::jsonb ->> 'bookingId') = $1)
           OR appointment_id = $2::uuid`,
      [bookingId, commitmentId || "00000000-0000-0000-0000-000000000000"],
    ).catch(() => []);
    const pay = await pgQuery<{ cents: string; n: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS cents, COUNT(*)::text AS n
         FROM public.commerce_payments
        WHERE external_reference = $1
           OR payment_number = $2`,
      [bookingId, bookingId ? `PAY-${bookingId.slice(0, 8).toUpperCase()}` : ""],
    ).catch(() => []);
    const d = dep?.[0];
    const p = pay?.[0];
    return {
      depositsCents: Math.round(Number(d?.cents || 0) * 100),
      paymentsCents: Math.round(Number(p?.cents || 0) * 100),
      depositRows: Number(d?.n || 0),
      paymentRows: Number(p?.n || 0),
    };
  } catch {
    return null;
  }
}
