// ---------------------------------------------------------------------------
// Shipping settings — admin-configurable carrier credentials + default provider.
// Source of truth: the app_settings key/value table (shipping.* keys), with
// environment variables as fallback. Cached 5 min (SWR-style, same pattern as
// lib/app-settings.ts). Admin edits via /api/admin/settings/shipping invalidate
// the cache so changes take effect without a deploy.
//
// Keys:
//   shipping.label_provider    — "shippo" | "usps" (default carrier for labels)
//   shipping.shippo_api_key    — Shippo live/test API key
//   shipping.shippo_test_mode  — "true" | "false"
//   shipping.usps_consumer_key    — USPS OAuth2 consumer key
//   shipping.usps_consumer_secret — USPS OAuth2 consumer secret
//   shipping.usps_crid         — USPS customer registration ID (CRID)
//   shipping.usps_mailer_id    — USPS mailer ID (MID)
//   shipping.usps_eps_account  — USPS EPS payment account number
// ---------------------------------------------------------------------------

import { pgQuery } from "@/lib/pg"
import { cached, invalidate } from "@/lib/cache"

export type LabelProvider = "shippo" | "usps"

export type ShippingSettings = {
  defaultProvider: LabelProvider
  shippoApiKey: string
  shippoTestMode: boolean
  uspsConsumerKey: string | null
  uspsConsumerSecret: string | null
  uspsCrid: string | null
  uspsMailerId: string | null
  uspsEpsAccount: string | null
}

const SETTINGS_TTL_MS = 5 * 60 * 1000

const KEYS = [
  "shipping.label_provider",
  "shipping.shippo_api_key",
  "shipping.shippo_test_mode",
  "shipping.usps_consumer_key",
  "shipping.usps_consumer_secret",
  "shipping.usps_crid",
  "shipping.usps_mailer_id",
  "shipping.usps_eps_account",
] as const

function str(v: unknown): string | null {
  if (v == null) return null
  const s = typeof v === "string" ? v : String(v)
  const t = s.trim()
  return t ? t : null
}

/** Admin-configurable shipping credentials. DB (app_settings) wins, env is fallback. */
export async function getShippingSettings(): Promise<ShippingSettings> {
  return cached("shipping:settings", SETTINGS_TTL_MS, async () => {
    const byKey = new Map<string, unknown>()
    try {
      const rows = await pgQuery<{ key: string; value: unknown }>(
        `SELECT key, value FROM app_settings WHERE key = ANY($1::text[])`,
        [KEYS as unknown as string[]],
      )
      for (const r of rows) byKey.set(r.key, r.value)
    } catch {
      // DB unreachable — env fallbacks below still apply.
    }

    const provider = str(byKey.get("shipping.label_provider"))?.toLowerCase()
    const shippoKey =
      str(byKey.get("shipping.shippo_api_key")) ||
      process.env.SHIPPO_API_KEY ||
      process.env.SHIPPO_TEST_API ||
      ""
    // Shippo test tokens carry the shippo_test_ prefix regardless of source.
    const shippoTestMode =
      str(byKey.get("shipping.shippo_test_mode"))?.toLowerCase() === "true" ||
      shippoKey.startsWith("shippo_test_")

    return {
      defaultProvider: provider === "usps" ? "usps" : "shippo",
      shippoApiKey: shippoKey,
      shippoTestMode,
      uspsConsumerKey: str(byKey.get("shipping.usps_consumer_key")) || process.env.USPS_CONSUMER_KEY || null,
      uspsConsumerSecret:
        str(byKey.get("shipping.usps_consumer_secret")) || process.env.USPS_CONSUMER_SECRET || null,
      uspsCrid:
        str(byKey.get("shipping.usps_crid")) || process.env.USPS_CUSTOMER_REGISTRATION_ID || null,
      uspsMailerId:
        str(byKey.get("shipping.usps_mailer_id")) ||
        process.env.USPS_LABEL_MAILER_ID ||
        process.env.USPS_MASTER_MAILER_ID ||
        null,
      uspsEpsAccount:
        str(byKey.get("shipping.usps_eps_account")) ||
        process.env.USPS_EPS_PAYMENT_ACCOUNT_NUMBER ||
        null,
    }
  })
}

/** Call after an admin save so new credentials take effect immediately. */
export function invalidateShippingSettings(): void {
  invalidate("shipping:settings")
}

/** True when the direct-USPS path has everything needed for a REAL (paid) label. */
export function uspsCanBuyRealLabel(s: ShippingSettings): boolean {
  return Boolean(s.uspsConsumerKey && s.uspsConsumerSecret && s.uspsEpsAccount)
}
