import type { Metadata } from "next";
import { NotificationsSection } from "../account-sections";

export const metadata: Metadata = { title: "Notifications — UnSaid" };

export default function AccountNotificationsPage() {
  return <NotificationsSection />;
}
