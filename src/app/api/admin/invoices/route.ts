import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { platformAudit } from "@/lib/crm/enterprise";
import {
  acctStatusToLegacy,
  ensureAcctCustomer,
  resolveEntityId,
  resolveRevenueAccountId,
  type SqlFn,
} from "@/lib/accounting/invoice-store";
import { pgConnectionString, toTransactionPooler } from "@/lib/pg";
import pg from "pg";

// ---------------------------------------------------------------------------
// GET /api/admin/invoices — Active Invoices, live from the SINGLE invoice
// record: public.acct_ar_invoices (the enterprise AR table; the duplicate
// storefront invoices table was consolidated into it and dropped,
// 2026-10-13). Columns are aliased to the legacy response shape and the
// acct_document_status enum is translated to UI labels at this boundary
// (see @/lib/accounting/invoice-store):
//   acct_ar_invoices (invoice_number/status/subtotal/total/amount_paid/
//     deposit_paid; balance = total − amount_paid − amount_credited
//     − deposit_paid)
//   ← customers ("firstName"/"lastName"/email/phone) via source_customer_id
//   (booking display fields return NULL: there is NO bookings/
//   appointments table in this database — see the POST note below.)
//   + acct_ar_invoice_lines (description/quantity/unit_price/line_subtotal)
//
// POST /api/admin/invoices — draft a new invoice. Two client modes:
//   1. From booking:  { fromBookingId, extraItems?, depositOverride? }
//      The server derives the first line item from the booking itself
//      (service × servicePrice), appends extraItems, and applies the
//      booking's deposit ONLY when the deposit money actually cleared
//      (paymentStatus DEPOSIT_PAID / PAID / CONFIRMED) unless
//      depositOverride is given.
//   2. Standalone:    { customerEmail, items, depositPaid?, dueDate?, notes? }
//      Find-or-create the salon customers row by email (case-insensitive).
//
// Money math (server-authoritative, half-cent slack on comparisons):
//   subtotal = Σ qty × unitPrice, total = subtotal (tax 0 for now)
//   depositPaid = min(deposit, total)
//   balanceDue  = total − amount_paid − depositPaid
// Next INV-#### number per tenant; platform_audit_log entry per create.
// ---------------------------------------------------------------------------

const POOLER = () => toTransactionPooler(process.env.SUPABASE_SESSION_POOLER || process.env.SUPABASE_DIRECT_CONNECTION || pgConnectionString);

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function num(v: any): number {
  return Math.round((parseFloat(String(v ?? "0")) || 0) * 100) / 100;
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Walk-in", lastName: "Customer" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

type RawItem = { description: string; quantity: number; unitPrice: number };

function toUiInvoice(r: any, items: any[]) {
  const total = num(r.total);
  const amountPaid = num(r.amount_paid);
  const amountCredited = num(r.amount_credited);
  const depositPaid = num(r.depositPaid);
  const balanceDue = Math.max(0, Math.round((total - amountPaid - amountCredited - depositPaid) * 100) / 100);
  // invoices."customerId" is a MIXED id space: rows created from bookings
  // carry salon `customers` ids, rows created from CRM flows carry
  // crm_customers ids. Resolve the display identity from whichever table
  // actually holds the id — salon first, then CRM — never neither.
  const firstName = r.first_name ?? r.crm_first_name ?? "";
  const lastName = r.last_name ?? r.crm_last_name ?? "";
  const customerName = `${firstName} ${lastName}`.trim() || r.booking_owner || "—";
  return {
    id: String(r.id),
    number: r.number || `INV-${String(r.id).slice(0, 8).toUpperCase()}`,
    status: acctStatusToLegacy(r.status || "posted"),
    currency: r.currency || "USD",
    subtotal: num(r.subtotal),
    total,
    depositPaid,
    balanceDue,
    amountPaid,
    customerId: r.customerId ?? null,
    bookingId: r.bookingId ?? null,
    customerEmail: r.email ?? r.crm_email ?? null,
    customerName,
    petName: r.dependent_name ?? null,
    bookingService: r.booking_service ?? null,
    bookingDate: r.booking_date ?? null,
    bookingTime: r.booking_time ?? null,
    sentAt: r.sentAt ?? null,
    paidAt: r.paidAt ?? null,
    createdAt: r.createdAt ?? null,
    updatedAt: r.updatedAt ?? null,
    dueDate: r.dueDate ? String(r.dueDate).slice(0, 10) : null,
    notes: r.notes ?? null,
    items: items.map((it) => ({
      id: String(it.id),
      description: String(it.description || "Item"),
      quantity: Number(it.quantity ?? 1),
      unitPrice: num(it.unitPrice),
      totalPrice: num(it.totalPrice),
    })),
  };
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("invoices", "read");
  if (gate) return gate;

  const cs = POOLER();
  if (!cs) return NextResponse.json({ invoices: [] });

  const client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const invRes = await client.query(
      `SELECT i.id::text AS id, i.invoice_number AS number, i.status::text AS status,
              i.currency, i.subtotal::text AS subtotal, i.total::text AS total,
              i.amount_paid, i.amount_credited, i.deposit_paid AS "depositPaid",
              i.source_customer_id AS "customerId",
              COALESCE(i.booking_id, i.appointment_id::text) AS "bookingId",
              i.sent_at AS "sentAt", i.paid_at AS "paidAt",
              i.created_at AS "createdAt", i.updated_at AS "updatedAt",
              i.due_date AS "dueDate", i.notes,
              c."firstName" AS first_name, c."lastName" AS last_name,
              c.email, c.phone,
              cc.first_name AS crm_first_name, cc.last_name AS crm_last_name,
              cc.email AS crm_email,
              NULL::text AS booking_owner, NULL::text AS dependent_name,
              NULL::text AS booking_service, NULL::date AS booking_date, NULL::text AS booking_time
       FROM public.acct_ar_invoices i
       LEFT JOIN public.customers c ON i.source_customer_id = c.id
       LEFT JOIN public.crm_customers cc ON cc.id::text = i.source_customer_id
       WHERE i.tenant_id = $1
       ORDER BY i.created_at DESC`,
      [resolveTenantId(req)],
    );
    const itemsRes = await client.query(
      `SELECT l.id::text AS id, l.invoice_id::text AS "invoiceId",
              l.description, l.quantity,
              l.unit_price::text AS "unitPrice", l.line_subtotal::text AS "totalPrice"
       FROM public.acct_ar_invoice_lines l
       JOIN public.acct_ar_invoices i ON i.id = l.invoice_id
       WHERE i.tenant_id = $1 ORDER BY l.line_no ASC`,
      [resolveTenantId(req)],
    );
    const itemsByInvoice = new Map<string, any[]>();
    for (const it of itemsRes.rows) {
      const k = String(it.invoiceId);
      if (!itemsByInvoice.has(k)) itemsByInvoice.set(k, []);
      itemsByInvoice.get(k)!.push(it);
    }
    const invoices = invRes.rows.map((r) => toUiInvoice(r, itemsByInvoice.get(String(r.id)) || []));
    return NextResponse.json({ invoices });
  } catch (e: any) {
    console.error("[GET /api/admin/invoices]", e);
    return NextResponse.json({ error: e.message || "Failed to load invoices" }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }
}

type NormalizedCreate = {
  mode: "booking" | "standalone";
  fromBookingId: string | null;
  customerEmail: string;
  customerName: string;
  customerPhone: string | null;
  items: RawItem[];
  depositOverride: number | null;
  depositPaidExplicit: number | null;
  dueDate: string | null;
  notes: string | null;
};

function normalizeCreate(body: any): { ok: true; value: NormalizedCreate } | { ok: false; error: string } {
  const fromBookingId = String(body?.fromBookingId || body?.bookingId || "").trim() || null;
  const customerEmail = String(body?.customerEmail || body?.customer?.email || "").trim().toLowerCase();
  const customerName = String(body?.customer?.name || body?.customerName || "").trim();
  const customerPhone = String(body?.customer?.phone || body?.phone || "").trim() || null;
  const dueDate = String(body?.dueDate || "").trim() || null;
  const notes = String(body?.notes || "").trim() || null;

  const rawItems = Array.isArray(body?.items) ? body.items : Array.isArray(body?.extraItems) ? body.extraItems : [];
  const items: RawItem[] = rawItems
    .map((it: any) => ({
      description: String(it?.description || "Grooming service").trim().slice(0, 300),
      quantity: Math.max(1, Math.min(999, parseInt(String(it?.quantity ?? 1), 10) || 1)),
      unitPrice: num(it?.unitPrice ?? it?.amount),
    }))
    .filter((it: RawItem) => it.description.length > 0 && it.unitPrice > 0);

  const depositOverride =
    body?.depositOverride === undefined || body?.depositOverride === null || body?.depositOverride === ""
      ? null
      : num(body.depositOverride);
  const depositPaidExplicit =
    body?.depositPaid === undefined || body?.depositPaid === null || body?.depositPaid === ""
      ? null
      : num(body.depositPaid);

  if (fromBookingId) return { ok: true, value: { mode: "booking", fromBookingId, customerEmail, customerName, customerPhone, items, depositOverride, depositPaidExplicit, dueDate, notes } };
  if (!customerEmail && !customerName) return { ok: false, error: "Customer email (or name) is required for a standalone invoice." };
  if (items.length === 0) return { ok: false, error: "At least one line item with a unit price above $0 is required." };
  return { ok: true, value: { mode: "standalone", fromBookingId: null, customerEmail, customerName, customerPhone, items, depositOverride, depositPaidExplicit, dueDate, notes } };
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("invoices", "write");
  if (gate) return gate;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const norm = normalizeCreate(body);
  if (!norm.ok) return NextResponse.json({ error: norm.error }, { status: 400 });
  const c = norm.value;

  const cs = POOLER();
  if (!cs) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    await client.query("BEGIN");
    const tenant = resolveTenantId(req);

    let booking: any = null;
    const lineItems: RawItem[] = [];

    if (c.mode === "booking") {
      // No bookings/appointments entity exists in this database (the
      // AAPawZ bookings table was never part of Unsaid's schema), so
      // invoicing from a booking cannot run yet — fail explicitly
      // instead of crashing on the missing table. Building that entity
      // is the appointments gap on the Contacts redesign list.
      await client.query("ROLLBACK").catch(() => {});
      return NextResponse.json(
        { error: "Invoicing from a booking is unavailable: no bookings entity exists in this database yet." },
        { status: 422 },
      );
    } else {
      lineItems.push(...c.items);
    }

    const subtotal = lineItems.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    const total = Math.round(subtotal * 100) / 100;

    // ---- Customer resolution ----
    let customerId: string | null = null;
    let customerEmail: string | null = c.customerEmail || null;
    if (!customerId) {
      if (customerEmail) {
        const found = await client.query(
          `SELECT id::text FROM public.customers WHERE tenant_id = $1 AND lower(email) = $2 ORDER BY "createdAt" ASC LIMIT 1`,
          [tenant, customerEmail],
        );
        customerId = found.rows[0]?.id || null;
      } else if (c.customerName) {
        const found = await client.query(
          `SELECT id::text FROM public.customers WHERE tenant_id = $1 AND lower("firstName" || ' ' || "lastName") = lower($2) ORDER BY "createdAt" ASC LIMIT 1`,
          [tenant, c.customerName],
        );
        customerId = found.rows[0]?.id || null;
      }
    }
    if (!customerId) {
      const nameSrc = c.customerName || (customerEmail ? customerEmail.split("@")[0] : "");
      const { firstName, lastName } = splitName(nameSrc);
      const created = await client.query(
        `INSERT INTO public.customers (tenant_id, "firstName", "lastName", email, phone, "customerStatus")
         VALUES ($1, $2, $3, $4, $5, 'active')
         RETURNING id::text`,
        [tenant, firstName, lastName, customerEmail, c.customerPhone],
      );
      customerId = created.rows[0].id;
    }

    // ---- Deposit ----
    let depositPaid = 0;
    if (c.depositOverride !== null) {
      depositPaid = Math.min(Math.max(0, c.depositOverride), total);
    } else if (c.depositPaidExplicit !== null) {
      depositPaid = Math.min(Math.max(0, c.depositPaidExplicit), total);
    } else if (booking) {
      const ps = String(booking.paymentStatus || "").toUpperCase();
      if (ps === "DEPOSIT_PAID" || ps === "PAID" || ps === "CONFIRMED") {
        depositPaid = Math.min(num(booking.depositAmount), total);
      }
    }
    const balanceDue = Math.max(0, Math.round((total - depositPaid) * 100) / 100);

    // ---- Next INV-#### number (sequence over the enterprise table) ----
    const seq = await client.query(
      `SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '\\D', '', 'g'), '')::bigint), 0) + 1 AS next
       FROM public.acct_ar_invoices WHERE tenant_id = $1 AND invoice_number LIKE 'INV-%'`,
      [tenant],
    );
    const number = `INV-${String(seq.rows[0].next).padStart(4, "0")}`;

    // ---- Enterprise AR placement: entity + AR customer + revenue acct --
    const q: SqlFn = async (text, params) => (await client.query(text, params as any)).rows;
    const entityId = await resolveEntityId(q, tenant);
    if (!entityId) {
      await client.query("ROLLBACK").catch(() => {});
      return NextResponse.json({ error: "No accounting entity configured for this tenant" }, { status: 500 });
    }
    const acctCustomerId = await ensureAcctCustomer(q, tenant, {
      sourceId: String(customerId),
      legalName: c.customerName || booking?.ownerName || null,
      email: customerEmail,
    });
    const revenueAccountId = await resolveRevenueAccountId(q, tenant);
    if (!revenueAccountId) {
      await client.query("ROLLBACK").catch(() => {});
      return NextResponse.json({ error: "No revenue account configured for this tenant" }, { status: 500 });
    }

    // due_date is required on the enterprise table: an invoice created
    // without an explicit due date falls back to its issue date — the
    // same basis the legacy store's aging used (dueDate ?? createdAt).
    const inv = await client.query(
      `INSERT INTO public.acct_ar_invoices
         (tenant_id, entity_id, customer_id, source_customer_id, booking_id,
          invoice_number, status, invoice_date, due_date,
          subtotal, tax_total, discount_total, total,
          amount_paid, amount_credited, deposit_paid, currency, notes)
       VALUES ($1, $2, $3, $4, $5, 'posted', CURRENT_DATE, COALESCE($6::date, CURRENT_DATE),
               $7, 0, 0, $8, 0, 0, $9, 'USD', $10)
       RETURNING id::text AS id, invoice_number AS number, status::text AS status,
                 currency, subtotal::text AS subtotal, total::text AS total,
                 amount_paid, amount_credited, deposit_paid AS "depositPaid",
                 source_customer_id AS "customerId", booking_id AS "bookingId",
                 sent_at AS "sentAt", paid_at AS "paidAt",
                 created_at AS "createdAt", updated_at AS "updatedAt",
                 due_date AS "dueDate", notes`,
      [tenant, entityId, acctCustomerId, customerId, null,
        c.dueDate, money(subtotal), money(total), money(depositPaid), c.notes],
    );
    const invoiceRow = inv.rows[0];

    let lineNo = 0;
    for (const it of lineItems) {
      lineNo += 1;
      await client.query(
        `INSERT INTO public.acct_ar_invoice_lines
           (invoice_id, line_no, description, quantity, unit_price, discount_amount, line_subtotal, tax_amount, revenue_account_id)
         VALUES ($1::uuid, $2, $3, $4, $5, 0, $6, 0, $7)`,
        [invoiceRow.id, lineNo, it.description, it.quantity, money(it.unitPrice), money(it.quantity * it.unitPrice), revenueAccountId],
      );
    }

    // Audit the create. Wrapped in a SAVEPOINT so an audit-table failure
    // (CHECK constraint, trigger, NOT NULL, etc.) can NEVER abort the main
    // invoice write — without this, any audit INSERT failure silently rolls
    // back the entire transaction even though the route still returns 201
    // with the in-memory invoiceRow from the INSERT's RETURNING * clause.
    try {
      await client.query("SAVEPOINT audit_sp");
      await platformAudit(client, {
        action: "invoice.created",
        targetType: "invoice",
        targetId: invoiceRow.id,
        actorRole: "admin",
        metadata: {
          number,
          mode: c.mode,
          customer: c.customerName || customerEmail || booking?.ownerName || "—",
          total: money(total),
          depositPaid: money(depositPaid),
          items: lineItems.length,
          bookingId: null,
        },
      });
      await client.query("RELEASE SAVEPOINT audit_sp");
    } catch (auditErr: any) {
      await client.query("ROLLBACK TO SAVEPOINT audit_sp").catch(() => {});
      console.warn("[POST /api/admin/invoices] audit non-fatal:", auditErr?.message);
    }

    await client.query("COMMIT");

    const itemsRes = await client.query(
      `SELECT id::text AS id, description, quantity,
              unit_price::text AS "unitPrice", line_subtotal::text AS "totalPrice"
       FROM public.acct_ar_invoice_lines WHERE invoice_id = $1::uuid ORDER BY line_no ASC`,
      [String(invoiceRow.id)],
    );
    return NextResponse.json({ invoice: toUiInvoice(invoiceRow, itemsRes.rows) }, { status: 201 });
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[POST /api/admin/invoices]", e);
    return NextResponse.json({ error: e.message || "Failed to create invoice" }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// PUT /api/admin/invoices — update an existing invoice (the editor's
// Save for an open record). Body: { id, ...same shape as POST }.
// Rules (Xero/QuickBooks behavior): money-final invoices (paid, void,
// cancelled, closed) are locked — void and reissue instead; the new
// total may not drop below what is already paid + credited; lines are
// replaced wholesale; an explicit deposit value in the body wins,
// otherwise the recorded deposit stays (clamped to the new total).
// ---------------------------------------------------------------------------
export async function PUT(req: NextRequest) {
  const gate = await requireModuleApi("invoices", "write");
  if (gate) return gate;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const id = String(body?.id || body?.invoiceId || "").trim();
  if (!id) return NextResponse.json({ error: "Invoice id is required for an update." }, { status: 400 });
  const norm = normalizeCreate(body);
  if (!norm.ok) return NextResponse.json({ error: norm.error }, { status: 400 });
  const c = norm.value;
  if (c.mode === "booking") {
    return NextResponse.json(
      { error: "Invoicing from a booking is unavailable: no bookings entity exists in this database yet." },
      { status: 422 },
    );
  }

  const cs = POOLER();
  if (!cs) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    await client.query("BEGIN");
    const tenant = resolveTenantId(req);

    const cur = await client.query(
      `SELECT id::text AS id, status::text AS status, invoice_number,
              amount_paid::text AS amount_paid, amount_credited::text AS amount_credited,
              deposit_paid::text AS deposit_paid
       FROM public.acct_ar_invoices
       WHERE tenant_id = $1 AND id = $2::uuid
       FOR UPDATE`,
      [tenant, id],
    );
    const existing = cur.rows[0];
    if (!existing) {
      await client.query("ROLLBACK").catch(() => {});
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (["paid", "void", "cancelled", "closed"].includes(String(existing.status).toLowerCase())) {
      await client.query("ROLLBACK").catch(() => {});
      return NextResponse.json(
        { error: `A ${String(existing.status).toLowerCase()} invoice can't be edited. Void it and issue a corrected invoice instead.` },
        { status: 409 },
      );
    }

    const lineItems: RawItem[] = [...c.items];
    const subtotal = lineItems.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    const total = Math.round(subtotal * 100) / 100;
    const alreadySettled = num(existing.amount_paid) + num(existing.amount_credited);
    if (total < alreadySettled - 0.005) {
      await client.query("ROLLBACK").catch(() => {});
      return NextResponse.json(
        { error: "The new total is below what the customer has already paid or been credited on this invoice." },
        { status: 409 },
      );
    }

    // ---- Customer resolution (same find-or-create as POST) ----
    let customerId: string | null = null;
    const customerEmail: string | null = c.customerEmail || null;
    if (customerEmail) {
      const found = await client.query(
        `SELECT id::text FROM public.customers WHERE tenant_id = $1 AND lower(email) = $2 ORDER BY "createdAt" ASC LIMIT 1`,
        [tenant, customerEmail],
      );
      customerId = found.rows[0]?.id || null;
    } else if (c.customerName) {
      const found = await client.query(
        `SELECT id::text FROM public.customers WHERE tenant_id = $1 AND lower("firstName" || ' ' || "lastName") = lower($2) ORDER BY "createdAt" ASC LIMIT 1`,
        [tenant, c.customerName],
      );
      customerId = found.rows[0]?.id || null;
    }
    if (!customerId) {
      const nameSrc = c.customerName || (customerEmail ? customerEmail.split("@")[0] : "");
      const { firstName, lastName } = splitName(nameSrc);
      const created = await client.query(
        `INSERT INTO public.customers (tenant_id, "firstName", "lastName", email, phone, "customerStatus")
         VALUES ($1, $2, $3, $4, $5, 'active')
         RETURNING id::text`,
        [tenant, firstName, lastName, customerEmail, c.customerPhone],
      );
      customerId = created.rows[0].id;
    }

    const q: SqlFn = async (text, params) => (await client.query(text, params as any)).rows;
    const acctCustomerId = await ensureAcctCustomer(q, tenant, {
      sourceId: String(customerId),
      legalName: c.customerName || null,
      email: customerEmail,
    });
    const revenueAccountId = await resolveRevenueAccountId(q, tenant);
    if (!revenueAccountId) {
      await client.query("ROLLBACK").catch(() => {});
      return NextResponse.json({ error: "No revenue account configured for this tenant" }, { status: 500 });
    }

    // Deposit: an explicit value in the body wins; otherwise the
    // recorded deposit stays, clamped to the new total.
    let depositPaid = num(existing.deposit_paid);
    if (c.depositOverride !== null) depositPaid = c.depositOverride;
    else if (c.depositPaidExplicit !== null) depositPaid = c.depositPaidExplicit;
    depositPaid = Math.min(Math.max(0, depositPaid), total);

    const upd = await client.query(
      `UPDATE public.acct_ar_invoices
         SET customer_id = $1, source_customer_id = $2,
             due_date = COALESCE($3::date, due_date),
             subtotal = $4, total = $5, deposit_paid = $6, notes = $7,
             updated_at = now()
       WHERE tenant_id = $8 AND id = $9::uuid
       RETURNING id::text AS id, invoice_number AS number, status::text AS status,
                 currency, subtotal::text AS subtotal, total::text AS total,
                 amount_paid, amount_credited, deposit_paid AS "depositPaid",
                 source_customer_id AS "customerId", booking_id AS "bookingId",
                 sent_at AS "sentAt", paid_at AS "paidAt",
                 created_at AS "createdAt", updated_at AS "updatedAt",
                 due_date AS "dueDate", notes`,
      [acctCustomerId, customerId, c.dueDate, money(subtotal), money(total), money(depositPaid), c.notes, tenant, id],
    );
    const invoiceRow = upd.rows[0];

    await client.query(`DELETE FROM public.acct_ar_invoice_lines WHERE invoice_id = $1::uuid`, [id]);
    let lineNo = 0;
    for (const it of lineItems) {
      lineNo += 1;
      await client.query(
        `INSERT INTO public.acct_ar_invoice_lines
           (invoice_id, line_no, description, quantity, unit_price, discount_amount, line_subtotal, tax_amount, revenue_account_id)
         VALUES ($1::uuid, $2, $3, $4, $5, 0, $6, 0, $7)`,
        [id, lineNo, it.description, it.quantity, money(it.unitPrice), money(it.quantity * it.unitPrice), revenueAccountId],
      );
    }

    // Audit the update, savepoint-wrapped like the create so an audit
    // failure can never roll back the invoice write.
    try {
      await client.query("SAVEPOINT audit_sp");
      await platformAudit(client, {
        action: "invoice.updated",
        targetType: "invoice",
        targetId: id,
        actorRole: "admin",
        metadata: {
          number: existing.invoice_number,
          customer: c.customerName || customerEmail || "—",
          total: money(total),
          depositPaid: money(depositPaid),
          items: lineItems.length,
        },
      });
      await client.query("RELEASE SAVEPOINT audit_sp");
    } catch (auditErr: any) {
      await client.query("ROLLBACK TO SAVEPOINT audit_sp").catch(() => {});
      console.warn("[PUT /api/admin/invoices] audit non-fatal:", auditErr?.message);
    }

    await client.query("COMMIT");

    const itemsRes = await client.query(
      `SELECT id::text AS id, description, quantity,
              unit_price::text AS "unitPrice", line_subtotal::text AS "totalPrice"
       FROM public.acct_ar_invoice_lines WHERE invoice_id = $1::uuid ORDER BY line_no ASC`,
      [id],
    );
    return NextResponse.json({ invoice: toUiInvoice(invoiceRow, itemsRes.rows) }, { status: 200 });
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[PUT /api/admin/invoices]", e);
    return NextResponse.json({ error: e.message || "Failed to update invoice" }, { status: 500 });
  } finally {
    await client.end().catch(() => {});
  }
}
