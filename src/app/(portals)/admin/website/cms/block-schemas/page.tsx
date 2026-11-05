import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { BlockSchemasView } from "@/components/admin/cms-missing-sections";

export const dynamic = "force-dynamic";

/** CMS — Content Blocks JSON Schema. Real route (Sunny's spec: the CMS sidebar routes to every page; this replaces the ?view= section on the CMS dashboard). */
export default async function CmsBlockSchemasPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  return (
    <div>
      <PageHead title="Content Blocks JSON Schema" />
      <BlockSchemasView />
    </div>
  );
}
