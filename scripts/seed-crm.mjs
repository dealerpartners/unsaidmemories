/**
 * Seed CRM data + the CRM verification user for Unsaid.
 *
 * Run:  SEED_CRM_PASSWORD='<password>' node scripts/seed-crm.mjs
 *
 * Credentials are read from the worktree .env (SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY). Nothing secret is printed or written to disk.
 * Every stage is idempotent: existing rows (matched by natural keys) are
 * reused or skipped, so the script can be re-run safely after a failure.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const URL_ = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env");
const PASSWORD = process.env.SEED_CRM_PASSWORD;
if (!PASSWORD) throw new Error("SEED_CRM_PASSWORD env var is required (never stored in the repo).");
const CRM_EMAIL = "crm.admin@unsaid.local";

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const day = 24 * 3600 * 1000;
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const dateOnly = (msAgo) => iso(msAgo).slice(0, 10);

async function rest(method, table, body, query = "") {
  const res = await fetch(`${URL_}/rest/v1/${table}${query}`, {
    method,
    headers: { ...H, Prefer: "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${table} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const insert = (table, rows) => rest("POST", table, rows);
const select = (table, query) => rest("GET", table, null, query);
const byKey = async (table, column, value) =>
  (await select(table, `?select=*&${column}=eq.${encodeURIComponent(value)}&limit=1`))[0] || null;

async function main() {
  const tenants = await select("tenants", "?select=id&limit=1");
  const tenantId = tenants[0].id;
  console.log("tenant resolved:", tenantId);

  /* ---- CRM login user (Supabase Auth) + admin seats ---- */
  const listRes = await fetch(`${URL_}/auth/v1/admin/users?per_page=200`, { headers: H });
  const listJson = await listRes.json();
  let user = (listJson.users || []).find((u) => u.email === CRM_EMAIL);
  if (!user) {
    const res = await fetch(`${URL_}/auth/v1/admin/users`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ email: CRM_EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { name: "CRM Manager", module: "crm" } }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`auth create → ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
    user = json;
    console.log("auth user created:", CRM_EMAIL);
  } else {
    console.log("auth user already exists:", CRM_EMAIL);
  }
  // portal_users first: platform_admins.user_id FK-references portal_users.id.
  let portalRowId = null;
  const existingPortal = await select("portal_users", `?select=id&user_id=eq.${user.id}`);
  if (!existingPortal.length) {
    const [row] = await insert("portal_users", {
      tenant_id: tenantId, user_id: user.id, role_type: "Admin", portal: "admin",
      display_name: "CRM Manager", email: CRM_EMAIL, is_active: true, is_owner: false, accepted_at: iso(0),
    });
    portalRowId = row.id;
    console.log("portal_users seat created (Admin, crm)");
  } else portalRowId = existingPortal[0].id;
  const existingSeat = await select("platform_admins", `?select=user_id&user_id=eq.${portalRowId}`);
  if (!existingSeat.length) {
    await insert("platform_admins", { user_id: portalRowId, granted_by: portalRowId, reason: "CRM build seed — CRM module verification user" });
    console.log("platform_admins seat granted");
  }

  /* ---- Customers (reuse by email) ---- */
  const thisMonth = new Date().getUTCMonth() + 1;
  const dob = (month, d) => `1990-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const customerRows = [
    { key: "maya", first_name: "Maya", last_name: "Chen", email: "maya.chen@seed.unsaid.local", phone: "901-555-0114", mobile_phone: "901-555-0114", customer_type: "individual", lifecycle_stage: "vip", lifecycle_status: "healthy", city: "Memphis", state: "TN", postal_code: "38122", address_line1: "699 Waring Rd", country: "US", date_of_birth: dob(thisMonth, 14), lifetime_value: 1284.50, average_ticket: 214.08, outstanding_balance: 0, total_spend_30d: 240, total_spend_365d: 1284.50, last_activity: 2, created_days_ago: 320 },
    { key: "jordan", first_name: "Jordan", last_name: "Ellis", email: "jordan.ellis@seed.unsaid.local", phone: "901-555-0120", mobile_phone: "901-555-0120", customer_type: "individual", lifecycle_stage: "active", lifecycle_status: "healthy", city: "Nashville", state: "TN", country: "US", lifetime_value: 642.00, average_ticket: 160.50, outstanding_balance: 0, total_spend_30d: 96, total_spend_365d: 642, last_activity: 6, created_days_ago: 200 },
    { key: "priya", first_name: "Priya", last_name: "Nair", email: "priya.nair@seed.unsaid.local", phone: "901-555-0131", customer_type: "individual", lifecycle_stage: "returning", lifecycle_status: "healthy", city: "Austin", state: "TX", country: "US", lifetime_value: 388.25, average_ticket: 129.42, outstanding_balance: 0, last_activity: 21, created_days_ago: 260 },
    { key: "sam", first_name: "Sam", last_name: "Whitaker", email: "sam.whitaker@seed.unsaid.local", phone: "901-555-0142", mobile_phone: "901-555-0142", customer_type: "individual", lifecycle_stage: "active", lifecycle_status: "needs_attention", city: "Memphis", state: "TN", country: "US", lifetime_value: 210.00, average_ticket: 105.00, outstanding_balance: 74.50, next_follow_up_days: -1, last_activity: 3, created_days_ago: 150 },
    { key: "rosa", first_name: "Rosa", last_name: "Delgado", email: "rosa.delgado@seed.unsaid.local", phone: "901-555-0153", customer_type: "individual", lifecycle_stage: "at_risk", lifecycle_status: "at_risk", city: "Chicago", state: "IL", country: "US", lifetime_value: 96.00, average_ticket: 48.00, outstanding_balance: 0, last_activity: 100, created_days_ago: 300 },
    { key: "tom", first_name: "Tom", last_name: "Becker", email: "tom.becker@seed.unsaid.local", phone: "901-555-0164", customer_type: "individual", lifecycle_stage: "lapsed", lifecycle_status: "needs_attention", city: "Denver", state: "CO", country: "US", lifetime_value: 154.00, average_ticket: 77.00, outstanding_balance: 0, last_activity: 140, created_days_ago: 340 },
    { key: "aisha", first_name: "Aisha", last_name: "Bello", email: "aisha.bello@seed.unsaid.local", phone: "901-555-0175", mobile_phone: "901-555-0175", customer_type: "individual", lifecycle_stage: "new_customer", lifecycle_status: "healthy", city: "Atlanta", state: "GA", country: "US", lifetime_value: 58.00, average_ticket: 58.00, outstanding_balance: 0, created_days_ago: 5, last_activity: 1 },
    { key: "grace", first_name: "Grace", last_name: "Liu", email: "grace.liu@seed.unsaid.local", phone: "901-555-0186", customer_type: "individual", lifecycle_stage: "new_lead", lifecycle_status: "healthy", city: "Seattle", state: "WA", country: "US", lifetime_value: 0, average_ticket: 0, outstanding_balance: 0, created_days_ago: 9, last_activity: 9 },
    { key: "noah", first_name: "Noah", last_name: "Bergström", company_name: "Bergström Studio", email: "noah@seed.unsaid.local", phone: "901-555-0197", customer_type: "business", lifecycle_stage: "active", lifecycle_status: "healthy", city: "Portland", state: "OR", country: "US", lifetime_value: 2310.00, average_ticket: 385.00, outstanding_balance: 0, last_activity: 4, created_days_ago: 280 },
    { key: "alex1", first_name: "Alex", last_name: "Morgan", email: "alex.morgan@seed.unsaid.local", phone: "901-555-0108", mobile_phone: "901-555-0108", customer_type: "individual", lifecycle_stage: "active", lifecycle_status: "healthy", city: "Memphis", state: "TN", country: "US", lifetime_value: 176.00, average_ticket: 88.00, outstanding_balance: 0, last_activity: 12, created_days_ago: 170 },
    { key: "alex2", first_name: "Alex", last_name: "Morgan", email: "ALEX.MORGAN@seed.unsaid.local", phone: "901-555-0108", customer_type: "individual", lifecycle_stage: "new_customer", lifecycle_status: "healthy", city: "Memphis", state: "TN", country: "US", lifetime_value: 42.00, average_ticket: 42.00, outstanding_balance: 0, last_activity: 30, created_days_ago: 45 },
    { key: "kim", first_name: "Kim", last_name: "Score", email: "kim.score@seed.unsaid.local", phone: "901-555-0119", mobile_phone: "901-555-0119", customer_type: "gift_buyer", lifecycle_stage: "returning", lifecycle_status: "healthy", city: "Kansas City", state: "MO", country: "US", date_of_birth: dob(thisMonth, 22), lifetime_value: 322.00, average_ticket: 80.50, outstanding_balance: 0, last_activity: 9, created_days_ago: 190 },
    { key: "pat", first_name: "Pat", last_name: "Okafor", email: null, phone: "901-555-0127", customer_type: "individual", lifecycle_stage: "active", lifecycle_status: "needs_attention", city: "Memphis", state: "TN", country: "US", lifetime_value: 64.00, average_ticket: 64.00, outstanding_balance: 0, last_activity: 15, created_days_ago: 130 },
    { key: "dana", first_name: "Dana", last_name: "Whitfield", email: "dana.whitfield@seed.unsaid.local", phone: null, customer_type: "individual", lifecycle_stage: "active", lifecycle_status: "healthy", city: "Dallas", state: "TX", country: "US", lifetime_value: 118.00, average_ticket: 59.00, outstanding_balance: 0, last_activity: 11, created_days_ago: 160 },
    { key: "olivia", first_name: "Olivia", last_name: "Grant", email: "olivia.grant@seed.unsaid.local", phone: "901-555-0138", mobile_phone: "901-555-0138", customer_type: "individual", lifecycle_stage: "active", lifecycle_status: "needs_attention", city: "Memphis", state: "TN", country: "US", lifetime_value: 296.00, average_ticket: 98.67, outstanding_balance: 129.00, next_follow_up_days: 0, last_activity: 2, created_days_ago: 210 },
  ];

  const customers = {};
  for (const r of customerRows) {
    const { key, last_activity, created_days_ago, next_follow_up_days, ...rest } = r;
    let row = r.email ? await byKey("crm_customers", "email", r.email) : null;
    if (!row && !r.email) {
      const all = await select("crm_customers", `?select=*&phone=eq.${encodeURIComponent(r.phone)}&limit=1`);
      row = all[0] || null;
    }
    if (!row) {
      const createdAt = iso(created_days_ago * day);
      [row] = await insert("crm_customers", {
        tenant_id: tenantId,
        ...rest,
        preferred_contact_method: "email",
        preferred_language: "en",
        customer_since: dateOnly(created_days_ago * day),
        first_contact_at: createdAt,
        last_activity_at: iso(last_activity * day),
        next_follow_up_at: next_follow_up_days !== undefined ? iso(-next_follow_up_days * day) : null,
        marketing_email_opt_in: true,
        marketing_sms_opt_in: key === "maya" || key === "jordan",
        transactional_email_opt_in: true,
        transactional_sms_opt_in: key === "maya",
        do_not_call: false,
        do_not_contact: false,
        is_active: true,
        created_at: createdAt,
        updated_at: iso(last_activity * day),
      });
    }
    customers[key] = row.id;
  }
  console.log("customers ready:", Object.keys(customers).length);
  const seedIds = Object.values(customers);
  const idIn = seedIds.join(",");

  /* ---- Tags (reuse by slug) ---- */
  const tagDefs = ["VIP", "Referral Partner", "Staff", "Wholesale", "High Maintenance", "Gift Buyer", "Repeat Buyer"];
  const tags = {};
  for (const name of tagDefs) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    let t = await byKey("crm_tags", "slug", slug);
    if (!t) [t] = await insert("crm_tags", { tenant_id: tenantId, entity_type: "customer", name, slug, color: "#7258e8", is_system: false });
    tags[name] = t.id;
  }
  const assign = async (custKey, tagName) => {
    const existing = await select("crm_customer_tag_assignments", `?select=id&customer_id=eq.${customers[custKey]}&tag_id=eq.${tags[tagName]}&limit=1`);
    if (!existing.length) {
      await insert("crm_customer_tag_assignments", { tenant_id: tenantId, customer_id: customers[custKey], tag_id: tags[tagName] });
      await rest("POST", "crm_customer_tags", { tenant_id: tenantId, customer_id: customers[custKey], tag_id: tags[tagName] }, "?on_conflict=tenant_id,customer_id,tag_id").catch(() => {});
    }
  };
  await assign("maya", "VIP"); await assign("maya", "Repeat Buyer");
  await assign("noah", "Wholesale"); await assign("noah", "Repeat Buyer");
  await assign("kim", "Gift Buyer"); await assign("sam", "High Maintenance");
  await assign("jordan", "Referral Partner"); await assign("olivia", "Repeat Buyer");
  console.log("tags ready");

  /* ---- Preferences ---- */
  const prefCount = await select("crm_customer_preferences", `?select=customer_id&customer_id=in.(${idIn})`);
  if (!prefCount.length) {
    await insert("crm_customer_preferences", [
      { customer_id: customers.maya, tenant_id: tenantId, preferred_days: [], preferred_services: [], preferred_payment_method: "card", communication_notes: "Prefers email summaries after every order.", notification_frequency: "weekly", preferred_style_notes: "Warm tones, serif type.", special_handling_notes: null, accessibility_notes: null, parking_notes: null },
      { customer_id: customers.sam, tenant_id: tenantId, preferred_days: [], preferred_services: [], preferred_payment_method: "card", communication_notes: "Call before shipping oversized prints.", notification_frequency: null, preferred_style_notes: null, special_handling_notes: "Fragile — double-box framed pieces.", accessibility_notes: null, parking_notes: null },
    ]);
    console.log("preferences seeded");
  }

  /* ---- Orders ---- */
  const orderDefs = [
    ["maya", "UNS-2001", "delivered", 342.00, 45], ["maya", "UNS-2002", "delivered", 268.50, 30],
    ["maya", "UNS-2003", "shipped", 240.00, 2], ["jordan", "UNS-2004", "delivered", 186.00, 26],
    ["jordan", "UNS-2005", "delivered", 96.00, 6], ["priya", "UNS-2006", "delivered", 154.25, 21],
    ["sam", "UNS-2007", "processing", 135.50, 3], ["sam", "UNS-2008", "delivered", 74.50, 18],
    ["rosa", "UNS-2009", "delivered", 48.00, 100], ["rosa", "UNS-2010", "delivered", 48.00, 118],
    ["tom", "UNS-2011", "delivered", 77.00, 140], ["aisha", "UNS-2012", "shipped", 58.00, 1],
    ["noah", "UNS-2013", "delivered", 640.00, 20], ["noah", "UNS-2014", "delivered", 512.00, 4],
    ["alex1", "UNS-2015", "delivered", 88.00, 12], ["kim", "UNS-2016", "delivered", 122.00, 9],
    ["olivia", "UNS-2017", "processing", 129.00, 2], ["olivia", "UNS-2018", "delivered", 84.00, 15],
  ];
  let orderCount = 0;
  for (const [key, num, status, total, daysAgo] of orderDefs) {
    if (await byKey("erp_orders", "order_number", num)) continue;
    await insert("erp_orders", {
      tenant_id: tenantId, order_number: num, crm_customer_id: customers[key], status,
      fulfillment_method: "shipping", order_date: iso(daysAgo * day), currency: "USD",
      subtotal: total, discount_total: 0, tax_total: 0, shipping_total: 0, total,
      amount_paid: status === "processing" ? 0 : total, amount_refunded: 0,
      balance_due: status === "processing" ? total : 0, priority: 0, is_rush: false,
      metadata: { source: "crm-seed" },
    });
    orderCount++;
  }
  console.log("orders inserted:", orderCount);

  /* ---- Invoices + receipts ---- */
  const existingInv = await select("acct_ar_invoices", "?select=entity_id&limit=1");
  const entityId = existingInv[0]?.entity_id || "e0000000-0000-0000-0000-000000000001";
  const existingLine = await select("acct_ar_invoice_lines", "?select=revenue_account_id&limit=1");
  const revenueAccountId = existingLine[0]?.revenue_account_id || "c1000000-0000-0000-0000-000000000003";
  const inv = async (custKey, num, total, paid, status, daysAgo, depositPaid = 0) => {
    if (await byKey("acct_ar_invoices", "invoice_number", num)) return;
    const [row] = await insert("acct_ar_invoices", {
      tenant_id: tenantId, entity_id: entityId, customer_id: customers[custKey], source_customer_id: customers[custKey],
      invoice_number: num, invoice_date: dateOnly(daysAgo * day), due_date: dateOnly((daysAgo - 14) * day),
      currency: "USD", subtotal: total, tax_total: 0, discount_total: 0, total, amount_paid: paid,
      amount_credited: 0, status, source_system: "crm", deposit_paid: depositPaid,
      paid_at: status === "paid" ? iso(daysAgo * day) : null,
    });
    await insert("acct_ar_invoice_lines", { tenant_id: tenantId, invoice_id: row.id, line_no: 1, description: "Custom print order", quantity: 1, unit_price: total, line_subtotal: total, revenue_account_id: revenueAccountId, dimensions: {} });
  };
  await inv("maya", "INV-3001", 342.00, 342.00, "paid", 45);
  await inv("noah", "INV-3002", 640.00, 640.00, "paid", 20);
  await inv("sam", "INV-3003", 135.50, 61.00, "partially_paid", 3, 61.00);
  await inv("olivia", "INV-3004", 129.00, 0, "sent", 2);

  const existingReceipt = await select("acct_ar_receipts", "?select=deposit_account_id&limit=1");
  const depositAccountId = existingReceipt[0]?.deposit_account_id || "b1000000-0000-0000-0000-000000000001";
  const receipt = async (custKey, num, amount, method, status, ref, daysAgo) => {
    if (await byKey("acct_ar_receipts", "receipt_number", num)) return;
    await insert("acct_ar_receipts", {
      tenant_id: tenantId, entity_id: entityId, deposit_account_id: depositAccountId, customer_id: customers[custKey], receipt_number: num,
      receipt_date: dateOnly(daysAgo * day), currency: "USD", amount, payment_method: method,
      status, reference: ref, processor: method === "card" ? "stripe" : null,
    });
  };
  await receipt("maya", "RCPT-4001", 342.00, "card", "posted", "Order UNS-2001", 45);
  await receipt("noah", "RCPT-4002", 640.00, "bank_transfer", "posted", "Order UNS-2013", 20);
  await receipt("sam", "RCPT-4003", 61.00, "card", "posted", "Deposit — custom framed print UNS-2007", 3);
  await receipt("rosa", "RFND-4004", -32.00, "card", "refund", "Print defect — order UNS-2009", 96);
  await receipt("kim", "RCPT-4005", 25.00, "store_credit", "posted", "Store credit issued — goodwill", 9);
  console.log("invoices + receipts ready");

  /* ---- Documents / notes / messages / tasks (block-guarded) ---- */
  const docCount = await select("crm_documents", `?select=id&customer_id=in.(${idIn})&limit=1`);
  if (!docCount.length) {
    await insert("crm_documents", [
      { tenant_id: tenantId, customer_id: customers.maya, name: "Design approval — Memory quilt (UNS-2001)", status: "approved", mime_type: "application/pdf", uploaded_at: iso(46 * day), expires_at: null, metadata: { kind: "Design approval" } },
      { tenant_id: tenantId, customer_id: customers.sam, name: "Consent form — photo use for framed print", status: "pending_review", mime_type: "application/pdf", uploaded_at: iso(4 * day), expires_at: dateOnly(-20 * day), metadata: { kind: "Consent form" } },
      { tenant_id: tenantId, customer_id: customers.rosa, name: "Design approval — Framed print (UNS-2009)", status: "expired", mime_type: "application/pdf", uploaded_at: iso(118 * day), expires_at: dateOnly(10 * day), metadata: { kind: "Design approval" } },
    ]);
    console.log("documents seeded");
  }
  const noteCount = await select("crm_notes", `?select=id&customer_id=in.(${idIn})&limit=1`);
  if (!noteCount.length) {
    await insert("crm_notes", [
      { tenant_id: tenantId, customer_id: customers.maya, note_type: "internal", body: "Prefers warm tones and serif type on keepsakes. Always confirm the proof before printing.", is_pinned: true, created_at: iso(30 * day) },
      { tenant_id: tenantId, customer_id: customers.sam, note_type: "customer", body: "Customer asked for a call before the framed print ships — fragile handling.", is_pinned: false, created_at: iso(3 * day) },
      { tenant_id: tenantId, customer_id: customers.rosa, note_type: "system", body: "Enrolled in Win-Back Customers automation after 90 days without a purchase.", is_pinned: false, created_at: iso(10 * day) },
      { tenant_id: tenantId, customer_id: customers.olivia, note_type: "internal", body: "Balance of $129.00 on INV-3004 — payment reminder scheduled.", is_pinned: false, created_at: iso(1 * day) },
    ]);
    console.log("notes seeded");
  }
  const convCount = await select("crm_conversations", `?select=id&customer_id=in.(${idIn})&limit=1`);
  if (!convCount.length) {
    const [convMaya] = await insert("crm_conversations", {
      tenant_id: tenantId, customer_id: customers.maya, channel: "email", status: "open",
      subject: "Your memory quilt proof", started_at: iso(31 * day), last_message_at: iso(30 * day),
    });
    const msgBase = { conversation_id: null, subject: null, from_address: null, to_address: null, sent_at: null, is_system_generated: false, metadata: {} };
    await insert("crm_messages", [
      { ...msgBase, tenant_id: tenantId, conversation_id: convMaya.id, customer_id: customers.maya, channel: "email", direction: "outbound", status: "sent", delivery_status: "delivered", to_address: "maya.chen@seed.unsaid.local", subject: "Your memory quilt proof", body: "Hi Maya — your quilt proof is ready for approval. Reply to this email and we will print it right away.", provider: "resend", sent_at: iso(31 * day), created_at: iso(31 * day) },
      { ...msgBase, tenant_id: tenantId, conversation_id: convMaya.id, customer_id: customers.maya, channel: "email", direction: "inbound", status: "received", delivery_status: "delivered", from_address: "maya.chen@seed.unsaid.local", subject: "Re: Your memory quilt proof", body: "Approved — the warm tones are perfect. Please go ahead and print.", provider: "resend", created_at: iso(30 * day) },
      { ...msgBase, tenant_id: tenantId, customer_id: customers.jordan, channel: "sms", direction: "outbound", status: "sent", delivery_status: "delivered", to_address: "901-555-0120", body: "Unsaid Memories: your framed print shipped today. Tracking arrives by email shortly.", provider: "sms-gateway", sent_at: iso(6 * day), created_at: iso(6 * day) },
      { ...msgBase, tenant_id: tenantId, customer_id: customers.aisha, channel: "email", direction: "outbound", status: "sent", delivery_status: "delivered", to_address: "aisha.bello@seed.unsaid.local", subject: "Welcome to Unsaid Memories", body: "Welcome, Aisha — your first design is saved as a draft whenever you are ready to finish it.", provider: "resend", is_system_generated: true, sent_at: iso(4 * day), created_at: iso(4 * day) },
    ]);
    console.log("conversations + messages seeded");
  }
  const taskCount = await select("crm_tasks", `?select=id&customer_id=in.(${idIn})&limit=1`);
  if (!taskCount.length) {
    await insert("crm_tasks", [
      { tenant_id: tenantId, customer_id: customers.sam, task_type: "call", priority: "high", title: "Call Sam before the framed print ships", description: "Fragile handling confirmation + balance of $74.50 on INV-3003.", due_at: iso(-1 * day), status: "open" },
      { tenant_id: tenantId, customer_id: customers.olivia, task_type: "follow_up", priority: "normal", title: "Payment reminder — INV-3004 ($129.00)", description: null, due_at: iso(0), status: "open" },
      { tenant_id: tenantId, customer_id: customers.rosa, task_type: "follow_up", priority: "normal", title: "Win-back check-in", description: null, due_at: iso(-3 * day), status: "open" },
    ]);
    console.log("tasks seeded");
  }

  /* ---- Leads ---- */
  const leadDefs = [
    { contact_name: "Grace Liu", email: "grace.liu@seed.unsaid.local", phone: "901-555-0186", lead_source: "website", lead_type: "custom_order", status: "converted", booking_outcome: "booked", customer_id: customers.grace, notes: "Converted after design consult.", days: 9 },
    { contact_name: "Elena Brooks", email: "elena.brooks@seed.unsaid.local", phone: "901-555-0149", lead_source: "google", lead_type: "custom_order", status: "working", booking_outcome: "pending", notes: "Asked about canvas sizing for a nursery print.", days: 2 },
    { contact_name: "Marcus Reed", email: "marcus.reed@seed.unsaid.local", phone: "901-555-0161", lead_source: "referral", lead_type: "bulk_order", status: "qualified", booking_outcome: "pending", notes: "Referred by Jordan Ellis — 40 branded tees for staff.", days: 4 },
    { contact_name: "Sofia Marino", email: "sofia.marino@seed.unsaid.local", phone: "901-555-0172", lead_source: "social_media", lead_type: "design_help", status: "new", booking_outcome: null, notes: "Wants help turning wedding photos into a poster set.", days: 1 },
    { contact_name: "Ben Carter", email: "ben.carter@seed.unsaid.local", phone: "901-555-0183", lead_source: "website", lead_type: "custom_order", status: "lost", booking_outcome: "lost", lost_reason: "price", notes: "Went with a cheaper printer.", days: 15 },
    { contact_name: "Hannah Weiss", email: "hannah.weiss@seed.unsaid.local", phone: "901-555-0194", lead_source: "campaign", lead_type: "general", status: "contacted", booking_outcome: "no_response", notes: "Came in through the holiday campaign landing page.", days: 6 },
  ];
  for (const l of leadDefs) {
    if (await byKey("crm_leads", "email", l.email)) continue;
    const { days, ...rest } = l;
    await insert("crm_leads", {
      tenant_id: tenantId, ...rest,
      first_contact_at: iso(days * day), last_activity_at: iso(Math.max(0, days - 1) * day),
      next_follow_up_at: rest.status === "lost" || rest.status === "converted" ? null : iso(-1 * day),
      conversion_date: rest.status === "converted" ? iso(8 * day) : null,
      created_at: iso(days * day),
    });
  }
  console.log("leads ready");

  /* ---- Segments + memberships ---- */
  const seg = (name, type, definition, description) => ({ tenant_id: tenantId, name, description, entity_type: "customer", segment_type: type, definition, is_active: true });
  const segmentDefs = [
    seg("New Lead", "lifecycle", { match: "all", rules: [{ field: "lifecycle_stage", op: "eq", value: "new_lead" }] }, "Contacts who have not bought yet."),
    seg("New Customer", "lifecycle", { match: "all", rules: [{ field: "lifecycle_stage", op: "eq", value: "new_customer" }] }, "First purchase made recently."),
    seg("Active", "lifecycle", { match: "all", rules: [{ field: "lifecycle_stage", op: "eq", value: "active" }] }, "Buying and engaged."),
    seg("VIP", "lifecycle", { match: "all", rules: [{ field: "lifecycle_stage", op: "eq", value: "vip" }] }, "Top-tier customers."),
    seg("Returning", "lifecycle", { match: "all", rules: [{ field: "lifecycle_stage", op: "eq", value: "returning" }] }, "Came back for another order."),
    seg("Lapsed", "lifecycle", { match: "all", rules: [{ field: "lifecycle_stage", op: "eq", value: "lapsed" }] }, "Was active, has gone quiet."),
    seg("At Risk", "lifecycle", { match: "all", rules: [{ field: "lifecycle_stage", op: "eq", value: "at_risk" }] }, "Showing churn signals."),
    seg("Lost", "lifecycle", { match: "all", rules: [{ field: "lifecycle_stage", op: "eq", value: "lost" }] }, "Churned."),
    seg("Healthy", "health", { match: "all", rules: [{ field: "lifecycle_status", op: "eq", value: "healthy" }] }, "Lifecycle health: healthy."),
    seg("Needs Attention", "health", { match: "all", rules: [{ field: "lifecycle_status", op: "eq", value: "needs_attention" }] }, "Lifecycle health: needs attention."),
    seg("At Risk (health)", "health", { match: "all", rules: [{ field: "lifecycle_status", op: "eq", value: "at_risk" }] }, "Lifecycle health: at risk."),
    seg("Frequent Buyer", "behavioral", { match: "all", rules: [{ field: "orders_count", op: "gte", value: 4 }] }, "Four or more orders."),
    seg("High Lifetime Value", "behavioral", { match: "all", rules: [{ field: "lifetime_value", op: "gte", value: 1000 }] }, "Lifetime value of $1,000+."),
    seg("Price Sensitive", "behavioral", { match: "all", rules: [{ field: "lifetime_value", op: "lt", value: 120 }, { field: "orders_count", op: "gte", value: 2 }] }, "Repeat buyers with small baskets."),
    seg("Missing Contact Information", "operational", { match: "any", rules: [{ field: "missing_email", op: "eq", value: true }, { field: "missing_phone", op: "eq", value: true }] }, "No email or no phone on file."),
    seg("Outstanding Balance", "operational", { match: "all", rules: [{ field: "outstanding_balance", op: "gt", value: 0 }] }, "Owes a balance."),
    seg("No Purchase in 90+ Days", "operational", { match: "all", rules: [{ field: "days_since_activity", op: "gte", value: 90 }] }, "No activity for 90+ days."),
    seg("Birthday This Month", "marketing", { match: "all", rules: [{ field: "birth_month", op: "eq", value: thisMonth }] }, "Birthday falls in the current month."),
    seg("Win-Back Candidate", "marketing", { match: "any", rules: [{ field: "lifecycle_stage", op: "eq", value: "lapsed" }, { field: "lifecycle_stage", op: "eq", value: "at_risk" }] }, "Lapsed or at-risk — ready for a win-back."),
    seg("New Customer Nurture", "marketing", { match: "all", rules: [{ field: "days_since_created", op: "lt", value: 30 }] }, "Signed up in the last 30 days."),
    seg("Inactive 90+ Days", "marketing", { match: "all", rules: [{ field: "days_since_activity", op: "gte", value: 90 }] }, "Marketing view of the inactive base."),
    seg("VIP Tagged", "tag", { match: "all", rules: [{ field: "has_tag", op: "eq", value: "VIP" }] }, "Carries the VIP tag."),
    seg("Wholesale Tagged", "tag", { match: "all", rules: [{ field: "has_tag", op: "eq", value: "Wholesale" }] }, "Carries the Wholesale tag."),
  ];
  const segmentIds = {};
  for (const s of segmentDefs) {
    let row = (await select("crm_segments", `?select=id,name&tenant_id=eq.${tenantId}&name=eq.${encodeURIComponent(s.name)}&limit=1`))[0];
    if (!row) [row] = await insert("crm_segments", s);
    segmentIds[s.name] = row.id;
  }
  const custRows = await select("crm_customers", `?select=id,lifecycle_stage,lifecycle_status&tenant_id=eq.${tenantId}&merged_into_customer_id=is.null&limit=500`);
  const stageSeg = { new_lead: "New Lead", new_customer: "New Customer", active: "Active", vip: "VIP", returning: "Returning", lapsed: "Lapsed", at_risk: "At Risk", lost: "Lost" };
  const healthSeg = { healthy: "Healthy", needs_attention: "Needs Attention", at_risk: "At Risk (health)" };
  for (const c of custRows) {
    for (const segName of [stageSeg[c.lifecycle_stage], healthSeg[c.lifecycle_status]]) {
      if (segName && segmentIds[segName]) {
        const exists = await select("crm_segment_memberships", `?select=id&segment_id=eq.${segmentIds[segName]}&customer_id=eq.${c.id}&exited_at=is.null&limit=1`);
        if (!exists.length) await insert("crm_segment_memberships", { tenant_id: tenantId, segment_id: segmentIds[segName], customer_id: c.id, entered_at: iso(1 * day) }).catch(() => {});
      }
    }
  }
  console.log("segments ready:", segmentDefs.length);

  /* ---- Templates + automations (crm_campaigns) ---- */
  const templateDefs = [
    { name: "Repurchase check-in", channel: "email", subject: "Ready for your next keepsake?", body: "Hi there — your last piece turned out beautifully. When you are ready for the next one, your designs are saved and waiting." },
    { name: "You left something behind", channel: "email", subject: "Your design is still in your cart", body: "You left a design unfinished in your cart. It is saved exactly as you left it — pick up right where you stopped." },
    { name: "Happy birthday", channel: "email", subject: "Happy birthday from Unsaid Memories", body: "Happy birthday! Here is 15% off a keepsake made from your favourite photo, on us." },
    { name: "We miss you", channel: "email", subject: "It has been a while — your memories are safe with us", body: "It has been a while since your last order. Your designs and photos are still saved. Come back and make something new." },
    { name: "Payment reminder", channel: "email", subject: "A quick reminder about your balance", body: "Hi — this is a friendly reminder that a balance is outstanding on your account. Reply to this email and we will help you settle it." },
    { name: "Order shipped (SMS)", channel: "sms", subject: "", body: "Unsaid Memories: your order has shipped. Tracking details are in your email." },
    { name: "Design approval needed (SMS)", channel: "sms", subject: "", body: "Unsaid Memories: your design proof is ready — please approve it so we can print." },
  ];
  const templateIds = {};
  for (const t of templateDefs) {
    let row = (await select("crm_campaigns", `?select=id&tenant_id=eq.${tenantId}&campaign_type=eq.message_template&name=eq.${encodeURIComponent(t.name)}&limit=1`))[0];
    if (!row) {
      [row] = await insert("crm_campaigns", {
        tenant_id: tenantId, name: t.name, campaign_type: "message_template", status: "active",
        channel: t.channel, segment_definition: { subject: t.subject, body: t.body },
      });
    }
    templateIds[t.name] = row.id;
  }
  const automationDefs = [
    { name: "Repurchase Reminder", trigger: "repurchase_reminder", segment: "Frequent Buyer", template: "Repurchase check-in", delay: 45 },
    { name: "Cart Reminders", trigger: "cart_abandoned", segment: "New Customer Nurture", template: "You left something behind", delay: 1 },
    { name: "Birthday Messages", trigger: "birthday", segment: "Birthday This Month", template: "Happy birthday", delay: 0 },
    { name: "Win-Back Customers", trigger: "winback", segment: "Win-Back Candidate", template: "We miss you", delay: 0 },
    { name: "Payment Reminders", trigger: "payment_reminder", segment: "Outstanding Balance", template: "Payment reminder", delay: 3 },
  ];
  for (const a of automationDefs) {
    const exists = await select("crm_campaigns", `?select=id&tenant_id=eq.${tenantId}&campaign_type=eq.automation&name=eq.${encodeURIComponent(a.name)}&limit=1`);
    if (exists.length) continue;
    const t = templateDefs.find((x) => x.name === a.template);
    await insert("crm_campaigns", {
      tenant_id: tenantId, name: a.name, campaign_type: "automation", status: "active", channel: "email",
      segment_definition: {
        trigger: a.trigger, action: "send_message", segment_id: segmentIds[a.segment],
        template_campaign_id: templateIds[a.template], delay_days: a.delay,
        message_subject: t?.subject || a.name, message_body: t?.body || "",
      },
    });
  }
  console.log("templates + automations ready");
  console.log("SEED COMPLETE");
}

main().catch((e) => {
  console.error("SEED FAILED:", e.message);
  process.exit(1);
});
