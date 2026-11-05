import { NextRequest } from "next/server";
import { adminList, adminCreate, adminQuery, resolveTenantId} from "@/lib/admin-api";

const TABLE = "crm_customers";
const SCHEMA = "public";
const SEARCH_COLS = ["first_name", "last_name", "email", "phone"];

export async function GET(req: NextRequest) {
  const q = adminQuery(req);
  return adminList(TABLE, { tenantId: resolveTenantId(req), 
    schema: SCHEMA,
    search: q.search,
    searchCols: SEARCH_COLS,
    limit: q.limit,
    offset: q.offset,
    filters: q.filters,
    ...(q.order ? { order: q.order } : {}),
    legacyKey: "customers",
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return adminCreate(TABLE, body, { tenantId: resolveTenantId(req),  schema: SCHEMA, legacyKey: "customers" });
}
