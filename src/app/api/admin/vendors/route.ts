import { NextRequest, NextResponse } from "next/server";
import { requireModuleApi } from "@/lib/admin/gate";
import { adminList, adminGet, adminCreate, adminUpdate, adminDelete, adminQuery, resolveTenantId} from "@/lib/admin-api";

export const dynamic = "force-dynamic";

const TABLE = "erp_vendors";

// GET /api/admin/vendors -> { data, total } | ?id= -> { data }
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("purchasing", "read");
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get("id");
  if (id) return adminGet(TABLE, id, { preGated: true, tenantId: resolveTenantId(req),  legacyKey: "vendor" });
  const q = adminQuery(req);
  return adminList(TABLE, { preGated: true, tenantId: resolveTenantId(req), 
    search: q.search,
    searchCols: ["name", "code", "email", "contact_name"],
    limit: q.limit,
    offset: q.offset,
    order: q.order || "name.asc",
    filters: q.filters,
    legacyKey: "vendors",
  });
}

// POST /api/admin/vendors -> create
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("purchasing", "write");
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  return adminCreate(TABLE, body, { preGated: true, tenantId: resolveTenantId(req),  legacyKey: "vendor" });
}

// PATCH /api/admin/vendors?id= -> update
export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("purchasing", "write");
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const body = await req.json().catch(() => null);
  return adminUpdate(TABLE, id, body, { preGated: true, tenantId: resolveTenantId(req),  legacyKey: "vendor" });
}

// DELETE /api/admin/vendors?id=
export async function DELETE(req: NextRequest) {
  const denied = await requireModuleApi("purchasing", "write");
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  return adminDelete(TABLE, id, { preGated: true, tenantId: resolveTenantId(req) });
}
