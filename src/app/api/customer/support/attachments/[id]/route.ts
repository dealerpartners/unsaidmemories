import { NextRequest, NextResponse } from "next/server";
import { db, T } from "@/lib/trust/support";
import { getShopper, listShopperTickets } from "@/lib/customer-support";
import { signObject } from "@/lib/support/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/customer/support/attachments/[id] — a short-lived signed
    URL for one of the customer's own public attachments, and only
    once its security scan is clean. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const shopper = await getShopper();
  if (!shopper) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const sb = db();
  const { data: att } = await sb
    .from("support_attachments")
    .select("id, ticket_id, visibility, scan_status, storage_key")
    .eq("tenant_id", T())
    .eq("id", id)
    .maybeSingle();
  if (!att || att.visibility !== "public") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const tickets = await listShopperTickets(shopper);
  if (!tickets.some((t) => t.id === att.ticket_id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (att.scan_status === "pending") return NextResponse.json({ error: "That file is still being scanned — try again in a moment." }, { status: 409 });
  if (att.scan_status !== "clean") return NextResponse.json({ error: "That file didn't pass its security scan." }, { status: 410 });
  const url = await signObject(att.storage_key);
  if (!url) return NextResponse.json({ error: "Download unavailable right now." }, { status: 503 });
  return NextResponse.json({ url });
}
