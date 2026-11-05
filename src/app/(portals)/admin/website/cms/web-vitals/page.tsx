import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { WebVitalsView } from "@/components/admin/cms-missing-sections";

export const dynamic = "force-dynamic";

/** CMS — Core Web Vitals & Performance. Real route (Sunny's spec: the CMS sidebar routes to every page; this replaces the ?view= section on the CMS dashboard). */
export default async function CmsWebVitalsPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  return (
    <div>
      <PageHead title="Core Web Vitals & Performance" />
      <WebVitalsView />
    </div>
  );
}
