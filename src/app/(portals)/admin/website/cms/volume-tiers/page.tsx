import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { VolumeTiersView } from "@/components/admin/cms-missing-sections";

export const dynamic = "force-dynamic";

/** CMS — Volume Tier Matrix & Bundle Rules. Real route (Sunny's spec: the CMS sidebar routes to every page; this replaces the ?view= section on the CMS dashboard). */
export default async function CmsVolumeTiersPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  return (
    <div>
      <PageHead title="Volume Tier Matrix & Bundle Rules" />
      <VolumeTiersView />
    </div>
  );
}
