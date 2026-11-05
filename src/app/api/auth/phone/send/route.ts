import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";
import {
  getPhoneVerifyMode,
  getTwilioConfig,
  isMobileLine,
  lookupLineType,
  sendVerification,
  toE164,
} from "@/lib/twilio-verify";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Step 2 of sign-in, part 1: send the Twilio Verify code — but only
 * after the fraud gate. Twilio Lookup checks the line first; anything
 * that is not a genuine mobile (VOIP, virtual, landline, toll-free)
 * is refused before a code exists. Signed-in users only: verification
 * stamps an account, so there must be an account.
 */
export async function POST(req: NextRequest) {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first, then verify your phone." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { phone?: string };
  const phone = toE164(String(body.phone ?? ""));
  if (!phone) {
    return NextResponse.json(
      { error: "Enter your mobile number, including the area code." },
      { status: 400 },
    );
  }

  // US-only lock (owner order, 2026-11-03): this store serves the
  // United States, so the app only ever texts +1 numbers. Twilio
  // deliberately offers no API for its console geo permissions (a
  // leaked token must not be able to open countries), so this route
  // is the programmatic gate — no console setting can widen it.
  if (!phone.startsWith("+1")) {
    return NextResponse.json(
      { error: "We can only text US numbers. Please use a US mobile number." },
      { status: 403 },
    );
  }

  const cfg = await getTwilioConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Phone verification is not switched on yet. Please try again later." },
      { status: 503 },
    );
  }

  const lookup = await lookupLineType(cfg, phone);
  if (!lookup.ok) {
    return NextResponse.json(
      { error: "We couldn't check that number just now. Please try again in a moment." },
      { status: 503 },
    );
  }
  if (!isMobileLine(lookup.lineType)) {
    return NextResponse.json(
      { error: "That number can't be verified. Please use a mobile phone number." },
      { status: 403 },
    );
  }

  const sent = await sendVerification(cfg, phone);
  if (!sent.ok) {
    // Lenient mode (owner order, 2026-11-04): while Twilio's account
    // verification/compliance is pending, a provider-not-ready failure
    // must not trap the user — the number already passed the Lookup
    // mobile gate, so stamp it verified and let them in. The stamp
    // records HOW it was verified; a probe flips the mode back to
    // standard when sends succeed again.
    if (sent.reason === "provider_not_ready" && (await getPhoneVerifyMode()) === "lenient") {
      const admin = createServerClient();
      const { error: stampErr } = await admin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...(user.user_metadata ?? {}),
          phone,
          phone_verified_at: new Date().toISOString(),
          phone_verified_via: "lenient-bypass",
        },
      });
      if (!stampErr) {
        console.warn("[phone/send] lenient bypass stamped for user", user.id);
        return NextResponse.json({ ok: true, verified: true });
      }
      console.error("[phone/send] lenient stamp failed", stampErr.message);
    }
    return NextResponse.json({ error: sent.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
