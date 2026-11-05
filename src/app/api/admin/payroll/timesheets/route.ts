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

// GET /api/admin/payroll/timesheets — list timesheets with employee info, pending first
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("staff_groomer_management", "read");
  if (gate) return gate;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // pending | approved | all
  return withPg(async (client) => {
    const tenant = resolveTenantId(req);
    let where = "t.tenant_id = $1";
    const params: unknown[] = [tenant];
    if (status && status !== "all") {
      where += " AND t.status = $2";
      params.push(status);
    }
    const r = await client.query(
      `SELECT t.id::text AS id, t.employee_id::text AS employee_id,
              s.display_name AS employee_name,
              t.week_start::text AS week_start,
              COALESCE(t.hours_regular, 0)::numeric AS hours_regular,
              COALESCE(t.hours_overtime, 0)::numeric AS hours_overtime,
              COALESCE(t.hours_pto, 0)::numeric AS hours_pto,
              COALESCE(t.hours_sick, 0)::numeric AS hours_sick,
              t.status, t.notes
         FROM public.payroll_timesheets t
         LEFT JOIN public.crm_staff s ON s.id = t.employee_id
        WHERE ${where}
        ORDER BY CASE WHEN t.status = 'pending' THEN 0 ELSE 1 END, t.week_start DESC`,
      params,
    );
    return NextResponse.json({ timesheets: r.rows });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
