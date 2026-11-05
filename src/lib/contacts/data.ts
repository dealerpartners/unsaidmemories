import { withPg, TENANT_ID } from "@/lib/crm/enterprise";

/**
 * Contacts workspace data (server-side) — the ERP Contacts page
 * (QuickBooks-spec master-detail workspace, /admin/customers).
 *
 * Contacts are crm_customers rows. Money figures are computed from the
 * same records the profile's Transaction List renders:
 *   - Open balance / overdue: acct_ar_invoices, balance per invoice =
 *     total − amount_paid − amount_credited − deposit_paid, over OPEN
 *     invoices (status NOT IN paid/void/cancelled/closed/rejected) —
 *     the computeOutstandingBalance rule in lib/admin/customer-metrics,
 *     with overdue = the same balance restricted to due_date < today.
 *   - Invoice identity match mirrors the payments ledger route and the
 *     directory route: source_customer_id is one of the contact's
 *     stored keys { crm_customers.id, crm_customers.source_customer_id },
 *     or the invoice's AR customer carries one of those keys as
 *     acct_customers.external_customer_id.
 * Nothing here reads the unmaintained crm_customers.outstanding_balance
 * or lifetime_value columns.
 */

export type ContactListItem = {
  id: string;
  source_customer_id: string | null;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  customer_type: string | null;
  lifecycle_stage: string | null;
  balance: number;
  updated_at: string | null;
  created_at: string | null;
};

export type Contact = {
  id: string;
  source_customer_id: string | null;
  external_customer_number: string | null;
  customer_type: string | null;
  lifecycle_stage: string | null;
  lifecycle_status: string | null;
  lead_status: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  preferred_contact_method: string | null;
  preferred_language: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  lead_source_id: string | null;
  customer_since: string | null;
  last_activity_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  lead_source_name: string | null;
};

export type ContactSummary = {
  openBalance: number;
  overdueBalance: number;
};

export type ContactTicket = {
  id: string;
  ticket_ref: string | null;
  subject: string | null;
  status: string | null;
  priority: string | null;
  source_channel: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_message_at: string | null;
};

export function contactDisplayName(c: {
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
  company_name?: string | null;
  email?: string | null;
}): string {
  const personal = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  if (personal) return c.preferred_name ? `${personal} (${c.preferred_name})` : personal;
  if (c.company_name) return c.company_name;
  return c.email || "Unnamed contact";
}

const OPEN_INVOICE_STATUS = `('paid','void','cancelled','closed','rejected')`;

/** The master list: contacts ordered most-recently-updated first, each
 *  with its computed open balance (same expression the directory route
 *  and the detail metrics use). */
export async function listContacts(): Promise<ContactListItem[]> {
  const tenant = TENANT_ID();
  const rows = await withPg(async (c) => {
    const r = await c.query(
      `SELECT c.id::text AS id, c.source_customer_id,
              c.first_name, c.last_name, c.preferred_name, c.company_name,
              c.email, c.phone, c.mobile_phone,
              c.customer_type, c.lifecycle_stage,
              c.updated_at::text AS updated_at, c.created_at::text AS created_at,
              COALESCE((SELECT SUM(i.total - i.amount_paid - i.amount_credited - i.deposit_paid)
                          FROM public.acct_ar_invoices i
                         WHERE i.tenant_id = c.tenant_id
                           AND i.status NOT IN ${OPEN_INVOICE_STATUS}
                           AND (i.source_customer_id = ANY(ARRAY[c.id::text, c.source_customer_id::text])
                                OR i.customer_id IN (SELECT ac.id FROM public.acct_customers ac
                                                      WHERE ac.tenant_id = c.tenant_id
                                                        AND ac.external_customer_id = ANY(ARRAY[c.id::text, c.source_customer_id::text])))), 0)::float8 AS balance
         FROM public.crm_customers c
        WHERE c.tenant_id = $1
          AND c.merged_into_customer_id IS NULL
        ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC
        LIMIT 200`,
      [tenant],
    );
    return r.rows as ContactListItem[];
  });
  return rows ?? [];
}

export async function getContact(id: string): Promise<Contact | null> {
  const tenant = TENANT_ID();
  const row = await withPg(async (c) => {
    const r = await c.query(
      `SELECT id::text AS id, source_customer_id, external_customer_number,
              customer_type, lifecycle_stage, lifecycle_status, lead_status,
              first_name, middle_name, last_name, preferred_name, company_name,
              email, phone, mobile_phone,
              preferred_contact_method, preferred_language,
              address_line1, address_line2, city, state, postal_code, country,
              lead_source_id::text AS lead_source_id,
              customer_since::text AS customer_since,
              last_activity_at::text AS last_activity_at,
              created_at::text AS created_at, updated_at::text AS updated_at
         FROM public.crm_customers
        WHERE tenant_id = $1 AND id::text = $2
          AND merged_into_customer_id IS NULL
        LIMIT 1`,
      [tenant, id],
    );
    return (r.rows[0] as Contact) ?? null;
  });
  if (!row) return null;

  // Optional enrichment: the lead-source name for the header chip.
  // Isolated so a missing/renamed lookup table can never sink the page.
  if (row.lead_source_id) {
    const name = await withPg(async (c) => {
      const r = await c.query(
        `SELECT name FROM public.crm_lead_sources WHERE id::text = $1 LIMIT 1`,
        [row.lead_source_id],
      );
      return (r.rows[0] as { name?: string } | undefined)?.name ?? null;
    });
    row.lead_source_name = name ?? null;
  } else {
    row.lead_source_name = null;
  }
  return row;
}

function identityIds(contact: Pick<Contact, "id" | "source_customer_id">): string[] {
  const ids = [contact.id];
  if (contact.source_customer_id && !ids.includes(contact.source_customer_id)) {
    ids.push(contact.source_customer_id);
  }
  return ids;
}

/** Open balance + overdue from acct_ar_invoices (see header note). */
export async function getContactSummary(
  contact: Pick<Contact, "id" | "source_customer_id">,
): Promise<ContactSummary> {
  const tenant = TENANT_ID();
  const ids = identityIds(contact);
  const out = await withPg(async (c) => {
    const r = await c.query(
      `SELECT
         COALESCE(SUM(i.total - i.amount_paid - i.amount_credited - i.deposit_paid)
           FILTER (WHERE i.status NOT IN ${OPEN_INVOICE_STATUS}), 0)::float8 AS open_balance,
         COALESCE(SUM(i.total - i.amount_paid - i.amount_credited - i.deposit_paid)
           FILTER (WHERE i.status NOT IN ${OPEN_INVOICE_STATUS}
                     AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE), 0)::float8 AS overdue_balance
       FROM public.acct_ar_invoices i
       WHERE i.tenant_id = $1
         AND (i.source_customer_id = ANY($2::text[])
              OR i.customer_id IN (SELECT ac.id FROM public.acct_customers ac
                                    WHERE ac.tenant_id = $1
                                      AND ac.external_customer_id = ANY($2::text[])))`,
      [tenant, ids],
    );
    const row = r.rows[0] as { open_balance?: number; overdue_balance?: number } | undefined;
    return {
      openBalance: Number(row?.open_balance) || 0,
      overdueBalance: Number(row?.overdue_balance) || 0,
    };
  });
  return out ?? { openBalance: 0, overdueBalance: 0 };
}

/** Support tickets for this contact. support_tickets carries the
 *  requester on stored keys (requester_customer_id / requester_email) —
 *  matched against the contact's stored identity set + email, the same
 *  way the support desk's own data path keys requesters. */
export async function getContactTickets(
  contact: Pick<Contact, "id" | "source_customer_id" | "email">,
): Promise<ContactTicket[]> {
  const tenant = TENANT_ID();
  const ids = identityIds(contact);
  const email = contact.email || "";
  const rows = await withPg(async (c) => {
    const r = await c.query(
      `SELECT id::text AS id, ticket_ref, subject, status, priority, source_channel,
              created_at::text AS created_at, updated_at::text AS updated_at,
              last_message_at::text AS last_message_at
         FROM public.support_tickets
        WHERE tenant_id = $1
          AND deleted_at IS NULL
          AND (requester_customer_id::text = ANY($2::text[])
               OR ($3 <> '' AND lower(requester_email) = lower($3)))
        ORDER BY created_at DESC
        LIMIT 100`,
      [tenant, ids, email],
    );
    return r.rows as ContactTicket[];
  });
  return rows ?? [];
}
