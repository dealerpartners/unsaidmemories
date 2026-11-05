"use client";

import { PageHeader } from "@/components/ads/v2-ui";
import { AccountSettingsForm } from "@/components/ads/settings-form";

// Branding Settings (2.7) — the brand identity ads carry from this
// account: name, logo, colors, and the suitability floor.

export default function BrandingSettingsPage() {
  return (
    <div>
      <PageHeader
        title="Branding Settings"
        description="How your brand shows on ads from this account."
        breadcrumbs={[
          { label: "Ad Center", href: "/ads" },
          { label: "Settings", href: "/ads/settings" },
          { label: "Branding Settings" },
        ]}
      />
      <AccountSettingsForm kind="branding" />
    </div>
  );
}
