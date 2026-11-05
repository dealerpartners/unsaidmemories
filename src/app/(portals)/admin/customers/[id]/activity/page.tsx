import WorkspacePage from "@/components/contacts/WorkspacePage";

export const dynamic = "force-dynamic";

/** Contacts workspace — Activity Feed tab (real route). */
export default async function ContactActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkspacePage contactId={id} activeTab="activity" />;
}
