import { NextRequest, NextResponse } from "next/server";
import { guard, ctx, body } from "../_shared";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/tax-1099?year=YYYY — Tax & Compliance
// → 1099 & Contractor Tax: the contractor register over
// acct_vendors (is_1099_vendor). Year-to-date spend is computed
// live from acct_ap_payments posted in the tax year (what the IRS
// counts is what was PAID), the $600 threshold meter is spend/600,
// the W-9 state is w9_received_at, the 1099 box rides on
// tax_form_type, and filing status comes from the vendor's
// acct_payroll_tax_forms row for that year. GL accounts are the
// distinct expense accounts on the vendor's bill lines.
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const yearParam = Number(new URL(req.url).searchParams.get("year"));
    const year = Number.isFinite(yearParam) && yearParam >= 2000 && yearParam <= 2100
      ? yearParam : new Date().getFullYear();
    const rows = await pgQuery<any>(
      `SELECT v.id::text AS id, v.vendor_number, v.legal_name, v.email,
              v.tax_number, v.tax_form_type, v.w9_received_at::text AS w9_received_at,
              v.payment_terms_days, v.is_active,
              COALESCE((SELECT SUM(p.amount) FROM public.acct_ap_payments p
                         WHERE p.vendor_id = v.id AND p.tenant_id = v.tenant_id
                           AND p.status <> 'void'
                           AND EXTRACT(YEAR FROM p.payment_date) = $2), 0)::text AS ytd_paid,
              COALESCE((SELECT SUM(b.total) FROM public.acct_ap_bills b
                         WHERE b.vendor_id = v.id AND b.tenant_id = v.tenant_id
                           AND b.status <> 'void'
                           AND EXTRACT(YEAR FROM b.bill_date) = $2), 0)::text AS ytd_billed,
              (SELECT string_agg(DISTINCT a.code, ', ' ORDER BY a.code)
                 FROM public.acct_ap_bill_lines l
                 JOIN public.acct_ap_bills b ON b.id = l.bill_id
                 JOIN public.acct_chart_of_accounts a ON a.id = l.expense_account_id
                WHERE b.vendor_id = v.id) AS gl_accounts,
              f.status AS filing_status, f.form_type AS filing_form,
              f.filed_at::text AS filed_at, f.confirmation_number
         FROM public.acct_vendors v
         LEFT JOIN public.acct_payroll_tax_forms f
           ON f.vendor_id = v.id AND f.tenant_id = v.tenant_id
          AND f.tax_year = $2 AND f.form_type LIKE '1099%'
        WHERE v.tenant_id = $1 AND v.is_1099_vendor = true
        ORDER BY ytd_paid DESC, v.legal_name ASC`,
      [tenant, year],
    );
    return NextResponse.json({
      year,
      contractors: rows.map((r) => ({
        id: r.id, vendorNumber: r.vendor_number, name: r.legal_name, email: r.email,
        taxNumber: r.tax_number, taxFormType: r.tax_form_type, w9ReceivedAt: r.w9_received_at,
        paymentTermsDays: r.payment_terms_days, isActive: !!r.is_active,
        ytdPaid: Number(r.ytd_paid || 0), ytdBilled: Number(r.ytd_billed || 0),
        glAccounts: r.gl_accounts, filingStatus: r.filing_status, filingForm: r.filing_form,
        filedAt: r.filed_at, confirmationNumber: r.confirmation_number,
      })),
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/tax-1099]", e);
    return NextResponse.json({ error: e?.message || "Failed to load 1099 contractors" }, { status: 500 });
  }
}

// POST /api/admin/accounting/tax-1099 — actions:
//  update_tax { vendor_id, w9_received_at?, tax_number?, tax_form_type? }
//    → saves the vendor's tax record on acct_vendors.
//  stage_form { vendor_id, tax_year? }
//    → creates the vendor's acct_payroll_tax_forms row for the
//      year (form 1099-NEC, status "staged") with Box 1 set to the
//      live YTD paid total, so the filing queue reflects reality.
export async function POST(req: NextRequest) {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const b = await body(req);

    if (b.action === "update_tax") {
      if (!b.vendor_id) throw new Error("vendor_id is required");
      const patch: Record<string, unknown> = {};
      if (b.w9_received_at !== undefined) patch.w9_received_at = b.w9_received_at ? `${b.w9_received_at}T00:00:00Z` : null;
      if (b.tax_number !== undefined) patch.tax_number = b.tax_number || null;
      if (b.tax_form_type !== undefined) patch.tax_form_type = b.tax_form_type || null;
      const { error } = await db.from("acct_vendors").update(patch).eq("id", b.vendor_id).eq("tenant_id", tenant);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (b.action !== "stage_form") throw new Error("Unknown action");
    if (!b.vendor_id) throw new Error("vendor_id is required");
    const year = Number(b.tax_year) || new Date().getFullYear();
    const { data: existing } = await db.from("acct_payroll_tax_forms").select("id")
      .eq("vendor_id", b.vendor_id).eq("tenant_id", tenant).eq("tax_year", year).like("form_type", "1099%").limit(1);
    if (existing && existing.length) throw new Error(`A 1099 form for tax year ${year} is already on file for this contractor`);
    const paid = await pgQuery<{ ytd: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS ytd FROM public.acct_ap_payments
        WHERE tenant_id = $1 AND vendor_id = $2::uuid AND status <> 'void'
          AND EXTRACT(YEAR FROM payment_date) = $3`,
      [tenant, b.vendor_id, year],
    );
    const ytd = Number(paid[0]?.ytd || 0);
    const { data, error } = await db.from("acct_payroll_tax_forms").insert({
      tenant_id: tenant, vendor_id: b.vendor_id, form_type: "1099-NEC", tax_year: year,
      period_label: `TY${year}`, status: "staged",
      box_values: { box_1_nonemployee_compensation: ytd }, metadata: {},
    }).select("id").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id: data.id, box_1: ytd }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "1099 action failed" }, { status: 400 });
  }
}
