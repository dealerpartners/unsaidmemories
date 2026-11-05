import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getTicketById } from "@/lib/support/tickets"
import { resolveActingStaff } from "@/lib/support/actor"
import {
  AttachmentError, createAttachment, listAttachments,
} from "@/lib/support/attachments"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/tickets/[id]/attachments — §7 attachments, desk side.
//   GET  → every attachment on the ticket (internal included), with its
//          scan state. Downloads mint per-attachment (see [attachmentId]).
//   POST → multipart { file, visibility? } — one file per call. The
//          lib enforces the tree's rules server-side: per-file and
//          per-ticket caps and the blocked-extension list, each refusal
//          naming its rule. The row lands scan_status 'pending' — the
//          scanner seam decides when (whether) it can ever download.
// Visibility: staff choose per file ('public' reaches the requester's
// thread; 'internal' never does). Omitted → 'internal', the column's
// own default — the safe direction.
// ============================================================================

function fail(e: unknown) {
  if (e instanceof AttachmentError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status })
  }
  const msg = e instanceof Error ? e.message : String(e)
  console.error("[support-attachments desk] failed:", msg)
  return NextResponse.json({ ok: false, error: "Attachment request failed" }, { status: 500 })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate
  const { id } = await ctx.params
  try {
    const out = await withPg(async (c) => {
      const tenant = resolveTenantId(req)
      const ticket = await getTicketById(c, tenant, id)
      if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
      const attachments = await listAttachments(c, tenant, ticket.id)
      return NextResponse.json({ attachments })
    })
    return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
  } catch (e) {
    return fail(e)
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const { id } = await ctx.params
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ ok: false, error: "Multipart form required" }, { status: 400 })
  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "A file is required" }, { status: 400 })
  }
  const visibility = String(form.get("visibility") || "internal") === "public" ? "public" : "internal"
  const staff = await resolveActingStaff()

  try {
    const out = await withPg(async (c) => {
      const tenant = resolveTenantId(req)
      const ticket = await getTicketById(c, tenant, id)
      if (!ticket) return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 })
      const bytes = new Uint8Array(await file.arrayBuffer())
      const attachment = await createAttachment(c, tenant, {
        ticket,
        filename: file.name || "attachment",
        declaredMime: file.type || null,
        bytes,
        visibility,
        uploadedByStaffId: staff?.staffId ?? null,
        actorLabel: staff?.name ?? staff?.email ?? null,
        actorKind: "staff",
        via: "support_desk",
      })
      return NextResponse.json({ ok: true, attachment }, { status: 201 })
    })
    return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
  } catch (e) {
    return fail(e)
  }
}
