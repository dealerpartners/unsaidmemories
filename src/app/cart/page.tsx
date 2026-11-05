import type { Metadata } from "next";
import { CartClient } from "./cart-client";

export const metadata: Metadata = {
  title: "Your bag — UnSaid",
  description: "Review your bag, shipping options, and proceed to checkout.",
};

export default function CartPage() {
  return (
    <main className="section" style={{ paddingTop: 48, paddingBottom: 80 }}>
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">Your bag</span>
          <h2>
            Almost <em>yours.</em>
          </h2>
        </div>
        <div className="heading-aside">
          <p>
            Review your pieces, see exactly how they ship, and check out
            when you're ready.
          </p>
        </div>
      </div>
      <CartClient />
    </main>
  );
}
