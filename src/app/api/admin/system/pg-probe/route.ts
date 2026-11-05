import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FOUNDATION PROBE — UnSaid Memories admin transplant foundation (2026-10-30).
 *
 * Proves the raw-pg layer (src/lib/pg.ts) end to end in the Vercel
 * runtime: the gate passes, withPg checks a client out of the pool, and
 * a real query runs against Unsaid's Supabase Postgres over the pooler
 * (this layer cannot be exercised from the build VM, whose egress cannot
 * reach Postgres ports). Read-only; counts a table the CRM schema diff
 * (tools/schema-diff.js) shows exists on both sides of the transplant.
 * Safe to remove once module transplants land on the layer.
 */
export async function GET() {
  const gate = await requireAdminApi();
  if (gate) return gate;

  const count = await withPg(async (client) => {
    const { rows } = await client.query<{ n: string }>(
      "select count(*)::bigint as n from crm_customers",
    );
    return Number(rows[0]?.n ?? 0);
  });

  if (count === null) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "pg layer unreachable — UNSAID_DATABASE_URL unset or the database query failed.",
      },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, via: "withPg", table: "crm_customers", count });
}
