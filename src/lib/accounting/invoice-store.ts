// ---------------------------------------------------------------------------
// invoice-store.ts — shared helpers for the SINGLE invoice record:
// public.acct_ar_invoices (the enterprise AR table).
//
// Consolidation (2026-10-13, Sunny's ruling): the duplicate storefront
// table public.invoices was migrated into acct_ar_invoices and dropped.
// Every invoice reader/writer goes through this table now.
//
// Conventions held across all writers/readers:
//   - customer_id        = the tenant's acct_customers row (FK, required)
//   - source_customer_id = the ORIGINAL customer id from the caller's id
//                          space (salon `customers` id or crm_customers
//                          id), preserved verbatim — most lookups by a
//                          source-space id match on this column, or on
//                          the acct customer whose external_customer_id
//                          equals it.
//   - booking linkage    = appointment_id (crm_appointments FK) for
//                          CRM-appointment invoices; booking_id (text)
//                          for storefront `bookings`-registry invoices.
//   - money counters are DISJOINT: balance owed =
//       total - amount_paid - amount_credited - deposit_paid
//     (amount_paid = tendered payments, deposit_paid = deposits applied,
//     amount_credited = credits). Status derives from their sum:
//     0 -> 'posted', < total -> 'partially_paid', >= total -> 'paid'.
//   - statuses are the acct_document_status enum (NO 'sent' value —
//     sent_at carries that fact). API boundaries translate to the
//     legacy UI labels with acctStatusToLegacy().
// ---------------------------------------------------------------------------

export type SqlFn = (text: string, params?: unknown[]) => Promise<any[]>;

/** acct_document_status -> the status labels the invoice UIs render. */
export function acctStatusToLegacy(status: unknown): string {
  switch (String(status ?? "").toLowerCase()) {
    case "paid": return "PAID";
    case "partially_paid": return "PARTIAL";
    case "posted": return "OPEN";
    case "void": return "VOID";
    case "cancelled": return "CANCELLED";
    case "draft": return "DRAFT";
    case "closed": return "CLOSED";
    case "approved": return "APPROVED";
    case "pending_approval": return "PENDING_APPROVAL";
    case "rejected": return "REJECTED";
    default: return String(status ?? "OPEN").toUpperCase();
  }
}

/** Legacy/UI status label -> acct_document_status value. */
export function legacyStatusToAcct(status: unknown): string {
  switch (String(status ?? "").toUpperCase()) {
    case "PAID": return "paid";
    case "PARTIAL": case "PARTIALLY_PAID": return "partially_paid";
    case "VOID": case "VOIDED": return "void";
    case "CANCELLED": case "CANCELED": return "cancelled";
    case "DRAFT": return "draft";
    default: return "posted"; // OPEN / UNPAID / SENT / VIEWED / OVERDUE
  }
}

/** The tenant's accounting entity id (acct_ar_invoices.entity_id). */
export async function resolveEntityId(q: SqlFn, tenantId: string): Promise<string | null> {
  const rows = await q(
    `SELECT id::text AS id FROM public.acct_entities WHERE tenant_id = $1 LIMIT 1`,
    [tenantId],
  );
  return rows[0]?.id ?? null;
}

/**
 * Resolve the tenant's AR customer for a source-space customer id,
 * creating the acct_customers row when none exists yet. The AR account
 * is the TENANT'S OWN chart-of-accounts '1200' row (the composite FK
 * (tenant_id, ar_account_id) requires the tenant's own row). Throws
 * when the tenant has no entity/AR account configured — an invoice
 * must never be minted against a guessed ledger.
 */
export async function ensureAcctCustomer(
  q: SqlFn,
  tenantId: string,
  args: { sourceId: string; legalName?: string | null; email?: string | null },
): Promise<string> {
  const found = await q(
    `SELECT id::text AS id FROM public.acct_customers
      WHERE tenant_id = $1 AND external_customer_id = $2 LIMIT 1`,
    [tenantId, args.sourceId],
  );
  if (found[0]?.id) return String(found[0].id);

  const ar = await q(
    `SELECT id::text AS id FROM public.acct_chart_of_accounts
      WHERE tenant_id = $1 AND code = '1200' LIMIT 1`,
    [tenantId],
  );
  if (!ar[0]?.id) {
    throw new Error("No Accounts Receivable account (code 1200) configured for this tenant");
  }
  const base =
    "CUST-" +
    String(args.sourceId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
  for (let attempt = 0; attempt < 4; attempt++) {
    const customerNumber =
      attempt === 0
        ? base
        : `${base}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    try {
      const ins = await q(
        `INSERT INTO public.acct_customers
           (tenant_id, customer_number, external_customer_id, legal_name, email,
            currency, payment_terms_days, ar_account_id, tax_exempt)
         VALUES ($1, $2, $3, $4, $5, 'USD', 30, $6, false)
         RETURNING id::text AS id`,
        [
          tenantId,
          customerNumber,
          args.sourceId,
          args.legalName || "Customer",
          args.email || null,
          ar[0].id,
        ],
      );
      if (ins[0]?.id) return String(ins[0].id);
    } catch (e: any) {
      // 23505 = customer_number already taken for this tenant — retry
      // with a suffixed number; anything else is a real failure.
      if (!String(e?.message || "").includes("23505") && e?.code !== "23505") throw e;
    }
  }
  throw new Error("Could not create the AR customer record for this customer");
}

/** Revenue account for invoice lines: 4100 (service) -> 4000 -> any revenue. */
export async function resolveRevenueAccountId(q: SqlFn, tenantId: string): Promise<string | null> {
  const rows = await q(
    `SELECT id::text AS id FROM public.acct_chart_of_accounts
      WHERE tenant_id = $1 AND (code IN ('4100', '4000') OR account_type = 'revenue')
      ORDER BY (code = '4100') DESC, (code = '4000') DESC, code
      LIMIT 1`,
    [tenantId],
  );
  return rows[0]?.id ?? null;
}
