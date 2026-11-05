import { NextResponse } from "next/server";
import { requireAdmin, isError } from "@/lib/admin/gate";
import { db, T, logEvent } from "@/lib/trust/support";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(req);
  if (isError(gate)) return gate;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const kind = body.kind === "internal_note" ? "internal_note" : "reply";
  if (!body.body?.trim()) return NextResponse.json({ error: "message body is required" }, { status: 400 });
  const sb = db();
  const { data: ticket } = await sb.from("support_tickets").select("*").eq("id", id).eq("tenant_id", T()).single();
  if (!ticket) return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  const cc: string[] = Array.isArray(body.cc) ? body.cc : [];
  if (kind === "reply" && cc.length) {
    for (const email of cc) {
      await sb.from("support_ticket_participants").insert({
        tenant_id: T(), ticket_id: id, participant_kind: "cc",
        email, contact_id: null, staff_id: null,
      });
    }
  }
  const { data: msg, error } = await sb.from("crm_messages").insert({
    tenant_id: T(), conversation_id: ticket.conversation_id,
    customer_id: ticket.requester_customer_id ?? null,
    channel: kind === "internal_note" ? "internal" : "email",
    direction: "outbound", status: "sent",
    from_address: gate.email, to_address: ticket.requester_email,
    subject: `Re: ${ticket.subject}`, body: body.body, body_text: body.body,
    cc_addresses: cc, bcc_addresses: [], email_references: [],
    authored_by_staff_id: gate.portalUserId, created_by: gate.userId,
    metadata: kind === "internal_note" ? { internal: true } : {},
    quoted_content_stripped: false, is_auto_reply: false, is_system_generated: false,
    sent_at: new Date().toISOString(),
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    last_message_at: now, updated_at: now,
    message_count: (ticket.message_count ?? 0) + 1,
  };
  // Taking ownership: a public reply on an unassigned ticket assigns the
  // ticket to the staffer who answered — the same portal_user identity the
  // reply is authored under (authored_by_staff_id above). Manual assignment
  // can still move the ticket afterwards; an already-assigned ticket is
  // never stolen by a later reply.
  const autoAssign = kind === "reply" && !ticket.assigned_staff_id && !!gate.portalUserId;
  if (kind === "reply") {
    patch.public_reply_count = (ticket.public_reply_count ?? 0) + 1;
    if (!ticket.first_public_reply_at) patch.first_public_reply_at = now;
    if (ticket.status === "open") patch.status = "pending";
    if (autoAssign) patch.assigned_staff_id = gate.portalUserId;
  }
  await sb.from("support_tickets").update(patch).eq("id", id);
  await logEvent(id, kind === "reply" ? "reply_sent" : "internal_note",
    { summary: kind === "reply" ? `Public reply sent${cc.length ? ` (CC: ${cc.join(", ")})` : ""}` : "Internal note added", message_id: msg.id },
    { staffId: gate.portalUserId, label: gate.displayName || gate.email }, kind === "reply" ? "public" : "internal");
  if (autoAssign) {
    await logEvent(id, "assigned",
      { summary: "Assigned to the replying staffer", from: null, to: gate.portalUserId, toName: gate.displayName || gate.email, via: "reply" },
      { staffId: gate.portalUserId, label: gate.displayName || gate.email }, "internal");
  }
  return NextResponse.json({ message: msg }, { status: 201 });
}
