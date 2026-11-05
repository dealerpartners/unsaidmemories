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

// POST /api/admin/payroll/timesheets/approve — bulk approve timesheets by ID
// Body: { ids: string[] }
export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("staff_groomer_management", "write");
  if (gate) return gate;
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "No timesheet IDs provided" }, { status: 400 });
  }
  return withPg(async (client) => {
    const tenant = resolveTenantId(req);
    const r = await client.query(
      `UPDATE public.payroll_timesheets
          SET status = 'approved'
        WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND status = 'pending'`,
      [tenant, ids],
    );
    return NextResponse.json({ ok: true, approved: r.rowCount ?? 0 });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 }))
    .catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
