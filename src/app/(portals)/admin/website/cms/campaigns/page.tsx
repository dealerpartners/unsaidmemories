import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { CampaignsView } from "@/components/admin/cms-sections";

export const dynamic = "force-dynamic";

/** CMS — Campaign Scheduling. Real route (Sunny's spec: the CMS sidebar routes to every page; this replaces the ?view= section on the CMS dashboard). */
export default async function CmsCampaignsPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  return (
    <div>
      <PageHead title="Campaign Scheduling" />
      <CampaignsView />
    </div>
  );
}
