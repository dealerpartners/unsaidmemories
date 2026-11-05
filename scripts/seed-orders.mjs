// Seed script — Orders module (Unsaid).
// Creates the operations login user + the operational data every Orders page
// renders: warehouse + bins, vendors, ERP orders across the lifecycle with
// lines/addresses/history, fulfillments, a shipment, inventory balances +
// replenishment rules + movements, RMAs, purchase-order bills, and one
// storefront order wired for the Printful push path (route + design snapshot).
//
// Credentials: extracted at runtime from UNSAID_CREDS.md (fallback: the
// worktree .env). Values are NEVER printed — only set/missing and counts.
// Idempotent: every record is checked by its natural key before insert.

import fs from "fs";

function credsFromFile() {
  const out = {};
  try {
    const t = fs.readFileSync("/home/hatch/workspace/user/files/UNSAID_CREDS.md", "utf8").replace(/\\_/g, "_");
    for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
      const m = t.match(new RegExp(key + "\\s*[:=]\\s*(\\S+)"));
      if (m) out[key] = m[1].replace(/[`"']/g, "");
    }
  } catch { /* fall through */ }
  if (!out.SUPABASE_URL || !out.SUPABASE_SERVICE_ROLE_KEY) {
    const env = Object.fromEntries(fs.readFileSync(new URL("../.env", import.meta.url), "utf8")
      .split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
    out.SUPABASE_URL = out.SUPABASE_URL || env.SUPABASE_URL;
    out.SUPABASE_SERVICE_ROLE_KEY = out.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  }
  return out;
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = credsFromFile();
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const TENANT = "652fd2be-d19a-4778-835d-db38094d7718";
const H = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

async function rest(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { ...H, ...(opts.method === "POST" ? { Prefer: "return=representation" } : {}) }, ...opts });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* empty */ }
  if (!res.ok) throw new Error(`${opts.method || "GET"} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return json;
}
const get = (p) => rest(p);
const post = (table, body) => rest(table, { method: "POST", body: JSON.stringify(body) });
async function postOne(table, body) { const rows = await post(table, body); return rows[0]; }
async function findOne(table, query) { const rows = await get(`${table}?${query}&limit=1`); return rows?.[0] || null; }

// The ops user's password is NEVER stored in source — pass it at runtime:
//   SEED_OPS_PASSWORD='…' node scripts/seed-orders.mjs
const OPS_EMAIL = "orders.ops@unsaidmemories.com";
if (!process.env.SEED_OPS_PASSWORD) { console.error("Missing SEED_OPS_PASSWORD env (the ops login password is passed at runtime, never committed)"); process.exit(1); }
const OPS_PASSWORD = process.env.SEED_OPS_PASSWORD;
const log = (...a) => console.log("[seed-orders]", ...a);

async function ensureOpsUser() {
  // Create (or find) the Supabase Auth user.
  let userId = null;
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST", headers: H,
    body: JSON.stringify({ email: OPS_EMAIL, password: OPS_PASSWORD, email_confirm: true, user_metadata: { role: "operations", module: "orders" } }),
  });
  const created = await createRes.json().catch(() => null);
  if (createRes.ok && created?.id) { userId = created.id; log("auth user created"); }
  else {
    const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, { headers: H });
    const list = await listRes.json().catch(() => ({}));
    const found = (list.users || []).find((u) => u.email === OPS_EMAIL);
    if (!found) throw new Error("could not create or find the ops auth user");
    userId = found.id; log("auth user already exists");
  }
  let pu = await findOne("portal_users", `user_id=eq.${userId}&portal=eq.admin`);
  if (!pu) {
    pu = await postOne("portal_users", {
      tenant_id: TENANT, user_id: userId, role_type: "operations_manager", portal: "admin",
      display_name: "Orders Operations", email: OPS_EMAIL, is_active: true,
    });
    log("portal_users row created");
  }
  // platform_admins.user_id FKs to portal_users.id (not the auth user id).
  const pa = await findOne("platform_admins", `user_id=eq.${pu.id}`);
  if (!pa) { await post("platform_admins", { user_id: pu.id, tenant_id: TENANT, reason: "Orders module operations lead (seed)" }); log("platform_admins grant added"); }
  for (const module_code of ["orders", "inventory", "products_services", "purchasing", "shipping"]) {
    const existing = await findOne("platform_module_permissions", `staff_id=eq.${pu.id}&module_code=eq.${module_code}`);
    if (!existing) {
      await post("platform_module_permissions", { tenant_id: TENANT, staff_id: pu.id, module_code, access_level: "full" })
        .catch((e) => log(`module permission ${module_code} skipped: ${e.message.slice(0, 120)}`));
    }
  }
  return userId;
}

async function main() {
  const actorId = await ensureOpsUser();

  // Warehouse + bins
  let wh = await findOne("erp_warehouses", `code=eq.MEM-WH-01`);
  if (!wh) {
    wh = await postOne("erp_warehouses", {
      tenant_id: TENANT, code: "MEM-WH-01", name: "Memphis Fulfillment Center", warehouse_type: "fulfillment",
      address_line1: "699 Waring Rd", city: "Memphis", state: "TN", postal_code: "38122", country_code: "US", timezone: "America/Chicago", is_active: true,
    });
    log("warehouse created");
  }
  for (const [code, name, bin] of [["A1", "Apparel Aisle 1", "B01"], ["A1", "Apparel Aisle 1", "B02"], ["B2", "Drinkware Aisle 2", "C01"]]) {
    const exists = await findOne("erp_warehouse_locations", `warehouse_id=eq.${wh.id}&code=eq.${code}-${bin}`);
    if (!exists) await post("erp_warehouse_locations", {
      tenant_id: TENANT, warehouse_id: wh.id, code: `${code}-${bin}`, name: `${name} · Bin ${bin}`,
      location_type: "bin", bin, is_pickable: true, is_active: true,
    });
  }

  // AP control account (acct_vendors.ap_account_id is NOT NULL in this schema)
  let apAccount = await findOne("acct_chart_of_accounts", `name=eq.${encodeURIComponent("Accounts Payable")}`);
  if (!apAccount) {
    const cash = await findOne("acct_chart_of_accounts", "code=eq.1000");
    apAccount = await postOne("acct_chart_of_accounts", {
      tenant_id: TENANT, entity_id: cash.entity_id, code: "2050", name: "Accounts Payable",
      account_type: "liability", normal_balance: "credit", subtype: "accounts_payable", currency: "USD",
      is_control_account: true, is_reconcilable: true, is_posting_allowed: false, is_system: true, is_active: true, metadata: {},
    });
    log("AP account created (2050)");
  }

  // Vendors
  const vendors = {};
  for (const [key, legal, email] of [
    ["blank", "Blank Apparel Co", "orders@blankapparel.example"],
    ["print", "Memphis Print Supply", "supply@memphisprint.example"],
  ]) {
    let v = await findOne("acct_vendors", `legal_name=eq.${encodeURIComponent(legal)}`);
    if (!v) v = await postOne("acct_vendors", {
      tenant_id: TENANT, legal_name: legal, email, currency: "USD", payment_terms_days: 30, external_vendor_id: `V-${key.toUpperCase()}-001`, ap_account_id: apAccount.id,
      is_active: true, vendor_number: `V-${key.toUpperCase()}-001`, metadata: {},
    });
    vendors[key] = v;
  }
  log("vendors ready:", Object.keys(vendors).length);

  // Variants to build lines/balances from
  const variants = await get(`product_variants?tenant_id=eq.${TENANT}&is_active=eq.true&select=id,sku,size,color,price,products(name)&limit=8`);
  if (!variants?.length) throw new Error("no product_variants to seed against");
  const vname = (v) => `${v.products?.name || "Product"} — ${v.sku}${v.size ? ` / ${v.size}` : ""}${v.color ? ` / ${v.color}` : ""}`;

  // Printful push wiring: ensure a route for variants[0] via a Printful catalog variant with a numeric external id.
  const printful = await findOne("suppliers", "slug=eq.printful");
  let pushVariant = variants[0];
  let pushCatalogVariant = null;
  if (printful) {
    const catVars = await get(`supplier_catalog_variants?supplier_id=eq.${printful.id}&select=id,external_id,supplier_catalog_product_id&limit=200`);
    pushCatalogVariant = (catVars || []).find((cv) => /^\d+$/.test(String(cv.external_id))) || null;
    if (pushCatalogVariant) {
      const route = await findOne("variant_fulfillment_routes", `product_variant_id=eq.${pushVariant.id}&supplier_id=eq.${printful.id}`);
      if (!route) {
        await post("variant_fulfillment_routes", {
          tenant_id: TENANT, product_variant_id: pushVariant.id, supplier_id: printful.id,
          supplier_catalog_variant_id: pushCatalogVariant.id, priority: 1, region: "US", is_active: true,
        });
        log("printful fulfillment route created");
      }
    }
  }
  const catProduct = pushCatalogVariant
    ? await findOne("supplier_catalog_products", `id=eq.${pushCatalogVariant.supplier_catalog_product_id}`)
    : null;

  // Storefront order for the push path
  let storefrontOrder = await findOne("orders", `tenant_id=eq.${TENANT}&shipping_method=eq.Printful-seed`);
  if (!storefrontOrder) {
    storefrontOrder = await postOne("orders", {
      tenant_id: TENANT, status: "paid", total: Number(pushVariant.price || 24),
      shipping_address: { name: "Jordan Ellis", street1: "1486 Charles St", city: "Memphis", state: "TN", zip: "38141", country: "US" },
      shipping_method: "Printful-seed", shipping_cost: 4.99,
    });
    await post("order_items", {
      order_id: storefrontOrder.id, tenant_id: TENANT, product_variant_id: pushVariant.id,
      design_file_snapshot_url: catProduct?.image_url || null,
      quantity: 1, unit_price: Number(pushVariant.price || 24),
      supplier_catalog_variant_id: pushCatalogVariant?.id || null,
    });
    log("storefront push-order created");
  }

  // ERP orders across the lifecycle
  const specs = [
    { n: "UNS-SEED-1001", status: "pending", method: "ship", lines: [0, 1], email: "avery@example.com" },
    { n: "UNS-SEED-1002", status: "confirmed", method: "ship", lines: [1], email: "blair@example.com", rush: true },
    { n: "UNS-SEED-1003", status: "in_production", method: "ship", lines: [2, 3], email: "casey@example.com" },
    { n: "UNS-SEED-1004", status: "ready_to_ship", method: "ship", lines: [0], email: "devon@example.com" },
    { n: "UNS-SEED-1005", status: "shipped", method: "ship", lines: [3], email: "emerson@example.com" },
    { n: "UNS-SEED-1006", status: "delivered", method: "local_pickup", lines: [4], email: "finley@example.com" },
    { n: "UNS-SEED-1007", status: "confirmed", method: "ship", lines: [0], email: "jordan@example.com", source: storefrontOrder.id },
  ];
  const orders = {};
  for (const spec of specs) {
    let o = await findOne("erp_orders", `order_number=eq.${spec.n}`);
    if (!o) {
      const lineRows = spec.lines.map((i) => variants[i % variants.length]).map((v) => ({
        v, qty: 2, unit: Number(v.price || 20),
      }));
      const subtotal = lineRows.reduce((s, l) => s + l.qty * l.unit, 0);
      o = await postOne("erp_orders", {
        tenant_id: TENANT, order_number: spec.n, status: spec.status, fulfillment_method: spec.method,
        source_order_id: spec.source || null, customer_email: spec.email, is_rush: !!spec.rush,
        currency: "USD", subtotal, discount_total: 0, tax_total: Math.round(subtotal * 0.07 * 100) / 100,
        shipping_total: spec.method === "local_pickup" ? 0 : 6.99,
        total: 0, amount_paid: subtotal, amount_refunded: 0, balance_due: 0,
        created_by: actorId, order_date: new Date().toISOString(), metadata: {},
        sla_due_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      });
      const total = subtotal + Number(o.tax_total || 0) + Number(o.shipping_total || 0);
      await rest(`erp_orders?id=eq.${o.id}`, { method: "PATCH", body: JSON.stringify({ total, balance_due: Math.max(0, total - subtotal) }) });
      o.total = total;
      for (const l of lineRows) {
        await post("erp_order_lines", {
          tenant_id: TENANT, order_id: o.id, sku_id: l.v.id, description: vname(l.v),
          quantity: l.qty, unit_price: l.unit, discount_amount: 0, tax_amount: 0,
          line_total: l.qty * l.unit, status: spec.status === "delivered" ? "shipped" : "pending",
          quantity_shipped: spec.status === "shipped" || spec.status === "delivered" ? l.qty : 0,
          quantity_packed: ["ready_to_ship", "shipped", "delivered"].includes(spec.status) ? l.qty : 0,
          quantity_picked: ["ready_to_ship", "shipped", "delivered", "in_production"].includes(spec.status) ? l.qty : 0,
        });
      }
      await post("erp_order_addresses", {
        tenant_id: TENANT, order_id: o.id, address_type: "shipping", first_name: "Seed", last_name: "Customer",
        line1: "1486 Charles St", city: "Memphis", state: "TN", postal_code: "38141", country_code: "US",
      });
      await post("erp_order_status_history", { tenant_id: TENANT, order_id: o.id, from_status: null, to_status: "pending", reason: "Seed order created", changed_by: actorId });
      if (spec.status !== "pending") {
        await post("erp_order_status_history", { tenant_id: TENANT, order_id: o.id, from_status: "pending", to_status: spec.status, reason: "Seed lifecycle position", changed_by: actorId });
      }
      log("order seeded:", spec.n);
    }
    orders[spec.n] = o;
  }

  // Fulfillments + a shipment
  const fulfSpecs = [
    { n: "UNS-SEED-1003", fnum: "FUL-SEED-003", status: "released", method: "ship" },
    { n: "UNS-SEED-1004", fnum: "FUL-SEED-004", status: "packed", method: "ship" },
    { n: "UNS-SEED-1005", fnum: "FUL-SEED-005", status: "dispatched", method: "ship" },
    { n: "UNS-SEED-1006", fnum: "FUL-SEED-006", status: "completed", method: "local_pickup" },
  ];
  for (const fs2 of fulfSpecs) {
    let f = await findOne("erp_fulfillment_orders", `fulfillment_number=eq.${fs2.fnum}`);
    if (!f) {
      f = await postOne("erp_fulfillment_orders", {
        tenant_id: TENANT, fulfillment_number: fs2.fnum, order_id: orders[fs2.n].id, warehouse_id: wh.id,
        method: fs2.method, status: fs2.status, rush: fs2.n === "UNS-SEED-1002", created_by: actorId,
        ...(fs2.status === "dispatched" || fs2.status === "completed" ? { dispatched_at: new Date().toISOString(), packed_at: new Date().toISOString() } : {}),
        ...(fs2.status === "completed" ? { completed_at: new Date().toISOString() } : {}),
      });
      log("fulfillment seeded:", fs2.fnum);
    }
    if (fs2.fnum === "FUL-SEED-005") {
      const ship = await findOne("erp_shipments", `fulfillment_id=eq.${f.id}`);
      if (!ship) await post("erp_shipments", {
        tenant_id: TENANT, shipment_number: "SHP-SEED-005", fulfillment_id: f.id, status: "shipped",
        tracking_number: "9400111899223856928499", tracking_url: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223856928499",
        shipped_at: new Date().toISOString(),
      });
    }
  }

  // Inventory balances + rules + movements (balances require a location_id)
  const whLocations = await get(`erp_warehouse_locations?warehouse_id=eq.${wh.id}&select=id&limit=1`);
  const defaultLocationId = whLocations?.[0]?.id || null;
  const stockPlan = [120, 85, 40, 3, 64, 22];
  for (let i = 0; i < Math.min(stockPlan.length, variants.length); i++) {
    const v = variants[i];
    let bal = await findOne("erp_inventory_balances", `sku_id=eq.${v.id}&warehouse_id=eq.${wh.id}`);
    if (!bal) {
      bal = await postOne("erp_inventory_balances", {
        tenant_id: TENANT, sku_id: v.id, warehouse_id: wh.id, location_id: defaultLocationId, inventory_status: "available",
        on_hand: stockPlan[i], reserved: i === 0 ? 4 : 0, allocated: 0, picked: 0, packed: 0, in_transit: 0,
        unit_cost: Math.round(Number(v.price || 20) * 0.55 * 100) / 100, bin_location: ["A1-B01", "A1-B02", "B2-C01"][i % 3],
      });
      await post("erp_inventory_movements", {
        tenant_id: TENANT, movement_type: "receipt", sku_id: v.id, warehouse_id: wh.id,
        quantity: stockPlan[i], unit_cost: bal.unit_cost, source_type: "seed", source_id: "seed-orders",
        reason: "Opening stock (seed)", performed_by: actorId, occurred_at: new Date().toISOString(), metadata: {},
      });
    }
    if (i < 3) {
      const rule = await findOne("erp_replenishment_rules", `sku_id=eq.${v.id}&warehouse_id=eq.${wh.id}`);
      if (!rule) await post("erp_replenishment_rules", {
        tenant_id: TENANT, sku_id: v.id, warehouse_id: wh.id, method: "min_max",
        reorder_point: 10, safety_stock: 5, maximum_stock: 100, economic_order_quantity: 50,
        lead_time_days: 5, review_period_days: 7, is_active: true,
      });
    }
  }
  log("inventory seeded");

  // Returns
  const rmaSpecs = [
    { rma: "RMA-SEED-001", order: "UNS-SEED-1006", status: "action_required", reason: "wrong_size", lineIdx: 4, qty: 1, refund: 24 },
    { rma: "RMA-SEED-002", order: "UNS-SEED-1005", status: "approved", reason: "damaged", lineIdx: 3, qty: 1, refund: 32 },
  ];
  for (const spec of rmaSpecs) {
    let r = await findOne("erp_return_authorizations", `rma_number=eq.${spec.rma}`);
    if (!r) {
      const orderLines = await get(`erp_order_lines?order_id=eq.${orders[spec.order].id}&select=id,sku_id&limit=1`);
      r = await postOne("erp_return_authorizations", {
        tenant_id: TENANT, rma_number: spec.rma, order_id: orders[spec.order].id, status: spec.status,
        reason_code: spec.reason, requested_at: new Date().toISOString(), created_by: actorId,
        notes: "Seeded RMA for journey verification",
        ...(spec.status === "approved" ? { approved_at: new Date().toISOString() } : {}),
      });
      if (orderLines?.[0]) await post("erp_return_lines", {
        tenant_id: TENANT, rma_id: r.id, order_line_id: orderLines[0].id, sku_id: orderLines[0].sku_id,
        quantity_requested: spec.qty, quantity_received: 0, quantity_approved: spec.status === "approved" ? spec.qty : 0,
        disposition: "pending_review", refund_amount: spec.refund,
      });
      log("rma seeded:", spec.rma);
    }
  }

  const cogsAccount = await findOne("acct_chart_of_accounts", "code=eq.5000");

  // Purchase-order bills
  const poSpecs = [
    { num: "PO-SEED-001", vendor: vendors.blank, status: "open", variantIdx: 0, qty: 50, cost: 8.5 },
    { num: "PO-SEED-002", vendor: vendors.print, status: "received", variantIdx: 1, qty: 25, cost: 11 },
  ];
  for (const spec of poSpecs) {
    let bill = await findOne("acct_ap_bills", `bill_number=eq.${spec.num}`);
    if (!bill) {
      const v = variants[spec.variantIdx % variants.length];
      bill = await postOne("acct_ap_bills", {
        tenant_id: TENANT, entity_id: apAccount.entity_id, vendor_id: spec.vendor.id, bill_number: spec.num, status: spec.status,
        subtotal: spec.qty * spec.cost, total: spec.qty * spec.cost, amount_paid: 0, currency: "USD",
        source_system: "purchase_order", created_by: actorId, bill_date: new Date().toISOString().slice(0, 10), due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      });
      await post("acct_ap_bill_lines", {
        tenant_id: TENANT, bill_id: bill.id, line_no: 1, description: vname(v), quantity: spec.qty,
        unit_cost: spec.cost, line_subtotal: spec.qty * spec.cost, item_ref: v.id, expense_account_id: cogsAccount?.id || null, dimensions: {},
      });
      log("po bill seeded:", spec.num);
    }
  }

  log("DONE. Ops user:", OPS_EMAIL);
}

main().catch((e) => { console.error("[seed-orders] FAILED:", e.message); process.exit(1); });
