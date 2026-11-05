import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/app/(auth)/auth-shell";
import { createAuthClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "Get started — Unsaid Ad Center",
  description:
    "Set up your brand profile and activate advertising on your Unsaid account.",
};

export const dynamic = "force-dynamic";

/**
 * /advertise/get-started — the 6-step brand-profile flow.
 *
 * Advertising is a privilege on the customer account, not a separate
 * account (owner ruling, 2026-11-02): signed-out visitors go to the
 * ONE customer login (or create a customer account) and come back —
 * this page never asks for a second email + password. Signed-in
 * customers get the wizard; submitting it activates the advertiser
 * privilege on their account and continues into /ads.
 */
export default async function GetStartedPage() {
  const authClient = await createAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  return (
    <AuthShell
      eyebrow="Ad Center onboarding"
      heading={
        <>
          Make your brand part of <em>what matters.</em>
        </>
      }
      sub="A few steps to set up your brand profile, campaign objectives, and creative direction — on the same account you shop with."
    >
      {user ? (
        <OnboardingForm />
      ) : (
        <div>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: "#4c4657", marginBottom: 20 }}>
            Advertising on Unsaid runs on your customer account — there&apos;s
            no separate advertiser login to create or remember. Sign in (or
            create your account) and you&apos;ll come straight back here to
            finish your brand profile.
          </p>
          <Link
            href="/login?next=/advertise/get-started"
            className="auth-submit"
            style={{ display: "block", textAlign: "center", textDecoration: "none", marginBottom: 12 }}
          >
            Sign in to continue
          </Link>
          <div className="auth-alt">
            New to Unsaid?{" "}
            <Link href="/signup?next=/advertise/get-started&audience=advertiser">Create your account</Link>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
