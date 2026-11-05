'use client';

// ============================================================================
// InvoiceEditor — the /admin/invoices page, rebuilt to the owner's design:
// the INVOICE OVERLAY from GLONALSHELLREVAMP2.html (Finance Refined),
// converted flat and installed as the page (the overlay IS the design for
// this route; the transplanted InvoicesView table is no longer rendered
// here). One page, four views of the same record — Edit / Email view /
// Payor view / PDF view — switched by the header tab strip, mirroring the
// mock's switchInvoiceTab.
//
// Data is real, from the existing API surface only:
//   GET  /api/admin/invoices         → the record set + the open record
//   POST /api/admin/invoices         → Save, for a NEW draft (standalone)
//   PUT  /api/admin/invoices         → Save, for an EXISTING invoice
//   POST /api/admin/invoices/send    → Review and send (Resend-backed)
// The mock defines no
// invoices list/landing: the header's history/title cluster opens a
// record picker fed by the GET list; that absence is a reported gap,
// not something this file papers over with an invented table.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Calendar, ChevronDown, CirclePlay, Copy, Download, GripVertical,
  History, MessageSquare, Printer, Settings, Trash2, User, X,
} from 'lucide-react';

/* ── API shapes (GET /api/admin/invoices) ─────────────────────────── */
type UiItem = {
  id: string; description: string; quantity: number;
  unitPrice: number; totalPrice: number;
};
type UiInvoice = {
  id: string; number: string; status: string; currency: string;
  subtotal: number; total: number; depositPaid: number; balanceDue: number;
  amountPaid: number; customerId: string | null; customerEmail: string | null;
  customerName: string; sentAt: string | null; paidAt: string | null;
  createdAt: string | null; dueDate: string | null; notes: string | null;
  items: UiItem[];
};

type Line = { key: number; service: string; detail: string; qty: string; rate: string };
type View = 'edit' | 'email' | 'payor' | 'pdf';

const BUSINESS_NAME = 'ManageKube LLC';

let lineKey = 0;
const blankLine = (): Line => ({ key: ++lineKey, service: '', detail: '', qty: '', rate: '' });

/* Line items persist as ONE description field; the codebase's own
   convention joins service and detail with " — " (see the POST route's
   booking service line), so the editor's two text columns split/join
   on that separator. */
function splitDescription(desc: string): { service: string; detail: string } {
  const i = desc.indexOf(' — ');
  if (i === -1) return { service: desc, detail: '' };
  return { service: desc.slice(0, i), detail: desc.slice(i + 3) };
}
function joinDescription(l: Line): string {
  const s = l.service.trim();
  const d = l.detail.trim();
  return d ? `${s} — ${d}` : s;
}

const money = (n: number) =>
  `$${(Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: string) => Math.round((parseFloat(v) || 0) * 100) / 100;

function toISODate(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fmtMDY(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
}
function fmtLong(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function parseMDY(text: string): string | null {
  const t = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const p = (x: string) => x.padStart(2, '0');
  return `${m[3]}-${p(m[1])}-${p(m[2])}`;
}

const TABS: { key: View; label: string }[] = [
  { key: 'edit', label: 'Edit' },
  { key: 'email', label: 'Email view' },
  { key: 'payor', label: 'Payor view' },
  { key: 'pdf', label: 'PDF view' },
];

export default function InvoiceEditor({ framed = false, onClose }: { framed?: boolean; onClose?: () => void } = {}) {
  const [invoices, setInvoices] = useState<UiInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [view, setView] = useState<View>('edit');
  const [pickerOpen, setPickerOpen] = useState(false);

  /* the loaded record (null = new draft) + the form state */
  const [record, setRecord] = useState<UiInvoice | null>(null);
  const [customer, setCustomer] = useState('');
  const [customerEmail, setCustomerEmail] = useState<string | null>(null);
  const [terms, setTerms] = useState('Net 30');
  const [invoiceDate, setInvoiceDate] = useState(() => fmtMDY(toISODate(new Date())));
  const [dueDate, setDueDate] = useState('');
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [noteToCustomer, setNoteToCustomer] = useState('');
  const [payInstructions, setPayInstructions] = useState('');
  const [deposit, setDeposit] = useState(''); // '' = no deposit row
  const [depositOpen, setDepositOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const loadIntoForm = useCallback((inv: UiInvoice | null) => {
    setRecord(inv);
    setStatus(null);
    setView('edit');
    if (!inv) {
      setCustomer('');
      setCustomerEmail(null);
      setTerms('Net 30');
      setInvoiceDate(fmtMDY(toISODate(new Date())));
      setDueDate('');
      setLines([blankLine()]);
      setNoteToCustomer('');
      setPayInstructions('');
      setDeposit('');
      setDepositOpen(false);
      return;
    }
    setCustomer(inv.customerName === '—' ? '' : inv.customerName);
    setCustomerEmail(inv.customerEmail);
    setInvoiceDate(fmtMDY(inv.createdAt ? inv.createdAt.slice(0, 10) : null) || fmtMDY(toISODate(new Date())));
    setDueDate(fmtMDY(inv.dueDate));
    setLines(
      inv.items.length
        ? inv.items.map((it) => ({
            key: ++lineKey,
            ...splitDescription(it.description),
            qty: String(it.quantity),
            rate: String(it.unitPrice),
          }))
        : [blankLine()],
    );
    setNoteToCustomer(inv.notes ?? '');
    setDeposit(inv.depositPaid > 0 ? String(inv.depositPaid) : '');
    setDepositOpen(inv.depositPaid > 0);
  }, []);

  const fetchList = useCallback(async (selectId?: string | null) => {
    try {
      const r = await fetch('/api/admin/invoices', { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Failed to load invoices (${r.status})`);
      const list: UiInvoice[] = Array.isArray(j.invoices) ? j.invoices : [];
      setInvoices(list);
      setLoadError(null);
      if (selectId !== undefined) {
        loadIntoForm(list.find((i) => i.id === selectId) ?? list[0] ?? null);
      } else if (list.length) {
        loadIntoForm(list[0]);
      }
      return list;
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load invoices');
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadIntoForm]);

  useEffect(() => { fetchList(null); }, [fetchList]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pickerOpen]);

  /* ── derived totals (Edit view; record values stay authoritative in
        the customer-facing views) ── */
  const lineAmount = (l: Line) => Math.round(num(l.qty || '1') * num(l.rate) * 100) / 100;
  const subtotal = lines.reduce((s, l) => s + lineAmount(l), 0);
  const depositAmt = depositOpen ? num(deposit) : 0;

  const viewTotal = record ? record.total : subtotal;
  const viewBalance = record ? record.balanceDue : Math.max(0, subtotal - depositAmt);
  const viewDue = record ? record.dueDate : parseMDY(dueDate);
  const viewNumber = record?.number ?? null;

  /* ── actions ── */
  const buildItems = () =>
    lines
      .map((l) => ({ description: joinDescription(l), quantity: Math.max(1, parseInt(l.qty, 10) || 1), unitPrice: num(l.rate) }))
      .filter((it) => it.description.length > 0 && it.unitPrice > 0);

  async function saveDraft(): Promise<UiInvoice | null> {
    const items = buildItems();
    if (items.length === 0) {
      setStatus({ ok: false, text: 'Add at least one line with a rate above $0.' });
      return null;
    }
    const cust = customer.trim();
    const body: Record<string, unknown> = { items, notes: noteToCustomer.trim() || null };
    if (cust.includes('@')) body.customerEmail = cust;
    else if (cust) body.customerName = cust;
    else if (customerEmail) body.customerEmail = customerEmail;
    else {
      setStatus({ ok: false, text: 'Add a customer (name or email) before saving.' });
      return null;
    }
    const due = parseMDY(dueDate);
    if (due) body.dueDate = due;
    if (depositAmt > 0) body.depositPaid = depositAmt;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/invoices', {
        method: record ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record ? { ...body, id: record.id } : body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Save failed (${r.status})`);
      const saved: UiInvoice = j.invoice;
      setStatus({ ok: true, text: `Saved as ${saved.number}.` });
      await fetchList(saved.id);
      return saved;
    } catch (e: any) {
      setStatus({ ok: false, text: e?.message || 'Save failed' });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    await saveDraft();
  }

  async function onReviewAndSend() {
    if (view !== 'email') {
      // Review step: the record must exist with the current edits
      // before it can be reviewed/sent, so save first (create or
      // update), then show the Email view.
      const saved = await saveDraft();
      if (!saved) return;
      setView('email');
      setStatus(null);
      return;
    }
    if (!record) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/invoices/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: record.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) {
        throw new Error(j.detail || j.error || `Send failed (${r.status})`);
      }
      setStatus({ ok: true, text: `Invoice sent${record.customerEmail ? ` to ${record.customerEmail}` : ''}.` });
      await fetchList(record.id);
    } catch (e: any) {
      setStatus({ ok: false, text: e?.message || 'Send failed' });
    } finally {
      setBusy(false);
    }
  }

  function onPrintOrDownload() {
    setView('pdf');
    window.setTimeout(() => window.print(), 400);
  }

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const inputCls =
    'w-full h-8 px-1 focus:outline-none border-b border-transparent focus:border-[#0a6400] bg-transparent';

  /* ── the four views ── */
  const editSheet = (
    <div className="w-full max-w-4xl bg-white shadow-sm border border-[#dad9dd] rounded-md h-fit">
      {/* Header info */}
      <div className="p-8 pb-4 border-b border-[#dad9dd]">
        <h1 className="text-3xl font-bold text-[#0a6400] mb-6">INVOICE</h1>
        <div className="flex justify-between items-start">
          <div className="w-1/2">
            <div className="relative flex items-center w-64 mb-4">
              <input
                className="w-full h-10 px-3 bg-white border border-[#dad9dd] rounded focus:outline-none focus:border-[#0a6400] text-sm"
                placeholder="Add customer"
                type="text"
                value={customer}
                onChange={(e) => { setCustomer(e.target.value); setCustomerEmail(null); }}
              />
              <ChevronDown className="absolute right-3 text-[#72796e] pointer-events-none" size={18} />
            </div>
            {record ? (
              <div className="text-sm text-[#3f4a3a]">
                <div className="h-4 mb-2 flex items-center">{record.customerName}</div>
                <div className="h-4 flex items-center text-xs">{record.customerEmail ?? ''}</div>
              </div>
            ) : (
              <>
                <div className="h-4 w-48 bg-[#f4f3f7] rounded mb-2" />
                <div className="h-4 w-32 bg-[#f4f3f7] rounded" />
              </>
            )}
          </div>
          <div className="w-1/2 flex flex-col items-end gap-3 text-sm">
            <div className="flex items-center gap-4 w-64">
              <span className="text-[#3f4a3a] w-20 text-right">Invoice no.</span>
              <input
                className="flex-1 h-8 px-2 border border-[#dad9dd] rounded text-right focus:outline-none focus:border-[#0a6400]"
                value={viewNumber ?? ''}
                placeholder="On save"
                readOnly
              />
            </div>
            <div className="flex items-center gap-4 w-64">
              <span className="text-[#3f4a3a] w-20 text-right">Terms</span>
              <div className="flex-1 relative">
                <input
                  className="w-full h-8 px-2 border border-[#dad9dd] rounded text-right focus:outline-none focus:border-[#0a6400]"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                />
                <ChevronDown className="absolute right-2 top-1.5 text-[#72796e] pointer-events-none" size={16} />
              </div>
            </div>
            <div className="flex items-center gap-4 w-64">
              <span className="text-[#3f4a3a] w-20 text-right">Invoice date</span>
              <div className="flex-1 relative">
                <input
                  className="w-full h-8 px-2 border border-[#dad9dd] rounded text-right focus:outline-none focus:border-[#0a6400]"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
                <Calendar className="absolute right-2 top-1.5 text-[#72796e] pointer-events-none" size={16} />
              </div>
            </div>
            <div className="flex items-center gap-4 w-64">
              <span className="text-[#3f4a3a] w-20 text-right">Due date</span>
              <div className="flex-1 relative">
                <input
                  className="w-full h-8 px-2 border border-[#dad9dd] rounded text-right focus:outline-none focus:border-[#0a6400]"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
                <Calendar className="absolute right-2 top-1.5 text-[#72796e] pointer-events-none" size={16} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="p-8">
        <div className="flex justify-between items-center mb-2">
          <span className="font-semibold text-sm">Product or service</span>
          <div className="flex items-center gap-2 text-[#3f4a3a]">
            <button
              type="button"
              title="Duplicate last line"
              className="w-6 h-6 hover:bg-[#eeedf1] rounded flex items-center justify-center"
              onClick={() => setLines((ls) => [...ls, { ...ls[ls.length - 1], key: ++lineKey }])}
            >
              <Copy size={18} />
            </button>
            <button
              type="button"
              title="Remove last line"
              className="w-6 h-6 hover:bg-[#eeedf1] rounded flex items-center justify-center"
              onClick={() => setLines((ls) => (ls.length > 1 ? ls.slice(0, -1) : [blankLine()]))}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
        <table className="w-full text-left text-sm mb-4">
          <thead className="border-b border-[#dad9dd] text-[#3f4a3a] font-semibold">
            <tr>
              <th className="py-2 w-10">#</th>
              <th className="py-2">Product/service</th>
              <th className="py-2">Description</th>
              <th className="py-2 text-right w-20">Qty</th>
              <th className="py-2 text-right w-24">Rate</th>
              <th className="py-2 text-right w-24">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key} className="border-b border-[#dad9dd]">
                <td className="py-2 text-[#3f4a3a] text-center">
                  <span className="inline-flex items-center gap-1"><GripVertical size={16} /> {i + 1}</span>
                </td>
                <td className="py-2">
                  <input className={inputCls} type="text" value={l.service} onChange={(e) => updateLine(l.key, { service: e.target.value })} />
                </td>
                <td className="py-2">
                  <input className={inputCls} type="text" value={l.detail} onChange={(e) => updateLine(l.key, { detail: e.target.value })} />
                </td>
                <td className="py-2">
                  <input className={`${inputCls} text-right`} type="text" value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} />
                </td>
                <td className="py-2">
                  <input className={`${inputCls} text-right`} type="text" value={l.rate} onChange={(e) => updateLine(l.key, { rate: e.target.value })} />
                </td>
                <td className="py-2 text-right text-[#3f4a3a]">{money(lineAmount(l)).slice(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-2 mb-8">
          <button
            type="button"
            className="px-3 py-1 bg-white border border-[#dad9dd] rounded text-sm hover:bg-[#f4f3f7]"
            onClick={() => setLines((ls) => [...ls, blankLine()])}
          >
            Add lines
          </button>
          <button
            type="button"
            className="px-3 py-1 bg-white border border-[#dad9dd] rounded text-sm hover:bg-[#f4f3f7]"
            onClick={() => setLines([blankLine()])}
          >
            Clear all lines
          </button>
        </div>

        {/* Bottom section */}
        <div className="flex justify-between items-start">
          <div className="w-1/2 pr-8">
            <div className="mb-4">
              <h3 className="font-semibold text-sm mb-1">Customer payment options</h3>
              <div className="flex items-center gap-1 mb-2">
                <div className="w-8 h-5 bg-[#e9e8eb] rounded" />
                <div className="w-8 h-5 bg-[#e9e8eb] rounded" />
                <div className="w-8 h-5 bg-[#e9e8eb] rounded" />
                <span className="text-xs text-[#3f4a3a] ml-2">Activate online card or bank transfer payments</span>
              </div>
              <p className="text-xs text-[#3f4a3a] mb-2">
                Activate online card or bank transfer payments for your customers to send unlimited invoices.{' '}
                <a href="#" onClick={(e) => e.preventDefault()} className="text-[#0a6400] hover:underline">Activate payments</a>
              </p>
              <textarea
                className="w-full h-20 p-2 border border-[#dad9dd] rounded focus:outline-none focus:border-[#0a6400] text-sm bg-transparent"
                placeholder="Tell your customer how you want to get paid."
                value={payInstructions}
                onChange={(e) => setPayInstructions(e.target.value)}
              />
            </div>
            <div className="mb-4">
              <h3 className="font-semibold text-sm mb-1">Note to customer</h3>
              <textarea
                className="w-full h-16 p-2 border border-[#dad9dd] rounded focus:outline-none focus:border-[#0a6400] text-sm bg-transparent"
                placeholder="Thank you for your business."
                value={noteToCustomer}
                onChange={(e) => setNoteToCustomer(e.target.value)}
              />
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-1">Attachments</h3>
              <div className="border-2 border-dashed border-[#dad9dd] rounded-lg p-4 text-center cursor-pointer hover:bg-[#f4f3f7]">
                <span className="text-[#0a6400] text-sm font-semibold">Add attachment</span>
                <p className="text-xs text-[#3f4a3a] mt-1">Max file size: 20 MB</p>
              </div>
            </div>
          </div>

          <div className="w-1/2 flex flex-col gap-2 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-[#3f4a3a]">Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            {depositOpen && (
              <div className="flex justify-between items-center py-1">
                <span className="text-[#3f4a3a]">Deposit</span>
                <input
                  className="w-28 h-8 px-2 border border-[#dad9dd] rounded text-right focus:outline-none focus:border-[#0a6400]"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            )}
            {record && record.amountPaid > 0 && (
              <div className="flex justify-between py-1">
                <span className="text-[#3f4a3a]">Amount paid</span>
                <span>{money(record.amountPaid)}</span>
              </div>
            )}
            <div className="flex justify-between py-1">
              <span className="text-[#3f4a3a]">Invoice total</span>
              <span>{money(subtotal)}</span>
            </div>
            {!depositOpen && (
              <div className="flex justify-end mt-2">
                <button type="button" onClick={() => setDepositOpen(true)} className="text-[#0a6400] text-xs hover:underline">
                  + Charge a deposit
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const emailSheet = (
    <div className="w-full max-w-2xl bg-white shadow-sm border border-[#dad9dd] rounded-md h-fit p-8 text-center">
      <div className="bg-[#f4f3f7] p-8 rounded-t-lg mb-6">
        <h2 className="text-2xl font-bold text-[#1a1c1e] mb-1">Your invoice is ready!</h2>
        <p className="text-sm text-[#3f4a3a] mb-4">Total {money(viewTotal)}</p>
        <p className="text-xs font-semibold text-[#3f4a3a] uppercase tracking-wider mb-1">Balance Due</p>
        <p className="text-4xl font-semibold text-[#1a1c1e]">{money(viewBalance)}</p>
      </div>
      <p className="text-sm mb-6">{noteToCustomer.trim() || 'The email message you write will go here'}</p>
      <button
        type="button"
        onClick={() => setView('payor')}
        className="px-8 py-2 bg-[#0a6400] text-white rounded-full font-semibold text-sm mb-8 hover:bg-[#084e00]"
      >
        View details
      </button>
      <div className="border-t border-[#dad9dd] pt-6">
        <h3 className="font-bold text-sm mb-2">{BUSINESS_NAME}</h3>
      </div>
    </div>
  );

  const payorSheet = (
    <div className="w-full max-w-4xl bg-white shadow-sm border border-[#dad9dd] rounded-md h-fit relative">
      <div className="absolute top-4 right-4 text-sm text-[#3f4a3a] flex items-center gap-2">
        <span>Sign in</span>
        <User size={20} />
      </div>
      <div className="p-8 flex gap-8">
        <div className="w-2/3 flex flex-col gap-4">
          <div className="border border-[#dad9dd] rounded-lg p-6 text-center bg-[#faf9fc]">
            <p className="text-xs text-[#3f4a3a] uppercase mb-1">Balance Due</p>
            <p className="text-4xl font-semibold text-[#1a1c1e] mb-2">{money(viewBalance)}</p>
          </div>
          <div className="border border-[#dad9dd] rounded-lg p-6">
            <h3 className="font-bold text-lg mb-1">{BUSINESS_NAME}</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-[#3f4a3a]">Invoice</span>
              <span className="text-right">{viewNumber ?? '—'}</span>
              <span className="text-[#3f4a3a]">Due date</span>
              <span className="text-right">{fmtLong(viewDue) || '—'}</span>
              <span className="text-[#3f4a3a]">Invoice amount</span>
              <span className="text-right">{money(viewTotal)}</span>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setView('pdf')}
                className="px-4 py-1.5 border border-[#dad9dd] rounded text-sm hover:bg-[#f4f3f7]"
              >
                View Invoice
              </button>
              <button
                type="button"
                title="Download"
                onClick={onPrintOrDownload}
                className="p-1.5 border border-[#dad9dd] rounded hover:bg-[#f4f3f7]"
              >
                <Download size={18} />
              </button>
              <button
                type="button"
                title="Print"
                onClick={onPrintOrDownload}
                className="p-1.5 border border-[#dad9dd] rounded hover:bg-[#f4f3f7]"
              >
                <Printer size={18} />
              </button>
            </div>
          </div>
          <div className="border border-[#dad9dd] rounded-lg p-6">
            <h3 className="font-bold text-sm mb-2">Business details</h3>
            <p className="text-xs text-[#3f4a3a]">{BUSINESS_NAME}</p>
          </div>
        </div>
        <div className="w-1/3 border-l border-[#dad9dd] pl-8">
          <h3 className="font-bold text-sm mb-4">Payment options</h3>
          <div className="mb-6">
            <h4 className="font-semibold text-xs text-[#3f4a3a] mb-2">Accepted payment methods</h4>
            <div className="flex flex-wrap gap-1">
              <div className="w-8 h-5 bg-[#e9e8eb] rounded" />
              <div className="w-8 h-5 bg-[#e9e8eb] rounded" />
              <div className="w-8 h-5 bg-[#e9e8eb] rounded" />
            </div>
          </div>
          <div className="mb-6">
            <h4 className="font-semibold text-xs text-[#3f4a3a] mb-2">More options</h4>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between items-center">
                <span>Invoice total</span>
                <div className="w-8 h-4 bg-[#0a6400] rounded-full relative"><div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full" /></div>
              </div>
              <div className="flex justify-between items-center">
                <span>Deposit</span>
                <div className="w-8 h-4 bg-[#e9e8eb] rounded-full relative"><div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full" /></div>
              </div>
              <div className="flex justify-between items-center">
                <span>Discount</span>
                <div className="w-8 h-4 bg-[#e9e8eb] rounded-full relative"><div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full" /></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const pdfSheet = (
    <div id="invoice-pdf-sheet" className="w-full max-w-3xl bg-white shadow-sm border border-[#dad9dd] rounded-md h-fit p-8">
      <div className="flex justify-between items-start mb-12">
        <div>
          <h1 className="text-2xl font-bold text-[#0a6400] mb-1">INVOICE</h1>
          <p className="text-sm font-semibold">{BUSINESS_NAME}</p>
        </div>
        {/* the mock's right block carries the business's email/phone —
            no business-contact source exists yet, so it stays empty
            rather than borrowing the customer's details (gap) */}
        <div className="text-right text-sm text-[#3f4a3a]" />
      </div>
      <div className="bg-[#f4f3f7] p-6 mb-8">
        <h3 className="font-bold text-sm mb-2">Invoice details</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-[#3f4a3a]">Invoice no.: {viewNumber ?? '—'}</span>
          <span className="text-[#3f4a3a]">Terms: {terms}</span>
          <span className="text-[#3f4a3a]">Invoice date: {invoiceDate}</span>
          <span className="text-[#3f4a3a]">Due date: {dueDate || fmtMDY(viewDue)}</span>
        </div>
      </div>
      <table className="w-full text-left text-sm mb-8">
        <thead className="border-b-2 border-[#dad9dd] font-semibold">
          <tr>
            <th className="py-2">#</th>
            <th className="py-2">Product or service</th>
            <th className="py-2">Description</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Rate</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.key} className="border-b border-[#dad9dd]">
              <td className="py-4">{i + 1}</td>
              <td className="py-4">{l.service}</td>
              <td className="py-4">{l.detail}</td>
              <td className="py-4 text-right">{l.qty}</td>
              <td className="py-4 text-right">{l.rate ? money(num(l.rate)).slice(1) : ''}</td>
              <td className="py-4 text-right">{money(lineAmount(l)).slice(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end">
        <div className="w-1/3">
          <div className="flex justify-between py-1 text-sm font-semibold border-t border-[#dad9dd]">
            <span>Total</span>
            <span>{money(viewTotal)}</span>
          </div>
          {record && record.balanceDue !== record.total && (
            <div className="flex justify-between py-1 text-sm border-t border-[#dad9dd]">
              <span>Balance due</span>
              <span>{money(record.balanceDue)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div style={framed ? { height: '100%' } : { margin: '0 -32px', height: 'calc(100vh - 96px)' }} className="flex flex-col bg-white text-[#1a1c1e]">
      {/* ── Header band (the overlay's top header, as the page's bar) ── */}
      <div className="h-14 bg-white border-b border-[#dad9dd] flex items-center justify-between px-6 shrink-0 relative z-30">
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className="flex items-center gap-3"
            title="Open an invoice"
          >
            <History className="text-[#72796e]" size={22} />
            <span className="text-lg font-semibold">{viewNumber ? `Invoice ${viewNumber}` : 'New invoice'}</span>
            {record && <span className="text-xs font-semibold text-[#3f4a3a] uppercase tracking-wide">{record.status}</span>}
          </button>
          {pickerOpen && (
            <div className="absolute left-0 top-12 w-96 max-w-[90vw] bg-white border border-[#dad9dd] rounded-md shadow-lg overflow-hidden">
              <button
                type="button"
                className="w-full text-left px-4 py-2.5 text-sm font-semibold text-[#0a6400] hover:bg-[#f4f3f7] border-b border-[#dad9dd]"
                onClick={() => { setPickerOpen(false); loadIntoForm(null); }}
              >
                + New invoice
              </button>
              <div className="max-h-80 overflow-y-auto">
                {invoices.length === 0 && (
                  <div className="px-4 py-3 text-sm text-[#3f4a3a]">No invoices yet.</div>
                )}
                {invoices.map((inv) => (
                  <button
                    key={inv.id}
                    type="button"
                    className={`w-full text-left px-4 py-2.5 hover:bg-[#f4f3f7] flex items-center justify-between gap-3 ${record?.id === inv.id ? 'bg-[#f4f3f7]' : ''}`}
                    onClick={() => { setPickerOpen(false); loadIntoForm(inv); }}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold truncate">{inv.number} · {inv.customerName}</span>
                      <span className="block text-xs text-[#3f4a3a]">{fmtLong(inv.createdAt ? inv.createdAt.slice(0, 10) : null)} · {inv.status}</span>
                    </span>
                    <span className="text-sm font-semibold">{money(inv.total)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tabs — views of this same page */}
        <div className="flex items-center gap-6 h-full">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setView(t.key)}
              className={`h-full border-b-2 text-sm font-medium ${
                view === t.key
                  ? 'border-[#0a6400] text-[#0a6400]'
                  : 'border-transparent text-[#3f4a3a] hover:text-[#1a1c1e]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <button type="button" className="flex items-center gap-1 text-sm font-semibold text-[#3f4a3a] hover:text-[#1a1c1e]">
            <Settings size={18} /> Manage
          </button>
          <button type="button" className="flex items-center gap-1 text-sm font-semibold text-[#3f4a3a] hover:text-[#1a1c1e]">
            <CirclePlay size={18} /> Take tour
          </button>
          <button type="button" className="flex items-center gap-1 text-sm font-semibold text-[#3f4a3a] hover:text-[#1a1c1e]">
            <MessageSquare size={18} /> Feedback
          </button>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-full hover:bg-[#f4f3f7] flex items-center justify-center text-[#3f4a3a]"
            >
              <X size={20} />
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Content band ── */}
      <div className="flex-1 overflow-y-auto bg-[#faf9fc] flex justify-center py-8 px-4">
        {loading ? (
          <div className="text-sm text-[#3f4a3a] py-16">Loading invoices…</div>
        ) : loadError ? (
          <div className="text-center py-16">
            <p className="text-sm text-red-700 mb-3">Load failed: {loadError}</p>
            <button
              type="button"
              onClick={() => { setLoading(true); fetchList(null); }}
              className="px-4 py-1.5 bg-white border border-[#dad9dd] rounded text-sm hover:bg-[#f4f3f7]"
            >
              Retry
            </button>
          </div>
        ) : view === 'edit' ? editSheet
          : view === 'email' ? emailSheet
          : view === 'payor' ? payorSheet
          : pdfSheet}
      </div>

      {/* ── Footer band ── */}
      <div className="h-16 bg-white border-t border-[#dad9dd] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => loadIntoForm(record)}
            className="px-4 py-1.5 bg-white border border-[#dad9dd] rounded text-sm hover:bg-[#f4f3f7]"
          >
            Cancel
          </button>
          {status && (
            <span className={`text-sm ${status.ok ? 'text-[#0a6400]' : 'text-red-700'}`}>{status.text}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onPrintOrDownload} className="text-sm font-semibold text-[#1a1c1e] hover:underline">
            Print or download
          </button>
          <div className="flex">
            <button
              type="button"
              disabled={busy}
              onClick={onSave}
              className="px-4 py-1.5 bg-white border border-[#dad9dd] rounded-l text-sm font-semibold hover:bg-[#f4f3f7] disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onSave}
              className="px-2 border-y border-r border-[#dad9dd] rounded-r hover:bg-[#f4f3f7] disabled:opacity-50"
              title="Save"
            >
              <ChevronDown size={18} />
            </button>
          </div>
          <div className="flex">
            <button
              type="button"
              disabled={busy}
              onClick={onReviewAndSend}
              className="px-4 py-1.5 bg-[#0a6400] text-white rounded-l text-sm font-semibold hover:bg-[#084e00] disabled:opacity-50"
            >
              {view === 'email' && record ? 'Send invoice' : 'Review and send'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onReviewAndSend}
              className="px-2 border-l border-[#084e00] bg-[#0a6400] text-white rounded-r hover:bg-[#084e00] disabled:opacity-50"
              title="Review and send"
            >
              <ChevronDown size={18} />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #invoice-pdf-sheet, #invoice-pdf-sheet * { visibility: visible !important; }
          #invoice-pdf-sheet { position: absolute !important; left: 0; top: 0; width: 100% !important; max-width: none !important; border: none !important; box-shadow: none !important; }
        }
      `}</style>
    </div>
  );
}
