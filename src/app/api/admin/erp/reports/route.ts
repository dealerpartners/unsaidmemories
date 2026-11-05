import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/lib/admin/gate";
import { opsReport, opsLedgerCsv } from "@/lib/orders/erp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/erp/reports — operations summary (MTD revenue, status mix).
// GET /api/admin/erp/reports?format=csv — the export ledger.
export async function GET(req: NextRequest) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  if (req.nextUrl.searchParams.get("format") === "csv") {
    const csv = await opsLedgerCsv();
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="ops-ledger.csv"' },
    });
  }
  try {
    return NextResponse.json(await opsReport());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
