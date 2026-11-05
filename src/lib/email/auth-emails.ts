import { createHash, randomBytes } from "crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { renderHostedEmail } from "@/lib/email/hosted-render";
import { toResendVariables } from "@/lib/email/resend-templates";
import { SITE_URL } from "@/lib/site-url";

/**
 * The store's own signup confirmation email (owner order, 2026-11-04).
 *
 * A Google sign-up creates the account with the address already
 * confirmed at Supabase's level (Google proved it), but the house
 * chain has its own step: the signup_confirmation design goes out with
 * a one-time confirm link, and the account is not fully through the
 * chain until the tap lands. The link is the app's own token URL
 * (/api/auth/email/confirm) — NOT a Supabase-generated link, whose
 * admin-generated form returns implicit-flow tokens in a URL fragment
 * no server route can read. Only the token's SHA-256 is stored.
 * Fire-and-forget by contract: a mail failure never breaks the
 * sign-in that triggered it.
 */
export async function sendSignupConfirmationEmail(
  admin: SupabaseClient,
  user: User,
  next: string
): Promise<boolean> {
  try {
    const email = user.email;
    if (!email) return false;
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    // A fresh send supersedes every earlier unused token for the user.
    await admin
      .from("email_confirmation_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("used_at", null);
    const { error: insertError } = await admin.from("email_confirmation_tokens").insert({
      user_id: user.id,
      token_hash: tokenHash,
      next,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    if (insertError) {
      console.error("[auth-emails] token insert failed", insertError.message);
      return false;
    }
    const confirmUrl =
      `${SITE_URL}/api/auth/email/confirm?token=${encodeURIComponent(rawToken)}` +
      `&next=${encodeURIComponent(next)}`;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const displayName =
      (typeof meta.display_name === "string" && meta.display_name) ||
      (typeof meta.full_name === "string" && meta.full_name) ||
      "";
    const firstName = displayName.split(/\s+/)[0] || email.split("@")[0];
    const vars = toResendVariables({ firstName, confirmUrl });
    await sendEmail({
      to: email,
      template: "signup_confirmation",
      subject: "Confirm your UnSaid Memories account",
      html: renderHostedEmail("signup_confirmation", vars) || "",
      variables: vars,
    });
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...meta,
        app_email_confirmation_sent_at: new Date().toISOString(),
      },
    });
    return true;
  } catch (e) {
    console.error("[auth-emails] signup confirmation send failed", e);
    return false;
  }
}
