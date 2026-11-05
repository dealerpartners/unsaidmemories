// Twilio SMS-to-support (Sunny, 2026-10-13: "add a Twilio integration
// just in case they want to do text to support" — built ready, honestly
// gated). Configuration follows the platform's integration pattern
// (app_settings wins, env is fallback — same shape as shipping):
//   per-tenant override:  twilio.<tenantId>.account_sid / .auth_token /
//                         .phone_number      in app_settings
//   platform default:     twilio.account_sid / .auth_token /
//                         .phone_number      in app_settings
//   env fallback:         TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
//                         TWILIO_PHONE_NUMBER
// Credentials are never hardcoded and never returned to clients. When
// nothing is configured, every leg reports not-configured — no fake
// sends, no placeholder success.

import crypto from "crypto"
import type { SupportTicket } from "./tickets"

export interface TwilioConfig {
  configured: boolean
  accountSid: string | null
  authToken: string | null
  fromNumber: string | null
  source: "tenant_settings" | "platform_settings" | "env" | null
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = (typeof v === "string" ? v : String(v)).trim()
  return s ? s : null
}

export async function getTwilioConfig(client: any, tenantId: string): Promise<TwilioConfig> {
  const keys = [
    `twilio.${tenantId}.account_sid`, `twilio.${tenantId}.auth_token`, `twilio.${tenantId}.phone_number`,
    "twilio.account_sid", "twilio.auth_token", "twilio.phone_number",
  ]
  const byKey = new Map<string, unknown>()
  try {
    const r = await client.query(`SELECT key, value FROM app_settings WHERE key = ANY($1::text[])`, [keys])
    for (const row of r.rows as any[]) byKey.set(row.key, row.value)
  } catch { /* settings unreadable — env fallback still applies */ }

  const pick = (suffix: string): { value: string | null; source: TwilioConfig["source"] } => {
    const t = str(byKey.get(`twilio.${tenantId}.${suffix}`))
    if (t) return { value: t, source: "tenant_settings" }
    const p = str(byKey.get(`twilio.${suffix}`))
    if (p) return { value: p, source: "platform_settings" }
    return { value: null, source: null }
  }

  const sid = pick("account_sid")
  const tok = pick("auth_token")
  const num = pick("phone_number")
  const accountSid = sid.value || process.env.TWILIO_ACCOUNT_SID || null
  const authToken = tok.value || process.env.TWILIO_AUTH_TOKEN || null
  const fromNumber = num.value || process.env.TWILIO_PHONE_NUMBER || null
  const source = sid.source || tok.source || num.source || (accountSid || authToken || fromNumber ? "env" : null)
  return {
    configured: !!(accountSid && authToken && fromNumber),
    accountSid, authToken, fromNumber, source,
  }
}

/** Digits-only phone key for matching (US numbers collapse to 10 digits). */
export function phoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null
  let d = String(raw).replace(/\D/g, "")
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1)
  return d.length >= 7 ? d : null
}

export async function sendSms(
  cfg: TwilioConfig, to: string, body: string,
  opts?: { statusCallback?: string },
): Promise<{ ok: boolean; sid?: string; status?: string; error?: string }> {
  if (!cfg.configured || !cfg.accountSid || !cfg.authToken || !cfg.fromNumber) {
    return { ok: false, error: "twilio_not_configured" }
  }
  try {
    const form = new URLSearchParams({ To: to, From: cfg.fromNumber, Body: body })
    // Delivery-status handling: when the caller supplies the platform's
    // status-callback URL, Twilio posts queued/sent/delivered/failed
    // transitions there (see /api/twilio/status).
    if (opts?.statusCallback) form.set("StatusCallback", opts.statusCallback)
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      },
    )
    const json: any = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, error: json?.message || `twilio_http_${res.status}` }
    return { ok: true, sid: json?.sid, status: json?.status }
  } catch (e: any) {
    return { ok: false, error: e?.message || "twilio_unreachable" }
  }
}

/** Read one message's live delivery status back from Twilio. */
export async function fetchSmsStatus(
  cfg: TwilioConfig, sid: string,
): Promise<{ ok: boolean; status?: string; errorCode?: string | null; errorMessage?: string | null; error?: string }> {
  if (!cfg.configured || !cfg.accountSid || !cfg.authToken) {
    return { ok: false, error: "twilio_not_configured" }
  }
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages/${encodeURIComponent(sid)}.json`,
      {
        headers: {
          Authorization: "Basic " + Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64"),
        },
      },
    )
    const json: any = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, error: json?.message || `twilio_http_${res.status}` }
    return {
      ok: true,
      status: json?.status,
      errorCode: json?.error_code != null ? String(json.error_code) : null,
      errorMessage: json?.error_message ?? null,
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || "twilio_unreachable" }
  }
}

/**
 * The outbound leg of a desk reply on an SMS-origin ticket: the reply
 * already landed in the ticket thread; this delivers it by text when
 * Twilio is configured and reports honestly when it isn't.
 */
export async function maybeSendSmsReply(
  client: any, ticket: SupportTicket, text: string,
): Promise<{ sent: boolean; reason?: string; sid?: string }> {
  const meta = ticket.metadata ?? {}
  if (meta.source !== "sms") return { sent: false, reason: "not_sms_ticket" }
  const phone = typeof meta.phone === "string" ? meta.phone : null
  if (!phone) return { sent: false, reason: "no_phone_on_ticket" }
  const cfg = await getTwilioConfig(client, ticket.tenantId)
  if (!cfg.configured) return { sent: false, reason: "twilio_not_configured" }
  const r = await sendSms(cfg, phone, `[${ticket.ticketRef}] ${text}`.slice(0, 1500))
  return r.ok ? { sent: true, sid: r.sid } : { sent: false, reason: r.error }
}

/** Twilio webhook signature validation (X-Twilio-Signature, HMAC-SHA1). */
export function verifyTwilioSignature(
  authToken: string, url: string, params: Record<string, string>, signature: string,
): boolean {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("")
  const expected = crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64")
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}
