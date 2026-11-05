"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/server";
import { createServerClient } from "@/lib/supabase";
import { activateAdvertiser } from "@/lib/ads/advertiser";
import { gatePathForAccount } from "@/lib/auth-gate";

export type AuthResult = { error?: string };

/**
 * Email + password sign in. On success the session cookie is set by
 * @supabase/ssr and the user is sent to `next` (default /admin).
 */
export async function signIn(
  prevState: AuthResult,
  formData: FormData
): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin") || "/admin";

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createAuthClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  // Step 2 of sign-in (Twilio Verify): an account with no verified
  // phone diverts to /verify-phone with its destination preserved.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? await gatePathForAccount(user, next) : next);
}

/**
 * Email + password sign up. If Supabase email confirmation is enabled,
 * the user gets a "check your inbox" message; otherwise they're signed
 * straight in and sent to `next`.
 */
export async function signUp(
  prevState: AuthResult,
  formData: FormData
): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const next = String(formData.get("next") ?? "/account") || "/account";
  // Signup asks who the audience is (Sunny, 2026-11-03): Customer or
  // Advertiser — one account either way; Advertiser activates the
  // advertising privilege on this same account, never a second login.
  const audience =
    String(formData.get("audience") ?? "customer") === "advertiser"
      ? "advertiser"
      : "customer";
  const isAdvertiser = audience === "advertiser";
  // An advertiser's continuation is the brand-profile step; after email
  // confirmation the callback activates the privilege and lands here too.
  const dest = isAdvertiser ? "/advertise/get-started" : next;

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  // Terms agreement (owner ask, 2026-11-03): creating an account
  // requires agreeing to the Terms and Privacy Policy; the moment
  // of agreement is recorded on the account (auth metadata) so
  // there is a record of what was agreed to, and when.
  if (!formData.get("terms")) {
    return { error: "Please agree to the Terms and Privacy Policy to create your account." };
  }
  const termsAcceptedAt = new Date().toISOString();

  const displayName = name || email.split("@")[0];

  const supabase = await createAuthClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXTAUTH_URL ?? ""}/auth/callback?next=${encodeURIComponent(dest)}`,
      data: {
        display_name: displayName,
        audience,
        terms_accepted_at: termsAcceptedAt,
        terms_version: "v1",
        terms_url: "/legal/terms-of-service",
        privacy_url: "/legal/privacy-policy",
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  // Create the profiles row so /api/customers/me has a display_name +
  // member_since. The service-role client is used because the auth client
  // may not have a session yet (email confirmation pending).
  if (data.user) {
    try {
      const sb = createServerClient();
      await sb.from("profiles").upsert(
        {
          id: data.user.id,
          email: data.user.email ?? email,
          display_name: displayName,
        },
        { onConflict: "id" }
      );
    } catch {
      // non-fatal — the auth user exists; profile can be patched later
    }

    // Advertiser chosen at signup + a live session (no confirmation
    // pending): activate the privilege on this account right now. When
    // confirmation IS pending, the auth callback activates it on the
    // user's first arrival instead. Non-fatal either way — the account
    // page's Advertising card can still activate later.
    if (isAdvertiser && data.session) {
      try {
        await activateAdvertiser(
          {
            id: data.user.id,
            email: data.user.email ?? email,
            user_metadata: { display_name: displayName, audience },
          },
          displayName
        );
      } catch {
        // non-fatal — activation can still happen from /account
      }
    }
  }

  revalidatePath("/", "layout");
  // A live session means the account exists NOW — it verifies its
  // phone before landing (Twilio Verify step 2). When email
  // confirmation is pending there is no session yet; the auth
  // callback applies the same gate on arrival.
  redirect(
    data.session && data.user ? await gatePathForAccount(data.user, dest) : dest
  );
}

/** Signs the user out and returns them to the storefront. */
export async function signOut() {
  const supabase = await createAuthClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
