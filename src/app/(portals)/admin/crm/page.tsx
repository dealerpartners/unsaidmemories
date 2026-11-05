import { redirect } from 'next/navigation';

/**
 * CRM route reversal R1 (owner ruling 2026-10-31 05:52 CDT): the native
 * Fabric CRM routes are deprecated — the imported customers face
 * (/admin/customers, CustomersView) is the surviving CRM design, and the
 * nav tree / FabricShell mega menu land there. This page redirects to
 * it, forwarding query params untouched.
 *
 *   /admin/crm → /admin/customers
 *
 * The native page this replaces stays in git history; the native CRM
 * components (src/components/crm/*, CrmShell, crm.css) remain on disk
 * untouched (preservation law) — simply unrouted.
 */
export default async function CrmCustomersRedirect({
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
