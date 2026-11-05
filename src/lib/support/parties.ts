// ============================================================================
// §1 PARTIES — contact resolution: the write/read path for
// support_contacts (person · normalized email/phone · locale · timezone ·
// is_blocked · abuse_score · is_vip · optional customer_id → crm_customers,
// staff_id → crm_staff, seller_id → sellers · merged_into_id).
//
// The stores have existed since migration 20261027 — built with their
// identity design already in the schema: partial UNIQUE indexes on
// (tenant_id, email_normalized) and (tenant_id, phone_normalized) over
// live, unmerged contacts, plus a no-chain merge guard. But until B6
// nothing in the codebase referenced support_contacts at all: no intake
// resolved a contact, and support_tickets.contact_id (added 20261030)
// was never populated by any creation path. This lib is that linkage:
// every ticket creation resolves its requester to a contact and stamps
// contact_id on the ticket row.
//
// Resolution is FIND-OR-CREATE over the schema's own identity keys, in
// the order: normalized email → normalized phone → typed FK. A found
// contact keeps its identity: caller-known links fill only columns that
// are still NULL (COALESCE) — a conflicting non-null link is never
// overwritten here; reconciling two identities is the tree's merge act
// (merged_into_id), a human decision, not a side effect of intake.
//
// FAIL-SOFT by the intake contract (intake.ts): resolution returns null
// on any failure and NEVER loses or blocks a ticket — an unlinked
// ticket stands on its typed requester FKs exactly as before.
//
// support_organizations / support_contact_orgs / support_contact_notes
// stay unwritten by this lib: no intake today knows an organization for
// its requester, and notes are an agent act with no surface yet —
// inventing either write would be fiction. The ticket side accepts an
// explicit organizationId from any caller that does know one.
// ============================================================================

import type { SupportDb } from "./engine-shared"
import { phoneKey } from "./twilio"

/** Tree §1: the contact's email key — trimmed, lowercased, single value. */
export function normalizeSupportEmail(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = String(raw).trim().toLowerCase()
  return v.length >= 3 && v.includes("@") ? v : null
}

/** Tree §1: the contact's phone key — the platform's one phone
 *  normalization (twilio.ts phoneKey: digits, US leading-1 stripped). */
export function normalizeSupportPhone(raw: string | null | undefined): string | null {
  return phoneKey(raw)
}

export interface SupportContactIdentity {
  email?: string | null
  phone?: string | null
  displayName?: string | null
  customerId?: string | null
  staffId?: string | null
  sellerId?: string | null
  locale?: string | null
  timezone?: string | null
}

export interface SupportContact {
  id: string
  tenantId: string
  displayName: string | null
  emailNormalized: string | null
  phoneNormalized: string | null
  locale: string | null
  timezone: string | null
  isBlocked: boolean
  abuseScore: number
  isVip: boolean
  customerId: string | null
  staffId: string | null
  sellerId: string | null
  mergedIntoId: string | null
}

const CONTACT_COLS = `
  id::text AS id, tenant_id::text AS tenant_id, display_name,
  email_normalized, phone_normalized, locale, timezone,
  is_blocked, abuse_score, is_vip,
  customer_id::text AS customer_id, staff_id::text AS staff_id,
  seller_id::text AS seller_id, merged_into_id::text AS merged_into_id`

function mapContact(r: any): SupportContact {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    displayName: r.display_name ?? null,
    emailNormalized: r.email_normalized ?? null,
    phoneNormalized: r.phone_normalized ?? null,
    locale: r.locale ?? null,
    timezone: r.timezone ?? null,
    isBlocked: r.is_blocked === true,
    abuseScore: Number(r.abuse_score ?? 0),
    isVip: r.is_vip === true,
    customerId: r.customer_id ?? null,
    staffId: r.staff_id ?? null,
    sellerId: r.seller_id ?? null,
    mergedIntoId: r.merged_into_id ?? null,
  }
}

/** Live contacts only: merged-away and soft-deleted rows are not
 *  identities (the same predicate the schema's unique indexes use). */
const LIVE = `merged_into_id IS NULL AND deleted_at IS NULL`

async function findBy(
  db: SupportDb, tenantId: string, column: string, value: string,
): Promise<SupportContact | null> {
  const { rows } = await db.query(
    `SELECT ${CONTACT_COLS} FROM public.support_contacts
      WHERE tenant_id = $1::uuid AND ${column} = $2 AND ${LIVE}
      ORDER BY created_at ASC LIMIT 1`,
    [tenantId, value],
  )
  return rows[0] ? mapContact(rows[0]) : null
}

/**
 * Find the live contact an identity belongs to, without creating one:
 * normalized email first, then normalized phone, then the typed FK the
 * caller carries (customer, then staff, then seller). Tenant-predicated
 * in every statement — a contact in another tenant is never a match.
 */
export async function findSupportContact(
  db: SupportDb, tenantId: string, identity: SupportContactIdentity,
): Promise<SupportContact | null> {
  const email = normalizeSupportEmail(identity.email)
  if (email) {
    const byEmail = await findBy(db, tenantId, "email_normalized", email)
    if (byEmail) return byEmail
  }
  const phone = normalizeSupportPhone(identity.phone)
  if (phone) {
    const byPhone = await findBy(db, tenantId, "phone_normalized", phone)
    if (byPhone) return byPhone
  }
  if (identity.customerId) {
    const byCustomer = await findBy(db, tenantId, "customer_id", identity.customerId)
    if (byCustomer) return byCustomer
  }
  if (identity.staffId) {
    const byStaff = await findBy(db, tenantId, "staff_id", identity.staffId)
    if (byStaff) return byStaff
  }
  if (identity.sellerId) {
    const bySeller = await findBy(db, tenantId, "seller_id", identity.sellerId)
    if (bySeller) return bySeller
  }
  return null
}

/**
 * Resolve an identity to its contact, creating the contact when none
 * exists. Find-or-create over the schema's identity indexes; a create
 * that loses the race against a concurrent intake (unique violation on
 * a partial index) re-reads and returns the winner's row. A found
 * contact is topped up with caller-known links ONLY where its stored
 * value is still NULL. Fail-soft: returns null on any failure.
 */
export async function resolveSupportContact(
  db: SupportDb, tenantId: string, identity: SupportContactIdentity,
): Promise<SupportContact | null> {
  try {
    const email = normalizeSupportEmail(identity.email)
    const phone = normalizeSupportPhone(identity.phone)
    if (!email && !phone && !identity.customerId && !identity.staffId && !identity.sellerId) {
      return null // no identity signal to key a contact on
    }
    const found = await findSupportContact(db, tenantId, identity)
    if (found) {
      // Top up only what the caller knows and the row still lacks. If a
      // top-up would collide with another live contact's identity key,
      // the unique index refuses — keep the found contact as-is.
      try {
        const { rows } = await db.query(
          `UPDATE public.support_contacts
              SET display_name = COALESCE(display_name, $3),
                  email_normalized = COALESCE(email_normalized, $4),
                  phone_normalized = COALESCE(phone_normalized, $5),
                  locale = COALESCE(locale, $6),
                  timezone = COALESCE(timezone, $7),
                  customer_id = COALESCE(customer_id, $8::uuid),
                  staff_id = COALESCE(staff_id, $9::uuid),
                  seller_id = COALESCE(seller_id, $10::uuid),
                  updated_at = now()
            WHERE tenant_id = $1::uuid AND id = $2::uuid
            RETURNING ${CONTACT_COLS}`,
          [
            tenantId, found.id,
            identity.displayName ?? null, email, phone,
            identity.locale ?? null, identity.timezone ?? null,
            identity.customerId ?? null, identity.staffId ?? null,
            identity.sellerId ?? null,
          ],
        )
        return rows[0] ? mapContact(rows[0]) : found
      } catch {
        return found
      }
    }
    try {
      const { rows } = await db.query(
        `INSERT INTO public.support_contacts
           (tenant_id, display_name, email_normalized, phone_normalized,
            locale, timezone, customer_id, staff_id, seller_id)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8::uuid, $9::uuid)
         RETURNING ${CONTACT_COLS}`,
        [
          tenantId, identity.displayName ?? null, email, phone,
          identity.locale ?? null, identity.timezone ?? null,
          identity.customerId ?? null, identity.staffId ?? null,
          identity.sellerId ?? null,
        ],
      )
      return rows[0] ? mapContact(rows[0]) : null
    } catch {
      // Lost a create race — the winner's row is the contact.
      return await findSupportContact(db, tenantId, identity)
    }
  } catch {
    return null
  }
}

/** One contact by id, tenant-predicated — the read consumers use. */
export async function getSupportContact(
  db: SupportDb, tenantId: string, contactId: string,
): Promise<SupportContact | null> {
  const { rows } = await db.query(
    `SELECT ${CONTACT_COLS} FROM public.support_contacts
      WHERE tenant_id = $1::uuid AND id = $2::uuid LIMIT 1`,
    [tenantId, contactId],
  )
  return rows[0] ? mapContact(rows[0]) : null
}
