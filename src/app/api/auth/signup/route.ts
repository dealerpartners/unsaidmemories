import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";
import { activateAdvertiser } from "@/lib/ads/advertiser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/signup — create an account with email + password.
// Body: { email, password, name?, audience? }
// Signup asks who the audience is: "customer" (default) or "advertiser".
// One account either way; an advertiser gets the advertising privilege
// activated on this same account (here when a session exists, otherwise
// at the email-confirmation callback). Uses Supabase Auth natively (no
// Prisma). On success a profiles row is created for the new user so
// /api/customers/me has something to read.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const name = String(body?.name || "").trim();
    const audience = body?.audience === "advertiser" ? "advertiser" : "customer";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const supabase = await createAuthClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          ...(name ? { full_name: name, display_name: name } : {}),
          audience,
        },
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const user = data.user;
    if (user) {
      // Ensure a profiles row exists for the customer portal.
      await supabase.from("profiles").upsert(
        {
          id: user.id,
          display_name: name || email.split("@")[0],
        },
        { onConflict: "id" }
      );

      // Advertiser + live session: activate the privilege now.
      // (Confirmation pending: the auth callback activates on arrival.)
      if (audience === "advertiser" && data.session) {
        try {
          await activateAdvertiser(
            {
              id: user.id,
              email: user.email ?? email,
              user_metadata: { display_name: name || email.split("@")[0], audience },
            },
            name || null
          );
        } catch {
          // non-fatal — activation can still happen from /account
        }
      }
    }

    return NextResponse.json({
      success: true,
      audience,
      next: audience === "advertiser" ? "/advertise/get-started" : undefined,
      user: user
        ? { id: user.id, email: user.email, confirmed: !!user.email_confirmed_at }
        : null,
      // If email confirmation is on, the user must confirm before signing in.
      needsConfirmation: !data.session,
    });
  } catch (err: any) {
    console.error("[POST /api/auth/signup]", err);
    return NextResponse.json(
      { error: err?.message || "Signup failed." },
      { status: 500 }
    );
  }
}
