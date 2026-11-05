import { NextRequest } from "next/server";
import { adminList, resolveTenantId} from "@/lib/admin-api";

const TABLE = "crm_lost_reasons";
const SCHEMA = "public";

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams;
  return adminList(TABLE, { tenantId: resolveTenantId(req), 
    schema: SCHEMA,
    limit: parseInt(q.get("limit") || "50"),
    legacyKey: "lost_reasons",
  });
}
