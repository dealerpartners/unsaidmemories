// ---------------------------------------------------------------------------
// Email provider settings — per-tenant Resend credentials.
// Franchisees set their own Resend API key + from address in
// /admin/settings/email so branded emails send from their domain.
// Templates remain parent-controlled (see src/lib/email/design.ts).
//
// Source of truth: franchise_email_settings (tenant_id row), cached 5 min.
// Master tenant falls back to the RESEND_API_KEY env var when no row exists.
// When the table doesn't exist yet (SQL not run), everything falls back to
// env — nothing crashes, nothing fakes.
// ---------------------------------------------------------------------------

import { pgQuery } from "@/lib/pg";
import { cached, invalidate } from "@/lib/cache";
import { ADMIN_TENANT_ID } from "@/lib/admin-api";
import { getIntegrationKey } from "@/lib/integrations/keys";

export type EmailProviderSettings = {
  /** Which service sends the store's email. "resend" unless the store
   *  setting app_settings['email.provider'] says "brevo" — an explicit
   *  choice, never an automatic fallback. */
  provider: "resend" | "brevo";
  /** Resend API key for this tenant (null when none configured). */
  resendApiKey: string | null;
  /** Brevo API key from Connections & Keys (null when none saved). */
  brevoApiKey: string | null;
  /** Whether the SELECTED provider has a usable key — the gate every
   *  send path should check (provider-aware, unlike resendApiKey). */
  hasSendingKey: boolean;
  /** Fully-formed From header, e.g. "Shop Name <hello@shop.com>". */
  from: string;
  /** Whether the tenant has its own row (vs env fallback). */
  hasOwnRow: boolean;
  /** Whether the franchise_email_settings table exists in this DB. */
  tableExists: boolean;
};

const MASTER_FROM = "UnSaid Memories <hello@unsaidmemories.com>";
const SETTINGS_TTL_MS = 5 * 60 * 1000;

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = typeof v === "string" ? v : String(v);
  const t = s.trim();
  return t ? t : null;
}

export async function getEmailProviderSettings(
  tenantId?: string,
): Promise<EmailProviderSettings> {
  const tid = tenantId || ADMIN_TENANT_ID();
  return cached(`email-provider:${tid}`, SETTINGS_TTL_MS, async () => {
    const envKey = str(process.env.RESEND_API_KEY);
    let row: { resend_api_key?: unknown; from_email?: unknown; from_name?: unknown } | null = null;
    let tableExists = true;
    try {
      const rows = await pgQuery<Record<string, unknown>>(
        `SELECT resend_api_key, from_email, from_name FROM franchise_email_settings WHERE tenant_id = $1::uuid LIMIT 1`,
        [tid],
      );
      row = (rows[0] as { resend_api_key?: unknown; from_email?: unknown; from_name?: unknown }) || null;
    } catch (e: any) {
      // 42P01 = undefined_table (SQL not run yet) — fall back to env honestly.
      tableExists = !String(e?.message || "").includes("42P01") && !/relation .* does not exist/i.test(String(e?.message || ""));
    }

    const key = str(row?.resend_api_key) || envKey;
    const fromEmail = str(row?.from_email);
    const fromName = str(row?.from_name) || "UnSaid Memories";
    // RESEND_FROM_EMAIL (a full From header) overrides the default sender
    // when no franchise row sets one — this is the switch that lets mail
    // send from a newly verified domain without a code change.
    const envFrom = str(process.env.RESEND_FROM_EMAIL);
    const from = fromEmail ? `${fromName} <${fromEmail}>` : envFrom || MASTER_FROM;

    // Brevo: the owner's existing email service. The key lives in
    // Connections & Keys (integration vault, env fallback). The provider
    // only switches when the store setting explicitly says "brevo" —
    // saving a key never silently reroutes the store's email.
    let choice: string | null = null;
    try {
      const settingRows = await pgQuery<Record<string, unknown>>(
        `SELECT value FROM app_settings WHERE key = 'email.provider' LIMIT 1`,
      );
      choice = str(settingRows[0]?.value)?.replace(/^"|"$/g, "") ?? null;
    } catch {
      choice = null; // settings table unreachable — Resend stays the default
    }
    const brevoApiKey = str(await getIntegrationKey("BREVO_API_KEY").catch(() => ""));
    const provider = choice === "brevo" ? "brevo" : "resend";

    return {
      provider,
      resendApiKey: key,
      brevoApiKey,
      hasSendingKey: provider === "brevo" ? !!brevoApiKey : !!key,
      from,
      hasOwnRow: !!row,
      tableExists,
    };
  });
}

/** Call after PUT /api/admin/settings/email so the next send picks up changes. */
export function invalidateEmailProviderSettings(tenantId?: string): void {
  invalidate(`email-provider:${tenantId || ADMIN_TENANT_ID()}`);
}

/** Masked last-4 for display; never expose the full key. */
export function maskKey(key: string | null): string | null {
  return key ? `••••${key.slice(-4)}` : null;
}
