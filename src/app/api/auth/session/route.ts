import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/auth/session — return the current signed-in user, or null.
// The middleware refreshes the session cookie on every request; this route
// just reads it. Client components and the customer portal use this to
// decide whether to show account UI.
export async function GET() {
  try {
    const supabase = await createAuthClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ user: null });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name:
          user.user_metadata?.full_name ||
          user.user_metadata?.display_name ||
          null,
        avatarUrl: user.user_metadata?.avatar_url || null,
        emailConfirmed: !!user.email_confirmed_at,
        lastSignInAt: user.last_sign_in_at || null,
      },
    });
  } catch (err: any) {
    console.error("[GET /api/auth/session]", err);
    return NextResponse.json(
      { error: err?.message || "Session check failed." },
      { status: 500 }
    );
  }
}
