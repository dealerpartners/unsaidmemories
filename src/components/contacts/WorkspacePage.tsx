import { notFound } from "next/navigation";
import ContactsWorkspace, { type TabKey } from "./ContactsWorkspace";
import {
  getContact,
  getContactSummary,
  getContactTickets,
  listContacts,
} from "@/lib/contacts/data";

/**
 * Server assembler for the Contacts workspace — used by every route
 * under /admin/customers so the workspace (master list + header +
 * summary + tab) is identical no matter which tab route was hit; only
 * the active tab differs. Data comes from src/lib/contacts/data.ts
 * (crm_customers + acct_ar_invoices + support_tickets, tenant-scoped).
 */
export default async function WorkspacePage({
  contactId,
  activeTab,
  autoEdit = false,
}: {
  /** Explicit contact (from the [id] route, or ?customer_id= on the
   *  index — the deep link older surfaces still point at). When null,
   *  the workspace opens on the most recently updated contact. */
  contactId?: string | null;
  activeTab: TabKey;
  autoEdit?: boolean;
}) {
  const contacts = await listContacts();
  const selectedId = contactId ?? contacts[0]?.id ?? null;
  const contact = selectedId ? await getContact(selectedId) : null;
  if (contactId && !contact) notFound();

  const [summary, tickets] = contact
    ? await Promise.all([getContactSummary(contact), getContactTickets(contact)])
    : [{ openBalance: 0, overdueBalance: 0 }, []];

  return (
    <ContactsWorkspace
      contacts={contacts}
      contact={contact}
      summary={summary}
      tickets={tickets}
      activeTab={activeTab}
      autoEdit={autoEdit}
    />
  );
}
