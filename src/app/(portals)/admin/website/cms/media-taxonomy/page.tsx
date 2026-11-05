import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { MediaTaxonomyView } from "@/components/admin/cms-missing-sections";

export const dynamic = "force-dynamic";

/** CMS — Media Taxonomy & CDN Storage. Real route (Sunny's spec: the CMS sidebar routes to every page; this replaces the ?view= section on the CMS dashboard). */
export default async function CmsMediaTaxonomyPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  return (
    <div>
      <PageHead title="Media Taxonomy & CDN Storage" />
      <MediaTaxonomyView />
    </div>
  );
}
