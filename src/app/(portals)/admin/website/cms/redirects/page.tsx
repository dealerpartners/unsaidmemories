import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { RedirectsView } from "@/components/admin/cms-sections";

export const dynamic = "force-dynamic";

/** CMS — URL Redirects. Real route (Sunny's spec: the CMS sidebar routes to every page; this replaces the ?view= section on the CMS dashboard). */
export default async function CmsRedirectsPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  return (
    <div>
      <PageHead title="URL Redirects" />
      <RedirectsView />
    </div>
  );
}
