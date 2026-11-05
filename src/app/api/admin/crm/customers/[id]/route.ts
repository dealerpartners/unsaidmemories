import { NextRequest } from "next/server";
import { adminGet, adminUpdate, adminDelete, resolveTenantId} from "@/lib/admin-api";

const TABLE = "crm_customers";
const SCHEMA = "public";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminGet(TABLE, id, { tenantId: resolveTenantId(req),  schema: SCHEMA, legacyKey: "customers" });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return adminUpdate(TABLE, id, body, { tenantId: resolveTenantId(req),  schema: SCHEMA, legacyKey: "customers" });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminDelete(TABLE, id, { tenantId: resolveTenantId(req),  schema: SCHEMA });
}
