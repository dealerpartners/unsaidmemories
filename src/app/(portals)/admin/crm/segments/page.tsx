import { redirect } from 'next/navigation';

/**
 * CRM route reversal R1 (owner ruling 2026-10-31 05:52 CDT): the native
 * Fabric CRM routes are deprecated — the imported customers face
 * (/admin/customers) is the surviving CRM design.
 *
 *   /admin/crm/segments → /admin/customers
 *
 * GAP (documented in CRM-REVERSAL.md, not faked): the surviving face
 * has no segments route — segment filters and saved views live inside
 * CustomersView's directory, with no URL of their own. This redirect
 * lands on the directory. The native page stays in git history; its
 * components remain on disk untouched (preservation law).
 */
export default async function CrmSegmentsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => u.append(k, x));
    else if (v !== undefined) u.set(k, v);
  }
  const qs = u.toString();
  redirect(qs ? `/admin/customers?${qs}` : '/admin/customers');
}
