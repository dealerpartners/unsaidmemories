import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/admin/crm/customers/[id]/payments
//   [id] = the shop customer id (customers.id — the id the customer profile
//   view carries), with ?crm_id= as the optional known CRM link.
//
//   GET → the customer's REAL payment history, merged from the stores that
//   actually hold money records:
//     - public.commerce_payments — register/POS + recorded payments, keyed
//       by crm_customers.id (directly, or via their commerce_sales row).
//       The REAL invoice number is attached only when the sale carries a
//       stored acct_invoice_id → acct_ar_invoices.invoice_number link.
//       Otherwise the row's reference is the payment's own payment_number.
//     - public.acct_ar_invoices — the single invoice record
//       (source_customer_id has been written with both shop ids and CRM
//       ids by different paths, so the full identity set is matched,
//       including via the AR customer's external_customer_id). Rows
//       carry their REAL invoice_number.
//     - public.acct_ar_receipts — salon CRM checkout receipts, keyed by
//       crm_customers.id.
//     - public.erp_orders — storefront orders (the ERP twin the Stripe
//       webhook creates on payment), keyed by crm_customer_id and
//       backstopped by the buyer email on the order. Without this source
//       a web purchase never showed on the customer's profile at all
//       (owner checkout requirement, 2026-10-31).
//     - public.ecommerce_orders — the channel's own order record,
//       RESTRICTED to twin-less rows (erp_order_id IS NULL, or pointing
//       at an erp_orders row that no longer exists). Verified live
//       2026-11-01: 23 rows — 16 carry a valid ERP twin and are already
//       counted via erp_orders above (reading both would double-count
//       the same purchase); 7 have no valid twin (6 NULL + 1 dangling)
//       and would otherwise vanish from the profile entirely.
//   Identity resolution mirrors /api/customer/receipts and the sibling
//   communications route: the CRM record is found via source_customer_id,
//   a direct id match, ?crm_id=, or the shop customer's email. Nothing is
//   synthesized: a customer with no records gets an honest empty list.

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || "");

async function ctxId(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return id;
}

type PayRow = {
  id: string;
  kind: "payment" | "invoice" | "receipt" | "order";
  type: string; // 'Payment' | 'Invoice' | 'Receipt'
  description: string;
  amount: number;
  status: string; // the stored status, as-is
  method: string | null; // real method name, never a fabricated card
  invoiceNumber: string | null; // only when a stored link proves it
  reference: string | null; // the record's own number (payment/receipt/sale)
  petName: string | null;
  timestamp: string; // ISO
};

function titleCase(s: string): string {
  const t = String(s || "").trim().toLowerCase().replace(/_/g, " ");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("customers", "read");
  if (gate) return gate;
  const id = await ctxId(ctx);
  if (!id) return NextResponse.json({ error: "customer id required" }, { status: 400 });
  const crmIdParam = req.nextUrl.searchParams.get("crm_id") || "";

  const result = await withPg(async (c) => {
    const tenant = resolveTenantId(req);
    const rows: PayRow[] = [];

    // ---- Resolve the customer's full identity set ---------------------
    // Seeds: the profile id + the known CRM id. Then expand through the
    // CRM link table (source_customer_id / email) so records keyed under
    // either system's id are all found.
    const identity = new Set<string>([id]);
    if (isUuid(crmIdParam)) identity.add(crmIdParam);

    let shopEmail = "";
    let crmEmail = "";
    try {
      const shop = await c.query(
        `SELECT email FROM public.customers WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [id, tenant],
      );
      shopEmail = String((shop.rows[0] as any)?.email || "");
    } catch {
      // Shop record unreadable — CRM resolution below still applies.
    }

    try {
      const links = await c.query(
        `SELECT id::text AS id, source_customer_id, email
           FROM public.crm_customers
          WHERE tenant_id = $1
            AND (id::text = ANY($2::text[])
                 OR source_customer_id = ANY($2::text[])
                 OR ($3 <> '' AND lower(email) = lower($3)))`,
        [tenant, Array.from(identity), shopEmail],
      );
      for (const r of links.rows as any[]) {
        if (r.id) identity.add(String(r.id));
        if (r.source_customer_id) identity.add(String(r.source_customer_id));
        if (r.email) crmEmail = String(r.email);
      }
    } catch {
      // Link lookup failed — fall back to the seed identities only.
    }

    const ids = Array.from(identity);

    // ---- 1) commerce_payments (directly, or via the customer's sale) --
    try {
      const pays = await c.query(
        `SELECT p.id::text AS id, p.payment_number, p.amount, p.status,
                p.created_at AS ts,
                pm.name AS method_name,
                s.sale_number, ai.invoice_number, pet.name AS pet_name
           FROM public.commerce_payments p
           LEFT JOIN public.commerce_payment_methods pm ON pm.id = p.payment_method_id
           LEFT JOIN public.commerce_sales s ON s.id = p.sale_id
           LEFT JOIN public.acct_ar_invoices ai ON ai.id = s.acct_invoice_id
           LEFT JOIN public.crm_pets pet ON pet.id = s.dependent_id
          WHERE p.tenant_id = $1
            AND (p.customer_id::text = ANY($2::text[]) OR s.customer_id::text = ANY($2::text[]))
          ORDER BY p.created_at DESC
          LIMIT 200`,
        [tenant, ids],
      );
      for (const r of pays.rows as any[]) {
        rows.push({
          id: `pay-${r.id}`,
          kind: "payment",
          type: "Payment",
          description: r.sale_number
            ? `Register sale ${r.sale_number}`
            : r.method_name
              ? `${r.method_name} payment`
              : "Payment",
          amount: Number(r.amount) || 0,
          status: String(r.status || ""),
          method: r.method_name || null,
          invoiceNumber: r.invoice_number || null,
          reference: r.payment_number || r.sale_number || null,
          petName: r.pet_name || null,
          timestamp: r.ts ? new Date(r.ts).toISOString() : new Date(0).toISOString(),
        });
      }
    } catch {
      // Store unreadable — the other stores below still return.
    }

    // ---- 2) Invoices (single record: acct_ar_invoices) -----------------
    try {
      const invs = await c.query(
        `SELECT id::text AS id, invoice_number AS number,
                CASE status WHEN 'paid' THEN 'PAID' WHEN 'partially_paid' THEN 'PARTIAL'
                            WHEN 'void' THEN 'VOID' WHEN 'cancelled' THEN 'CANCELLED'
                            WHEN 'draft' THEN 'DRAFT' ELSE 'UNPAID' END AS status,
                total::numeric AS total, created_at AS ts
           FROM public.acct_ar_invoices
          WHERE tenant_id = $1
            AND (source_customer_id = ANY($2::text[])
                 OR customer_id IN (SELECT id FROM public.acct_customers
                                     WHERE tenant_id = $1 AND external_customer_id = ANY($2::text[])))
          ORDER BY created_at DESC
          LIMIT 200`,
        [tenant, ids],
      );
      for (const r of invs.rows as any[]) {
        rows.push({
          id: `inv-${r.id}`,
          kind: "invoice",
          type: "Invoice",
          description: r.number ? `Invoice ${r.number}` : "Invoice",
          amount: Number(r.total) || 0,
          status: String(r.status || ""),
          method: null,
          invoiceNumber: r.number || null,
          reference: r.number || null,
          petName: null,
          timestamp: r.ts ? new Date(r.ts).toISOString() : new Date(0).toISOString(),
        });
      }
    } catch {
      // Store unreadable — payments/receipts above and below still return.
    }

    // ---- 3) Salon CRM checkout receipts --------------------------------
    try {
      const recs = await c.query(
        `SELECT id::text AS id, receipt_number, receipt_date, amount,
                payment_method::text AS method_raw, status::text AS status
           FROM public.acct_ar_receipts
          WHERE tenant_id = $1 AND customer_id::text = ANY($2::text[])
          ORDER BY receipt_date DESC
          LIMIT 200`,
        [tenant, ids],
      );
      for (const r of recs.rows as any[]) {
        rows.push({
          id: `rcpt-${r.id}`,
          kind: "receipt",
          type: "Receipt",
          description: r.receipt_number ? `Receipt ${r.receipt_number}` : "Receipt",
          amount: Number(r.amount) || 0,
          status: String(r.status || ""),
          method: r.method_raw ? titleCase(r.method_raw) : null,
          invoiceNumber: null,
          reference: r.receipt_number || null,
          petName: null,
          timestamp: r.receipt_date ? new Date(r.receipt_date).toISOString() : new Date(0).toISOString(),
        });
      }
    } catch {
      // Store unreadable — payments/invoices above still return.
    }

    // ---- 4) Storefront orders (ERP twins) ------------------------------
    try {
      const ords = await c.query(
        `SELECT o.id::text AS id, o.order_number, o.total, o.status,
                o.order_date AS ts
           FROM public.erp_orders o
          WHERE o.tenant_id = $1
            AND (o.crm_customer_id::text = ANY($2::text[])
                 OR ($3 <> '' AND lower(o.customer_email) = lower($3))
                 OR ($4 <> '' AND lower(o.customer_email) = lower($4)))
          ORDER BY o.order_date DESC
          LIMIT 200`,
        [tenant, ids, shopEmail, crmEmail],
      );
      for (const r of ords.rows as any[]) {
        rows.push({
          id: `ord-${r.id}`,
          kind: "order",
          type: "Order",
          description: r.order_number ? `Store order ${r.order_number}` : "Store order",
          amount: Number(r.total) || 0,
          status: String(r.status || ""),
          method: null,
          invoiceNumber: null,
          reference: r.order_number || null,
          petName: null,
          timestamp: r.ts ? new Date(r.ts).toISOString() : new Date(0).toISOString(),
        });
      }
    } catch {
      // Store unreadable — payments/invoices above still return.
    }

    // ---- 5) Ecommerce orders WITHOUT an ERP twin -----------------------
    // Twin-carrying rows are the same purchases source 4 already returns
    // via erp_orders; only twin-less rows are added here (see header).
    try {
      const eco = await c.query(
        `SELECT e.id::text AS id, e.order_number, e.total, e.status,
                e.placed_at AS ts
           FROM public.ecommerce_orders e
          WHERE e.tenant_id = $1
            AND (e.erp_order_id IS NULL
                 OR NOT EXISTS (SELECT 1 FROM public.erp_orders o
                                 WHERE o.id = e.erp_order_id
                                   AND o.tenant_id = e.tenant_id))
            AND (e.crm_customer_id::text = ANY($2::text[])
                 OR ($3 <> '' AND lower(e.customer_email) = lower($3))
                 OR ($4 <> '' AND lower(e.customer_email) = lower($4)))
          ORDER BY e.placed_at DESC
          LIMIT 200`,
        [tenant, ids, shopEmail, crmEmail],
      );
      for (const r of eco.rows as any[]) {
        rows.push({
          id: `eco-${r.id}`,
          kind: "order",
          type: "Order",
          description: r.order_number ? `Web order ${r.order_number}` : "Web order",
          amount: Number(r.total) || 0,
          status: String(r.status || ""),
          method: null,
          invoiceNumber: null,
          reference: r.order_number || null,
          petName: null,
          timestamp: r.ts ? new Date(r.ts).toISOString() : new Date(0).toISOString(),
        });
      }
    } catch {
      // Store unreadable — the other stores above still return.
    }

    rows.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
    return NextResponse.json({ data: rows, total: rows.length });
  });

  return result ?? NextResponse.json({ data: [], total: 0 });
}
