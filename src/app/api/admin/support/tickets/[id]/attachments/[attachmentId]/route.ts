import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getTicketById } from "@/lib/support/tickets"
import { resolveActingStaff } from "@/lib/support/actor"
import {
  AttachmentError, getAttachment, mintDownload, requestRescan,
} from "@/lib/support/attachments"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/tickets/[id]/attachments/[attachmentId]
//   GET  → mint a download: a short-lived signed URL, ONLY when the
//          attachment's scan is clean (the tree's rule — downloads are
//          blocked until clean). The mint lands on the ticket's event
//          stream. A non-clean scan is a 403 that names the state.
//   POST → { action: 'rescan' } — a failed scan goes back to pending
//          and the scanner seam is offered the file again. Any other
//          state is a 409: clean and infected verdicts are final.
// ============================================================================

function fail(e: unknown) {
  if (e instanceof AttachmentError) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status })
  }
  const msg = e instanceof Error ? e.message : String(e)
  console.error("[support-attachments desk/item] failed:", msg)
  return NextResponse.json({ ok: false, error: "Attachment request failed" }, { status: 500 })
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate
  const { id, attachmentId } = await ctx.params
  const staff = await resolveActingStaff()
  try {
    const out = await withPg(async (c) => {
      const tenant = resolveTenantId(req)
      const ticket = await getTicketById(c, tenant, id)
      if (!ticket) return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 })
      const attachment = await getAttachment(c, tenant, ticket.id, attachmentId)
      if (!attachment) return NextResponse.json({ ok: false, error: "Attachment not found" }, { status: 404 })
      const dl = await mintDownload(c, tenant, {
        attachment,
        actorLabel: staff?.name ?? staff?.email ?? null,
        actorStaffId: staff?.staffId ?? null,
        actorKind: "staff",
      })
      return NextResponse.json({ ok: true, ...dl })
    })
    return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
  } catch (e) {
    return fail(e)
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const { id, attachmentId } = await ctx.params
  const payload = await req.json().catch(() => null)
  if (payload?.action !== "rescan") {
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 })
  }
  const staff = await resolveActingStaff()
  try {
    const out = await withPg(async (c) => {
      const tenant = resolveTenantId(req)
      const ticket = await getTicketById(c, tenant, id)
      if (!ticket) return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 })
      const attachment = await requestRescan(c, tenant, ticket.id, attachmentId, {
        staffId: staff?.staffId ?? null,
        label: staff?.name ?? staff?.email ?? null,
      })
      return NextResponse.json({ ok: true, attachment })
    })
    return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
  } catch (e) {
    return fail(e)
  }
}
