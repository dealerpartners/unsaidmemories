import { NextRequest, NextResponse } from "next/server";
import { getContentBlocks, createContentBlock, updateContentBlock, deleteContentBlock } from "@/lib/cms";
import { logAuditEvent } from "@/lib/cms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/cms/blocks — list content blocks (filterable)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const blocks = await getContentBlocks({
    pageId: searchParams.get("pageId") ?? undefined,
    slotId: searchParams.get("slotId") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    locale: searchParams.get("locale") ?? undefined,
  });
  return NextResponse.json({ blocks });
}

// POST /api/admin/cms/blocks — create a content block
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.component_type || !body.block_id) {
    return NextResponse.json({ error: "component_type and block_id are required" }, { status: 400 });
  }
  const block = await createContentBlock({
    block_id: body.block_id,
    component_type: body.component_type,
    schema_id: body.schema_id,
    props: body.props ?? {},
    slot_id: body.slot_id,
    page_id: body.page_id,
    status: body.status ?? "draft",
    locale: body.locale ?? "en-US",
    sort_order: body.sort_order ?? 0,
    created_by: body.created_by,
  });
  if (!block) {
    return NextResponse.json({ error: "Failed to create block" }, { status: 500 });
  }
  await logAuditEvent({
    action: "CREATE",
    entity: "content_block",
    entity_id: block.id,
    user_id: body.created_by,
    details: { block_id: block.block_id, component_type: block.component_type },
  });
  return NextResponse.json({ block }, { status: 201 });
}

// PATCH /api/admin/cms/blocks — update a content block
export async function PATCH(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const block = await updateContentBlock(body.id, {
    props: body.props,
    status: body.status,
    slot_id: body.slot_id,
    sort_order: body.sort_order,
    scheduled_at: body.scheduled_at,
  });
  if (!block) {
    return NextResponse.json({ error: "Block not found or no changes" }, { status: 404 });
  }
  await logAuditEvent({
    action: "UPDATE",
    entity: "content_block",
    entity_id: block.id,
    user_id: body.created_by,
    details: { block_id: block.block_id, changes: Object.keys(body).filter(k => k !== "id" && k !== "created_by") },
  });
  return NextResponse.json({ block });
}

// DELETE /api/admin/cms/blocks?id=... — delete a content block
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }
  const ok = await deleteContentBlock(id);
  if (!ok) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
  await logAuditEvent({ action: "DELETE", entity: "content_block", entity_id: id });
  return NextResponse.json({ ok: true });
}
