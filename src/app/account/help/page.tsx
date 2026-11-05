import type { Metadata } from "next";
import { HelpSection } from "../account-sections";

export const metadata: Metadata = { title: "Help and care — UnSaid" };

export default function AccountHelpPage() {
  return <HelpSection />;
}
