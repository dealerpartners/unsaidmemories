"use client";

import { PageHeader } from "@/components/ads/v2-ui";
import { AccountSettingsForm } from "@/components/ads/settings-form";

// Targeting Defaults — the account's default targeting document:
// locations, languages, devices, age range and gender that new
// campaigns start from.

export default function TargetingDefaultsPage() {
  return (
    <div>
      <PageHeader
        title="Targeting Defaults"
        description="Defaults applied to new campaigns unless a campaign overrides them."
        breadcrumbs={[
          { label: "Ad Center", href: "/ads" },
          { label: "Settings", href: "/ads/settings" },
          { label: "Targeting Defaults" },
        ]}
      />
      <AccountSettingsForm kind="targeting_defaults" />
    </div>
  );
}
