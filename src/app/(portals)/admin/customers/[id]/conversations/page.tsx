import WorkspacePage from "@/components/contacts/WorkspacePage";

export const dynamic = "force-dynamic";

/** Contacts workspace — Conversations tab (real route). */
export default async function ContactConversationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkspacePage contactId={id} activeTab="conversations" />;
}
