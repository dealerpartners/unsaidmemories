/**
 * test-connection.ts — the Connect a Service wizard's Step 4 test
 * (wizard #3 in notes/wizard-catalog.md: "We test it").
 *
 * Discipline:
 *   • Keys resolve ONLY through getIntegrationKey() in
 *     lib/integrations/keys (Connections-vault first, env fallback) —
 *     the same resolution every live caller uses. No parallel key path.
 *   • Reads reuse existing server-side integration code where it
 *     exists: Printful goes through lib/suppliers/printful
 *     (printfulFetch, with its spacing + provider errors); Stripe,
 *     Gelato and Prodigi use the same base URLs and auth headers as
 *     lib/stripe and lib/fulfillment/dispatch; Resend uses the same
 *     api.resend.com base as lib/commerce/order-email.
 *   • A service with NO testable read wired returns status
 *     "untestable" and says so plainly — the caller shows what WAS
 *     verified (key stored, last four) and nothing more. Account
 *     names and counts are NEVER invented: every value in a proof
 *     line came out of the service's own response.
 *   • Secret values never leave this module: results carry last-four
 *     only, and error text is built from the provider's status and
 *     message (providers do not echo keys back).
 */

import { getIntegrationKey, listKeyStatuses } from "./keys";
import { INTEGRATION_SERVICES, type IntegrationService } from "./catalog";
import { getAuthorizeNetConfig, pingAuthorizeNet } from "@/lib/authorize-net";

export interface ConnectionTestResult {
  serviceId: string;
  serviceName: string;
  /** connected = a real read succeeded; failed = a read was attempted
   *  and the service refused/errored (or no key is saved); untestable
   *  = no read endpoint is wired for this service in the shop. */
  status: "connected" | "failed" | "untestable";
  /** The proof line, built ONLY from values the test returned, e.g.
   *  "Connected — Printful, account <name>, <N> products readable".
   *  Present only when status is "connected". */
  proofLine: string | null;
  /** Plain words: what the test did and what came back. */
  detail: string;
  /** Plain words: what to fix. Present on failure. */
  fix: string | null;
  /** What was verified without a live read — e.g. "Secret key stored
   *  here (ends in ab12)". Always last-four only. */
  verified: string[];
  testedAt: string;
}

const TIMEOUT = AbortSignal.timeout(20_000);

class TestFailure extends Error {}

/** Provider error → plain words + a fix, never the key. */
function failure(service: IntegrationService, err: unknown): { detail: string; fix: string } {
  const raw = err instanceof Error ? err.message : String(err);
  // Strip anything that looks like a credential, defensively: provider
  // messages should never contain one, but a proof surface is the
  // wrong place to find out.
  const msg = raw.replace(/Bearer\s+\S+/gi, "Bearer …").slice(0, 300);
  const statusMatch = msg.match(/\b(401|403|404|429|5\d\d)\b/);
  const code = statusMatch ? Number(statusMatch[1]) : null;
  if (code === 401 || code === 403) {
    return {
      detail: `${service.name} answered, but it did not accept the saved key (${msg}). That almost always means the key was copied incompletely, belongs to a different account, or has been replaced on ${service.name}'s website.`,
      fix: `Go back to Step 3 and paste the key again — copy it fresh from ${service.name} (Step 2 says exactly where it lives), with no spaces at the start or end. If you made a new key there, the old one stops working, so paste the newest one.`,
    };
  }
  if (code === 404) {
    return {
      detail: `${service.name} answered, but what the test asked for was not found (${msg}). An ID saved alongside the key may belong to a different account.`,
      fix: `Check the ID values on Step 3 against your ${service.name} account (Step 2 says where each one is shown), then test again.`,
    };
  }
  if (code === 429) {
    return {
      detail: `${service.name} is rate-limiting right now (${msg}) — the key itself may be fine.`,
      fix: "Wait a minute, then press “Test again”. If it keeps happening, check your plan limits on the service's own website.",
    };
  }
  if (code !== null && code >= 500) {
    return {
      detail: `${service.name}'s own service had a problem answering (${msg}). This is on their side, not your key.`,
      fix: "Wait a few minutes and press “Test again”. If it still fails, check the service's status page from its website.",
    };
  }
  if (/timed?\s?out|abort/i.test(msg)) {
    return {
      detail: `The test could not reach ${service.name} in time (${msg}).`,
      fix: "Press “Test again”. If it keeps happening, the service may be down — check its website.",
    };
  }
  return {
    detail: `The test did not pass: ${msg}`,
    fix: `Go back to Step 3, check the pasted value against your ${service.name} account (Step 2 says where it lives), and test again.`,
  };
}

/** fetch + JSON with the provider's own message surfaced on error. */
async function readJson(
  url: string,
  headers: Record<string, string>,
): Promise<any> {
  const res = await fetch(url, { headers, signal: TIMEOUT });
  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    const providerMsg =
      json?.error?.message || json?.message || json?.error || `HTTP ${res.status}`;
    throw new TestFailure(`${url.split("?")[0]}: ${providerMsg} (${res.status})`);
  }
  return json;
}

async function requireKey(service: IntegrationService, keyName: string, label: string): Promise<string> {
  const value = await getIntegrationKey(keyName);
  if (!value) {
    throw new TestFailure(
      `No ${label} is saved for ${service.name} yet — there is nothing to test with.`,
    );
  }
  return value;
}

/* ---- Per-service real reads ------------------------------------ */

async function testPrintful(svc: IntegrationService): Promise<{ proofLine: string; detail: string }> {
  const { printfulStoreInfo, printfulStoreProducts } = await import("@/lib/suppliers/printful");
  // The store reads THROW when the account has no store yet
  // (Printful answers GET /store with 404 "Page not found") — that
  // is precisely the state the account-level fallback below exists
  // for, so a throw must fall through to it, not fail the test.
  let store: any = null;
  let products: any = null;
  try {
    store = await printfulStoreInfo();
    products = await printfulStoreProducts();
  } catch {
    store = null;
    products = null;
  }
  const accountName: string | null =
    typeof store?.name === "string" && store.name.trim() ? store.name.trim() : null;
  const count: number | null = Array.isArray(products) ? products.length : null;
  if (!accountName && count === null) {
    // No store is readable — most often because the account has no store
    // yet or no Store ID is saved. Fall back to the account-level read
    // the key alone can prove (GET /stores) so a valid key still shows
    // an honest "connected", naming exactly what is missing.
    const key = await requireKey(svc, "PRINTFUL_API_KEY", "API key");
    const res = await fetch("https://api.printful.com/stores", {
      headers: { Authorization: "Bearer " + key },
      signal: TIMEOUT,
    }).catch(() => null);
    if (res && (res.status === 401 || res.status === 403)) {
      throw new TestFailure(
        "Printful rejected the saved key — it is not valid for this account. Paste the account's current API key in Step 3.",
      );
    }
    if (res && res.ok) {
      const json: any = await res.json().catch(() => null);
      const stores = Array.isArray(json?.result) ? json.result : null;
      if (stores) {
        return {
          proofLine: `Connected — ${svc.name} account verified (${stores.length} store${stores.length === 1 ? "" : "s"} on the account).`,
          detail:
            stores.length === 0
              ? "The test signed in to Printful with your saved key and Printful answered — the key works. The account has no store yet, so there are no store products to read; create a store in Printful and save its Store ID here to complete the connection."
              : "The test signed in to Printful with your saved key and Printful answered — the key works. Save the Store ID here so the shop reads that store's products.",
        };
      }
    }
    throw new TestFailure(
      "Printful answered, but its reply did not include the store name or the product list, so there is nothing honest to show as proof.",
    );
  }
  const parts = [`Connected — ${svc.name}`];
  if (accountName) parts.push(`account ${accountName}`);
  if (count !== null) parts.push(`${count} products readable`);
  return {
    proofLine: `${parts.join(", ")}.`,
    detail:
      `The test read your Printful store information and counted the products Printful can see in it` +
      (accountName ? ` — the store is called “${accountName}”` : "") +
      (count !== null ? `, with ${count} product(s) in the list it returned.` : "."),
  };
}

async function testStripe(svc: IntegrationService): Promise<{ proofLine: string; detail: string }> {
  const key = await requireKey(svc, "STRIPE_SECRET_KEY", "secret key");
  const headers = { Authorization: `Bearer ${key}` };
  const account: any = await readJson("https://api.stripe.com/v1/account", headers);
  const products: any = await readJson("https://api.stripe.com/v1/products?limit=100", headers);
  const accountName: string | null =
    account?.business_profile?.name || account?.email || account?.id || null;
  const list: any[] = Array.isArray(products?.data) ? products.data : [];
  const count = list.length;
  const atLeast = products?.has_more === true;
  const parts = [`Connected — ${svc.name}`];
  if (accountName) parts.push(`account ${accountName}`);
  parts.push(`${atLeast ? "at least " : ""}${count} products readable`);
  return {
    proofLine: `${parts.join(", ")}.`,
    detail:
      "The test read your Stripe account and your Stripe product list with the saved secret key." +
      (account?.charges_enabled === false
        ? " Note: Stripe says this account cannot take payments yet — finish the setup steps inside Stripe (identity and bank details) before selling."
        : ""),
  };
}

async function testGelato(svc: IntegrationService): Promise<{ proofLine: string; detail: string }> {
  const key = await requireKey(svc, "GELATO_API_KEY", "API key");
  // Same base + auth header as lib/fulfillment/dispatch's Gelato endpoint.
  const json: any = await readJson("https://order.gelatoapis.com/v3/orders?limit=1", {
    "X-API-KEY": key,
  });
  const orders: any[] | null = Array.isArray(json)
    ? json
    : Array.isArray(json?.orders)
      ? json.orders
      : Array.isArray(json?.data)
        ? json.data
        : null;
  if (!orders) {
    // The key was accepted (HTTP 200) but the shape held no list —
    // claim only that the read answered.
    return {
      proofLine: `Connected — ${svc.name}, your orders list answered the test read.`,
      detail: "The test asked Gelato for your orders list with the saved key, and Gelato answered without an error.",
    };
  }
  return {
    proofLine: `Connected — ${svc.name}, ${orders.length} order(s) readable in the first page of your orders list.`,
    detail: "The test read the first page of your Gelato orders list with the saved key — the same account your orders are sent to.",
  };
}

async function testProdigi(svc: IntegrationService): Promise<{ proofLine: string; detail: string }> {
  const key = await requireKey(svc, "PRODIGI_API_KEY", "API key");
  // Same base + auth header as lib/fulfillment/dispatch's Prodigi endpoint.
  const json: any = await readJson("https://api.prodigi.com/v4.0/Orders?top=1", {
    "X-API-Key": key,
  });
  if (json?.outcome && String(json.outcome).toLowerCase() !== "ok") {
    throw new TestFailure(`Prodigi answered with outcome “${json.outcome}”.`);
  }
  const orders: any[] | null = Array.isArray(json?.orders) ? json.orders : Array.isArray(json) ? json : null;
  if (!orders) {
    return {
      proofLine: `Connected — ${svc.name}, your orders list answered the test read.`,
      detail: "The test asked Prodigi for your orders with the saved key, and Prodigi answered without an error.",
    };
  }
  return {
    proofLine: `Connected — ${svc.name}, ${orders.length} order(s) readable in the first page of your orders list.`,
    detail: "The test read the first page of your Prodigi orders list with the saved key — the same account your orders are sent to.",
  };
}

async function testResend(svc: IntegrationService): Promise<{ proofLine: string; detail: string }> {
  const key = await requireKey(svc, "RESEND_API_KEY", "API key");
  const json: any = await readJson("https://api.resend.com/domains", {
    Authorization: `Bearer ${key}`,
  });
  const domains: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  const verifiedNames = domains
    .filter((d) => d?.status === "verified" && typeof d?.name === "string")
    .map((d) => d.name as string);
  return {
    proofLine: `Connected — ${svc.name}, ${domains.length} sending domain(s) readable${verifiedNames.length ? ` (${verifiedNames.join(", ")} verified)` : ""}.`,
    detail:
      "The test read the list of sending domains on your Resend account with the saved key." +
      (domains.length === 0
        ? " No domain is on the account yet — Resend cannot send the shop's emails until a domain is added and verified in Resend (that step is done on Resend's website, with whoever looks after the domain's settings)."
        : ""),
  };
}

async function testAlgolia(svc: IntegrationService): Promise<{ proofLine: string; detail: string }> {
  const appId = await requireKey(svc, "ALGOLIA_APP_ID", "Application ID");
  const writeKey = await getIntegrationKey("ALGOLIA_WRITE_API_KEY");
  const searchKey = await getIntegrationKey("ALGOLIA_SEARCH_API_KEY");
  const key = writeKey || searchKey;
  if (!key) throw new TestFailure("No Algolia API key is saved yet — there is nothing to test with.");
  const json: any = await readJson(`https://${appId}.algolia.net/1/indexes`, {
    "X-Algolia-Application-Id": appId,
    "X-Algolia-API-Key": key,
  });
  const items: any[] = Array.isArray(json?.items) ? json.items : [];
  const names = items.map((i) => i?.name).filter((n): n is string => typeof n === "string");
  return {
    proofLine: `Connected — ${svc.name}, ${items.length} search index(es) readable${names.length ? ` (${names.slice(0, 5).join(", ")}${names.length > 5 ? ", …" : ""})` : ""}.`,
    detail: `The test listed the search indexes on your Algolia application with the saved ${writeKey ? "admin/write" : "search"} key.`,
  };
}


async function testPrintify(svc: IntegrationService): Promise<{ proofLine: string; detail: string }> {
  const key = await requireKey(svc, "PRINTIFY_API_KEY", "API token");
  const shops = await readJson("https://api.printify.com/v1/shops.json", { Authorization: `Bearer ${key}` });
  const list = Array.isArray(shops) ? shops : [];
  const first = list[0]?.title ? String(list[0].title) : null;
  return {
    proofLine: `Connected — ${svc.name}, ${list.length} shop${list.length === 1 ? "" : "s"} readable${first ? ` (first: ${first})` : ""}.`,
    detail: "The test read your Printify shop list back with the saved token.",
  };
}

async function testVercel(svc: IntegrationService): Promise<{ proofLine: string; detail: string }> {
  const key = await requireKey(svc, "VERCEL_ACCESS_TOKEN", "access token");
  const me = await readJson("https://api.vercel.com/v9/user", { Authorization: `Bearer ${key}` });
  const who = me?.user?.username ?? me?.user?.name ?? null;
  return {
    proofLine: `Connected — ${svc.name}${who ? `, signed in as ${who}` : ""}.`,
    detail: "The test read your Vercel account identity back with the saved token.",
  };
}

async function testSupabase(svc: IntegrationService): Promise<{ proofLine: string; detail: string }> {
  const url = (await getIntegrationKey("SUPABASE_URL")) ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
  const key = await requireKey(svc, "SUPABASE_SERVICE_ROLE_KEY", "service role key");
  if (!url) throw new TestFailure("No Supabase project URL is set on the server.");
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: TIMEOUT });
  if (!res.ok) throw new TestFailure(`${url}: HTTP ${res.status}`);
  return {
    proofLine: `Connected — ${svc.name}, the database API answered at ${new URL(url).host}.`,
    detail: "The test asked the project's database API to answer with the server's service key, and it did.",
  };
}

async function testOpenAI(svc: IntegrationService): Promise<{ proofLine: string; detail: string }> {
  const key = await requireKey(svc, "OPENAI_API_KEY", "API key");
  const models = await readJson("https://api.openai.com/v1/models", { Authorization: `Bearer ${key}` });
  const n = Array.isArray(models?.data) ? models.data.length : 0;
  return {
    proofLine: `Connected — ${svc.name}, ${n} models readable.`,
    detail: "The test read your OpenAI model list back with the saved key.",
  };
}

async function testAnthropic(svc: IntegrationService): Promise<{ proofLine: string; detail: string }> {
  const key = await requireKey(svc, "ANTHROPIC_API_KEY", "API key");
  const models = await readJson("https://api.anthropic.com/v1/models", { "x-api-key": key, "anthropic-version": "2023-06-01" });
  const n = Array.isArray(models?.data) ? models.data.length : 0;
  return {
    proofLine: `Connected — ${svc.name}, ${n} models readable.`,
    detail: "The test read your Anthropic model list back with the saved key.",
  };
}

async function testGoogleAi(svc: IntegrationService): Promise<{ proofLine: string; detail: string }> {
  const key = await requireKey(svc, "GOOGLE_AI_API_KEY", "API key");
  const models = await readJson(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, {});
  const n = Array.isArray(models?.models) ? models.models.length : 0;
  return {
    proofLine: `Connected — ${svc.name}, ${n} models readable.`,
    detail: "The test read your Google AI model list back with the saved key.",
  };
}

async function testCj(svc: IntegrationService): Promise<{ proofLine: string; detail: string }> {
  const email = await requireKey(svc, "CJ_EMAIL", "account email");
  const apiKey = await requireKey(svc, "CJ_API_KEY", "API key");
  const res = await fetch("https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, apiKey }), signal: TIMEOUT,
  });
  const json: any = await res.json().catch(() => null);
  if (!res.ok || !json?.data?.accessToken) {
    throw new TestFailure(`CJ token exchange: ${json?.message ?? `HTTP ${res.status}`}`);
  }
  return {
    proofLine: `Connected — ${svc.name}, CJ issued an access token for ${email}.`,
    detail: "The test exchanged the saved email and API key for a CJ access token, exactly as the ordering flow does.",
  };
}

async function testPayload(svc: IntegrationService): Promise<{ proofLine: string; detail: string }> {
  const url = await requireKey(svc, "PAYLOAD_URL", "server URL");
  const base = url.replace(/\/$/, "");
  const res = await fetch(`${base}/admin`, { signal: TIMEOUT }).catch(() => null);
  if (!res || res.status >= 500) throw new TestFailure(`Payload did not answer at ${base} (${res?.status ?? "no response"}).`);
  return {
    proofLine: `Connected — ${svc.name} answered at ${new URL(base).host}.`,
    detail: "The test opened the Payload admin address and the CMS answered.",
  };
}

async function testShippo(svc: IntegrationService): Promise<{ proofLine: string; detail: string }> {
  const key = await requireKey(svc, "SHIPPO_API_KEY", "API key");
  const json: any = await readJson("https://api.goshippo.com/addresses/?limit=1", {
    Authorization: "ShippoToken " + key,
  });
  const count = typeof json?.count === "number" ? json.count : null;
  return {
    proofLine: `Connected — ${svc.name} answered for your account${count !== null ? ` (${count} saved address${count === 1 ? "" : "es"})` : ""}.`,
    detail: "The test read your Shippo account's saved addresses with your key, the same read the label flow starts from.",
  };
}

async function testWhatsApp(svc: IntegrationService): Promise<{ proofLine: string; detail: string }> {
  const token = await requireKey(svc, "WHATSAPP_ACCESS_TOKEN", "access token");
  const phoneId = await requireKey(svc, "WHATSAPP_PHONE_NUMBER_ID", "phone number ID");
  const json: any = await readJson(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}?fields=display_phone_number,verified_name`,
    { Authorization: "Bearer " + token },
  );
  const num = typeof json?.display_phone_number === "string" ? json.display_phone_number : null;
  const name = typeof json?.verified_name === "string" ? json.verified_name : null;
  return {
    proofLine: `Connected — WhatsApp number ${num ?? phoneId}${name ? ` (${name})` : ""} answered.`,
    detail: "The test read your WhatsApp business number's profile from Meta with your token — the number customers will see.",
  };
}

async function testLine(svc: IntegrationService): Promise<{ proofLine: string; detail: string }> {
  const token = await requireKey(svc, "LINE_CHANNEL_ACCESS_TOKEN", "channel access token");
  const json: any = await readJson("https://api.line.me/v2/bot/info", {
    Authorization: "Bearer " + token,
  });
  const name = typeof json?.displayName === "string" ? json.displayName : null;
  return {
    proofLine: `Connected — LINE account ${name ?? "your channel"} answered.`,
    detail: "The test read your LINE official account's profile with your channel token — the account customers will see.",
  };
}

async function testAuthorizeNet(svc: IntegrationService): Promise<{ proofLine: string; detail: string }> {
  await requireKey(svc, "AUTHORIZENET_API_LOGIN_ID", "API Login ID");
  await requireKey(svc, "AUTHORIZENET_TRANSACTION_KEY", "Transaction Key");
  const cfg = await getAuthorizeNetConfig();
  await pingAuthorizeNet(cfg);
  return {
    proofLine: `Connected — ${svc.name} accepted the saved API Login ID and Transaction Key${cfg.sandbox ? " (sandbox account)" : ""}.`,
    detail:
      "The test sent Authorize.net its credential-check request with the saved keys, and the gateway accepted them. " +
      "Checkout will use Authorize.net for card payments while these keys are saved.",
  };
}

async function testBrevo(svc: IntegrationService): Promise<{ proofLine: string; detail: string }> {
  const key = await requireKey(svc, "BREVO_API_KEY", "API key");
  // The store's Brevo key is send-scoped: Brevo authorizes it for
  // the sending resource and answers account reads with 403
  // ("api key is not authorized for resource"). The honest test
  // probes the resource the store actually uses — a deliberately
  // empty send request. Brevo's "sender is missing" validation
  // reply proves the key may send; nothing is sent by the test.
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({}),
    signal: TIMEOUT,
  });
  const json: any = await res.json().catch(() => null);
  if (res.status === 400 && json?.code === "missing_parameter") {
    return {
      proofLine: `Connected — ${svc.name} accepted the saved API key for sending.`,
      detail: "The test asked Brevo's sending service a question only an authorized key can answer (nothing was sent). Marketing mail — nudges and retargeting — sends through Brevo; transactional mail sends through Resend.",
    };
  }
  const providerMsg = json?.message || json?.error || `HTTP ${res.status}`;
  throw new TestFailure(`https://api.brevo.com/v3/smtp/email: ${providerMsg} (${res.status})`);
}

const TESTERS: Record<string, (svc: IntegrationService) => Promise<{ proofLine: string; detail: string }>> = {
  printful: testPrintful,
  stripe: testStripe,
  "authorize-net": testAuthorizeNet,
  gelato: testGelato,
  prodigi: testProdigi,
  resend: testResend,
  brevo: testBrevo,
  algolia: testAlgolia,
  printify: testPrintify,
  vercel: testVercel,
  supabase: testSupabase,
  openai: testOpenAI,
  anthropic: testAnthropic,
  "google-ai": testGoogleAi,
  "cj-dropshipping": testCj,
  payload: testPayload,
  shippo: testShippo,
  whatsapp: testWhatsApp,
  line: testLine,
};

/** Why a service has no live test — plain words, per service. Only
 *  services with no entry in TESTERS land here. */
function untestableReason(svc: IntegrationService): string {
  switch (svc.id) {
    case "ga4":
      return "A Measurement ID is not a key the shop can sign in with — it is just the label Google uses for your visitor counts, so there is no account read to test. Google Analytics itself picks the ID up on your store pages once it is saved.";
    case "posthog":
      return "A PostHog project key can only send visitor events in — it cannot read anything back, by PostHog's own design. The shop starts sending your store's visits to PostHog as soon as the key is saved; you see the results in PostHog itself.";
    case "metricool":
      return "Your Metricool token is kept here for safekeeping — the store does not call Metricool's service yet (its card says the same), so there is no read to test.";
    case "pollinations":
      return "The shop has no account-read call wired for Pollinations — the key is used when the Design Studio generates a picture, and that generation is the real proof it works.";
    case "codex":
      return "Codex signs in with OAuth rather than a key the shop can read back, so there is no account read to test — the credential is stored here for the developer workflow.";
    case "apliiq":
    case "dropcommerce":
    case "spocket":
    case "syncee":
      return `${svc.name}'s key is stored here first — the supplier sync that would read from it is not switched on yet (its card says the same), so there is no read to test today.`;
    case "vercel-ai-gateway":
      return "The shop has no account-read call wired for the AI Gateway — the key is used when the shopping assistant answers a customer, and that answer is the real proof it works.";
    default:
      return `${svc.name} has no test read wired in the shop yet — orders are sent to it when a customer buys, but the shop cannot yet ask it to read anything back. That is a gap in the shop, not a problem with your key.`;
  }
}

/** What can be verified without a live read: each field's stored state. */
async function verifiedLines(svc: IntegrationService): Promise<string[]> {
  const statuses = await listKeyStatuses();
  const byName = new Map(statuses.map((s) => [s.keyName, s]));
  const lines: string[] = [];
  for (const f of svc.fields) {
    const st = byName.get(f.keyName);
    if (st?.source) {
      lines.push(
        `${f.label}: ${st.source === "saved" ? "saved on the Connections page" : "set on the server"} (ends in ${st.lastFour ?? "••••"})`,
      );
    } else {
      lines.push(`${f.label}: nothing saved yet`);
    }
  }
  return lines;
}

export async function testConnection(serviceId: string): Promise<ConnectionTestResult> {
  const svc = INTEGRATION_SERVICES.find((s) => s.id === serviceId);
  if (!svc) {
    throw new Error(`Unknown service: ${serviceId}`);
  }
  const testedAt = new Date().toISOString();
  const verified = await verifiedLines(svc);
  const tester = TESTERS[svc.id];
  if (!tester) {
    return {
      serviceId: svc.id,
      serviceName: svc.name,
      status: "untestable",
      proofLine: null,
      detail: untestableReason(svc),
      fix: null,
      verified,
      testedAt,
    };
  }
  try {
    const { proofLine, detail } = await tester(svc);
    return {
      serviceId: svc.id,
      serviceName: svc.name,
      status: "connected",
      proofLine,
      detail,
      fix: null,
      verified,
      testedAt,
    };
  } catch (err) {
    if (err instanceof TestFailure && /nothing to test|No .* is saved/.test(err.message)) {
      return {
        serviceId: svc.id,
        serviceName: svc.name,
        status: "failed",
        proofLine: null,
        detail: err.message,
        fix: "Go back to Step 3 and paste the key first — the test runs with the key saved there.",
        verified,
        testedAt,
      };
    }
    // Printful's client surfaces its own errors ("Printful /store: …")
    // — same treatment: provider words, plain fix.
    const { detail, fix } = failure(svc, err);
    return {
      serviceId: svc.id,
      serviceName: svc.name,
      status: "failed",
      proofLine: null,
      detail,
      fix,
      verified,
      testedAt,
    };
  }
}
