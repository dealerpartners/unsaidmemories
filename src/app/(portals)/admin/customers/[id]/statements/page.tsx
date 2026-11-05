import WorkspacePage from "@/components/contacts/WorkspacePage";

export const dynamic = "force-dynamic";

/** Contacts workspace — Statements tab (real route). */
export default async function ContactStatementsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkspacePage contactId={id} activeTab="statements" />;
}
