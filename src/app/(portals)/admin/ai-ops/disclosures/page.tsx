'use client';

import { useEffect, useState } from 'react';
import { FileCheck, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type Disclosure = {
  id: string; tag: string; audience: string; title: string | null; body: string | null;
  version: number; status: 'active' | 'archived'; updated_at: string;
};
type Acceptance = {
  id: string; feature: string; acknowledged_at: string; seller_id: string; seller_name: string | null;
};
type CustomerAcceptance = {
  id: string; feature: string; acknowledged_at: string; customer_id: string | null;
  customer_name: string | null; customer_email: string | null;
};
type TelemedAcceptance = {
  id: string; feature: string; acknowledged_at: string; actor_type: string;
  user_id: string; actor_name: string | null;
};

const inputCls = 'w-full border border-border rounded-lg px-3 py-2 text-[13px] bg-background';

export default function AiDisclosuresPage() {
  const [disclosures, setDisclosures] = useState<Disclosure[]>([]);
  const [acceptanceLog, setAcceptanceLog] = useState<Acceptance[]>([]);
  const [customerLog, setCustomerLog] = useState<CustomerAcceptance[]>([]);
  const [telemedLog, setTelemedLog] = useState<TelemedAcceptance[]>([]);
  const [acceptanceNote, setAcceptanceNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ tag: '', audience: 'customer', title: '', body: '' });
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  const load = () =>
    fetch('/api/admin/ai-ops/disclosures')
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `HTTP ${r.status}`); return r.json(); })
      .then((d) => { setDisclosures(d.disclosures || []); setAcceptanceLog(d.acceptanceLog || []); setCustomerLog(d.customerLog || []); setTelemedLog(d.telemedLog || []); setAcceptanceNote(d.acceptanceNote || ''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.tag.trim()) { setError('Tag is required.'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/admin/ai-ops/disclosures', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setForm({ tag: '', audience: 'customer', title: '', body: '' });
      setShowForm(false);
      await load();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const saveEdit = async (d: Disclosure) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/ai-ops/disclosures/${d.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editBody }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setEditing(null);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const setStatus = async (d: Disclosure, status: 'active' | 'archived') => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/ai-ops/disclosures/${d.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <FileCheck className="size-6" /> AI Disclosures
          </h1>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-[13px] font-semibold flex items-center gap-2 cursor-pointer">
          {showForm ? <X className="size-4" /> : <Plus className="size-4" />} New Disclosure
        </button>
      </div>

      {error && <p className="text-[13px] text-destructive">{error}</p>}

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Tag (e.g. kinnect-ai-tele-triage)" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} />
            <select className={inputCls} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
              <option value="seller">seller</option>
              <option value="customer">customer</option>
              <option value="telemedicine">telemedicine</option>
            </select>
            <input className={inputCls} placeholder="Title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <textarea className={inputCls} rows={4} placeholder="Disclosure copy" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <button onClick={create} disabled={saving} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-semibold cursor-pointer disabled:opacity-50">
            {saving ? 'Saving…' : 'Author disclosure'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : (
        <>
          {disclosures.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <FileCheck className="size-10 mx-auto text-muted-foreground/40" />
              <p className="text-[14px] font-medium text-foreground mt-3">No disclosures authored yet.</p>
              <p className="text-[13px] text-muted-foreground mt-1 max-w-lg mx-auto">
                The registry store (<span className="font-mono text-[12px]">ai_disclosures</span>) is live and
                empty. Today the platform's one shipped AI disclosure — Kinnect's, tagged
                kinnect-ai-tele-triage — renders as interface copy in the product, not from this registry;
                authoring it here is what moves it under registry management.
              </p>
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="adm-table-wrap"><table className="adm-table">
                <thead>
                  <tr>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Tag</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Audience</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Title</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Version</th>
                    <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="p-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {disclosures.map((d) => (
                    <tr key={d.id} className="border-t border-border hover:bg-muted/50 align-top">
                      <td className="p-3 font-mono text-[12px]">{d.tag}</td>
                      <td className="p-3 text-muted-foreground">{d.audience}</td>
                      <td className="p-3 text-muted-foreground">
                        {d.title ?? '—'}
                        {editing === d.id ? (
                          <div className="mt-2 space-y-2">
                            <textarea className={inputCls} rows={4} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
                            <div className="flex gap-3">
                              <button onClick={() => saveEdit(d)} className="text-primary hover:underline text-[12px] cursor-pointer">Save (bumps version)</button>
                              <button onClick={() => setEditing(null)} className="text-muted-foreground hover:underline text-[12px] cursor-pointer">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          d.body ? <span className="block text-[12px] mt-1 whitespace-pre-wrap">{d.body}</span> : null
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">v{d.version}</td>
                      <td className="p-3"><Badge variant={d.status === 'active' ? 'default' : 'secondary'}>{d.status}</Badge></td>
                      <td className="p-3 text-right space-x-3 whitespace-nowrap">
                        <button onClick={() => { setEditing(d.id); setEditBody(d.body ?? ''); }} className="text-primary hover:underline text-[11px] cursor-pointer">Edit copy</button>
                        {d.status === 'active'
                          ? <button onClick={() => setStatus(d, 'archived')} className="text-primary hover:underline text-[11px] cursor-pointer">Archive</button>
                          : <button onClick={() => setStatus(d, 'active')} className="text-primary hover:underline text-[11px] cursor-pointer">Activate</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}

          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h2 className="text-[14px] font-semibold text-foreground">Acceptance log</h2>
            <p className="text-[12px] text-muted-foreground">{acceptanceNote}</p>
            {acceptanceLog.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No seller acknowledgments recorded yet. Sellers acknowledge AI features from the seller portal; each acknowledgment lands in <span className="font-mono text-[12px]">seller_ai_disclosures</span> and reads back here.</p>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="adm-table-wrap"><table className="adm-table">
                  <thead>
                    <tr>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Seller</th>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Feature</th>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Acknowledged</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acceptanceLog.map((a) => (
                      <tr key={a.id} className="border-t border-border hover:bg-muted/50">
                        <td className="p-3 font-medium">{a.seller_name ?? a.seller_id}</td>
                        <td className="p-3 text-muted-foreground font-mono text-[12px]">{a.feature}</td>
                        <td className="p-3 text-muted-foreground">{new Date(a.acknowledged_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            )}

            <h3 className="text-[13px] font-semibold text-foreground pt-2">Customer acknowledgments</h3>
            {customerLog.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No customer acknowledgments recorded yet. Customers acknowledge AI disclosures from their own surfaces (recorded via <span className="font-mono text-[12px]">/api/customer/ai-disclosures</span>) into <span className="font-mono text-[12px]">customer_ai_disclosure_acks</span>.</p>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="adm-table-wrap"><table className="adm-table">
                  <thead>
                    <tr>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Customer</th>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Feature</th>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Acknowledged</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerLog.map((a) => (
                      <tr key={a.id} className="border-t border-border hover:bg-muted/50">
                        <td className="p-3 font-medium">{a.customer_name ?? a.customer_email ?? a.customer_id ?? '—'}</td>
                        <td className="p-3 text-muted-foreground font-mono text-[12px]">{a.feature}</td>
                        <td className="p-3 text-muted-foreground">{new Date(a.acknowledged_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            )}

            <h3 className="text-[13px] font-semibold text-foreground pt-2">Telemedicine acknowledgments</h3>
            {telemedLog.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No telemedicine acknowledgments recorded yet. Vets and pharmacies acknowledge AI disclosures from the telemedicine surfaces (recorded via <span className="font-mono text-[12px]">/api/telemed/ai-disclosures</span>) into <span className="font-mono text-[12px]">telemed_ai_disclosure_acks</span>.</p>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="adm-table-wrap"><table className="adm-table">
                  <thead>
                    <tr>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actor</th>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Type</th>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Feature</th>
                      <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Acknowledged</th>
                    </tr>
                  </thead>
                  <tbody>
                    {telemedLog.map((a) => (
                      <tr key={a.id} className="border-t border-border hover:bg-muted/50">
                        <td className="p-3 font-medium">{a.actor_name ?? a.user_id}</td>
                        <td className="p-3 text-muted-foreground capitalize">{a.actor_type}</td>
                        <td className="p-3 text-muted-foreground font-mono text-[12px]">{a.feature}</td>
                        <td className="p-3 text-muted-foreground">{new Date(a.acknowledged_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
