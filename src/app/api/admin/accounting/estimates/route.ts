import { NextRequest, NextResponse } from "next/server";
import { adminList, adminCreate, adminQuery, resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";

const TABLE = "acct_estimates";
const SCHEMA = "public";
const SEARCH_COLS = ["estimate_number", "status", "notes"];

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  const q = adminQuery(req);
  return adminList(TABLE, {
    preGated: true,
    tenantId: resolveTenantId(req),
    schema: SCHEMA,
    search: q.search,
    searchCols: SEARCH_COLS,
    limit: q.limit,
    offset: q.offset,
    filters: q.filters,
    ...(q.order ? { order: q.order } : {}),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const body = await req.json().catch(() => null);
  if (!body?.estimate_number) {
    return NextResponse.json({ error: "estimate_number is required" }, { status: 400 });
  }
  return adminCreate(TABLE, body, { preGated: true, tenantId: resolveTenantId(req), schema: SCHEMA });
}
