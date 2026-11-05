'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';

// ============================================================================
// A3 · Reinstatements — the dedicated desk over seller_appeals rows of
// type 'reinstatement' (the CHECK-enforced F2 vocabulary). Approving a
// request flips the seller back to 'approved' and writes seller_audit_log
// (both records, in /api/admin/sellers/reinstatements); denying requires
// a reason and leaves the seller's status untouched. Sellers with prior
// approved history and no pending request are listed so an admin can
// record a request on their behalf.
// ============================================================================

type Any = Record<string, any>;

export default function ReinstatementsPage() {
  const [data, setData] = useState<Any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/sellers/reinstatements');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load reinstatements');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const post = async (body: Any, okMsg: string) => {
    setBusy(String(body.appeal_id || body.seller_id || 'x'));
    setNotice(null);
    try {
      const res = await fetch('/api/admin/sellers/reinstatements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Action failed');
      setNotice(okMsg);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <RotateCcw className="size-6" /> Reinstatements
        </h1>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
          <Link href="/admin/sellers" className="text-[13px] font-medium underline underline-offset-2">Seller Management</Link>
          <Link href="/admin/sellers/review-queue" className="text-[13px] font-medium underline underline-offset-2">Seller Review Queue</Link>
          <Link href="/admin/trust-safety/appeals" className="text-[13px] font-medium underline underline-offset-2">All appeals (Trust &amp; Safety)</Link>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{notice}</div>}

      {loading ? (
        <p className="text-[13px] text-muted-foreground">Loading reinstatement requests…</p>
      ) : !data ? null : (
        <>
          <div className="flex flex-wrap gap-4 text-[13px] text-muted-foreground">
            <span><strong className="text-foreground">{data.counts.pending}</strong> pending</span>
            <span><strong className="text-foreground">{data.counts.decided}</strong> decided</span>
            <span><strong className="text-foreground">{data.counts.eligibleWithoutRequest}</strong> eligible sellers without a request</span>
          </div>
          {data.note && <p className="text-[13px] text-muted-foreground">{data.note}</p>}

          <section className="bg-card border border-border rounded-xl">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-[14px] font-semibold">Requests</h2>
            </div>
            {data.requests.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-muted-foreground">No reinstatement requests recorded.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.requests.map((r: Any) => {
                  const pending = r.status === 'pending' || r.status === 'under_review';
                  return (
                    <li key={r.id} className="px-5 py-4 space-y-2">
                      <div className="flex flex-wrap justify-between gap-2">
                        <div>
                          <div className="text-[14px] font-medium">{r.seller_name || r.seller_legal_name || r.seller_id || 'No seller linked'}</div>
                          <div className="text-[12px] text-muted-foreground">
                            seller status: {r.seller_status || '—'} · filed {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                            {r.decided_at && <> · decided {new Date(r.decided_at).toLocaleDateString()}</>}
                          </div>
                        </div>
                        <span className="text-[11px] font-semibold capitalize">{r.status}</span>
                      </div>
                      {r.appeal_text && <p className="text-[12px] text-muted-foreground whitespace-pre-line bg-muted/50 rounded-lg px-3 py-2">{r.appeal_text}</p>}
                      {pending && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button disabled={busy === r.id}
                            onClick={() => post({ action: 'decide', appeal_id: r.id, decision: 'approve' }, 'Reinstatement approved — the seller is approved again.')}
                            className="px-3.5 py-2 bg-emerald-600 text-white rounded-lg text-[13px] font-semibold disabled:opacity-50 cursor-pointer">Approve &amp; reinstate</button>
                          <input value={reasons[r.id] || ''} onChange={(e) => setReasons((s) => ({ ...s, [r.id]: e.target.value }))}
                            placeholder="Reason (required to deny)"
                            className="flex-1 min-w-[200px] border border-border rounded-lg px-3 py-2 text-[13px] bg-card" />
                          <button disabled={busy === r.id}
                            onClick={() => post({ action: 'decide', appeal_id: r.id, decision: 'deny', reason: (reasons[r.id] || '').trim() }, 'Reinstatement denied — the seller status is unchanged.')}
                            className="px-3.5 py-2 border border-red-300 text-red-700 rounded-lg text-[13px] font-semibold disabled:opacity-50 cursor-pointer">Deny</button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="bg-card border border-border rounded-xl">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-[14px] font-semibold">Eligible sellers — no pending request</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Suspended/closed sellers with prior approved history (the A1 reactivations population). Record a
                request here when the seller has asked outside the portal; it is labeled admin-recorded in the audit log.
              </p>
            </div>
            {data.eligible.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-muted-foreground">No eligible sellers are waiting.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.eligible.map((s: Any) => (
                  <li key={s.id} className="px-5 py-4 space-y-2">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <div className="text-[14px] font-medium">{s.display_name || s.legal_name}</div>
                        <div className="text-[12px] text-muted-foreground">
                          {s.email || '—'} · status {s.status} · first approved {s.approved_at ? new Date(s.approved_at).toLocaleDateString() : '—'}
                        </div>
                      </div>
                      <Link href={`/admin/sellers/${s.id}`} className="text-[12px] font-medium underline underline-offset-2">Seller record</Link>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input value={texts[s.id] || ''} onChange={(e) => setTexts((t) => ({ ...t, [s.id]: e.target.value }))}
                        placeholder="Request note (optional)"
                        className="flex-1 min-w-[220px] border border-border rounded-lg px-3 py-2 text-[13px] bg-card" />
                      <button disabled={busy === s.id}
                        onClick={() => post({ action: 'record_request', seller_id: s.id, appeal_text: (texts[s.id] || '').trim() || undefined }, 'Reinstatement request recorded — it is now in the queue above.')}
                        className="px-3.5 py-2 border border-border rounded-lg text-[13px] font-semibold disabled:opacity-50 cursor-pointer">Record request</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
