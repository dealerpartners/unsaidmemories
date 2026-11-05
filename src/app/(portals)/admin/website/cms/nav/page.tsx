import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { NavigationEditor } from "@/components/admin/cms-editors";

export const dynamic = "force-dynamic";

/** CMS — Storefront Menus & Navigation. Real route (Sunny's spec: the CMS sidebar routes to every page; this replaces the ?view= section on the CMS dashboard). */
export default async function CmsNavPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  return (
    <div>
      <PageHead title="Storefront Menus & Navigation" />
      <NavigationEditor />
    </div>
  );
}
