'use client';

// §9 Action approvals queue — support_actions rows awaiting a
// decision for this tenant, oldest first, plus the most recently
// decided. Decisions run through the per-ticket decide route; the
// record, the threshold gate, and the executors live in
// src/lib/support/approvals.ts. Nothing here executes directly —
// approving a row is what executes it.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, RefreshCw, Scale } from 'lucide-react';

type QueueAction = {
  id: string; ticketId: string; ticketRef: string; ticketSubject: string;
  actionType: string; targetRef: string | null; amount: number | null;
  status: string; requestedByName: string | null; approvedByName: string | null;
  executedAt: string | null; createdAt: string; updatedAt: string;
};

type Authority = { staffId: string | null; role: string | null; supportLevel: string; canApprove: boolean };

const BADGE: Record<string, { label: string; cls: string }> = {
  requested: { label: 'Awaiting approval', cls: 'adm-badge adm-badge-amber' },
  executed: { label: 'Executed', cls: 'adm-badge adm-badge-green' },
  failed: { label: 'Failed', cls: 'adm-badge adm-badge-red' },
  rejected: { label: 'Rejected', cls: 'bg-neutral-200 text-neutral-700' },
};

const TYPE_LABEL: Record<string, string> = {
  refund: 'Refund', credit: 'Store credit',
  listing_takedown: 'Listing takedown', account_change: 'Account change',
};

export default function SupportApprovalsPage() {
  const [pending, setPending] = useState<QueueAction[]>([]);
  const [decided, setDecided] = useState<QueueAction[]>([]);
  const [authority, setAuthority] = useState<Authority | null>(null);
  const [thresholdCents, setThresholdCents] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 5000); };

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/support/actions');
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to load the approvals queue');
      setPending(j.pending ?? []);
      setDecided(j.decided ?? []);
      setAuthority(j.authority ?? null);
      setThresholdCents(typeof j.thresholdCents === 'number' ? j.thresholdCents : null);
    } catch (e: any) { flash(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (a: QueueAction, decision: 'approve' | 'reject') => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/support/tickets/${a.ticketId}/actions/${a.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          reason: decision === 'reject' ? rejectReason.trim() || null : null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Decision failed');
      flash(decision === 'approve'
        ? (j.action?.status === 'executed' ? `${a.ticketRef}: approved — the action executed.` : `${a.ticketRef}: approved — execution result is on the record.`)
        : `${a.ticketRef}: action rejected — it will not execute.`);
      setRejectingId(null); setRejectReason('');
      await load();
    } catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };

  const row = (a: QueueAction, withDecide: boolean) => {
    const badge = BADGE[a.status] ?? { label: a.status, cls: 'bg-neutral-100 text-neutral-600' };
    return (
      <div key={a.id} className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="font-medium text-neutral-800">{TYPE_LABEL[a.actionType] ?? a.actionType}</span>
          {a.amount != null && <span className="text-neutral-600">${a.amount.toFixed(2)}</span>}
          {a.targetRef && <span className="break-all text-[12px] text-neutral-400">{a.targetRef}</span>}
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>{badge.label}</span>
        </div>
        <p className="mt-1 text-[12px] text-neutral-500">
          <Link href="/admin/messages" className="font-medium text-neutral-700 hover:underline">{a.ticketRef}</Link>
          {' — '}{a.ticketSubject}
        </p>
        <p className="mt-0.5 text-[11px] text-neutral-400">
          Requested by {a.requestedByName ?? '—'} · {new Date(a.createdAt).toLocaleString()}
          {a.approvedByName ? ` · Approved by ${a.approvedByName}` : ''}
          {a.executedAt ? ` · Executed ${new Date(a.executedAt).toLocaleString()}` : ''}
        </p>
        {withDecide && authority?.canApprove && (
          rejectingId === a.id ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejecting"
                className="min-w-48 flex-1 rounded-lg border border-neutral-200 px-2 py-1 text-[12px]"
              />
              <button
                onClick={() => decide(a, 'reject')}
                disabled={busy}
                className="rounded-lg bg-red-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Confirm reject
              </button>
              <button
                onClick={() => { setRejectingId(null); setRejectReason(''); }}
                className="rounded-lg bg-neutral-100 px-2.5 py-1 text-[12px] text-neutral-600 hover:bg-neutral-200"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={() => decide(a, 'approve')}
                disabled={busy}
                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Approve &amp; execute
              </button>
              <button
                onClick={() => setRejectingId(a.id)}
                disabled={busy}
                className="rounded-lg bg-neutral-100 px-2.5 py-1 text-[12px] text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          )
        )}
        {withDecide && !authority?.canApprove && (
          <p className="mt-1 text-[11px] text-neutral-400">
            You can see this queue, but decisions need approver authority (support at full level, or the owner role).
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/messages" className="inline-flex items-center gap-1 text-[13px] text-neutral-500 hover:text-neutral-800">
        <ChevronLeft className="h-4 w-4" /> Support desk
      </Link>
      <div className="mt-2 flex items-center gap-2">
        <Scale className="h-5 w-5 text-neutral-500" />
        <h1 className="text-xl font-semibold text-neutral-900">Action approvals</h1>
        <button
          onClick={load}
          className="ml-auto inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-2.5 py-1.5 text-[12px] text-neutral-600 hover:bg-neutral-200"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>
      {notice && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{notice}</div>
      )}

      <h2 className="mt-6 mb-2 text-[13px] font-semibold uppercase tracking-wide text-neutral-500">
        Awaiting a decision{pending.length > 0 ? ` (${pending.length})` : ''}
      </h2>
      <div className="space-y-2">
        {pending.length === 0 && (
          <p className="rounded-lg border border-dashed border-neutral-200 px-3 py-4 text-[13px] text-neutral-400">
            Nothing is waiting. Actions that need approval land here the moment they are requested from a ticket.
          </p>
        )}
        {pending.map((a) => row(a, true))}
      </div>

      <h2 className="mt-8 mb-2 text-[13px] font-semibold uppercase tracking-wide text-neutral-500">Recently decided</h2>
      <div className="space-y-2">
        {decided.length === 0 && (
          <p className="rounded-lg border border-dashed border-neutral-200 px-3 py-4 text-[13px] text-neutral-400">
            No actions have been decided yet.
          </p>
        )}
        {decided.map((a) => row(a, false))}
      </div>
    </div>
  );
}
