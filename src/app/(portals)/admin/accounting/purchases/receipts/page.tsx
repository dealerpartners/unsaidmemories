'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

// /admin/accounting/purchases/receipts — Purchases & Payables →
// Receipt Capture (owner spec: receipt_capture.html), minus the
// part that does not exist: there is no OCR connected to this
// inbox yet, and the page says so plainly. Uploading registers the
// file in acct_attachments (with its SHA-256 fingerprint) and a
// pending row in acct_receipt_extractions; a person then types the
// vendor, total, tax and date in and confirms them by hand, and
// can match the receipt to a real bank transaction — the match is
// written to matched_bank_transaction_id. Statuses are the truth:
// pending (nothing read yet) → confirmed (typed + checked) →
// matched (tied to a bank transaction).

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);
const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const fmtSize = (n: number | null) => (n === null ? '' : n > 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

type Receipt = {
  id: string; status: string; vendorName: string | null; extractedTotal: number | null;
  taxAmount: number | null; receiptDate: string | null; ocrScore: number | null;
  matchedTxnId: string | null; createdAt: string; fileName: string | null; mimeType: string | null;
  sizeBytes: number | null; matched: { date: string; description: string | null; amount: number | null; payee: string | null } | null;
};
type BankTxn = { id: string; date: string; description: string | null; payee: string | null; amount: number };
type Draft = { vendor: string; total: string; tax: string; date: string; matchId: string };

const inputCls = 'bg-background border border-input rounded-lg px-2 h-8 text-[12px] w-full';

export default function ReceiptCapturePage() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [bankTxns, setBankTxns] = useState<BankTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'review' | 'matched' | 'all'>('all');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/receipts', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        const rows: Receipt[] = Array.isArray(d.receipts) ? d.receipts : [];
        setReceipts(rows);
        setBankTxns(Array.isArray(d.bankTransactions) ? d.bankTransactions : []);
        setDrafts((prev) => {
          const next = { ...prev };
          for (const r of rows) {
            if (!next[r.id]) next[r.id] = {
              vendor: r.vendorName || '', total: r.extractedTotal === null ? '' : String(r.extractedTotal),
              tax: r.taxAmount === null ? '' : String(r.taxAmount), date: r.receiptDate || '', matchId: r.matchedTxnId || '',
            };
          }
          return next;
        });
        setError(null);
      })
      .catch(() => setError('Receipts could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const buf = await f.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', buf);
        const sha256 = Array.from(new Uint8Array(digest)).map((x) => x.toString(16).padStart(2, '0')).join('');
        const r = await fetch('/api/admin/accounting/receipts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_name: f.name, mime_type: f.type || null, size_bytes: f.size, sha256 }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.ok === false) throw new Error(d.error || `Could not register ${f.name}`);
      }
      setNotice(`${files.length} receipt file(s) registered. They are in the inbox below, waiting for their amounts to be typed in and confirmed.`);
      load();
    } catch (err: any) { setError(err?.message || 'Upload failed.'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const patch = async (id: string, payload: Record<string, unknown>) => {
    const r = await fetch('/api/admin/accounting/receipts', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...payload }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || 'update failed');
  };

  const saveFields = async (r: Receipt) => {
    const d = drafts[r.id];
    setBusy(`save-${r.id}`);
    try {
      await patch(r.id, { vendor_name: d.vendor, extracted_total: d.total, tax_amount: d.tax, receipt_date: d.date });
      setNotice(`Receipt ${r.fileName || ''} confirmed with the amounts you typed in.`);
      load();
    } catch (err: any) { setError(err?.message || 'Receipt could not be saved.'); }
    finally { setBusy(null); }
  };

  const doMatch = async (r: Receipt) => {
    const d = drafts[r.id];
    if (!d.matchId) { setError('Pick the bank transaction this receipt belongs to first.'); return; }
    setBusy(`match-${r.id}`);
    try {
      await patch(r.id, { action: 'match', bank_transaction_id: d.matchId });
      setNotice(`Receipt ${r.fileName || ''} matched to its bank transaction.`);
      load();
    } catch (err: any) { setError(err?.message || 'Receipt could not be matched.'); }
    finally { setBusy(null); }
  };

  const doUnmatch = async (r: Receipt) => {
    setBusy(`match-${r.id}`);
    try { await patch(r.id, { action: 'unmatch' }); load(); }
    catch (err: any) { setError(err?.message || 'Receipt could not be unmatched.'); }
    finally { setBusy(null); }
  };

  const pending = receipts.filter((r) => r.status === 'pending');
  const matched = receipts.filter((r) => r.status === 'matched');
  const unmatchedValue = receipts.filter((r) => !r.matchedTxnId).reduce((s, r) => s + (r.extractedTotal || 0), 0);

  const shown = receipts.filter((r) => {
    if (tab === 'review' && r.status === 'matched') return false;
    if (tab === 'matched' && r.status !== 'matched') return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [r.fileName || '', r.vendorName || '', r.status].join(' ').toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Receipt Capture</h1>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search file, vendor…" className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-64" type="text" />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} data-tip="Upload receipt files (PNG, JPG, PDF). Each one is registered with a fingerprint and lands in the inbox below." className="h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium whitespace-nowrap disabled:opacity-50">
            {uploading ? 'Uploading…' : '+ Snap & Ingest Receipt'}
          </button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card px-4 py-3 mt-4 text-[13px]">
        <span className="font-semibold">Please note:</span> automatic receipt reading (OCR) is <span className="font-semibold">not connected yet</span>.
        Nothing here is read for you — after uploading, type the vendor, total, tax and date from the receipt into its row and press Confirm. That keeps every number in the books one a person has actually checked.
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 py-4">
        {[
          { label: 'For Review', value: String(pending.length), foot: 'Receipts with no amounts entered yet' },
          { label: 'Confirmed, Unmatched', value: fmt(unmatchedValue), foot: 'Value of receipts not yet tied to a bank transaction' },
          { label: 'Matched', value: String(matched.length), foot: 'Receipts tied to a bank transaction' },
          { label: 'Receipts in Inbox', value: String(receipts.length), foot: 'All time' },
        ].map((k) => (
          <div key={k.label} className="border border-border rounded-xl bg-card p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{k.label}</div>
            <div className="text-xl font-semibold mt-1 tabular-nums">{k.value}</div>
            <div className="text-[12px] text-muted-foreground mt-1">{k.foot}</div>
          </div>
        ))}
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
      {notice && <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm mb-4">{notice}</div>}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {([
          { key: 'all', label: `All Receipts (${receipts.length})` },
          { key: 'review', label: `For Review (${receipts.length - matched.length})` },
          { key: 'matched', label: `Matched (${matched.length})` },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-tip={`Show ${t.label.toLowerCase()} only.`} className={`h-8 px-3 rounded-lg border text-[12px] font-medium ${tab === t.key ? 'bg-[#7258e8] text-white border-[#7258e8]' : 'bg-card border-border text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="border border-border rounded-xl overflow-x-auto bg-card">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
              <th className="p-3 border-r border-border">Receipt Doc</th>
              <th className="p-3 border-r border-border">Upload Date</th>
              <th className="p-3 border-r border-border">Vendor / Merchant</th>
              <th className="p-3 border-r border-border">Receipt Date</th>
              <th className="p-3 border-r border-border text-right">Total</th>
              <th className="p-3 border-r border-border text-right">Tax</th>
              <th className="p-3 border-r border-border">Matched Bank / Card Txn</th>
              <th className="p-3 border-r border-border">Status</th>
              <th className="p-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={9} className="text-center text-muted-foreground">Loading receipts…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={9} className="text-center text-muted-foreground">
                {receipts.length === 0 ? 'No receipts yet. Upload a receipt file and it lands here, ready for its amounts to be typed in and matched.' : 'No receipts match this search or filter.'}
              </td></tr>
            ) : shown.map((r) => {
              const d = drafts[r.id] || { vendor: '', total: '', tax: '', date: '', matchId: '' };
              const set = (patchD: Partial<Draft>) => setDrafts({ ...drafts, [r.id]: { ...d, ...patchD } });
              return (
                <tr key={r.id} className="hover:bg-accent/50 align-top">
                  <td className="p-3 border-r border-border">
                    <div className="font-medium break-all">{r.fileName || 'Receipt'}</div>
                    <div className="text-[11px] text-muted-foreground">{fmtSize(r.sizeBytes)}{r.mimeType ? ` · ${r.mimeType}` : ''}</div>
                  </td>
                  <td className="p-3 border-r border-border text-muted-foreground">{fmtDate(r.createdAt.slice(0, 10))}</td>
                  <td className="p-3 border-r border-border"><input value={d.vendor} onChange={(e) => set({ vendor: e.target.value })} placeholder="Type the vendor…" className={inputCls} /></td>
                  <td className="p-3 border-r border-border"><input type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} className={inputCls} /></td>
                  <td className="p-3 border-r border-border"><input type="number" min="0" step="0.01" value={d.total} onChange={(e) => set({ total: e.target.value })} placeholder="0.00" className={`${inputCls} text-right`} /></td>
                  <td className="p-3 border-r border-border"><input type="number" min="0" step="0.01" value={d.tax} onChange={(e) => set({ tax: e.target.value })} placeholder="0.00" className={`${inputCls} text-right`} /></td>
                  <td className="p-3 border-r border-border">
                    {r.matched ? (
                      <div>
                        <div>{r.matched.payee || r.matched.description || 'Bank transaction'}</div>
                        <div className="text-[11px] text-muted-foreground">{fmtDate(r.matched.date)} · {fmt(r.matched.amount)}</div>
                      </div>
                    ) : (
                      <select value={d.matchId} onChange={(e) => set({ matchId: e.target.value })} className={inputCls}>
                        <option value="">Pick the bank transaction…</option>
                        {bankTxns.map((t) => <option key={t.id} value={t.id}>{fmtDate(t.date)} · {t.payee || t.description || 'Transaction'} · {fmt(t.amount)}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="p-3 border-r border-border capitalize">{r.status}</td>
                  <td className="p-3 text-center whitespace-nowrap">
                    <button onClick={() => saveFields(r)} disabled={busy === `save-${r.id}`} data-tip="Save the vendor, total, tax and date you typed in, and mark this receipt confirmed." className="text-[12px] underline mr-3 disabled:opacity-50">Confirm</button>
                    {r.matched ? (
                      <button onClick={() => doUnmatch(r)} disabled={busy === `match-${r.id}`} data-tip="Remove the match to the bank transaction." className="text-[12px] underline disabled:opacity-50">Unmatch</button>
                    ) : (
                      <button onClick={() => doMatch(r)} disabled={busy === `match-${r.id}`} data-tip="Tie this receipt to the bank transaction you picked. The match is saved on the receipt." className="text-[12px] underline disabled:opacity-50">Review & Match</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
