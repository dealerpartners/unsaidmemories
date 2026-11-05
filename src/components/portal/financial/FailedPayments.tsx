'use client';

import React, { useState } from 'react';
import { AlertTriangle, Copy, Mail, ChevronDown, ChevronUp, Check, Loader2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

type FailedPayment = {
  id: string;
  source: 'internal' | 'stripe';
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_id: string | null;
  amount: number;
  currency: string;
  method: string;
  failure_reason: string;
  failure_code: string;
  failure_message?: string | null;
  stripe_payment_intent_id: string | null;
  date: string | null;
  time: string | null;
  created_at: string;
  diagnostics: {
    payment_attempt: boolean;
    stripe_response: string | boolean;
    webhook_received: boolean | null;
    order_created: boolean | string | null;
  };
  raw?: any;
};

function TimelineStep({ done, label, detail }: { done: boolean | null | string; label: string; detail?: string }) {
  const state = done === true || done === "recorded" ? "ok" : done === false ? "broken" : "unknown";
  return (
    <div className="flex items-start gap-3">
      <div className={cn(
        "mt-0.5 size-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
        state === "ok" && "bg-success/15 text-success",
        state === "broken" && "bg-destructive/15 text-destructive",
        state === "unknown" && "bg-muted text-muted-foreground",
      )}>
        {state === "ok" ? "✓" : state === "broken" ? "✕" : "?"}
      </div>
      <div>
        <div className="text-[13px] font-medium text-foreground">{label}</div>
        {detail && <div className="text-[11px] text-muted-foreground font-mono">{detail}</div>}
      </div>
    </div>
  );
}

export const FailedPaymentsList: React.FC = () => {
  const [list, setList] = useState<FailedPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiErrors, setApiErrors] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [emailedId, setEmailedId] = useState<string | null>(null);
  const [confirmEmailId, setConfirmEmailId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch('/api/admin/payments?status=failed&limit=200', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.error) { setError(d.error); return; }
        setList(d.failed_payments || []);
        setApiErrors(d.errors || []);
      })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Failed to load'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const getPaymentLink = async (p: FailedPayment): Promise<string> => {
    const r = await fetch(`/api/admin/payments/${encodeURIComponent(p.id)}/resend`, { method: 'POST' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Failed to create payment link');
    return d.payment_link;
  };

  const handleCopyLink = async (p: FailedPayment) => {
    setBusyId(p.id); setActionError(null);
    try {
      const link = await getPaymentLink(p);
      await navigator.clipboard.writeText(link);
      setCopiedId(p.id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch (e: any) {
      setActionError(e?.message || 'Failed to create link');
    } finally {
      setBusyId(null);
    }
  };

  const handleSendEmail = async (p: FailedPayment) => {
    if (!p.customer_email) {
      setActionError('No customer email on file — cannot send.');
      return;
    }
    setBusyId(p.id); setActionError(null);
    try {
      const link = await getPaymentLink(p);
      const r = await fetch(`/api/admin/payments/${encodeURIComponent(p.id)}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_link: link,
          amount: p.amount,
          customer_name: p.customer_name,
          customer_email: p.customer_email,
          failure_reason: p.failure_reason,
          customer_id: p.customer_id,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to send email');
      setEmailedId(p.id);
      setConfirmEmailId(null);
      setTimeout(() => setEmailedId(null), 3000);
      if (d.warning) setActionError(d.warning);
    } catch (e: any) {
      setActionError(e?.message || 'Failed to send email');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground text-sm">Loading failed payments…</div>;
  }
  if (error) {
    return <div className="bg-card border border-destructive/30 rounded-xl p-8 text-center text-destructive text-sm">Failed to load: {error}</div>;
  }

  return (
    <div className="space-y-4">
      {apiErrors.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 text-[12px] text-warning">
          {apiErrors.map((e, i) => <div key={i}>⚠ {e}</div>)}
        </div>
      )}
      {actionError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-[12px] text-destructive flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="underline">dismiss</button>
        </div>
      )}
      {list.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <div className="text-[15px] font-semibold text-foreground">No failed payments</div>
          <div className="text-[13px] text-muted-foreground mt-1">All clear — every payment went through.</div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px] text-foreground">
            <thead>
              <tr className="bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
                <th className="p-3 border-r border-border">Date</th>
                <th className="p-3 border-r border-border">Customer</th>
                <th className="p-3 border-r border-border text-right">Amount</th>
                <th className="p-3 border-r border-border">Method</th>
                <th className="p-3 border-r border-border">Failure Reason</th>
                <th className="p-3 border-r border-border">Source</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-medium">
              {list.map((p) => {
                const expanded = expandedId === p.id;
                const busy = busyId === p.id;
                return (
                  <React.Fragment key={p.id}>
                    <tr className="hover:bg-accent/50 transition-colors">
                      <td className="p-3 border-r border-border whitespace-nowrap">
                        <div className="text-foreground">{p.date || '—'}</div>
                        <div className="text-[10px] text-muted-foreground">{p.time || ''}</div>
                      </td>
                      <td className="p-3 border-r border-border">
                        <div className="font-medium text-foreground">{p.customer_name}</div>
                        {p.customer_email && <div className="text-[11px] text-muted-foreground">{p.customer_email}</div>}
                        {p.customer_phone && <div className="text-[11px] text-muted-foreground">{p.customer_phone}</div>}
                      </td>
                      <td className="p-3 border-r border-border text-right font-semibold tabular-nums">${p.amount.toFixed(2)}</td>
                      <td className="p-3 border-r border-border text-muted-foreground text-[12px]">{p.method}</td>
                      <td className="p-3 border-r border-border">
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-destructive">
                          <AlertTriangle className="size-3.5" />
                          {p.failure_reason}
                        </span>
                      </td>
                      <td className="p-3 border-r border-border">
                        <span className={cn(
                          "inline-flex items-center text-[10px] font-semibold border px-2 py-0.5 rounded-full uppercase",
                          p.source === 'stripe' ? "bg-primary/10 border-primary/20 text-primary" : "bg-muted border-border text-muted-foreground"
                        )}>
                          {p.source}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleCopyLink(p)}
                            disabled={busy}
                            title="Copy retry payment link"
                            className="inline-flex items-center gap-1 rounded-lg border border-input px-2 py-1.5 text-[11px] font-medium hover:bg-accent transition-colors disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="size-3 animate-spin" /> : copiedId === p.id ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
                            {copiedId === p.id ? 'Copied' : 'Link'}
                          </button>
                          {confirmEmailId === p.id ? (
                            <span className="inline-flex items-center gap-1">
                              <button
                                onClick={() => handleSendEmail(p)}
                                disabled={busy}
                                className="inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground px-2 py-1.5 text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50"
                              >
                                {busy ? <Loader2 className="size-3 animate-spin" /> : <Mail className="size-3" />}
                                Confirm send
                              </button>
                              <button
                                onClick={() => setConfirmEmailId(null)}
                                className="text-[11px] text-muted-foreground underline"
                              >
                                cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => p.customer_email ? setConfirmEmailId(p.id) : setActionError('No customer email on file — cannot send.')}
                              disabled={busy}
                              title="Send failure email to customer"
                              className="inline-flex items-center gap-1 rounded-lg border border-input px-2 py-1.5 text-[11px] font-medium hover:bg-accent transition-colors disabled:opacity-50"
                            >
                              {emailedId === p.id ? <Check className="size-3 text-success" /> : <Mail className="size-3" />}
                              {emailedId === p.id ? 'Sent' : 'Email'}
                            </button>
                          )}
                          <button
                            onClick={() => setExpandedId(expanded ? null : p.id)}
                            title="View diagnostics"
                            className="inline-flex items-center rounded-lg border border-input px-2 py-1.5 text-[11px] font-medium hover:bg-accent transition-colors"
                          >
                            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-muted/30">
                        <td colSpan={7} className="p-4">
                          <div className="grid md:grid-cols-2 gap-6">
                            <div>
                              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Payment Flow Diagnostics</div>
                              <div className="space-y-3">
                                <TimelineStep done={p.diagnostics.payment_attempt} label="Payment attempt recorded" detail={p.id} />
                                <TimelineStep
                                  done={p.diagnostics.stripe_response === "missing" ? false : true}
                                  label="Stripe response"
                                  detail={typeof p.diagnostics.stripe_response === 'string' ? p.diagnostics.stripe_response : p.stripe_payment_intent_id || 'no response recorded'}
                                />
                                <TimelineStep
                                  done={p.diagnostics.webhook_received}
                                  label="Webhook received"
                                  detail={p.diagnostics.webhook_received === true ? "event found in ledger" : p.diagnostics.webhook_received === false ? "no matching webhook — check Stripe dashboard" : "unknown"}
                                />
                                <TimelineStep
                                  done={p.diagnostics.order_created === true || p.diagnostics.order_created === "check orders" ? null : p.diagnostics.order_created}
                                  label="Order created"
                                  detail={typeof p.diagnostics.order_created === 'string' ? p.diagnostics.order_created : p.diagnostics.order_created ? "yes" : "no — payment failed before order"}
                                />
                              </div>
                            </div>
                            <div>
                              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Raw Details</div>
                              <dl className="text-[12px] space-y-1.5 font-mono">
                                <div className="flex gap-2"><dt className="text-muted-foreground w-32 shrink-0">failure_code</dt><dd>{p.failure_code}</dd></div>
                                {p.failure_message && <div className="flex gap-2"><dt className="text-muted-foreground w-32 shrink-0">message</dt><dd>{p.failure_message}</dd></div>}
                                {p.stripe_payment_intent_id && (
                                  <div className="flex gap-2"><dt className="text-muted-foreground w-32 shrink-0">intent</dt><dd className="break-all">{p.stripe_payment_intent_id}</dd></div>
                                )}
                                {p.raw?.decline_code && <div className="flex gap-2"><dt className="text-muted-foreground w-32 shrink-0">decline_code</dt><dd>{p.raw.decline_code}</dd></div>}
                                <div className="flex gap-2"><dt className="text-muted-foreground w-32 shrink-0">currency</dt><dd>{p.currency}</dd></div>
                              </dl>
                              {p.source === 'stripe' && p.stripe_payment_intent_id && (
                                <a
                                  href={`https://dashboard.stripe.com/payments/${p.stripe_payment_intent_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 mt-3 text-[12px] text-primary hover:underline"
                                >
                                  Open in Stripe Dashboard <ExternalLink className="size-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
