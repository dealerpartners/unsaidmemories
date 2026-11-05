import { NextResponse } from "next/server";
import { getShopper, listShopperTickets, publicTicket } from "@/lib/customer-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/customer/support/tickets — the signed-in customer's own
    tickets (reference, subject, status), newest activity first. */
export async function GET() {
  const shopper = await getShopper();
  if (!shopper) return NextResponse.json({ error: "Sign in to see your support conversations." }, { status: 401 });
  const tickets = await listShopperTickets(shopper);
  return NextResponse.json({ tickets: tickets.map(publicTicket) });
}
