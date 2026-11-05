import type { Metadata } from "next";
import NewCustomerWizard from "./new-customer-wizard";

export const metadata: Metadata = { title: "Add a Customer — Admin" };
export const dynamic = "force-dynamic";

/**
 * Add a Customer wizard — the guided CRM entry, launched from the
 * customer directory's "Add step by step" button. Ends on proof:
 * the created customer, named, with the way to their profile.
 */
export default function NewCustomerPage() {
  return <NewCustomerWizard />;
}
