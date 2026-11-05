// Seed for the Commerce module: a real customer who can sign in, a saved
// address, and an active cart that exercises the mixed-supplier path
// (one curated variant routed by variant_fulfillment_routes + one direct
// supplier catalog variant from a DIFFERENT supplier + a design line when
// a design publication exists).
// Credentials are read from ../.env at runtime and never printed. The seed
// customer's password is printed ONCE at the end so it can be recorded in
// the handoff — it is a throwaway test account, not a platform secret.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const TENANT = "652fd2be-d19a-4778-835d-db38094d7718";
const EMAIL = "commerce-customer@unsaid.test";
const PASSWORD = process.env.SEED_CUSTOMER_PASSWORD || `Unsaid-${crypto.randomBytes(6).toString("hex")}!26`;

async function findUserByEmail(email) {
  let page = 1;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
    page++;
  }
}

(async () => {
  // 1. Customer user (Supabase Auth).
  let user = await findUserByEmail(EMAIL);
  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Commerce Test Customer" },
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    user = data.user;
    console.log("created auth user:", user.id);
  } else {
    console.log("auth user already exists:", user.id);
    await sb.auth.admin.updateUserById(user.id, { password: PASSWORD, email_confirm: true });
  }

  // 2. Profile row (the account page + /api/customers/me read it).
  const { data: profile } = await sb.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (!profile) {
    const { error } = await sb.from("profiles").insert({
      id: user.id,
      display_name: "Commerce Test Customer",
      active_tenant_id: TENANT,
    });
    if (error) console.log("profile insert note:", error.message);
  }

  // 3. Saved address (checkout prefill + account page).
  const { data: addrs } = await sb.from("customer_addresses").select("id").eq("user_id", user.id).limit(1);
  if (!addrs?.length) {
    const { error } = await sb.from("customer_addresses").insert({
      user_id: user.id,
      label: "Home",
      first_name: "Commerce",
      last_name: "Customer",
      line1: "699 Waring Rd",
      city: "Memphis",
      state: "TN",
      postal_code: "38122",
      country_code: "US",
      phone: "901-555-0126",
      is_default: true,
    });
    console.log(error ? `address insert note: ${error.message}` : "saved default address");
  }

  // 4. Pick line A: curated variant with an active fulfillment route + price.
  const { data: routes } = await sb
    .from("variant_fulfillment_routes")
    .select("product_variant_id, supplier_id, supplier_catalog_variant_id, priority")
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .limit(50);
  if (!routes?.length) throw new Error("no active variant_fulfillment_routes to seed from");
  let lineA = null;
  for (const r of routes) {
    const { data: v } = await sb.from("product_variants").select("id, price").eq("id", r.product_variant_id).maybeSingle();
    if (v?.price != null) { lineA = { route: r, variant: v }; break; }
  }
  if (!lineA) throw new Error("no routed product variant with a price");

  // 5. Pick line B: direct supplier catalog variant from a DIFFERENT supplier.
  const { data: allSuppliers } = await sb.from("suppliers").select("id, name");
  let lineB = null;
  for (const s of allSuppliers ?? []) {
    if (s.id === lineA.route.supplier_id) continue;
    const { data: v } = await sb
      .from("supplier_catalog_variants")
      .select("id, price_snapshot, supplier_id")
      .eq("supplier_id", s.id)
      .not("price_snapshot", "is", null)
      .limit(1)
      .maybeSingle();
    if (v) { lineB = v; break; }
  }
  if (!lineB) throw new Error("no priced supplier catalog variant from a second supplier");

  // 6. Optional line C: a design publication (design carriage path).
  const { data: pubs } = await sb.from("design_publications").select("*").limit(5);
  let lineC = null;
  for (const p of pubs ?? []) {
    if (p.product_variant_id || p.supplier_catalog_variant_id) {
      lineC = p;
      break;
    }
  }

  // 7. Fresh active cart for the customer with those lines.
  await sb.from("carts").update({ status: "abandoned" }).eq("customer_id", user.id).eq("status", "active");
  const { data: cart, error: ce } = await sb.from("carts").insert({
    tenant_id: TENANT,
    customer_id: user.id,
    status: "active",
  }).select().single();
  if (ce) throw new Error(`cart: ${ce.message}`);

  const items = [
    {
      cart_id: cart.id,
      tenant_id: TENANT,
      product_variant_id: lineA.variant.id,
      quantity: 1,
      unit_price: Number(lineA.variant.price),
    },
    {
      cart_id: cart.id,
      tenant_id: TENANT,
      supplier_catalog_variant_id: lineB.id,
      quantity: 2,
      unit_price: Number(lineB.price_snapshot),
    },
  ];
  if (lineC) {
    let cPrice = Number(lineA.variant.price);
    if (lineC.product_variant_id) {
      const { data: cv } = await sb.from("product_variants").select("price").eq("id", lineC.product_variant_id).maybeSingle();
      if (cv?.price != null) cPrice = Number(cv.price);
    }
    items.push({
      cart_id: cart.id,
      tenant_id: TENANT,
      product_variant_id: lineC.product_variant_id ?? null,
      supplier_catalog_variant_id: lineC.supplier_catalog_variant_id ?? null,
      design_publication_id: lineC.id,
      quantity: 1,
      unit_price: cPrice,
    });
  }
  const { error: ie } = await sb.from("cart_items").insert(items);
  if (ie) throw new Error(`cart_items: ${ie.message}`);

  console.log(JSON.stringify({
    seeded: true,
    customer_email: EMAIL,
    customer_id: user.id,
    cart_id: cart.id,
    line_a: { product_variant_id: lineA.variant.id, routed_supplier_id: lineA.route.supplier_id },
    line_b: { supplier_catalog_variant_id: lineB.id, supplier_id: lineB.supplier_id },
    line_c_design_publication_id: lineC?.id ?? null,
    mixed_supplier_cart: true,
  }, null, 1));
  console.log("SEED_CUSTOMER_PASSWORD (record in handoff only):", PASSWORD);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
