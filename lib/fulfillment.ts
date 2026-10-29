// Adapter contract. Internal UUIDs in, supplier external IDs (TEXT) out.
// Ordering is NEVER triggered before Stripe payment succeeds (see api/webhooks/stripe).
// No adapter here places an order on import — createOrder runs only when called
// from the payment-confirmed fulfillment route.
export type FulfillmentAdapter = {
  supplierSlug: string;
  createOrder: (input: { recipient: Record<string, string>; variantExternalId: string; fileUrl: string; quantity: number }) => Promise<{ supplierOrderId: string; status: string }>;
};

function recipientName(r: Record<string, string>) {
  return r.name ?? [r.firstName, r.lastName].filter(Boolean).join(' ') ?? '';
}

export const printfulAdapter: FulfillmentAdapter = {
  supplierSlug: 'printful',
  async createOrder(input) {
    // Printful v2: POST /v2/orders with catalog_variant_id + placements/layers file url.
    // v2 responses are top-level `data`, not `result` (verified from live catalog pulls).
    const res = await fetch('https://api.printful.com/v2/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: input.recipient, items: [{ quantity: input.quantity, catalog_variant_id: Number(input.variantExternalId), source: 'catalog', placements: [{ placement: 'front', technique: 'dtg', layers: [{ type: 'file', url: input.fileUrl }] }] }] }),
    });
    if (!res.ok) throw new Error(`Printful order failed: ${res.status}`);
    const json: any = await res.json();
    return { supplierOrderId: String(json.data?.id ?? json.result?.id ?? ''), status: 'submitted' };
  },
};

export const gelatoAdapter: FulfillmentAdapter = {
  supplierSlug: 'gelato',
  async createOrder(input) {
    // Gelato Order API v4: POST https://order.gelatoapis.com/v4/orders, X-API-KEY.
    // orderType "order" starts production (vs a draft). Only call after payment.
    // variantExternalId is the Gelato productUid, e.g. cards_pf_5r_...
    const r = input.recipient;
    const res = await fetch('https://order.gelatoapis.com/v4/orders', {
      method: 'POST',
      headers: { 'X-API-KEY': process.env.GELATO_API_KEY ?? '', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderType: 'order',
        orderReferenceId: `unsaid-${Date.now()}`,
        currency: 'USD',
        items: [{ itemReferenceId: `item-${Date.now()}`, productUid: input.variantExternalId, files: [{ type: 'default', url: input.fileUrl }], quantity: input.quantity }],
        shippingAddress: {
          firstName: r.firstName ?? '', lastName: r.lastName ?? '', companyName: r.companyName ?? '',
          addressLine1: r.addressLine1 ?? r.line1 ?? '', addressLine2: r.addressLine2 ?? r.line2 ?? '',
          city: r.city ?? r.townOrCity ?? '', state: r.state ?? r.stateOrCounty ?? '',
          postCode: r.postCode ?? r.postalCode ?? r.postalOrZipCode ?? '', country: r.country ?? r.countryCode ?? 'US',
          email: r.email ?? '', phone: r.phone ?? '',
        },
      }),
    });
    if (!res.ok) throw new Error(`Gelato order failed: ${res.status} ${await res.text().then((t) => t.slice(0, 300))}`);
    const json: any = await res.json();
    return { supplierOrderId: String(json.id ?? json.orderId ?? ''), status: 'submitted' };
  },
};

export const prodigiAdapter: FulfillmentAdapter = {
  supplierSlug: 'prodigi',
  async createOrder(input) {
    // Prodigi v4.0: POST /v4.0/Orders, X-API-Key. sku = Prodigi SKU, assets printArea "default".
    const base = process.env.PRODIGI_API_URL ?? 'https://api.prodigi.com/v4.0';
    const r = input.recipient;
    const res = await fetch(`${base}/Orders`, {
      method: 'POST',
      headers: { 'X-API-Key': process.env.PRODIGI_API_KEY ?? '', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shippingMethod: 'Budget',
        recipient: {
          name: recipientName(r),
          email: r.email ?? '',
          address: {
            line1: r.addressLine1 ?? r.line1 ?? '', line2: r.addressLine2 ?? r.line2 ?? '',
            townOrCity: r.city ?? r.townOrCity ?? '', stateOrCounty: r.state ?? r.stateOrCounty ?? '',
            postalOrZipCode: r.postCode ?? r.postalCode ?? r.postalOrZipCode ?? '', countryCode: r.country ?? r.countryCode ?? 'US',
          },
        },
        items: [{ sku: input.variantExternalId, copies: input.quantity, sizing: 'fillPrintArea', assets: [{ printArea: 'default', url: input.fileUrl }] }],
      }),
    });
    if (!res.ok) throw new Error(`Prodigi order failed: ${res.status} ${await res.text().then((t) => t.slice(0, 300))}`);
    const json: any = await res.json();
    return { supplierOrderId: String(json.id ?? json.order?.id ?? ''), status: 'submitted' };
  },
};

export const gootenAdapter: FulfillmentAdapter = {
  supplierSlug: 'gooten',
  async createOrder(input) {
    // Gooten: POST https://api.print.io/api/orders?recipeId=<RecipeID>
    // Body uses PartnerBillingKey, SKU, and Images[].Url. RecipeID + billing key
    // come from env (GOOTEN_RECIPE_ID / GOOTEN_PARTNER_BILLING_KEY), never from code.
    const base = process.env.GOOTEN_BASE_URL ?? 'https://api.print.io';
    const recipeId = process.env.GOOTEN_RECIPE_ID ?? '';
    const r = input.recipient;
    const addr = {
      FirstName: r.firstName ?? '', LastName: r.lastName ?? '', Line1: r.addressLine1 ?? r.line1 ?? '',
      Line2: r.addressLine2 ?? r.line2 ?? '', City: r.city ?? '', State: r.state ?? '',
      CountryCode: r.country ?? r.countryCode ?? 'US', PostalCode: r.postCode ?? r.postalCode ?? '',
      Phone: r.phone ?? '', Email: r.email ?? '',
    };
    const res = await fetch(`${base}/api/orders?recipeId=${encodeURIComponent(recipeId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ShipToAddress: addr, BillingAddress: addr,
        Items: [{ SKU: input.variantExternalId, Quantity: input.quantity, Images: [{ Url: input.fileUrl, Index: 0 }], IsSample: false }],
        Payment: { CurrencyCode: 'USD', PartnerBillingKey: process.env.GOOTEN_PARTNER_BILLING_KEY ?? '' },
        IsPreSubmit: false, IsInTestMode: false,
      }),
    });
    if (!res.ok) throw new Error(`Gooten order failed: ${res.status} ${await res.text().then((t) => t.slice(0, 300))}`);
    const json: any = await res.json();
    return { supplierOrderId: String(json.Id ?? json.id ?? ''), status: 'submitted' };
  },
};

export const adapters: Record<string, FulfillmentAdapter> = {
  printful: printfulAdapter,
  gelato: gelatoAdapter,
  prodigi: prodigiAdapter,
  gooten: gootenAdapter,
};
// NOT wired as live order adapters, and deliberately so:
// - Printify: no token and no shop ID on file. Token is generated in the
//   browser at Printify Connections/API, then PRINTIFY_API_TOKEN + shop ID go in env.
// - Teemill: only a Public Safe Key + project name on file, no private order API key.
//   Teemill Pro API must be enabled in its dashboard first.
// - Apliiq: catalog-only until its upgraded-account API is paid for — no adapter, no fake order.
// - CJdropshipping / Syncee / DropCommerce / Spocket: Shopify-app / feed routes, no
//   direct order adapter in this app yet.
