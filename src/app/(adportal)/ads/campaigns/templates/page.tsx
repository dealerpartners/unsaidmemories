"use client";

import { PageHeader } from "@/components/ads/v2-ui";
import { TemplatesManager } from "@/components/ads/templates-manager";

// Campaign Launch Templates (W5).
export default function CampaignTemplatesPage() {
  return (
    <div>
      <PageHeader
        title="Launch Templates"
        description="Saved campaign shapes you can launch from repeatedly."
        breadcrumbs={[
          { label: "Ad Center", href: "/ads" },
          { label: "Campaigns", href: "/ads/campaigns" },
          { label: "Launch Templates" },
        ]}
      />
      <TemplatesManager />
    </div>
  );
}
