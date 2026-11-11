import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAuthClient } from "@/lib/supabase/server";
import { activateAdvertiser } from "@/lib/ads/advertiser";
import { gatePathForAccount } from "@/lib/auth-gate";
import { sendSignupConfirmationEmail } from "@/lib/email/auth-emails";
import {
  OAUTH_BROWSER_COOKIE,
  consumeOAuthState,
  exchangeGoogleCode,
  fetchGooglePeople,
  findAuthUserByEmail,
  getGoogleAdmin,
  hashBrowserBinding,
  publicOrigin,
  sanitizeNext,
} from "@/lib/google-auth";

// ===========================================================================
// GET /api/auth/google/callback
//
// The one and only Google redirect URI. Verifies + consumes the
// single-use server-side state, checks the browser binding, exchanges
// the code against the exact redirect_uri the initiator recorded,
// resolves (or creates) the Supabase auth user, mints the app's normal
// Supabase session, and redirects to the destination the flow carried.
// Every failure path returns the browser to the sign-in page, clean.
// ===========================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bounce(req: NextRequest, error?: string): NextResponse {
  const url = new URL("/login", publicOrigin(req));
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const googleError = searchParams.get("error");

  // 1. Consume the single-use state — it carries the destination and the
  //    redirect_uri the flow started with.
  const stateRow = await consumeOAuthState(state);
  if (!stateRow) {
    console.warn("[auth/google/callback] bounce: state invalid/expired/replayed");
    return bounce(req);
  }

  if (googleError || !code) {
    console.warn(`[auth/google/callback] bounce: googleError=${googleError || "none"}`);
    return bounce(req);
  }

  // 2. Browser binding (login-CSRF guard): the initiator set the cookie
  //    in THIS browser and stored its hash in the state row.
  if (stateRow.browser_hash) {
    const cookieValue = (await cookies()).get(OAUTH_BROWSER_COOKIE)?.value;
    const hash = hashBrowserBinding(cookieValue);
    if (!hash || hash !== stateRow.browser_hash) {
      console.warn("[auth/google/callback] bounce: browser-binding mismatch");
      return bounce(req);
    }
  }

  const admin = getGoogleAdmin();
  if (!admin) {
    console.warn("[auth/google/callback] bounce: Supabase admin client unavailable");
    return bounce(req, "google_unavailable");
  }

  // 3. Exchange the code for the Google profile — against the same
  //    redirect_uri the initiator sent to Google.
  const redirectUri =
    stateRow.redirect_uri || `${publicOrigin(req)}/api/auth/google/callback`;
  const { profile, error: exchangeError, accessToken } = await exchangeGoogleCode(code, redirectUri);
  if (!profile) {
    console.warn(`[auth/google/callback] bounce: exchange failed — ${exchangeError || "unknown"}`);
    return bounce(req, "google_failed");
  }

  // 4. Resolve / create the user in Supabase (the landing). A first-time
  //    Google sign-in creates the account as a Customer, with the terms
  //    agreement stamped — the sign-in page carries the terms notice the
  //    button sits under.
  let authUser: any = null;
  try {
    authUser = await findAuthUserByEmail(admin, profile.email);
  } catch (e: any) {
    console.warn(`[auth/google/callback] bounce: user lookup threw — ${e?.message || e}`);
    return bounce(req, "google_failed");
  }

  let createdNew = false;
  const isAdmin = stateRow.portal === "admin";
  const audience = stateRow.portal === "advertiser" ? "advertiser" : isAdmin ? "admin" : "customer";
  if (!authUser) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: profile.email,
      email_confirm: true,
      user_metadata: {
        display_name: profile.name || profile.email.split("@")[0],
        full_name: profile.name || undefined,
        avatar_url: profile.picture || undefined,
        provider: "google",
        google_sub: profile.sub,
        audience,
        terms_accepted_at: new Date().toISOString(),
        terms_version: "v1",
      },
    });
    if (createError || !created?.user) {
      console.warn(`[auth/google/callback] bounce: createUser failed — ${createError?.message || "unknown"}`);
      return bounce(req, "google_failed");
    }
    authUser = created.user;
    createdNew = true;
  } else if (!authUser.user_metadata?.google_sub) {
    // Link the Google identity onto the existing account (best-effort).
    try {
      await admin.auth.admin.updateUserById(authUser.id, {
        user_metadata: {
          ...(authUser.user_metadata || {}),
          provider: authUser.user_metadata?.provider || "google",
          google_sub: profile.sub,
          avatar_url: authUser.user_metadata?.avatar_url || profile.picture || undefined,
        },
      });
    } catch {
      /* linking metadata is best-effort; the sign-in itself proceeds */
    }
  }

  // 4b. People capture (owner doctrine, 2026-11-04): Google passes
  //     what its profile holds — the phone lands on the record as a
  //     pre-fill (Twilio still proves possession before anything is
  //     stamped verified), a complete postal address lands in the
  //     address book, and a partial one is stashed on the metadata
  //     where the completion form pre-fills from it. Inert until the
  //     consent screen grants the People scopes; every failure is
  //     swallowed — capture never breaks a sign-in.
  if (accessToken && authUser && !isAdmin) {
    try {
      const capture = await fetchGooglePeople(accessToken);
      if (capture) {
        const meta = { ...((authUser.user_metadata as Record<string, unknown>) || {}) };
        let metaDirty = false;
        if (capture.phone && !meta.phone) {
          meta.phone = capture.phone;
          meta.phone_source = "google";
          metaDirty = true;
        }
        if (capture.partialAddress) {
          meta.google_address = {
            ...capture.partialAddress,
            ...(capture.address?.first_name ? { first_name: capture.address.first_name } : {}),
            ...(capture.address?.last_name ? { last_name: capture.address.last_name } : {}),
            ...(capture.phone ? { phone: capture.phone } : {}),
          };
          metaDirty = true;
        }
        if (metaDirty) {
          await admin.auth.admin.updateUserById(authUser.id, { user_metadata: meta });
          authUser = { ...authUser, user_metadata: meta };
        }
        if (capture.address) {
          const { data: existingAddr } = await admin
            .from("customer_addresses")
            .select("id")
            .eq("user_id", authUser.id)
            .limit(1);
          if (!existingAddr?.length) {
            await admin.from("customer_addresses").insert({
              user_id: authUser.id,
              first_name: capture.address.first_name ?? null,
              last_name: capture.address.last_name ?? null,
              line1: capture.address.line1,
              line2: capture.address.line2 ?? null,
              city: capture.address.city,
              state: capture.address.state ?? null,
              postal_code: capture.address.postal_code,
              country_code: capture.address.country_code ?? "US",
              phone: capture.phone,
              is_default: true,
            });
          }
        }
      }
    } catch (e: any) {
      console.warn(`[auth/google/callback] people capture skipped — ${e?.message || e}`);
    }
  }

  // 5. Mint the app's normal Supabase session: a server-generated
  //    magic-link token, verified through the SSR auth client so the
  //    session cookies are written exactly as a password sign-in writes
  //    them.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: profile.email,
  });
  const tokenHash = (link as any)?.properties?.hashed_token as string | undefined;
  if (linkError || !tokenHash) {
    console.warn(`[auth/google/callback] bounce: generateLink failed — ${linkError?.message || "no token"}`);
    return bounce(req, "session_failed");
  }
  const authClient = await createAuthClient();
  const { error: verifyError } = await authClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (verifyError) {
    console.warn(`[auth/google/callback] bounce: verifyOtp failed — ${verifyError.message}`);
    return bounce(req, "session_failed");
  }

  // Admin portal: the session is minted; the dashboard's own gate
  // (staff check) decides entry on arrival. None of the customer
  // chain (confirmation email, phone step, advertiser activation)
  // applies — land on the dashboard host at the carried destination.
  if (isAdmin) {
    const dest =
      stateRow.redirect_to && stateRow.redirect_to.startsWith("/") && !stateRow.redirect_to.startsWith("//")
        ? stateRow.redirect_to
        : "/";
    const res = NextResponse.redirect(new URL(dest, "https://admin.unsaidmemories.com"));
    res.cookies.delete(OAUTH_BROWSER_COOKIE);
    return res;
  }

  // A brand-new advertiser gets the same activation the email signup
  //    route performs, and starts at the advertiser onboarding —
  //    unless the flow carried its own destination.
  let destination = sanitizeNext(stateRow.redirect_to);
  if (createdNew && audience === "advertiser") {
    try {
      await activateAdvertiser(authUser, profile.name);
    } catch (e: any) {
      console.warn(`[auth/google/callback] advertiser activation failed — ${e?.message || e}`);
    }
    if (destination === "/account") destination = "/advertise/get-started";
  }
  // A brand-new Google account gets the store's own confirmation
  // email (owner order, 2026-11-04): Google proved the address to
  // Google; the signup_confirmation email — with its magic confirm
  // link — is this house's step, and it precedes the phone step.
  if (createdNew) {
    await sendSignupConfirmationEmail(admin, authUser, destination);
  }
  // The chain, in order: app email confirmation, then Twilio Verify
  // (Google proves an account, not a phone). Destination preserved.
  try {
    const {
      data: { user: sessionUser },
    } = await authClient.auth.getUser();
    if (sessionUser) {
      destination = await gatePathForAccount(sessionUser, destination);
    }
  } catch {
    // non-fatal — the checkout backstop still gates unverified users
  }
  const res = NextResponse.redirect(new URL(destination, publicOrigin(req)));
  res.cookies.delete(OAUTH_BROWSER_COOKIE);
  return res;
}
