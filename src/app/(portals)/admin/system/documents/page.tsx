import { getAdminContext } from "@/lib/admin/gate";
import { getTenantRow } from "@/lib/admin/data";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { DocumentCenterEditor } from "@/components/admin/SystemWidgets";

export const dynamic = "force-dynamic";

/** System → Document Center (tree: Guides, Policies, Disclaimers,
 *  Create New Section): documents are stored on the tenant settings
 *  record and edited here. */
export default async function DocumentsPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  const tenant = await getTenantRow();
  const docs = (tenant?.settings.documents as Record<string, Array<{ title: string; body: string }>>) ?? {};

  return (
    <div>
      <PageHead title="Document Center" />
      <DocumentCenterEditor initial={{ guides: docs.guides ?? [], policies: docs.policies ?? [], disclaimers: docs.disclaimers ?? [] }} />
    </div>
  );
}
