#!/usr/bin/env node
/**
 * Seed Trust & Safety + Support Desk for Unsaid.
 * Creds are extracted from UNSAID_CREDS.md at runtime and NEVER printed.
 * Idempotent: re-runs skip sections whose seed markers already exist.
 * Usage: node scripts/seed-trust-support.mjs
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const TENANT = "652fd2be-d19a-4778-835d-db38094d7718";
const STAFF_PASSWORD = "Unsaid!Desk2026"; // reported to Muse in the build handoff only; never committed anywhere else

const raw = readFileSync(join(homedir(), "workspace/user/files/UNSAID_CREDS.md"), "utf8").replace(/\\_/g, "_");
const section = (raw.match(/#\s*Supabase([\s\S]*?)(?:\n\*\*#|\n#\s|$)/i) || [])[1] || raw;
const jwts = [...section.matchAll(/eyJ[\w\-.]+\.[A-Za-z0-9_\-]+/g)].map((m) => m[0]);
function jwtRole(tok) {
  try {
    const p = tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(p + "=".repeat((4 - (p.length % 4)) % 4), "base64").toString()).role;
  } catch { return null; }
}
const serviceKey = jwts.find((t) => jwtRole(t) === "service_role") || jwts.sort((a, b) => b.length - a.length)[0];
if (!serviceKey) { console.error("FATAL: service key not found"); process.exit(1); }
let ref = (section.match(/https:\/\/([a-z0-9]{20,})\.supabase\.co/) || [])[1];
if (!ref) {
  const p = serviceKey.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  ref = JSON.parse(Buffer.from(p + "=".repeat((4 - (p.length % 4)) % 4), "base64").toString()).ref;
}
const BASE = `https://${ref}.supabase.co`;
const H = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

async function rest(method, path, body, prefer = "return=representation") {
  const r = await fetch(`${BASE}/rest/v1/${path}`, {
    method, headers: { ...H, Prefer: prefer }, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const get = (path) => rest("GET", path);
const insert = async (table, rows) => {
  const out = await rest("POST", table, rows);
  return Array.isArray(out) ? out : [out];
};

async function ensureAuthUser(email, name) {
  const list = await fetch(`${BASE}/auth/v1/admin/users?per_page=200`, { headers: H }).then((r) => r.json());
  const found = (list.users || []).find((u) => u.email === email);
  if (found) return found.id;
  const r = await fetch(`${BASE}/auth/v1/admin/users`, {
    method: "POST", headers: H,
    body: JSON.stringify({ email, password: STAFF_PASSWORD, email_confirm: true, user_metadata: { name } }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`createUser ${email}: ${JSON.stringify(j).slice(0, 200)}`);
  return j.id;
}

const now = Date.now();
const daysAgo = (d, h = 0) => new Date(now - d * 86400000 - h * 3600000).toISOString();
const inHours = (h) => new Date(now + h * 3600000).toISOString();

async function main() {
  // ---- existing tenant data to hang cases on -------------------------------
  const customers = await get(`crm_customers?tenant_id=eq.${TENANT}&select=id,email,first_name,last_name&limit=8`);
  const products = await get(`products?tenant_id=eq.${TENANT}&select=id,name,slug&limit=4`);
  const orders = await get(`orders?tenant_id=eq.${TENANT}&select=id,total,status&limit=2`);
  const erpOrders = await get(`erp_orders?tenant_id=eq.${TENANT}&select=id,order_number,total,status&limit=2`);
  const cust = (i) => customers[i % Math.max(1, customers.length)] || {};
  console.log(`context: ${customers.length} customers, ${products.length} products, ${orders.length} orders`);

  // ---- staff users ---------------------------------------------------------
  const staffDefs = [
    { email: "maya.chen@unsaid.support", name: "Maya Chen", role: "support_lead" },
    { email: "jordan.blake@unsaid.support", name: "Jordan Blake", role: "support_agent" },
    { email: "priya.nair@unsaid.support", name: "Priya Nair", role: "trust_safety" },
  ];
  const staff = {};
  for (const s of staffDefs) {
    const authId = await ensureAuthUser(s.email, s.name);
    const existing = await get(`portal_users?tenant_id=eq.${TENANT}&user_id=eq.${authId}&select=id`);
    if (existing.length) { staff[s.role] = { portalId: existing[0].id, ...s }; continue; }
    const [row] = await insert("portal_users", [{
      tenant_id: TENANT, user_id: authId, role_type: s.role, portal: "admin",
      display_name: s.name, email: s.email, is_owner: s.role === "support_lead", is_active: true,
      accepted_at: daysAgo(20), created_at: daysAgo(20), updated_at: daysAgo(0),
    }]);
    staff[s.role] = { portalId: row.id, ...s };
  }
  console.log("staff ready:", Object.values(staff).map((s) => s.email).join(", "));
  const maya = staff.support_lead.portalId, jordan = staff.support_agent.portalId, priya = staff.trust_safety.portalId;

  // ---- desk configuration ---------------------------------------------------
  const existingTeams = await get(`support_teams?tenant_id=eq.${TENANT}&select=id,code`);
  let teams = {};
  if (!existingTeams.length) {
    const rows = await insert("support_teams", [
      { tenant_id: TENANT, scope: "tenant", locked_by_master: false, code: "general-support", name: "General Support", description: "Front-line customer desk", is_active: true, row_version: 1 },
      { tenant_id: TENANT, scope: "tenant", locked_by_master: false, code: "billing-payments", name: "Billing & Payments", description: "Invoices, payments, chargebacks", is_active: true, row_version: 1 },
      { tenant_id: TENANT, scope: "tenant", locked_by_master: false, code: "trust-safety", name: "Trust & Safety", description: "Verification, fraud, policy, DMCA", is_active: true, row_version: 1 },
    ]);
    rows.forEach((r) => (teams[r.code] = r.id));
    await insert("support_team_members", [
      { tenant_id: TENANT, team_id: teams["general-support"], staff_id: maya, role: "lead", max_concurrent: 20, is_available: true, row_version: 1 },
      { tenant_id: TENANT, team_id: teams["general-support"], staff_id: jordan, role: "agent", max_concurrent: 12, is_available: true, row_version: 1 },
      { tenant_id: TENANT, team_id: teams["billing-payments"], staff_id: jordan, role: "agent", max_concurrent: 12, is_available: true, row_version: 1 },
      { tenant_id: TENANT, team_id: teams["trust-safety"], staff_id: priya, role: "lead", max_concurrent: 10, is_available: true, row_version: 1 },
    ]);
  } else existingTeams.forEach((r) => (teams[r.code] = r.id));

  const existingSla = await get(`support_sla_policies?tenant_id=eq.${TENANT}&select=id,name`);
  let slaDefault = existingSla.find((p) => p.name === "Standard")?.id;
  if (!existingSla.length) {
    const rows = await insert("support_sla_policies", [
      { tenant_id: TENANT, scope: "tenant", locked_by_master: false, name: "Standard", first_response_minutes: 480, next_reply_minutes: 1440, resolution_minutes: 4320, uses_business_hours: false, is_default: true, is_active: true, row_version: 1 },
      { tenant_id: TENANT, scope: "tenant", locked_by_master: false, name: "Urgent Care", first_response_minutes: 60, next_reply_minutes: 240, resolution_minutes: 720, uses_business_hours: false, is_default: false, is_active: true, row_version: 1 },
    ]);
    slaDefault = rows[0].id;
    await insert("support_escalation_rules", [
      { tenant_id: TENANT, scope: "tenant", locked_by_master: false, name: "SLA breach escalates to lead", trigger_type: "sla_breach", condition: { any: true }, action: "escalate", action_config: { to_role: "support_lead" }, is_active: true, row_version: 1 },
      { tenant_id: TENANT, scope: "tenant", locked_by_master: false, name: "Urgent with no reply in 1h → Trust & Safety", trigger_type: "no_reply", condition: { priority: "urgent", minutes: 60 }, action: "assign_team", action_config: { team_code: "trust-safety" }, is_active: true, row_version: 1 },
    ]);
  }
  const existingChannels = await get(`support_channels?tenant_id=eq.${TENANT}&select=id`);
  if (!existingChannels.length) {
    await insert("support_channels", [
      { tenant_id: TENANT, scope: "tenant", locked_by_master: false, code: "web_form", name: "Web form", is_active: true, sending_domain: null, allow_list: {}, block_list: {}, spam_quarantine: true, reopen_window_days: 14, max_attachment_bytes: 10485760, max_ticket_attachment_bytes: 52428800, blocked_extensions: ["exe", "msi", "bat", "cmd", "sh", "ps1", "scr", "jar"], config: {}, row_version: 1 },
      { tenant_id: TENANT, scope: "tenant", locked_by_master: false, code: "email", name: "Email", is_active: true, sending_domain: "unsaidmemories.com", allow_list: {}, block_list: {}, spam_quarantine: true, reopen_window_days: 14, max_attachment_bytes: 10485760, max_ticket_attachment_bytes: 52428800, blocked_extensions: ["exe", "msi", "bat", "cmd", "sh", "ps1", "scr", "jar"], config: {}, row_version: 1 },
    ]);
  }
  const existingMacros = await get(`support_macros?tenant_id=eq.${TENANT}&select=id`);
  if (!existingMacros.length) {
    await insert("support_macros", [
      { tenant_id: TENANT, scope: "tenant", locked_by_master: false, name: "Refund approved — notify + pend", description: "Sets pending and tells the customer the refund timeline", actions: [{ set_status: "pending" }, { add_tag: "refund-approved" }], is_active: true, row_version: 1 },
      { tenant_id: TENANT, scope: "tenant", locked_by_master: false, name: "Ask for order details", description: "Requests order number and purchase email", actions: [{ add_tag: "needs-order-info" }], is_active: true, row_version: 1 },
    ]);
    await insert("support_canned_replies", [
      { tenant_id: TENANT, scope: "tenant", locked_by_master: false, title: "Refund timeline", body: "Your refund has been approved and is on its way back to your original payment method. Banks typically post it within 5–10 business days.", category_code: "billing", locale: "en", is_active: true, row_version: 1 },
      { tenant_id: TENANT, scope: "tenant", locked_by_master: false, title: "Print quality — photo request", body: "I'm sorry the print didn't come out right. Could you reply with a photo of the item in natural light? We'll review it the same day and make it right.", category_code: "general", locale: "en", is_active: true, row_version: 1 },
      { tenant_id: TENANT, scope: "tenant", locked_by_master: false, title: "Shipping delay — carrier check", body: "Thanks for your patience — I've opened a trace with the carrier on your parcel and will update this thread as soon as they respond.", category_code: "general", locale: "en", is_active: true, row_version: 1 },
    ]);
  }

  const CATNAMES = { general: "General", billing: "Billing", technical: "Technical", seller_support: "Partner Support", payments: "Payments", dmca: "Legal / DMCA", chargeback: "Chargebacks", privacy_request: "Privacy", trust_safety: "Trust & Safety", legal: "Legal", feedback: "Feedback", contact: "Contact" };
  const existingCats = await get(`support_categories?select=id,code&limit=50`);
  if (!existingCats.length) {
    await insert("support_categories", Object.entries(CATNAMES).map(([code, name], i) => ({
      code, scope: "tenant", tenant_id: TENANT, locked_by_master: false, name,
      default_team_id: code === "billing" || code === "payments" || code === "chargeback" ? teams["billing-payments"] : code === "trust_safety" || code === "dmca" || code === "legal" ? teams["trust-safety"] : teams["general-support"],
      default_sla_policy_id: slaDefault, regulated: ["dmca", "legal", "privacy_request"].includes(code),
      is_active: true, sort_order: i + 1, row_version: 1,
    })));
  }

  const existingQueues = await get(`support_queues?tenant_id=eq.${TENANT}&select=id,name`);
  if (!existingQueues.length) {
    await insert("support_queues", [
      { tenant_id: TENANT, scope: "tenant", locked_by_master: false, name: "Urgent first", owner_type: "staff", owner_staff_id: maya, filter: { priority: "urgent", sort: "priority" }, is_shared: true, sort_order: 1, row_version: 1 },
      { tenant_id: TENANT, scope: "tenant", locked_by_master: false, name: "Chargebacks", owner_type: "staff", owner_staff_id: maya, filter: { category: "chargeback" }, is_shared: true, sort_order: 2, row_version: 1 },
      { tenant_id: TENANT, scope: "tenant", locked_by_master: false, name: "Awaiting requester", owner_type: "staff", owner_staff_id: maya, filter: { status: "pending" }, is_shared: true, sort_order: 3, row_version: 1 },
    ]);
  }

  // ---- contacts / organizations ---------------------------------------------
  const existingContacts = await get(`support_contacts?tenant_id=eq.${TENANT}&select=id`);
  if (!existingContacts.length && customers.length) {
    await insert("support_contacts", customers.slice(0, 4).map((c, i) => ({
      tenant_id: TENANT, display_name: `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email,
      email_normalized: (c.email || "").toLowerCase(), locale: "en", timezone: "America/Chicago",
      is_blocked: i === 3, abuse_score: [0, 15, 62, 88][i], is_vip: i === 0,
      customer_id: c.id, metadata: {}, row_version: 1,
    })));
    await insert("support_organizations", [{ tenant_id: TENANT, org_type: "wholesale_partner", name: "Memphis Gift Co.", email: "orders@memphisgift.example", metadata: {}, row_version: 1 }]);
  }

  // ---- tickets ---------------------------------------------------------------
  const existingSeed = await get(`support_tickets?tenant_id=eq.${TENANT}&ticket_ref=like.SUP-2*&select=id,ticket_ref`);
  const existingRefs = new Map(existingSeed.map((r) => [r.ticket_ref, r.id]));
  let dmcaTicketId = existingRefs.get("SUP-2007") || existingRefs.get("SUP-2010") || null;
  let chargebackTicketId = existingRefs.get("SUP-2002") || null;
  if (existingRefs.size < 14) {
    const defs = [
      { ref: "SUP-2001", type: "customer", name: "Elena Ruiz", email: "elena.ruiz@example.com", cat: "general", prio: "normal", status: "open", subj: "Mug arrived with a chip on the rim", body: "The mug I ordered for my sister arrived chipped. Can I get a replacement?", days: 0, assignee: jordan, team: "general-support" },
      { ref: "SUP-2002", type: "customer", name: "Marcus Bell", email: "marcus.bell@example.com", cat: "chargeback", prio: "urgent", status: "open", subj: "Chargeback filed — order never arrived", body: "My bank opened a chargeback because the framed print never showed up. Tracking stopped two weeks ago.", days: 1, assignee: maya, team: "billing-payments", order: true },
      { ref: "SUP-2003", type: "customer", name: "Ana Sousa", email: "ana.sousa@example.com", cat: "billing", prio: "normal", status: "pending", subj: "Refund for the duplicate charge", body: "I was charged twice for the same canvas order. Please refund the duplicate.", days: 2, assignee: jordan, team: "billing-payments", reply: true },
      { ref: "SUP-2004", type: "employee", name: "Jordan Blake", email: "jordan.blake@unsaid.support", cat: "technical", prio: "high", status: "open", subj: "Studio export fails on large canvas designs", body: "Exports above 4500px fail silently in the studio. Filing for engineering visibility.", days: 0, assignee: maya, team: "general-support" },
      { ref: "SUP-2005", type: "customer", name: "Tom Okafor", email: "tom.okafor@example.com", cat: "payments", prio: "high", status: "open", subj: "Card declined three times at checkout", body: "Checkout declines my card but my bank says no attempt reached them.", days: 3, assignee: jordan, team: "billing-payments", breach: true },
      { ref: "SUP-2006", type: "partner", name: "Memphis Gift Co.", email: "orders@memphisgift.example", cat: "seller_support", prio: "normal", status: "pending", subj: "Wholesale pricing tier not applying", body: "Our wholesale discount stopped applying on bulk tote orders.", days: 4, assignee: maya, team: "general-support", reply: true },
      { ref: "SUP-2007", type: "customer", name: "Grace Lin", email: "grace.lin@example.com", cat: "dmca", prio: "high", status: "open", subj: "My artwork is being sold without permission", body: "A listing on your store uses my illustration. I am the rights holder and never licensed it.", days: 1, assignee: priya, team: "trust-safety" },
      { ref: "SUP-2008", type: "customer", name: "Sam Whitfield", email: "sam.whitfield@example.com", cat: "general", prio: "low", status: "resolved", subj: "How do I add a second design to a collection?", body: "Trying to publish two designs as one collection.", days: 6, assignee: jordan, team: "general-support", reply: true, csat: 5 },
      { ref: "SUP-2009", type: "franchise", name: "Leashed Grooming — Journey", email: "journey@partner.example", cat: "general", prio: "normal", status: "open", subj: "Partner portal payout question", body: "Our partner payout for last month looks short by one order.", days: 2, assignee: maya, team: "general-support" },
      { ref: "SUP-2010", type: "external", name: "R. Callahan (rights agent)", email: "agent@callahanrights.example", cat: "legal", prio: "normal", status: "pending", subj: "Formal DMCA notice — three listings", body: "Acting for the rights owner, we submit a formal takedown notice for three listings using protected photography.", days: 5, assignee: priya, team: "trust-safety", reply: true },
      { ref: "SUP-2011", type: "customer", name: "Nina Petrova", email: "nina.petrova@example.com", cat: "trust_safety", prio: "urgent", status: "open", subj: "Someone is impersonating my shop name", body: "A new account is using my shop name and my product photos to sell knockoffs.", days: 0, assignee: priya, team: "trust-safety" },
      { ref: "SUP-2012", type: "customer", name: "Omar Haddad", email: "omar.haddad@example.com", cat: "billing", prio: "normal", status: "closed", subj: "Invoice copy for my records", body: "Please send the invoice PDF for my last order.", days: 9, assignee: jordan, team: "billing-payments", reply: true, csat: 4 },
      { ref: "SUP-2013", type: "employee", name: "Maya Chen", email: "maya.chen@unsaid.support", cat: "feedback", prio: "low", status: "resolved", subj: "Customers keep missing the collection publish button", body: "Three tickets this week were really the same UX confusion. Logging as feedback.", days: 7, assignee: maya, team: "general-support" },
      { ref: "SUP-2014", type: "customer", name: "Bea Fontaine", email: "bea.fontaine@example.com", cat: "payments", prio: "normal", status: "resolved", subj: "Gift card balance missing after checkout", body: "My gift card showed $25 before checkout and $0 after, but the order total didn't change.", days: 8, assignee: jordan, team: "billing-payments", reply: true, csat: 5 },
    ];
    const teamIds = teams;
    for (const d of defs) {
      if (existingRefs.has(d.ref)) continue;
      const created = daysAgo(d.days, 3);
      const [conv] = await insert("crm_conversations", [{
        tenant_id: TENANT, customer_id: null, channel: "web_form", status: d.status === "closed" ? "resolved" : "open",
        subject: d.subj, started_at: created, last_message_at: daysAgo(Math.max(0, d.days - 1)), created_at: created, updated_at: daysAgo(0),
      }]);
      const [ticket] = await insert("support_tickets", [{
        tenant_id: TENANT, ticket_ref: d.ref, requester_type: d.type, requester_name: d.name, requester_email: d.email,
        requester_customer_id: null, subject: d.subj, status: d.status, priority: d.prio, category: d.cat,
        assigned_staff_id: d.assignee, assigned_team_id: teamIds[d.team], conversation_id: conv.id,
        source_channel: "web_form", tags: d.cat === "chargeback" ? ["chargeback"] : [],
        visibility_level: "standard", on_hold: false, spam_flag: false, reopened_count: 0,
        time_spent_seconds: d.reply ? 900 : 300, message_count: d.reply ? 2 : 1, public_reply_count: d.reply ? 1 : 0,
        metadata: { seeded: true }, created_at: created, updated_at: daysAgo(0), last_message_at: daysAgo(Math.max(0, d.days - 1)),
        first_response_due_at: inHours(24), resolution_due_at: inHours(72),
        first_public_reply_at: d.reply ? daysAgo(Math.max(0, d.days - 1)) : null,
        resolved_at: d.status === "resolved" || d.status === "closed" ? daysAgo(Math.max(0, d.days - 1)) : null,
        closed_at: d.status === "closed" ? daysAgo(0) : null,
        sla_policy_id: slaDefault, csat_score: d.csat ?? null,
        first_response_breached_at: d.breach ? daysAgo(1) : null,
        order_id: d.order && erpOrders[0] ? erpOrders[0].id : null,
      }]);
      if (d.ref === "SUP-2007" || d.ref === "SUP-2010") dmcaTicketId = ticket.id;
      if (d.ref === "SUP-2002") chargebackTicketId = ticket.id;
      await insert("crm_messages", [{
        tenant_id: TENANT, conversation_id: conv.id, customer_id: null, channel: "web_form", direction: "inbound",
        status: "received", from_address: d.email, subject: d.subj, body: d.body, body_text: d.body,
        metadata: {}, email_references: [], cc_addresses: [], bcc_addresses: [],
        quoted_content_stripped: false, is_auto_reply: false, is_system_generated: false, created_at: created,
      }]);
      if (d.reply) {
        await insert("crm_messages", [{
          tenant_id: TENANT, conversation_id: conv.id, customer_id: null, channel: "email", direction: "outbound",
          status: "sent", from_address: "support@unsaidmemories.com", to_address: d.email, subject: `Re: ${d.subj}`,
          body: "Thanks for reaching out — we're on it and will update this thread as soon as there's news.", body_text: "Thanks for reaching out — we're on it and will update this thread as soon as there's news.",
          metadata: {}, email_references: [], cc_addresses: [], bcc_addresses: [],
          quoted_content_stripped: false, is_auto_reply: false, is_system_generated: false,
          authored_by_staff_id: d.assignee, sent_at: daysAgo(Math.max(0, d.days - 1)), created_at: daysAgo(Math.max(0, d.days - 1)),
        }]);
      }
      await insert("support_ticket_events", [
        { tenant_id: TENANT, ticket_id: ticket.id, actor_staff_id: null, actor_label: d.name, actor_type: "requester", event_type: "created", detail: { summary: `Ticket ${d.ref} created via web form` }, payload: {}, visibility: "public", created_at: created },
        { tenant_id: TENANT, ticket_id: ticket.id, actor_staff_id: maya, actor_label: "Maya Chen", actor_type: "staff", event_type: "assigned", detail: { summary: `Assigned at intake by routing` }, payload: {}, visibility: "internal", created_at: created },
      ]);
      if (d.ref === "SUP-2003") {
        await insert("support_ticket_participants", [{ tenant_id: TENANT, ticket_id: ticket.id, participant_kind: "cc", email: "billing-copy@example.com", row_version: 1 }]);
      }
      if (d.ref === "SUP-2001") {
        const [side] = await insert("support_side_conversations", [{ tenant_id: TENANT, ticket_id: ticket.id, subject: "Ask warehouse about replacement stock", status: "open", created_by_staff_id: jordan, row_version: 1 }]);
        await insert("support_ticket_events", [{ tenant_id: TENANT, ticket_id: ticket.id, actor_staff_id: jordan, actor_label: "Jordan Blake", actor_type: "staff", event_type: "side_message", detail: { summary: "Side conversation message" }, payload: { side_id: side.id, body: "Warehouse confirms replacement mugs are in stock — ship today." }, visibility: "internal", created_at: daysAgo(0, 2) }]);
        await insert("support_attachments", [{ tenant_id: TENANT, ticket_id: ticket.id, storage_key: `support/${ticket.id}/chip-photo.jpg`, filename: "chip-photo.jpg", mime_declared: "image/jpeg", size_bytes: 842112, visibility: "public", scan_status: "clean", uploaded_by_staff_id: null, row_version: 1 }]);
      }
      if (d.ref === "SUP-2002") {
        await insert("support_actions", [
          { tenant_id: TENANT, ticket_id: ticket.id, action_type: "refund", target_ref: orders[0] ? String(orders[0].id) : "order", amount: 240.0, status: "pending_approval", requested_by: maya, row_version: 1 },
        ]);
      }
      if (d.ref === "SUP-2003") {
        await insert("support_actions", [
          { tenant_id: TENANT, ticket_id: ticket.id, action_type: "refund", target_ref: "duplicate-charge", amount: 42.5, status: "executed", requested_by: jordan, executed_at: daysAgo(1), row_version: 1 },
        ]);
      }
      if (d.ref === "SUP-2014") {
        await insert("support_actions", [
          { tenant_id: TENANT, ticket_id: ticket.id, action_type: "store_credit", target_ref: "gift-card-restore", amount: 25.0, status: "executed", requested_by: jordan, executed_at: daysAgo(7), row_version: 1 },
        ]);
      }
    }
    const t1 = await get(`support_tickets?tenant_id=eq.${TENANT}&ticket_ref=eq.SUP-2011&select=id`);
    const t2 = await get(`support_tickets?tenant_id=eq.${TENANT}&ticket_ref=eq.SUP-2007&select=id`);
    if (t1.length && t2.length) {
      await insert("support_ticket_relations", [{ tenant_id: TENANT, ticket_id: t1[0].id, related_ticket_id: t2[0].id, relation_type: "related", row_version: 1 }]);
    }
    console.log("tickets seeded: 14");
  }

  // ---- trust & safety ---------------------------------------------------------
  const existingViol = await get(`seller_violations?tenant_id=eq.${TENANT}&select=id,violation_type`);
  let violIds = {};
  if (!existingViol.length) {
    const subjA = customers[0]?.id || null, subjB = customers[1]?.id || null;
    const rows = await insert("seller_violations", [
      { tenant_id: TENANT, seller_id: subjA, violation_type: "counterfeit_design", severity: "high", status: "open", description: "Listing reproduces a protected brand logo on a framed print.", listing_id: products[0]?.id || null, evidence: { subject_ref: subjA, listing_ref: products[0]?.slug || "framed-print", source: "brand_monitor" } },
      { tenant_id: TENANT, seller_id: subjB, violation_type: "trademark_misuse", severity: "medium", status: "under_review", description: "Trademarked term used in product title keywords.", listing_id: products[1]?.id || null, evidence: { subject_ref: subjB, listing_ref: products[1]?.slug || "canvas" } },
      { tenant_id: TENANT, seller_id: subjA, violation_type: "prohibited_content", severity: "critical", status: "action_taken", description: "Design contained prohibited imagery; listing removed.", listing_id: null, evidence: { subject_ref: subjA, source: "moderation" } },
      { tenant_id: TENANT, seller_id: subjB, violation_type: "spam_listing", severity: "low", status: "dismissed", description: "Duplicate listings flagged automatically; confirmed as legitimate variants on review.", listing_id: null, evidence: { subject_ref: subjB, source: "automation" } },
      { tenant_id: TENANT, seller_id: subjA, violation_type: "copyright_image", severity: "medium", status: "open", description: "Product photo matches a photographer's registered work (see DMCA case).", listing_id: products[2]?.id || null, evidence: { subject_ref: subjA, listing_ref: products[2]?.slug || "poster", source: "dmca" } },
    ]);
    rows.forEach((r) => (violIds[r.violation_type] = r.id));
    await insert("seller_investigations", [
      { tenant_id: TENANT, seller_id: subjA, violation_id: violIds["counterfeit_design"], investigator_id: priya, status: "in_progress", priority: "high", investigation_type: "chargeback_pattern", notes: "Three chargebacks in 14 days share a device fingerprint with this account.", findings: null, order_id: orders[0] ? String(orders[0].id) : null },
      { tenant_id: TENANT, seller_id: subjB, violation_id: null, investigator_id: priya, status: "open", priority: "urgent", investigation_type: "account_takeover", notes: "Password reset followed by payout-detail change within one hour.", findings: null, order_id: null },
      { tenant_id: TENANT, seller_id: subjB, violation_id: violIds["spam_listing"], investigator_id: priya, status: "closed", priority: "normal", investigation_type: "refund_abuse", notes: "Reviewed refund history across 6 months.", findings: "No abuse found — refunds track genuine print defects. Closed with no action.", order_id: null },
    ]);
    await insert("seller_appeals", [
      { tenant_id: TENANT, violation_id: violIds["trademark_misuse"], seller_id: subjB, status: "pending", appeal_text: "The term is descriptive of the product, not a brand claim. Title updated to remove it regardless.", appeal_type: "violation_appeal", evidence_urls: [] },
      { tenant_id: TENANT, violation_id: violIds["spam_listing"], seller_id: subjB, status: "granted", appeal_text: "These are size variants of one design, not duplicate listings.", appeal_type: "violation_appeal", evidence_urls: [], decision: "granted", decided_by: priya, decided_at: daysAgo(2) },
    ]);
    await insert("verification_tasks", [
      { tenant_id: TENANT, seller_id: subjA, task_type: "identity_check", status: "pending", evidence_url: "https://storage.unsaid.example/verify/id-front.jpg", notes: "Government ID uploaded; awaiting review.", reviewed_by: null, reviewed_at: null },
      { tenant_id: TENANT, seller_id: subjB, task_type: "business_registration", status: "pending", evidence_url: "https://storage.unsaid.example/verify/business-cert.pdf", notes: "LLC certificate uploaded.", reviewed_by: null, reviewed_at: null },
      { tenant_id: TENANT, seller_id: subjA, task_type: "payout_account", status: "in_review", evidence_url: null, notes: "Bank account micro-deposit verification in progress.", reviewed_by: null, reviewed_at: null },
      { tenant_id: TENANT, seller_id: subjB, task_type: "design_rights_attestation", status: "approved", evidence_url: null, notes: "Attestation signed.", reviewed_by: priya, reviewed_at: daysAgo(3) },
    ]);
    console.log("violations/investigations/appeals/verification seeded");
  }

  // Top-ups: sections whose guard was satisfied by pre-existing rows but are
  // still too thin to demo (appeals were empty; investigations had one row).
  const existingAppeals = await get(`seller_appeals?tenant_id=eq.${TENANT}&select=id`);
  if (!existingAppeals.length) {
    const vios = await get(`seller_violations?tenant_id=eq.${TENANT}&select=id,seller_id&limit=2`);
    if (vios.length) {
      await insert("seller_appeals", [
        { tenant_id: TENANT, violation_id: vios[0].id, seller_id: vios[0].seller_id, status: "pending", appeal_text: "The design is my own original work — I can provide the layered source files and dated drafts.", appeal_type: "violation_appeal", evidence_urls: [], decision: null, decided_by: null, decided_at: null },
        ...(vios[1] ? [{ tenant_id: TENANT, violation_id: vios[1].id, seller_id: vios[1].seller_id, status: "granted", appeal_text: "These are size variants of one design, not duplicate listings.", appeal_type: "violation_appeal", evidence_urls: [], decision: "granted", decided_by: priya, decided_at: daysAgo(2) }] : []),
      ]);
      console.log("appeals topped up");
    }
  }
  const existingInv = await get(`seller_investigations?tenant_id=eq.${TENANT}&select=id`);
  if (existingInv.length < 3) {
    const subjB = customers[1]?.id || null;
    await insert("seller_investigations", [
      { tenant_id: TENANT, seller_id: subjB, violation_id: null, investigator_id: priya, status: "open", priority: "urgent", investigation_type: "account_takeover", notes: "Password reset followed by payout-detail change within one hour.", findings: null },
      { tenant_id: TENANT, seller_id: subjB, violation_id: null, investigator_id: priya, status: "closed", priority: "normal", investigation_type: "refund_abuse", notes: "Reviewed refund history across 6 months.", findings: "No abuse found — refunds track genuine print defects. Closed with no action." },
    ]);
    console.log("investigations topped up");
  }

  const existingQ = await get(`quarantine?select=id&limit=1`);
  if (!existingQ.length) {
    await insert("quarantine", [
      { tenant_id: TENANT, source_product_id: "gelato-88412", title: "Vintage Racing Logo Tee", brand: "Supplier import", supplier: "gelato", supplier_product_type: "t-shirt", reason: "Suspected counterfeit logo artwork in print file", resolved: false },
      { tenant_id: TENANT, source_product_id: "printful-55210", title: "World Tour 1987 Hoodie", brand: "Supplier import", supplier: "printful", supplier_product_type: "hoodie", reason: "Trademark term in title requires review", resolved: false },
      { tenant_id: TENANT, source_product_id: "gooten-30981", title: "Abstract Waves Mug", brand: "Supplier import", supplier: "gooten", supplier_product_type: "mug", reason: "Image resolution below print threshold", resolved: true, resolved_by: "Priya Nair", resolved_category: "released_ok" },
      { tenant_id: TENANT, source_product_id: "prodigi-77120", title: "Botanical Line Art Poster", brand: "Supplier import", supplier: "prodigi", supplier_product_type: "poster", reason: "Possible unlicensed artwork", resolved: true, resolved_by: "Priya Nair", resolved_category: "removed_policy" },
    ]);
    console.log("quarantine seeded");
  }

  // DMCA — one actioned notice (takedown + strike), one under review, one counter-notice
  const existingDmca = await get(`dmca_details?tenant_id=eq.${TENANT}&select=id`);
  if (!existingDmca.length && dmcaTicketId) {
    const subjA = customers[0]?.id || null;
    const [n1] = await insert("dmca_details", [{
      tenant_id: TENANT, ticket_id: dmcaTicketId, notice_kind: "takedown", received_via: "web_form",
      complainant_name: "Grace Lin", complainant_email: "grace.lin@example.com", complainant_is_agent: false,
      represented_owner: "Grace Lin", signature_text: "Grace Lin", signed_at: daysAgo(1),
      copyrighted_work_description: "Original illustration 'Foxglove Study' (2024)", copyrighted_work_url: "https://gracelin.example/foxglove",
      infringing_urls: ["https://unsaidmemories.com/product/foxglove-print"], good_faith_attested: true, perjury_attested: true,
      elements_complete: true, missing_elements: [], target_seller_id: subjA, target_listing_ref: products[2]?.slug || "foxglove-print",
      workflow_status: "actioned", acknowledged_at: daysAgo(1), reviewed_at: daysAgo(1), actioned_at: daysAgo(0),
      uploader_notified_at: daysAgo(0), counter_notice_due_at: inHours(240), row_version: 1,
      authorized_agent_for_owner: false, target_listing_snapshot: {}, notice_received_at: daysAgo(1),
      takedown_at: daysAgo(0), restore_not_before_at: inHours(240), restore_not_after_at: inHours(336),
    }]);
    await insert("dmca_takedown_log", [{ tenant_id: TENANT, ticket_id: dmcaTicketId, dmca_details_id: n1.id, action: "takedown", listing_ref: products[2]?.slug || "foxglove-print", seller_id: subjA, actor_staff_id: priya, detail: { reason: "Complete DMCA notice; listing taken down pending counter-notice window" } }]);
    await insert("dmca_strikes", [{ tenant_id: TENANT, ticket_id: dmcaTicketId, seller_id: subjA, strike_at: daysAgo(0), status: "active", row_version: 1 }]);
    await insert("dmca_details", [{
      tenant_id: TENANT, ticket_id: dmcaTicketId, notice_kind: "takedown", received_via: "email",
      complainant_name: "R. Callahan", complainant_email: "agent@callahanrights.example", complainant_is_agent: true,
      represented_owner: "Harbor Photography LLC", signature_text: "R. Callahan", signed_at: daysAgo(5),
      copyrighted_work_description: "Registered photographs (3 works)", copyrighted_work_url: null,
      infringing_urls: [], good_faith_attested: true, perjury_attested: false,
      elements_complete: false, missing_elements: ["perjury_attestation", "infringing_urls"], target_seller_id: subjA, target_listing_ref: "harbor-series",
      workflow_status: "under_review", acknowledged_at: daysAgo(5), reviewed_at: daysAgo(4), row_version: 1,
      authorized_agent_for_owner: true, target_listing_snapshot: {}, notice_received_at: daysAgo(5),
    }]);
    await insert("dmca_counter_notices", [{
      tenant_id: TENANT, ticket_id: dmcaTicketId, dmca_details_id: n1.id, received_at: daysAgo(0, 6),
      submitter_name: "Account holder", submitter_email: "designer@example.com", submitter_signature_text: "Account holder",
      signed_at: daysAgo(0, 6), jurisdiction_consent: true, perjury_attested: true, elements_complete: true, missing_elements: [], row_version: 1,
    }]);
    console.log("dmca seeded");
  }

  // Policies (table ships with this build's migration; skip gracefully pre-merge)
  try {
    const existing = await get(`trust_policies?tenant_id=eq.${TENANT}&select=id`);
    if (!existing.length) {
      await insert("trust_policies", [
        { tenant_id: TENANT, code: "counterfeit", title: "Counterfeit & brand misuse", body: "Listings may not reproduce protected logos, brand artwork, or trade dress. First confirmed offense: listing removal and a strike. Repeat offenses escalate to account restriction.", status: "active", version: 1 },
        { tenant_id: TENANT, code: "copyright", title: "Copyright & DMCA", body: "Complete DMCA notices are actioned within one business day: listing takedown, uploader notification, strike recorded. Counter-notices restore listings after the statutory window unless the complainant files suit.", status: "active", version: 1 },
        { tenant_id: TENANT, code: "prohibited_content", title: "Prohibited content", body: "Designs may not contain hate symbols, graphic violence, or sexual content involving minors (zero tolerance — immediate account termination and referral).", status: "active", version: 1 },
        { tenant_id: TENANT, code: "chargeback_abuse", title: "Chargeback & refund abuse", body: "Accounts with chargeback rates above 2% or patterned refund abuse enter fraud review. Evidence packs are assembled from order, tracking, and message records before any restriction.", status: "active", version: 1 },
      ]);
      console.log("policies seeded");
    }
  } catch (e) {
    console.log("policies skipped (trust_policies migration not applied yet):", String(e.message).slice(0, 120));
  }

  console.log("SEED COMPLETE");
}

main().catch((e) => { console.error("SEED FAILED:", e.message); process.exit(1); });
