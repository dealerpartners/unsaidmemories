import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "../auth-shell";
import { createAuthClient } from "@/lib/supabase/server";
import { isPhoneVerified } from "@/lib/twilio-verify";
import { VerifyPhoneForm } from "./verify-form";

export const metadata: Metadata = {
  title: "Verify your phone — UnSaid",
  description: "One quick text-message check so we know this account is really yours.",
};
export const dynamic = "force-dynamic";

/**
 * Step 2 of sign-in (owner order, 2026-11-03 — Twilio Verify).
 * Every account verifies a real mobile once: after any sign-up or
 * sign-in the completion handlers divert unverified users here with
 * their destination in `next`; approval stamps the account and the
 * form sends the user on to that destination. Signed-out visitors
 * have nothing to stamp — they go sign in first, same chain.
 */
export default async function VerifyPhonePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const raw = params.next || "/account";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/account";

  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  if (isPhoneVerified(user)) {
    redirect(next);
  }

  // The contact card: everything the account already knows about this
  // person, gathered instead of re-asked. Identity comes off the auth
  // user (Google filled name + email + photo at sign-in; the email
  // form asked for the name once). The phone pre-fills from whatever
  // they have given us before — a number they verified earlier, then
  // the phone on their default saved address (every checkout and
  // address they have ever saved writes there). Verification confirms
  // the card; it never starts from a blank box.
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const cardName =
    (typeof meta.display_name === "string" && meta.display_name) ||
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    "";
  const cardAvatar = typeof meta.avatar_url === "string" ? meta.avatar_url : "";
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];
  const fromGoogle = providers.includes("google");
  let cardPhone = typeof meta.phone === "string" ? meta.phone : "";
  if (!cardPhone) {
    try {
      const { data: addr } = await supabase
        .from("customer_addresses")
        .select("phone")
        .eq("user_id", user.id)
        .not("phone", "is", null)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (addr?.phone) cardPhone = String(addr.phone);
    } catch {
      // No saved address on file — the field simply starts empty.
    }
  }

  return (
    <AuthShell
      eyebrow="One quick check"
      heading={
        <>
          Prove it&apos;s <em>really you.</em>
        </>
      }
      sub="A text message with a short code — it keeps bots and fake accounts out, and it protects your orders."
    >
      <VerifyPhoneForm
        next={next}
        cardName={cardName}
        cardEmail={user.email ?? ""}
        cardAvatar={cardAvatar}
        cardPhone={cardPhone}
        fromGoogle={fromGoogle}
      />
    </AuthShell>
  );
}
