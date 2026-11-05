import type { Metadata } from "next";
import { AddressesSection } from "../addresses-section";

export const metadata: Metadata = { title: "Your addresses — UnSaid" };

export default function AccountAddressesPage() {
  return <AddressesSection />;
}
