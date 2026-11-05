import WorkspacePage from "@/components/contacts/WorkspacePage";

export const dynamic = "force-dynamic";

/** Contacts workspace — Opportunities tab (real route). */
export default async function ContactOpportunitiesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkspacePage contactId={id} activeTab="opportunities" />;
}
