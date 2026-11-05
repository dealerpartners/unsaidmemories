'use client';

/**
 * Contacts workspace — the ERP Contacts page (QuickBooks-spec
 * master-detail, owner ruling 2026-11-01: Contacts live in the ERP
 * under Sales; clicking Contacts opens this workspace directly, and
 * the page carries its own sidebar = the master list below).
 *
 * Layout per ~/workspace/user/files/qb-customer-profile-city-parks.html
 * with QB branding stripped: white background, Unsaid neutral palette,
 * Lucide icons, every tab a REAL ROUTE under /admin/customers/[id].
 *
 * Wired this checkpoint: master list (search + balances + add contact),
 * header card, financial summary (acct_ar_invoices — see
 * lib/contacts/data.ts), Transaction List (the profile payments ledger
 * route, Step-0 twin-less ecommerce rows included), Contact Details
 * (view + Edit Profile via the existing PATCH route), Support Tickets
 * (support_tickets by requester keys). The remaining tabs render an
 * honest empty state with NO controls — wiring them is checkpoint 4.
 * The superseded CustomersView/CustomerDetailsView files stay on disk,
 * unmounted (preservation law).
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  Copy,
  FileText,
  Mail,
  Phone,
  Plus,
  Search,
  StickyNote,
  Wallet,
} from 'lucide-react';
import type {
  Contact,
  ContactListItem,
  ContactSummary,
  ContactTicket,
} from '@/lib/contacts/data';

export type TabKey =
  | 'transactions'
  | 'activity'
  | 'statements'
  | 'recurring'
  | 'details'
  | 'notes'
  | 'tasks'
  | 'opportunities'
  | 'tickets'
  | 'conversations';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'transactions', label: 'Transaction List' },
  { key: 'activity', label: 'Activity Feed' },
  { key: 'statements', label: 'Statements' },
  { key: 'recurring', label: 'Recurring Transactions' },
  { key: 'details', label: 'Contact Details' },
  { key: 'notes', label: 'Notes' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'opportunities', label: 'Opportunities' },
  { key: 'tickets', label: 'Support Tickets' },
  { key: 'conversations', label: 'Conversations' },
];

const EMPTY_TAB_COPY: Partial<Record<TabKey, { title: string; line: string }>> = {
  activity: { title: 'Activity Feed', line: 'No activity has been recorded for this contact yet.' },
  statements: { title: 'Statements', line: 'No statements have been generated for this contact yet.' },
  recurring: { title: 'Recurring Transactions', line: 'No recurring transactions are set up for this contact yet.' },
  notes: { title: 'Notes', line: 'No notes have been recorded for this contact yet.' },
  tasks: { title: 'Tasks', line: 'No tasks are recorded for this contact yet.' },
  opportunities: { title: 'Opportunities', line: 'No opportunities are recorded for this contact yet.' },
  conversations: { title: 'Conversations', line: 'No conversations have been recorded for this contact yet.' },
};

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    Number.isFinite(n) ? n : 0,
  );

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

function displayName(c: {
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
  company_name?: string | null;
  email?: string | null;
}): string {
  const personal = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  if (personal) return c.preferred_name ? `${personal} (${c.preferred_name})` : personal;
  if (c.company_name) return c.company_name;
  return c.email || 'Unnamed contact';
}

function initialsOf(name: string): string {
  const words = name.replace(/[()]/g, '').split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words[0][0] + (words[1]?.[0] || '')).toUpperCase();
}

function titleCase(s: string): string {
  const t = String(s || '').trim().toLowerCase().replace(/_/g, ' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

const inputCls =
  'w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-[13px] text-neutral-900 focus:border-neutral-500 focus:outline-none';
const labelCls = 'block text-[11px] font-medium text-neutral-500';

/* ============================ Master list ============================ */

function MasterList({
  contacts,
  activeId,
}: {
  contacts: ContactListItem[];
  activeId: string | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    company_name: '',
    email: '',
    phone: '',
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((c) =>
      [displayName(c), c.company_name, c.email, c.phone, c.mobile_phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [contacts, q]);

  const createContact = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, string> = {
        // NOT NULL columns with no DB defaults — the create endpoint's
        // proven-live defaults (same set the support desk create uses).
        customer_type: 'individual',
        lifecycle_stage: 'new_customer',
        lifecycle_status: 'healthy',
        country: 'US',
      };
      for (const [k, v] of Object.entries(form)) {
        if (v.trim()) body[k] = v.trim();
      }
      const res = await fetch('/api/admin/crm/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) throw new Error(j?.error || 'Could not create the contact');
      const newId = j?.id || j?.data?.id || (Array.isArray(j) ? j[0]?.id : null);
      if (newId) router.push(`/admin/customers/${newId}`);
      else router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Could not create the contact');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col self-start border-r border-neutral-200 bg-white">
      <div className="space-y-2 border-b border-neutral-100 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-600">Search by name or details</span>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded p-1 text-neutral-700 hover:bg-neutral-100"
            data-tip="Add a new contact"
            aria-label="Add contact"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
          <input
            className="w-full rounded border border-neutral-300 py-1 pl-8 pr-2 text-xs text-neutral-900 focus:border-neutral-500 focus:outline-none"
            placeholder="Search"
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {adding && (
          <form onSubmit={createContact} className="space-y-2 rounded border border-neutral-200 bg-neutral-50 p-2.5">
            <div className="text-xs font-semibold text-neutral-900">New contact</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>First name</label>
                <input className={inputCls} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Last name</label>
                <input className={inputCls} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Company</label>
              <input className={inputCls} value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input className={inputCls} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            {error && <p className="text-xs text-rose-700">{error}</p>}
            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="submit"
                disabled={busy}
                className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700 disabled:opacity-60"
                data-tip="Create this contact and open its page"
              >
                {busy ? 'Creating…' : 'Create contact'}
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
      <div className="border-b border-neutral-100 bg-neutral-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        Recently updated
      </div>
      <div className="max-h-[calc(100vh-13rem)] flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-xs text-neutral-500">
            {contacts.length === 0 ? 'No contacts yet.' : 'No contacts match your search.'}
          </p>
        )}
        {filtered.map((c) => {
          const active = c.id === activeId;
          return (
            <Link
              key={c.id}
              href={`/admin/customers/${c.id}`}
              className={`block border-l-4 px-3 py-2.5 ${
                active
                  ? 'border-neutral-900 bg-neutral-100'
                  : 'border-transparent hover:bg-neutral-50'
              }`}
            >
              <div className={`text-xs ${active ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-800'}`}>
                {displayName(c)}
              </div>
              <div className="mt-0.5 text-xs text-neutral-600">{fmtMoney(Number(c.balance) || 0)}</div>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

/* ============================ Header card ============================ */

function HeaderCard({
  contact,
  summary,
  base,
}: {
  contact: Contact;
  summary: ContactSummary;
  base: string;
}) {
  const [copied, setCopied] = useState(false);
  const name = displayName(contact);
  const phone = contact.phone || contact.mobile_phone;
  const address = [
    contact.address_line1,
    contact.address_line2,
    [contact.city, contact.state, contact.postal_code].filter(Boolean).join(', '),
    contact.country,
  ]
    .filter(Boolean)
    .join('\n');

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(contact.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — the id stays visible to copy by hand.
    }
  };

  const quickBtn =
    'flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900';

  return (
    <div className="border-b border-neutral-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-start gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-neutral-200 text-xl font-semibold tracking-tight text-neutral-600 shadow-inner">
            {initialsOf(name)}
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight text-neutral-900">{name}</h1>
            {contact.company_name && contact.company_name !== name && (
              <p className="mt-0.5 text-xs text-neutral-500">{contact.company_name}</p>
            )}
            <div className="mt-2 inline-flex items-center gap-1.5 rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
              <span className="text-[9px] font-bold uppercase text-neutral-500">Contact ID</span>
              <span className="font-mono font-semibold text-neutral-900">{contact.id}</span>
              <button
                type="button"
                onClick={copyId}
                className="ml-1 text-neutral-500 hover:text-neutral-800"
                data-tip="Copy contact ID"
                aria-label="Copy contact ID"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
            <div className="mt-3.5 flex items-center gap-2">
              {contact.email && (
                <a href={`mailto:${contact.email}`} className={quickBtn} data-tip="Send email" aria-label="Send email">
                  <Mail className="h-4 w-4" />
                </a>
              )}
              {phone && (
                <a href={`tel:${phone}`} className={quickBtn} data-tip="Call" aria-label="Call">
                  <Phone className="h-4 w-4" />
                </a>
              )}
              <Link href={`${base}/statements`} className={quickBtn} data-tip="Create statement" aria-label="Create statement">
                <FileText className="h-4 w-4" />
              </Link>
              <Link href={`${base}/notes`} className={quickBtn} data-tip="Add note" aria-label="Add note">
                <StickyNote className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="grid max-w-lg grid-cols-2 gap-x-8 gap-y-3 text-xs">
          <div>
            <span className="block font-medium text-neutral-500">Email</span>
            {contact.email ? (
              <a className="text-blue-700 hover:underline" href={`mailto:${contact.email}`}>
                {contact.email}
              </a>
            ) : (
              <span className="text-neutral-800">—</span>
            )}
          </div>
          <div>
            <span className="block font-medium text-neutral-500">Phone</span>
            <span className="text-neutral-800">{phone || '—'}</span>
          </div>
          <div className="col-span-2">
            <span className="block font-medium text-neutral-500">Address</span>
            <span className="whitespace-pre-line leading-relaxed text-neutral-800">{address || '—'}</span>
          </div>
          {contact.lead_source_name && (
            <div className="col-span-2 flex items-center gap-2">
              <span className="font-medium text-neutral-500">Lead Source:</span>
              <span className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium text-neutral-700">
                {contact.lead_source_name}
              </span>
            </div>
          )}
        </div>

        <div className="w-64 shrink-0 rounded-xl border border-sky-100 bg-sky-50 p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-neutral-900">
            <Wallet className="h-4 w-4 text-sky-700" />
            Financial summary
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex items-center text-[11px] text-neutral-600">
                <span className="mr-1.5 h-2 w-2 rounded-full bg-amber-500" />
                Open balance
              </div>
              <div className="ml-3.5 text-lg font-bold text-neutral-900">{fmtMoney(summary.openBalance)}</div>
            </div>
            <div className="border-t border-sky-100 pt-2">
              <div className="flex items-center text-[11px] text-neutral-600">
                <span className="mr-1.5 h-2 w-2 rounded-full bg-rose-600" />
                Overdue payment
              </div>
              <div className="ml-3.5 text-lg font-bold text-neutral-900">{fmtMoney(summary.overdueBalance)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================== Transaction list ========================= */

type LedgerRow = {
  id: string;
  kind: 'payment' | 'invoice' | 'receipt' | 'order';
  type: string;
  description: string;
  amount: number;
  status: string;
  method: string | null;
  invoiceNumber: string | null;
  reference: string | null;
  timestamp: string;
};

function statusChip(status: string) {
  const s = status.toLowerCase();
  let cls = 'bg-neutral-100 text-neutral-800';
  if (s.includes('overdue')) cls = 'bg-rose-100 text-rose-900';
  else if (s === 'paid' || s === 'succeeded' || s === 'captured' || s === 'completed' || s === 'fulfilled') cls = 'bg-emerald-100 text-emerald-900';
  else if (s.includes('unpaid') || s === 'partial' || s === 'partially_paid' || s === 'open' || s.includes('pending')) cls = 'bg-amber-100 text-amber-900';
  else if (s.includes('void') || s.includes('cancel') || s.includes('refund') || s.includes('fail')) cls = 'bg-neutral-200 text-neutral-700';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {titleCase(status) || '—'}
    </span>
  );
}

function rowHref(r: LedgerRow): string | null {
  if (r.id.startsWith('inv-')) return `/admin/accounting/invoices/${r.id.slice(4)}`;
  if (r.id.startsWith('ord-')) return `/admin/orders/${r.id.slice(4)}`;
  return null;
}

function TransactionsPanel({ contact }: { contact: Contact }) {
  const profileId = contact.source_customer_id || contact.id;
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    fetch(`/api/admin/crm/customers/${profileId}/payments?crm_id=${encodeURIComponent(contact.id)}`, {
      cache: 'no-store',
    })
      .then(async (res) => {
        const j = res.ok ? await res.json().catch(() => ({})) : {};
        if (!live) return;
        if (!res.ok) throw new Error('ledger failed');
        setRows(Array.isArray(j.data) ? j.data : []);
      })
      .catch(() => {
        if (live) setFailed(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [profileId, contact.id]);

  const statusOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.status).filter(Boolean))),
    [rows],
  );

  const filtered = useMemo(() => {
    const now = new Date();
    return rows.filter((r) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (dateFilter !== 'all') {
        const t = new Date(r.timestamp).getTime();
        if (Number.isNaN(t)) return false;
        if (dateFilter === '30d' && t < now.getTime() - 30 * 24 * 3600 * 1000) return false;
        if (dateFilter === 'month' && (new Date(t).getMonth() !== now.getMonth() || new Date(t).getFullYear() !== now.getFullYear())) return false;
        if (dateFilter === 'year' && new Date(t).getFullYear() !== now.getFullYear()) return false;
      }
      return true;
    });
  }, [rows, typeFilter, statusFilter, dateFilter]);

  const total = filtered.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const selectCls =
    'rounded border border-neutral-300 bg-white py-1 pl-2 pr-6 text-xs font-medium text-neutral-800 focus:border-neutral-500 focus:outline-none';

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 bg-white px-6 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-neutral-500">Type</span>
            <select className={selectCls} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="Invoice">Invoices</option>
              <option value="Payment">Payments</option>
              <option value="Receipt">Receipts</option>
              <option value="Order">Orders</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-neutral-500">Status</span>
            <select className={selectCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-neutral-500">Date</span>
            <select className={selectCls} value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="30d">Last 30 days</option>
              <option value="month">This month</option>
              <option value="year">This year</option>
            </select>
          </div>
        </div>
        <Link
          href={`/admin/customers/${contact.id}/recurring`}
          className="font-medium text-blue-700 hover:underline"
          data-tip="See this contact's recurring transactions"
        >
          View Recurring Templates
        </Link>
      </div>

      {loading && <p className="px-6 py-6 text-xs text-neutral-500">Loading transactions…</p>}
      {!loading && failed && (
        <p className="px-6 py-6 text-xs text-rose-700">The transaction ledger could not be loaded. Nothing is shown rather than a partial history.</p>
      )}
      {!loading && !failed && filtered.length === 0 && (
        <p className="px-6 py-6 text-xs text-neutral-500">
          {rows.length === 0
            ? 'No transactions recorded for this contact yet.'
            : 'No transactions match the current filters.'}
        </p>
      )}
      {!loading && !failed && filtered.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  <th className="px-6 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">No.</th>
                  <th className="px-3 py-2.5">Memo</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-neutral-800">
                {filtered.map((r) => {
                  const href = rowHref(r);
                  return (
                    <tr key={r.id} className="hover:bg-neutral-50">
                      <td className="whitespace-nowrap px-6 py-3 text-neutral-700">{fmtDate(r.timestamp)}</td>
                      <td className="px-3 py-3 font-medium">{r.type}</td>
                      <td className="px-3 py-3 text-neutral-600">{r.invoiceNumber || r.reference || '—'}</td>
                      <td className="px-3 py-3 italic text-neutral-500">{r.description}</td>
                      <td className="px-3 py-3 text-right font-medium text-neutral-900">{fmtMoney(r.amount)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{statusChip(r.status)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                        {href ? (
                          <Link href={href} className="text-blue-700 hover:underline" data-tip="Open the full record">
                            View/Edit
                          </Link>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-b border-t border-neutral-200 bg-neutral-50 px-6 py-2.5 text-xs font-semibold text-neutral-800">
            <div>Total</div>
            <div className="text-sm font-bold text-neutral-900">{fmtMoney(total)}</div>
          </div>
          <div className="flex items-center justify-end px-6 py-3 text-xs text-neutral-500">
            <span className="font-medium text-neutral-800">
              {filtered.length === 0 ? '0 of 0' : `1–${filtered.length} of ${filtered.length}`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/* =========================== Details panel =========================== */

const EDITABLE_FIELDS: { key: keyof Contact; label: string }[] = [
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'middle_name', label: 'Middle Name' },
  { key: 'preferred_name', label: 'Preferred Name' },
  { key: 'company_name', label: 'Company Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'mobile_phone', label: 'Mobile Phone' },
  { key: 'address_line1', label: 'Address Line 1' },
  { key: 'address_line2', label: 'Address Line 2' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postal_code', label: 'Postal Code' },
  { key: 'country', label: 'Country' },
  { key: 'preferred_contact_method', label: 'Preferred Contact Method' },
  { key: 'preferred_language', label: 'Preferred Language' },
];

function DetailsPanel({ contact, autoEdit }: { contact: Contact; autoEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(autoEdit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of EDITABLE_FIELDS) init[f.key] = String(contact[f.key] ?? '');
    return init;
  });

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body: Record<string, string | null> = {};
      for (const f of EDITABLE_FIELDS) {
        const v = form[f.key].trim();
        body[f.key] = v === '' ? null : v;
      }
      const res = await fetch(`/api/admin/crm/customers/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) throw new Error(j?.error || 'Could not save the profile');
      setEditing(false);
      setNotice('Profile saved.');
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Could not save the profile');
    } finally {
      setBusy(false);
    }
  };

  const address = [
    contact.address_line1,
    contact.address_line2,
    [contact.city, contact.state, contact.postal_code].filter(Boolean).join(', '),
    contact.country,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div className="space-y-6 p-6 text-xs">
      <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
        <h3 className="text-sm font-semibold text-neutral-900">Full Contact Profile &amp; Settings</h3>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-neutral-300 bg-white px-3 py-1 font-semibold text-neutral-800 hover:bg-neutral-50"
            data-tip="Edit this contact's details"
          >
            Edit Profile
          </button>
        )}
      </div>

      {notice && <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">{notice}</p>}
      {error && <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">{error}</p>}

      {editing ? (
        <form onSubmit={save} className="grid grid-cols-2 gap-4">
          {EDITABLE_FIELDS.map((f) => (
            <div key={f.key}>
              <label className={labelCls}>{f.label}</label>
              <input
                className={inputCls}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </div>
          ))}
          <div className="col-span-2 flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="rounded bg-neutral-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700 disabled:opacity-60"
              data-tip="Save these details to the contact record"
            >
              {busy ? 'Saving…' : 'Save profile'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded border border-neutral-300 bg-white px-4 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3 rounded border border-neutral-200 p-4">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-800">Company &amp; Contact Details</h4>
            <div><span className="block text-neutral-500">Display Name:</span> <span className="font-medium text-neutral-900">{displayName(contact)}</span></div>
            <div><span className="block text-neutral-500">Company:</span> <span className="font-medium text-neutral-900">{contact.company_name || '—'}</span></div>
            <div><span className="block text-neutral-500">Email:</span> <span className="font-medium text-blue-700">{contact.email || '—'}</span></div>
            <div><span className="block text-neutral-500">Phone:</span> <span className="font-medium text-neutral-900">{contact.phone || '—'}</span></div>
            <div><span className="block text-neutral-500">Mobile:</span> <span className="font-medium text-neutral-900">{contact.mobile_phone || '—'}</span></div>
            <div><span className="block text-neutral-500">Address:</span> <span className="whitespace-pre-line font-medium text-neutral-900">{address || '—'}</span></div>
          </div>
          <div className="space-y-3 rounded border border-neutral-200 p-4">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-800">Account &amp; Preferences</h4>
            <div><span className="block text-neutral-500">Customer Type:</span> <span className="font-medium text-neutral-900">{contact.customer_type ? titleCase(contact.customer_type) : '—'}</span></div>
            <div><span className="block text-neutral-500">Lifecycle Stage:</span> <span className="font-medium text-neutral-900">{contact.lifecycle_stage ? titleCase(contact.lifecycle_stage) : '—'}</span></div>
            <div><span className="block text-neutral-500">Lifecycle Status:</span> <span className="font-medium text-neutral-900">{contact.lifecycle_status ? titleCase(contact.lifecycle_status) : '—'}</span></div>
            <div><span className="block text-neutral-500">Lead Status:</span> <span className="font-medium text-neutral-900">{contact.lead_status ? titleCase(contact.lead_status) : '—'}</span></div>
            <div><span className="block text-neutral-500">Preferred Contact:</span> <span className="font-medium text-neutral-900">{contact.preferred_contact_method ? titleCase(contact.preferred_contact_method) : '—'}</span></div>
            <div><span className="block text-neutral-500">Preferred Language:</span> <span className="font-medium text-neutral-900">{contact.preferred_language || '—'}</span></div>
            <div><span className="block text-neutral-500">Contact Since:</span> <span className="font-medium text-neutral-900">{fmtDate(contact.customer_since || contact.created_at)}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================== Tickets panel =========================== */

function TicketsPanel({ tickets }: { tickets: ContactTicket[] }) {
  if (tickets.length === 0) {
    return (
      <div className="p-6 text-xs">
        <h3 className="border-b border-neutral-200 pb-3 text-sm font-semibold text-neutral-900">Support Tickets</h3>
        <p className="pt-4 text-neutral-600">No support tickets are recorded for this contact yet.</p>
      </div>
    );
  }
  return (
    <div className="p-6 text-xs">
      <h3 className="border-b border-neutral-200 pb-3 text-sm font-semibold text-neutral-900">Support Tickets</h3>
      <div className="divide-y divide-neutral-100">
        {tickets.map((t) => (
          <Link key={t.id} href="/admin/support" className="flex items-center justify-between gap-4 py-3 hover:bg-neutral-50" data-tip="Open in the support desk">
            <div className="min-w-0">
              <div className="truncate font-medium text-neutral-900">{t.subject || '(no subject)'}</div>
              <div className="mt-0.5 text-[11px] text-neutral-500">
                {t.ticket_ref ? `#${t.ticket_ref} · ` : ''}{fmtDate(t.created_at)}{t.source_channel ? ` · ${titleCase(t.source_channel)}` : ''}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {t.priority && <span className="text-[11px] font-medium text-neutral-600">{titleCase(t.priority)}</span>}
              {t.status && statusChip(t.status)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ============================== Workspace ============================ */

export default function ContactsWorkspace({
  contacts,
  contact,
  summary,
  tickets,
  activeTab,
  autoEdit = false,
}: {
  contacts: ContactListItem[];
  contact: Contact | null;
  summary: ContactSummary;
  tickets: ContactTicket[];
  activeTab: TabKey;
  autoEdit?: boolean;
}) {
  const [txMenuOpen, setTxMenuOpen] = useState(false);
  const base = contact ? `/admin/customers/${contact.id}` : '/admin/customers';

  const tabHref = (key: TabKey) => (key === 'transactions' ? base : `${base}/${key}`);

  return (
    <div className="flex flex-col bg-white text-[13px] text-neutral-900">
      {/* Action ribbon — one bar */}
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-2.5">
        <Link href="/admin/customers" className="inline-flex items-center text-sm font-semibold text-blue-700 hover:underline">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Contacts
        </Link>
        {contact && (
          <div className="flex items-center gap-3">
            <Link
              href={`${base}/details?edit=1`}
              className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50"
              data-tip="Edit this contact's profile"
            >
              Edit
            </Link>
            <div className="relative">
              <button
                type="button"
                onClick={() => setTxMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-semibold tracking-wide text-white shadow-sm hover:bg-neutral-700"
                data-tip="Create a transaction for this contact"
              >
                New transaction
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {txMenuOpen && (
                <>
                  <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setTxMenuOpen(false)} />
                  <div className="absolute right-0 z-20 mt-2 w-48 rounded border border-neutral-200 bg-white py-1 shadow-lg">
                    <Link href="/admin/accounting/invoices/new" className="block px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50" onClick={() => setTxMenuOpen(false)}>
                      Invoice
                    </Link>
                    <Link href="/admin/accounting/sales/estimates" className="block px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50" onClick={() => setTxMenuOpen(false)}>
                      Estimate
                    </Link>
                    <Link href="/admin/accounting/payments" className="block px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-50" onClick={() => setTxMenuOpen(false)}>
                      Payment
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Master-detail split */}
      <div className="flex items-start">
        <MasterList contacts={contacts} activeId={contact?.id ?? null} />
        <section className="min-w-0 flex-1 bg-white">
          {!contact && (
            <div className="p-10 text-center">
              <h2 className="text-base font-semibold text-neutral-900">No contacts yet</h2>
              <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-neutral-600">
                The directory is empty. Add the first contact from the panel on the left —
                it will open here, with its transactions, details, and tickets on one record.
              </p>
            </div>
          )}
          {contact && (
            <>
              <HeaderCard contact={contact} summary={summary} base={base} />
              <div className="flex items-center gap-5 overflow-x-auto border-b border-neutral-200 bg-white px-6 pt-2 text-xs font-medium text-neutral-700 select-none">
                {TABS.map((t) => {
                  const active = t.key === activeTab;
                  return (
                    <Link
                      key={t.key}
                      href={tabHref(t.key)}
                      className={`whitespace-nowrap pb-2.5 ${
                        active
                          ? 'border-b-[3px] border-neutral-900 font-semibold text-neutral-900'
                          : 'hover:text-neutral-900'
                      }`}
                    >
                      {t.label}
                    </Link>
                  );
                })}
              </div>
              {activeTab === 'transactions' && <TransactionsPanel contact={contact} />}
              {activeTab === 'details' && <DetailsPanel contact={contact} autoEdit={autoEdit} />}
              {activeTab === 'tickets' && <TicketsPanel tickets={tickets} />}
              {EMPTY_TAB_COPY[activeTab] && (
                <div className="p-6 text-xs">
                  <h3 className="border-b border-neutral-200 pb-3 text-sm font-semibold text-neutral-900">
                    {EMPTY_TAB_COPY[activeTab]!.title}
                  </h3>
                  <p className="pt-4 text-neutral-600">{EMPTY_TAB_COPY[activeTab]!.line}</p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
