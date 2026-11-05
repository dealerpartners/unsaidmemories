import { createServerClient } from "@/lib/supabase";

/**
 * CRM data layer for Unsaid — adapted from UnSaid Memories src/lib/admin/crm.ts and
 * src/lib/crm/* (enterprise handlers), re-pointed at Unsaid's own crm_*
 * tables on Unsaid's own Supabase tenant. Pet / appointment / grooming
 * concepts are stripped: purchase history replaces visit history, and
 * follow-ups replace appointments.
 */

export type Db = ReturnType<typeof createServerClient>;

/** The accounting entity id invoices/receipts must carry (acct_* books are
 *  entity-scoped; the tenant's books were seeded with one entity). */
export async function getAccountingEntityId(db: Db): Promise<string> {
  const { data } = await db.from("acct_ar_invoices").select("entity_id").limit(1).maybeSingle();
  const found = (data as { entity_id?: string } | null)?.entity_id;
  if (found) return found;
  const { data: rec } = await db.from("acct_ar_receipts").select("entity_id").limit(1).maybeSingle();
  return (rec as { entity_id?: string } | null)?.entity_id || "e0000000-0000-0000-0000-000000000001";
}

/** Deposit (bank) account receipts must carry (seeded chart of accounts). */
export async function getDepositAccountId(db: Db): Promise<string> {
  const { data } = await db.from("acct_ar_receipts").select("deposit_account_id").limit(1).maybeSingle();
  return (data as { deposit_account_id?: string } | null)?.deposit_account_id || "b1000000-0000-0000-0000-000000000001";
}

/** Revenue account invoice lines must carry (seeded chart of accounts). */
export async function getRevenueAccountId(db: Db): Promise<string> {
  const { data } = await db.from("acct_ar_invoice_lines").select("revenue_account_id").limit(1).maybeSingle();
  return (data as { revenue_account_id?: string } | null)?.revenue_account_id || "c1000000-0000-0000-0000-000000000003";
}

export function getDb(): Db {
  return createServerClient();
}

let tenantCache: string | null = null;
export async function getTenantId(db: Db): Promise<string> {
  if (process.env.SUPABASE_TENANT_ID) return process.env.SUPABASE_TENANT_ID;
  if (process.env.UNSAID_TENANT_ID) return process.env.UNSAID_TENANT_ID;
  if (tenantCache) return tenantCache;
  const { data } = await db.from("tenants").select("id").limit(1).maybeSingle();
  tenantCache = (data as { id: string } | null)?.id ?? "";
  return tenantCache;
}

export type Customer = {
  id: string;
  tenant_id: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  customer_type: string | null;
  lifecycle_stage: string | null;
  lifecycle_status: string | null;
  lead_status: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  preferred_contact_method: string | null;
  preferred_language: string | null;
  date_of_birth: string | null;
  customer_since: string | null;
  first_contact_at: string | null;
  last_activity_at: string | null;
  next_follow_up_at: string | null;
  lifetime_value: number | null;
  average_ticket: number | null;
  outstanding_balance: number | null;
  total_spend_30d: number | null;
  total_spend_365d: number | null;
  marketing_email_opt_in: boolean | null;
  marketing_sms_opt_in: boolean | null;
  transactional_email_opt_in: boolean | null;
  transactional_sms_opt_in: boolean | null;
  do_not_call: boolean | null;
  do_not_contact: boolean | null;
  is_active: boolean | null;
  merged_into_customer_id: string | null;
  created_at: string;
  updated_at: string | null;
};

export function customerName(c: Pick<Customer, "first_name" | "last_name" | "preferred_name" | "company_name" | "email">): string {
  const personal = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  if (personal) return c.preferred_name ? `${personal} (${c.preferred_name})` : personal;
  if (c.company_name) return c.company_name;
  return c.email || "Unnamed customer";
}

export const CUSTOMER_COLUMNS =
  "id, tenant_id, first_name, last_name, preferred_name, company_name, email, phone, mobile_phone, customer_type, lifecycle_stage, lifecycle_status, lead_status, city, state, country, address_line1, address_line2, postal_code, preferred_contact_method, preferred_language, date_of_birth, customer_since, first_contact_at, last_activity_at, next_follow_up_at, lifetime_value, average_ticket, outstanding_balance, total_spend_30d, total_spend_365d, marketing_email_opt_in, marketing_sms_opt_in, transactional_email_opt_in, transactional_sms_opt_in, do_not_call, do_not_contact, is_active, merged_into_customer_id, created_at, updated_at";

export type CustomerFilters = {
  view?: string; // all | active | new | returning | inactive | needs_followup
  type?: string;
  stage?: string;
  q?: string;
  page?: number;
  perPage?: number;
  sort?: string;
};

const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

export async function listCustomers(db: Db, tenantId: string, f: CustomerFilters) {
  const page = Math.max(1, f.page || 1);
  const perPage = Math.min(100, Math.max(1, f.perPage || 25));
  let query = db
    .from("crm_customers")
    .select(CUSTOMER_COLUMNS, { count: "exact" })
    .eq("tenant_id", tenantId)
    .is("merged_into_customer_id", null);

  const now = Date.now();
  switch (f.view) {
    case "active":
      query = query.eq("is_active", true).not("lifecycle_status", "in", '("lost","churned")');
      break;
    case "new":
      query = query.gte("created_at", new Date(now - THIRTY_DAYS).toISOString());
      break;
    case "returning":
      query = query.in("lifecycle_stage", ["returning", "vip", "active"]).gte("created_at", new Date(now - 365 * 24 * 3600 * 1000).toISOString());
      break;
    case "inactive":
      query = query.or(`last_activity_at.lt.${new Date(now - 90 * 24 * 3600 * 1000).toISOString()},last_activity_at.is.null`);
      break;
    case "needs_followup": {
      // Needs Follow-up (tree 1.2): the customer's follow-up date has arrived
      // (next_follow_up_at <= now) OR staff still hold an open task for them
      // in crm_tasks (a call, a follow-up, anything not yet done).
      const { data: openTasks } = await db
        .from("crm_tasks")
        .select("customer_id")
        .eq("tenant_id", tenantId)
        .eq("status", "open")
        .not("customer_id", "is", null);
      const taskIds = [...new Set(((openTasks || []) as { customer_id: string }[]).map((t) => t.customer_id))];
      const dueClause = `next_follow_up_at.lte.${new Date().toISOString()}`;
      query = taskIds.length ? query.or(`${dueClause},id.in.(${taskIds.join(",")})`) : query.or(dueClause);
      break;
    }
    default:
      break;
  }
  if (f.type) query = query.eq("customer_type", f.type);
  if (f.stage) query = query.eq("lifecycle_stage", f.stage);
  if (f.q) {
    const q = f.q.replace(/[%_]/g, "");
    query = query.or(
      `email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,company_name.ilike.%${q}%,phone.ilike.%${q}%`
    );
  }
  const sortMap: Record<string, { col: string; asc: boolean }> = {
    newest: { col: "created_at", asc: false },
    oldest: { col: "created_at", asc: true },
    ltv: { col: "lifetime_value", asc: false },
    balance: { col: "outstanding_balance", asc: false },
    activity: { col: "last_activity_at", asc: false },
    name: { col: "last_name", asc: true },
  };
  const s = sortMap[f.sort || "newest"] || sortMap.newest;
  query = query.order(s.col, { ascending: s.asc, nullsFirst: false });

  const { data, count, error } = await query.range((page - 1) * perPage, page * perPage - 1);
  if (error) throw new Error(error.message);
  const customers = (data || []) as unknown as Customer[];

  // Last purchase + order counts from ERP orders (the purchase history).
  const ids = customers.map((c) => c.id);
  const lastPurchase = new Map<string, string>();
  const orderCounts = new Map<string, number>();
  if (ids.length) {
    const { data: orders } = await db
      .from("erp_orders")
      .select("crm_customer_id, order_date, created_at")
      .in("crm_customer_id", ids)
      .order("order_date", { ascending: false });
    for (const o of (orders || []) as { crm_customer_id: string; order_date: string | null; created_at: string }[]) {
      orderCounts.set(o.crm_customer_id, (orderCounts.get(o.crm_customer_id) || 0) + 1);
      if (!lastPurchase.has(o.crm_customer_id)) {
        lastPurchase.set(o.crm_customer_id, o.order_date || o.created_at);
      }
    }
  }
  // Tags
  const tagMap = new Map<string, string[]>();
  if (ids.length) {
    const { data: assigns } = await db
      .from("crm_customer_tag_assignments")
      .select("customer_id, tag_id")
      .in("customer_id", ids);
    const tagIds = [...new Set((assigns || []).map((a: { tag_id: string }) => a.tag_id))];
    if (tagIds.length) {
      const { data: tags } = await db.from("crm_tags").select("id, name").in("id", tagIds);
      const nameById = new Map((tags || []).map((t: { id: string; name: string }) => [t.id, t.name]));
      for (const a of (assigns || []) as { customer_id: string; tag_id: string }[]) {
        const arr = tagMap.get(a.customer_id) || [];
        const n = nameById.get(a.tag_id);
        if (n) arr.push(n);
        tagMap.set(a.customer_id, arr);
      }
    }
  }

  return {
    customers: customers.map((c) => ({
      ...c,
      last_purchase: lastPurchase.get(c.id) || null,
      order_count: orderCounts.get(c.id) || 0,
      tags: tagMap.get(c.id) || [],
    })),
    total: count || 0,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil((count || 0) / perPage)),
  };
}

export async function getCustomer(db: Db, tenantId: string, id: string) {
  const { data, error } = await db
    .from("crm_customers")
    .select(CUSTOMER_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as Customer) || null;
}

export async function getCustomerDetail(db: Db, tenantId: string, id: string) {
  const customer = await getCustomer(db, tenantId, id);
  if (!customer) return null;

  const [orders, invoices, receipts, documents, notes, conversations, messages, tagAssigns, tags, prefs, memberships, tasks, leads, giftCards, campaignMembers, campaignRows, templateRows] =
    await Promise.all([
      db.from("erp_orders").select("*").eq("crm_customer_id", id).order("order_date", { ascending: false }).limit(100),
      db.from("acct_ar_invoices").select("*").eq("source_customer_id", id).order("invoice_date", { ascending: false }).limit(100),
      db.from("acct_ar_receipts").select("*").eq("customer_id", id).order("receipt_date", { ascending: false }).limit(100),
      db.from("crm_documents").select("*").eq("customer_id", id).order("uploaded_at", { ascending: false }).limit(100),
      db.from("crm_notes").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(200),
      db.from("crm_conversations").select("*").eq("customer_id", id).order("last_message_at", { ascending: false }).limit(50),
      db.from("crm_messages").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(200),
      db.from("crm_customer_tag_assignments").select("id, tag_id, assigned_at").eq("customer_id", id),
      db.from("crm_tags").select("*").eq("tenant_id", tenantId).eq("entity_type", "customer").order("name"),
      db.from("crm_customer_preferences").select("*").eq("customer_id", id).maybeSingle(),
      db.from("crm_segment_memberships").select("segment_id, entered_at").eq("customer_id", id).is("exited_at", null),
      db.from("crm_tasks").select("*").eq("customer_id", id).order("due_at", { ascending: true }).limit(50),
      db.from("crm_leads").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(20),
      // Financial Activity (tree 1.3): the customer's own gift cards / store
      // credit on file in the acct_* books.
      db.from("acct_gift_cards").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(50),
      // Communication (tree 1.3): campaign membership + the campaign and
      // template lists the profile sections render from.
      db.from("crm_campaign_members").select("*").eq("customer_id", id).order("enrolled_at", { ascending: false }).limit(50),
      db.from("crm_campaigns").select("id, name, campaign_type, status, channel").eq("tenant_id", tenantId).order("name"),
      db.from("crm_campaigns").select("*").eq("tenant_id", tenantId).eq("campaign_type", "message_template").order("name"),
    ]);

  const allCampaigns = (campaignRows.data || []) as { id: string; name: string; campaign_type: string; status: string; channel: string }[];
  const campaignById = new Map(allCampaigns.map((cp) => [cp.id, cp]));
  const campaignMemberships = ((campaignMembers.data || []) as { campaign_id: string; status: string; enrolled_at: string; sent_at: string | null; converted_at: string | null }[]).map((m) => ({
    ...m,
    campaign_name: campaignById.get(m.campaign_id)?.name || "Campaign removed",
    campaign_type: campaignById.get(m.campaign_id)?.campaign_type || "",
    campaign_status: campaignById.get(m.campaign_id)?.status || "",
    campaign_channel: campaignById.get(m.campaign_id)?.channel || "",
  }));

  const tagNameById = new Map(((tags.data || []) as { id: string; name: string }[]).map((t) => [t.id, t.name]));
  const customerTags = ((tagAssigns.data || []) as { tag_id: string }[])
    .map((a) => ({ id: a.tag_id, name: tagNameById.get(a.tag_id) || a.tag_id }))
    .filter((t) => t.name);

  let segments: { id: string; name: string }[] = [];
  const segIds = ((memberships.data || []) as { segment_id: string }[]).map((m) => m.segment_id);
  if (segIds.length) {
    const { data: segs } = await db.from("crm_segments").select("id, name").in("id", segIds);
    segments = (segs || []) as { id: string; name: string }[];
  }

  return {
    customer,
    orders: orders.data || [],
    invoices: invoices.data || [],
    receipts: receipts.data || [],
    documents: documents.data || [],
    notes: notes.data || [],
    conversations: conversations.data || [],
    messages: messages.data || [],
    customerTags,
    allTags: tags.data || [],
    preferences: prefs.data || null,
    segments,
    tasks: tasks.data || [],
    leads: leads.data || [],
    giftCards: giftCards.data || [],
    campaignMemberships,
    campaigns: allCampaigns.filter((cp) => cp.campaign_type !== "message_template"),
    templates: templateRows.data || [],
  };
}

export async function getOverview(db: Db, tenantId: string) {
  const now = Date.now();
  const since30 = new Date(now - THIRTY_DAYS).toISOString();
  const [total, active, fresh, atRisk, balances, openTasks, leadCount] = await Promise.all([
    db.from("crm_customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).is("merged_into_customer_id", null),
    db.from("crm_customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true).is("merged_into_customer_id", null),
    db.from("crm_customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", since30).is("merged_into_customer_id", null),
    db.from("crm_customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("lifecycle_status", ["at_risk", "at-risk"]).is("merged_into_customer_id", null),
    db.from("crm_customers").select("outstanding_balance").eq("tenant_id", tenantId).gt("outstanding_balance", 0).is("merged_into_customer_id", null),
    db.from("crm_tasks").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "open"),
    db.from("crm_leads").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).not("status", "in", '("converted","lost")'),
  ]);
  const outstanding = ((balances.data || []) as { outstanding_balance: number }[]).reduce(
    (sum, r) => sum + Number(r.outstanding_balance || 0),
    0
  );
  // Recent activity: newest customers + newest notes + newest messages.
  const [recentCustomers, recentNotes, recentMessages, dueFollowUps] = await Promise.all([
    db.from("crm_customers").select("id, first_name, last_name, email, created_at").eq("tenant_id", tenantId).is("merged_into_customer_id", null).order("created_at", { ascending: false }).limit(6),
    db.from("crm_notes").select("id, customer_id, note_type, body, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(6),
    db.from("crm_messages").select("id, customer_id, channel, direction, subject, body, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(6),
    db.from("crm_customers").select("id, first_name, last_name, email, next_follow_up_at").eq("tenant_id", tenantId).not("next_follow_up_at", "is", null).lte("next_follow_up_at", new Date(now + 7 * 24 * 3600 * 1000).toISOString()).is("merged_into_customer_id", null).order("next_follow_up_at").limit(8),
  ]);
  return {
    totalCustomers: total.count || 0,
    activeCustomers: active.count || 0,
    newCustomers30d: fresh.count || 0,
    atRisk: atRisk.count || 0,
    outstandingBalance: outstanding,
    customersWithBalance: (balances.data || []).length,
    openTasks: openTasks.count || 0,
    openLeads: leadCount.count || 0,
    recentCustomers: recentCustomers.data || [],
    recentNotes: recentNotes.data || [],
    recentMessages: recentMessages.data || [],
    dueFollowUps: dueFollowUps.data || [],
  };
}

/* ---------------- Segments ---------------- */

export type SegmentRule = { field: string; op: string; value: string | number | boolean | string[] };
export type SegmentDefinition = { match?: "all" | "any"; rules: SegmentRule[] };

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 3600 * 1000));
}

export function evaluateRule(c: Customer & { order_count?: number; tags?: string[] }, r: SegmentRule): boolean {
  const v = r.value;
  switch (r.field) {
    case "lifecycle_stage":
      return r.op === "neq" ? c.lifecycle_stage !== v : c.lifecycle_stage === v;
    case "lifecycle_status":
      return r.op === "neq" ? c.lifecycle_status !== v : c.lifecycle_status === v;
    case "customer_type":
      return c.customer_type === v;
    case "lifetime_value": {
      const n = Number(c.lifetime_value || 0);
      return r.op === "lt" ? n < Number(v) : r.op === "lte" ? n <= Number(v) : r.op === "gt" ? n > Number(v) : n >= Number(v);
    }
    case "outstanding_balance": {
      const n = Number(c.outstanding_balance || 0);
      return r.op === "gt" ? n > Number(v) : r.op === "eq" ? n === Number(v) : n >= Number(v);
    }
    case "orders_count": {
      const n = Number(c.order_count || 0);
      return r.op === "lt" ? n < Number(v) : r.op === "gt" ? n > Number(v) : n >= Number(v);
    }
    case "days_since_activity": {
      const d = daysAgo(c.last_activity_at);
      if (d === null) return r.op === "gte" || r.op === "gt";
      return r.op === "lt" ? d < Number(v) : r.op === "gt" ? d > Number(v) : d >= Number(v);
    }
    case "days_since_created": {
      const d = daysAgo(c.created_at) ?? 0;
      return r.op === "lt" ? d < Number(v) : r.op === "gt" ? d > Number(v) : d >= Number(v);
    }
    case "has_tag":
      return (c.tags || []).includes(String(v));
    case "missing_email":
      return !c.email;
    case "missing_phone":
      return !c.phone && !c.mobile_phone;
    case "marketing_email_opt_in":
      return Boolean(c.marketing_email_opt_in) === Boolean(v);
    case "birth_month": {
      if (!c.date_of_birth) return false;
      return new Date(c.date_of_birth).getUTCMonth() + 1 === Number(v);
    }
    default:
      return false;
  }
}

export async function evaluateSegment(db: Db, tenantId: string, definition: SegmentDefinition) {
  const { customers } = await listCustomers(db, tenantId, { perPage: 100, page: 1, view: "all" });
  // listCustomers caps at 100/page — walk every page for a full evaluation.
  const all = [...customers];
  let page = 2;
  let totalPages = 1;
  const first = await listCustomers(db, tenantId, { perPage: 100, page: 1, view: "all" });
  totalPages = first.totalPages;
  while (page <= totalPages) {
    const next = await listCustomers(db, tenantId, { perPage: 100, page, view: "all" });
    all.push(...next.customers);
    page++;
  }
  const rules = definition.rules || [];
  const matched = all.filter((c) =>
    definition.match === "any" ? rules.some((r) => evaluateRule(c, r)) : rules.every((r) => evaluateRule(c, r))
  );
  return matched;
}

/* ---------------- Activity timeline ---------------- */

export type ActivityItem = {
  at: string;
  kind: "note" | "message" | "order" | "invoice" | "receipt" | "system";
  /** Tree 1.3 Notes and Activity split: notes file under their note_type
   *  (internal / customer / system / audit); every record event — messages,
   *  orders, invoices, payments — files under system activity. */
  cat: "internal" | "customer" | "system" | "audit";
  title: string;
  body?: string | null;
};

export function buildActivity(detail: NonNullable<Awaited<ReturnType<typeof getCustomerDetail>>>): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const n of detail.notes as { note_type: string; body: string; created_at: string }[]) {
    const cat: ActivityItem["cat"] =
      n.note_type === "system" ? "system" : n.note_type === "audit" ? "audit" : n.note_type === "customer" ? "customer" : "internal";
    items.push({ at: n.created_at, kind: n.note_type === "system" ? "system" : "note", cat, title: `Note (${n.note_type})`, body: n.body });
  }
  for (const m of detail.messages as { channel: string; direction: string; subject: string | null; body: string | null; created_at: string }[]) {
    items.push({ at: m.created_at, kind: "message", cat: "system", title: `${m.direction === "outbound" ? "Sent" : "Received"} · ${m.channel}${m.subject ? ` · ${m.subject}` : ""}`, body: m.body });
  }
  for (const o of detail.orders as { order_number: string; total: number; status: string; order_date: string | null; created_at: string }[]) {
    items.push({ at: o.order_date || o.created_at, kind: "order", cat: "system", title: `Order ${o.order_number} — $${Number(o.total).toFixed(2)} (${o.status})` });
  }
  for (const inv of detail.invoices as { invoice_number: string; total: number; status: string; invoice_date: string }[]) {
    items.push({ at: inv.invoice_date, kind: "invoice", cat: "system", title: `Invoice ${inv.invoice_number} — $${Number(inv.total).toFixed(2)} (${inv.status})` });
  }
  for (const r of detail.receipts as { receipt_number: string; amount: number; status: string; receipt_date: string }[]) {
    items.push({ at: r.receipt_date, kind: "receipt", cat: "system", title: `Payment ${r.receipt_number} — $${Number(r.amount).toFixed(2)} (${r.status})` });
  }
  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function fmtMoney(n: number | null | undefined): string {
  return `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
        " " +
        d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
