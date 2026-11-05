import { NextRequest, NextResponse } from "next/server";
import { requireModuleApi } from "@/lib/admin/gate";
import { getCustomerFlags } from "@/lib/admin/customer-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/crm/customers/[id]/flags
// Customer flags: behavioral (1.9), operational (1.10), marketing segments (1.11).
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireModuleApi("customers", "read");
  if (gate) return gate;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "customer id required" }, { status: 400 });

  try {
    const flags = await getCustomerFlags(id);
    return NextResponse.json({ data: flags });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to compute flags" }, { status: 500 });
  }
}
