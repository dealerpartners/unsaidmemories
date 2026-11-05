import type { Metadata } from "next";
import { AuthShell } from "../auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in — UnSaid",
  description: "Sign in to your UnSaid account.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = params.next || "/admin";

  return (
    <AuthShell
      eyebrow="The studio awaits"
      heading={
        <>
          Some things are better <em>felt.</em>
        </>
      }
      sub="Your designs, collections, and orders — all in one place, ready when you are."
    >
      <LoginForm next={next} confirmError={params.error === "confirm"} />
    </AuthShell>
  );
}
