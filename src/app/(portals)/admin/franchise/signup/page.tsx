'use client';

/* Admin → Franchise → Signup: onboard a new franchise shop.
 * One form → POST /api/admin/franchise/signup creates the franchise tenant
 * (child of the UnSaid Memories master), franchise record, agreement, primary
 * location, franchise-owner portal user, and sends the invite email.
 */

import { useState } from 'react';

type Done = {
  tenant_id: string;
  franchise_location_id: string;
  agreement_id: string | null;
  location_id: string | null;
  portal_user_id: string | null;
  slug: string;
  email_sent: boolean;
  provisioning?: {
    template: { assigned: boolean; key: string | null; note?: string };
    domain: string | null;
  };
};

export default function FranchiseSignupPage() {
  const [form, setForm] = useState({
    businessName: '',
    slug: '',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    phone: '',
    email: '',
    wordpress_url: '',
    domain: '',
    royalty_rate: '',
    sendInvite: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const set = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/franchise/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          royalty_rate: form.royalty_rate ? Number(form.royalty_rate) : null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Signup failed');
      setDone(json.data);
    } catch (e: any) {
      setError(e?.message || 'Signup failed');
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setDone(null);
    setForm({
      businessName: '', slug: '', ownerName: '', ownerEmail: '', ownerPhone: '',
      address_line1: '', address_line2: '', city: '', state: '', postal_code: '',
      phone: '', email: '', wordpress_url: '', domain: '', royalty_rate: '', sendInvite: true,
    });
  }

  const input = 'mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm';
  const label = 'text-xs font-medium text-muted-foreground';

  if (done) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 rounded-xl">
          <h1 className="text-xl font-bold text-green-900 dark:text-green-100">Franchise created</h1>
          <p className="text-sm text-green-800 dark:text-green-200 mt-1">
            {form.businessName || 'The new shop'} is live as a franchise tenant.
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">URL slug</dt><dd className="font-mono">{done.slug}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Tenant</dt><dd className="font-mono text-xs">{done.tenant_id.slice(0, 8)}…</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Owner portal user</dt><dd className="font-mono text-xs">{done.portal_user_id ? done.portal_user_id.slice(0, 8) + '…' : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Primary location</dt><dd>{done.location_id ? 'Created' : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Agreement</dt><dd>{done.agreement_id ? 'Pending signature' : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Invite email</dt><dd>{done.email_sent ? 'Sent' : 'Not sent'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Website domain</dt><dd className="font-mono text-xs">{done.provisioning?.domain || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Site template</dt><dd>{done.provisioning?.template.assigned ? `Assigned (${done.provisioning.template.key})` : 'Default applies (assignment skipped)'}</dd></div>
          </dl>
          <div className="flex gap-2 mt-6">
            <a href="/admin/settings/locations" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">View Locations</a>
            <a href="/admin/settings/users" className="px-4 py-2 rounded-lg border border-border text-sm">Manage Users</a>
            <button onClick={reset} className="px-4 py-2 rounded-lg border border-border text-sm">Onboard Another</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">Franchise Signup</h1>

      {error && (
        <div className="mb-4 p-3 rounded-lg adm-badge adm-badge-red text-sm dark:bg-red-950 dark:text-red-200">{error}</div>
      )}

      <div className="space-y-4">
        <div className="border border-border rounded-xl space-y-3">
          <h2 className="text-sm font-bold">Business</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={label}>Business name *</label>
              <input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder="Unsaid Memories — Austin" className={input} />
            </div>
            <div>
              <label className={label}>URL slug (auto from name)</label>
              <input value={form.slug} onChange={(e) => set('slug', e.target.value)} placeholder="unsaid-memories-austin" className={input} />
            </div>
            <div>
              <label className={label}>Royalty rate %</label>
              <input value={form.royalty_rate} onChange={(e) => set('royalty_rate', e.target.value)} placeholder="7" inputMode="decimal" className={input} />
            </div>
            <div className="col-span-2">
              <label className={label}>WordPress / storefront URL</label>
              <input value={form.wordpress_url} onChange={(e) => set('wordpress_url', e.target.value)} placeholder="https://austinprints.com" className={input} />
            </div>
            <div className="col-span-2">
              <label className={label}>Website domain (optional)</label>
              <input value={form.domain} onChange={(e) => set('domain', e.target.value)} placeholder="portalaustin.com" className={input} />
              <p className="mt-1 text-xs text-muted-foreground">The custom domain this shop's website answers on — the public site resolves it to this tenant (brand, settings, template).</p>
            </div>
          </div>
        </div>

        <div className="border border-border rounded-xl space-y-3">
          <h2 className="text-sm font-bold">Owner</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Owner name *</label>
              <input value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>Owner phone</label>
              <input value={form.ownerPhone} onChange={(e) => set('ownerPhone', e.target.value)} className={input} />
            </div>
            <div className="col-span-2">
              <label className={label}>Owner email * (login + invite)</label>
              <input value={form.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} type="email" className={input} />
            </div>
          </div>
        </div>

        <div className="border border-border rounded-xl space-y-3">
          <h2 className="text-sm font-bold">Primary location</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={label}>Address line 1</label>
              <input value={form.address_line1} onChange={(e) => set('address_line1', e.target.value)} className={input} />
            </div>
            <div className="col-span-2">
              <label className={label}>Address line 2</label>
              <input value={form.address_line2} onChange={(e) => set('address_line2', e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>City</label>
              <input value={form.city} onChange={(e) => set('city', e.target.value)} className={input} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>State</label>
                <input value={form.state} onChange={(e) => set('state', e.target.value)} className={input} />
              </div>
              <div>
                <label className={label}>ZIP</label>
                <input value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} className={input} />
              </div>
            </div>
            <div>
              <label className={label}>Shop phone</label>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>Shop email</label>
              <input value={form.email} onChange={(e) => set('email', e.target.value)} type="email" className={input} />
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.sendInvite} onChange={(e) => set('sendInvite', e.target.checked)} className="rounded" />
          Send onboarding invite email to the owner
        </label>

        <button
          onClick={submit}
          disabled={saving}
          className="w-full px-4 py-3 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
        >
          {saving ? 'Creating franchise…' : 'Create Franchise'}
        </button>
      </div>
    </div>
  );
}
