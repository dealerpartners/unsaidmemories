import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createAuthClient } from "@/lib/supabase/server";
import { activateAdvertiser } from "@/lib/ads/advertiser";
import { gatePathForAccount } from "@/lib/auth-gate";

/**
 * Handles the redirect back from Supabase email confirmation links.
 * Exchanges the `code` for a session, then sends the user to `next`.
 * If the user chose Advertiser at signup, this first arrival is where
 * their advertising privilege activates (signup stores the choice in
 * the auth user's metadata).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/account";

  if (code) {
    const supabase = await createAuthClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      let arrivedUser: User | null = null;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        arrivedUser = user;
        if (user && user.user_metadata?.audience === "advertiser") {
          await activateAdvertiser(user);
        }
      } catch {
        // non-fatal — activation can still happen from /account
      }
      // The chain, in order: app email confirmation, then Twilio
      // Verify — each diversion keeps the destination.
      if (arrivedUser) {
        const dest = await gatePathForAccount(arrivedUser, next);
        if (dest !== next) {
          return NextResponse.redirect(`${origin}${dest}`);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — send them to login with a hint.
  return NextResponse.redirect(`${origin}/login?error=confirm`);
}
