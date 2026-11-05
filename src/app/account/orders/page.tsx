import type { Metadata } from "next";
import { OrdersSection } from "../account-sections";

export const metadata: Metadata = { title: "Your orders — UnSaid" };

export default function AccountOrdersPage() {
  return <OrdersSection />;
}
