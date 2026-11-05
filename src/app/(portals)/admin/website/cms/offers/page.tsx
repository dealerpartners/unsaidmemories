import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { OffersView } from "@/components/admin/cms-sections";

export const dynamic = "force-dynamic";

/** CMS — Discount Offers. Real route (Sunny's spec: the CMS sidebar routes to every page; this replaces the ?view= section on the CMS dashboard). */
export default async function CmsOffersPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  return (
    <div>
      <PageHead title="Discount Offers" />
      <OffersView />
    </div>
  );
}
