import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { FunnelView } from "@/components/admin/cms-missing-sections";

export const dynamic = "force-dynamic";

/** CMS — Funnel Conversion & Telemetry. Real route (Sunny's spec: the CMS sidebar routes to every page; this replaces the ?view= section on the CMS dashboard). */
export default async function CmsFunnelPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  return (
    <div>
      <PageHead title="Funnel Conversion & Telemetry" />
      <FunnelView />
    </div>
  );
}
