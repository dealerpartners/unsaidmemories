import type { Metadata } from "next";
import { PreferencesSection } from "../account-sections";

export const metadata: Metadata = { title: "Preferences — UnSaid" };

export default function AccountPreferencesPage() {
  return <PreferencesSection />;
}
