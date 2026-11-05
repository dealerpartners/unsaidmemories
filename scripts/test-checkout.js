// End-to-end checkout verification against a running dev server.
//   TEST_BASE (default http://localhost:3107), STRIPE_WEBHOOK_SECRET must
//   match the secret the dev server was booted with.
// Flow: login (cookie) → build cart via API (mixed suppliers + design line)
//   → cart detail shows the mixed-supplier notice → shipping estimates for
//   both supplier groups → POST /api/checkout → confirm the PaymentIntent
//   with Stripe's test card (pm_card_visa, sandbox) → fire a properly
//   SIGNED payment_intent.succeeded webhook → assert order paid, design
//   carried to order_items, fulfillment drafts per supplier, estimates
//   persisted → negative tests: bogus signature 400, unsigned 400.
const fs = require("fs");
const path = require("path");

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");

const BASE = process.env.TEST_BASE || "http://localhost:3107";
const EMAIL = "commerce-customer@unsaid.test";
const PASSWORD = process.env.SEED_CUSTOMER_PASSWORD || "UnsaidCommerce-Test-2026!";
const WHSEC = process.env.STRIPE_WEBHOOK_SECRET;
if (!WHSEC) { console.error("STRIPE_WEBHOOK_SECRET env required"); process.exit(1); }

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// Fetch HTTP client: stripe-node's default client bypasses the runtime's
// env-proxy routing and its direct TLS to api.stripe.com gets reset in this
// sandbox (EPROTO). The fetch client rides the platform fetch like the app.
const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  httpClient: Stripe.createFetchHttpClient(),
});

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
}

(async () => {
  // 1. Login → session cookie + user id.
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const login = await loginRes.json();
  check("login succeeds", loginRes.ok && login.success === true, `status ${loginRes.status}`);
  const cookies = (loginRes.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  check("session cookie set", cookies.includes("sb-") || cookies.length > 10);
  const customerId = login.user?.id;
  check("customer id returned", !!customerId);

  // 2. Fresh cart through the real API (abandon any seeded active cart first).
  await fetch(`${BASE}/api/cart?customer_id=${customerId}`, { method: "DELETE" });
  const { data: route } = await sb.from("variant_fulfillment_routes")
    .select("product_variant_id, supplier_id").eq("is_active", true).order("priority").limit(1).single();
  // Priced Gelato catalog variant by primary key. A filtered scan
  // (supplier_id + price_snapshot IS NOT NULL) over Gelato's 17,962 variants
  // times out under load — only 46 are priced — so the test uses a verified
  // priced row directly: Gelato, $39.48.
  const gelatoVariant = { id: "000211fc-465a-4621-aacd-97e3b5726a25" };
  const { data: pub } = await sb.from("design_publications")
    .select("id, product_variant_id").not("product_variant_id", "is", null).limit(1).single();

  async function addItem(body) {
    const r = await fetch(`${BASE}/api/cart/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: customerId, ...body }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`add item failed: ${j.error}`);
    return j;
  }
  await addItem({ product_variant_id: route.product_variant_id, quantity: 1 });
  await addItem({ supplier_catalog_variant_id: gelatoVariant.id, quantity: 1 });
  const added = await addItem({ product_variant_id: pub.product_variant_id, design_publication_id: pub.id, quantity: 1 });
  const cartId = added.cart_id;
  check("cart built via API", !!cartId);

  // 3. Cart detail: routing + mixed-supplier notice.
  const cartRes = await fetch(`${BASE}/api/cart?customer_id=${customerId}`);
  const cart = await cartRes.json();
  check("cart has 3 lines", (cart.detail?.lines?.length ?? 0) === 3, `${cart.detail?.lines?.length}`);
  check("mixed-supplier notice present", !!cart.detail?.mixed_supplier,
    cart.detail?.mixed_supplier?.title ?? "none");
  check("two supplier groups", (cart.detail?.supplier_groups?.length ?? 0) === 2);

  // 4. Shipping estimates for both groups.
  const estRes = await fetch(`${BASE}/api/shipping/estimates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lines: cart.detail.lines.map((l) => ({
        product_variant_id: l.product_variant_id,
        supplier_catalog_variant_id: l.supplier_catalog_variant_id,
        design_publication_id: l.design_publication_id,
        quantity: l.quantity,
        label: l.label,
      })),
      country: "US",
      postal_code: "38122",
    }),
  });
  const quote = await estRes.json();
  check("estimates return 2 groups", (quote.groups?.length ?? 0) === 2);
  check("every group has a method", (quote.groups ?? []).every((g) => g.methods.length > 0),
    (quote.groups ?? []).map((g) => `${g.supplier_name}:${g.methods.length}`).join(", "));
  check("cheapest total > 0", quote.cheapest_total > 0, `$${quote.cheapest_total}`);
  const selections = Object.fromEntries((quote.groups ?? []).map((g) => [g.supplier_id, g.methods[0].profile_id]));

  // 5. Checkout (authenticated) → order + PaymentIntent.
  const coRes = await fetch(`${BASE}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    body: JSON.stringify({
      cart_id: cartId,
      shipping_address: {
        name: "Commerce Customer", line1: "699 Waring Rd", city: "Memphis",
        state: "TN", postal_code: "38122", country: "US", email: EMAIL,
      },
      shipping_selections: selections,
    }),
  });
  const co = await coRes.json();
  check("checkout creates order", coRes.status === 201 && !!co.order_id, co.error ?? `order ${co.order_id}`);
  check("client_secret returned", !!co.client_secret);
  check("shipping charged", Number(co.shipping_total) > 0, `$${co.shipping_total}`);
  check("total = subtotal + shipping", Math.abs(co.total - (co.subtotal + co.shipping_total)) < 0.01);
  check("checkout flags mixed suppliers", !!co.mixed_supplier);

  // Unauthenticated checkout must be refused.
  const coAnon = await fetch(`${BASE}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cart_id: cartId, shipping_address: { line1: "x", city: "y", postal_code: "1" } }),
  });
  check("anonymous checkout refused (401)", coAnon.status === 401, `status ${coAnon.status}`);

  // 6. Confirm payment in Stripe sandbox with the test card.
  const { data: orderRow } = await sb.from("orders").select("stripe_payment_intent_id").eq("id", co.order_id).single();
  const pi = await stripe.paymentIntents.confirm(orderRow.stripe_payment_intent_id, {
    payment_method: "pm_card_visa",
    return_url: `${BASE}/checkout/success?order_id=${co.order_id}`,
  });
  check("payment intent succeeded (sandbox)", pi.status === "succeeded", pi.status);

  // 7. Signed webhook → paid + fulfillment + design carriage.
  const payload = JSON.stringify({
    id: `evt_test_${Date.now()}`,
    object: "event",
    type: "payment_intent.succeeded",
    data: { object: pi },
  });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WHSEC });
  const whRes = await fetch(`${BASE}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": header },
    body: payload,
  });
  const wh = await whRes.json();
  check("signed webhook accepted", whRes.ok, JSON.stringify(wh).slice(0, 200));
  check("fulfillment drafts = 2 suppliers", wh.fulfillment_drafts === 2, `${wh.fulfillment_drafts}`);

  const { data: orderAfter } = await sb.from("orders").select("status, total, shipping_cost").eq("id", co.order_id).single();
  check("order marked paid", orderAfter.status === "paid", orderAfter.status);
  const { data: itemsAfter } = await sb.from("order_items").select("*").eq("order_id", co.order_id);
  check("3 order items", (itemsAfter?.length ?? 0) === 3);
  const designItem = (itemsAfter ?? []).find((i) => i.design_publication_id);
  check("design_publication_id on order item", !!designItem);
  check("design_file_snapshot_url carried through", !!designItem?.design_file_snapshot_url,
    designItem?.design_file_snapshot_url ?? "null");
  check("every item has a supplier catalog variant after routing",
    (itemsAfter ?? []).every((i) => i.supplier_catalog_variant_id));
  const { data: fos } = await sb.from("fulfillment_orders").select("supplier_id, status, route_id").eq("order_id", co.order_id);
  check("fulfillment_orders rows = 2", (fos?.length ?? 0) === 2,
    (fos ?? []).map((f) => `${f.supplier_id.slice(0, 8)}:${f.status}:route=${f.route_id ? "yes" : "no"}`).join(", "));
  check("fulfillment rows are drafts", (fos ?? []).every((f) => f.status === "draft"));
  const { data: est } = await sb.from("order_shipping_estimates").select("selected").eq("order_id", co.order_id);
  check("shipping estimates persisted", (est?.length ?? 0) >= 2, `${est?.length} rows`);
  check("one selected estimate per supplier group", (est ?? []).filter((e) => e.selected).length === 2);

  // 8. Negative webhook tests: verification is mandatory.
  const bogus = await fetch(`${BASE}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": "t=1,v1=deadbeef" },
    body: payload,
  });
  check("bogus signature rejected (400)", bogus.status === 400, `status ${bogus.status}`);
  const unsigned = await fetch(`${BASE}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  });
  check("unsigned webhook rejected (400)", unsigned.status === 400, `status ${unsigned.status}`);

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
