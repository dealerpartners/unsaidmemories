import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

/**
 * Global CRM search across customers, orders, payments, invoices,
 * documents, and messages (UnSaid Memories 1.11 pattern; pets and appointments
 * do not exist in Unsaid and are not searched).
 */
export async function GET(req: Request) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ error: "Query must be at least 2 characters." }, { status: 400 });
  const safe = q.replace(/[%_]/g, "");
  const db = getDb();
  const tenantId = await getTenantId(db);

  const [customers, orders, receipts, invoices, documents, messages] = await Promise.all([
    db.from("crm_customers").select("id, first_name, last_name, company_name, email, phone, lifecycle_stage, created_at")
      .eq("tenant_id", tenantId).is("merged_into_customer_id", null)
      .or(`email.ilike.%${safe}%,first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,company_name.ilike.%${safe}%,phone.ilike.%${safe}%`).limit(12),
    db.from("erp_orders").select("id, order_number, crm_customer_id, customer_email, total, status, order_date")
      .eq("tenant_id", tenantId).or(`order_number.ilike.%${safe}%,customer_email.ilike.%${safe}%`).limit(12),
    db.from("acct_ar_receipts").select("id, receipt_number, customer_id, amount, status, receipt_date")
      .eq("tenant_id", tenantId).ilike("receipt_number", `%${safe}%`).limit(12),
    db.from("acct_ar_invoices").select("id, invoice_number, source_customer_id, total, status, invoice_date")
      .eq("tenant_id", tenantId).ilike("invoice_number", `%${safe}%`).limit(12),
    db.from("crm_documents").select("id, name, customer_id, status, uploaded_at")
      .eq("tenant_id", tenantId).ilike("name", `%${safe}%`).limit(12),
    db.from("crm_messages").select("id, customer_id, channel, direction, subject, body, created_at")
      .eq("tenant_id", tenantId).or(`subject.ilike.%${safe}%,body.ilike.%${safe}%`).limit(12),
  ]);

  return NextResponse.json({
    q,
    customers: customers.data || [],
    orders: orders.data || [],
    payments: receipts.data || [],
    invoices: invoices.data || [],
    documents: documents.data || [],
    messages: messages.data || [],
  });
}
