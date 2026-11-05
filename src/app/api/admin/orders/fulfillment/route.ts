import { NextRequest } from "next/server";
import { adminList, adminCreate, adminQuery, resolveTenantId} from "@/lib/admin-api";

const TABLE = "erp_fulfillment_orders";
const SCHEMA = "public";
const SEARCH_COLS = ["status", "order_id"];

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
    
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return adminCreate(TABLE, body, { tenantId: resolveTenantId(req),  schema: SCHEMA });
}
