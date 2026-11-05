/**
 * Seed coherent accounting books for Unsaid + a finance login user.
 * Credentials are read from the worktree .env at runtime and NEVER printed,
 * except the generated finance-user password, printed once at the end for
 * the operator handoff (it is not written to any file).
 * Idempotent: re-runs detect existing seed markers and skip creation.
 */
import fs from "node:fs";
import crypto from "node:crypto";

const env = {};
for (const l of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}
const URL_ = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };
const api = async (path, opts = {}) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { headers: H, ...opts });
  const t = await r.text();
  if (!r.ok) throw new Error(`${opts.method || "GET"} ${path} -> ${r.status}: ${t.slice(0, 240)}`);
  return t ? JSON.parse(t) : null;
};
const one = async (path) => (await api(path))[0];
const insert = (table, row) => api(table, { method: "POST", body: JSON.stringify(row) }).then((r) => r[0]);
const round2 = (n) => Math.round(Number(n) * 100) / 100;

const tenant = (await one("tenants?select=id&limit=1")).id;
console.log("tenant resolved");

// ── Fiscal year / periods / book context ─────────────────────────────────────
let fy = await one(`acct_fiscal_years?tenant_id=eq.${tenant}&order=fiscal_year.desc&limit=1`);
let entityId, bookId;
if (fy) {
  entityId = fy.entity_id;
  const p = await one(`acct_periods?tenant_id=eq.${tenant}&fiscal_year_id=eq.${fy.id}&order=period_no&limit=1`);
  bookId = p?.book_id;
}
if (!fy || !bookId) {
  entityId = entityId || crypto.randomUUID();
  bookId = bookId || crypto.randomUUID();
  fy = await insert("acct_fiscal_years", {
    tenant_id: tenant, entity_id: entityId, fiscal_year: 2026,
    start_date: "2026-01-01", end_date: "2026-12-31", is_adjustment_year: false,
  });
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  for (let i = 0; i < 12; i++) {
    const start = `2026-${String(i + 1).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(2026, i + 1, 0)).toISOString().slice(0, 10);
    await insert("acct_periods", {
      tenant_id: tenant, book_id: bookId, fiscal_year_id: fy.id, period_no: i + 1,
      name: `${months[i]} 2026`, start_date: start, end_date: end, status: "open",
    });
  }
  console.log("fiscal year + periods created");
} else {
  // Ensure every month of 2026 has a period on this book (existing books may be partial).
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  for (let i = 0; i < 12; i++) {
    const start = `2026-${String(i + 1).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(2026, i + 1, 0)).toISOString().slice(0, 10);
    const existing = await one(`acct_periods?tenant_id=eq.${tenant}&book_id=eq.${bookId}&start_date=lte.${start}&end_date=gte.${end}&limit=1`);
    if (!existing) {
      await insert("acct_periods", {
        tenant_id: tenant, book_id: bookId, fiscal_year_id: fy.id, period_no: i + 1,
        name: `${months[i]} 2026`, start_date: start, end_date: end, status: "open",
      });
    }
  }
  console.log("2026 periods ensured on existing book");
}

// ── Chart of accounts (upsert by code) ───────────────────────────────────────
const COA = [
  ["1000", "Operating Checking", "asset", "debit", "cash"],
  ["1010", "Stripe Clearing", "asset", "debit", "cash"],
  ["1020", "Reserve Savings", "asset", "debit", "cash"],
  ["1200", "Accounts Receivable", "asset", "debit", "receivable"],
  ["1300", "Inventory – Blanks & Materials", "asset", "debit", "inventory"],
  ["1500", "Equipment", "asset", "debit", "fixed_asset"],
  ["2050", "Accounts Payable", "liability", "credit", "payable"],
  ["2100", "Sales Tax Payable", "liability", "credit", "tax"],
  ["2200", "Accrued Expenses", "liability", "credit", "accrual"],
  ["2300", "Gift Card Liability", "liability", "credit", "deferred"],
  ["2310", "Store Credit Liability", "liability", "credit", "deferred"],
  ["2350", "Customer Deposits", "liability", "credit", "deferred"],
  ["3000", "Owner Equity", "equity", "credit", "equity"],
  ["3100", "Retained Earnings", "equity", "credit", "equity"],
  ["4000", "Product Sales", "revenue", "credit", "sales"],
  ["4900", "Other Income", "revenue", "credit", "other_income"],
  ["4020", "Refunds & Returns", "revenue", "debit", "contra_revenue"],
  ["5000", "COGS – Print Production", "expense", "debit", "cogs"],
  ["5010", "COGS – Shipping & Postage", "expense", "debit", "cogs"],
  ["6000", "Rent", "expense", "debit", "operating"],
  ["6010", "Software & Subscriptions", "expense", "debit", "operating"],
  ["6020", "Marketing & Ads", "expense", "debit", "operating"],
  ["6030", "Payment Processing Fees", "expense", "debit", "operating"],
  ["6040", "Chargebacks & Disputes", "expense", "debit", "operating"],
  ["6110", "Customer Credits & Goodwill", "expense", "debit", "operating"],
  ["6200", "Contract Labor", "expense", "debit", "operating"],
  ["6900", "Other Operating Expense", "expense", "debit", "operating"],
];
const acctByCode = {};
for (const [code, name, type, nb, subtype] of COA) {
  let a = await one(`acct_chart_of_accounts?tenant_id=eq.${tenant}&code=eq.${code}&limit=1`);
  if (!a) {
    a = await insert("acct_chart_of_accounts", {
      tenant_id: tenant, entity_id: entityId, code, name, account_type: type,
      normal_balance: nb, subtype, currency: "USD", is_control_account: ["1200", "2050"].includes(code),
      is_reconcilable: ["1000", "1010", "1020"].includes(code), is_posting_allowed: true,
      is_system: false, is_active: true, metadata: {},
    });
  }
  acctByCode[code] = a;
}
console.log("chart of accounts ready:", Object.keys(acctByCode).length);

// ── Journal posting (mirrors src/lib/accounting.ts postJournal) ─────────────
let entrySeq = Number((await one("acct_journal_entries?tenant_id=eq." + tenant + "&order=entry_no.desc&limit=1"))?.entry_no || 0);
async function postJournal({ source, memo, entryDate, lines, sourceId }) {
  const clean = lines.filter((l) => round2(l.debit) || round2(l.credit));
  const td = round2(clean.reduce((s, l) => s + (l.debit || 0), 0));
  const tc = round2(clean.reduce((s, l) => s + (l.credit || 0), 0));
  if (td !== tc) throw new Error(`seed journal unbalanced ${td} != ${tc}: ${memo}`);
  const period = await one(`acct_periods?tenant_id=eq.${tenant}&book_id=eq.${bookId}&start_date=lte.${entryDate}&end_date=gte.${entryDate}&limit=1`);
  if (!period) throw new Error("no period for " + entryDate);
  const batch = await insert("acct_journal_batches", {
    tenant_id: tenant, entity_id: entityId, book_id: bookId,
    batch_no: `B-SEED-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
    source, status: "posted", description: memo, posted_at: new Date().toISOString(),
  });
  const entry = await insert("acct_journal_entries", {
    tenant_id: tenant, entity_id: entityId, book_id: bookId, batch_id: batch.id, period_id: period.id,
    entry_no: ++entrySeq, entry_date: entryDate, posting_date: entryDate, source,
    source_id: sourceId || null, memo, currency: "USD", total_debit: td, total_credit: tc,
    status: "posted", posted_at: new Date().toISOString(),
  });
  for (let i = 0; i < clean.length; i++) {
    const l = clean[i];
    await insert("acct_journal_lines", {
      tenant_id: tenant, entity_id: entityId, journal_entry_id: entry.id, line_no: i + 1,
      account_id: acctByCode[l.code].id, description: l.memo || memo,
      debit: round2(l.debit || 0), credit: round2(l.credit || 0), dimensions: {},
    });
  }
  return entry.id;
}

// ── Seed marker: skip fixtures if already seeded ─────────────────────────────
const marker = await one(`acct_journal_entries?tenant_id=eq.${tenant}&memo=eq.Opening balances – FY2026&limit=1`);
if (!marker) {
  await postJournal({
    source: "opening_balance", memo: "Opening balances – FY2026", entryDate: "2026-01-01",
    lines: [
      { code: "1000", debit: 25000 }, { code: "1010", debit: 4200 },
      { code: "1300", debit: 3150 }, { code: "1500", debit: 6800 },
      { code: "3000", credit: 30000 }, { code: "3100", credit: 9150 },
    ],
  });
  await postJournal({ source: "expense", memo: "Studio rent – October", entryDate: "2026-10-01",
    lines: [{ code: "6000", debit: 1450 }, { code: "1000", credit: 1450 }] });
  await postJournal({ source: "expense", memo: "Software subscriptions – October", entryDate: "2026-10-03",
    lines: [{ code: "6010", debit: 212.4 }, { code: "1000", credit: 212.4 }] });
  await postJournal({ source: "expense", memo: "Meta ads – Keepsakes launch", entryDate: "2026-10-12",
    lines: [{ code: "6020", debit: 640 }, { code: "1010", credit: 640 }] });
  await postJournal({ source: "expense", memo: "Stripe processing fees – October", entryDate: "2026-10-20",
    lines: [{ code: "6030", debit: 96.18 }, { code: "1010", credit: 96.18 }] });
  console.log("journal fixtures posted");
} else console.log("journal fixtures already present, skipping");

// ── Customers & vendors ──────────────────────────────────────────────────────
async function ensureCustomer(number, name, email) {
  // Accounting's customer of record is crm_customers (every acct_* FK points there).
  let c = await one(`crm_customers?tenant_id=eq.${tenant}&email=eq.${encodeURIComponent(email)}&limit=1`);
  if (!c) {
    const isCompany = /\b(LLC|Inc|Collective|Events|Farms|Gifts)\b/.test(name);
    c = await insert("crm_customers", {
      tenant_id: tenant, customer_type: isCompany ? "Business" : "Retail",
      lifecycle_stage: "returning", lifecycle_status: "active",
      first_name: isCompany ? null : name.split(" ")[0],
      last_name: isCompany ? null : name.split(" ").slice(1).join(" ") || null,
      company_name: isCompany ? name : null, email, country: "US",
      customer_since: "2026-09-01", total_visits: 3, lifetime_value: 0, average_ticket: 0,
      no_show_rate: 0, cancellation_rate: 0, rebook_rate: 0, outstanding_balance: 0,
      total_spend_30d: 0, total_spend_365d: 0, marketing_email_opt_in: true,
      marketing_sms_opt_in: false, transactional_email_opt_in: true, transactional_sms_opt_in: false,
      do_not_call: false, do_not_contact: false, is_active: true,
    });
  }
  return c;
}
async function ensureVendor(number, name, email) {
  let v = await one(`acct_vendors?tenant_id=eq.${tenant}&vendor_number=eq.${number}&limit=1`);
  if (!v) v = await insert("acct_vendors", {
    tenant_id: tenant, vendor_number: number, legal_name: name, email, currency: "USD",
    payment_terms_days: 30, ap_account_id: acctByCode["2050"].id, is_1099_vendor: false, is_active: true, metadata: {},
  });
  return v;
}
const customers = [
  await ensureCustomer("CUS-2001", "Harper Lane Gifts LLC", "orders@harperlane.example"),
  await ensureCustomer("CUS-2002", "The Kinship Collective", "hello@kinshipcollective.example"),
  await ensureCustomer("CUS-2003", "Marisol Vega", "marisol.vega@example.com"),
  await ensureCustomer("CUS-2004", "Beaumont & Gray Events", "events@beaumontgray.example"),
  await ensureCustomer("CUS-2005", "Juniper Hollow Farms", "shop@juniperhollow.example"),
];
const vendors = [
  await ensureVendor("VND-3001", "Printful Inc.", "invoices@printful.example"),
  await ensureVendor("VND-3002", "Gelato ASA", "billing@gelato.example"),
  await ensureVendor("VND-3003", "Prodigi Print Ltd", "accounts@prodigi.example"),
  await ensureVendor("VND-3004", "Gooten Inc.", "ap@gooten.example"),
  await ensureVendor("VND-3005", "ParcelPath Logistics", "billing@parcelpath.example"),
];
console.log("customers + vendors ready");

// ── Bank accounts ────────────────────────────────────────────────────────────
async function ensureBank(name, glCode, type, inst, last4) {
  let b = await one(`acct_bank_accounts?tenant_id=eq.${tenant}&name=eq.${encodeURIComponent(name)}&limit=1`);
  if (!b) b = await insert("acct_bank_accounts", {
    tenant_id: tenant, entity_id: entityId, name, institution_name: inst, account_type: type,
    masked_account_number: last4, currency: "USD", gl_account_id: acctByCode[glCode].id,
    provider: type === "clearing" ? "stripe" : null, is_active: true, metadata: {},
  });
  return b;
}
const checking = await ensureBank("Operating Checking", "1000", "checking", "First Bank of Memphis", "••••6789");
const clearing = await ensureBank("Stripe Clearing", "1010", "clearing", "Stripe", "••••2210");
await ensureBank("Reserve Savings", "1020", "savings", "First Bank of Memphis", "••••9034");
console.log("bank accounts ready");

// ── Invoices + receipts + deposits ───────────────────────────────────────────
async function seedInvoice({ number, customer, date, due, status, lines, paidAmount = 0, deposit = 0 }) {
  const existing = await one(`acct_ar_invoices?tenant_id=eq.${tenant}&invoice_number=eq.${number}&limit=1`);
  if (existing) return existing;
  const subtotal = round2(lines.reduce((s, l) => s + l.qty * l.price, 0));
  const tax = round2(subtotal * 0.0825);
  const total = round2(subtotal + tax);
  const inv = await insert("acct_ar_invoices", {
    tenant_id: tenant, entity_id: entityId, customer_id: customer.id, invoice_number: number,
    invoice_date: date, due_date: due, currency: "USD", subtotal, tax_total: tax, discount_total: 0,
    total, amount_paid: paidAmount, amount_credited: 0, status, terms: "Net 30",
    notes: "Seeded storefront / wholesale order", sent_at: status === "draft" ? null : `${date}T12:00:00Z`,
    paid_at: status === "paid" ? `${due}T12:00:00Z` : null, deposit_paid: deposit,
  });
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    await insert("acct_ar_invoice_lines", {
      invoice_id: inv.id, line_no: i + 1, description: l.desc, quantity: l.qty, unit_price: l.price,
      discount_amount: 0, line_subtotal: round2(l.qty * l.price), tax_amount: round2(l.qty * l.price * 0.0825),
      revenue_account_id: acctByCode["4000"].id, tenant_id: tenant, dimensions: {},
    });
  }
  if (status !== "draft") {
    const jid = await postJournal({
      source: "invoice", sourceId: inv.id, memo: `Invoice ${number} issued`, entryDate: date,
      lines: [{ code: "1200", debit: total }, { code: "4000", credit: subtotal }, { code: "2100", credit: tax }],
    });
    await api(`acct_ar_invoices?id=eq.${inv.id}`, { method: "PATCH", body: JSON.stringify({ posted_journal_id: jid }) });
  }
  return inv;
}
const existingReceipts = await api("acct_ar_receipts?select=id&limit=1000");
let rctSeq = 3000 + (existingReceipts?.length || 0);
async function seedReceipt({ customer, date, amount, method, reference, processor, status = "posted", glBank = "1000" }) {
  const jid = await postJournal({
    source: "customer_receipt", memo: `Payment received – ${reference}`, entryDate: date,
    lines: [{ code: glBank, debit: amount }, { code: "1200", credit: amount }],
  });
  return insert("acct_ar_receipts", {
    tenant_id: tenant, entity_id: entityId, customer_id: customer?.id || null,
    receipt_number: `RCT-${++rctSeq}`, receipt_date: date, currency: "USD", amount,
    payment_method: method, status, deposit_account_id: glBank === "1010" ? clearing.id : checking.id,
    reference, processor: processor || null, posted_journal_id: jid,
  });
}
const already = await one(`acct_ar_invoices?tenant_id=eq.${tenant}&invoice_number=eq.INV-7001&limit=1`);
if (!already) {
  const i1 = await seedInvoice({ number: "INV-7001", customer: customers[0], date: "2026-10-02", due: "2026-10-16", status: "paid",
    lines: [{ desc: "Custom memorial canvas – 16x20", qty: 4, price: 84 }, { desc: "Keepsake ornament set", qty: 10, price: 19.5 }], paidAmount: 574.83 });
  await seedReceipt({ customer: customers[0], date: "2026-10-09", amount: 574.83, method: "card", reference: "INV-7001", processor: "stripe", glBank: "1010" });
  await seedInvoice({ number: "INV-7002", customer: customers[1], date: "2026-10-06", due: "2026-11-05", status: "partially_paid",
    lines: [{ desc: "Family-by-choice photo book – hardcover", qty: 12, price: 46 }], paidAmount: 200 });
  await seedReceipt({ customer: customers[1], date: "2026-10-10", amount: 200, method: "ach", reference: "INV-7002" });
  await seedInvoice({ number: "INV-7003", customer: customers[2], date: "2026-09-18", due: "2026-10-18", status: "sent",
    lines: [{ desc: "Personalized tumbler – 'Day One' engraving", qty: 2, price: 38.5 }, { desc: "Gift wrap + message insert", qty: 1, price: 6 }] });
  await seedInvoice({ number: "INV-7004", customer: customers[3], date: "2026-10-21", due: "2026-11-20", status: "sent",
    lines: [{ desc: "Event keepsake bundle – 40 guests", qty: 1, price: 890 }] });
  await seedInvoice({ number: "INV-7005", customer: customers[4], date: "2026-10-25", due: "2026-11-24", status: "draft",
    lines: [{ desc: "Harvest memory journal – lay flat", qty: 25, price: 24 }] });
  await seedInvoice({ number: "INV-7006", customer: customers[1], date: "2026-10-27", due: "2026-11-26", status: "draft",
    lines: [{ desc: "Kin Keeper Month tee – assorted", qty: 30, price: 27.5 }] });
  // Deposits: one held, one applied
  const depJournal = await postJournal({ source: "customer_receipt", memo: "Deposit collected for INV-7004", entryDate: "2026-10-21",
    lines: [{ code: "1000", debit: 250 }, { code: "2350", credit: 250 }] });
  await insert("acct_ar_receipts", {
    tenant_id: tenant, entity_id: entityId, customer_id: customers[3].id, receipt_number: `RCT-${++rctSeq}`,
    receipt_date: "2026-10-21", currency: "USD", amount: 250, payment_method: "card", status: "held",
    deposit_account_id: checking.id, reference: "DEPOSIT:unapplied", posted_journal_id: depJournal,
  });
  console.log("invoices, receipts, deposits seeded");
} else console.log("invoice fixtures already present, skipping");

// ── Bills + AP payments ──────────────────────────────────────────────────────
async function seedBill({ number, vendor, date, due, desc, amount, code, status, paidAmount = 0 }) {
  const existing = await one(`acct_ap_bills?tenant_id=eq.${tenant}&bill_number=eq.${number}&limit=1`);
  if (existing) return existing;
  const jid = await postJournal({ source: "vendor_bill", memo: `Bill ${number} – ${desc}`, entryDate: date,
    lines: [{ code, debit: amount }, { code: "2050", credit: amount }] });
  const bill = await insert("acct_ap_bills", {
    tenant_id: tenant, entity_id: entityId, vendor_id: vendor.id, bill_number: number, bill_date: date,
    due_date: due, currency: "USD", subtotal: amount, tax_total: 0, discount_total: 0, total: amount,
    amount_paid: paidAmount, amount_credited: 0, status, posted_journal_id: jid,
  });
  await insert("acct_ap_bill_lines", {
    bill_id: bill.id, line_no: 1, description: desc, quantity: 1, unit_cost: amount,
    line_subtotal: amount, tax_amount: 0, expense_account_id: acctByCode[code].id, tenant_id: tenant, dimensions: {},
  });
  if (paidAmount > 0) {
    const pj = await postJournal({ source: "vendor_payment", sourceId: bill.id, memo: `Payment on ${number}`, entryDate: due,
      lines: [{ code: "2050", debit: paidAmount }, { code: "1000", credit: paidAmount }] });
    await insert("acct_ap_payments", {
      tenant_id: tenant, entity_id: entityId, vendor_id: vendor.id, payment_number: `PAY-${number}`,
      payment_date: due, currency: "USD", amount: paidAmount, payment_method: "ach", status: "posted",
      cash_account_id: checking.id, reference: number, posted_journal_id: pj,
    });
  }
  return bill;
}
await seedBill({ number: "BILL-8001", vendor: vendors[0], date: "2026-10-05", due: "2026-10-19", desc: "Print production – canvas run #A221", amount: 1240.6, code: "5000", status: "paid", paidAmount: 1240.6 });
await seedBill({ number: "BILL-8002", vendor: vendors[1], date: "2026-10-11", due: "2026-11-10", desc: "Gelato photo books – October batch", amount: 862.25, code: "5000", status: "open" });
await seedBill({ number: "BILL-8003", vendor: vendors[4], date: "2026-10-14", due: "2026-10-28", desc: "Outbound freight – keepsakes restock", amount: 318.9, code: "5010", status: "partially_paid", paidAmount: 150 });
await seedBill({ number: "BILL-8004", vendor: vendors[2], date: "2026-10-22", due: "2026-11-21", desc: "Prodigi framed prints – wall art drop", amount: 1975, code: "5000", status: "open" });
await seedBill({ number: "BILL-8005", vendor: vendors[3], date: "2026-09-29", due: "2026-10-13", desc: "Gooten drinkware – tumblers", amount: 540.4, code: "5000", status: "paid", paidAmount: 540.4 });
console.log("bills + AP payments seeded");

// ── Bank transactions (some pre-matched to journal lines by amount) ─────────
const bankSeeds = [
  [checking.id, "2026-10-01", -1450, "Studio rent – October", "Landmark Property Group"],
  [checking.id, "2026-10-03", -212.4, "Software subscriptions", "SaaS bundle"],
  [checking.id, "2026-10-10", 200, "ACH receipt – Kinship Collective", "The Kinship Collective"],
  [checking.id, "2026-10-19", -1240.6, "ACH payment – Printful BILL-8001", "Printful Inc."],
  [checking.id, "2026-10-21", 250, "Card deposit – Beaumont & Gray", "Beaumont & Gray Events"],
  [checking.id, "2026-10-26", -89.99, "Bank service charges", "First Bank of Memphis"],
  [clearing.id, "2026-10-09", 574.83, "Stripe payout – INV-7001", "Stripe"],
  [clearing.id, "2026-10-12", -640, "Meta ads settlement", "Meta Platforms"],
  [clearing.id, "2026-10-20", -96.18, "Stripe processing fees", "Stripe"],
];
for (const [acct, date, amount, desc, payee] of bankSeeds) {
  const dupe = await one(`acct_bank_transactions?tenant_id=eq.${tenant}&bank_account_id=eq.${acct}&transaction_date=eq.${date}&amount=eq.${amount}&limit=1`);
  if (!dupe) await insert("acct_bank_transactions", {
    tenant_id: tenant, bank_account_id: acct, transaction_date: date, amount, currency: "USD",
    description: desc, payee, match_status: "unmatched",
  });
}
console.log("bank transactions seeded");

// ── Estimates, recurring, gift cards, refunds, disputes, taxes ───────────────
if (!(await one(`acct_estimates?tenant_id=eq.${tenant}&estimate_number=eq.EST-4001&limit=1`))) {
  const mk = async (number, customer, date, status, lines) => {
    const subtotal = round2(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0));
    return insert("acct_estimates", {
      tenant_id: tenant, entity_id: entityId, customer_id: customer.id, estimate_number: number,
      estimate_date: date, expiry_date: "2026-12-31", currency: "USD", subtotal,
      tax_total: round2(subtotal * 0.0825), discount_total: 0, total: round2(subtotal * 1.0825),
      status, terms: "Net 30", lines,
    });
  };
  await mk("EST-4001", customers[3], "2026-10-24", "sent", [{ description: "Wedding keepsake suite – 120 guests", quantity: 1, unit_price: 1650 }]);
  await mk("EST-4002", customers[4], "2026-10-26", "draft", [{ description: "Farm anniversary photo books", quantity: 15, unit_price: 42 }]);
  await mk("EST-4003", customers[0], "2026-10-15", "accepted", [{ description: "Holiday canvas restock", quantity: 20, unit_price: 74 }]);
}
if (!(await one(`acct_recurring_invoices?tenant_id=eq.${tenant}&template_number=eq.REC-5001&limit=1`))) {
  await insert("acct_recurring_invoices", {
    tenant_id: tenant, entity_id: entityId, customer_id: customers[1].id, template_number: "REC-5001",
    name: "Kinship monthly memory box", frequency: "monthly", next_run_date: "2026-11-06",
    currency: "USD", subtotal: 348, tax_total: 28.71, total: 376.71, status: "active", run_count: 2,
    lines: [{ description: "Monthly memory box – curated prints + prompts", quantity: 12, unit_price: 29 }],
  });
  await insert("acct_recurring_invoices", {
    tenant_id: tenant, entity_id: entityId, customer_id: customers[4].id, template_number: "REC-5002",
    name: "Juniper Hollow quarterly journal club", frequency: "quarterly", next_run_date: "2027-01-15",
    currency: "USD", subtotal: 600, tax_total: 49.5, total: 649.5, status: "paused", run_count: 1,
    lines: [{ description: "Quarterly lay-flat journal – farm edition", quantity: 25, unit_price: 24 }],
  });
}
if (!(await one(`acct_gift_cards?tenant_id=eq.${tenant}&code=eq.UNS-SEED-GIFT-0001&limit=1`))) {
  const cards = [
    ["UNS-SEED-GIFT-0001", "gift_card", 75, 75, "active", "gift@unsaid.example", "Holiday pre-sale"],
    ["UNS-SEED-GIFT-0002", "gift_card", 50, 20, "active", "aunt.ruth@example.com", "Family gift"],
    ["UNS-SEED-CRED-0001", "store_credit", 35, 35, "active", "marisol.vega@example.com", "Goodwill – late shipment"],
    ["UNS-SEED-GIFT-0003", "gift_card", 100, 0, "redeemed", "orders@harperlane.example", "Corporate gifting"],
  ];
  for (const [code, kind, init, bal, status, email, reason] of cards) {
    const card = await insert("acct_gift_cards", {
      tenant_id: tenant, entity_id: entityId, code, kind, status, initial_amount: init, balance: bal,
      currency: "USD", issued_to_email: email, issued_reason: reason,
      expires_at: kind === "gift_card" ? "2027-10-01" : null,
    });
    await insert("acct_gift_card_transactions", {
      tenant_id: tenant, gift_card_id: card.id, txn_type: "issue", amount: init, balance_after: init, notes: reason,
    });
    if (bal < init) await insert("acct_gift_card_transactions", {
      tenant_id: tenant, gift_card_id: card.id, txn_type: "redeem", amount: init - bal, balance_after: bal, notes: "Redeemed at checkout",
    });
  }
}
if (!(await one(`acct_refund_policies?tenant_id=eq.${tenant}&limit=1`))) {
  await insert("acct_refund_policies", {
    tenant_id: tenant, window_days: 30, restocking_fee_percent: 0,
    require_approval_above: 100, auto_approve_below: 25,
    notes: "Print-on-demand: misprints and damage always refund in full; change-of-mind within 30 days.",
  });
}
if (!(await one(`acct_refunds?tenant_id=eq.${tenant}&refund_number=eq.RFD-6001&limit=1`))) {
  const mkRefund = async (number, customer, amount, status, type, reason, orderRef) => insert("acct_refunds", {
    tenant_id: tenant, entity_id: entityId, refund_number: number, customer_id: customer.id,
    refund_type: type, reason, amount, currency: "USD", status, payment_method: "card",
    processor: "stripe", order_ref: orderRef,
    issued_at: status === "issued" ? new Date().toISOString() : null,
  });
  await mkRefund("RFD-6001", customers[2], 41.72, "issued", "refund", "Tumbler arrived cracked", "INV-7003");
  await mkRefund("RFD-6002", customers[0], 19.5, "requested", "refund", "Ornament color off-print", "INV-7001");
  await mkRefund("RFD-6003", customers[1], 120, "requested", "refund", "Event date moved – partial order cancel", "INV-7004");
  await mkRefund("RFD-6004", customers[4], 24, "rejected", "refund", "Change of mind after print started", "INV-7005");
}
if (!(await one(`acct_disputes?tenant_id=eq.${tenant}&dispute_number=eq.DSP-9001&limit=1`))) {
  await insert("acct_disputes", {
    tenant_id: tenant, entity_id: entityId, dispute_number: "DSP-9001", customer_id: customers[2].id,
    kind: "chargeback", reason: "product_not_received", amount: 89.72, currency: "USD",
    status: "open", processor: "stripe", processor_dispute_id: "dp_seed_9001", evidence_due_at: "2026-11-12",
  });
  await insert("acct_disputes", {
    tenant_id: tenant, entity_id: entityId, dispute_number: "DSP-9002", customer_id: customers[0].id,
    kind: "inquiry", reason: "unrecognized charge", amount: 574.83, currency: "USD",
    status: "evidence_submitted", processor: "stripe", processor_dispute_id: "dp_seed_9002",
    evidence_notes: "Invoice INV-7001 + delivery confirmation sent to issuer.",
  });
  await insert("acct_disputes", {
    tenant_id: tenant, entity_id: entityId, dispute_number: "DSP-9003", customer_id: customers[4].id,
    kind: "chargeback", reason: "fraudulent", amount: 64.98, currency: "USD", status: "won", processor: "stripe",
    processor_dispute_id: "dp_seed_9003", evidence_notes: "AVS + signed delivery proved legitimate.",
  });
}
if (!(await one(`acct_tax_rates?tenant_id=eq.${tenant}&limit=1`))) {
  const tn = await insert("acct_tax_rates", {
    tenant_id: tenant, name: "Tennessee Sales Tax", jurisdiction: "TN · Shelby County",
    rate_percent: 9.25, gl_account_id: acctByCode["2100"].id, is_active: true,
  });
  await insert("acct_tax_rates", {
    tenant_id: tenant, name: "Standard Nexus Rate (collected)", jurisdiction: "Multi-state nexus",
    rate_percent: 8.25, gl_account_id: acctByCode["2100"].id, is_active: true,
  });
  await insert("acct_tax_filings", {
    tenant_id: tenant, tax_rate_id: tn.id, period_label: "September 2026", period_start: "2026-09-01",
    period_end: "2026-09-30", taxable_sales: 4210.5, tax_collected: 389.47, tax_remitted: 389.47,
    status: "filed", filed_at: "2026-10-20T12:00:00Z", confirmation_ref: "TN-FDT-2026-09-8812",
  });
}
console.log("estimates, recurring, gift cards, refunds, disputes, taxes seeded");

// ── Finance login user (Supabase Auth) ───────────────────────────────────────
const password = "Unsaid!" + crypto.randomBytes(5).toString("hex") + "9";
const authRes = await fetch(`${URL_}/auth/v1/admin/users`, {
  method: "POST", headers: H,
  body: JSON.stringify({
    email: "finance@unsaidmemories.com", password, email_confirm: true,
    user_metadata: { role: "finance", module: "accounting", name: "UnSaid Finance" },
  }),
});
const authJson = await authRes.json();
let authUserId = authJson.id || null;
if (!authRes.ok && !String(authJson.msg || "").includes("already")) {
  console.log("AUTH USER CREATE ISSUE:", authRes.status, JSON.stringify(authJson).slice(0, 200));
} else {
  console.log("finance auth user ready");
}
if (!authUserId) {
  // User already existed — resolve its id so the portal row links correctly.
  const listRes = await fetch(`${URL_}/auth/v1/admin/users?per_page=200`, { headers: H });
  const listJson = await listRes.json().catch(() => ({}));
  const found = (listJson.users || []).find((u) => u.email === "finance@unsaidmemories.com");
  authUserId = found?.id || null;
}
// Best-effort portal_users registration (real shape: user_id / role_type / portal; non-fatal).
try {
  const dupe = await one(`portal_users?email=eq.finance@unsaidmemories.com&limit=1`);
  if (!dupe) {
    await insert("portal_users", {
      tenant_id: tenant, user_id: authUserId, role_type: "finance", portal: "admin",
      email: "finance@unsaidmemories.com", display_name: "UnSaid Finance", is_active: true,
      accepted_at: new Date().toISOString(),
    });
    console.log("portal_users row inserted");
  } else {
    console.log("portal_users row already present");
  }
} catch (e) {
  console.log("portal_users insert skipped:", String(e.message || e).slice(0, 160));
}
console.log("SEED COMPLETE");
console.log("FINANCE_USER_EMAIL=finance@unsaidmemories.com");
console.log("FINANCE_USER_PASSWORD=" + password);
