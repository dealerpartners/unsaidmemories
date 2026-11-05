import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * CRM route reversal R1 (owner ruling 2026-10-31 05:52 CDT): the native
 * Fabric CRM profile is deprecated — the surviving CRM design is the
 * imported customers face, where a profile is addressed by the
 * CustomersView deep link:
 *
 *   /admin/crm/customers/[id] → /admin/customers?customer_id=[id]
 *
 * Any other query params are forwarded untouched. The native profile
 * page this replaces stays in git history; its components
 * (src/components/crm/*) remain on disk untouched (preservation law).
 */
export default async function CrmCustomerProfileRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const u = new URLSearchParams();
  u.set('customer_id', id);
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'customer_id') continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, x));
    else if (v !== undefined) u.set(k, v);
  }
  redirect(`/admin/customers?${u.toString()}`);
}
