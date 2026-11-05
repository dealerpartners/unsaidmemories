import WorkspacePage from "@/components/contacts/WorkspacePage";

export const dynamic = "force-dynamic";

/**
 * Contacts workspace for one contact — Transaction List tab (the QB
 * default tab). Supersedes the pre-workspace redirect to
 * /admin/customers?customer_id=… (that deep link still works on the
 * index route). Every other tab is a real route under this segment.
 */
export default async function CustomerWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkspacePage contactId={id} activeTab="transactions" />;
}
