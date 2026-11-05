import { NextRequest, NextResponse } from "next/server";
import { db, T } from "@/lib/trust/support";
import { getShopper, listShopperTickets } from "@/lib/customer-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* CSAT for the customer's most recent finished ticket: the score
   lives on support_tickets.csat_score (the desk's reporting reads
   it); the comment + answer time ride in the ticket's metadata. */

function csatState(t: any) {
  if (!t) {
    return { state: "none", ticketId: null, ticketRef: null, subject: null, ticketStatus: null, score: null, comment: null, answeredAt: null };
  }
  const md = (t.metadata ?? {}) as Record<string, any>;
  const base = { ticketId: t.id, ticketRef: t.ticket_ref, subject: t.subject, ticketStatus: t.status };
  if (t.csat_score != null) {
    return { ...base, state: "rated", score: t.csat_score, comment: md.csat_comment ?? null, answeredAt: md.csat_answered_at ?? null };
  }
  return { ...base, state: "prompt", score: null, comment: null, answeredAt: null };
}

function latestFinished(tickets: any[]) {
  return tickets
    .filter((t) => t.status === "resolved" || t.status === "closed")
    .sort((a, b) => String(b.resolved_at ?? b.closed_at ?? b.updated_at).localeCompare(String(a.resolved_at ?? a.closed_at ?? a.updated_at)))[0] ?? null;
}

export async function GET() {
  const shopper = await getShopper();
  if (!shopper) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const tickets = await listShopperTickets(shopper);
  return NextResponse.json({ csat: csatState(latestFinished(tickets)) });
}

export async function POST(req: NextRequest) {
  const shopper = await getShopper();
  if (!shopper) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const ticketId = String(body?.ticketId ?? "");
  const score = Number(body?.score);
  if (!ticketId || !Number.isInteger(score) || score < 1 || score > 5) {
    return NextResponse.json({ error: "Pick a rating from 1 to 5." }, { status: 400 });
  }
  const tickets = await listShopperTickets(shopper);
  const ticket = tickets.find((t) => t.id === ticketId && (t.status === "resolved" || t.status === "closed"));
  if (!ticket) return NextResponse.json({ error: "That conversation can't be rated." }, { status: 404 });
  const sb = db();
  const metadata = {
    ...((ticket.metadata ?? {}) as Record<string, any>),
    csat_comment: body?.comment ? String(body.comment).slice(0, 1000) : null,
    csat_answered_at: new Date().toISOString(),
  };
  const { error } = await sb
    .from("support_tickets")
    .update({ csat_score: score, metadata })
    .eq("tenant_id", T())
    .eq("id", ticketId);
  if (error) return NextResponse.json({ error: "Could not save your rating." }, { status: 500 });
  return NextResponse.json({ csat: csatState({ ...ticket, csat_score: score, metadata }) });
}
