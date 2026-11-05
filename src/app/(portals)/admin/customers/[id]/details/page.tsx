import WorkspacePage from "@/components/contacts/WorkspacePage";

export const dynamic = "force-dynamic";

/** Contacts workspace — Contact Details tab (real route). ?edit=1 opens the
 *  Edit Profile form directly (the ribbon Edit button lands here). */
export default async function ContactDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  return <WorkspacePage contactId={id} activeTab="details" autoEdit={sp.edit === "1"} />;
}
