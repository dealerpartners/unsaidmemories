'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { History, X, CloudUpload, Loader2 } from 'lucide-react';
import { OverlayShell, qcLabelCls, qcLabelStyle, qcInputCls, QcError, QcSuccess } from './surfaces';

// ============================================================================
// Bill — the full-screen overlay from the owner's QUICK_ACTIONS.html:
// "Add bills" upload rail on the left, the bill form (Vendor / Bill
// date / Due date, category lines) on the right, his footer (Cancel /
// Print / Make recurring / Save bill / Save and schedule payment).
//
// Wiring (censused 2026-11-02): GET /api/admin/accounting/ap-bills
// returns the tenant's real vendors (acct_vendors) and expense
// accounts (chart of accounts); POST to the same route with
// {action:'create_bill', vendor_id, bill_date, due_date, lines}
// inserts the bill + lines and posts DR expense / CR AP — the Save
// buttons are that real write. His "Category" free-text becomes the
// expense-account select because create_bill requires a real GL
// account per line. Quantity is fixed at 1 per line, so the line
// Amount is its unit_cost. "Save and schedule payment" creates the
// same bill and points at Payment Runs for the scheduling step (no
// combined endpoint exists). Print = window.print(). "Make
// recurring" has no recurring-bill create path behind it — clicking
// it says so (gap list #13). The dropzone accepts a file pick and
// shows the file's name; attachment storage for bills is not wired
// (gap list #13) and nothing is uploaded.
// ============================================================================

type Vendor = { id: string; name: string; paymentTermsDays?: number };
type ExpenseAccount = { id: string; code: string; name: string };
type Line = { key: number; accountId: string; description: string; amount: string };

let lineKey = 0;
const blankLine = (): Line => ({ key: ++lineKey, accountId: '', description: '', amount: '' });

const todayISO = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function BillOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accounts, setAccounts] = useState<ExpenseAccount[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState('');
  const [billDate, setBillDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(todayISO());
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/accounting/ap-bills', { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to load vendors and accounts');
      setVendors(Array.isArray(j.vendors) ? j.vendors : []);
      setAccounts(Array.isArray(j.expenseAccounts) ? j.expenseAccounts : []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load bill data');
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const updateLine = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = async (schedule: boolean) => {
    setError(null);
    setSuccess(null);
    const apiLines = lines
      .filter((l) => l.description.trim() && Number(l.amount) > 0 && l.accountId)
      .map((l) => ({
        description: l.description.trim(),
        quantity: 1,
        unit_cost: Number(l.amount),
        expense_account_id: l.accountId,
      }));
    if (!vendorId) {
      setError('Pick the vendor this bill is from.');
      return;
    }
    if (apiLines.length === 0) {
      setError('Add at least one line with a category, a description, and an amount.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/accounting/ap-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_bill',
          vendor_id: vendorId,
          bill_date: billDate || undefined,
          due_date: dueDate || undefined,
          lines: apiLines,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || 'The bill could not be saved');
      setSuccess(
        `Bill ${j.bill_number || ''} saved.` +
          (schedule ? ' Schedule its payment from Accounting → Payment Runs — there is no combined save-and-schedule endpoint yet.' : ''),
      );
      setLines([blankLine()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The bill could not be saved');
    } finally {
      setBusy(false);
    }
  };

  const smallBtnCls = 'text-xs font-semibold text-[#4b5563] border border-[#d1d5db] px-2 py-1 rounded hover:bg-[#f9fafb]';

  return (
    <OverlayShell open={open} onClose={onClose} label="Bill">
      <div className="h-14 border-b border-[#e5e7eb] flex items-center justify-between px-6 shrink-0 bg-white">
        <div className="flex items-center gap-3 text-[#374151]">
          <History size={22} className="text-[#9ca3af]" />
          <span className="font-semibold text-lg">Bill</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-8 h-8 rounded-full hover:bg-[#f3f4f6] flex items-center justify-center text-[#6b7280]"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden" style={{ backgroundColor: '#f4f5f8' }}>
        {/* Add bills rail */}
        <div className="w-72 bg-white border-r border-[#e5e7eb] p-6 flex flex-col shrink-0">
          <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wider mb-3">Add bills</p>
          <div className="flex-1 border-2 border-dashed border-[#d1d5db] rounded-lg flex flex-col items-center justify-center text-center p-4">
            <CloudUpload size={32} className="text-[#9ca3af] mb-2" />
            <p className="text-sm font-medium text-[#374151] mb-1">Drag and drop documents</p>
            <p className="text-xs text-[#6b7280] mb-4">PDF, PNG, JPG, HEIC</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="px-4 py-1.5 bg-[#171420] text-white text-xs font-semibold rounded hover:bg-[#000000]"
            >
              Upload from this device
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.heic"
              className="hidden"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            />
            {fileName ? (
              <p className="text-xs text-[#6b7280] mt-4">
                Selected: {fileName}. Attachment storage for bills is not wired yet (gap list #13) — the file
                is not uploaded.
              </p>
            ) : null}
          </div>
        </div>

        {/* Bill form */}
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto bg-white border border-[#e5e7eb] rounded-lg shadow-sm">
            <div className="p-6 border-b border-[#e5e7eb] flex flex-col gap-4">
              <QcError text={loadError || error} />
              <QcSuccess text={success} />
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-2">
                  <label className={qcLabelCls} style={qcLabelStyle}>Vendor</label>
                  <select className={qcInputCls} value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                    <option value="">Choose a vendor</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                  {vendors.length === 0 && !loadError ? (
                    <p className="text-xs text-[#6b7280] mt-1">
                      No vendors yet — add one from the + Customer menu&apos;s Vendor (Supplier) drawer.
                    </p>
                  ) : null}
                </div>
                <div>
                  <label className={qcLabelCls} style={qcLabelStyle}>Bill date</label>
                  <input type="date" className={qcInputCls} value={billDate} onChange={(e) => setBillDate(e.target.value)} />
                </div>
                <div>
                  <label className={qcLabelCls} style={qcLabelStyle}>Due date</label>
                  <input type="date" className={qcInputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="p-6">
              <p className="font-semibold text-sm mb-2 text-[#1a1c1e]">Category / Description</p>
              <div className="flex flex-col gap-3">
                {lines.map((l, i) => (
                  <div key={l.key} className="border border-[#e5e7eb] rounded-lg p-4 bg-[#f9fafb] flex gap-4 items-start">
                    <span className="text-[#9ca3af] text-xs mt-2.5">{i + 1}</span>
                    <div className="flex-1">
                      <select
                        className="w-full border-b border-[#d1d5db] bg-transparent text-sm pb-1 focus:outline-none"
                        value={l.accountId}
                        onChange={(e) => updateLine(l.key, { accountId: e.target.value })}
                        aria-label="Category (expense account)"
                      >
                        <option value="">Category</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <input
                        className="w-full border-b border-[#d1d5db] bg-transparent text-sm pb-1 focus:outline-none"
                        placeholder="Description"
                        value={l.description}
                        onChange={(e) => updateLine(l.key, { description: e.target.value })}
                      />
                    </div>
                    <div className="w-24">
                      <input
                        className="w-full text-right border-b border-[#d1d5db] bg-transparent text-sm pb-1 focus:outline-none"
                        placeholder="0.00"
                        inputMode="decimal"
                        value={l.amount}
                        onChange={(e) => updateLine(l.key, { amount: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <button type="button" className={smallBtnCls} onClick={() => setLines((ls) => [...ls, blankLine()])}>
                  Add lines
                </button>
                <button type="button" className={smallBtnCls} onClick={() => setLines([blankLine()])}>
                  Clear all lines
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="h-16 bg-white border-t border-[#e5e7eb] flex items-center justify-between px-6 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 bg-white border border-[#d1d5db] rounded text-sm hover:bg-[#f9fafb]"
        >
          Cancel
        </button>
        <div className="flex items-center gap-3 text-sm font-semibold">
          <button type="button" className="text-[#4b5563] hover:underline" onClick={() => window.print()}>
            Print
          </button>
          <button
            type="button"
            className="text-[#4b5563] hover:underline"
            onClick={() => {
              setSuccess(null);
              setError('Recurring bills are not wired yet — this bill saves as a one-off (gap list #13).');
            }}
          >
            Make recurring
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => save(false)}
            className="px-4 py-1.5 bg-white border border-[#d1d5db] rounded hover:bg-[#f9fafb] disabled:opacity-60"
          >
            Save bill
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => save(true)}
            className="px-4 py-1.5 bg-[#171420] text-white rounded hover:bg-[#000000] disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}
            Save and schedule payment
          </button>
        </div>
      </div>
    </OverlayShell>
  );
}
