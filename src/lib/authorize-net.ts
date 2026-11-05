import { createHmac, timingSafeEqual } from "crypto";
import { getIntegrationKey } from "@/lib/integrations/keys";

/**
 * Authorize.net — the store's card gateway (client direction
 * 2026-11-02: store payments move from Stripe to Authorize.net under
 * Almeta's own merchant account — processor Electronic Merchant
 * Systems / Kurv via PaymentCloud; Stripe stays for Connect banking
 * data). Keys live in Connections & Keys (integration_keys vault,
 * env fallback), entered by the owner — this module is plug-in
 * ready: with no keys saved, isAuthorizeNetConfigured() is false and
 * checkout keeps using Stripe.
 *
 * Checkout shape: Accept.js (the client's chosen flow). The card
 * form stays on the store's own checkout page; Accept.js — loaded
 * from the gateway with the account's Public Client Key — sends the
 * card straight from the customer's browser to Authorize.net and
 * returns an opaque payment nonce (card data never touches this
 * app). The server charges that nonce with createTransactionRequest
 * and marks the order paid itself on approval; the gateway webhook
 * remains as a backstop that heals anything it missed.
 */

export interface AuthorizeNetConfig {
  loginId: string;
  transactionKey: string;
  signatureKey: string;
  publicClientKey: string;
  sandbox: boolean;
  apiUrl: string;
  acceptJsUrl: string;
}

export async function getAuthorizeNetConfig(): Promise<AuthorizeNetConfig> {
  const [loginId, transactionKey, signatureKey, publicClientKey, environment] = await Promise.all([
    getIntegrationKey("AUTHORIZENET_API_LOGIN_ID"),
    getIntegrationKey("AUTHORIZENET_TRANSACTION_KEY"),
    getIntegrationKey("AUTHORIZENET_SIGNATURE_KEY"),
    getIntegrationKey("AUTHORIZENET_PUBLIC_CLIENT_KEY"),
    getIntegrationKey("AUTHORIZENET_ENVIRONMENT"),
  ]);
  const sandbox = String(environment || "").trim().toLowerCase() === "sandbox";
  return {
    loginId: loginId.trim(),
    transactionKey: transactionKey.trim(),
    signatureKey: signatureKey.trim(),
    publicClientKey: publicClientKey.trim(),
    sandbox,
    apiUrl: sandbox
      ? "https://apitest.authorize.net/xml/v1/request.api"
      : "https://api.authorize.net/xml/v1/request.api",
    acceptJsUrl: sandbox
      ? "https://jstest.authorize.net/v1/Accept.js"
      : "https://js.authorize.net/v1/Accept.js",
  };
}

export async function isAuthorizeNetConfigured(): Promise<boolean> {
  const cfg = await getAuthorizeNetConfig();
  // All three: the page needs the Login ID + Public Client Key to
  // tokenize the card; the server needs the Transaction Key to
  // charge the nonce. Missing any one = checkout stays on Stripe.
  return Boolean(cfg.loginId && cfg.transactionKey && cfg.publicClientKey);
}

/** The gateway caps invoiceNumber at 20 characters; the
 *  order's UUID is 32 hex digits. "UNS-" + the first 16 hex digits
 *  (20 chars) is the durable join: the webhook resolves the order by
 *  that prefix. 64 bits — a collision would need two orders sharing
 *  a 16-hex-digit UUID prefix, and the resolver also requires the
 *  amount to match. */
export function invoiceNumberForOrder(orderId: string): string {
  return "UNS-" + orderId.replace(/-/g, "").slice(0, 16);
}

export function orderHexPrefixFromInvoice(invoiceNumber: string): string | null {
  const m = /^UNS-([0-9a-f]{16})$/i.exec(String(invoiceNumber || "").trim());
  return m ? m[1].toLowerCase() : null;
}

async function anetRequest(cfg: AuthorizeNetConfig, requestName: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(cfg.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      [requestName]: {
        merchantAuthentication: { name: cfg.loginId, transactionKey: cfg.transactionKey },
        ...payload,
      },
    }),
  });
  // The gateway prefixes its JSON with a BOM.
  const text = (await res.text()).replace(/^﻿/, "");
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Authorize.net answered with a non-JSON response (HTTP ${res.status})`);
  }
  const messages = json?.messages;
  if (messages?.resultCode === "Error") {
    const detail = (messages.message || []).map((m: any) => m.text).filter(Boolean).join("; ");
    throw new Error(`Authorize.net: ${detail || "request failed"}`);
  }
  return json;
}

/** Validate credentials (Connections page Test button). */
export async function pingAuthorizeNet(cfg: AuthorizeNetConfig): Promise<void> {
  await anetRequest(cfg, "authenticateTestRequest", {});
}

export interface ChargeResult {
  transId: string;
  authCode: string | null;
  invoiceNumber: string;
}

/**
 * Charge an Accept.js payment nonce (authCapture). Throws with the
 * gateway's own words on a decline or error — the caller surfaces
 * them to the customer, who can retry with another card.
 */
export async function chargeWithNonce(args: {
  cfg: AuthorizeNetConfig;
  orderId: string;
  amount: number;
  dataDescriptor: string;
  dataValue: string;
  email: string;
  shipTo: { firstName: string; lastName: string; address: string; city: string; state: string; zip: string; country: string };
}): Promise<ChargeResult> {
  const { cfg } = args;
  const invoiceNumber = invoiceNumberForOrder(args.orderId);
  const json = await anetRequest(cfg, "createTransactionRequest", {
    refId: invoiceNumber,
    transactionRequest: {
      transactionType: "authCaptureTransaction",
      amount: args.amount.toFixed(2),
      payment: {
        opaqueData: { dataDescriptor: args.dataDescriptor, dataValue: args.dataValue },
      },
      order: { invoiceNumber, description: "UnSaid Memories order" },
      customer: { email: args.email },
      shipTo: args.shipTo,
    },
  });
  const txn = json?.transactionResponse;
  if (!txn || String(txn.responseCode) !== "1") {
    const detail =
      (txn?.errors || []).map((e: any) => e.errorText).filter(Boolean).join("; ") ||
      (txn?.messages || []).map((m: any) => m.description).filter(Boolean).join("; ") ||
      "the payment was declined";
    throw new Error(`Authorize.net: ${detail}`);
  }
  return { transId: String(txn.transId), authCode: txn.authCode ?? null, invoiceNumber };
}

/** The gateway's own record of a transaction — the fulfillment
 *  decision reads THIS (invoice + amount), never the webhook body
 *  alone. */
export async function getTransactionDetails(cfg: AuthorizeNetConfig, transId: string): Promise<{
  invoiceNumber: string | null;
  authAmount: number | null;
  status: string | null;
}> {
  const json = await anetRequest(cfg, "getTransactionDetailsRequest", { transId });
  const txn = json?.transaction;
  return {
    invoiceNumber: txn?.order?.invoiceNumber ?? null,
    authAmount: txn?.authAmount != null ? Number(txn.authAmount) : null,
    status: txn?.transactionStatus ?? null,
  };
}

/** Webhook signature: X-ANET-Signature is "sha512=" + the uppercase
 *  hex of HMAC-SHA512(raw body) keyed with the account's Signature
 *  Key. Constant-time compare; a missing/unsigned request fails. */
export function verifyAuthorizeNetSignature(rawBody: string, headerValue: string | null, signatureKey: string): boolean {
  if (!headerValue || !signatureKey) return false;
  const presented = headerValue.replace(/^sha512=/i, "").trim().toUpperCase();
  const computed = createHmac("sha512", signatureKey).update(rawBody, "utf8").digest("hex").toUpperCase();
  if (presented.length !== computed.length) return false;
  try {
    return timingSafeEqual(Buffer.from(presented, "utf8"), Buffer.from(computed, "utf8"));
  } catch {
    return false;
  }
}

/* ── Customer Information Manager (saved cards) ──────────────────
 * A saved card is a gateway-side profile: Accept.js tokenizes the
 * card in the browser as usual, and the server trades the nonce for
 * a permanent payment profile under a customer profile. Only the
 * gateway's profile ids ever persist on our side (cached with the
 * masked display fields in commerce_customer_payment_methods);
 * charging a saved card references the profile — no nonce, no card
 * data, ever. */

export interface SavedCardProfile {
  customerProfileId: string;
  paymentProfileId: string;
}

/** First saved card for a customer: create the customer profile with
 *  the nonce as its first payment profile. validationMode liveMode
 *  makes the gateway verify the card is real before it is stored. */
export async function createCustomerProfileFromNonce(args: {
  cfg: AuthorizeNetConfig;
  email: string;
  dataDescriptor: string;
  dataValue: string;
}): Promise<SavedCardProfile> {
  const json = await anetRequest(args.cfg, "createCustomerProfileRequest", {
    profile: {
      email: args.email,
      paymentProfiles: {
        payment: {
          opaqueData: { dataDescriptor: args.dataDescriptor, dataValue: args.dataValue },
        },
      },
    },
    validationMode: "liveMode",
  });
  const customerProfileId = String(json?.customerProfileId ?? "");
  const paymentProfileId = String((json?.customerPaymentProfileIdList ?? [])[0] ?? "");
  if (!customerProfileId || !paymentProfileId) {
    throw new Error("Authorize.net: the card could not be saved (no profile returned).");
  }
  return { customerProfileId, paymentProfileId };
}

/** Another saved card under an existing customer profile. */
export async function addPaymentProfileFromNonce(args: {
  cfg: AuthorizeNetConfig;
  customerProfileId: string;
  dataDescriptor: string;
  dataValue: string;
}): Promise<string> {
  const json = await anetRequest(args.cfg, "createCustomerPaymentProfileRequest", {
    customerProfileId: args.customerProfileId,
    paymentProfile: {
      payment: {
        opaqueData: { dataDescriptor: args.dataDescriptor, dataValue: args.dataValue },
      },
    },
    validationMode: "liveMode",
  });
  const paymentProfileId = String(json?.customerPaymentProfileId ?? "");
  if (!paymentProfileId) {
    throw new Error("Authorize.net: the card could not be saved (no profile returned).");
  }
  return paymentProfileId;
}

/** The gateway's masked view of one saved card (brand + last4). The
 *  expiration comes back masked from the gateway, so the expiry the
 *  customer typed is cached on our row at save time instead. */
export async function getSavedCardDisplay(args: {
  cfg: AuthorizeNetConfig;
  customerProfileId: string;
  paymentProfileId: string;
}): Promise<{ brand: string | null; last4: string | null }> {
  const json = await anetRequest(args.cfg, "getCustomerProfileRequest", {
    customerProfileId: args.customerProfileId,
  });
  const profiles = json?.profile?.paymentProfiles ?? [];
  const match = profiles.find(
    (p: any) => String(p?.customerPaymentProfileId ?? "") === args.paymentProfileId,
  );
  const card = match?.payment?.creditCard;
  const masked = String(card?.cardNumber ?? "");
  const digits = masked.replace(/\D/g, "");
  return {
    brand: card?.cardType ? String(card.cardType) : null,
    last4: digits.length >= 4 ? digits.slice(-4) : null,
  };
}

/** Remove a saved card at the gateway. */
export async function deleteSavedCard(args: {
  cfg: AuthorizeNetConfig;
  customerProfileId: string;
  paymentProfileId: string;
}): Promise<void> {
  await anetRequest(args.cfg, "deleteCustomerPaymentProfileRequest", {
    customerProfileId: args.customerProfileId,
    customerPaymentProfileId: args.paymentProfileId,
  });
}

/** Charge a saved card by its gateway profile (authCapture) — the
 *  profile twin of chargeWithNonce, same invoice discipline. */
export async function chargeSavedCard(args: {
  cfg: AuthorizeNetConfig;
  orderId: string;
  amount: number;
  customerProfileId: string;
  paymentProfileId: string;
  email: string;
  shipTo: { firstName: string; lastName: string; address: string; city: string; state: string; zip: string; country: string };
}): Promise<ChargeResult> {
  const { cfg } = args;
  const invoiceNumber = invoiceNumberForOrder(args.orderId);
  const json = await anetRequest(cfg, "createTransactionRequest", {
    refId: invoiceNumber,
    transactionRequest: {
      transactionType: "authCaptureTransaction",
      amount: args.amount.toFixed(2),
      profile: {
        customerProfileId: args.customerProfileId,
        paymentProfile: { paymentProfileId: args.paymentProfileId },
      },
      order: { invoiceNumber, description: "UnSaid Memories order" },
      customer: { email: args.email },
      shipTo: args.shipTo,
    },
  });
  const txn = json?.transactionResponse;
  if (!txn || String(txn.responseCode) !== "1") {
    const detail =
      (txn?.errors || []).map((e: any) => e.errorText).filter(Boolean).join("; ") ||
      (txn?.messages || []).map((m: any) => m.description).filter(Boolean).join("; ") ||
      "the payment was declined";
    throw new Error(`Authorize.net: ${detail}`);
  }
  return { transId: String(txn.transId), authCode: txn.authCode ?? null, invoiceNumber };
}
