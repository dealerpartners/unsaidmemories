import type { Metadata } from "next";
import { AuthShell } from "../auth-shell";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create account — UnSaid",
  description: "Create your UnSaid account.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; audience?: string }>;
}) {
  const params = await searchParams;
  // Signup is a storefront door (Customer / Advertiser audiences); a
  // fresh account with nowhere specified lands on its account page,
  // not the admin door.
  const next = params.next || "/account";

  return (
    <AuthShell
      eyebrow="Begin the story"
      heading={
        <>
          Say it without saying <em>everything.</em>
        </>
      }
      sub="Design one-of-a-kind pieces, build collections, and share them with the people who matter most."
    >
      <SignupForm next={next} audience={params.audience} />
    </AuthShell>
  );
}
