'use client';
/* CrmOverviewScreen — 1:1 port of upload/Contacts_extracted/Contacts/crm overview.html
   Rewired to read from platformStore (§1.1 single source of truth).
   Every KPI, role count, at-risk row, and activity item derives from real
   parties + documents in the store — no mock arrays. */
import { useMemo, useState } from 'react';
import { usePlatformStore, type Party as StoreParty } from '@/lib/platformStore';

interface CrmOverviewProps { onToast: (m: string) => void; onNavigate?: (d: string, s: string) => void; onCreate?: (label: string) => void; }

function fmt(n: number) { return (n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' }); }
function initials(name: string) { return (name || '').split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '??'; }
function rolePill(r: string) {
  const cls = r === 'Customer' ? 'customer' : r === 'Vendor' ? 'vendor' : r === 'Supplier' ? 'supplier' : 'contact';
  return <span className={`pill role ${cls}`}>{r}</span>;
}
function iconForActivity(t: string) {
  return t === 'order' || t === 'Order' ? 'shopping_cart' : t === 'bill' || t === 'Bill' ? 'receipt_long' : t === 'payment' || t === 'Payment' ? 'payments' : t === 'status' ? 'sync' : t === 'created' ? 'add_circle' : 'circle';
}

/* Days since an ISO date — used to derive lastContactDays from party.lastActivity */
function daysSince(iso: string): number {
  if (!iso) return 9999;
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return 9999;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/* Derive the most recent activity tuple from the party's documents' activity logs */
function deriveActivity(party: StoreParty, docs: { partyId: string; type: string; number: string; activity: { date: string; type: string; text: string; actor: string }[] }[]): { date: string; type: string; text: string } | null {
  const partyDocs = docs.filter(d => d.partyId === party.id);
  if (partyDocs.length === 0) return null;
  const allEvents: { date: string; type: string; text: string }[] = [];
  partyDocs.forEach(d => d.activity.forEach(a => allEvents.push({ date: a.date, type: a.type === 'created' ? (d.type === 'Invoice' ? 'Order' : d.type === 'Bill' ? 'Bill' : 'Order') : a.type === 'payment' ? 'Payment' : a.type === 'status' ? 'Email sent' : 'Note', text: a.text })));
  allEvents.sort((a, b) => b.date.localeCompare(a.date));
  return allEvents[0] || null;
}

function deriveLastOrder(party: StoreParty, docs: { partyId: string; type: string; date: string }[]): string {
  const orderDocs = docs.filter(d => d.partyId === party.id && (d.type === 'Invoice' || d.type === 'SalesOrder'));
  if (orderDocs.length === 0) return '—';
  orderDocs.sort((a, b) => b.date.localeCompare(a.date));
  return orderDocs[0].date;
}

export default function CrmOverviewScreen({ onToast, onNavigate, onCreate }: CrmOverviewProps) {
  const parties = usePlatformStore(s => s.parties);
  const documents = usePlatformStore(s => s.documents);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);

  const m = useMemo(() => {
    const total = parties.length;
    const lastContactDays = (p: StoreParty) => daysSince(p.lastActivity);
    const atRisk = parties.filter(p => p.roles.includes('Customer') && lastContactDays(p) >= 30).length;
    const openAR = parties.filter(p => p.roles.includes('Customer')).reduce((s, p) => s + Math.max(0, p.balance), 0);
    const openAP = parties.filter(p => p.roles.includes('Vendor') || p.roles.includes('Supplier')).reduce((s, p) => s + Math.max(0, -p.balance), 0);
    const roleCounts = {
      Customer: parties.filter(p => p.roles.includes('Customer')).length,
      Vendor: parties.filter(p => p.roles.includes('Vendor')).length,
      Supplier: parties.filter(p => p.roles.includes('Supplier')).length,
      Contact: parties.filter(p => p.roles.includes('Lead')).length,
    };
    const pipeline = {
      Active: parties.filter(p => p.roles.includes('Customer') && lastContactDays(p) <= 14).length,
      Engaged: parties.filter(p => p.roles.includes('Customer') && lastContactDays(p) > 14 && lastContactDays(p) <= 30).length,
      'At risk': parties.filter(p => p.roles.includes('Customer') && lastContactDays(p) > 30).length,
      Dormant: parties.filter(p => p.roles.includes('Customer') && lastContactDays(p) > 90).length,
    };
    return { total, atRisk, openAR, openAP, roleCounts, pipeline, lastContactDays };
  }, [parties]);

  const atRiskRows = parties
    .filter(p => p.roles.includes('Customer') && m.lastContactDays(p) >= 30 && p.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  const activityItems = parties
    .map(p => ({ party: p, activity: deriveActivity(p, documents) }))
    .filter(x => x.activity)
    .sort((a, b) => (b.activity!.date).localeCompare(a.activity!.date))
    .slice(0, 6);

  const roleSplit = [
    { role: 'Customer', color: 'bg-primary', count: m.roleCounts.Customer },
    { role: 'Vendor', color: 'bg-qb-blue', count: m.roleCounts.Vendor },
    { role: 'Supplier', color: 'bg-error', count: m.roleCounts.Supplier },
    { role: 'Contact', color: 'bg-qb-maroon', count: m.roleCounts.Contact },
  ];
  const maxRole = Math.max(1, ...roleSplit.map(r => r.count));
  const pipelineSteps = [
    { label: 'Active', count: m.pipeline.Active, note: 'Recent orders' },
    { label: 'Engaged', count: m.pipeline.Engaged, note: 'Order in 14–30d' },
    { label: 'At risk', count: m.pipeline['At risk'], note: 'No order in 30d+' },
    { label: 'Dormant', count: m.pipeline.Dormant, note: 'No order in 90d+' },
  ];
  const totalPipeline = Math.max(1, pipelineSteps.reduce((s, x) => s + x.count, 0));

  const peek = peekId ? parties.find(p => p.id === peekId) : null;
  const peekActivity = peek ? deriveActivity(peek, documents) : null;
  const peekLastOrder = peek ? deriveLastOrder(peek, documents) : '—';

  const quickActions = [
    { label: 'Add customer', icon: 'person_add', role: 'Customer' },
    { label: 'Add vendor', icon: 'storefront', role: 'Vendor' },
    { label: 'Add supplier', icon: 'factory', role: 'Supplier' },
    { label: 'View Parties', icon: 'groups', link: 'parties' },
    { label: 'Segments', icon: 'filter_list', link: 'segments' },
    { label: 'Send reminder', icon: 'notifications_active', link: 'remind' },
  ];

  function openCreate(role: string) {
    setCreateMenuOpen(false);
    if (onCreate) onCreate(`Add ${role.toLowerCase()}`);
    else onToast(`Create party flow → role=${role}`);
  }

  return (
    <main className="px-6 pb-12">
      {/* BREADCRUMB */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Contacts</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">CRM Overview</span>
      </div>

      {/* PAGE HEADER */}
      <div className="flex items-start justify-between gap-4 py-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">CRM Overview</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Relationship health, pipeline, and the parties behind it — all from one data list.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onNavigate ? onNavigate('contacts', 'parties') : onToast('Navigate → Contacts > Parties')}><span className="material-symbols-outlined text-[16px]">groups</span>Open Parties</button>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Navigate → Contacts > Segments')}><span className="material-symbols-outlined text-[16px]">filter_list</span>Segments</button>
          <div className="flex">
            <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main" onClick={() => openCreate('Customer')}><span className="material-symbols-outlined text-[16px]">add</span>Add party</button>
            <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow" onClick={() => setCreateMenuOpen(v => !v)}><span className="material-symbols-outlined text-[16px]">expand_more</span></button>
          </div>
        </div>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Total parties</div>
          <div className="text-headline-sm mt-1 tabular-nums">{m.total}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">{m.roleCounts.Customer} customers · {m.roleCounts.Vendor + m.roleCounts.Supplier} vendors/suppliers</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">At risk</div>
          <div className="text-headline-sm mt-1 tabular-nums text-error">{m.atRisk}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">No contact 90d+</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Open AR</div>
          <div className="text-headline-sm mt-1 tabular-nums text-secondary">{fmt(m.openAR)}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Customer receivables</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Open AP</div>
          <div className="text-headline-sm mt-1 tabular-nums text-qb-blue">{fmt(m.openAP)}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Vendor/supplier payables</div>
        </div>
      </div>

      {/* TWO COLUMN LAYOUT */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-4">
        {/* LEFT */}
        <div className="xl:col-span-2 space-y-3">
          {/* Role split */}
          <div className="bg-white rounded-xl border border-surface-dim">
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
              <div><h2 className="text-headline-sm">Role split</h2><div className="text-[11px] text-on-surface-variant">Every party can hold multiple roles.</div></div>
              <button className="fin-link" onClick={() => onNavigate ? onNavigate('contacts', 'parties') : onToast('Navigate → Contacts > Parties')}><span className="material-symbols-outlined">open_in_new</span>Open Parties</button>
            </div>
            <div className="p-5 space-y-3">
              {roleSplit.map(r => (
                <div key={r.role}>
                  <div className="flex justify-between text-[12px] mb-1"><span className="font-medium">{r.role}</span><span className="text-on-surface-variant tabular-nums">{r.count}</span></div>
                  <div className="h-6 bg-surface-container-low rounded overflow-hidden"><div className={`${r.color} h-full flex items-center px-2 text-[10px] text-white font-semibold`} style={{ width: `${(r.count / maxRole * 100).toFixed(1)}%` }}>{r.count > 0 ? r.count : ''}</div></div>
                </div>
              ))}
            </div>
          </div>

          {/* Pipeline */}
          <div className="bg-white rounded-xl border border-surface-dim">
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
              <div><h2 className="text-headline-sm">Pipeline</h2><div className="text-[11px] text-on-surface-variant">Customers by engagement state (from orders + reviews).</div></div>
              <span className="pill info">{totalPipeline} customers</span>
            </div>
            <div className="p-5">
              {pipelineSteps.map(s => (
                <div key={s.label} className="funnel-row">
                  <div className="w-24 text-[12px] font-semibold">{s.label}</div>
                  <div className="funnel-bar"><span style={{ width: `${Math.max(10, s.count / totalPipeline * 100)}%` }}>{s.count}</span></div>
                  <div className="w-32 text-right text-[11px] text-on-surface-variant">{s.note}</div>
                </div>
              ))}
            </div>
          </div>

          {/* At-risk accounts */}
          <div className="bg-white rounded-xl border border-surface-dim">
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
              <div><h2 className="text-headline-sm">At-risk accounts</h2><div className="text-[11px] text-on-surface-variant">Customers with open AR and no recent contact.</div></div>
              <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => setReminderOpen(true)}><span className="material-symbols-outlined text-[14px]">notifications_active</span>Send reminder</button>
            </div>
            {atRiskRows.length === 0 ? (
              <div className="py-8 px-6 text-center text-body-sm text-on-surface-variant">No at-risk accounts.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-body-sm">
                  <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                    <tr><th className="px-3 py-2">Party</th><th className="px-3 py-2">Last order</th><th className="px-3 py-2 text-right">Open AR</th><th className="px-3 py-2">Owner</th><th className="w-8"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-surface-dim">
                    {atRiskRows.map(p => (
                      <tr key={p.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => setPeekId(p.id)}>
                        <td className="px-3 py-2"><div className="flex items-center gap-2"><div className="avatar">{initials(p.name)}</div><div className="min-w-0"><div className="font-medium truncate">{p.name}</div><div className="text-[11px] text-on-surface-variant truncate">{p.email}</div></div></div></td>
                        <td className="px-3 py-2 text-[11px]">{deriveLastOrder(p, documents)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-error">{fmt(p.balance)}</td>
                        <td className="px-3 py-2 text-[11px]">{p.owner}</td>
                        <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={e => { e.stopPropagation(); setPeekId(p.id); }}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-surface-dim">
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
              <div><h2 className="text-headline-sm">Recent activity</h2><div className="text-[11px] text-on-surface-variant">Across all parties.</div></div>
              <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Activity refreshed')}><span className="material-symbols-outlined text-[14px]">refresh</span></button>
            </div>
            <div className="p-4">
              {activityItems.map((a, i) => (
                <div key={i} className="activity-row">
                  <div className="activity-dot"><span className="material-symbols-outlined">{iconForActivity(a.activity!.type)}</span></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-medium truncate">{a.party.name}</div>
                    <div className="text-[11px] text-on-surface-variant truncate">{a.activity!.text}</div>
                    <div className="text-[10px] text-outline mt-0.5">{a.activity!.date}</div>
                  </div>
                  <button className="fin-link" onClick={() => setPeekId(a.party.id)}><span className="material-symbols-outlined">open_in_new</span>Open</button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-surface-dim">
            <div className="px-5 py-3 border-b border-surface-dim"><h2 className="text-headline-sm">Quick actions</h2><div className="text-[11px] text-on-surface-variant">Shortcuts used daily.</div></div>
            <div className="p-4 grid grid-cols-2 gap-2">
              {quickActions.map(a => (
                <button key={a.label} className="border border-surface-dim rounded-lg p-3 text-left hover:bg-surface-container-low" onClick={() => a.role ? openCreate(a.role) : a.link === 'remind' ? setReminderOpen(true) : onToast('Navigate to ' + a.link)}>
                  <span className="material-symbols-outlined text-[18px] text-primary">{a.icon}</span>
                  <div className="text-[11px] font-semibold mt-1">{a.label}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Create split menu */}
      {createMenuOpen && (
        <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={() => setCreateMenuOpen(false)}>
          <div className="menu-header">New party</div>
          {['Customer', 'Vendor', 'Supplier', 'Contact'].map(r => (
            <button key={r} onClick={() => openCreate(r)}><span className="material-symbols-outlined">{r === 'Customer' ? 'person_add' : r === 'Vendor' ? 'storefront' : r === 'Supplier' ? 'factory' : 'contacts'}</span>{r}</button>
          ))}
        </div>
      )}

      {/* Peek drawer */}
      {peek && (
        <>
          <div className="drawer-scrim open" onClick={() => setPeekId(null)} />
          <div className="peek open">
            <div className="flex items-center justify-between px-4 h-12 border-b border-surface-dim bg-surface-container-low shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">person</span>
                <span className="text-headline-sm truncate">{peek.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="h-7 px-2.5 rounded bg-primary text-white text-label-sm hover:bg-primary-container flex items-center gap-1" onClick={() => onNavigate ? onNavigate('contacts', 'customers') : onToast('Navigate → Customers')}><span className="material-symbols-outlined text-[14px]">open_in_new</span>Open</button>
                <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setPeekId(null)}><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 text-body-sm">
              <div className="mb-4 flex items-center gap-2">{peek.roles.map(r => rolePill(r))}</div>
              <dl className="text-body-sm mb-4">
                <div className="kv"><dt>Company</dt><dd>{peek.name}</dd></div>
                <div className="kv"><dt>Email</dt><dd>{peek.email}</dd></div>
                <div className="kv"><dt>Phone</dt><dd>{peek.phone}</dd></div>
                <div className="kv"><dt>Owner</dt><dd>{peek.owner}</dd></div>
                <div className="kv"><dt>Last order</dt><dd>{peekLastOrder}</dd></div>
                <div className="kv"><dt>Open balance</dt><dd className={peek.balance > 0 ? 'text-error' : peek.balance < 0 ? 'text-qb-blue' : ''}>{peek.balance !== 0 ? fmt(peek.balance) : '—'}</dd></div>
                <div className="kv"><dt>Added</dt><dd>{peek.added}</dd></div>
              </dl>
              <div className="mt-3">
                <div className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold mb-1">Recent activity</div>
                <div className="text-body-sm">{peekActivity?.text || 'No recent activity'}</div>
                <div className="text-[10px] text-outline">{peekActivity?.date || ''}</div>
              </div>
              <div className="mt-4 pt-3 border-t border-surface-dim grid grid-cols-2 gap-2">
                <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center justify-center gap-1" onClick={() => onNavigate ? onNavigate('contacts', 'customers') : onToast('Navigate → Customers')}><span className="material-symbols-outlined text-[16px]">open_in_new</span>Open</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => onToast('Compose email to ' + peek.email)}><span className="material-symbols-outlined text-[16px]">mail</span>Email</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Reminder modal */}
      {reminderOpen && (
        <div className="modal-scrim open" onClick={() => setReminderOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">Send reminder</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">Send a payment reminder to the selected at-risk accounts.</p>
            <div className="flex justify-end gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setReminderOpen(false)}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={() => { setReminderOpen(false); onToast(`Sent reminders to ${atRiskRows.length} at-risk accounts`); }}>Send</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
