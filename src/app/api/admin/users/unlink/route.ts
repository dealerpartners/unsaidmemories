import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";
import pg from "pg";
import { pgConnectionString, toTransactionPooler } from "@/lib/pg";

// POST /api/admin/users/unlink  { userId }
//
// The manual escape hatch from the owner's join spec §3: auto-join is exact
// email match with no confirmation step, so the rare wrong join (two people
// sharing an email) is fixed after the fact.
//
// On the owner's tables: deletes the portal_customer_accounts row — THAT row
// is the login↔person join (auth_user_id ↔ crm_customers). The crm_customers
// person record, the operational salon record, the login, and any orders all
// survive; they are just no longer attached. The app-table mirror
// (customers."userId") is cleared to match. A future transaction under the
// same email re-applies the exact-email join (the documented default).
export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;

  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const cs = toTransactionPooler(process.env.SUPABASE_SESSION_POOLER || process.env.SUPABASE_DIRECT_CONNECTION || pgConnectionString);
    if (!cs) return NextResponse.json({ error: "No database connection configured" }, { status: 500 });

    const client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      // 1. Remove the join row (the login ↔ crm_customers registry entry).
      const portal = await client.query(
        `DELETE FROM public.portal_customer_accounts WHERE auth_user_id = $1::uuid RETURNING id;`,
        [userId],
      );
      // 2. Clear the app-table mirror of the join.
      const appMirror = await client.query(
        `UPDATE public.customers SET "userId" = NULL WHERE "userId" = $1::text RETURNING id;`,
        [userId],
      );
      const unlinked = (portal.rowCount || 0) + (appMirror.rowCount || 0);
      return NextResponse.json({
        success: true,
        unlinked,
        message:
          unlinked > 0
            ? "Login unlinked from the customer record. Both records remain — a future transaction under the same email re-joins them."
            : "No customer record was linked to this login.",
      });
    } finally {
      await client.end().catch(() => {});
    }
  } catch (err: any) {
    console.error("[POST /api/admin/users/unlink]", err);
    return NextResponse.json({ error: err.message || "Unlink failed" }, { status: 500 });
  }
}
