import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/lib/admin/gate";
import { ordersToCsv } from "@/lib/orders/erp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/erp/orders/export?view=&q= — orders CSV export.
export async function GET(req: NextRequest) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  const sp = req.nextUrl.searchParams;
  const csv = await ordersToCsv(sp.get("view") || "all", sp.get("q") || undefined);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="orders-export.csv"`,
    },
  });
}
