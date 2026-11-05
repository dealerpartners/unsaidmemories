import { redirect } from 'next/navigation';

/**
 * CRM route reversal R1 (owner ruling 2026-10-31 05:52 CDT): the native
 * Fabric CRM routes are deprecated. Leads has a real equivalent on the
 * surviving imported face — its own route:
 *
 *   /admin/crm/leads → /admin/leads
 *
 * Query params are forwarded untouched. The native page stays in git
 * history; its components (src/components/crm/LeadTools) remain on
 * disk untouched (preservation law).
 */
export default async function CrmLeadsRedirect({
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
  redirect(qs ? `/admin/leads?${qs}` : '/admin/leads');
}
