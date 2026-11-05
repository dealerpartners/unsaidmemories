'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Percent, AlertCircle, X } from 'lucide-react';

type FeeSchedule = {
  id: string;
  seller_id: string | null;
  seller_name: string | null;
  category_id: string | null;
  fee_type: string;
  rate: number | null;
  flat_amount: number | null;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
};

type SellerOption = { id: string; display_name: string };

function fmtDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

export default function FeesPage() {
  const [schedules, setSchedules] = useState<FeeSchedule[]>([]);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fee_type: '',
    rate: '',
    flat_amount: '',
    seller_id: '',
    category_id: '',
    effective_from: '',
    effective_to: '',
  });

  const load = useCallback(() => {
    fetch('/api/admin/fees')
      .then((r) => (r.ok ? r.json() : { schedules: [] }))
      .then((j) => setSchedules((j.schedules || []) as FeeSchedule[]))
      .catch(() => setSchedules([]))
      .finally(() => setLoading(false));
    fetch('/api/admin/sellers')
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((j) => setSellers(((j.rows || []) as any[]).map((s) => ({ id: s.id, display_name: s.display_name }))))
      .catch(() => setSellers([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setError(null);
    if (!form.fee_type.trim()) {
      setError('Fee type is required.');
      return;
    }
    if (!form.rate && !form.flat_amount) {
      setError('Enter a rate, a flat amount, or both.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fee_type: form.fee_type.trim(),
          rate: form.rate ? Number(form.rate) : null,
          flat_amount: form.flat_amount ? Number(form.flat_amount) : null,
          seller_id: form.seller_id || null,
          category_id: form.category_id.trim() || null,
          effective_from: form.effective_from || null,
          effective_to: form.effective_to || null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) {
        setError(j.error || 'Could not save the fee schedule.');
        return;
      }
      setShowForm(false);
      setForm({ fee_type: '', rate: '', flat_amount: '', seller_id: '', category_id: '', effective_from: '', effective_to: '' });
      load();
    } catch {
      setError('Could not save the fee schedule.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'border border-border rounded-lg px-3 py-2 text-[13px] bg-card w-full';
  const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Percent className="size-6" /> Fee Structure
          </h1>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-[13px] font-semibold flex items-center gap-2 cursor-pointer"
        >
          {showForm ? <X className="size-4" /> : <Plus className="size-4" />} Add Fee Schedule
        </button>
      </div>

      {error && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-[13px] text-amber-800 dark:text-amber-200 flex items-start gap-2">
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {showForm && (
        <div className="bg-card border border-border rounded-xl">
          <h2 className="text-[15px] font-semibold text-foreground">New fee schedule</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div>
              <label className={labelCls}>Fee type *</label>
              <input
                list="fee-types"
                value={form.fee_type}
                onChange={(e) => setForm({ ...form, fee_type: e.target.value })}
                placeholder="e.g. referral"
                className={inputCls}
              />
              <datalist id="fee-types">
                <option value="referral" />
                <option value="fulfillment" />
                <option value="storage" />
                <option value="advertising" />
                <option value="payment_processing" />
              </datalist>
            </div>
            <div>
              <label className={labelCls}>Rate (%)</label>
              <input
                type="number" step="0.01" min="0"
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
                placeholder="e.g. 12.5"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Flat amount ($)</label>
              <input
                type="number" step="0.01" min="0"
                value={form.flat_amount}
                onChange={(e) => setForm({ ...form, flat_amount: e.target.value })}
                placeholder="e.g. 0.30"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Seller</label>
              <select
                value={form.seller_id}
                onChange={(e) => setForm({ ...form, seller_id: e.target.value })}
                className={`${inputCls} cursor-pointer`}
              >
                <option value="">All sellers (platform default)</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>{s.display_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Category ID (optional)</label>
              <input
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                placeholder="Blank = all categories"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Effective from</label>
                <input
                  type="date"
                  value={form.effective_from}
                  onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Effective to</label>
                <input
                  type="date"
                  value={form.effective_to}
                  onChange={(e) => setForm({ ...form, effective_to: e.target.value })}
                  className={inputCls}
                />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={submit}
              disabled={saving}
              className="px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-[13px] font-semibold cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save fee schedule'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : schedules.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Percent className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground mt-3">No fee schedules configured</p>
          <p className="text-[13px] text-muted-foreground mt-1">
            There are no fee schedules on record. Use “Add Fee Schedule” to create the first one — it is stored
            on the live fee-schedules table and takes effect per its effective dates.
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Fee type</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Scope</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Rate</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Flat</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Effective</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">In accrual</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((f) => (
                <tr key={f.id} className="border-t border-border hover:bg-muted/50">
                  <td className="p-3 font-medium capitalize">{f.fee_type.replace(/_/g, ' ')}</td>
                  <td className="p-3 text-muted-foreground">
                    {f.seller_name || 'All sellers'}
                    {f.category_id ? <span className="block text-[11px]">Category {f.category_id.slice(0, 8)}…</span> : null}
                  </td>
                  <td className="p-3 text-muted-foreground">{f.rate != null ? `${Number(f.rate).toFixed(2)}%` : '—'}</td>
                  <td className="p-3 text-muted-foreground">{f.flat_amount != null ? `$${Number(f.flat_amount).toFixed(2)}` : '—'}</td>
                  <td className="p-3 text-muted-foreground">{fmtDate(f.effective_from)} → {f.effective_to ? fmtDate(f.effective_to) : 'open'}</td>
                  <td className="p-3 text-muted-foreground">{f.category_id ? 'Not applied — category-scoped' : f.fee_type === 'storage' ? 'Applied per accrual run' : 'Applied per order'}</td>
                  <td className="p-3 text-muted-foreground">{fmtDate(f.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
