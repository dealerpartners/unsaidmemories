import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { ContentBlocksEditor } from "@/components/admin/cms-blocks-editor";

export const dynamic = "force-dynamic";

/** CMS — Content Blocks. Real route (Sunny's spec: the CMS sidebar routes to every page; this replaces the ?view= section on the CMS dashboard). */
export default async function CmsBlocksPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  return (
    <div>
      <PageHead title="Content Blocks" />
      <ContentBlocksEditor />
    </div>
  );
}
