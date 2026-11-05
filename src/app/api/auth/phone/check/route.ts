import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";
import { createServerClient } from "@/lib/supabase";
import { checkVerification, getTwilioConfig, toE164 } from "@/lib/twilio-verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Step 2 of sign-in, part 2: check the code with Twilio. On approval
 * the account is stamped — phone + phone_verified_at on the auth
 * user's metadata, the same place the signup terms agreement is
 * recorded — and every gate (sign-in diversion, checkout backstop)
 * reads that stamp. Verified once per account.
 */
export async function POST(req: NextRequest) {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first, then verify your phone." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { phone?: string; code?: string };
  const phone = toE164(String(body.phone ?? ""));
  const code = String(body.code ?? "").replace(/[^\d]/g, "");
  if (!phone || code.length < 4 || code.length > 10) {
    return NextResponse.json({ error: "Enter the code from the text message." }, { status: 400 });
  }

  const cfg = await getTwilioConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Phone verification is not switched on yet. Please try again later." },
      { status: 503 },
    );
  }

  const approved = await checkVerification(cfg, phone, code);
  if (!approved) {
    return NextResponse.json(
      { error: "That code doesn't match, or it has expired. Check it and try again." },
      { status: 400 },
    );
  }

  const admin = createServerClient();
  const existing =
    user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...existing,
      phone,
      phone_verified_at: new Date().toISOString(),
    },
  });
  if (error) {
    return NextResponse.json(
      { error: "The code was right, but saving it failed. Please try once more." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
