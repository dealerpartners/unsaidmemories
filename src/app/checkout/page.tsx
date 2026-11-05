import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/server";
import { gatePathForAccount } from "@/lib/auth-gate";
import { CheckoutClient } from "./checkout-client";

export const metadata: Metadata = {
  title: "Checkout — UnSaid",
  description: "Secure checkout with per-package shipping, quoted before you pay.",
};
export const dynamic = "force-dynamic";

// Guest checkout: a person may check out without an account. Email +
// phone + address are collected at checkout; the Stripe webhook captures
// a crm_customers row keyed by email so the order is never orphaned.
// Signed-in customers get their saved address prefilled and their
// customer_id linked on the order row.
export default async function CheckoutPage() {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // First-checkout backstop (Twilio Verify): a signed-in account with
  // no verified phone verifies before it can pay — this catches every
  // account created before the signup gate existed. The bag is
  // untouched; approval stamps the account and the verify screen
  // sends the user straight back here. Guests still check out as
  // guests (their phone is collected on this page).
  if (user) {
    const gated = await gatePathForAccount(user, "/checkout");
    if (gated !== "/checkout") redirect(gated);
  }

  return (
    <main className="section" style={{ paddingTop: 48, paddingBottom: 80 }}>
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">Checkout</span>
          <h2>
            Where should it <em>go?</em>
          </h2>
        </div>
        <div className="heading-aside">
          <p>
            {user
              ? `Signed in as ${user.email}.`
              : "Checking out as a guest — your email links the order."}{" "}
            Shipping is quoted per package from live rates, before you pay.
          </p>
        </div>
      </div>
      <CheckoutClient
        customerId={user?.id ?? null}
        email={user?.email ?? ""}
      />
    </main>
  );
}
