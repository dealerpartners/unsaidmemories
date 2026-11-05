'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Plus } from 'lucide-react';

type TaxDoc = {
  id: string;
  seller_id: string;
  seller_name: string;
  doc_type: string;
  tax_year: number | null;
  document_url: string | null;
  status: string;
  created_at: string;
};

type Standing = {
  seller_id: string;
  display_name: string;
  seller_status: string;
  tax_id_on_file: boolean;
  w9_status: string | null;
  form_1099k_years: number[];
};

type SellerOption = { id: string; display_name: string };

type Filing = {
  id: string; jurisdiction: string; period_start: string; period_end: string;
  tax_collected: number | null; amount_remitted: number | null;
  filed_at: string | null; confirmation_number: string | null; status: string;
  notes: string | null; created_at: string; updated_at: string;
};
type Collected = { jurisdiction: string; period_month: string; taxable_amount: number; tax_collected: number; sale_tax_lines: number };
type Exemption = {
  id: string; seller_id: string; seller_name: string; exemption_type: string;
  certificate_ref: string | null; jurisdiction: string | null;
  valid_from: string | null; valid_to: string | null; status: string;
  notes: string | null; created_at: string; updated_at: string; effective_now: boolean;
};
function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDay(v: string | null): string { return v ? String(v).slice(0, 10) : '—'; }

const STATUS_STYLES: Record<string, string> = {
  pending: 'adm-badge adm-badge-amber',
  received: 'bg-brand-teal/10 text-brand-teal',
  verified: 'adm-badge adm-badge-green',
  issued: 'adm-badge adm-badge-green',
  rejected: 'adm-badge adm-badge-red',
  draft: 'bg-neutral-100 text-neutral-600',
  filed: 'bg-brand-teal/10 text-brand-teal',
  accepted: 'adm-badge adm-badge-green',
  amended: 'adm-badge adm-badge-amber',
  pending_review: 'adm-badge adm-badge-amber',
  active: 'adm-badge adm-badge-green',
  expired: 'bg-neutral-100 text-neutral-600',
  revoked: 'adm-badge adm-badge-red',
};

function fmtDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLES[status] || 'bg-neutral-100 text-neutral-600'}`}>
      {status}
    </span>
  );
}

// E3 · Tax Oversight — the seller tax-document register: W-9 collection
// state per seller and the 1099-K records on file. Recording an issued
// 1099-K manually requires the issued form's URL. 1099-K GENERATION is
// built (section below): it computes each seller's gross from recorded
// seller orders and produces the form in-platform; IRS filing is NOT
// performed by the platform and generated forms carry that state.
// Sales-tax remittance filings and seller tax exemptions are managed in
// the sections below, wired to their own APIs/stores.
export default function SellerTaxPage() {
  const [documents, setDocuments] = useState<TaxDoc[]>([]);
  const [standing, setStanding] = useState<Standing[]>([]);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filings, setFilings] = useState<Filing[]>([]);
  const [collected, setCollected] = useState<Collected[] | null>(null);
  const [jurisdictions, setJurisdictions] = useState<string[]>([]);
  const [attribution, setAttribution] = useState<string>('');
  const [remitError, setRemitError] = useState<string | null>(null);
  const [showRemitForm, setShowRemitForm] = useState(false);
  const [remitSaving, setRemitSaving] = useState(false);
  const [remitForm, setRemitForm] = useState({ jurisdiction: '', period_start: '', period_end: '', tax_collected: '', amount_remitted: '', filed_at: '', confirmation_number: '', status: 'draft', notes: '' });
  const [exemptions, setExemptions] = useState<Exemption[]>([]);
  const [exemptError, setExemptError] = useState<string | null>(null);
  const [showExemptForm, setShowExemptForm] = useState(false);
  const [exemptSaving, setExemptSaving] = useState(false);
  const [exemptForm, setExemptForm] = useState({ seller_id: '', exemption_type: 'resale', certificate_ref: '', jurisdiction: '', valid_from: '', valid_to: '', status: 'pending_review', notes: '' });
  const [form, setForm] = useState({
    seller_id: '',
    doc_type: 'W-9',
    tax_year: '',
    document_url: '',
    status: '',
  });

  const load = useCallback(() => {
    fetch('/api/admin/sellers/tax-documents')
      .then((r) => (r.ok ? r.json() : { documents: [], standing: [] }))
      .then((j) => {
        setDocuments((j.documents || []) as TaxDoc[]);
        setStanding((j.standing || []) as Standing[]);
      })
      .catch(() => {
        setDocuments([]);
        setStanding([]);
      })
      .finally(() => setLoading(false));
    fetch('/api/admin/sellers/tax-remittance')
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Remittance load failed'); return j; })
      .then((j) => { setFilings((j.filings || []) as Filing[]); setCollected((j.collected ?? null) as Collected[] | null); setJurisdictions((j.jurisdictions || []) as string[]); setAttribution(String(j.attribution || '')); setRemitError(null); })
      .catch((e) => { setFilings([]); setCollected(null); setRemitError(e instanceof Error ? e.message : 'Remittance load failed'); });
    fetch('/api/admin/sellers/tax-exemptions')
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Exemptions load failed'); return j; })
      .then((j) => { setExemptions((j.exemptions || []) as Exemption[]); setExemptError(null); })
      .catch((e) => { setExemptions([]); setExemptError(e instanceof Error ? e.message : 'Exemptions load failed'); });
    fetch('/api/admin/sellers')
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((j) => setSellers(((j.rows || []) as SellerOption[]).map((s) => ({ id: s.id, display_name: s.display_name }))))
      .catch(() => setSellers([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setError(null);
    if (!form.seller_id) {
      setError('Choose a seller.');
      return;
    }
    if (form.doc_type === '1099-K' && form.status === 'issued' && !form.document_url.trim()) {
      setError("An issued 1099-K needs the issued form's document URL.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/admin/sellers/tax-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seller_id: form.seller_id,
          doc_type: form.doc_type,
          tax_year: form.tax_year ? Number(form.tax_year) : null,
          document_url: form.document_url.trim() || null,
          status: form.status || null,
        }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Record failed');
      setShowForm(false);
      setForm({ seller_id: '', doc_type: 'W-9', tax_year: '', document_url: '', status: '' });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Record failed');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (doc: TaxDoc, status: string) => {
    setError(null);
    try {
      const r = await fetch('/api/admin/sellers/tax-documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: doc.id, status }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Update failed');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const submitRemit = async () => {
    setError(null);
    if (!remitForm.jurisdiction.trim() || !remitForm.period_start || !remitForm.period_end || remitForm.amount_remitted === '') { setError('Remittance needs jurisdiction, period start/end, and amount remitted.'); return; }
    setRemitSaving(true);
    try {
      const r = await fetch('/api/admin/sellers/tax-remittance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jurisdiction: remitForm.jurisdiction.trim(), period_start: remitForm.period_start, period_end: remitForm.period_end, amount_remitted: Number(remitForm.amount_remitted), tax_collected: remitForm.tax_collected === '' ? null : Number(remitForm.tax_collected), filed_at: remitForm.filed_at || null, confirmation_number: remitForm.confirmation_number.trim() || null, status: remitForm.status, notes: remitForm.notes.trim() || null }) });
      const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || 'Remittance record failed');
      setShowRemitForm(false); setRemitForm({ jurisdiction: '', period_start: '', period_end: '', tax_collected: '', amount_remitted: '', filed_at: '', confirmation_number: '', status: 'draft', notes: '' }); load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Remittance record failed'); } finally { setRemitSaving(false); }
  };
  const patchRemit = async (f: Filing, status: string) => {
    setError(null);
    try {
      const body: Record<string, unknown> = { id: f.id, status };
      if ((status === 'filed' || status === 'accepted') && !f.filed_at) body.filed_at = new Date().toISOString().slice(0, 10);
      const r = await fetch('/api/admin/sellers/tax-remittance', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || 'Update failed'); load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); }
  };
  const submitExempt = async () => {
    setError(null);
    if (!exemptForm.seller_id) { setError('Choose a seller for the exemption.'); return; }
    setExemptSaving(true);
    try {
      const r = await fetch('/api/admin/sellers/tax-exemptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seller_id: exemptForm.seller_id, exemption_type: exemptForm.exemption_type, certificate_ref: exemptForm.certificate_ref.trim() || null, jurisdiction: exemptForm.jurisdiction.trim() || null, valid_from: exemptForm.valid_from || null, valid_to: exemptForm.valid_to || null, status: exemptForm.status, notes: exemptForm.notes.trim() || null }) });
      const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || 'Exemption record failed');
      setShowExemptForm(false); setExemptForm({ seller_id: '', exemption_type: 'resale', certificate_ref: '', jurisdiction: '', valid_from: '', valid_to: '', status: 'pending_review', notes: '' }); load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Exemption record failed'); } finally { setExemptSaving(false); }
  };
  const patchExempt = async (ex: Exemption, status: string) => {
    setError(null);
    try {
      const r = await fetch('/api/admin/sellers/tax-exemptions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ex.id, status }) });
      const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || 'Update failed'); load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed'); }
  };
  const deleteExempt = async (ex: Exemption) => {
    setError(null);
    try {
      const r = await fetch('/api/admin/sellers/tax-exemptions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ex.id }) });
      const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || 'Delete failed'); load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Delete failed'); }
  };

  const [genYear, setGenYear] = useState<string>(String(new Date().getFullYear() - 1));
  const [genBusy, setGenBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genResults, setGenResults] = useState<{ seller_id: string; seller_name: string; outcome: string; gross_amount?: number; transaction_count?: number; form_url?: string }[] | null>(null);

  const runGeneration = async () => {
    const year = Number(genYear);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) { setGenError('Enter a valid tax year.'); return; }
    setGenBusy(true); setGenError(null);
    try {
      const r = await fetch('/api/admin/sellers/tax-documents/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tax_year: year }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Generation failed (${r.status})`);
      setGenResults(j.results || []);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : '1099-K generation failed.');
    } finally { setGenBusy(false); }
  };

  const btn = 'rounded-lg border px-2 py-1 text-[12px] font-medium hover:bg-muted';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/sellers" className="inline-flex items-center gap-1.5 text-[13px] font-medium underline underline-offset-2">
          <ArrowLeft className="size-4" /> Seller Management
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2 mt-3">
          <FileText className="size-6" /> Tax Oversight
        </h1>
      </div>

      {error && <div className="text-[13px] text-red-600">{error}</div>}

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold">W-9 standing by seller</h2>
        </div>
        {loading ? (
          <div className="px-5 py-6 text-muted-foreground text-[13px]">Loading…</div>
        ) : standing.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-muted-foreground">No sellers in this tenant yet.</p>
        ) : (
          <div className="adm-table-wrap"><table className="adm-table">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-5 py-3 font-medium text-muted-foreground">Seller</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Tax ID on file</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">W-9 record</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">1099-K issued years</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {standing.map((s) => (
                <tr key={s.seller_id}>
                  <td className="px-5 py-3 font-medium">{s.display_name}</td>
                  <td className="px-5 py-3">{s.tax_id_on_file ? 'Yes' : 'No'}</td>
                  <td className="px-5 py-3">{s.w9_status ? <Badge status={s.w9_status} /> : 'Not collected'}</td>
                  <td className="px-5 py-3">{s.form_1099k_years.length ? s.form_1099k_years.join(', ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold">Document register</h2>
          <button className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium hover:bg-muted" onClick={() => setShowForm((v) => !v)}>
            <Plus className="size-3.5" /> Record document
          </button>
        </div>
        {showForm && (
          <div className="grid grid-cols-1 gap-3 border-b border-border px-5 py-4 md:grid-cols-3">
            <label className="text-[12px] text-muted-foreground">
              Seller
              <select value={form.seller_id} onChange={(e) => setForm({ ...form, seller_id: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]">
                <option value="">Choose…</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>{s.display_name}</option>
                ))}
              </select>
            </label>
            <label className="text-[12px] text-muted-foreground">
              Document
              <select value={form.doc_type} onChange={(e) => setForm({ ...form, doc_type: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]">
                <option value="W-9">W-9</option>
                <option value="1099-K">1099-K</option>
              </select>
            </label>
            <label className="text-[12px] text-muted-foreground">
              Tax year (required for 1099-K)
              <input value={form.tax_year} onChange={(e) => setForm({ ...form, tax_year: e.target.value })} type="number" className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]" placeholder="2026" />
            </label>
            <label className="text-[12px] text-muted-foreground md:col-span-2">
              Document URL
              <input value={form.document_url} onChange={(e) => setForm({ ...form, document_url: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]" placeholder="Where the document artifact lives" />
            </label>
            <label className="text-[12px] text-muted-foreground">
              Status
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]">
                <option value="">Default (W-9: received · 1099-K: pending)</option>
                <option value="pending">Pending</option>
                <option value="received">Received</option>
                <option value="verified">Verified</option>
                <option value="issued">Issued (1099-K, needs URL)</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <div className="md:col-span-3">
              <button className="rounded-lg border border-border bg-card px-4 py-2 text-[13px] font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50" disabled={saving} onClick={submit}>
                {saving ? 'Recording…' : 'Record document'}
              </button>
            </div>
          </div>
        )}
        {loading ? (
          <div className="px-5 py-6 text-muted-foreground text-[13px]">Loading…</div>
        ) : documents.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-muted-foreground">No tax documents recorded yet.</p>
        ) : (
          <div className="adm-table-wrap"><table className="adm-table">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-5 py-3 font-medium text-muted-foreground">Seller</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Document</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Year</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Recorded</th>
                <th className="px-5 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {documents.map((d) => (
                <tr key={d.id}>
                  <td className="px-5 py-3 font-medium">{d.seller_name}</td>
                  <td className="px-5 py-3">{d.doc_type}</td>
                  <td className="px-5 py-3">{d.tax_year ?? '—'}</td>
                  <td className="px-5 py-3"><Badge status={d.status} /></td>
                  <td className="px-5 py-3">{fmtDate(d.created_at)}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {d.doc_type === 'W-9' && d.status === 'received' && (
                        <button className={btn} onClick={() => setStatus(d, 'verified')}>Mark verified</button>
                      )}
                      {d.doc_type === 'W-9' && (d.status === 'pending' || d.status === 'received') && (
                        <button className={btn} onClick={() => setStatus(d, 'rejected')}>Reject</button>
                      )}
                      {d.doc_type === '1099-K' && d.status === 'pending' && d.document_url && (
                        <button className={btn} onClick={() => setStatus(d, 'issued')}>Mark issued</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold">Sales-tax remittance filings (platform-level)</h2>
          <button className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium hover:bg-muted" onClick={() => setShowRemitForm((v) => !v)}><Plus className="size-3.5" /> Record filing</button>
        </div>
        {attribution && <p className="px-5 py-3 text-[12px] text-muted-foreground border-b border-border">{attribution}</p>}
        {showRemitForm && (
          <div className="grid grid-cols-1 gap-3 border-b border-border px-5 py-4 md:grid-cols-3">
            <label className="text-[12px] text-muted-foreground">Jurisdiction
              <input list="remit-jurisdictions" value={remitForm.jurisdiction} onChange={(e) => setRemitForm({ ...remitForm, jurisdiction: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]" placeholder="e.g. Tennessee" />
              <datalist id="remit-jurisdictions">{jurisdictions.map((j) => <option key={j} value={j} />)}</datalist>
            </label>
            <label className="text-[12px] text-muted-foreground">Period start<input type="date" value={remitForm.period_start} onChange={(e) => setRemitForm({ ...remitForm, period_start: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]" /></label>
            <label className="text-[12px] text-muted-foreground">Period end<input type="date" value={remitForm.period_end} onChange={(e) => setRemitForm({ ...remitForm, period_end: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]" /></label>
            <label className="text-[12px] text-muted-foreground">Tax collected ($)<input type="number" step="0.01" min="0" value={remitForm.tax_collected} onChange={(e) => setRemitForm({ ...remitForm, tax_collected: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]" /></label>
            <label className="text-[12px] text-muted-foreground">Amount remitted ($)<input type="number" step="0.01" min="0" value={remitForm.amount_remitted} onChange={(e) => setRemitForm({ ...remitForm, amount_remitted: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]" /></label>
            <label className="text-[12px] text-muted-foreground">Status
              <select value={remitForm.status} onChange={(e) => setRemitForm({ ...remitForm, status: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]"><option value="draft">Draft</option><option value="filed">Filed</option><option value="accepted">Accepted</option><option value="amended">Amended</option></select>
            </label>
            <label className="text-[12px] text-muted-foreground">Filed at<input type="date" value={remitForm.filed_at} onChange={(e) => setRemitForm({ ...remitForm, filed_at: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]" /></label>
            <label className="text-[12px] text-muted-foreground">Confirmation number<input value={remitForm.confirmation_number} onChange={(e) => setRemitForm({ ...remitForm, confirmation_number: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]" /></label>
            <label className="text-[12px] text-muted-foreground">Notes<input value={remitForm.notes} onChange={(e) => setRemitForm({ ...remitForm, notes: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]" /></label>
            <div className="md:col-span-3"><button className="rounded-lg border border-border bg-card px-4 py-2 text-[13px] font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50" disabled={remitSaving} onClick={submitRemit}>{remitSaving ? 'Recording…' : 'Record filing'}</button></div>
          </div>
        )}
        {remitError ? <p className="px-5 py-6 text-[13px] text-red-600">{remitError}</p> : loading ? <div className="px-5 py-6 text-muted-foreground text-[13px]">Loading…</div> : filings.length === 0 ? <p className="px-5 py-6 text-[13px] text-muted-foreground">No remittance filings recorded yet.</p> : (
          <div className="adm-table-wrap"><table className="adm-table"><thead className="border-b border-border bg-muted/40"><tr><th className="px-5 py-3 font-medium text-muted-foreground">Jurisdiction</th><th className="px-5 py-3 font-medium text-muted-foreground">Period</th><th className="px-5 py-3 font-medium text-muted-foreground">Collected</th><th className="px-5 py-3 font-medium text-muted-foreground">Remitted</th><th className="px-5 py-3 font-medium text-muted-foreground">Status</th><th className="px-5 py-3 font-medium text-muted-foreground">Filed / Confirmation</th><th className="px-5 py-3 font-medium text-muted-foreground">Actions</th></tr></thead>
          <tbody className="divide-y divide-border">{filings.map((f) => (<tr key={f.id}><td className="px-5 py-3 font-medium">{f.jurisdiction}</td><td className="px-5 py-3">{fmtDay(f.period_start)} – {fmtDay(f.period_end)}</td><td className="px-5 py-3">{fmtMoney(f.tax_collected)}</td><td className="px-5 py-3">{fmtMoney(f.amount_remitted)}</td><td className="px-5 py-3"><Badge status={f.status} /></td><td className="px-5 py-3">{fmtDay(f.filed_at)}{f.confirmation_number ? ` · ${f.confirmation_number}` : ''}</td><td className="px-5 py-3"><div className="flex flex-wrap gap-1.5">{f.status === 'draft' && <button className={btn} onClick={() => patchRemit(f, 'filed')}>Mark filed</button>}{f.status === 'filed' && <button className={btn} onClick={() => patchRemit(f, 'accepted')}>Mark accepted</button>}{(f.status === 'filed' || f.status === 'accepted') && <button className={btn} onClick={() => patchRemit(f, 'amended')}>Mark amended</button>}</div></td></tr>))}</tbody></table></div>
        )}
        {collected && collected.length > 0 && (
          <div className="border-t border-border px-5 py-4"><h3 className="text-[13px] font-semibold mb-2">Platform tax collected (POS sale tax lines, by month)</h3><div className="adm-table-wrap"><table className="adm-table"><thead><tr><th className="py-1 font-medium text-muted-foreground">Jurisdiction</th><th className="py-1 font-medium text-muted-foreground">Month</th><th className="py-1 font-medium text-muted-foreground">Taxable</th><th className="py-1 font-medium text-muted-foreground">Collected</th><th className="py-1 font-medium text-muted-foreground">Lines</th></tr></thead><tbody>{collected.map((c, i) => (<tr key={i}><td className="py-1">{c.jurisdiction}</td><td className="py-1">{c.period_month}</td><td className="py-1">{fmtMoney(c.taxable_amount)}</td><td className="py-1">{fmtMoney(c.tax_collected)}</td><td className="py-1">{c.sale_tax_lines}</td></tr>))}</tbody></table></div></div>
        )}
        {collected === null && !remitError && <p className="px-5 py-3 text-[12px] text-muted-foreground border-t border-border">Collected-tax context is unavailable in this environment (not shown as zero).</p>}
      </section>

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold">1099-K generation</h2>
          <div className="flex items-center gap-2">
            <label className="text-[12px] text-muted-foreground">Tax year
              <input value={genYear} onChange={(e) => setGenYear(e.target.value)} inputMode="numeric" className="ml-2 w-24 rounded-lg border px-2 py-1.5 text-[13px]" />
            </label>
            <button className="rounded-lg border border-border bg-card px-4 py-2 text-[13px] font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50" disabled={genBusy} onClick={runGeneration}>{genBusy ? 'Generating…' : 'Generate 1099-K forms'}</button>
          </div>
        </div>
        <p className="px-5 py-3 text-[12px] text-muted-foreground border-b border-border">
          Computes each seller&apos;s gross from recorded seller orders (non-cancelled, non-refunded) for the year and
          produces the form in-platform. Re-running a year recomputes the same records — it never duplicates them.
          The platform does not file with the IRS; every generated form carries its real filing status.
        </p>
        {genError ? <p className="px-5 py-4 text-[13px] text-red-600">{genError}</p> : genResults === null ? (
          <p className="px-5 py-4 text-[13px] text-muted-foreground">No generation run yet in this session.</p>
        ) : genResults.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-muted-foreground">No sellers in this tenant.</p>
        ) : (
          <div className="adm-table-wrap"><table className="adm-table"><thead className="border-b border-border bg-muted/40"><tr><th className="px-5 py-3 font-medium text-muted-foreground">Seller</th><th className="px-5 py-3 font-medium text-muted-foreground">Outcome</th><th className="px-5 py-3 font-medium text-muted-foreground">Gross</th><th className="px-5 py-3 font-medium text-muted-foreground">Transactions</th><th className="px-5 py-3 font-medium text-muted-foreground">Form</th></tr></thead>
          <tbody className="divide-y divide-border">{genResults.map((r) => (
            <tr key={r.seller_id}><td className="px-5 py-3 font-medium">{r.seller_name}</td>
            <td className="px-5 py-3">{r.outcome === 'generated' ? 'Generated' : 'Skipped — no reportable activity'}</td>
            <td className="px-5 py-3">{r.outcome === 'generated' ? fmtMoney(r.gross_amount) : '—'}</td>
            <td className="px-5 py-3">{r.outcome === 'generated' ? r.transaction_count : '—'}</td>
            <td className="px-5 py-3">{r.form_url ? <Link href={r.form_url} className="text-primary hover:underline">View form</Link> : '—'}</td></tr>
          ))}</tbody></table></div>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold">Seller tax exemptions</h2>
          <button className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium hover:bg-muted" onClick={() => setShowExemptForm((v) => !v)}><Plus className="size-3.5" /> Record exemption</button>
        </div>
        {showExemptForm && (
          <div className="grid grid-cols-1 gap-3 border-b border-border px-5 py-4 md:grid-cols-3">
            <label className="text-[12px] text-muted-foreground">Seller<select value={exemptForm.seller_id} onChange={(e) => setExemptForm({ ...exemptForm, seller_id: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]"><option value="">Choose…</option>{sellers.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}</select></label>
            <label className="text-[12px] text-muted-foreground">Type<select value={exemptForm.exemption_type} onChange={(e) => setExemptForm({ ...exemptForm, exemption_type: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]"><option value="resale">Resale</option><option value="nonprofit">Nonprofit</option><option value="government">Government</option><option value="tribal">Tribal</option><option value="other">Other</option></select></label>
            <label className="text-[12px] text-muted-foreground">Status<select value={exemptForm.status} onChange={(e) => setExemptForm({ ...exemptForm, status: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]"><option value="pending_review">Pending review</option><option value="active">Active</option><option value="expired">Expired</option><option value="revoked">Revoked</option></select></label>
            <label className="text-[12px] text-muted-foreground">Certificate ref<input value={exemptForm.certificate_ref} onChange={(e) => setExemptForm({ ...exemptForm, certificate_ref: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]" /></label>
            <label className="text-[12px] text-muted-foreground">Jurisdiction<input value={exemptForm.jurisdiction} onChange={(e) => setExemptForm({ ...exemptForm, jurisdiction: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]" /></label>
            <label className="text-[12px] text-muted-foreground">Notes<input value={exemptForm.notes} onChange={(e) => setExemptForm({ ...exemptForm, notes: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]" /></label>
            <label className="text-[12px] text-muted-foreground">Valid from<input type="date" value={exemptForm.valid_from} onChange={(e) => setExemptForm({ ...exemptForm, valid_from: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]" /></label>
            <label className="text-[12px] text-muted-foreground">Valid to<input type="date" value={exemptForm.valid_to} onChange={(e) => setExemptForm({ ...exemptForm, valid_to: e.target.value })} className="mt-1 block w-full rounded-lg border px-2 py-1.5 text-[13px]" /></label>
            <div className="md:col-span-3"><button className="rounded-lg border border-border bg-card px-4 py-2 text-[13px] font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50" disabled={exemptSaving} onClick={submitExempt}>{exemptSaving ? 'Recording…' : 'Record exemption'}</button></div>
          </div>
        )}
        {exemptError ? <p className="px-5 py-6 text-[13px] text-red-600">{exemptError}</p> : loading ? <div className="px-5 py-6 text-muted-foreground text-[13px]">Loading…</div> : exemptions.length === 0 ? <p className="px-5 py-6 text-[13px] text-muted-foreground">No seller tax exemptions recorded yet.</p> : (
          <div className="adm-table-wrap"><table className="adm-table"><thead className="border-b border-border bg-muted/40"><tr><th className="px-5 py-3 font-medium text-muted-foreground">Seller</th><th className="px-5 py-3 font-medium text-muted-foreground">Type</th><th className="px-5 py-3 font-medium text-muted-foreground">Certificate / Jurisdiction</th><th className="px-5 py-3 font-medium text-muted-foreground">Validity</th><th className="px-5 py-3 font-medium text-muted-foreground">Status</th><th className="px-5 py-3 font-medium text-muted-foreground">Actions</th></tr></thead>
          <tbody className="divide-y divide-border">{exemptions.map((ex) => (<tr key={ex.id}><td className="px-5 py-3 font-medium">{ex.seller_name}</td><td className="px-5 py-3 capitalize">{ex.exemption_type}</td><td className="px-5 py-3">{ex.certificate_ref || '—'}{ex.jurisdiction ? ` · ${ex.jurisdiction}` : ''}</td><td className="px-5 py-3">{fmtDay(ex.valid_from)} – {fmtDay(ex.valid_to)}{ex.effective_now ? ' · effective now' : ''}</td><td className="px-5 py-3"><Badge status={ex.status} /></td><td className="px-5 py-3"><div className="flex flex-wrap gap-1.5">{ex.status === 'pending_review' && <button className={btn} onClick={() => patchExempt(ex, 'active')}>Activate</button>}{ex.status !== 'revoked' && <button className={btn} onClick={() => patchExempt(ex, 'revoked')}>Revoke</button>}{ex.status !== 'expired' && <button className={btn} onClick={() => patchExempt(ex, 'expired')}>Mark expired</button>}<button className={btn} onClick={() => deleteExempt(ex)}>Delete</button></div></td></tr>))}</tbody></table></div>
        )}
      </section>
    </div>
  );
}

