import { NextRequest, NextResponse } from "next/server";
import { T } from "@/lib/trust/support";
import { getShopper, resolveShopperTicket, listShopperTickets } from "@/lib/customer-support";
import { withPg } from "@/lib/pg";
import { getTicketById } from "@/lib/support/tickets";
import { createAttachment, getAttachment, listAttachments, submitForScan } from "@/lib/support/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Attachments on the customer's own conversation — the desk's
   support_attachments store, requester side. Only public files on
   the customer's own tickets are ever listed or added. */

const mapAtt = (a: any) => ({
  id: a.id,
  filename: a.filename,
  sizeBytes: a.sizeBytes,
  scanStatus: a.scanStatus,
  createdAt: a.createdAt,
});

export async function GET(req: NextRequest) {
  const shopper = await getShopper();
  if (!shopper) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { ticket } = await resolveShopperTicket(shopper, req.nextUrl.searchParams.get("ticket"));
  if (!ticket) return NextResponse.json({ attachments: [] });
  const rows = await withPg((c) => listAttachments(c, T(), ticket.id));
  if (!rows) return NextResponse.json({ attachments: [] });
  return NextResponse.json({ attachments: rows.filter((a) => a.visibility === "public").map(mapAtt) });
}

export async function POST(req: NextRequest) {
  const shopper = await getShopper();
  if (!shopper) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file received." }, { status: 400 });
  const selector = fd?.get("ticketId") ? String(fd.get("ticketId")) : null;
  const { ticket } = await resolveShopperTicket(shopper, selector);
  if (!ticket) {
    return NextResponse.json({ error: "Start the conversation with a message first, then attach files to it." }, { status: 404 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const created = await withPg(async (c) => {
      const full = await getTicketById(c, T(), ticket.id);
      if (!full) return null;
      const att = await createAttachment(c, T(), {
        ticket: full,
        filename: file.name || "attachment",
        declaredMime: file.type || null,
        bytes,
        visibility: "public",
        actorKind: "requester",
        actorLabel: shopper.name ?? shopper.email,
        via: "customer_thread",
      });
      const fullAtt = await getAttachment(c, T(), att.ticketId, att.id).catch(() => null);
      if (fullAtt) {
        void submitForScan({
          id: fullAtt.id, storageKey: fullAtt.storageKey, sha256: fullAtt.sha256,
          tenantId: T(), ticketId: fullAtt.ticketId,
        }).catch(() => {});
      }
      return att;
    });
    if (!created) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
    return NextResponse.json({ attachment: mapAtt(created) }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not attach that file." }, { status: e?.status ?? 400 });
  }
}
