import { NextRequest } from "next/server";
import { adminUpdate, resolveTenantId } from "@/lib/admin-api";

const TABLE = "crm_notes";
const SCHEMA = "public";

// PATCH /api/admin/crm/notes/[id] — update a note (the profile's pin
// toggle sends { is_pinned }). Goes through the same adminUpdate path as
// the other CRM record routes.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return adminUpdate(TABLE, id, body, { tenantId: resolveTenantId(req), schema: SCHEMA, legacyKey: "notes" });
}
