/* Customer-side support access — the signed-in shopper's view of the
   SAME support model the desk works: support_tickets (one conversation
   each, crm_messages by conversation_id). Identity is the storefront
   session; tickets match by the linked CRM customer or by the
   account's email, exactly the linkage the contact intake makes.
   Nothing here invents a parallel store. */
import { createAuthClient } from "@/lib/supabase/server";
import { db, T } from "@/lib/trust/support";

export type Shopper = {
  userId: string;
  email: string;
  name: string | null;
  customerId: string | null;
};

export async function getShopper(): Promise<Shopper | null> {
  const auth = await createAuthClient();
  const { data: { user } } = await auth.auth.getUser().catch(() => ({ data: { user: null } }));
  if (!user?.email) return null;
  const sb = db();
  const { data: crm } = await sb
    .from("crm_customers")
    .select("id, first_name, last_name")
    .eq("tenant_id", T())
    .ilike("email", user.email)
    .is("merged_into_customer_id", null)
    .maybeSingle();
  const crmName = crm ? [crm.first_name, crm.last_name].filter(Boolean).join(" ") || null : null;
  const metaName = (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || null;
  return { userId: user.id, email: user.email, name: crmName ?? metaName, customerId: crm?.id ?? null };
}

const TICKET_COLS =
  "id, ticket_ref, subject, status, category, last_message_at, created_at, updated_at, conversation_id, message_count, csat_score, resolved_at, closed_at, metadata";

export type ShopperTicket = Record<string, any>;

export async function listShopperTickets(shopper: Shopper): Promise<ShopperTicket[]> {
  const sb = db();
  let q = sb
    .from("support_tickets")
    .select(TICKET_COLS)
    .eq("tenant_id", T())
    .eq("requester_type", "customer")
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(50);
  q = shopper.customerId
    ? q.or(`requester_customer_id.eq.${shopper.customerId},requester_email.ilike.${shopper.email}`)
    : q.ilike("requester_email", shopper.email);
  const { data } = await q;
  return (data ?? []) as ShopperTicket[];
}

/** The ticket a customer surface should show: the explicitly selected
    one (id or SUP-ref) when it is theirs; otherwise the open thread;
    otherwise the most recent. A selector that isn't theirs resolves
    to null — never to someone else's ticket. */
export async function resolveShopperTicket(
  shopper: Shopper,
  selector?: string | null,
): Promise<{ ticket: ShopperTicket | null; tickets: ShopperTicket[] }> {
  const tickets = await listShopperTickets(shopper);
  if (selector) {
    const t = tickets.find((x) => x.id === selector || x.ticket_ref === selector) ?? null;
    return { ticket: t, tickets };
  }
  const open = tickets.find((t) => t.status === "open" || t.status === "pending");
  return { ticket: open ?? tickets[0] ?? null, tickets };
}

export function publicTicket(t: ShopperTicket) {
  return {
    id: t.id,
    ticketRef: t.ticket_ref,
    subject: t.subject,
    status: t.status,
    category: t.category,
    lastMessageAt: t.last_message_at,
    createdAt: t.created_at,
    messageCount: t.message_count,
  };
}

/** Internal staff content never reaches a customer read: desk internal
    notes (channel or metadata markers) and presend-held replies. */
export function isCustomerVisibleMessage(m: any): boolean {
  const md = (m?.metadata ?? {}) as Record<string, any>;
  if (m?.channel === "internal") return false;
  if (md.kind === "internal_note" || md.internal_note === true) return false;
  if (md.presend_held === true || md.presend?.state === "held") return false;
  return true;
}

export function mapThreadMessage(m: any) {
  return {
    id: m.id,
    from: m.direction === "inbound" ? "customer" : "salon",
    text: m.body ?? m.body_text ?? "",
    at: m.sent_at ?? m.created_at ?? null,
    channel: m.channel ?? null,
  };
}
