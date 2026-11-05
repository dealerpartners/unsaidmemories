import { NextRequest } from "next/server";
import { adminList, adminQuery, resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";

const TABLE = "acct_bank_transactions";
const SCHEMA = "public";
const SEARCH_COLS = ["description", "payee", "reference", "match_status"];

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
