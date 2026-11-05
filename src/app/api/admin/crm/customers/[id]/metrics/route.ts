import { NextRequest, NextResponse } from "next/server";
import { requireModuleApi } from "@/lib/admin/gate";
import { getCustomerIntelligence } from "@/lib/admin/customer-metrics";
import { scoreLifecycle } from "@/lib/admin/lifecycle-scoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/crm/customers/[id]/metrics
// Full customer intelligence: metrics (1.6), behavioral (1.9), operational (1.10),
// marketing segments (1.11), service profile (1.20), lifecycle score (1.7/1.8).
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireModuleApi("customers", "read");
  if (gate) return gate;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "customer id required" }, { status: 400 });

  try {
    const [intelligence, lifecycle] = await Promise.all([
      getCustomerIntelligence(id),
      scoreLifecycle(id),
    ]);
    return NextResponse.json({ data: { ...intelligence, lifecycle } });
  } catch (e: any) {
    // A missing source table (crm_appointments, crm_unsigned_documents and
    // crm_pet_vaccinations are not provisioned in this database yet) is an
    // unwired input, not a crash. Answer with a named 503 so the UI can say
    // plainly that this part isn't wired yet — metrics are never fabricated
    // over the gap, and a bare 500 hides the distinction.
    const missing = missingRelation(e);
    if (missing) {
      return NextResponse.json(
        {
          error: "metrics_unavailable",
          missing_table: missing,
          detail: `The ${missing} table is not provisioned in this database yet.`,
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: e?.message || "Failed to compute metrics" }, { status: 500 });
  }
}

/** The relation named by a Postgres undefined-table error (42P01), if any. */
function missingRelation(e: any): string | null {
  const msg = String(e?.message || "");
  if (e?.code !== "42P01" && !/does not exist/.test(msg)) return null;
  const m = msg.match(/relation "([^"]+)" does not exist/);
  return m ? m[1] : "unknown";
}
