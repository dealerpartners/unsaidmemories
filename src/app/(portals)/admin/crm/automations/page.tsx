import { redirect } from 'next/navigation';

/**
 * CRM route reversal R1 (owner ruling 2026-10-31 05:52 CDT): the native
 * Fabric CRM routes are deprecated. Automations has a real equivalent
 * on the surviving imported face — the imported admin's automations
 * page (AutomationView):
 *
 *   /admin/crm/automations → /admin/automation
 *
 * Query params are forwarded untouched. The native page stays in git
 * history; its components (src/components/crm/AutomationTools) remain
 * on disk untouched (preservation law).
 */
export default async function CrmAutomationsRedirect({
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
  redirect(qs ? `/admin/automation?${qs}` : '/admin/automation');
}
