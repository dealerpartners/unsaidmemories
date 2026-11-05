import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * CRM route reversal R1 (owner ruling 2026-10-31 05:52 CDT): the native
 * Fabric CRM routes are deprecated — the imported customers face
 * (/admin/customers) is the surviving CRM design.
 *
 *   /admin/crm/segments/[id] → /admin/customers
 *
 * GAP (documented in CRM-REVERSAL.md, not faked): the surviving face
 * addresses no per-segment URL — saved views live inside CustomersView's
 * directory state. This redirect lands on the directory; the segment id
 * is not carried (the face has nothing that could consume it). The
 * native page stays in git history; its components remain on disk
 * untouched (preservation law).
 */
export default async function CrmSegmentDetailRedirect() {
  redirect('/admin/customers');
}
