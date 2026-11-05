'use client';

// ============================================================================
// ReturnsOversight — the §D RETURNS ADMIN oversight sections that mount
// below the RMA workbench (ReturnsView) on /admin/returns.
//
// The workbench above owns the RMA queue (erp_return_authorizations via
// /api/admin/commerce/actions). This component owns what the workbench
// never had, all served by GET /api/admin/returns with the source store
// named on every block:
//   D1 — the customer-filed return queue (customer_return_requests) with
//        decisions written through the orders/actions review shape, and
//        the union facet counts (both legs) from the API.
//   D1 — each RMA's recorded refunds (commerce_refunds.rma_id bridge +
//        erp_return_refunds), as recorded.
//   D2 — seller-issued refunds (seller_refunds; non-standard refunds and
//        adjustments ride refund_type as recorded) + rule usage counts.
//        The platform refund queue itself lives at /admin/refunds.
//   D3 — the return-rules desk: the seller return-rule register
//        (seller_return_rules) with an admin editor, plus the platform
//        return windows (return_policy_rules — global window, category
//        windows, legal minimums) with their editor. The API applies
//        the configured window to the overdue derivation; with nothing
//        configured it falls back to the 48h standing SLA convention
//        and says so (returnWindows.fallback).
// Facet membership for the request table mirrors the API's server
// predicates exactly, using the API's effective overdue window.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { DawgNavSection } from '@/lib/types';

type Req = {
  id: string; order_number: string; order_email: string;
  seller_name: string | null; request_type: string; reason_code: string;
  item_name: string | null; item_sku: string | null; quantity: number;
  details: string | null; status: string; admin_notes: string | null;
  handled_by: string | null; created_at: string; updated_at: string;
  source: string;
};
type Rma = {
  id: string; rma_number: string; status: string; order_number: string | null;
  customer_name: string | null; reason_code: string | null; line_count: number;
  tracking_carrier: string | null; tracking_number: string | null;
  tracking_carrier_status: string | null; tracking_recorded_at: string | null;
  refunds: { id: string; source: string; reference: string | null; amount: string; status: string; refund_method: string | null }[];
};
type SellerRefund = {
  id: string; seller_name: string | null; refund_type: string | null;
  amount: string | null; status: string | null; notes: string | null; created_at: string;
};
type Rule = {
  id: string; seller_name: string | null; rule_type: string;
  listing_id: string | null; conditions: any; is_active: boolean | null; created_at: string;
};

const TERMINAL = ['rejected', 'refunded', 'exchanged', 'completed', 'cancelled'];
type Facet = 'all' | 'action_required' | 'awaiting_package' | 'overdue' | 'fraud_flags';

const inFacet = (r: Req, f: Facet, overdueHours = 48): boolean => {
  const st = (r.status || '').toLowerCase();
  switch (f) {
    case 'all': return true;
    case 'action_required': return st === 'requested';
    case 'awaiting_package': return st === 'awaiting_package';
    case 'overdue':
      return (st === 'awaiting_package' || st === 'in_transit') &&
        Date.now() - new Date(r.updated_at).getTime() > overdueHours * 3600 * 1000;
    case 'fraud_flags': return (r.reason_code || '').toLowerCase() === 'fraud';
  }
};

const money = (v: string | null) => (v == null ? '—' : `$${Number(v).toFixed(2)}`);
const age = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? '1 day' : `${d} days`;
};

export const ReturnsOversight: React.FC<{ onNavigateSection?: (s: DawgNavSection) => void }> = ({ onNavigateSection }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [facet, setFacet] = useState<Facet>('all');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');

  const load = () => {
    fetch('/api/admin/returns', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { setData(j); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    // §2.2.7a — rejection requires the reason (the notes field); the API
    // enforces it too and records it on the return.
    if (decision === 'reject' && !(notes[id] || '').trim()) {
      setMsg('Add the reason in the notes field before rejecting — it is recorded on the return.');
      return;
    }
    const res = await fetch('/api/admin/returns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leg: 'request', id, decision, notes: notes[id] || undefined }),
    });
    const j = await res.json().catch(() => ({}));
    setMsg(j.message || j.error || 'Done');
    if (res.ok) load();
  };

  // §2.2.7b — record inbound tracking on the RMA (carrier + number the
  // customer is shipping back with), via POST /api/admin/returns
  // { leg: 'rma', action: 'tracking' }.
  const [trackForm, setTrackForm] = useState<Record<string, { carrier: string; number: string }>>({});
  const [trackBusy, setTrackBusy] = useState<string | null>(null);
  const recordTracking = async (id: string) => {
    const f = trackForm[id] || { carrier: '', number: '' };
    if (!f.carrier.trim() || !f.number.trim()) {
      setMsg('Enter the carrier and the tracking number to record inbound tracking.');
      return;
    }
    setTrackBusy(id);
    try {
      const res = await fetch('/api/admin/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leg: 'rma', action: 'tracking', id, carrier: f.carrier.trim(), tracking_number: f.number.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      setMsg(j.message || j.error || 'Done');
      if (res.ok) load();
    } finally {
      setTrackBusy(null);
    }
  };

  const requests: Req[] = data?.requests || [];
  const overdueHours: number = data?.returnWindows?.overdueHours ?? 48;
  const shown = requests.filter((r) => inFacet(r, facet, overdueHours));
  const facets = data?.facets || {};
  const facetChips: { id: Facet; label: string }[] = [
    { id: 'all', label: 'All returns' },
    { id: 'action_required', label: 'Action required' },
    { id: 'awaiting_package', label: 'Awaiting package' },
    { id: 'overdue', label: 'Overdue' },
    { id: 'fraud_flags', label: 'Fraud flags' },
  ];

  return (
    <div className="mt-10 space-y-10">
      <div>
        <h2 className="text-lg font-semibold">Returns oversight</h2>
        <p className="text-xs text-muted-foreground mt-1">
          The full §D picture across both queues. Facet counts span customer requests and RMAs;
          the table below is the customer-filed queue. Overdue = package-waiting returns with no
          movement inside the effective return window ({overdueHours} hours
          {data?.returnWindows?.fallback
            ? ' — the 48-hour standing SLA convention; no return window is configured in the D3 rules desk below'
            : ' — from the D3 return rules desk below (configured window, never below the legal minimum)'}).
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          {facetChips.map((c) => (
            <button key={c.id} onClick={() => setFacet(c.id)}
              className={`px-3 py-1.5 text-xs font-medium border ${facet === c.id ? 'bg-brand-teal/10 text-brand-teal' : 'bg-background'}`}>
              {c.label} · {loading ? '…' : (facets[c.id] ?? 0)}
            </button>
          ))}
        </div>
        {msg && <p className="text-xs mt-3 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />{msg}</p>}
      </div>

      {/* D1 — customer-filed queue */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide">Customer return requests</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">Source: customer_return_requests · decisions write status + handled_by + admin notes, the orders/actions review shape</p>
        {!!data?.requestsUntenanted && (
          <p className="text-[11px] mt-2 flex items-center gap-1.5 text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5" />
            {data.requestsUntenanted} filed request(s) carry no tenant and appear in no tenant&rsquo;s queue.
          </p>
        )}
        <div className="border mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase text-muted-foreground border-b">
                <th className="p-2.5 font-medium">Order</th>
                <th className="p-2.5 font-medium">Item</th>
                <th className="p-2.5 font-medium">Reason</th>
                <th className="p-2.5 font-medium">Seller</th>
                <th className="p-2.5 font-medium">Status</th>
                <th className="p-2.5 font-medium">Age</th>
                <th className="p-2.5 font-medium">Decision</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!loading && shown.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No customer return requests in this view. Requests customers file appear here with their recorded status.</td></tr>
              )}
              {shown.map((r) => (
                <tr key={r.id} className="border-b align-top">
                  <td className="p-2.5">
                    <div className="font-medium">{r.order_number}</div>
                    <div className="text-muted-foreground">{r.order_email}</div>
                    <div className="text-muted-foreground capitalize">{r.request_type}</div>
                  </td>
                  <td className="p-2.5">
                    <div>{r.item_name || '—'}</div>
                    <div className="text-muted-foreground">{r.item_sku || ''} × {r.quantity}</div>
                    {r.details && <div className="text-muted-foreground mt-0.5">{r.details}</div>}
                  </td>
                  <td className="p-2.5">{r.reason_code}</td>
                  <td className="p-2.5">{r.seller_name || '—'}</td>
                  <td className="p-2.5">
                    <span className="inline-block px-2 py-0.5 text-[10px] font-semibold uppercase bg-muted">{r.status}</span>
                    {r.handled_by && <div className="text-muted-foreground mt-1">handled by {r.handled_by}</div>}
                    {r.admin_notes && <div className="text-muted-foreground mt-0.5">{r.admin_notes}</div>}
                  </td>
                  <td className="p-2.5 whitespace-nowrap">{age(r.created_at)}</td>
                  <td className="p-2.5">
                    {TERMINAL.includes(r.status) ? (
                      <span className="text-muted-foreground">Decided</span>
                    ) : (
                      <div className="flex flex-col gap-1.5 min-w-44">
                        <input value={notes[r.id] || ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                          placeholder="Admin note (optional)" className="border px-2 py-1 text-xs w-full" />
                        <div className="flex gap-1.5">
                          <button onClick={() => decide(r.id, 'approve')} className="px-2 py-1 text-[11px] font-medium bg-green-700 text-white flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Approve</button>
                          <button onClick={() => decide(r.id, 'reject')} className="px-2 py-1 text-[11px] font-medium bg-red-700 text-white flex items-center gap-1"><XCircle className="w-3 h-3" />Reject</button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* D1 — RMA refund linkage */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide">RMA refunds, as recorded</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">Source: erp_return_authorizations + commerce_refunds (rma_id bridge) + erp_return_refunds · the RMA workbench above owns RMA decisions</p>
        <div className="border mt-3 divide-y">
          {(data?.rmas || []).length === 0 && !loading && (
            <p className="p-6 text-center text-xs text-muted-foreground">No RMAs recorded.</p>
          )}
          {(data?.rmas || []).map((r: Rma) => (
            <div key={r.id} className="p-3 text-xs flex flex-wrap gap-x-6 gap-y-1">
              <span className="font-medium">{r.rma_number}</span>
              <span className="uppercase text-[10px] font-semibold bg-muted px-2 py-0.5">{r.status}</span>
              <span>Order {r.order_number || '—'}</span>
              <span>{r.customer_name || '—'}</span>
              <span>{r.line_count} line(s)</span>
              <span className="w-full sm:w-auto">
                {r.refunds.length === 0
                  ? <span className="text-muted-foreground">No refund recorded against this RMA</span>
                  : r.refunds.map((f) => (
                    <span key={f.id} className="mr-3">{f.reference || f.id.slice(0, 8)} · {money(f.amount)} · {f.status} <span className="text-muted-foreground">({f.source})</span></span>
                  ))}
              </span>
              {/* §2.2.7b — inbound tracking recorded on the return itself */}
              <span className="w-full flex flex-wrap items-center gap-2 pt-1">
                {r.tracking_number ? (
                  <span>
                    Inbound: <span className="font-medium">{r.tracking_carrier}</span> · {r.tracking_number}
                    {r.tracking_carrier_status ? <span className="text-muted-foreground"> · {r.tracking_carrier_status}</span> : null}
                    {r.tracking_recorded_at ? <span className="text-muted-foreground"> · recorded {age(r.tracking_recorded_at)}</span> : null}
                  </span>
                ) : (
                  <span className="text-muted-foreground">No inbound tracking recorded</span>
                )}
                {!['rejected', 'restocked', 'refunded', 'exchanged', 'completed', 'cancelled'].includes(r.status) && (
                  <span className="flex items-center gap-1.5">
                    <input
                      value={trackForm[r.id]?.carrier || ''}
                      onChange={(e) => setTrackForm((m) => ({ ...m, [r.id]: { carrier: e.target.value, number: m[r.id]?.number || '' } }))}
                      placeholder="Carrier (UPS, USPS…)"
                      className="h-7 px-2 border bg-background text-[11px] w-32"
                    />
                    <input
                      value={trackForm[r.id]?.number || ''}
                      onChange={(e) => setTrackForm((m) => ({ ...m, [r.id]: { carrier: m[r.id]?.carrier || '', number: e.target.value } }))}
                      placeholder="Tracking #"
                      className="h-7 px-2 border bg-background text-[11px] w-40"
                    />
                    <button
                      onClick={() => void recordTracking(r.id)}
                      disabled={trackBusy === r.id}
                      className="px-2 py-1 text-[11px] font-medium border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50"
                    >
                      {trackBusy === r.id ? 'Saving…' : r.tracking_number ? 'Update tracking' : 'Record tracking'}
                    </button>
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* D2 — seller-issued refunds + rule usage */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide">Seller-issued refunds &amp; rule usage</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Source: seller_refunds + seller_return_rules · non-standard refunds and adjustments ride refund_type as the seller recorded it.
          Platform refunds and their approval queue live on the{' '}
          <button className="underline" onClick={() => onNavigateSection?.('refunds')}>Refunds screen</button>.
        </p>
        <div className="flex flex-wrap gap-2 mt-3 text-xs">
          <span className="border px-3 py-1.5">Keep It rules · {data?.ruleUsage?.keep_it ?? 0}</span>
          <span className="border px-3 py-1.5">Replacement rules · {data?.ruleUsage?.replacement ?? 0}</span>
          <span className="border px-3 py-1.5">Exemption rules · {data?.ruleUsage?.exemption ?? 0}</span>
          <span className="border px-3 py-1.5">Item-level rules · {data?.ruleUsage?.item_level ?? 0}</span>
        </div>
        <div className="border mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase text-muted-foreground border-b">
                <th className="p-2.5 font-medium">Seller</th>
                <th className="p-2.5 font-medium">Type (as recorded)</th>
                <th className="p-2.5 font-medium">Amount</th>
                <th className="p-2.5 font-medium">Status</th>
                <th className="p-2.5 font-medium">Notes</th>
                <th className="p-2.5 font-medium">Filed</th>
              </tr>
            </thead>
            <tbody>
              {!loading && (data?.sellerRefunds || []).length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No seller-issued refunds recorded. Refunds a seller issues in Seller Center appear here with the type they recorded.</td></tr>
              )}
              {(data?.sellerRefunds || []).map((f: SellerRefund) => (
                <tr key={f.id} className="border-b">
                  <td className="p-2.5">{f.seller_name || '—'}</td>
                  <td className="p-2.5">{f.refund_type || '—'}</td>
                  <td className="p-2.5">{money(f.amount)}</td>
                  <td className="p-2.5">{f.status || '—'}</td>
                  <td className="p-2.5">{f.notes || '—'}</td>
                  <td className="p-2.5 whitespace-nowrap">{age(f.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* D3 — rule register (seller_return_rules, admin-editable) */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide">Return rules register — item-level rules</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">Source: seller_return_rules · seller configuration (Seller writes → Admin sees, per the data graph); admin can deactivate/reactivate a rule and add one on a seller&rsquo;s behalf from the desk below</p>
        <div className="border mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase text-muted-foreground border-b">
                <th className="p-2.5 font-medium">Seller</th>
                <th className="p-2.5 font-medium">Rule type</th>
                <th className="p-2.5 font-medium">Scope</th>
                <th className="p-2.5 font-medium">Conditions</th>
                <th className="p-2.5 font-medium">Active</th>
              </tr>
            </thead>
            <tbody>
              {!loading && (data?.rules || []).length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No return rules recorded. Rules sellers configure (Keep It, replacement, exemptions) appear here.</td></tr>
              )}
              {(data?.rules || []).map((g: Rule) => (
                <tr key={g.id} className="border-b">
                  <td className="p-2.5">{g.seller_name || '—'}</td>
                  <td className="p-2.5">{g.rule_type}</td>
                  <td className="p-2.5">{g.listing_id ? 'Item-level' : 'All items'}</td>
                  <td className="p-2.5 text-muted-foreground">{g.conditions ? JSON.stringify(g.conditions) : '—'}</td>
                  <td className="p-2.5">
                    <button
                      onClick={async () => {
                        const res = await fetch('/api/admin/returns/rules', {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ leg: 'seller', id: g.id, is_active: !g.is_active }),
                        });
                        const j = await res.json().catch(() => ({}));
                        setMsg(j.error || `Rule ${g.is_active ? 'deactivated' : 'reactivated'}.`);
                        if (res.ok) load();
                      }}
                      className="underline"
                      title="Toggle this rule active/inactive"
                    >{g.is_active ? 'Active — deactivate' : 'Inactive — reactivate'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* D3 — return windows desk (return_policy_rules) */}
      <ReturnRulesDesk onChanged={load} />
    </div>
  );
};

// ============================================================================
// ReturnRulesDesk — the D3 editor over /api/admin/returns/rules:
// platform windows (global + per-category) and legal minimums in
// return_policy_rules, plus creating item-level seller rules on a
// seller's behalf. The oversight route applies the configured windows
// to its overdue derivation — what is set here is what runs.
// ============================================================================

type PolicyRule = {
  id: string; scope: string; category_id: string | null; category_label: string | null;
  window_days: number; is_legal_minimum: boolean; notes: string | null; is_active: boolean;
};

type ExemptionRequest = {
  id: string; seller_id: string; seller_name: string | null; status: string;
  appeal_text: string; decision: string | null; decided_at: string | null; created_at: string;
};
type SellerRuleRow = {
  id: string; seller_id: string; seller_name: string | null; rule_type: string;
  listing_id: string | null; is_active: boolean; created_at: string;
};

const ReturnRulesDesk: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const [policyRules, setPolicyRules] = useState<PolicyRule[]>([]);
  const [exemptionRequests, setExemptionRequests] = useState<ExemptionRequest[]>([]);
  const [sellerRules, setSellerRules] = useState<SellerRuleRow[]>([]);
  const [ruleUsage, setRuleUsage] = useState<Record<string, number>>({});
  const [usageBasis, setUsageBasis] = useState('');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ scope: 'global', category_id: '', window_days: '30', is_legal_minimum: false, notes: '' });
  const [sellerForm, setSellerForm] = useState({ seller_id: '', rule_type: 'keep_it', name: '', listing_id: '', conditions: '' });
  const [editDays, setEditDays] = useState<Record<string, string>>({});

  const load = () => {
    fetch('/api/admin/returns/rules', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((j: any) => {
        setPolicyRules(j.policyRules || []);
        setExemptionRequests(j.exemptionRequests || []);
        setSellerRules(j.sellerRules || []);
        const usage: Record<string, number> = {};
        for (const u of (j.ruleUsage || []) as Array<{ rule_id: string; resolved_requests: number }>) {
          usage[u.rule_id] = Number(u.resolved_requests || 0);
        }
        setRuleUsage(usage);
        setUsageBasis(j.rule_usage_basis || '');
        setCategories(j.categories || []);
        setSellers(j.sellers || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const call = async (method: string, payload: Record<string, unknown>, okMsg: string) => {
    const res = await fetch('/api/admin/returns/rules', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    setMsg(j.error || okMsg);
    if (res.ok) { load(); onChanged?.(); }
  };

  const createPolicy = () => {
    const days = Number(form.window_days);
    if (!Number.isInteger(days) || days <= 0) { setMsg('Window days must be a positive whole number.'); return; }
    if (form.scope === 'category' && !form.category_id) { setMsg('Pick a category for a category window.'); return; }
    void call('POST', {
      leg: 'policy', scope: form.scope,
      category_id: form.scope === 'category' ? form.category_id : undefined,
      window_days: days, is_legal_minimum: form.is_legal_minimum,
      notes: form.notes || undefined,
    }, 'Return window saved.');
  };

  const createSellerRule = () => {
    if (!sellerForm.seller_id) { setMsg('Pick a seller for the item-level rule.'); return; }
    let conditions: Record<string, unknown> = {};
    if (sellerForm.conditions.trim()) {
      try { conditions = JSON.parse(sellerForm.conditions); } catch { setMsg('Conditions must be valid JSON.'); return; }
      if (typeof conditions !== 'object' || conditions === null || Array.isArray(conditions)) { setMsg('Conditions must be a JSON object.'); return; }
    }
    void call('POST', {
      leg: 'seller', seller_id: sellerForm.seller_id, rule_type: sellerForm.rule_type,
      name: sellerForm.name || undefined,
      listing_id: sellerForm.listing_id || undefined,
      conditions,
    }, 'Seller rule created.');
  };

  return (
    <section>
      <h3 className="text-sm font-semibold uppercase tracking-wide">Return windows &amp; legal minimums</h3>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        Source: return_policy_rules · the platform window (global), per-category windows, and the legal
        minimum floor. Oversight applies max(configured window, legal minimum) to overdue returns;
        with nothing configured it falls back to the 48-hour standing convention and says so.
      </p>
      {msg && <p className="text-xs mt-2 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />{msg}</p>}

      <div className="border mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase text-muted-foreground border-b">
              <th className="p-2.5 font-medium">Scope</th>
              <th className="p-2.5 font-medium">Category</th>
              <th className="p-2.5 font-medium">Window (days)</th>
              <th className="p-2.5 font-medium">Legal minimum</th>
              <th className="p-2.5 font-medium">Notes</th>
              <th className="p-2.5 font-medium">Active</th>
              <th className="p-2.5 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!loading && policyRules.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No return windows configured. Add the global window and the legal minimum below — until then, oversight uses the 48-hour standing convention.</td></tr>
            )}
            {policyRules.map((r) => (
              <tr key={r.id} className="border-b align-top">
                <td className="p-2.5 capitalize">{r.scope}</td>
                <td className="p-2.5">{r.scope === 'category' ? (r.category_label || r.category_id || '—') : 'All categories'}</td>
                <td className="p-2.5">
                  <input value={editDays[r.id] ?? String(r.window_days)} onChange={(e) => setEditDays({ ...editDays, [r.id]: e.target.value })}
                    className="border px-2 py-1 text-xs w-20" inputMode="numeric" />
                </td>
                <td className="p-2.5">{r.is_legal_minimum ? <span className="font-semibold">Legal minimum</span> : '—'}</td>
                <td className="p-2.5 text-muted-foreground">{r.notes || '—'}</td>
                <td className="p-2.5">{r.is_active ? 'Yes' : 'No'}</td>
                <td className="p-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => void call('PATCH', { leg: 'policy', id: r.id, window_days: Number(editDays[r.id] ?? r.window_days) }, 'Window updated.')} className="px-2 py-1 text-[11px] font-medium border">Save</button>
                    <button onClick={() => void call('PATCH', { leg: 'policy', id: r.id, is_active: !r.is_active }, r.is_active ? 'Rule deactivated.' : 'Rule reactivated.')} className="px-2 py-1 text-[11px] font-medium border">{r.is_active ? 'Deactivate' : 'Reactivate'}</button>
                    <button onClick={() => { if (confirm('Delete this return window rule?')) void call('DELETE', { leg: 'policy', id: r.id }, 'Rule deleted.'); }} className="px-2 py-1 text-[11px] font-medium text-red-700 underline">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <div className="border p-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide">Add a window / legal minimum</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <label className="flex flex-col gap-1">
              <span className="font-medium">Scope</span>
              <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} className="border px-2 py-1.5 bg-background">
                <option value="global">Global (all categories)</option>
                <option value="category">Category</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Window (days)</span>
              <input value={form.window_days} onChange={(e) => setForm({ ...form, window_days: e.target.value })} className="border px-2 py-1.5" inputMode="numeric" />
            </label>
            {form.scope === 'category' && (
              <label className="col-span-2 flex flex-col gap-1">
                <span className="font-medium">Category</span>
                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="border px-2 py-1.5 bg-background">
                  <option value="">Select a category…</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            <label className="col-span-2 flex items-center gap-2">
              <input type="checkbox" checked={form.is_legal_minimum} onChange={(e) => setForm({ ...form, is_legal_minimum: e.target.checked })} />
              <span>This is a legal minimum (the floor oversight never goes below)</span>
            </label>
            <label className="col-span-2 flex flex-col gap-1">
              <span className="font-medium">Notes (optional)</span>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="border px-2 py-1.5" placeholder="e.g. State consumer-law floor" />
            </label>
          </div>
          <button onClick={createPolicy} className="rounded border border-border bg-card px-3 py-1.5 text-xs font-semibold text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5">Save window</button>
        </div>

        <div className="border p-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide">Add an item-level seller rule</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <label className="flex flex-col gap-1">
              <span className="font-medium">Seller</span>
              <select value={sellerForm.seller_id} onChange={(e) => setSellerForm({ ...sellerForm, seller_id: e.target.value })} className="border px-2 py-1.5 bg-background">
                <option value="">Select a seller…</option>
                {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Rule type</span>
              <select value={sellerForm.rule_type} onChange={(e) => setSellerForm({ ...sellerForm, rule_type: e.target.value })} className="border px-2 py-1.5 bg-background">
                <option value="keep_it">Keep It</option>
                <option value="replacement">Replacement</option>
                <option value="exemption">Exemption</option>
                <option value="general">General</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Rule name (optional)</span>
              <input value={sellerForm.name} onChange={(e) => setSellerForm({ ...sellerForm, name: e.target.value })} className="border px-2 py-1.5" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">Listing ID (optional — item-level)</span>
              <input value={sellerForm.listing_id} onChange={(e) => setSellerForm({ ...sellerForm, listing_id: e.target.value })} className="border px-2 py-1.5" placeholder="seller_listings id" />
            </label>
            <label className="col-span-2 flex flex-col gap-1">
              <span className="font-medium">Conditions (JSON, optional)</span>
              <textarea value={sellerForm.conditions} onChange={(e) => setSellerForm({ ...sellerForm, conditions: e.target.value })} rows={2} className="border px-2 py-1.5 w-full" placeholder='{"max_value_usd": 25}' />
            </label>
          </div>
          <button onClick={createSellerRule} className="rounded border border-border bg-card px-3 py-1.5 text-xs font-semibold text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5">Create seller rule</button>
        </div>
      </div>

      <h3 className="text-sm font-semibold uppercase tracking-wide mt-6">Exemption requests — decisions</h3>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        Sellers file return-policy exemption requests from their Return rules page (seller_appeals,
        type return_policy_exemption). The decision is stamped on the request, audited, and notified
        to the seller. A decided request is final at this desk.
      </p>
      <div className="border mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase text-muted-foreground border-b">
              <th className="p-2.5 font-medium">Seller</th>
              <th className="p-2.5 font-medium">Request</th>
              <th className="p-2.5 font-medium">Filed</th>
              <th className="p-2.5 font-medium">Status</th>
              <th className="p-2.5 font-medium">Decision</th>
            </tr>
          </thead>
          <tbody>
            {!loading && exemptionRequests.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No exemption requests filed.</td></tr>
            )}
            {exemptionRequests.map((x) => (
              <tr key={x.id} className="border-b align-top">
                <td className="p-2.5">{x.seller_name || x.seller_id}</td>
                <td className="p-2.5 text-muted-foreground whitespace-pre-wrap max-w-md">{x.appeal_text}</td>
                <td className="p-2.5">{new Date(x.created_at).toLocaleDateString()}</td>
                <td className="p-2.5 capitalize">{x.status}</td>
                <td className="p-2.5">
                  {x.status === 'pending' ? (
                    <div className="flex gap-1.5">
                      <button onClick={() => void call('POST', { leg: 'exemption', id: x.id, decision: 'approved' }, 'Exemption approved — the seller has been notified.')} className="px-2 py-1 text-[11px] font-medium border">Approve</button>
                      <button onClick={() => void call('POST', { leg: 'exemption', id: x.id, decision: 'denied' }, 'Exemption denied — the seller has been notified.')} className="px-2 py-1 text-[11px] font-medium border text-red-700">Deny</button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">
                      {x.decision || x.status}
                      {x.decided_at ? ` · ${new Date(x.decided_at).toLocaleDateString()}` : ''}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="text-sm font-semibold uppercase tracking-wide mt-6">Seller rules &amp; usage</h3>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        Source: seller_return_rules. Usage (Keep It / Replacement): {usageBasis || 'reported by the desk read.'}
      </p>
      <div className="border mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase text-muted-foreground border-b">
              <th className="p-2.5 font-medium">Seller</th>
              <th className="p-2.5 font-medium">Rule type</th>
              <th className="p-2.5 font-medium">Scope</th>
              <th className="p-2.5 font-medium">Active</th>
              <th className="p-2.5 font-medium">Resolved returns since rule recorded</th>
            </tr>
          </thead>
          <tbody>
            {!loading && sellerRules.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No seller rules recorded.</td></tr>
            )}
            {sellerRules.map((r) => (
              <tr key={r.id} className="border-b align-top">
                <td className="p-2.5">{r.seller_name || r.seller_id}</td>
                <td className="p-2.5 capitalize">{r.rule_type.replace(/_/g, ' ')}</td>
                <td className="p-2.5">{r.listing_id ? 'Item-level' : 'Store-wide'}</td>
                <td className="p-2.5">{r.is_active ? 'Yes' : 'No'}</td>
                <td className="p-2.5">
                  {r.rule_type === 'keep_it' || r.rule_type === 'replacement'
                    ? (ruleUsage[r.id] ?? 0)
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
