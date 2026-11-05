import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { getPgWithRetry } from "@/lib/pg";

// Pool-backed runner with the exact withPg contract (fn(client) → result,
// null on failure). withPg's session-pooler Client cannot establish SSL
// from this runtime (the EMAXCONNSESSION/SSL failure class lib/pg was
// built to fix); the transaction pooler in lib/pg works everywhere and a
// checked-out PoolClient has the same .query() surface as a Client, so no
// call site below changes.
async function withPg<T>(fn: (client: any) => Promise<T>): Promise<T | null> {
  let client: any;
  try { client = await getPgWithRetry(); } catch { return null; }
  try { return await fn(client); }
  catch (e) { console.error("[withPg->pool] Query execution failed:", e instanceof Error ? e.message : String(e)); return null; }
  finally { client.release(); }
}

function num(v: any): number { return Math.round((parseFloat(String(v ?? "0")) || 0) * 100) / 100; }

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("staff_groomer_management", "read"); if (gate) return gate;
  const { searchParams } = new URL(req.url);
  const days = Math.min(parseInt(searchParams.get("days") || "30") || 30, 365);
  return withPg(async (client) => {
    const tenant = resolveTenantId(req);
    const r = await client.query(
      `SELECT s.id::text AS staff_id, s.display_name, s.first_name, s.last_name, s.email, s.role, s.is_service_staff, s.is_active, s.color_label, s.hire_date, s.pay_type, s.hourly_rate, s.salary_amount, s.commission_rate, s.salary_period,
        (SELECT count(*)::int FROM public.crm_appointments a WHERE a.tenant_id = s.tenant_id AND a.assigned_groomer_id = s.id AND a.completed_at IS NOT NULL AND a.completed_at >= now() - ($2 || ' days')::interval) AS appointment_count,
        (SELECT COALESCE(SUM(a.total), 0)::numeric FROM public.crm_appointments a WHERE a.tenant_id = s.tenant_id AND a.assigned_groomer_id = s.id AND a.completed_at IS NOT NULL AND a.completed_at >= now() - ($2 || ' days')::interval) AS gross_revenue,
        (SELECT COALESCE(SUM(cp.tip_amount), 0)::numeric FROM public.commerce_payments cp WHERE cp.tenant_id = s.tenant_id AND cp.staff_id = s.id AND cp.status IN ('succeeded','captured') AND cp.created_at >= now() - ($2 || ' days')::interval) AS tips_earned,
        (SELECT COALESCE(SUM(e.commission_amount), 0)::numeric FROM public.crm_commission_entries e WHERE e.tenant_id = s.tenant_id AND e.staff_id = s.id AND e.entry_type = 'earned' AND e.status = 'pending' AND e.earned_on >= CURRENT_DATE - ($2 || ' days')::interval) AS commission_accrued
       FROM public.crm_staff s WHERE s.tenant_id = $1 ORDER BY s.is_active DESC, s.is_service_staff DESC, s.display_name`,
      [tenant, String(days)],
    );
    const staff = r.rows.map((row: any) => {
      const gross = num(row.gross_revenue);
      // Commission rate lives on the staff profile (crm_staff.commission_rate,
      // a percent — 50 means 50%); null until set on the profile. Accrued
      // commission is real ledger money: 'earned'/'pending' rows in
      // crm_commission_entries inside the selected window.
      const commissionRate = row.commission_rate == null ? null : num(row.commission_rate);
      const commissionOwed = num(row.commission_accrued);
      const tipsEarned = num(row.tips_earned);
      return {
        id: row.staff_id, name: row.display_name, role: row.role, isGroomer: !!row.is_service_staff, isActive: !!row.is_active,
        payType: row.pay_type || "hourly",
        hourlyRate: row.hourly_rate == null ? null : num(row.hourly_rate),
        salaryAmount: row.salary_amount == null ? null : num(row.salary_amount),
        salaryPeriod: row.salary_period || "annual",
        appointmentCount: Number(row.appointment_count) || 0, grossRevenue: gross, commissionRate, commissionOwed, tipsEarned, netPay: num(commissionOwed + tipsEarned),
      };
    });
    return NextResponse.json({ staff, totals: { staffCount: staff.length, totalAppointments: staff.reduce((s: number, r: any) => s + r.appointmentCount, 0), totalGross: num(staff.reduce((s: number, r: any) => s + r.grossRevenue, 0)), totalCommission: num(staff.reduce((s: number, r: any) => s + r.commissionOwed, 0)), totalTips: num(staff.reduce((s: number, r: any) => s + r.tipsEarned, 0)), totalNet: num(staff.reduce((s: number, r: any) => s + r.netPay, 0)) }, days });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
