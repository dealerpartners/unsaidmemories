// Trust & Safety data layer. The ported schema names its subject tables
// seller_* (from UnSaid Memories's marketplace); in Unsaid there is no seller portal —
// seller_id holds the subject account (customer / partner) the case concerns,
// and listings are storefront products/designs. DMCA tables are used whole.
import { createServerClient } from "@/lib/supabase";
import { tenantId } from "./constants";

export const db = () => createServerClient();
export const T = tenantId;

export async function tsOverview() {
  const sb = db();
  const [violations, investigations, appeals, verify, quarantine, dmca, strikes, chargebacks] = await Promise.all([
    sb.from("seller_violations").select("id", { count: "exact", head: true }).eq("tenant_id", T()).in("status", ["open", "under_review"]),
    sb.from("seller_investigations").select("id", { count: "exact", head: true }).eq("tenant_id", T()).in("status", ["open", "in_progress"]),
    sb.from("seller_appeals").select("id", { count: "exact", head: true }).eq("tenant_id", T()).eq("status", "pending"),
    sb.from("verification_tasks").select("id", { count: "exact", head: true }).eq("tenant_id", T()).eq("status", "pending"),
    sb.from("quarantine").select("id", { count: "exact", head: true }).eq("resolved", false),
    sb.from("dmca_details").select("id", { count: "exact", head: true }).eq("tenant_id", T()).in("workflow_status", ["received", "under_review"]),
    sb.from("dmca_strikes").select("id", { count: "exact", head: true }).eq("tenant_id", T()).eq("status", "active"),
    sb.from("support_tickets").select("id", { count: "exact", head: true }).eq("tenant_id", T()).eq("category", "chargeback").in("status", ["open", "pending"]),
  ]);
  return {
    openViolations: violations.count ?? 0,
    openInvestigations: investigations.count ?? 0,
    pendingAppeals: appeals.count ?? 0,
    pendingVerification: verify.count ?? 0,
    quarantineOpen: quarantine.count ?? 0,
    dmcaOpen: dmca.count ?? 0,
    activeStrikes: strikes.count ?? 0,
    openChargebacks: chargebacks.count ?? 0,
  };
}

export async function listViolations(status?: string) {
  let q = db().from("seller_violations").select("*").eq("tenant_id", T()).order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listInvestigations(status?: string) {
  let q = db().from("seller_investigations").select("*").eq("tenant_id", T()).order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listAppeals(status?: string) {
  let q = db().from("seller_appeals").select("*").eq("tenant_id", T()).order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listVerification(status?: string) {
  let q = db().from("verification_tasks").select("*").eq("tenant_id", T()).order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listQuarantine(resolved?: boolean) {
  let q = db().from("quarantine").select("*").order("created_at", { ascending: false }).limit(200);
  if (resolved !== undefined) q = q.eq("resolved", resolved);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listDmca() {
  const sb = db();
  const [notices, counters, strikes, log] = await Promise.all([
    sb.from("dmca_details").select("*").eq("tenant_id", T()).order("created_at", { ascending: false }).limit(100),
    sb.from("dmca_counter_notices").select("*").eq("tenant_id", T()).order("created_at", { ascending: false }).limit(100),
    sb.from("dmca_strikes").select("*").eq("tenant_id", T()).order("strike_at", { ascending: false }).limit(100),
    sb.from("dmca_takedown_log").select("*").eq("tenant_id", T()).order("created_at", { ascending: false }).limit(100),
  ]);
  return { notices: notices.data ?? [], counters: counters.data ?? [], strikes: strikes.data ?? [], log: log.data ?? [] };
}

/** Customer & listing risk: support contacts with abuse scores + violation subjects. */
export async function riskBoard() {
  const sb = db();
  const { data: contacts } = await sb
    .from("support_contacts")
    .select("*")
    .eq("tenant_id", T())
    .is("deleted_at", null)
    .order("abuse_score", { ascending: false })
    .limit(100);
  return contacts ?? [];
}

/** T&S audit log: permission audit + takedown log + trust-safety ticket events, merged. */
export async function auditTrail() {
  const sb = db();
  const [perm, takedowns, events] = await Promise.all([
    sb.from("portal_permission_audit_log").select("*").eq("tenant_id", T()).order("created_at", { ascending: false }).limit(50),
    sb.from("dmca_takedown_log").select("*").eq("tenant_id", T()).order("created_at", { ascending: false }).limit(50),
    sb.from("support_ticket_events").select("*, support_tickets!inner(category, ticket_ref)").eq("tenant_id", T()).limit(50).order("created_at", { ascending: false }),
  ]);
  const rows: { at: string; source: string; text: string }[] = [];
  (perm.data ?? []).forEach((r: any) => rows.push({ at: r.created_at, source: "Permissions", text: `${r.change_type} — ${r.key}: ${r.old_value ?? "∅"} → ${r.new_value ?? "∅"}` }));
  (takedowns.data ?? []).forEach((r: any) => rows.push({ at: r.created_at, source: "DMCA", text: `${r.action} — ${r.listing_ref ?? "listing"} (${(r.detail as any)?.reason ?? "takedown"})` }));
  (events.data ?? []).filter((e: any) => e.support_tickets?.category === "trust_safety" || e.support_tickets?.category === "dmca").forEach((e: any) =>
    rows.push({ at: e.created_at, source: "Support", text: `${e.support_tickets?.ticket_ref} — ${e.event_type}` })
  );
  return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 100);
}

export async function listPolicies() {
  const sb = db();
  const { data, error } = await sb.from("trust_policies").select("*").eq("tenant_id", T()).order("code");
  if (error) return { policies: [] as any[], migrationPending: true };
  return { policies: data ?? [], migrationPending: false };
}
