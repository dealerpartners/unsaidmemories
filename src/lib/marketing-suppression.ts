import { withPg, TENANT_ID } from "@/lib/crm/enterprise"

// ============================================================================
// Marketing suppressions (§6.17.1.4) — the enforced store behind every
// marketing opt-out. Writers: the customer's communication preferences
// (/api/customer/preferences) and the public marketing-preferences form
// (/api/opt-out). Reader: the mailer (lib/email.ts) refuses a
// category:'marketing' send to a suppressed contact before any
// provider call. Transactional mail (receipts, reminders, security)
// is never suppression-checked — an opt-out is about promotion, not
// about the messages an account needs.
// ============================================================================

export type MarketingChannel = "email" | "sms"

const norm = (contact: string) => contact.trim().toLowerCase()

export async function suppressMarketing(
  contact: string,
  channel: MarketingChannel,
  source: string,
  reason?: string,
): Promise<void> {
  const c = norm(contact)
  if (!c) return
  await withPg(async (client) => {
    await client.query(
      `INSERT INTO public.marketing_suppressions (tenant_id, contact, channel, source, reason)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, contact, channel)
       DO UPDATE SET source = EXCLUDED.source, reason = EXCLUDED.reason, created_at = now()`,
      [TENANT_ID(), c, channel, source, reason ?? null],
    )
  })
}

export async function unsuppressMarketing(contact: string, channel: MarketingChannel): Promise<void> {
  const c = norm(contact)
  if (!c) return
  await withPg(async (client) => {
    await client.query(
      `DELETE FROM public.marketing_suppressions WHERE tenant_id = $1 AND contact = $2 AND channel = $3`,
      [TENANT_ID(), c, channel],
    )
  })
}

export async function isMarketingSuppressed(contact: string, channel: MarketingChannel): Promise<boolean> {
  const c = norm(contact)
  if (!c) return false
  const rows = (await withPg(async (client) => {
    const { rows } = await client.query(
      `SELECT 1 FROM public.marketing_suppressions WHERE tenant_id = $1 AND contact = $2 AND channel = $3 LIMIT 1`,
      [TENANT_ID(), c, channel],
    )
    return rows
  }).catch(() => [])) ?? []
  return rows.length > 0
}
