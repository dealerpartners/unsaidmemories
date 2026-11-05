import WorkspacePage from "@/components/contacts/WorkspacePage";

export const dynamic = "force-dynamic";

/**
 * Contacts workspace — the ERP's Contacts page (owner ruling
 * 2026-11-01: Contacts live in the ERP under Sales; clicking Contacts
 * opens this master-detail workspace directly on the most recently
 * updated contact, and the page carries its own sidebar = the master
 * list). QuickBooks customer-profile spec, Unsaid palette.
 *
 * The ?customer_id= deep link from older surfaces (and from the
 * pre-workspace /admin/customers/[id] redirect) is honored: it opens
 * the workspace on that contact. The imported CustomersView face this
 * route used to mount is superseded here but PRESERVED on disk
 * (src/components/portal/CustomersView.tsx), unmounted, per the
 * preservation law — see the checkpoint-3 report.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = sp.customer_id;
  const contactId = Array.isArray(raw) ? raw[0] : raw;
  return <WorkspacePage contactId={contactId ?? null} activeTab="transactions" />;
}
