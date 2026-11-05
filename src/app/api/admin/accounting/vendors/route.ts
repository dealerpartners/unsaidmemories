import { NextRequest, NextResponse } from "next/server";
import { guard, ctx, ok, fail, body } from "../_shared";
import { nextNumber, accountByCode } from "@/lib/accounting";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const dynamic = "force-dynamic";

// GET /api/admin/accounting/vendors — the vendor register for
// Purchases & Payables → Vendors & Suppliers: every acct_vendors row
// with its live payables position (open balance + open bill count
// from acct_ap_bills) and year-to-date paid volume from
// acct_ap_payments. W-9 / 1099 fields ride along for the compliance
// columns (the full contractor register lives at /taxes/1099).
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const rows = await pgQuery<{
      id: string; vendor_number: string; legal_name: string; email: string | null; phone: string | null;
      currency: string; payment_terms_days: number; tax_number: string | null; tax_form_type: string | null;
      is_1099_vendor: boolean; is_active: boolean; w9_received_at: string | null; category: string | null;
      open_balance: string; open_bills: number; ytd_paid: string;
    }>(
      `SELECT v.id::text AS id, v.vendor_number, v.legal_name, v.email, v.phone,
              v.currency, v.payment_terms_days, v.tax_number, v.tax_form_type,
              v.is_1099_vendor, v.is_active, v.w9_received_at::text AS w9_received_at,
              v.metadata->>'category' AS category,
              COALESCE(SUM(b.total - b.amount_paid - b.amount_credited)
                FILTER (WHERE b.status IN ('open','partially_paid','received')), 0)::text AS open_balance,
              COUNT(b.id) FILTER (WHERE b.status IN ('open','partially_paid','received'))::int AS open_bills,
              COALESCE((SELECT SUM(p.amount) FROM public.acct_ap_payments p
                         WHERE p.vendor_id = v.id AND p.tenant_id = v.tenant_id
                           AND p.status <> 'void'
                           AND p.payment_date >= date_trunc('year', CURRENT_DATE)::date), 0)::text AS ytd_paid
         FROM public.acct_vendors v
         LEFT JOIN public.acct_ap_bills b
           ON b.vendor_id = v.id AND b.tenant_id = v.tenant_id
        WHERE v.tenant_id = $1
        GROUP BY v.id
        ORDER BY open_balance DESC, v.legal_name ASC`,
      [tenant],
    );
    return NextResponse.json({
      vendors: rows.map((r) => ({
        id: r.id,
        vendorNumber: r.vendor_number,
        name: r.legal_name,
        email: r.email,
        phone: r.phone,
        currency: r.currency || "USD",
        paymentTermsDays: r.payment_terms_days,
        taxNumber: r.tax_number,
        taxFormType: r.tax_form_type,
        is1099: !!r.is_1099_vendor,
        isActive: !!r.is_active,
        w9ReceivedAt: r.w9_received_at,
        category: r.category,
        openBalance: Number(r.open_balance || 0),
        openBills: Number(r.open_bills || 0),
        ytdPaid: Number(r.ytd_paid || 0),
      })),
      total: rows.length,
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/vendors]", e);
    return NextResponse.json({ error: e?.message || "Failed to load vendors" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const b = await body(req);
    if (b.action === "toggle_active") {
      const { error } = await db.from("acct_vendors").update({ is_active: !!b.is_active }).eq("id", b.id).eq("tenant_id", tenant);
      if (error) throw new Error(error.message);
      return ok();
    }
    const ap = await accountByCode(db, tenant, "2050");
    const number = await nextNumber(db, "acct_vendors", "vendor_number", "VND", tenant);
    const { data, error } = await db.from("acct_vendors").insert({
      tenant_id: tenant, vendor_number: number, legal_name: b.legal_name,
      email: b.email || null, phone: b.phone || null, currency: "USD",
      payment_terms_days: Number(b.payment_terms_days) || 30,
      ap_account_id: ap?.id || null, tax_number: b.tax_number || null,
      tax_form_type: b.tax_form_type || null, is_1099_vendor: !!b.is_1099,
      is_active: true, metadata: {},
    }).select("id").single();
    if (error) throw new Error(error.message);
    return ok({ id: data.id, vendor_number: number });
  } catch (e) { return fail(e); }
}
