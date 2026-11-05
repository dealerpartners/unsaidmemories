import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { PagesView } from "@/components/admin/cms-sections";

export const dynamic = "force-dynamic";

/** CMS — Pages & Routes. Real route (Sunny's spec: the CMS sidebar routes to every page; this replaces the ?view= section on the CMS dashboard). */
export default async function CmsPagesPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  return (
    <div>
      <PageHead title="Pages & Routes" />
      <PagesView />
    </div>
  );
}
