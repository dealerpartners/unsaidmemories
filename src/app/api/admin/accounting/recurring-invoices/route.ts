import { NextRequest, NextResponse } from "next/server";
import { adminList, adminCreate, adminQuery, resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";

const TABLE = "acct_recurring_invoices";
const SCHEMA = "public";
const SEARCH_COLS = ["template_name", "status", "frequency"];

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
  if (!body?.template_name) {
    return NextResponse.json({ error: "template_name is required" }, { status: 400 });
  }
  const freq = String(body.frequency || "monthly");
  if (!["weekly", "biweekly", "monthly", "quarterly", "semiannual", "annual"].includes(freq)) {
    return NextResponse.json({ error: `Invalid frequency: ${freq}` }, { status: 400 });
  }
  // Default next_run_on to starts_on when not provided
  if (!body.next_run_on && body.starts_on) body.next_run_on = body.starts_on;
  return adminCreate(TABLE, body, { preGated: true, tenantId: resolveTenantId(req), schema: SCHEMA });
}
