import pg from "pg"

/** The client type withPg/withPgStrict hand to their callbacks. */
export type PgClient = pg.Client
import { accrueCommissionsForAppointment, runnerFromClient } from "@/lib/crm/commissions"
import { getPg, pgConnectionString } from "@/lib/pg";
import { resolveTenantId } from "@/lib/tenant-id";

// ---------------------------------------------------------------------------
// enterprise.ts — the write paths for the owner's enterprise schema.
//
// GROUND RULE (owner's directive, stated after the Task-60 mistake):
//   The schema is ground truth. An empty table means "unwired", never
//   "unused". The fix is to build the INSERT/hook logic that populates
//   it — NEVER a parallel or simplified table.
//
// Every function here is FIND-OR-CREATE and idempotent: a retried Stripe
// event, a replayed booking sync, or a re-run backfill converges to the
// same single row. Tables written (all owner-authored):
//   crm_customers                — one CRM person per real person
//   crm_party_dependents / crm_pets — the pet registry (source_pet_id back-link)
//   crm_services                 — the service catalog (from the app catalog)
//   crm_appointments             — THE appointment registry
//   crm_appointment_pets         — appointment ↔ pet join
//   crm_appointment_services     — appointment ↔ service lines
//   crm_appointment_status_history
//   crm_staff                    — staff registry keyed by auth user
//   commerce_payment_methods     — e.g. the Stripe card method
//   commerce_payments            — THE payment ledger
//   platform_audit_log           — enterprise audit trail
// ---------------------------------------------------------------------------

export const TENANT_ID = () => resolveTenantId()

// ---------------------------------------------------------------------------
// CONNECTION FUNNEL (2026-10-24 — the department-page 500 fix).
// withPg used to open a BRAND-NEW raw pg.Client for every call: a full
// TCP+TLS+auth handshake to the pooler, one dedicated pooler client per
// call, no statement timeout, closed at the end. The enterprise catalog
// (the shop grid, facets, PDP, search — 17 call sites in
// lib/enterprise/catalog.ts alone) runs entirely through here, so every
// cold category render opened its own raw clients ON TOP OF the shared
// pool's connections, and concurrent renders across Vercel instances
// multiplied without any bound until the pooler answered EMAXCONN
// ("max client connections reached, limit: 200") and fresh renders
// threw 500 while cached pages served fine.
// Now the client is CHECKED OUT of the shared pool in lib/pg (max 5 per
// instance, 5s acquire wait, 8s statement ceiling): per-instance
// database concurrency is hard-bounded no matter how many renders fan
// out, excess work queues locally instead of storming the pooler, and
// the heavy grid/facet statements inherit the statement timeout the raw
// clients never had (they could hold a connection for ~90s).
// Contracts preserved: null on failure for withPg, throw for
// withPgStrict, and the callback still receives a dedicated client for
// the duration of the call (multi-statement transactions still pin one
// connection, which transaction-mode pooling supports).
// ---------------------------------------------------------------------------
export async function withPg<T>(fn: (client: pg.Client) => Promise<T>): Promise<T | null> {
  if (!pgConnectionString) return null
  let client: Awaited<ReturnType<typeof getPg>> | null = null
  for (let attempt = 0; attempt < 3 && !client; attempt++) {
    try {
      client = await getPg()
    } catch (e) {
      if (attempt === 2) {
        console.error("[withPg] Connection failed after 3 attempts:", e instanceof Error ? e.message : String(e))
        return null
      }
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1) ** 2))
    }
  }
  if (!client) return null
  try {
    return await fn(client)
  } catch (e) {
    console.error("[withPg] Query execution failed:", e instanceof Error ? e.message : String(e))
    return null
  } finally {
    client.release()
  }
}

/**
 * withPg, but failures THROW instead of returning null. For callers where
 * "no result" and "the database failed" must not be confused — e.g. the
 * PDP loader's existence check, where reading a transient failure as a
 * miss makes the route cache a 404 for a real product. Connection setup
 * keeps withPg's acquisition backoff; a query error propagates as thrown.
 * A successful run that finds nothing still resolves normally (the
 * caller's own null/empty handling decides what "missing" means).
 */
export async function withPgStrict<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  if (!pgConnectionString) throw new Error("[withPgStrict] no connection string configured")
  let client: Awaited<ReturnType<typeof getPg>> | null = null
  let lastErr: unknown
  for (let attempt = 0; attempt < 3 && !client; attempt++) {
    try {
      client = await getPg()
    } catch (e) {
      lastErr = e
      if (attempt < 2) await new Promise((r) => setTimeout(r, 200 * (attempt + 1) ** 2))
    }
  }
  if (!client) throw lastErr instanceof Error ? lastErr : new Error("[withPgStrict] connection failed after 3 attempts")
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

// "$25.00" | "$15 – $35" | 25 → 25 | 15 (FIRST number only — ranges never concatenate)
export function parseMoney(v: any): number {
  const m = String(v ?? "").match(/\d+(\.\d+)?/)
  const n = m ? parseFloat(m[0]) : NaN
  return isNaN(n) ? 0 : n
}

// App booking status → crm_appointments.status (his CHECK enum).
// ---------------------------------------------------------------------------
// The app->CRM status map. It was superseded by commitmentStatusFromBooking
// in lib/booking/commitment.ts while the booking module lived; that module
// was deleted 2026-10-31 (cbfdb34) and its dangling dynamic import broke the
// production build, so this map is the live fallback in syncCrmAppointment
// again. Differences from the old canonical map, kept
// here for the record: READY_FOR_PICKUP collapsed to 'completed' (erasing
// the ready moment — M4's ready state fixes that), PAYMENT_PENDING went
// to 'precheck' (kept), and anything unknown fell through to 'scheduled'.
// ---------------------------------------------------------------------------
export function mapAppointmentStatus(appStatus: any): string {
  // P0-6: Normalize spaces to underscores BEFORE comparing. Kanban writes
  // 'Checked In' (Title Case w/ space) → was uppercased to "CHECKED IN" which
  // !== "CHECKED_IN", silently falling through to 'scheduled'. Every check-in
  // was reverting.
  const s = String(appStatus || "").toUpperCase().replace(/[\s-]+/g, "_")
  if (!s) return "scheduled"
  if (s === "PAYMENT_PENDING" || s === "PENDING" || s === "REQUESTED") return "precheck"
  if (s === "CONFIRMED" || s === "SCHEDULED" || s === "ASSIGNED") return "confirmed"
  if (s === "COMPLETED" || s === "CHECKOUT" || s === "COMPLETED_CHECKOUT") return "completed"
  if (s.includes("CANCEL")) return "cancelled"
  if (s.includes("NO_SHOW") || s === "MISSING") return "no_show"
  if (s === "IN_SERVICE" || s === "CHECKED_IN") return "in_service"
  if (s === "RESCHEDULED") return "rescheduled"
  if (s === "IN_PROGRESS") return "in_service"
  if (s === "READY_FOR_PICKUP") return "completed"
  return "scheduled"
}

// "2026-09-18" + "1:30 PM" → ISO timestamptz in the salon's timezone
// (America/Chicago — the same zone his crm_settings.default_timezone uses).
export function salonStartsAt(date: any, time: any): Date | null {
  const d = String(date || "").trim()
  if (!d) return null
  const m = String(time || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  let hh = 10, mm = 0
  if (m) {
    hh = parseInt(m[1], 10)
    mm = parseInt(m[2], 10)
    const ap = (m[3] || "").toUpperCase()
    if (ap === "PM" && hh !== 12) hh += 12
    if (ap === "AM" && hh === 12) hh = 0
  }
  const [Y, M, D] = d.split("-").map((x) => parseInt(x, 10))
  if (!Y || !M || !D) return null
  // Compute the UTC instant for that wall-clock time in America/Chicago.
  const naive = Date.UTC(Y, M - 1, D, hh, mm, 0)
  const offsetMin = chicagoOffsetMinutes(new Date(naive))
  return new Date(naive - offsetMin * 60_000)
}

function chicagoOffsetMinutes(at: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    })
    const parts = dtf.formatToParts(at).reduce((acc: any, p: any) => {
      acc[p.type] = p.value
      return acc
    }, {})
    const asUTC = Date.UTC(
      parseInt(parts.year, 10), parseInt(parts.month, 10) - 1, parseInt(parts.day, 10),
      parseInt(parts.hour === "24" ? "0" : parts.hour, 10),
      parseInt(parts.minute, 10), parseInt(parts.second, 10),
    )
    return Math.round((asUTC - at.getTime()) / 60_000)
  } catch {
    return 5 * 60 // CDT fallback
  }
}

// ---------------------------------------------------------------------------
// Identity registry
// ---------------------------------------------------------------------------

// Find-or-create crm_customers by EXACT email (case-insensitive). Enriches
// names/phone and back-fills source_customer_id → the app salon row.
export async function ensureCrmCustomer(
  client: pg.Client,
  opts: {
    email: string
    firstName?: string | null
    lastName?: string | null
    phone?: string | null
    appCustomerId?: string | null
  },
): Promise<string | null> {
  const email = String(opts.email || "").trim().toLowerCase()
  if (!email) return null
  const tenant = TENANT_ID()
  const found = await client.query(
    `SELECT id::text FROM public.crm_customers WHERE tenant_id = $1 AND lower(email) = lower($2) LIMIT 1`,
    [tenant, email],
  )
  if (found.rows[0]) {
    const id = found.rows[0].id
    await client.query(
      `UPDATE public.crm_customers SET
         source_customer_id = COALESCE(NULLIF($2, ''), source_customer_id),
         first_name = COALESCE(NULLIF($3, ''), first_name),
         last_name = COALESCE(NULLIF($4, ''), last_name),
         phone = COALESCE(NULLIF($5, ''), phone),
         updated_at = now()
       WHERE id = $1`,
      [id, opts.appCustomerId || "", (opts.firstName || "").trim(), (opts.lastName || "").trim(), (opts.phone || "").trim()],
    )
    return id
  }
  const first = (opts.firstName || email.split("@")[0] || "").trim()
  const last = (opts.lastName || "").trim()
  const created = await client.query(
    `INSERT INTO public.crm_customers (tenant_id, first_name, last_name, email, phone, source_customer_id, lifecycle_stage)
     VALUES ($1, $2, $3, lower($4), $5, $6, 'new_customer')
     RETURNING id::text`,
    [tenant, first, last, email, (opts.phone || "").trim() || null, opts.appCustomerId || null],
  )
  return created.rows[0].id
}

// crm_pets.sex CHECK: male | female | unknown (lowercase only).
function normalizePetSex(sex: any): string | null {
  const s = String(sex || "").trim().toLowerCase()
  if (!s) return null
  if (s.startsWith("f")) return "female"
  if (s.startsWith("m")) return "male"
  return "unknown"
}

// Find-or-create crm_pets for one dog. Matches by source_pet_id (the app
// dogs.id back-link) first, then by primary_customer_id + name. Ensures the
// crm_party_dependents ownership link exists.
export async function ensureCrmPet(
  client: pg.Client,
  opts: {
    name: string
    breed?: string | null
    crmCustomerId: string
    appDogId?: string | null
    sex?: string | null
    color?: string | null
  },
): Promise<string | null> {
  const name = String(opts.name || "").trim()
  if (!name) return null
  const tenant = TENANT_ID()
  let id: string | null = null
  if (opts.appDogId) {
    const bySource = await client.query(
      `SELECT id::text FROM public.crm_pets WHERE tenant_id = $1 AND source_pet_id = $2 LIMIT 1`,
      [tenant, opts.appDogId],
    )
    if (bySource.rows[0]) id = bySource.rows[0].id
  }
  if (!id) {
    const byName = await client.query(
      `SELECT id::text FROM public.crm_pets WHERE tenant_id = $1 AND primary_customer_id = $2::uuid AND lower(name) = lower($3) LIMIT 1`,
      [tenant, opts.crmCustomerId, name],
    )
    if (byName.rows[0]) id = byName.rows[0].id
  }
  if (!id) {
    const created = await client.query(
      `INSERT INTO public.crm_pets (tenant_id, primary_customer_id, source_pet_id, name, species, breed, sex, color)
       VALUES ($1, $2::uuid, $3, $4, 'dog', $5, $6, $7)
       RETURNING id::text`,
      [tenant, opts.crmCustomerId, opts.appDogId || null, name, opts.breed || null, normalizePetSex(opts.sex), opts.color || null],
    )
    id = created.rows[0].id
  }
  await client.query(
    `INSERT INTO public.crm_party_dependents (tenant_id, customer_id, dependent_id, relationship, is_primary)
     VALUES ($1, $2::uuid, $3::uuid, 'owner', true)
     ON CONFLICT DO NOTHING`,
    [tenant, opts.crmCustomerId, id],
  )
  return id
}

// Find-or-create crm_services by name (case-insensitive) — populates the
// enterprise service catalog from the app catalog on first touch.
export async function ensureCrmService(
  client: pg.Client,
  opts: { name: string; price?: number | null },
): Promise<string | null> {
  const name = String(opts.name || "").trim()
  if (!name) return null
  const tenant = TENANT_ID()
  const found = await client.query(
    `SELECT id::text FROM public.crm_services WHERE tenant_id = $1 AND lower(name) = lower($2) LIMIT 1`,
    [tenant, name],
  )
  if (found.rows[0]) return found.rows[0].id
  const lower = name.toLowerCase()
  const category = lower.includes("bath") || lower.includes("brush")
    ? "bath_and_brush"
    : lower.includes("add") || lower.includes("on")
      ? "add_on"
      : "full_groom"
  const code = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const created = await client.query(
    `INSERT INTO public.crm_services (tenant_id, name, code, service_category, default_duration_minutes, default_price, deposit_required, default_deposit_amount, bookable_online)
     VALUES ($1, $2, $3, $4, 60, $5, true, 25.00, true)
     RETURNING id::text`,
    [tenant, name, code || null, category, opts.price ?? 0],
  )
  return created.rows[0].id
}

// Find-or-create the crm_staff row for an auth user (module permissions and
// groomer assignment hang off crm_staff in his model).
export async function ensureCrmStaffForUser(
  client: pg.Client,
  opts: { userId: string; displayName?: string | null; email?: string | null },
): Promise<string | null> {
  const userId = String(opts.userId || "").trim()
  if (!userId) return null
  const tenant = TENANT_ID()
  const found = await client.query(
    `SELECT id::text FROM public.crm_staff WHERE tenant_id = $1 AND user_id = $2::uuid LIMIT 1`,
    [tenant, userId],
  )
  if (found.rows[0]) return found.rows[0].id
  const name = (opts.displayName || opts.email || "Staff").toString().trim()
  const created = await client.query(
    `INSERT INTO public.crm_staff (tenant_id, user_id, display_name, first_name, email, role, is_service_staff)
     VALUES ($1, $2::uuid, $3, $4, $5, 'staff', false)
     RETURNING id::text`,
    [tenant, userId, name, name.split(" ")[0] || name, (opts.email || "").toLowerCase() || null],
  )
  return created.rows[0].id
}

// ---------------------------------------------------------------------------
// Appointment registry
// ---------------------------------------------------------------------------

export type AppointmentSyncResult = {
  crmAppointmentId: string
  crmCustomerId: string
  crmPetId: string | null
  statusChanged: boolean
}

// Sync ONE app booking row into the enterprise registry (find-or-create on
// source_appointment_id / appointment_number APT-<bookingId8>). Writes the
// pet link, the service line, and a status-history row on every transition.
export async function syncCrmAppointment(booking: any): Promise<AppointmentSyncResult | null> {
  const id = String(booking?.id || "").trim()
  const email = String(booking?.email || "").trim()
  if (!id || !email) return null // crm_appointments.customer_id is NOT NULL — no email, no registry row
  return withPg(async (client) => {
    const tenant = TENANT_ID()
    const appointmentNumber = `APT-${id.slice(0, 8).toUpperCase()}`

    // 1. The customer (enriched from the app salon row when one exists).
    let appCustomer: any = null
    if (booking.customerId) {
      const c = await client.query(`SELECT * FROM public.customers WHERE id = $1 LIMIT 1`, [String(booking.customerId)])
      appCustomer = c.rows[0] || null
    }
    if (!appCustomer) {
      const c = await client.query(`SELECT * FROM public.customers WHERE lower(email) = lower($1) LIMIT 1`, [email])
      appCustomer = c.rows[0] || null
    }
    const crmCustomerId = await ensureCrmCustomer(client, {
      email,
      firstName: booking.ownerName?.split(" ")[0] || appCustomer?.firstName || null,
      lastName: booking.ownerName?.split(" ").slice(1).join(" ") || appCustomer?.lastName || null,
      phone: booking.phone || appCustomer?.phone || null,
      appCustomerId: appCustomer?.id || booking.customerId || null,
    })
    if (!crmCustomerId) return null

    // 2. The pet.
    let crmPetId: string | null = null
    const dogName = String(booking.dogName || "").trim()
    if (dogName) {
      crmPetId = await ensureCrmPet(client, {
        name: dogName,
        breed: booking.breed || null,
        crmCustomerId,
        appDogId: booking.dogId || null,
      })
    }

    // 3. The appointment row.
    // The view row carries its commitment_id, so a view read syncs back
    // onto the same commitment instead of inserting a duplicate by
    // appointment_number. The commitment machine (lib/booking/commitment)
    // was deleted with the booking module (cbfdb34, 2026-10-31); the
    // in-file mapAppointmentStatus below is the status fallback again.
    const startsAt = salonStartsAt(booking.date, booking.time)
    // A view row carries its precise commitment_status: use it verbatim.
    // Mapping its legacy view status back would drift held/scheduled
    // (both read as CONFIRMED) into confirmed on every sync pass.
    const status = String(booking.commitment_status || "").trim()
      ? String(booking.commitment_status)
      : mapAppointmentStatus(booking.status)
    const commitmentId = String(booking.commitment_id || "").trim() || null
    const deposit = parseMoney(booking.depositAmount)
    const total = parseMoney(booking.servicePrice)
    const existing = await client.query(
      `SELECT id::text, status FROM public.crm_appointments
       WHERE tenant_id = $1 AND ($4::uuid IS NOT NULL AND id = $4::uuid
         OR source_appointment_id = $2 OR appointment_number = $3)
       LIMIT 1`,
      [tenant, id, appointmentNumber, commitmentId],
    )
    let crmAppointmentId: string
    let statusChanged = false
    if (existing.rows[0]) {
      crmAppointmentId = existing.rows[0].id
      const previousStatus = existing.rows[0].status
      // Map the app booking's groomerId (staff.id) to the CRM registry's
      // assigned_groomer_id so groomer assignment flows through on sync.
      const groomerId = booking.groomerId ? String(booking.groomerId) : null
      await client.query(
        `UPDATE public.crm_appointments SET
           starts_at = COALESCE($2, starts_at),
           status = $3,
           deposit_amount = $4,
           total = $5,
           customer_notes = COALESCE(NULLIF($6, ''), customer_notes),
           assigned_groomer_id = COALESCE($7::uuid, assigned_groomer_id),
           updated_at = now()
         WHERE id = $1`,
        [crmAppointmentId, startsAt, status, deposit, total, String(booking.notes || "").trim(), groomerId],
      )
      statusChanged = previousStatus !== status
      if (statusChanged) {
        await client.query(
          `INSERT INTO public.crm_appointment_status_history (tenant_id, appointment_id, from_status, to_status, reason, metadata)
           VALUES ($1, $2::uuid, $3, $4, $5, $6::jsonb)`,
          [tenant, crmAppointmentId, previousStatus || null, status, "app booking sync", JSON.stringify({ bookingId: id, appStatus: booking.status })],
        )
      }
    } else {
      // New registry row — carry the app booking's groomerId through as
      // assigned_groomer_id so an assigned groomer survives the sync.
      const groomerId = booking.groomerId ? String(booking.groomerId) : null
      const created = await client.query(
        `INSERT INTO public.crm_appointments
           (tenant_id, customer_id, source_appointment_id, appointment_number, starts_at, status,
            deposit_amount, total, currency, source_channel, booking_outcome, customer_notes,
            assigned_groomer_id)
         VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, 'USD', $9, 'booked', $10, $11::uuid)
         RETURNING id::text`,
        [tenant, crmCustomerId, id, appointmentNumber, startsAt, status, deposit, total,
          booking.bookingType === "CONSULTATION" ? "website_consultation" : "website_booking_wizard",
          String(booking.notes || "").trim() || null, groomerId],
      )
      crmAppointmentId = created.rows[0].id
      statusChanged = true
      await client.query(
        `INSERT INTO public.crm_appointment_status_history (tenant_id, appointment_id, from_status, to_status, reason, metadata)
         VALUES ($1, $2::uuid, NULL, $3, 'created from website booking', $4::jsonb)`,
        [tenant, crmAppointmentId, status, JSON.stringify({ bookingId: id, appStatus: booking.status })],
      )
    }

    // 4. Pet link (one row per appointment-pet).
    if (crmPetId) {
      await client.query(
        `INSERT INTO public.crm_appointment_pets (tenant_id, appointment_id, dependent_id, sequence_no)
         VALUES ($1, $2::uuid, $3::uuid, 1)
         ON CONFLICT DO NOTHING`,
        [tenant, crmAppointmentId, crmPetId],
      )
    }

    // 5. Service line (find-or-create crm_services by name).
    const serviceName = String(booking.service || "").trim()
    if (serviceName) {
      const serviceId = await ensureCrmService(client, { name: serviceName, price: total })
      if (serviceId) {
        const line = await client.query(
          `SELECT id::text FROM public.crm_appointment_services
           WHERE tenant_id = $1 AND appointment_id = $2::uuid AND service_id = $3::uuid
           LIMIT 1`,
          [tenant, crmAppointmentId, serviceId],
        )
        if (!line.rows[0]) {
          await client.query(
            `INSERT INTO public.crm_appointment_services
               (tenant_id, appointment_id, service_id, quantity, unit_price, total, status)
             VALUES ($1, $2::uuid, $3::uuid, 1, $4, $4, 'scheduled')`,
            [tenant, crmAppointmentId, serviceId, total],
          )
        }
      }
    }

    // 6. Commission accrual — a booking that syncs INTO 'completed' earns
    // the groomer's commission at their profile rate (service line above
    // is already written, so per-service accrual sees it). Idempotent:
    // re-syncs of an already-completed booking don't re-enter (statusChanged
    // gate) and the ledger check blocks duplicates regardless. Best-effort —
    // an accrual failure never fails the booking sync.
    if (status === "completed" && statusChanged) {
      try {
        await accrueCommissionsForAppointment(runnerFromClient(client), tenant, crmAppointmentId, "booking_sync")
      } catch (e) {
        console.error("[syncCrmAppointment] commission accrual failed:", e instanceof Error ? e.message : e)
      }
    }

    return { crmAppointmentId, crmCustomerId, crmPetId, statusChanged }
  })
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

// Find-or-create the Stripe card payment method (commerce_payments requires one).
export async function ensureStripeCardMethod(client: pg.Client): Promise<string | null> {
  const tenant = TENANT_ID()
  const found = await client.query(
    `SELECT id::text FROM public.commerce_payment_methods WHERE tenant_id = $1 AND code = 'stripe_card' LIMIT 1`,
    [tenant],
  )
  if (found.rows[0]) return found.rows[0].id
  const created = await client.query(
    `INSERT INTO public.commerce_payment_methods (tenant_id, code, name, method_type, processor, active)
     VALUES ($1, 'stripe_card', 'Stripe (Card)', 'card', 'stripe', true)
     RETURNING id::text`,
    [tenant],
  )
  return created.rows[0].id
}

// Find-or-create a payment method for a manual method name (cash/check/…).
export async function ensureManualPaymentMethod(client: pg.Client, method: string): Promise<string | null> {
  const raw = String(method || "manual").trim().toLowerCase()
  const code = `manual_${raw.replace(/[^a-z0-9]+/g, "_") || "manual"}`.slice(0, 40)
  const tenant = TENANT_ID()
  const found = await client.query(
    `SELECT id::text FROM public.commerce_payment_methods WHERE tenant_id = $1 AND code = $2 LIMIT 1`,
    [tenant, code],
  )
  if (found.rows[0]) return found.rows[0].id
  const type = raw === "cash" ? "cash" : raw.includes("check") ? "check" : "other"
  const label = raw.charAt(0).toUpperCase() + raw.slice(1)
  const created = await client.query(
    `INSERT INTO public.commerce_payment_methods (tenant_id, code, name, method_type, processor, active)
     VALUES ($1, $2, $3, $4, NULL, true)
     RETURNING id::text`,
    [tenant, code, label, type],
  )
  return created.rows[0].id
}

export type CommercePaymentInput = {
  paymentNumber: string
  amount: number
  status: string // pending | succeeded | failed | refunded | … (his CHECK enum)
  customerId?: string | null // crm_customers id
  processorTransactionId?: string | null // Stripe PI id
  externalReference?: string | null // Stripe Checkout Session id
  methodType?: "stripe" | "manual"
  manualMethodName?: string | null
}

// Find-or-create commerce_payments by (tenant, payment_number) — deterministic
// numbers make replays converge. Updates status/PI when the row exists.
export async function writeCommercePayment(client: pg.Client, input: CommercePaymentInput): Promise<string | null> {
  const tenant = TENANT_ID()
  if (!input.paymentNumber || !(input.amount > 0)) return null
  const methodId =
    input.methodType === "manual"
      ? await ensureManualPaymentMethod(client, input.manualMethodName || "manual")
      : await ensureStripeCardMethod(client)
  if (!methodId) return null

  const found = await client.query(
    `SELECT id::text FROM public.commerce_payments WHERE tenant_id = $1 AND payment_number = $2 LIMIT 1`,
    [tenant, input.paymentNumber],
  )
  if (found.rows[0]) {
    const id = found.rows[0].id
    await client.query(
      `UPDATE public.commerce_payments SET
         status = $2,
         customer_id = COALESCE($3::uuid, customer_id),
         processor_transaction_id = COALESCE(NULLIF($4, ''), processor_transaction_id),
         external_reference = COALESCE(NULLIF($5, ''), external_reference)
       WHERE id = $1`,
      [id, input.status, input.customerId || null, input.processorTransactionId || "", input.externalReference || ""],
    )
    return id
  }
  const created = await client.query(
    `INSERT INTO public.commerce_payments
       (tenant_id, payment_number, customer_id, payment_method_id, amount, currency, status,
        processor_transaction_id, external_reference)
     VALUES ($1, $2, $3::uuid, $4::uuid, $5, 'USD', $6, NULLIF($7, ''), NULLIF($8, ''))
     RETURNING id::text`,
    [tenant, input.paymentNumber, input.customerId || null, methodId, input.amount, input.status,
      input.processorTransactionId || "", input.externalReference || ""],
  )
  return created.rows[0].id
}

// ---------------------------------------------------------------------------
// Audit (his platform_audit_log — no parallel audit table, no fake seeds)
// ---------------------------------------------------------------------------

export async function platformAudit(
  client: pg.Client,
  entry: {
    action: string
    targetType: string
    targetId?: string | null
    actorUserId?: string | null
    actorRole?: string | null
    metadata?: Record<string, any>
  },
): Promise<void> {
  await client.query(
    `INSERT INTO lms.platform_audit_log (tenant_id, actor_user_id, actor_role, action, target_entity_type, target_entity_id, metadata)
     VALUES ($1, $2::uuid, $3, $4, $5, $6::uuid, $7::jsonb)`,
    [TENANT_ID(), entry.actorUserId || null, entry.actorRole || "system", entry.action,
      entry.targetType, entry.targetId || null, JSON.stringify(entry.metadata ?? {})],
  )
}
