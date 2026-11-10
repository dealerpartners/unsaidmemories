'use client';
/* CustomersScreen — Customer list + profile (8 tabs).
   1:1 port of upload/Contacts_extracted/Contacts/customers flat table before profile page.html
   — now backed by the shared platform store (§1.1 Parties) and the Context
   Envelope (§1.3): creating from a customer profile prefills that customer. */
import { useState, useEffect, useMemo } from 'react';
import { usePlatformStore, type Document } from '@/lib/platformStore';
import DocumentEngine from '@/components/DocumentEngine';

interface CustomersScreenProps {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
  initialView?: 'list' | 'detail';
  partyId?: string | null;
  onCreate?: (label: string) => void;
}

type Tab = 'transactions' | 'activity' | 'statements' | 'recurring' | 'details' | 'latefees' | 'notes' | 'tasks';

const fmt = (n: number) => `$${(n || 0).toFixed(2)}`;
const initials = (name: string) => (name || '').split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '??';

/* "New transaction" menu labels → canonical create keys (PART 3 map) */
const TXN_LABEL_MAP: Record<string, string> = {
  'Invoice': 'Invoice',
  'Payment': 'Receive payment',
  'Recurring payment': 'Recurring payment',
  'Estimate': 'Estimate',
  'Payment Link': 'Payment link',
  'Sales Receipt': 'Sales receipt',
  'Credit memo': 'Credit memo',
  'Statement': 'Statement',
};

export default function CustomersScreen({ onToast, initialView = 'list', partyId: propPartyId, onCreate }: CustomersScreenProps) {
  const store = usePlatformStore();
  const [view, setView] = useState<'list' | 'detail'>(initialView);
  const [selectedId, setSelectedId] = useState<string | null>(propPartyId || null);
  const [tab, setTab] = useState<Tab>('transactions');
  const [txnMenuOpen, setTxnMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);

  const customers = useMemo(() => store.parties.filter(p => p.roles.includes('Customer')), [store.parties]);
  const party = selectedId ? store.getParty(selectedId) : customers[0];

  const partyDocs = useMemo(
    () => (party ? store.documents.filter(d => d.partyId === party.id) : []),
    [store.documents, party]
  );
  const openInvoices = partyDocs.filter(d => d.type === 'Invoice' && d.balance > 0);
  const overdueInvoices = partyDocs.filter(d => d.type === 'Invoice' && d.status === 'Overdue');
  const openBalance = openInvoices.reduce((s, d) => s + d.balance, 0);
  const overdueAmount = overdueInvoices.reduce((s, d) => s + d.balance, 0);
  const recentlyPaid = partyDocs
    .filter(d => d.amountPaid > 0)
    .reduce((s, d) => s + d.amountPaid, 0);
  const estimates = partyDocs.filter(d => d.type === 'Estimate');

  /* §1.3 Context Envelope: while a customer profile is the active context,
     every create (flyout, quick action, New transaction) inherits party_id.
     return_to brings closing surfaces back to this list. */
  useEffect(() => {
    if (view !== 'detail' || !party) return;
    usePlatformStore.getState().setEnvelope({
      originModule: 'contacts',
      originRecordId: party.id,
      partyId: party.id,
      returnTo: 'contacts:customers',
    });
    return () => {
      usePlatformStore.getState().clearEnvelope();
    };
  }, [view, party?.id]);

  const tabs: { id: Tab; label: string; badge?: boolean }[] = [
    { id: 'transactions', label: 'Transaction List' },
    { id: 'activity', label: 'Activity Feed' },
    { id: 'statements', label: 'Statements' },
    { id: 'recurring', label: 'Recurring Transactions' },
    { id: 'details', label: 'Customer Details' },
    { id: 'latefees', label: 'Late Fees' },
    { id: 'notes', label: 'Notes' },
    { id: 'tasks', label: 'Tasks', badge: true },
  ];

  const txnMenuItems = ['Invoice', 'Payment', 'Recurring payment', 'Estimate', 'Payment Link', 'Sales Receipt', 'Credit memo', 'Statement'];
  const txnIcons: Record<string, string> = { Invoice: 'receipt_long', Payment: 'payments', 'Recurring payment': 'autorenew', Estimate: 'request_quote', 'Payment Link': 'link', 'Sales Receipt': 'point_of_sale', 'Credit memo': 'assignment_return', Statement: 'summarize' };

  /* Create from this record — the §1.3 payoff */
  function createFromProfile(label: string) {
    setTxnMenuOpen(false);
    const canonical = TXN_LABEL_MAP[label] || label;
    if (onCreate) onCreate(canonical);
    else onToast(`Creating ${label} for ${party?.name || 'customer'}…`);
  }

  /* Row click on a transaction opens the document (§1.5) */
  function openDoc(doc: Document) {
    setEditingDocId(doc.id);
  }

  const listOpenTotal = customers.reduce((s, p) => s + Math.max(0, p.balance), 0);
  const listEstimateTotal = customers.reduce((s, p) => s + store.documents.filter(d => d.partyId === p.id && d.type === 'Estimate').reduce((x, d) => x + d.total, 0), 0);
  const listOverdueCount = store.documents.filter(d => d.status === 'Overdue' && customers.some(c => c.id === d.partyId)).length;
  const listOverdueAmount = store.documents.filter(d => d.status === 'Overdue' && customers.some(c => c.id === d.partyId)).reduce((s, d) => s + d.balance, 0);

  return (
    <div className="crm-green">
      {/* ═══ VIEW 1: LIST ═══ */}
      {view === 'list' && (
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="px-8 py-4 shrink-0 bg-white border-b border-surface-dim">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-[22px] font-semibold">Customers</h1>
              <div className="flex">
                <button className="h-8 px-3 bg-primary text-white text-[13px] font-semibold rounded-l hover:bg-primary-container flex items-center gap-1" onClick={() => onCreate ? onCreate('Add customer') : onToast('Opening New Customer form...')}><span className="material-symbols-outlined text-[16px]">add</span>New customer</button>
                <button className="h-8 px-1.5 bg-primary text-white rounded-r hover:bg-primary-container border-l border-primary-container"><span className="material-symbols-outlined text-[16px]">expand_more</span></button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <a href="#" className="text-[12px] text-primary hover:underline" onClick={e => { e.preventDefault(); }}>Check out the new view with filters</a>
              <div className="text-[11px] text-on-surface-variant flex items-center gap-1">Last updated 27 minutes ago <span className="material-symbols-outlined text-[14px] cursor-pointer hover:text-on-surface">refresh</span></div>
            </div>
          </div>

          {/* Summary Strip */}
          <div className="px-8 py-4 shrink-0 bg-white">
            <div className="bg-[#eef5fa] rounded-lg p-6 flex flex-col">
              <div className="flex items-center justify-between text-[13px] font-medium text-on-surface mb-4">
                <div className="flex flex-col"><span className="text-[18px] font-semibold">{fmt(listEstimateTotal)}</span><span className="text-[11px] text-on-surface-variant">{estimates.length} estimates</span></div>
                <div className="flex flex-col"><span className="text-[18px] font-semibold">{fmt(listOverdueAmount)}</span><span className="text-[11px] text-on-surface-variant">{listOverdueCount} overdue invoices</span></div>
                <div className="flex flex-col"><span className="text-[18px] font-semibold">{fmt(listOpenTotal)}</span><span className="text-[11px] text-on-surface-variant">{openInvoices.length} open invoice or credit</span></div>
                <div className="flex flex-col text-right"><span className="text-[18px] font-semibold">{fmt(recentlyPaid)}</span><span className="text-[11px] text-on-surface-variant">recently paid</span></div>
              </div>
              <div className="flex h-4 rounded overflow-hidden">
                <div className="w-[15%] bg-[#00d2eb]"></div><div className="w-[15%] bg-[#d95f3b]"></div><div className="w-[55%] bg-[#bdc3c7]"></div><div className="w-[15%] bg-[#0a6400]"></div>
              </div>
            </div>
          </div>

          {/* Promo Banner */}
          <div className="px-8 shrink-0 mb-4">
            <div className="bg-[#f4f7f9] border border-[#e0e6ea] rounded-lg p-4 flex items-center gap-4 relative">
              <div className="w-16 h-16 bg-[#0077c5] rounded flex items-center justify-center text-white"><span className="material-symbols-outlined text-[32px]">payments</span></div>
              <div className="flex-1">
                <div className="text-[10px] font-bold text-[#d81b60] bg-[#fce4ec] inline-block px-2 py-0.5 rounded mb-1">FOR YOU</div>
                <div className="text-[14px] font-semibold">See your money sooner</div>
                <div className="text-[12px] text-on-surface-variant mt-1">Don&apos;t lose another minute waiting on checks in the mail. Let customers pay with credit and debit cards, ACH, Apple Pay®, PayPal, and Venmo.</div>
                <div className="flex gap-4 mt-2"><a href="#" className="text-[12px] text-primary hover:underline">Set it up</a><a href="#" className="text-[12px] text-primary hover:underline">See rates</a></div>
              </div>
              <button className="absolute top-2 right-2 text-on-surface-variant hover:text-on-surface"><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>
          </div>

          {/* Table Area */}
          <div className="px-8 flex-1">
            <div className="flex items-center justify-between mb-4">
              <div className="relative w-64"><span className="material-symbols-outlined absolute left-2 top-1.5 text-[18px] text-outline">search</span><input className="w-full h-8 pl-8 pr-2 border border-surface-dim rounded text-[13px] focus:outline-none focus:border-primary" placeholder="Search" /></div>
              <div className="flex items-center gap-2">
                <button className="icon-btn"><span className="material-symbols-outlined">print</span></button>
                <button className="icon-btn"><span className="material-symbols-outlined">download</span></button>
                <button className="icon-btn"><span className="material-symbols-outlined">settings</span></button>
              </div>
            </div>
            <table className="w-full text-left text-[13px]">
              <thead><tr className="border-b border-surface-dim text-[11px] uppercase tracking-wider text-on-surface-variant">
                <th className="w-8 py-2"><input type="checkbox" className="accent-primary" /></th>
                <th className="py-2 font-semibold">Name <span className="material-symbols-outlined text-[12px] align-middle">arrow_upward</span></th>
                <th className="py-2 font-semibold">Company name <span className="material-symbols-outlined text-[12px] align-middle">unfold_more</span></th>
                <th className="py-2 font-semibold">Phone</th>
                <th className="py-2 font-semibold text-right">Open balance <span className="material-symbols-outlined text-[12px] align-middle">unfold_more</span></th>
                <th className="py-2 font-semibold text-right">Action</th>
              </tr></thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.id} className="border-b border-surface-dim hover:bg-surface-container-low cursor-pointer" onClick={() => { setSelectedId(c.id); setView('detail'); }}>
                    <td className="py-3"><input type="checkbox" className="accent-primary" onClick={e => e.stopPropagation()} /></td>
                    <td className="py-3 font-medium text-primary hover:underline">{c.name}</td>
                    <td className="py-3 text-on-surface-variant">{c.name}</td>
                    <td className="py-3 text-on-surface-variant">{c.phone || '-'}</td>
                    <td className="py-3 text-right tabular-nums">{fmt(Math.max(0, c.balance))}</td>
                    <td className="py-3 text-right"><button className="text-primary hover:underline mr-2" onClick={e => { e.stopPropagation(); setSelectedId(c.id); setView('detail'); createFromProfile('Payment'); }}>Receive payment <span className="material-symbols-outlined text-[12px] align-middle">arrow_drop_down</span></button></td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-on-surface-variant">No customers yet — create one from the Create menu.</td></tr>
                )}
              </tbody>
            </table>
            <div className="flex items-center justify-end mt-4 gap-2 text-[12px] text-on-surface-variant"><span>1-{customers.length} of {customers.length}</span><button className="w-6 h-6 flex items-center justify-center rounded bg-surface-container text-on-surface font-semibold">1</button></div>
          </div>
        </div>
      )}

      {/* ═══ VIEW 2: DETAIL ═══ */}
      {view === 'detail' && party && (
        <div className="flex h-full w-full">
          {/* Left Sidebar */}
          <aside className="w-[280px] bg-white border-r border-surface-dim flex flex-col shrink-0">
            <div className="h-14 px-4 flex items-center justify-between border-b border-surface-dim">
              <button className="flex items-center gap-1 text-primary font-semibold text-[13px] hover:underline" onClick={() => setView('list')}><span className="material-symbols-outlined text-[16px]">arrow_back_ios</span>Customers</button>
              <div className="flex items-center gap-1 text-outline">
                <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => onCreate ? onCreate('Add customer') : onToast('Opening New Customer form...')}><span className="material-symbols-outlined text-[16px]">add</span></button>
                <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center"><span className="material-symbols-outlined text-[16px]">filter_list</span></button>
              </div>
            </div>
            <div className="p-4">
              <div className="relative mb-3"><span className="material-symbols-outlined absolute left-2 top-1.5 text-[18px] text-outline">search</span><input className="w-full h-8 pl-8 pr-2 border border-surface-dim rounded text-[13px] focus:outline-none focus:border-primary" placeholder="Search by name or details" /></div>
              <div className="flex items-center gap-2 text-[12px] text-on-surface-variant mb-4">
                <button className="flex items-center gap-1 bg-surface-container px-2 py-1 rounded border border-surface-dim font-medium"><span className="material-symbols-outlined text-[14px]">history</span>Recent</button>
                <button className="flex items-center gap-1 px-2 py-1"><span className="material-symbols-outlined text-[14px]">sort</span>Name</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2">
              <div className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider px-2 mb-2">Recently viewed customers</div>
              {customers.slice(0, 8).map(c => (
                <button key={c.id} className={`w-full text-left bg-surface-container-low border border-surface-dim rounded-lg p-2 cursor-pointer mb-1 hover:border-primary ${c.id === party.id ? 'border-primary' : ''}`} onClick={() => setSelectedId(c.id)}>
                  <div className="font-medium text-[13px]">{c.name}</div>
                  <div className="text-[11px] text-on-surface-variant">{fmt(Math.max(0, c.balance))}</div>
                </button>
              ))}
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col h-full overflow-hidden bg-background">
            {/* Top Action Bar */}
            <header className="h-14 px-6 flex items-center justify-between bg-white border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-4"><button className="flex items-center gap-1 text-primary font-semibold text-[13px] hover:underline" onClick={() => setView('list')}><span className="material-symbols-outlined text-[16px]">arrow_back_ios</span>Customers</button></div>
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-1 text-[13px] text-on-surface-variant font-medium hover:underline"><span className="material-symbols-outlined text-[18px]">chat_bubble_outline</span>Give feedback</button>
                <div className="flex">
                  <button className="h-8 px-3 border border-surface-dim rounded-l bg-white text-[13px] font-semibold hover:bg-surface-container" onClick={() => setEditDrawerOpen(true)}>Edit</button>
                  <button className="h-8 px-1.5 border border-l-0 border-surface-dim rounded-r bg-white hover:bg-surface-container"><span className="material-symbols-outlined text-[16px]">expand_more</span></button>
                </div>
                <div className="flex relative">
                  <button className="h-8 px-3 bg-primary text-white text-[13px] font-semibold rounded-l hover:bg-primary-container flex items-center gap-1" onClick={() => createFromProfile('Invoice')}>New transaction</button>
                  <button className="h-8 px-1.5 bg-primary text-white rounded-r hover:bg-primary-container border-l border-primary-container" onClick={e => { e.stopPropagation(); setTxnMenuOpen(v => !v); }}><span className="material-symbols-outlined text-[16px]">expand_more</span></button>
                  {txnMenuOpen && (
                    <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                      <div className="menu-header">New transaction</div>
                      {txnMenuItems.map(t => <button key={t} onClick={() => createFromProfile(t)}><span className="material-symbols-outlined">{txnIcons[t]}</span>{t}</button>)}
                    </div>
                  )}
                </div>
              </div>
            </header>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Customer Profile Card */}
              <div className="bg-white border border-surface-dim rounded-xl p-6 flex gap-6 mb-4">
                <div className="w-1/4 flex flex-col items-center justify-center text-center border-r border-surface-dim pr-6">
                  <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-xl font-bold text-on-surface-variant mb-3">{initials(party.name)}</div>
                  <h1 className="text-[22px] font-semibold mb-1">{party.name}</h1>
                  <div className="text-[12px] text-on-surface-variant mb-4">{party.roles.join(' · ')}</div>
                  <div className="flex items-center gap-2">
                    <button className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-high" title="Create note"><span className="material-symbols-outlined text-[18px]">edit_note</span></button>
                    <button className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-high" title="Create task" onClick={() => setTaskDrawerOpen(true)}><span className="material-symbols-outlined text-[18px]">task_alt</span></button>
                  </div>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-6 text-[13px]">
                  <div className="space-y-4">
                    <div><div className="font-semibold text-on-surface-variant mb-1">Email</div>{party.email ? <span className="text-primary">{party.email}</span> : <a href="#" className="text-primary hover:underline">Add email</a>}</div>
                    <div><div className="font-semibold text-on-surface-variant mb-1">Billing address</div>{party.address ? <span>{[party.address, party.city, party.state, party.zip].filter(Boolean).join(', ')}</span> : <a href="#" className="text-primary hover:underline">Add billing address</a>}</div>
                    <div><div className="font-semibold text-on-surface-variant mb-1">Notes</div>{party.notes ? <span>{party.notes}</span> : <a href="#" className="text-primary hover:underline">Add notes</a>}</div>
                  </div>
                  <div className="space-y-4">
                    <div><div className="font-semibold text-on-surface-variant mb-1">Phone</div>{party.phone ? <span>{party.phone}</span> : <a href="#" className="text-primary hover:underline">Add phone number</a>}</div>
                    <div><div className="font-semibold text-on-surface-variant mb-1">Terms</div><span>{party.terms}</span></div>
                    <div><div className="font-semibold text-on-surface-variant mb-1">Custom Fields</div><button className="mt-1 text-on-surface-variant hover:text-on-surface"><span className="material-symbols-outlined text-[18px]">edit</span></button></div>
                  </div>
                </div>
                <div className="w-64 shrink-0 bg-[#eef5fa] rounded-lg p-4">
                  <h3 className="font-semibold text-[14px] mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-[18px] text-primary">account_balance_wallet</span>Financial summary</h3>
                  <div className="mb-4"><div className="flex items-center gap-1 text-[12px] text-on-surface-variant mb-1"><span className="w-2 h-2 rounded-full bg-yellow-400" />Open Balance</div><div className="text-[20px] font-semibold text-on-surface">{fmt(openBalance)}</div></div>
                  <div><div className="flex items-center gap-1 text-[12px] text-on-surface-variant mb-1"><span className="w-2 h-2 rounded-full bg-error" />Overdue payment</div><div className="text-[20px] font-semibold text-on-surface">{fmt(overdueAmount)}</div></div>
                </div>
              </div>

              {/* Tabs Navigation */}
              <div className="border-b border-surface-dim mb-4 overflow-x-auto">
                <div className="flex items-center gap-6 min-w-max">
                  {tabs.map(t => (
                    <button key={t.id} className={`pb-3 text-[14px] tab-underline ${tab === t.id ? 'active' : 'text-on-surface-variant hover:text-on-surface'} flex items-center gap-2`} onClick={() => setTab(t.id)}>
                      {t.label}{t.badge && <span className="bg-[#d81b60] text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">New</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* TAB CONTENT */}
              {tab === 'transactions' && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <button className="h-8 px-3 border border-surface-dim rounded text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container">Batch actions</button>
                    <select className="h-8 px-3 border border-surface-dim rounded text-[13px] bg-white"><option>All plus deposits</option><option>All transactions</option><option>Invoices</option><option>Estimates</option><option>Change orders</option><option>Credit memos</option><option>Sales Receipts</option><option>Money received</option><option>Recently paid</option></select>
                    <select className="h-8 px-3 border border-surface-dim rounded text-[13px] bg-white"><option>All</option><option>Open</option><option>Overdue</option><option>Paid</option></select>
                    <select className="h-8 px-3 border border-surface-dim rounded text-[13px] bg-white"><option>All</option><option>This month</option><option>Last month</option></select>
                    <a href="#" className="text-[13px] text-primary hover:underline ml-2">View Recurring Templates</a>
                  </div>
                  <div className="flex justify-end gap-2 mb-2">
                    <button className="icon-btn"><span className="material-symbols-outlined text-[18px]">print</span></button>
                    <button className="icon-btn"><span className="material-symbols-outlined text-[18px]">download</span></button>
                    <button className="icon-btn"><span className="material-symbols-outlined text-[18px]">more_vert</span></button>
                    <button className="icon-btn relative" onClick={e => { e.stopPropagation(); setSettingsMenuOpen(v => !v); }}><span className="material-symbols-outlined text-[18px]">settings</span></button>
                    {settingsMenuOpen && (
                      <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, minWidth: 200 }} onClick={e => e.stopPropagation()}>
                        <div className="menu-header">Transaction settings</div>
                        <button onClick={() => { setSettingsMenuOpen(false); onToast('Updated setting: columns'); }}><span className="material-symbols-outlined">view_column</span>Customize columns</button>
                        <button onClick={() => { setSettingsMenuOpen(false); onToast('Updated setting: rows'); }}><span className="material-symbols-outlined">view_list</span>Row height</button>
                        <button onClick={() => { setSettingsMenuOpen(false); onToast('Updated setting: sort'); }}><span className="material-symbols-outlined">sort</span>Sort by date</button>
                        <div className="sep"></div>
                        <button onClick={() => { setSettingsMenuOpen(false); onToast('Updated setting: export'); }}><span className="material-symbols-outlined">download</span>Export to CSV</button>
                      </div>
                    )}
                  </div>
                  <table className="data-table">
                    <thead><tr>
                      <th className="w-8"><input type="checkbox" className="accent-primary" /></th>
                      <th>Date <span className="material-symbols-outlined text-[12px] align-middle">arrow_drop_down</span></th>
                      <th>Type</th><th>No.</th><th>Customer</th><th>Memo</th>
                      <th className="text-right">Amount</th><th>Status</th><th className="text-right">Action</th>
                    </tr></thead>
                    <tbody>
                      {partyDocs.map(d => (
                        <tr key={d.id} className="cursor-pointer hover:bg-surface-container-low" onClick={() => openDoc(d)}>
                          <td><input type="checkbox" className="accent-primary" onClick={e => e.stopPropagation()} /></td>
                          <td>{d.date}</td><td>{d.type}</td><td className="font-medium">{d.number}</td><td>{party.name}</td><td className="text-on-surface-variant">{d.memo || '-'}</td>
                          <td className="text-right tabular-nums">{fmt(d.total)}</td><td>{d.status}</td>
                          <td className="text-right space-x-2"><button className="action-link" onClick={e => { e.stopPropagation(); openDoc(d); }}>View/Edit</button></td>
                        </tr>
                      ))}
                      {partyDocs.length === 0 && (
                        <tr><td colSpan={9} className="text-center py-8 text-on-surface-variant">No transactions yet — create one with New transaction.</td></tr>
                      )}
                    </tbody>
                    <tfoot><tr className="bg-surface-container-low font-semibold"><td colSpan={6} className="text-right">Total</td><td className="text-right tabular-nums">{fmt(partyDocs.reduce((s, d) => s + d.total, 0))}</td><td colSpan={2}></td></tr></tfoot>
                  </table>
                </div>
              )}

              {tab === 'activity' && (
                <div className="bg-white border border-surface-dim rounded-xl p-8 flex items-center gap-8">
                  <div className="flex-1">
                    <h2 className="text-2xl font-semibold mb-2">Keep track of every interaction</h2>
                    <p className="text-body-md text-on-surface-variant mb-6 max-w-lg">Strengthen your connection with {party.name}. Add a note, task, feedback survey, or contract — new activities will appear here from now on.</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="border border-surface-dim rounded-lg p-4"><div className="material-symbols-outlined text-[24px] text-on-surface-variant mb-2">edit_note</div><h3 className="font-semibold text-[14px] mb-1">Create a note</h3><p className="text-[12px] text-on-surface-variant mb-4">Capture important details. Add your first note to keep customer info handy.</p><button className="w-full h-8 border border-surface-dim rounded text-[12px] font-semibold hover:bg-surface-container">Add note</button></div>
                      <div className="border border-surface-dim rounded-lg p-4"><div className="material-symbols-outlined text-[24px] text-on-surface-variant mb-2">task_alt</div><h3 className="font-semibold text-[14px] mb-1">Assign a task</h3><p className="text-[12px] text-on-surface-variant mb-4">Stay organized. Create a task to track your work and never miss a step.</p><button className="w-full h-8 border border-surface-dim rounded text-[12px] font-semibold hover:bg-surface-container" onClick={() => setTaskDrawerOpen(true)}>Add task</button></div>
                    </div>
                    {partyDocs.length > 0 && (
                      <div className="mt-6 border-t border-surface-dim pt-4">
                        <h3 className="font-semibold text-[14px] mb-2">Recent document activity</h3>
                        {partyDocs.slice(0, 5).map(d => (
                          <div key={d.id} className="text-[12px] text-on-surface-variant py-1">
                            <span className="font-medium text-on-surface">{d.type} {d.number}</span> — {d.activity[d.activity.length - 1]?.text || 'created'}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="w-64 h-64 shrink-0 bg-surface-container-low rounded-full flex items-center justify-center"><span className="material-symbols-outlined text-[80px] text-outline">support_agent</span></div>
                </div>
              )}

              {tab === 'statements' && (
                <div>
                  <div className="flex items-center gap-3 mb-4"><button className="h-8 px-3 border border-surface-dim rounded text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container">Batch actions</button><select className="h-8 px-3 border border-surface-dim rounded text-[13px] bg-white"><option>Last 12 months</option><option>This year</option></select></div>
                  <table className="data-table"><thead><tr><th className="w-8"><input type="checkbox" /></th><th>Date</th><th>No.</th><th>Customer</th><th>Start Date</th><th>End Date</th><th>Statement Type</th><th className="text-right">Action</th></tr></thead><tbody><tr><td colSpan={8} className="text-center py-8 text-on-surface-variant">No matching statements found.</td></tr></tbody></table>
                </div>
              )}

              {tab === 'recurring' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="relative"><span className="material-symbols-outlined absolute left-2 top-1.5 text-[18px] text-outline">search</span><input className="h-8 pl-8 pr-2 border border-surface-dim rounded text-[13px] w-64" placeholder="Search by template name" /></div>
                    <div className="flex items-center gap-3"><a href="#" className="text-[13px] text-primary hover:underline">Manage recurring payments</a><div className="flex"><button className="h-8 px-3 bg-primary text-white text-[13px] font-semibold rounded-l hover:bg-primary-container flex items-center gap-1">New template</button><button className="h-8 px-1.5 bg-primary text-white rounded-r hover:bg-primary-container border-l border-primary-container"><span className="material-symbols-outlined text-[16px]">expand_more</span></button></div></div>
                  </div>
                  <table className="data-table"><thead><tr><th>Name</th><th>Type</th><th>Txn Type</th><th>Interval</th><th>Previous Date</th><th>Next Date</th><th className="text-right">Amount</th><th className="text-right">Action</th></tr></thead><tbody><tr><td colSpan={8} className="text-center py-8 text-on-surface-variant">No matching recurring transactions found.</td></tr></tbody></table>
                </div>
              )}

              {tab === 'details' && (
                <div className="grid grid-cols-2 gap-8 text-[13px]">
                  <div>
                    <h3 className="font-semibold text-[14px] mb-3">Contact info</h3>
                    <table className="w-full">
                      <tbody>
                      {[['Customer', party.name], ['Email', party.email || '-'], ['Phone', party.phone || '-'], ['Tax ID', party.taxId || '-'], ['Terms', party.terms], ['Notes', party.notes || '-']].map(([k, v]) => (
                        <tr key={k} className="border-b border-surface-dim"><td className="py-2 text-on-surface-variant w-1/3">{k}</td><td className="py-2 font-medium">{v}</td></tr>
                      ))}
                      </tbody>
                    </table>
                    <h3 className="font-semibold text-[14px] mt-6 mb-3">Attachments</h3>
                    <div className="text-on-surface-variant">None</div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-[14px] mb-3">Additional info</h3>
                    <table className="w-full">
                      <tbody>
                      {[['Billing address', [party.address, party.city, party.state, party.zip].filter(Boolean).join(', ') || '-'], ['Shipping address', 'See all addresses'], ['Terms', party.terms], ['Credit limit', fmt(party.creditLimit)], ['Added', party.added]].map(([k, v]) => (
                        <tr key={k} className="border-b border-surface-dim"><td className="py-2 text-on-surface-variant w-1/3">{k}</td><td className="py-2">{v === 'See all addresses' ? <a href="#" className="text-primary hover:underline">{v}</a> : v}</td></tr>
                      ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tab === 'latefees' && (
                <div className="border border-surface-dim rounded-lg p-6 bg-white text-[13px]">To apply late fees, you&apos;ll first need to turn them on at a company level under <a href="#" className="font-semibold underline text-on-surface">Account and Settings</a>.</div>
              )}

              {tab === 'notes' && (
                <div>
                  <div className="flex items-center justify-between mb-4 border-b border-surface-dim pb-2">
                    <div className="flex items-center gap-4 text-on-surface-variant"><button className="hover:text-on-surface"><span className="material-symbols-outlined text-[18px]">star_border</span></button><button className="hover:text-on-surface"><span className="material-symbols-outlined text-[18px]">refresh</span></button></div>
                    <button className="text-[13px] font-semibold text-primary hover:underline flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">add</span>Add note</button>
                  </div>
                  <div className="empty-state mt-12"><span className="material-symbols-outlined">folder_open</span><div className="font-semibold text-[14px] text-on-surface mt-4">No notes yet</div></div>
                </div>
              )}

              {tab === 'tasks' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div></div>
                    <div className="flex items-center gap-2">
                      <button className="h-8 px-3 border border-surface-dim rounded text-[13px] font-semibold hover:bg-surface-container flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">filter_list</span>Filter</button>
                      <button className="h-8 px-3 bg-primary text-white text-[13px] font-semibold rounded hover:bg-primary-container flex items-center gap-1" onClick={() => setTaskDrawerOpen(true)}><span className="material-symbols-outlined text-[16px]">add</span>Add task</button>
                    </div>
                  </div>
                  <table className="data-table"><thead><tr><th>Task</th><th>Priority</th><th>Assigned To</th><th>Due Date <span className="material-symbols-outlined text-[12px] align-middle">arrow_upward</span></th><th className="text-right">Actions</th></tr></thead>
                    <tbody><tr><td colSpan={5} className="text-center py-12"><div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#8af5be] text-[#00714b] mb-2"><span className="material-symbols-outlined text-[20px]">check</span></div><h3 className="font-semibold text-[14px] text-on-surface">You&apos;re caught up!</h3><p className="text-[12px] text-on-surface-variant mt-1">You don&apos;t have any tasks to do. Check back soon to stay on top of things.</p></td></tr></tbody>
                  </table>
                </div>
              )}
            </div>
          </main>
        </div>
      )}

      {/* Document Engine (opened from a transaction row) */}
      {editingDocId && (
        <DocumentEngine
          type={store.getDocument(editingDocId)?.type || 'Invoice'}
          documentId={editingDocId}
          onToast={onToast}
          onClose={() => setEditingDocId(null)}
        />
      )}

      {/* Scrim + Task Drawer */}
      {taskDrawerOpen && (
        <>
          <div className="drawer-scrim open" onClick={() => setTaskDrawerOpen(false)} />
          <div className="drawer open">
            <div className="flex items-center justify-between px-6 h-14 border-b border-surface-dim shrink-0"><h3 className="text-[16px] font-semibold">Add task</h3><button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setTaskDrawerOpen(false)}><span className="material-symbols-outlined text-[20px]">close</span></button></div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div><label className="field-label">Task name</label><input className="field-input" placeholder="e.g. Follow up on invoice" /></div>
              <div><label className="field-label">Description</label><textarea className="field-textarea" placeholder="Add details..."></textarea></div>
              <div><label className="field-label">Assign to</label><select className="field-input"><option>Select one</option><option>Jordan A.</option><option>Sarah A.</option></select></div>
              <div><label className="field-label">Due date</label><input className="field-input" type="date" defaultValue="2026-11-03" /></div>
              <div><label className="field-label">Priority</label><select className="field-input"><option>-</option><option>High</option><option>Medium</option><option>Low</option></select></div>
              <div className="pt-4 border-t border-surface-dim"><div className="flex items-center justify-between mb-2"><h4 className="font-semibold text-[13px]">Linked records (1)</h4><span className="material-symbols-outlined text-[18px] text-on-surface-variant">expand_more</span></div><div className="text-[12px]"><span className="text-primary font-medium">Customer</span><br /><span className="text-on-surface-variant">Customer: {party?.name}</span></div></div>
              <div className="pt-4 border-t border-surface-dim"><div className="flex items-center justify-between mb-2"><h4 className="font-semibold text-[13px]">Attachments (0)</h4><span className="material-symbols-outlined text-[18px] text-on-surface-variant">expand_more</span></div><div className="border border-dashed border-surface-dim rounded-lg p-6 text-center text-on-surface-variant"><span className="material-symbols-outlined text-[28px] mb-1">upload_file</span><div className="text-[11px]">Drop files here or click to browse</div></div></div>
            </div>
            <div className="p-4 border-t border-surface-dim flex justify-end shrink-0"><button className="h-8 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container" onClick={() => { setTaskDrawerOpen(false); onToast('Task saved successfully'); }}>Save</button></div>
          </div>
        </>
      )}

      {/* Customer Edit Drawer */}
      {editDrawerOpen && party && (
        <>
          <div className="drawer-scrim open" onClick={() => setEditDrawerOpen(false)} />
          <div className="drawer drawer-wide open" style={{ width: 700 }}>
            <div className="flex items-center justify-between px-6 h-14 border-b border-surface-dim shrink-0 bg-white">
              <h3 className="text-[18px] font-medium text-on-surface">Customer</h3>
              <div className="flex items-center gap-1 text-on-surface-variant">
                <button className="icon-btn"><span className="material-symbols-outlined">chat_bubble_outline</span></button>
                <button className="icon-btn"><span className="material-symbols-outlined">print</span></button>
                <button className="icon-btn"><span className="material-symbols-outlined">attach_money</span></button>
                <button className="icon-btn"><span className="material-symbols-outlined">edit</span></button>
                <button className="icon-btn"><span className="material-symbols-outlined">receipt_long</span></button>
                <button className="icon-btn"><span className="material-symbols-outlined">description</span></button>
                <button className="icon-btn"><span className="material-symbols-outlined">group_add</span></button>
                <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center ml-2" onClick={() => setEditDrawerOpen(false)}><span className="material-symbols-outlined text-[20px]">close</span></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-white">
              <section>
                <div className="flex items-center justify-between mb-4 border-b border-surface-dim pb-2"><h3 className="text-[15px] font-semibold text-on-surface flex items-center gap-2"><span className="material-symbols-outlined text-[20px]">badge</span>Name and contact</h3><span className="material-symbols-outlined text-on-surface-variant">expand_more</span></div>
                <div className="grid grid-cols-4 gap-4 mb-4"><div><label className="field-label">Title</label><input className="field-input" /></div><div><label className="field-label">First name</label><input className="field-input" defaultValue={party.firstName} /></div><div><label className="field-label">Middle name</label><input className="field-input" /></div><div><label className="field-label">Last name</label><input className="field-input" defaultValue={party.lastName} /></div></div>
                <div className="grid grid-cols-4 gap-4 mb-4"><div><label className="field-label">Suffix</label><input className="field-input" /></div><div className="col-span-2"><label className="field-label">Company name</label><input className="field-input" defaultValue={party.name} /></div><div><label className="field-label">Customer display name *</label><input className="field-input" defaultValue={party.displayName} /></div></div>
                <div className="grid grid-cols-2 gap-4 mb-4"><div><label className="field-label">Email</label><input className="field-input" defaultValue={party.email} /></div><div><label className="field-label">Phone number</label><input className="field-input" defaultValue={party.phone} /></div></div>
                <div className="grid grid-cols-2 gap-4 mb-4"><div><label className="field-label">Cc</label><input className="field-input" /></div><div><label className="field-label">Bcc</label><input className="field-input" /></div></div>
                <div className="grid grid-cols-2 gap-4 mb-4"><div><label className="field-label">Mobile number</label><input className="field-input" /></div><div><label className="field-label">Fax</label><input className="field-input" /></div></div>
                <div className="grid grid-cols-2 gap-4 mb-4"><div><label className="field-label">Other</label><input className="field-input" /></div><div><label className="field-label">Website</label><input className="field-input" /></div></div>
                <div className="mb-4"><label className="field-label">Name to print on checks</label><input className="field-input w-1/2" defaultValue={party.displayName} /></div>
                <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="accent-primary" /> Is a sub-customer</label>
              </section>
              <section>
                <div className="flex items-center justify-between mb-4 border-b border-surface-dim pb-2"><h3 className="text-[15px] font-semibold text-on-surface flex items-center gap-2"><span className="material-symbols-outlined text-[20px]">mark_email_read</span>Communication permissions</h3><span className="material-symbols-outlined text-on-surface-variant">expand_more</span></div>
                <div className="text-center py-6 bg-surface-container-lowest border border-surface-dim rounded-lg"><span className="material-symbols-outlined text-[32px] text-on-surface-variant mb-2">verified_user</span><div className="text-[13px] font-semibold text-on-surface mb-1">Enter an email to record customer consent.</div><div className="text-[12px] text-on-surface-variant max-w-sm mx-auto">If the customer has opted in to receive email marketing communications, acknowledge it here once you&apos;ve added an email.</div></div>
              </section>
              <section>
                <div className="flex items-center justify-between mb-4 border-b border-surface-dim pb-2"><h3 className="text-[15px] font-semibold text-on-surface flex items-center gap-2"><span className="material-symbols-outlined text-[20px]">location_on</span>Addresses</h3><span className="material-symbols-outlined text-on-surface-variant">expand_more</span></div>
                <div className="mb-6"><h4 className="text-[13px] font-semibold text-on-surface mb-3">Billing address</h4><div className="grid grid-cols-2 gap-4 mb-4"><div><label className="field-label">Street address 1</label><input className="field-input" defaultValue={party.address} /></div><div><label className="field-label">Street address 2</label><input className="field-input" /></div></div><div className="grid grid-cols-2 gap-4 mb-4"><div><label className="field-label">City</label><input className="field-input" defaultValue={party.city} /></div><div><label className="field-label">State</label><input className="field-input" defaultValue={party.state} /></div></div><div className="grid grid-cols-2 gap-4 mb-4"><div><label className="field-label">ZIP code</label><input className="field-input" defaultValue={party.zip} /></div><div><label className="field-label">Country</label><input className="field-input" defaultValue={party.country} /></div></div></div>
                <div><h4 className="text-[13px] font-semibold text-on-surface mb-3">Shipping address</h4><label className="flex items-center gap-2 text-[13px] mb-3"><input type="checkbox" className="accent-primary" defaultChecked /> Add your billing address as one of the shipping addresses</label><div className="mb-4"><label className="field-label">Default shipping address</label><select className="field-input"><option>Same as billing address</option></select></div></div>
              </section>
            </div>
            <div className="h-16 border-t border-surface-dim px-6 flex items-center justify-end shrink-0 bg-white"><button className="h-9 px-6 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container" onClick={() => { setEditDrawerOpen(false); onToast('Customer saved successfully'); }}>Save</button></div>
          </div>
        </>
      )}
    </div>
  );
}
