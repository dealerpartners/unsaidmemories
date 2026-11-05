import type { Metadata } from "next";
import { OverviewSection } from "./account-sections";

export const metadata: Metadata = {
  title: "Your account — UnSaid",
  description: "Your orders, saved items, posts, and preferences.",
};

export default function AccountOverviewPage() {
  return <OverviewSection />;
}
