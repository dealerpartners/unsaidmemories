"use client";

import { PageHeader } from "@/components/ads/v2-ui";
import { AccountSettingsForm } from "@/components/ads/settings-form";

// Notification preferences — the account's notifications settings
// document (billing, delivery alerts, verification, weekly summary).

export default function NotificationSettingsPage() {
  return (
    <div>
      <PageHeader
        title="Notification Settings"
        description="Which account notifications you receive."
        breadcrumbs={[
          { label: "Ad Center", href: "/ads" },
          { label: "Settings", href: "/ads/settings" },
          { label: "Notification Settings" },
        ]}
      />
      <AccountSettingsForm kind="notifications" />
    </div>
  );
}
