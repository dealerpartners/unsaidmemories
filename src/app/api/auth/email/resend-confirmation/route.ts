import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";
import { createServerClient } from "@/lib/supabase";
import { sendSignupConfirmationEmail } from "@/lib/email/auth-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/email/resend-confirmation { next }
 * Mints a fresh magic confirm link and resends the store's signup
 * confirmation email to the signed-in user. Signed-in only — the
 * email goes to the account's own address, never to a posted one.
 */
export async function POST(req: NextRequest) {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first, then confirm your email." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { next?: string };
  const raw = typeof body.next === "string" ? body.next : "/account";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/account";
  const admin = createServerClient();
  const sent = await sendSignupConfirmationEmail(admin, user, next);
  if (!sent) {
    return NextResponse.json(
      { error: "We couldn't send the email just now. Please try again in a moment." },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
