import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "../auth-shell";
import { createAuthClient } from "@/lib/supabase/server";
import { appEmailGateApplies, isPhoneVerified } from "@/lib/twilio-verify";
import { gatePathForAccount } from "@/lib/auth-gate";
import { CompleteProfileForm } from "./complete-form";

export const metadata: Metadata = {
  title: "Your address — UnSaid",
  description: "One address on your record, so checkout never asks twice.",
};
export const dynamic = "force-dynamic";

/**
 * The completion step (owner order, 2026-11-04): the customer record
 * is filled from every capture source first — Google's identity, the
 * verified phone — and this form asks only for what no source can
 * hand us: a postal address. Whatever is entered here is saved to
 * the customer's address book (customer_addresses), which is what
 * their portal shows and what checkout pre-fills from. Skippable —
 * an offer, never a wall. Accounts that already hold any address
 * pass straight through.
 */
export default async function CompleteProfilePage({
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
  if (appEmailGateApplies(user) || !isPhoneVerified(user)) {
    redirect(await gatePathForAccount(user, next));
  }

  const { data: existing } = await supabase
    .from("customer_addresses")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);
  if (existing && existing.length > 0) {
    redirect(next);
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    (typeof meta.display_name === "string" && meta.display_name) ||
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    "";
  const [firstName, ...rest] = displayName.split(/\s+/).filter(Boolean);
  const cardAvatar = typeof meta.avatar_url === "string" ? meta.avatar_url : "";
  const cardPhone = typeof meta.phone === "string" ? meta.phone : "";
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];
  const fromGoogle = providers.includes("google");

  // Forward-compatible: when Google capture widens (People API), the
  // callback stores the returned address on the metadata as
  // google_address; this form pre-fills from it and the customer
  // confirms rather than types.
  const g = (meta.google_address ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const prefill = {
    first_name: str(g.first_name) || firstName || "",
    last_name: str(g.last_name) || rest.join(" "),
    line1: str(g.line1),
    line2: str(g.line2),
    city: str(g.city),
    state: str(g.state),
    postal_code: str(g.postal_code),
    country_code: str(g.country_code) || "US",
    phone: str(g.phone) || cardPhone,
  };

  return (
    <AuthShell
      eyebrow="Your record"
      heading={
        <>
          Where should orders <em>find you?</em>
        </>
      }
      sub="Your name, email and phone are already on your record. An address is the one thing nobody can capture for you — add it once here and it lives in your portal, filled in at every checkout."
    >
      <CompleteProfileForm
        next={next}
        cardName={displayName}
        cardEmail={user.email ?? ""}
        cardAvatar={cardAvatar}
        cardPhone={cardPhone}
        fromGoogle={fromGoogle}
        prefill={prefill}
      />
    </AuthShell>
  );
}
