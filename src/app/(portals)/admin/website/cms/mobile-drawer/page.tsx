import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { MobileDrawerView } from "@/components/admin/cms-missing-sections";

export const dynamic = "force-dynamic";

/** CMS — Mobile App Drawer & Slide-out. Real route (Sunny's spec: the CMS sidebar routes to every page; this replaces the ?view= section on the CMS dashboard). */
export default async function CmsMobileDrawerPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  return (
    <div>
      <PageHead title="Mobile App Drawer & Slide-out" />
      <MobileDrawerView />
    </div>
  );
}
