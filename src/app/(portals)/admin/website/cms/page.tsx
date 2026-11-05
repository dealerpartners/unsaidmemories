import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { CmsDashboard } from "@/components/admin/cms-dashboard";

export const dynamic = "force-dynamic";

/** Website → CMS & Content: the Experience Studio overview.
 *  Every CMS section is its own page in the sidebar (Sunny's spec);
 *  legacy ?view= links redirect to the real route. */
export default async function WebsiteCmsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const sp = await searchParams;
  if (sp.view) redirect(`/admin/website/cms/${sp.view}`);

  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;

  return (
    <div>
      <PageHead
        title="CMS & Content"
      />
      <CmsDashboard />
    </div>
  );
}
