'use client';

import React, { useCallback, useEffect, useState } from 'react';

// /admin/accounting/purchases/bills — Purchases & Payables →
// Bills & Expenses (owner spec: bills_expenses.html). The AP
// commitment register: every acct_ap_bills row with vendor, due
// date & terms, PO reference, GL category, gross amount, balance
// and payment status, fed by /api/admin/accounting/ap-bills.
// Recording a bill posts DR expense / CR Accounts Payable in the
// same request; Pay Bill settles through the existing bill payment
// endpoint. Expense reports (acct_expense_reports) list below with
// their own record form. Nothing here is sample data — an empty
// ledger says so.

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);
const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

type BillLine = { lineNo: number; description: string; quantity: number; unitCost: number; lineSubtotal: number; taxAmount: number; purchaseOrderRef: string | null; accountCode: string; accountName: string };
type Bill = {
  id: string; billNumber: string; billDate: string; dueDate: string; total: number; amountPaid: number;
  balance: number; status: string; vendorName: string; paymentTermsDays: number | null;
  poReference: string | null; glCategory: string | null; lines: BillLine[];
};
type ExpenseReport = { id: string; reportNumber: string; reportDate: string; totalAmount: number; status: string; employeeId: string | null; lineCount: number };
type Opt = { id: string; label: string };

const inputCls = 'bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full';
const STATUS_FILTERS = ['all', 'open', 'partially_paid', 'received', 'paid', 'overdue'] as const;

export default function BillsExpensesPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [reports, setReports] = useState<ExpenseReport[]>([]);
  const [vendors, setVendors] = useState<Opt[]>([]);
  const [accounts, setAccounts] = useState<Opt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showBillForm, setShowBillForm] = useState(false);
  const [showExpForm, setShowExpForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [billForm, setBillForm] = useState({ vendor_id: '', bill_date: '', due_date: '', po_reference: '' });
  const [lineRows, setLineRows] = useState([{ description: '', quantity: '1', unit_cost: '', expense_account_id: '' }]);
  const [expForm, setExpForm] = useState({ expense_date: '', merchant: '', description: '', amount: '', expense_account_id: '' });

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/ap-bills', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setBills(Array.isArray(d.bills) ? d.bills : []);
        setReports(Array.isArray(d.expenseReports) ? d.expenseReports : []);
        setVendors((d.vendors || []).map((v: any) => ({ id: v.id, label: v.name })));
        setAccounts((d.expenseAccounts || []).map((a: any) => ({ id: a.id, label: `${a.code} · ${a.name}` })));
        setError(null);
      })
      .catch(() => setError('Bills could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = (b: Bill) => b.balance > 0 && b.dueDate < today && b.status !== 'paid';
  const openBills = bills.filter((b) => b.balance > 0 && b.status !== 'paid');
  const totalOutstanding = openBills.reduce((s, b) => s + b.balance, 0);
  const overdueTotal = openBills.filter(isOverdue).reduce((s, b) => s + b.balance, 0);
  const settledTotal = bills.reduce((s, b) => s + b.amountPaid, 0);

  const shown = bills.filter((b) => {
    if (status === 'overdue' ? !isOverdue(b) : status !== 'all' && b.status !== status) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [b.billNumber, b.vendorName, b.poReference || '', b.glCategory || ''].join(' ').toLowerCase().includes(q);
  });

  const submitBill = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch('/api/admin/accounting/ap-bills', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_bill', ...billForm,
          lines: lineRows.map((l) => ({ description: l.description, quantity: Number(l.quantity), unit_cost: Number(l.unit_cost), expense_account_id: l.expense_account_id })),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || 'save failed');
      setBillForm({ vendor_id: '', bill_date: '', due_date: '', po_reference: '' });
      setLineRows([{ description: '', quantity: '1', unit_cost: '', expense_account_id: '' }]);
      setShowBillForm(false);
      load();
    } catch (err: any) { setError(err?.message || 'Bill could not be saved.'); } finally { setSaving(false); }
  };

  const submitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch('/api/admin/accounting/ap-bills', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_expense', ...expForm, amount: Number(expForm.amount) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || 'save failed');
      setExpForm({ expense_date: '', merchant: '', description: '', amount: '', expense_account_id: '' });
      setShowExpForm(false);
      load();
    } catch (err: any) { setError(err?.message || 'Expense could not be saved.'); } finally { setSaving(false); }
  };

  const payBill = async (b: Bill) => {
    setPaying(b.id);
    try {
      const r = await fetch(`/api/admin/accounting/bills/${b.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pay' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.error || 'payment failed');
      load();
    } catch (err: any) { setError(err?.message || 'Bill could not be paid.'); } finally { setPaying(null); }
  };

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Bills & Expenses</h1>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search bill #, vendor, PO ref…" className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-64" type="text" />
          <button onClick={() => setShowBillForm((s) => !s)} data-tip="Record a bill you received from a vendor. Saving it posts the expense to the ledger and adds the amount to Accounts Payable." className="h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium whitespace-nowrap">
            Record Vendor Bill
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 py-4">
        {[
          { label: 'Total AP Outstanding', value: fmt(totalOutstanding), foot: `${openBills.length} open bills` },
          { label: 'Overdue Payables', value: fmt(overdueTotal), foot: `${openBills.filter(isOverdue).length} bills past their due date` },
          { label: 'Bills on the Books', value: String(bills.length), foot: 'All statuses, all time' },
          { label: 'Settled', value: fmt(settledTotal), foot: 'Paid against bills, all time' },
        ].map((k) => (
          <div key={k.label} className="border border-border rounded-xl bg-card p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{k.label}</div>
            <div className="text-xl font-semibold mt-1 tabular-nums">{k.value}</div>
            <div className="text-[12px] text-muted-foreground mt-1">{k.foot}</div>
          </div>
        ))}
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}

      {showBillForm && (
        <form onSubmit={submitBill} className="border border-border rounded-xl bg-card p-4 mb-4 flex flex-col gap-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="text-[12px] font-medium">Vendor *
              <select required value={billForm.vendor_id} onChange={(e) => setBillForm({ ...billForm, vendor_id: e.target.value })} className={inputCls}>
                <option value="">Pick a vendor…</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </label>
            <label className="text-[12px] font-medium">Issue date
              <input type="date" value={billForm.bill_date} onChange={(e) => setBillForm({ ...billForm, bill_date: e.target.value })} className={inputCls} />
            </label>
            <label className="text-[12px] font-medium">Due date (blank = vendor terms)
              <input type="date" value={billForm.due_date} onChange={(e) => setBillForm({ ...billForm, due_date: e.target.value })} className={inputCls} />
            </label>
            <label className="text-[12px] font-medium">PO reference
              <input value={billForm.po_reference} onChange={(e) => setBillForm({ ...billForm, po_reference: e.target.value })} className={inputCls} placeholder="PO-…" />
            </label>
          </div>
          {lineRows.map((l, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <label className="text-[12px] font-medium md:col-span-5">Line {i + 1} description *
                <input required value={l.description} onChange={(e) => setLineRows(lineRows.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} className={inputCls} />
              </label>
              <label className="text-[12px] font-medium md:col-span-2">Qty
                <input type="number" min="0" step="0.01" value={l.quantity} onChange={(e) => setLineRows(lineRows.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} className={inputCls} />
              </label>
              <label className="text-[12px] font-medium md:col-span-2">Unit cost
                <input type="number" min="0" step="0.01" value={l.unit_cost} onChange={(e) => setLineRows(lineRows.map((x, j) => (j === i ? { ...x, unit_cost: e.target.value } : x)))} className={inputCls} />
              </label>
              <label className="text-[12px] font-medium md:col-span-3">GL category *
                <select required value={l.expense_account_id} onChange={(e) => setLineRows(lineRows.map((x, j) => (j === i ? { ...x, expense_account_id: e.target.value } : x)))} className={inputCls}>
                  <option value="">Pick an expense account…</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </label>
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => setLineRows([...lineRows, { description: '', quantity: '1', unit_cost: '', expense_account_id: '' }])} data-tip="Add another line to this bill — each line can post to a different expense account." className="h-9 px-3 rounded-lg border border-border bg-card text-[13px] font-medium">+ Add Line</button>
            <button type="submit" disabled={saving} data-tip="Save the bill. It posts to the ledger and appears in the register below right away." className="h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">{saving ? 'Saving…' : 'Save Bill'}</button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {STATUS_FILTERS.map((s) => (
          <button key={s} onClick={() => setStatus(s)} data-tip={`Show ${s === 'all' ? 'every bill' : s.replace('_', ' ') + ' bills'} only.`} className={`h-8 px-3 rounded-lg border text-[12px] font-medium capitalize ${status === s ? 'bg-[#7258e8] text-white border-[#7258e8]' : 'bg-card border-border text-foreground'}`}>
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="border border-border rounded-xl overflow-x-auto bg-card">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
              <th className="p-3 border-r border-border">Bill ID</th>
              <th className="p-3 border-r border-border">Vendor / Payee</th>
              <th className="p-3 border-r border-border">Issue Date</th>
              <th className="p-3 border-r border-border">Due Date & Terms</th>
              <th className="p-3 border-r border-border">PO Reference</th>
              <th className="p-3 border-r border-border">GL Category</th>
              <th className="p-3 border-r border-border text-right">Gross Amount</th>
              <th className="p-3 border-r border-border">Payment Status</th>
              <th className="p-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={9} className="text-center text-muted-foreground">Loading bills…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={9} className="text-center text-muted-foreground">
                {bills.length === 0 ? 'No bills recorded yet. When you record a vendor bill it posts to the ledger and appears here with its due date and balance.' : 'No bills match this search or filter.'}
              </td></tr>
            ) : shown.map((b) => (
              <React.Fragment key={b.id}>
                <tr className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border font-semibold tabular-nums">{b.billNumber}</td>
                  <td className="p-3 border-r border-border font-medium">{b.vendorName}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{fmtDate(b.billDate)}</td>
                  <td className="p-3 border-r border-border">
                    <div className={isOverdue(b) ? 'font-semibold' : ''}>{fmtDate(b.dueDate)}{isOverdue(b) ? ' · Overdue' : ''}</div>
                    <div className="text-[11px] text-muted-foreground">{b.paymentTermsDays ? `Net ${b.paymentTermsDays}` : ''}</div>
                  </td>
                  <td className="p-3 border-r border-border text-muted-foreground">{b.poReference || '—'}</td>
                  <td className="p-3 border-r border-border text-muted-foreground">{b.glCategory || '—'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{fmt(b.total)}</td>
                  <td className="p-3 border-r border-border">
                    <span className="capitalize">{b.status.replace('_', ' ')}</span>
                    <div className="text-[11px] text-muted-foreground">{fmt(b.balance)} balance · {fmt(b.amountPaid)} paid</div>
                  </td>
                  <td className="p-3 text-center whitespace-nowrap">
                    <button onClick={() => setExpanded(expanded === b.id ? null : b.id)} data-tip="Show this bill's lines and the ledger posting it created." className="text-[12px] underline mr-3">Lines</button>
                    {b.balance > 0 && b.status !== 'paid' && (
                      <button onClick={() => payBill(b)} disabled={paying === b.id} data-tip="Pay the remaining balance on this bill from the operating account. The payment is recorded and the bill updates here." className="text-[12px] underline disabled:opacity-50">
                        {paying === b.id ? 'Paying…' : 'Pay Bill'}
                      </button>
                    )}
                  </td>
                </tr>
                {expanded === b.id && (
                  <tr>
                    <td colSpan={9} className="p-0">
                      <div className="grid md:grid-cols-2 gap-0">
                        <table className="w-full text-[12px]">
                          <thead><tr className="bg-muted/30 text-left"><th className="p-2">Line</th><th className="p-2">Qty</th><th className="p-2 text-right">Unit Cost</th><th className="p-2 text-right">Subtotal</th></tr></thead>
                          <tbody>
                            {b.lines.length === 0 ? <tr><td colSpan={4} className="p-2 text-muted-foreground">No lines stored for this bill.</td></tr> : b.lines.map((l) => (
                              <tr key={l.lineNo} className="border-t border-border"><td className="p-2">{l.description}</td><td className="p-2 tabular-nums">{l.quantity}</td><td className="p-2 text-right tabular-nums">{fmt(l.unitCost)}</td><td className="p-2 text-right tabular-nums">{fmt(l.lineSubtotal)}</td></tr>
                            ))}
                          </tbody>
                        </table>
                        <table className="w-full text-[12px]">
                          <thead><tr className="bg-muted/30 text-left"><th className="p-2">Account / Description</th><th className="p-2">Type</th><th className="p-2 text-right">Debit ($)</th><th className="p-2 text-right">Credit ($)</th></tr></thead>
                          <tbody>
                            {b.lines.map((l) => (
                              <tr key={`j${l.lineNo}`} className="border-t border-border"><td className="p-2">{l.accountCode} · {l.accountName}</td><td className="p-2">Expense</td><td className="p-2 text-right tabular-nums">{fmt(l.lineSubtotal + l.taxAmount)}</td><td className="p-2 text-right tabular-nums">—</td></tr>
                            ))}
                            <tr className="border-t border-border"><td className="p-2">2050 · Accounts Payable</td><td className="p-2">Liability</td><td className="p-2 text-right tabular-nums">—</td><td className="p-2 text-right tabular-nums">{fmt(b.total)}</td></tr>
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table></div>
      </div>

      <div className="flex items-center justify-between mt-8 mb-3">
        <h2 className="font-display text-lg font-semibold">Expense Reports</h2>
        <button onClick={() => setShowExpForm((s) => !s)} data-tip="Record an out-of-pocket or card expense as a draft expense report with one line." className="h-9 px-4 rounded-lg border border-border bg-card text-[13px] font-medium">Record Expense</button>
      </div>
      {showExpForm && (
        <form onSubmit={submitExpense} className="border border-border rounded-xl bg-card p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3">
          <label className="text-[12px] font-medium">Date<input type="date" value={expForm.expense_date} onChange={(e) => setExpForm({ ...expForm, expense_date: e.target.value })} className={inputCls} /></label>
          <label className="text-[12px] font-medium">Merchant<input value={expForm.merchant} onChange={(e) => setExpForm({ ...expForm, merchant: e.target.value })} className={inputCls} /></label>
          <label className="text-[12px] font-medium">Description *<input required value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} className={inputCls} /></label>
          <label className="text-[12px] font-medium">Amount *<input required type="number" min="0" step="0.01" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} className={inputCls} /></label>
          <label className="text-[12px] font-medium">GL account *
            <select required value={expForm.expense_account_id} onChange={(e) => setExpForm({ ...expForm, expense_account_id: e.target.value })} className={inputCls}>
              <option value="">Pick…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
          <div className="md:col-span-5"><button type="submit" disabled={saving} data-tip="Save this expense report as a draft. It appears in the list below." className="h-9 px-4 rounded-lg bg-[#7258e8] text-white text-[13px] font-medium disabled:opacity-50">{saving ? 'Saving…' : 'Save Expense'}</button></div>
        </form>
      )}
      <div className="border border-border rounded-xl overflow-x-auto bg-card">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
              <th className="p-3 border-r border-border">Report</th>
              <th className="p-3 border-r border-border">Date</th>
              <th className="p-3 border-r border-border text-center">Lines</th>
              <th className="p-3 border-r border-border text-right">Total</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={5} className="text-center text-muted-foreground">Loading expense reports…</td></tr>
            ) : reports.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-muted-foreground">No expense reports yet. Expenses you record appear here as draft reports ready for approval.</td></tr>
            ) : reports.map((r) => (
              <tr key={r.id} className="hover:bg-accent/50">
                <td className="p-3 border-r border-border font-semibold tabular-nums">{r.reportNumber}</td>
                <td className="p-3 border-r border-border text-muted-foreground">{fmtDate(r.reportDate)}</td>
                <td className="p-3 border-r border-border text-center tabular-nums">{r.lineCount}</td>
                <td className="p-3 border-r border-border text-right tabular-nums">{fmt(r.totalAmount)}</td>
                <td className="p-3 capitalize">{r.status.replace('_', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
