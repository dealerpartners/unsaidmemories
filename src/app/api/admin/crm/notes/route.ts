import { NextRequest, NextResponse } from "next/server";
import { adminList, adminCreate, adminUpdate, adminQuery, resolveTenantId} from "@/lib/admin-api";

const TABLE = "crm_notes";
const SCHEMA = "public";
// crm_notes has NO title column — searching it 500'd. Real searchable
// columns only. note_type vocabulary (CHECK): internal, customer_visible,
// appointment, pet_handling, system (B.1.18).
const SEARCH_COLS = ["body", "note_type"];

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
    legacyKey: "notes",
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return adminCreate(TABLE, body, { tenantId: resolveTenantId(req),  schema: SCHEMA, legacyKey: "notes" });
}

// PATCH { id, is_pinned?, body? } — pin/unpin (and body edits) persist.
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "note id required" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (typeof body?.is_pinned === "boolean") patch.is_pinned = body.is_pinned;
  if (typeof body?.body === "string" && body.body.trim()) patch.body = body.body;
  return adminUpdate(TABLE, id, patch, { tenantId: resolveTenantId(req), schema: SCHEMA, legacyKey: "notes" });
}
