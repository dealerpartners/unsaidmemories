// Support Desk data layer — adapted from UnSaid Memories src/lib/support/* (33 files,
// branch 10-28-2026) collapsed into one server module over the same tables
// Unsaid's tenant already carries: support_tickets owns ONE conversation
// (crm_conversations/crm_messages via conversation_id); every mutation writes
// a support_ticket_events row so the ticket history is the audit trail.
import { createServerClient } from "@/lib/supabase";
import { tenantId, APPROVAL_THRESHOLD } from "./constants";

export const db = () => createServerClient();
export const T = tenantId;

export interface TicketFilters {
  status?: string;
  requesterType?: string;
  category?: string;
  priority?: string;
  assignee?: string; // portal_user id | "me" | "unassigned" | ""
  team?: string;
  q?: string;
  sort?: string;
  view?: string; // saved queue id
  limit?: number;
}

const TICKET_COLS =
  "id, ticket_ref, requester_type, requester_name, requester_email, requester_customer_id, subject, status, priority, category, tags, assigned_staff_id, assigned_team_id, conversation_id, last_message_at, created_at, updated_at, first_response_due_at, resolution_due_at, first_response_breached_at, resolution_breached_at, first_public_reply_at, resolved_at, closed_at, sla_policy_id, csat_score, time_spent_seconds, message_count, public_reply_count, reopened_count, on_hold, metadata, order_id, product_id";

export async function listTickets(f: TicketFilters, myStaffId?: string | null) {
  const sb = db();
  let query = sb.from("support_tickets").select(TICKET_COLS, { count: "exact" }).eq("tenant_id", T()).is("deleted_at", null);

  if (f.view) {
    const { data: q } = await sb.from("support_queues").select("filter").eq("id", f.view).single();
    if (q?.filter) {
      const saved = q.filter as TicketFilters;
      f = { ...saved, ...stripEmpty(f), view: f.view };
    }
  }
  if (f.status && f.status !== "any") query = query.eq("status", f.status);
  if (f.status === "any") query = query.in("status", ["open", "pending", "resolved", "closed"]);
  if (!f.status) query = query.in("status", ["open", "pending"]);
  if (f.requesterType) query = query.eq("requester_type", f.requesterType);
  if (f.category) query = query.eq("category", f.category);
  if (f.priority) query = query.eq("priority", f.priority);
  if (f.team) query = query.eq("assigned_team_id", f.team);
  if (f.assignee === "unassigned") query = query.is("assigned_staff_id", null);
  else if (f.assignee === "me" && myStaffId) query = query.eq("assigned_staff_id", myStaffId);
  else if (f.assignee && f.assignee !== "anyone" && f.assignee !== "me") query = query.eq("assigned_staff_id", f.assignee);
  if (f.q) query = query.or(`subject.ilike.%${f.q}%,ticket_ref.ilike.%${f.q}%,requester_email.ilike.%${f.q}%,requester_name.ilike.%${f.q}%`);

  switch (f.sort) {
    case "oldest_activity": query = query.order("last_message_at", { ascending: true, nullsFirst: true }); break;
    case "priority": query = query.order("priority", { ascending: false }).order("created_at", { ascending: true }); break;
    case "sla": query = query.order("resolution_due_at", { ascending: true, nullsFirst: false }); break;
    case "newest": query = query.order("created_at", { ascending: false }); break;
    case "oldest": query = query.order("created_at", { ascending: true }); break;
    default: query = query.order("last_message_at", { ascending: false, nullsFirst: false });
  }
  query = query.limit(f.limit ?? 100);
  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { tickets: data ?? [], count: count ?? 0 };
}

function stripEmpty(f: TicketFilters): TicketFilters {
  const out: TicketFilters = {};
  (Object.keys(f) as (keyof TicketFilters)[]).forEach((k) => {
    if (f[k] !== undefined && f[k] !== "" && k !== "view") (out as Record<string, unknown>)[k] = f[k];
  });
  return out;
}

export async function logEvent(ticketId: string, eventType: string, detail: Record<string, unknown>, actor?: { staffId?: string | null; label?: string | null; type?: string }, visibility = "internal") {
  const sb = db();
  await sb.from("support_ticket_events").insert({
    tenant_id: T(),
    ticket_id: ticketId,
    actor_staff_id: actor?.staffId ?? null,
    actor_label: actor?.label ?? null,
    actor_type: actor?.type ?? "staff",
    event_type: eventType,
    detail,
    payload: detail,
    visibility,
  });
}

export async function getTicketDetail(id: string) {
  const sb = db();
  const { data: ticket, error } = await sb.from("support_tickets").select("*").eq("id", id).eq("tenant_id", T()).single();
  if (error || !ticket) return null;
  const [messages, events, participants, attachments, sides, relations, actions, canned] = await Promise.all([
    sb.from("crm_messages").select("*").eq("conversation_id", ticket.conversation_id).order("created_at", { ascending: true }),
    sb.from("support_ticket_events").select("*").eq("ticket_id", id).order("created_at", { ascending: false }).limit(100),
    sb.from("support_ticket_participants").select("*").eq("ticket_id", id),
    sb.from("support_attachments").select("*").eq("ticket_id", id).order("created_at", { ascending: false }),
    sb.from("support_side_conversations").select("*").eq("ticket_id", id).order("created_at", { ascending: false }),
    sb.from("support_ticket_relations").select("*").eq("ticket_id", id),
    sb.from("support_actions").select("*").eq("ticket_id", id).order("created_at", { ascending: false }),
    sb.from("support_canned_replies").select("id, title, body").eq("is_active", true).order("title"),
  ]);
  // side conversation messages live as events with payload.side_id
  const sideMessages: Record<string, any[]> = {};
  (events.data ?? []).forEach((e: any) => {
    if (e.event_type === "side_message" && e.payload?.side_id) {
      (sideMessages[e.payload.side_id] ||= []).push(e);
    }
  });
  let related: any[] = [];
  const relIds = (relations.data ?? []).map((r: any) => r.related_ticket_id);
  if (relIds.length) {
    const { data } = await sb.from("support_tickets").select("id, ticket_ref, subject, status").in("id", relIds);
    related = data ?? [];
  }
  const [teams, staff, slaPolicies, allTickets] = await Promise.all([
    sb.from("support_teams").select("id, name").eq("is_active", true).order("name"),
    sb.from("portal_users").select("id, display_name, email, role_type").eq("tenant_id", T()).eq("is_active", true).order("display_name"),
    sb.from("support_sla_policies").select("*").eq("id", ticket.sla_policy_id ?? "00000000-0000-0000-0000-000000000000"),
    sb.from("support_tickets").select("id, ticket_ref, subject, status").eq("tenant_id", T()).is("deleted_at", null).neq("id", id).order("created_at", { ascending: false }).limit(100),
  ]);
  return {
    ticket,
    messages: messages.data ?? [],
    events: events.data ?? [],
    participants: participants.data ?? [],
    attachments: attachments.data ?? [],
    sideConversations: (sides.data ?? []).map((s: any) => ({ ...s, messages: (sideMessages[s.id] ?? []).slice().reverse() })),
    relations: (relations.data ?? []).map((r: any) => ({ ...r, related: related.find((t: any) => t.id === r.related_ticket_id) ?? null })),
    actions: actions.data ?? [],
    cannedReplies: canned.data ?? [],
    teams: teams.data ?? [],
    staff: staff.data ?? [],
    slaPolicy: slaPolicies.data?.[0] ?? null,
    linkableTickets: allTickets.data ?? [],
  };
}

export interface SlaState {
  firstResponse: "ok" | "due" | "breached" | "met" | "none";
  resolution: "ok" | "due" | "breached" | "met" | "none";
  warnings: string[];
}
export function evaluateSla(ticket: any): SlaState {
  const now = Date.now();
  const warnings: string[] = [];
  const evalOne = (due: string | null, breachedAt: string | null, metAt: string | null, label: string) => {
    if (breachedAt) { warnings.push(`${label} SLA breached ${new Date(breachedAt).toLocaleString()}`); return "breached" as const; }
    if (metAt) return "met" as const;
    if (!due) return "none" as const;
    const ms = new Date(due).getTime() - now;
    if (ms < 0) { warnings.push(`${label} SLA overdue since ${new Date(due).toLocaleString()}`); return "breached" as const; }
    if (ms < 4 * 3600 * 1000) { warnings.push(`${label} SLA due ${new Date(due).toLocaleString()}`); return "due" as const; }
    return "ok" as const;
  };
  return {
    firstResponse: evalOne(ticket.first_response_due_at, ticket.first_response_breached_at, ticket.first_public_reply_at, "First response"),
    resolution: evalOne(ticket.resolution_due_at, ticket.resolution_breached_at, ticket.resolved_at, "Resolution"),
    warnings,
  };
}

export async function nextTicketRef(): Promise<string> {
  const sb = db();
  const { count } = await sb.from("support_tickets").select("id", { count: "exact", head: true }).eq("tenant_id", T());
  return `SUP-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

export async function stampSlaForNewTicket(ticketId: string, priority: string, category: string) {
  const sb = db();
  const { data: cat } = await sb.from("support_categories").select("default_sla_policy_id").eq("code", category).limit(1);
  let policyId = cat?.[0]?.default_sla_policy_id as string | null;
  if (!policyId) {
    const { data: def } = await sb.from("support_sla_policies").select("id").eq("is_default", true).eq("is_active", true).limit(1);
    policyId = def?.[0]?.id ?? null;
  }
  if (!policyId) return;
  const { data: policy } = await sb.from("support_sla_policies").select("*").eq("id", policyId).single();
  if (!policy) return;
  const now = Date.now();
  const mult = priority === "urgent" ? 0.25 : priority === "high" ? 0.5 : 1;
  const patch: Record<string, unknown> = { sla_policy_id: policyId };
  if (policy.first_response_minutes) patch.first_response_due_at = new Date(now + policy.first_response_minutes * mult * 60000).toISOString();
  if (policy.next_reply_minutes) patch.next_reply_due_at = new Date(now + policy.next_reply_minutes * mult * 60000).toISOString();
  if (policy.resolution_minutes) patch.resolution_due_at = new Date(now + policy.resolution_minutes * mult * 60000).toISOString();
  await sb.from("support_tickets").update(patch).eq("id", ticketId);
}

/** 30-day reporting rollups computed from live ticket + event data. */
export async function reportingRollups() {
  const sb = db();
  const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  const { data: tickets } = await sb
    .from("support_tickets")
    .select("id, status, priority, category, requester_type, created_at, first_public_reply_at, resolved_at, csat_score, first_response_breached_at, resolution_breached_at, assigned_staff_id")
    .eq("tenant_id", T()).is("deleted_at", null).gte("created_at", since).limit(5000);
  const rows = tickets ?? [];
  const by = (key: string) => {
    const m = new Map<string, number>();
    rows.forEach((r: any) => m.set(String(r[key] ?? "—"), (m.get(String(r[key] ?? "—")) ?? 0) + 1));
    return [...m.entries()].map(([k, v]) => ({ key: k, count: v })).sort((a, b) => b.count - a.count);
  };
  const fr = rows.filter((r: any) => r.first_public_reply_at && r.created_at);
  const avgFirstResponseH = fr.length
    ? fr.reduce((s: number, r: any) => s + (new Date(r.first_public_reply_at).getTime() - new Date(r.created_at).getTime()) / 3600000, 0) / fr.length
    : null;
  const res = rows.filter((r: any) => r.resolved_at && r.created_at);
  const avgResolutionH = res.length
    ? res.reduce((s: number, r: any) => s + (new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime()) / 3600000, 0) / res.length
    : null;
  const slaTotal = rows.filter((r: any) => r.first_public_reply_at || r.first_response_breached_at).length;
  const slaBreached = rows.filter((r: any) => r.first_response_breached_at || r.resolution_breached_at).length;
  const csat = rows.filter((r: any) => r.csat_score != null);
  return {
    windowDays: 30,
    volume: rows.length,
    byStatus: by("status"),
    byDepartment: by("category"),
    byPriority: by("priority"),
    byRequesterType: by("requester_type"),
    avgFirstResponseHours: avgFirstResponseH != null ? Math.round(avgFirstResponseH * 10) / 10 : null,
    avgResolutionHours: avgResolutionH != null ? Math.round(avgResolutionH * 10) / 10 : null,
    slaAttainmentPct: slaTotal ? Math.round(((slaTotal - slaBreached) / slaTotal) * 1000) / 10 : null,
    csatAvg: csat.length ? Math.round((csat.reduce((s: number, r: any) => s + r.csat_score, 0) / csat.length) * 10) / 10 : null,
    csatResponses: csat.length,
  };
}

/** Queue health for the operations view. */
export async function queueHealth() {
  const sb = db();
  const { data: open } = await sb
    .from("support_tickets")
    .select("id, priority, assigned_staff_id, created_at, first_response_breached_at, resolution_breached_at, status")
    .eq("tenant_id", T()).is("deleted_at", null).in("status", ["open", "pending"]).limit(5000);
  const rows = open ?? [];
  const { data: failedEvents } = await sb
    .from("support_ticket_events")
    .select("id, event_type, created_at")
    .eq("tenant_id", T()).in("event_type", ["delivery_failed", "automation_failed", "webhook_failed"])
    .order("created_at", { ascending: false }).limit(20);
  const oldest = rows.slice().sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
  return {
    openTotal: rows.length,
    unassigned: rows.filter((r: any) => !r.assigned_staff_id).length,
    urgent: rows.filter((r: any) => r.priority === "urgent").length,
    breached: rows.filter((r: any) => r.first_response_breached_at || r.resolution_breached_at).length,
    oldestOpenAt: oldest?.created_at ?? null,
    failedJobs: failedEvents ?? [],
  };
}

/** Notifications "addressed to you": assignments, SLA warnings, escalations on your tickets + mentions. */
export async function notificationsFor(staffId: string | null) {
  const sb = db();
  if (!staffId) return { items: [] as any[] };
  const { data: mine } = await sb.from("support_tickets").select("id, ticket_ref, subject, status, priority, resolution_due_at, first_response_due_at").eq("tenant_id", T()).eq("assigned_staff_id", staffId).in("status", ["open", "pending"]);
  const items: any[] = [];
  (mine ?? []).forEach((t: any) => {
    const sla = evaluateSla(t);
    sla.warnings.forEach((w) => items.push({ kind: "sla", ticketRef: t.ticket_ref, ticketId: t.id, text: `${t.ticket_ref} — ${w}`, at: t.resolution_due_at || t.first_response_due_at }));
  });
  const { data: events } = await sb
    .from("support_ticket_events")
    .select("id, ticket_id, event_type, detail, created_at")
    .eq("tenant_id", T()).in("event_type", ["assigned", "escalated", "mention", "action_requested", "action_approved", "action_rejected"])
    .order("created_at", { ascending: false }).limit(50);
  const myIds = new Set((mine ?? []).map((t: any) => t.id));
  (events ?? []).forEach((e: any) => {
    if (myIds.has(e.ticket_id) || (e.detail as any)?.staff_id === staffId) {
      items.push({ kind: e.event_type, ticketId: e.ticket_id, text: `${e.event_type.replace(/_/g, " ")} — ${((e.detail as any)?.summary as string) || ""}`, at: e.created_at });
    }
  });
  return { items: items.sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime()).slice(0, 50) };
}

export function actionNeedsApproval(actionType: string, amount: number | null): boolean {
  return (actionType === "refund" || actionType === "store_credit") && (amount ?? 0) >= APPROVAL_THRESHOLD;
}
