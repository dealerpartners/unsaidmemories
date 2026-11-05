import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/estimates/register
//
// Estimates & Sales Orders register (Batch 2 rebuild of the owner's
// estimates_sales_orders.html). The base /estimates GET keeps its
// adminList shape for EstimatesView; this endpoint returns the
// register payload: each acct_estimates row with the CRM customer
// name, and invoicing progress computed from the converted AR
// invoice (acct_estimates.converted_invoice_id -> acct_ar_invoices)
// where a link exists — no link means not invoiced, shown as such.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const rows = await pgQuery<{
      id: string; estimate_number: string; customer_name: string; customer_email: string | null;
      estimate_date: string | null; issue_date: string | null; expiry_date: string | null;
      total: string; status: string; terms: string | null;
      converted_invoice_id: string | null; invoiced_total: string | null;
      converted_invoice_number: string | null; converted_invoice_status: string | null;
    }>(
      `SELECT e.id::text AS id, e.estimate_number,
              COALESCE(NULLIF(TRIM(COALESCE(cc.company_name, '')), ''),
                       NULLIF(TRIM(CONCAT(COALESCE(cc.first_name, ''), ' ', COALESCE(cc.last_name, ''))), ''),
                       acx.legal_name, '—') AS customer_name,
              COALESCE(cc.email, acx.email) AS customer_email,
              e.estimate_date::text AS estimate_date, e.issue_date::text AS issue_date,
              e.expiry_date::text AS expiry_date, e.total::text AS total,
              e.status, e.terms, e.converted_invoice_id::text AS converted_invoice_id,
              ci.total::text AS invoiced_total, ci.invoice_number AS converted_invoice_number,
              ci.status AS converted_invoice_status
         FROM public.acct_estimates e
         LEFT JOIN public.crm_customers cc ON cc.id = e.customer_id
         LEFT JOIN public.acct_customers acx ON acx.external_customer_id = e.customer_id::text AND acx.tenant_id = e.tenant_id
         LEFT JOIN public.acct_ar_invoices ci ON ci.id = e.converted_invoice_id
        WHERE e.tenant_id = $1
        ORDER BY COALESCE(e.issue_date, e.estimate_date) DESC NULLS LAST, e.created_at DESC
        LIMIT 500`,
      [tenant],
    );
    const customers = await pgQuery<{ id: string; name: string }>(
      `SELECT id::text AS id,
              COALESCE(NULLIF(TRIM(COALESCE(company_name, '')), ''),
                       NULLIF(TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))), ''), 'Customer') AS name
         FROM public.crm_customers
        WHERE tenant_id = $1
        ORDER BY name ASC
        LIMIT 500`,
      [tenant],
    );
    const estimates = rows.map((r) => {
      const total = Number(r.total || 0);
      const invoiced = r.invoiced_total != null ? Number(r.invoiced_total) : null;
      return {
        id: r.id,
        estimateNumber: r.estimate_number,
        customerName: r.customer_name,
        customerEmail: r.customer_email,
        estimateDate: r.issue_date || r.estimate_date,
        expiryDate: r.expiry_date,
        total,
        status: r.status,
        terms: r.terms,
        convertedInvoiceId: r.converted_invoice_id,
        convertedInvoiceNumber: r.converted_invoice_number,
        convertedInvoiceStatus: r.converted_invoice_status,
        invoicedTotal: invoiced,
        progressPct: invoiced != null && total > 0 ? Math.min(100, Math.round((invoiced / total) * 100)) : null,
        expired: Boolean(r.expiry_date) && !["accepted", "converted"].includes(r.status) && new Date(r.expiry_date as string) < new Date(new Date().toDateString()),
      };
    });
    return NextResponse.json({
      estimates,
      customers,
      total: estimates.length,
      summary: {
        draft: estimates.filter((e) => e.status === "draft").length,
        sent: estimates.filter((e) => e.status === "sent").length,
        accepted: estimates.filter((e) => e.status === "accepted").length,
        converted: estimates.filter((e) => e.convertedInvoiceId || e.status === "converted").length,
        pipelineTotal: estimates.filter((e) => ["draft", "sent"].includes(e.status)).reduce((s, e) => s + e.total, 0),
      },
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/estimates/register]", e);
    return NextResponse.json({ error: e?.message || "Failed to load estimates" }, { status: 500 });
  }
}
