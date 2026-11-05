import type { Metadata } from "next";
import { SavedSection } from "../account-sections";

export const metadata: Metadata = { title: "Saved — UnSaid" };

export default function AccountSavedPage() {
  return <SavedSection />;
}
