import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

/** Register a customer document (design approval, consent form, ID, contract). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.name?.trim()) return NextResponse.json({ error: "Document name is required." }, { status: 400 });
  const db = getDb();
  const tenantId = await getTenantId(db);
  const { data, error } = await db
    .from("crm_documents")
    .insert({
      tenant_id: tenantId,
      customer_id: id,
      name: body.name.trim(),
      status: body.status || "active",
      storage_path: body.storage_path || null,
      mime_type: body.mime_type || null,
      file_size_bytes: body.file_size_bytes || null,
      uploaded_by: gate.admin.userId,
      uploaded_at: new Date().toISOString(),
      issued_at: body.issued_at || null,
      expires_at: body.expires_at || null,
      order_id: body.order_id || null,
      metadata: body.document_kind ? { kind: body.document_kind } : {},
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  await params;
  const body = await req.json().catch(() => null);
  if (!body?.document_id || !body?.status) {
    return NextResponse.json({ error: "document_id and status are required." }, { status: 400 });
  }
  const db = getDb();
  const { error } = await db
    .from("crm_documents")
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq("id", body.document_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
