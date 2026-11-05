import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";
import { createServerClient } from "@/lib/supabase";
import { gatePathForAccount } from "@/lib/auth-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/email/confirm?token=…&next=…
 *
 * The tap on the store's own confirmation email. Validates the
 * one-time token (SHA-256 at rest, 24h, single use), stamps the
 * account email_app_confirmed_at, mints the app's normal Supabase
 * session the same way the Google callback does (server-generated
 * magic-link token, verified through the SSR auth client), and
 * redirects onward through the chain — the phone step is next.
 * Every failure lands on the sign-in page with a plain hint.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const token = searchParams.get("token") || "";
  const rawNext = searchParams.get("next") || "/account";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/account";
  const fail = (error: string) =>
    NextResponse.redirect(`${origin}/login?error=${error}`);

  if (!token) return fail("confirm");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const admin = createServerClient();

  const { data: row } = await admin
    .from("email_confirmation_tokens")
    .select("id, user_id, next, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    return fail("confirm_expired");
  }
  // Single use: burn it before anything else can race it.
  await admin
    .from("email_confirmation_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("used_at", null);

  const { data: userData } = await admin.auth.admin.getUserById(row.user_id);
  const target = userData?.user;
  if (!target?.email) return fail("confirm");
  const stamp = new Date().toISOString();
  await admin.auth.admin.updateUserById(target.id, {
    user_metadata: { ...(target.user_metadata ?? {}), email_app_confirmed_at: stamp },
  });

  // Mint the session exactly like the Google callback does.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: target.email,
  });
  const tokenHashLink = (link as { properties?: { hashed_token?: string } } | null)
    ?.properties?.hashed_token;
  if (linkError || !tokenHashLink) return fail("confirm");
  const authClient = await createAuthClient();
  const { error: verifyError } = await authClient.auth.verifyOtp({
    token_hash: tokenHashLink,
    type: "magiclink",
  });
  if (verifyError) return fail("confirm");

  const confirmedUser = {
    ...target,
    user_metadata: { ...(target.user_metadata ?? {}), email_app_confirmed_at: stamp },
  };
  const destination = await gatePathForAccount(confirmedUser, row.next || next);
  return NextResponse.redirect(`${origin}${destination}`);
}
