import { NextRequest } from "next/server";
import { adminList, adminCreate, adminQuery, resolveTenantId} from "@/lib/admin-api";

const TABLE = "platform_admins";
const SCHEMA = "public";
const SEARCH_COLS = ["user_id", "reason"];
const PK = "user_id"; // platform_admins has no `id` column; PK is user_id

export async function GET(req: NextRequest) {
  const q = adminQuery(req);
  return adminList(TABLE, { tenantId: resolveTenantId(req), 
    schema: SCHEMA,
    pk: PK,
    search: q.search,
    searchCols: SEARCH_COLS,
    limit: q.limit,
    offset: q.offset,
    filters: q.filters,
    ...(q.order ? { order: q.order } : {}),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return adminCreate(TABLE, body, { tenantId: resolveTenantId(req),  schema: SCHEMA, pk: PK });
}
