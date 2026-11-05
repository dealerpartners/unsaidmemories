import "server-only"

// ============================================================================
// sms.ts — the platform SMS provider module (BL-10).
//
// ONE provider integration for every SMS consumer in the platform:
//   · CRM direct messages   (POST /api/admin/crm/customers/[id]/communications)
//   · CRM quick actions     (POST /api/admin/crm/actions — send_message)
//
// The provider is Twilio — the codebase's named provider: credentials
// resolve through lib/support/twilio (per-tenant app_settings → platform
// app_settings → env TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
// TWILIO_PHONE_NUMBER), the admin face is /admin/settings/twilio, and the
// support desk + telemedicine reminder legs already send through it.
//
// Discipline (Class C + the census's no-fake-send rule):
//   · Credentials come from settings/env only — never literals.
//   · sendSmsStrict THROWS a named SmsNotConfiguredError when no provider
//     is configured, and a named SmsSendError when the provider rejects
//     the send. A message is never silently dropped and never reported
//     sent when it wasn't.
//   · Every send is recorded in public.crm_messages with provider
//     'twilio', the provider message id, and a live delivery_status that
//     the /api/twilio/status webhook keeps current.
// ============================================================================

import { SITE_URL } from "@/lib/site-url"
import {
  getTwilioConfig,
  sendSms,
  fetchSmsStatus,
  type TwilioConfig,
} from "@/lib/support/twilio"

export class SmsNotConfiguredError extends Error {
  code = "sms_provider_not_configured"
  constructor() {
    super(
      "SMS provider is not configured — set the Twilio credentials " +
        "(Admin → Settings → Twilio, or the TWILIO_ACCOUNT_SID / " +
        "TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER environment variables).",
    )
    this.name = "SmsNotConfiguredError"
  }
}

export class SmsSendError extends Error {
  code = "sms_send_failed"
  constructor(reason: string) {
    super(`SMS could not be sent: ${reason}`)
    this.name = "SmsSendError"
  }
}

/** The URL Twilio posts delivery-status transitions to. */
export function smsStatusCallbackUrl(): string {
  return `${SITE_URL}/api/twilio/status`
}

export interface SmsSendResult {
  sid: string
  status: string | null
  from: string
  to: string
}

/**
 * Resolve the tenant's Twilio config or throw SmsNotConfiguredError.
 * `client` is any pg-style client ({ query }) — the same shape
 * lib/support/twilio resolves settings through.
 */
export async function requireSmsConfig(client: any, tenantId: string): Promise<TwilioConfig> {
  const cfg = await getTwilioConfig(client, tenantId)
  if (!cfg.configured) throw new SmsNotConfiguredError()
  return cfg
}

/**
 * Send one SMS through Twilio, with the delivery-status callback armed.
 * Throws SmsNotConfiguredError / SmsSendError — never returns a fake
 * success and never swallows a failure.
 */
export async function sendSmsStrict(
  client: any,
  tenantId: string,
  to: string,
  body: string,
): Promise<SmsSendResult> {
  const destination = String(to || "").trim()
  if (!destination) throw new SmsSendError("no destination phone number")
  const cfg = await requireSmsConfig(client, tenantId)
  const r = await sendSms(cfg, destination, body.slice(0, 1500), {
    statusCallback: smsStatusCallbackUrl(),
  })
  if (!r.ok || !r.sid) throw new SmsSendError(r.error || "twilio_unreachable")
  return { sid: r.sid, status: r.status ?? null, from: cfg.fromNumber!, to: destination }
}

/** Live delivery status for one sent message, straight from Twilio. */
export async function getSmsDeliveryStatus(client: any, tenantId: string, sid: string) {
  const cfg = await requireSmsConfig(client, tenantId)
  const r = await fetchSmsStatus(cfg, sid)
  if (!r.ok) throw new SmsSendError(r.error || "twilio_unreachable")
  return r
}

export interface SmsRecordInput {
  tenantId: string
  customerId?: string | null
  toAddress: string
  fromAddress?: string | null
  subject?: string | null
  body: string
  status: "queued" | "sent" | "delivered" | "failed"
  providerMessageId?: string | null
  deliveryStatus?: string | null
  failureReason?: string | null
  createdBy?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Write the crm_messages record for an SMS send — the row the CRM
 * communication history (1.3.8c) and the delivery-status webhook read.
 * Columns verified against information_schema (public.crm_messages):
 * provider / provider_message_id / delivery_status / failure_reason /
 * failed_at / sent_at all exist on the table.
 */
export async function recordSmsMessage(client: any, input: SmsRecordInput): Promise<string> {
  const r = await client.query(
    `INSERT INTO public.crm_messages
       (id, tenant_id, customer_id, channel, direction, status,
        from_address, to_address, subject, body, provider, provider_message_id,
        delivery_status, failure_reason, failed_at, sent_at, metadata, created_by, created_at)
     VALUES (gen_random_uuid(), $1, $2::uuid, 'sms', 'outbound', $3,
             $4, $5, $6, $7, 'twilio', $8,
             $9, $10, CASE WHEN $3 = 'failed' THEN now() END,
             CASE WHEN $3 = 'failed' THEN NULL ELSE now() END,
             $11::jsonb, $12::uuid, now())
     RETURNING id::text AS id`,
    [
      input.tenantId,
      input.customerId ?? null,
      input.status,
      input.fromAddress ?? null,
      input.toAddress,
      input.subject ?? null,
      input.body,
      input.providerMessageId ?? null,
      input.deliveryStatus ?? null,
      input.failureReason ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.createdBy ?? null,
    ],
  )
  return r.rows[0].id as string
}
