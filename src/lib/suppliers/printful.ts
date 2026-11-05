// ---------------------------------------------------------------------------
// suppliers/printful.ts — Printful API client.
//
// Skeleton copied from UnSaid Memories src/lib/suppliers/cj.ts discipline:
//   • Env-gated config; every method throws PrintfulNotConfiguredError BEFORE
//     any network call when unconfigured — no fake success anywhere.
//   • 1 request/second spacing across the process.
//   • Errors surface the provider's own message; nothing is swallowed.
// Printful v1: Bearer API key, POST /orders creates a DRAFT (nothing is
// produced or charged until POST /orders/{id}/confirm). This client never
// confirms implicitly — confirmation is a separate explicit admin action.
// ---------------------------------------------------------------------------

export class PrintfulNotConfiguredError extends Error {
  constructor(public missing: string[]) {
    super(`Printful is not configured (missing: ${missing.join(", ")})`);
    this.name = "PrintfulNotConfiguredError";
  }
}

export function printfulConfig() {
  const apiKey = process.env.PRINTFUL_API_KEY || "";
  const base = (process.env.PRINTFUL_BASE_URL || "https://api.printful.com").replace(/\/$/, "");
  const storeId = process.env.PRINTFUL_STORE_ID || "";
  return { apiKey, base, storeId };
}

export function printfulMissingConfig(): string[] {
  const { apiKey } = printfulConfig();
  const missing: string[] = [];
  if (!apiKey) missing.push("PRINTFUL_API_KEY");
  return missing;
}

export function printfulConfigured(): boolean {
  return printfulMissingConfig().length === 0;
}

let lastCallAt = 0;
async function spaced() {
  const wait = Math.max(0, 1000 - (Date.now() - lastCallAt));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

async function printfulFetch(path: string, init: RequestInit = {}): Promise<any> {
  const { base, storeId: envStoreId } = printfulConfig();
  // Key resolution: Connections-page key wins, env is the fallback —
  // for the store id as well as the API key (account-level tokens
  // cannot place orders without X-PF-Store-Id).
  const { getIntegrationKey } = await import("@/lib/integrations/keys");
  const apiKey = await getIntegrationKey("PRINTFUL_API_KEY");
  const storeId = (await getIntegrationKey("PRINTFUL_STORE_ID")) || envStoreId;
  if (!apiKey) throw new PrintfulNotConfiguredError(["PRINTFUL_API_KEY"]);
  await spaced();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (storeId) headers["X-PF-Store-Id"] = storeId;
  // Hard timeout: a hung provider connection must fail the push fast and
  // be recorded as a failure, never hang the admin request indefinitely.
  const res = await fetch(`${base}${path}`, { ...init, headers, signal: init.signal || AbortSignal.timeout(30000) });
  const json = await res.json().catch(() => null);
  if (!res.ok || (json && typeof json.code === "number" && json.code >= 400)) {
    const msg = json?.error?.message || json?.result || `Printful HTTP ${res.status}`;
    throw new Error(`Printful ${path}: ${msg}`);
  }
  return json?.result ?? json;
}

export type PrintfulRecipient = {
  name: string; address1: string; city: string; state_code: string; zip: string; country_code: string; email?: string; phone?: string;
};

export type PrintfulOrderItem = {
  variant_id: number; quantity: number; files?: { url: string; type?: string }[]; retail_price?: string;
};

export async function printfulCreateDraftOrder(input: {
  externalId: string; recipient: PrintfulRecipient; items: PrintfulOrderItem[]; retailCosts?: { shipping?: string };
  packingSlip?: { email?: string; phone?: string; message?: string; logo_url?: string };
}): Promise<any> {
  return printfulFetch("/orders", {
    method: "POST",
    body: JSON.stringify({
      external_id: input.externalId,
      recipient: input.recipient,
      items: input.items,
      ...(input.retailCosts ? { retail_costs: input.retailCosts } : {}),
      ...(input.packingSlip ? { packing_slip: input.packingSlip } : {}),
    }),
  });
}

export async function printfulConfirmOrder(providerOrderId: string | number): Promise<any> {
  return printfulFetch(`/orders/${providerOrderId}/confirm`, { method: "POST" });
}

export async function printfulGetOrder(providerOrderId: string | number): Promise<any> {
  return printfulFetch(`/orders/${providerOrderId}`);
}

export async function printfulStoreInfo(): Promise<any> {
  return printfulFetch("/store");
}

/** The store's own sync products — the read the Connect wizard's
 *  Step 4 test counts ("<N> products readable"). Same printfulFetch
 *  path (vault-first key resolution, spacing, provider errors). */
export async function printfulStoreProducts(): Promise<any> {
  return printfulFetch("/store/products");
}
