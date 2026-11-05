import {
  createTicket,
  appendTicketMessage,
  getTicketById,
  type CreateTicketInput,
} from "@/lib/support/tickets";

// ---------------------------------------------------------------------------
// onboarding/desk-ticket.ts — the bridge between the self-serve onboarding
// engine and the live support desk. The model (Jaizon, 2026-10-22): the
// system does not gate partners at the door; it keeps the admin updated by
// filing desk tickets at the moments that matter (completion, proof
// submission, payout identity mismatch, tax-form threshold). Everything
// funnels through the existing desk machinery (createTicket /
// appendTicketMessage in src/lib/support/tickets.ts) so refs are real
// SUP-#### refs the desk UI already renders. Callers pass the pg client +
// tenant they already hold (the withPg session pattern used across the
// codebase); the ticket input's `body` becomes the thread's first message.
// ---------------------------------------------------------------------------

export interface DeskTicketResult {
  id: string;
  ticketRef: string;
}

export type DeskTicketInput = CreateTicketInput & { body?: string };

export async function fileDeskTicket(
  client: any,
  tenant: string,
  input: DeskTicketInput,
): Promise<DeskTicketResult | null> {
  const { body, ...ticketInput } = input;
  const ticket = await createTicket(client, tenant, ticketInput);
  if (!ticket) return null;
  if (body && body.trim()) {
    await appendTicketMessage(client, tenant, ticket, {
      channel: "chat",
      direction: "outbound",
      status: "sent",
      body,
      metadata: { source: "self_serve_onboarding", system: true },
    }).catch(() => null);
  }
  return { id: ticket.id, ticketRef: ticket.ticketRef };
}

export async function appendToTicketByRef(
  client: any,
  tenant: string,
  ticketRef: string,
  body: string,
): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT id::text AS id FROM public.support_tickets
      WHERE tenant_id = $1 AND ticket_ref = $2 LIMIT 1`,
    [tenant, ticketRef],
  );
  const id = rows[0]?.id as string | undefined;
  if (!id) return false;
  const ticket = await getTicketById(client, tenant, id).catch(() => null);
  if (!ticket) return false;
  const msg = await appendTicketMessage(client, tenant, ticket, {
    channel: "chat",
    direction: "outbound",
    status: "sent",
    body,
    metadata: { source: "self_serve_onboarding", system: true },
  }).catch(() => null);
  return Boolean(msg);
}
