import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId, getOverview } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const db = getDb();
  const tenantId = await getTenantId(db);
  const overview = await getOverview(db, tenantId);
  return NextResponse.json(overview);
}
