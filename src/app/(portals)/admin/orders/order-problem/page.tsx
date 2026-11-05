import type { Metadata } from "next";
import OrderProblemWizard from "./order-problem-wizard";

export const metadata: Metadata = { title: "Order Problem — Admin" };
export const dynamic = "force-dynamic";

/**
 * Something's Wrong With an Order wizard — the guided Orders entry,
 * launched from the Orders page's quick actions. Opens a support
 * case carrying the order and ends on the case reference as proof.
 * (Its case-creation endpoint ships with the Support Desk pass.)
 */
export default function OrderProblemPage() {
  return <OrderProblemWizard />;
}
