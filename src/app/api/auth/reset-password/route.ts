import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/reset-password — send a password reset email.
// Body: { email, redirectTo? }
// Supabase emails the user a reset link; the app's /reset-password page
// (or /auth/callback) completes the flow. Always returns success to avoid
// leaking which emails have accounts.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();
    const redirectTo = body?.redirectTo
      ? String(body.redirectTo)
      : undefined;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 }
      );
    }

    const supabase = await createAuthClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      ...(redirectTo ? { redirectTo } : {}),
    });

    if (error) {
      // Log the real error server-side, but don't leak it to the client.
      console.error("[POST /api/auth/reset-password] supabase error", error.message);
    }

    return NextResponse.json({
      success: true,
      message: "If an account exists for that email, a reset link is on its way.",
    });
  } catch (err: any) {
    console.error("[POST /api/auth/reset-password]", err);
    return NextResponse.json(
      { error: err?.message || "Reset request failed." },
      { status: 500 }
    );
  }
}
