import type { Metadata } from "next";
import { Suspense } from "react";
import { SuccessClient } from "./success-client";

export const metadata: Metadata = {
  title: "Order status — UnSaid",
  description: "Your order confirmation and fulfillment status.",
};

export default function CheckoutSuccessPage() {
  return (
    <main className="section" style={{ paddingTop: 48, paddingBottom: 80 }}>
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">Order status</span>
          <h2>
            Thank <em>you.</em>
          </h2>
        </div>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading your order…</p>}>
        <SuccessClient />
      </Suspense>
    </main>
  );
}
