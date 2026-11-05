import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/** CMS — Storefront Analytics & Heatmap. Real route (Sunny's spec: the CMS sidebar routes to every page; this replaces the ?view= section on the CMS dashboard). */
export default async function CmsAnalyticsPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  return (
    <div>
      <PageHead title="Storefront Analytics & Heatmap" />
      <div style={{ padding: 28 }}><h2>Storefront Analytics &amp; Heatmap</h2><p style={{ color: "var(--muted-foreground)" }}>This page is not built yet.</p></div>
    </div>
  );
}
