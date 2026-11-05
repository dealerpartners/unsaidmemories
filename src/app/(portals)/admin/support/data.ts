// Support Desk — shared server data for the v2-comp pages.
// Everything reads the live support_* / crm_* tables through the
// service-role client, tenant-scoped. No demo data anywhere: a surface
// with no rows renders its real (empty) state.
import { createServerClient } from "@/lib/supabase";
import { tenantId } from "@/lib/trust/constants";

export const db = () => createServerClient();
export const T = () => tenantId();

export type TicketRow = {
  id: string; ticket_ref: string | null; subject: string; status: string; priority: string;
  source_channel: string | null; requester_name: string | null; requester_email: string | null;
  requester_customer_id: string | null; assigned_staff_id: string | null; assigned_team_id: string | null;
  created_at: string; updated_at: string; last_message_at: string | null;
  first_public_reply_at: string | null; resolved_at: string | null;
  first_response_due_at: string | null; resolution_due_at: string | null;
  first_response_breached_at: string | null; resolution_breached_at: string | null;
  csat_score: number | null; reopened_count: number | null; tags: string[] | null;
  conversation_id: string; category: string | null;
};

export const TICKET_COLS =
  "id, ticket_ref, subject, status, priority, source_channel, requester_name, requester_email, requester_customer_id, assigned_staff_id, assigned_team_id, created_at, updated_at, last_message_at, first_public_reply_at, resolved_at, first_response_due_at, resolution_due_at, first_response_breached_at, resolution_breached_at, csat_score, reopened_count, tags, conversation_id, category";

export async function loadTickets(limit = 500): Promise<TicketRow[]> {
  const { data } = await db().from("support_tickets").select(TICKET_COLS)
    .eq("tenant_id", T()).is("deleted_at", null)
    .order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as TicketRow[];
}

export async function loadStaff(): Promise<Map<string, string>> {
  const { data } = await db().from("portal_users").select("id, display_name, email").eq("tenant_id", T());
  const m = new Map<string, string>();
  for (const u of data ?? []) m.set(u.id, u.display_name || u.email || "Staff");
  return m;
}

export async function loadTeams() {
  const { data } = await db().from("support_teams").select("id, name, code, description, is_active").eq("tenant_id", T()).order("name");
  return data ?? [];
}

export const isOpen = (t: TicketRow) => !["resolved", "closed"].includes(t.status);
export const OPEN_STATUSES = ["open", "pending"];

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function dueLabel(t: TicketRow): { text: string; cls: string } {
  const due = t.resolution_due_at ?? t.first_response_due_at;
  if (!isOpen(t)) return { text: "Done", cls: "green" };
  if (t.resolution_breached_at || t.first_response_breached_at) return { text: "Breached", cls: "red" };
  if (!due) return { text: "No SLA", cls: "" };
  const mins = Math.round((new Date(due).getTime() - Date.now()) / 60000);
  if (mins < 0) return { text: "Breached", cls: "red" };
  if (mins < 60) return { text: `${mins}m left`, cls: "amber" };
  const hrs = Math.floor(mins / 60);
  return { text: `${hrs}h ${mins % 60}m`, cls: "green" };
}

export function priorityPill(p: string): { label: string; cls: string } {
  switch (p) {
    case "urgent": return { label: "Urgent", cls: "red" };
    case "high": return { label: "High", cls: "red" };
    case "low": return { label: "Low", cls: "" };
    default: return { label: "Normal", cls: "blue" };
  }
}

export function statusPill(s: string): { label: string; cls: string } {
  switch (s) {
    case "open": return { label: "Open", cls: "teal" };
    case "pending": return { label: "Pending", cls: "" };
    case "resolved": return { label: "Resolved", cls: "green" };
    case "closed": return { label: "Closed", cls: "" };
    default: return { label: s, cls: "" };
  }
}

export function channelLabel(c: string | null): string {
  switch (c) {
    case "email": return "Email";
    case "chat": return "Chat";
    case "whatsapp": return "WhatsApp";
    case "voice": case "phone": return "Voice";
    case "sms": return "SMS";
    case "social": return "Social";
    case "web_form": return "Web form";
    default: return c ?? "—";
  }
}

export function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function fmtDuration(mins: number | null): string {
  if (mins === null || !isFinite(mins)) return "—";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${Math.round(mins % 60)}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
