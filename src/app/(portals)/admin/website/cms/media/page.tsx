import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { MediaLibraryView } from "@/components/admin/cms-sections";

export const dynamic = "force-dynamic";

/** CMS — Media Library & CDN Optimizer. Real route (Sunny's spec: the CMS sidebar routes to every page; this replaces the ?view= section on the CMS dashboard). */
export default async function CmsMediaPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  return (
    <div>
      <PageHead title="Media Library & CDN Optimizer" />
      <MediaLibraryView />
    </div>
  );
}
