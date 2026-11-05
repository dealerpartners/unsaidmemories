"use client";

import { PageHeader } from "@/components/ads/v2-ui";
import { AccountSettingsForm } from "@/components/ads/settings-form";

// Marketing Settings (2.6) — defaults for objectives, CTAs, landing
// domain, and UTM tagging on this ad account.

export default function MarketingSettingsPage() {
  return (
    <div>
      <PageHeader
        title="Marketing Settings"
        description="The defaults your campaigns start from — objective, call to action, landing domain, and UTM tags."
        breadcrumbs={[
          { label: "Ad Center", href: "/ads" },
          { label: "Settings", href: "/ads/settings" },
          { label: "Marketing Settings" },
        ]}
      />
      <AccountSettingsForm kind="marketing" />
    </div>
  );
}
