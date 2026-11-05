import { NextRequest, NextResponse } from "next/server";
import { findAuthUserByEmail, getGoogleAdmin } from "@/lib/google-auth";

// ===========================================================================
// POST /api/auth/provider-check  { email }
//
// Answers ONE narrow question for the forgot-password flows: does this
// account sign in with Google? A Google account has no password to
// reset — the forms recognize it and tell the person so, instead of
// mailing a reset that can never complete. Fails closed (false) on any
// error so a lookup problem never blocks a real password recovery.
// ===========================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ googleAccount: false });

  try {
    const admin = getGoogleAdmin();
    if (!admin) return NextResponse.json({ googleAccount: false });
    const user: any = await findAuthUserByEmail(admin, email);
    if (!user) return NextResponse.json({ googleAccount: false });
    const meta = user.user_metadata || {};
    const identities: any[] = Array.isArray(user.identities) ? user.identities : [];
    const googleAccount = Boolean(
      meta.google_sub ||
        meta.provider === "google" ||
        identities.some((i) => i?.provider === "google")
    );
    return NextResponse.json({ googleAccount });
  } catch {
    return NextResponse.json({ googleAccount: false });
  }
}
