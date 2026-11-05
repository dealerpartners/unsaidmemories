import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { LocaleSyncView } from "@/components/admin/cms-missing-sections";

export const dynamic = "force-dynamic";

/** CMS — Locale Translation Sync. Real route (Sunny's spec: the CMS sidebar routes to every page; this replaces the ?view= section on the CMS dashboard). */
export default async function CmsLocaleSyncPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  return (
    <div>
      <PageHead title="Locale Translation Sync" />
      <LocaleSyncView />
    </div>
  );
}
