import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "../auth-shell";
import { createAuthClient } from "@/lib/supabase/server";
import { appEmailGateApplies } from "@/lib/twilio-verify";
import { gatePathForAccount } from "@/lib/auth-gate";
import { VerifyEmailForm } from "./verify-email-form";

export const metadata: Metadata = {
  title: "Confirm your email — UnSaid",
  description: "One tap on the email we sent confirms your UnSaid Memories account.",
};
export const dynamic = "force-dynamic";

/**
 * The store's own email confirmation step (owner order, 2026-11-04).
 * A Google sign-up creates the account, and the signup_confirmation
 * email goes out in the same breath; this screen is where the chain
 * waits for the tap. The tap lands through /auth/callback, which
 * stamps the account confirmed — this page then routes onward
 * (the phone step is next). Accounts the gate doesn't apply to are
 * routed straight through.
 */
export default async function VerifyEmailPage({
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
  if (!appEmailGateApplies(user)) {
    redirect(await gatePathForAccount(user, next));
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const cardName =
    (typeof meta.display_name === "string" && meta.display_name) ||
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    "";
  const cardAvatar = typeof meta.avatar_url === "string" ? meta.avatar_url : "";
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];
  const fromGoogle = providers.includes("google");

  return (
    <AuthShell
      eyebrow="One quick check"
      heading={
        <>
          Confirm your <em>email.</em>
        </>
      }
      sub="Your account is created — this tap makes it fully yours before the phone check."
    >
      <VerifyEmailForm
        next={next}
        cardName={cardName}
        cardEmail={user.email ?? ""}
        cardAvatar={cardAvatar}
        fromGoogle={fromGoogle}
      />
    </AuthShell>
  );
}
