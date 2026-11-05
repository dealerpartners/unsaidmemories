import { getIntegrationKey } from "@/lib/integrations/keys";
import { createServerClient } from "@/lib/supabase";

/**
 * Phone verification mode (app_settings `phone_verify_mode`):
 *  - "standard": a Twilio code must be delivered and checked.
 *  - "lenient": while Twilio's account verification/compliance is being
 *    completed (owner order, 2026-11-04), a provider-not-ready send
 *    failure waves the user through as verified instead of trapping
 *    them on the verify screen. Lookup still runs first, so the number
 *    is a real mobile either way. A probe watches the API and the mode
 *    flips back to "standard" the moment sends succeed again.
 */
export async function getPhoneVerifyMode(): Promise<"standard" | "lenient"> {
  try {
    const sb = createServerClient();
    const { data } = await sb
      .from("app_settings")
      .select("value")
      .eq("key", "phone_verify_mode")
      .single();
    return data?.value === "lenient" ? "lenient" : "standard";
  } catch {
    return "standard";
  }
}

/**
 * Twilio Verify + Lookup, called over REST (no SDK dependency).
 *
 * Keys come from Connections & Keys (integration_keys vault) with the
 * server environment as fallback — the same resolution every other
 * integration uses. Nothing here works until all three keys are saved;
 * callers surface that as a plug-in step, never as a silent pass.
 *
 * Fraud posture (owner order, 2026-11-03): the Lookup line-type gate
 * runs BEFORE any code is sent. Only genuine mobile lines may verify —
 * VOIP, non-fixed VOIP, landlines, toll-free and every other line type
 * are refused outright. If Lookup itself cannot answer, the send is
 * refused as retryable (fail closed), never waved through.
 */

export type TwilioConfig = {
  accountSid: string;
  authToken: string;
  verifyServiceSid: string;
};

export async function getTwilioConfig(): Promise<TwilioConfig | null> {
  const [accountSid, authToken, verifyServiceSid] = await Promise.all([
    getIntegrationKey("TWILIO_ACCOUNT_SID"),
    getIntegrationKey("TWILIO_AUTH_TOKEN"),
    getIntegrationKey("TWILIO_VERIFY_SERVICE_SID"),
  ]);
  if (!accountSid || !authToken || !verifyServiceSid) return null;
  return { accountSid, authToken, verifyServiceSid };
}

function basicAuth(cfg: TwilioConfig): string {
  return "Basic " + Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");
}

/** Normalize a user-typed number to E.164. US numbers default to +1. */
export function toE164(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (trimmed.startsWith("+")) {
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export type LineTypeResult =
  | { ok: true; lineType: string }
  | { ok: false; reason: "lookup_failed" };

/** Twilio Lookup v2 — line type intelligence for one number. */
export async function lookupLineType(cfg: TwilioConfig, phoneE164: string): Promise<LineTypeResult> {
  try {
    const url =
      `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phoneE164)}` +
      `?Fields=line_type_intelligence`;
    const res = await fetch(url, { headers: { Authorization: basicAuth(cfg) } });
    if (!res.ok) return { ok: false, reason: "lookup_failed" };
    const body = (await res.json()) as {
      line_type_intelligence?: { type?: string } | null;
      valid?: boolean;
    };
    const type = body.line_type_intelligence?.type ?? "";
    if (!type) return { ok: false, reason: "lookup_failed" };
    return { ok: true, lineType: type };
  } catch {
    return { ok: false, reason: "lookup_failed" };
  }
}

/** Only a genuine mobile line may receive a verification code. */
export function isMobileLine(lineType: string): boolean {
  return lineType === "mobile";
}

export type SendFailureReason = "provider_not_ready" | "rate_limited" | "invalid" | "failed";

/** Twilio Verify — start a verification (sends the SMS code). */
export async function sendVerification(
  cfg: TwilioConfig,
  phoneE164: string,
): Promise<{ ok: true } | { ok: false; reason: SendFailureReason; message: string }> {
  try {
    const res = await fetch(
      `https://verify.twilio.com/v2/Services/${cfg.verifyServiceSid}/Verifications`,
      {
        method: "POST",
        headers: {
          Authorization: basicAuth(cfg),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: phoneE164, Channel: "sms" }),
      },
    );
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    // NEVER surface the provider's raw message to the user — it carries
    // console URLs and account identifiers. Log it server-side, classify
    // it, and return plain language.
    console.error("[twilio-verify] send failed", body.code ?? res.status, body.message ?? "");
    if (body.code === 60203 || body.code === 60212) {
      return { ok: false, reason: "rate_limited", message: "Too many code requests for this number. Wait a few minutes, then try again." };
    }
    if (/compliance|unverified|trust hub/i.test(body.message ?? "")) {
      return { ok: false, reason: "provider_not_ready", message: "Texting is still being switched on for this store. Please try again later — if it keeps happening, contact us and we'll finish setting it up." };
    }
    if (body.code === 60200) {
      return { ok: false, reason: "invalid", message: "That number can't receive a code. Check the number and try again." };
    }
    return { ok: false, reason: "failed", message: "We couldn't text the code just now. Please try again in a moment." };
  } catch {
    return { ok: false, reason: "failed", message: "We couldn't text the code just now. Please try again in a moment." };
  }
}

/** Twilio Verify — check a code the user typed. */
export async function checkVerification(
  cfg: TwilioConfig,
  phoneE164: string,
  code: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://verify.twilio.com/v2/Services/${cfg.verifyServiceSid}/VerificationCheck`,
      {
        method: "POST",
        headers: {
          Authorization: basicAuth(cfg),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: phoneE164, Code: code }),
      },
    );
    if (!res.ok) return false;
    const body = (await res.json()) as { status?: string };
    return body.status === "approved";
  } catch {
    return false;
  }
}

/** The one verified-state read every gate uses: stamped on the auth user. */
export function isPhoneVerified(user: {
  user_metadata?: Record<string, unknown> | null;
} | null): boolean {
  if (!user) return false;
  const at = user.user_metadata?.phone_verified_at;
  return typeof at === "string" && at.length > 0;
}

/** Where an unverified user is diverted, destination preserved. */
export function phoneGatePath(next: string): string {
  return `/verify-phone?next=${encodeURIComponent(next)}`;
}

// ---------------------------------------------------------------------------
// App email confirmation (owner order, 2026-11-04). A Google sign-up
// proves the address to Google, but the store's own confirmation email
// — the signup_confirmation design, with its magic confirm link — is a
// step of THIS house's chain, and it comes BEFORE the phone step. The
// gate applies only to accounts the marker says were sent that email
// (Google-created accounts from the fix forward); everyone else —
// email/password users, who confirm through Supabase's own email, and
// accounts created before the marker existed — is untouched by it.
// ---------------------------------------------------------------------------

type GateUser = {
  user_metadata?: Record<string, unknown> | null;
} | null;

/** True when this account still owes the app-level email confirmation. */
export function appEmailGateApplies(user: GateUser): boolean {
  const meta = user?.user_metadata ?? {};
  return (
    typeof meta.app_email_confirmation_sent_at === "string" &&
    !meta.email_app_confirmed_at
  );
}

export function emailGatePath(next: string): string {
  return `/verify-email?next=${encodeURIComponent(next)}`;
}

/**
 * The one diversion decision every door uses, in chain order:
 * app email confirmation first, then phone verification, else through.
 */
export function gatePathFor(user: GateUser, next: string): string {
  if (appEmailGateApplies(user)) return emailGatePath(next);
  if (!isPhoneVerified(user)) return phoneGatePath(next);
  return next;
}
