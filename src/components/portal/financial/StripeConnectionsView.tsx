'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { DawgNavSection } from '@/lib/types';

interface StripeConnectionsViewProps {
  onNavigateSection?: (section: DawgNavSection) => void;
}

type ConnectionStatus = {
  connected: boolean;
  synced?: boolean;
  stripe_account_id?: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  onboarding_complete?: boolean;
  updated_at?: string;
};

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`text-[9px] font-semibold px-1.5 py-0.5 border uppercase ${
        ok
          ? 'bg-success/10 border-success/30 text-success'
          : 'bg-muted/40 border-border text-muted-foreground'
      }`}
    >
      {label}: {ok ? 'Enabled' : 'Not yet'}
    </span>
  );
}

export const StripeConnectionsView: React.FC<StripeConnectionsViewProps> = () => {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<'connect' | 'dashboard' | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/stripe-connections/status', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Status check failed (${res.status})`);
      setStatus(body as ConnectionStatus);
    } catch (e: any) {
      setError(e?.message || 'Could not load Stripe connection status');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Returning from Stripe onboarding (?return=1) or from an expired link
    // (?refresh=1): the status fetch below is always a fresh live read.
    const params = new URLSearchParams(window.location.search);
    if (params.get('return') === '1') {
      setNotice('Welcome back from Stripe — status below was just re-read from your account.');
    } else if (params.get('refresh') === '1') {
      setNotice('That Stripe link had expired. Use the button below to get a fresh one.');
    }
    loadStatus();
  }, [loadStatus]);

  const handleConnect = async () => {
    setBusy('connect');
    setError(null);
    try {
      const res = await fetch('/api/admin/stripe-connections/connect', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.url) throw new Error(body?.error || 'Could not start Stripe onboarding');
      window.location.href = body.url;
    } catch (e: any) {
      setError(e?.message || 'Could not start Stripe onboarding');
      setBusy(null);
    }
  };

  const handleDashboard = async () => {
    setBusy('dashboard');
    setError(null);
    // Open the tab synchronously so popup blockers don't eat it, then point
    // it at the one-time login link when Stripe returns it.
    const win = window.open('about:blank', '_blank');
    try {
      const res = await fetch('/api/admin/stripe-connections/dashboard-link', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.url) throw new Error(body?.error || 'Could not create dashboard link');
      if (win) win.location.href = body.url;
      else window.location.href = body.url;
    } catch (e: any) {
      if (win) win.close();
      setError(e?.message || 'Could not create dashboard link');
    } finally {
      setBusy(null);
    }
  };

  const connected = !!status?.connected;
  const onboardingComplete = !!status?.onboarding_complete;
  const maskedId = status?.stripe_account_id
    ? `••••••${status.stripe_account_id.slice(-8)}`
    : null;

  return (
    <div className="flex flex-col w-full text-foreground bg-card select-text">
      {/* SYSTEM CONTEXT STRIP */}
      <div className="w-full bg-muted/40 border-b border-border px-4 py-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-black inline-block"></span>
          <span className="font-medium text-[11px] text-muted-foreground">
            Stripe Connect
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground">
          <span>
            STATUS:{' '}
            {loading
              ? 'CHECKING…'
              : !status
                ? 'UNKNOWN'
                : !connected
                  ? 'NOT CONNECTED'
                  : onboardingComplete
                    ? 'CONNECTED'
                    : 'ONBOARDING INCOMPLETE'}
          </span>
        </div>
      </div>

      <div className="p-6 border-b border-border">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Stripe Connections</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5 max-w-3xl">
          Link this business&apos;s bank account through Stripe Connect. A connected account is what lets
          this business receive dropship order payouts and fund payroll. Bank details are entered on
          Stripe&apos;s secure pages only — they are never typed into or stored in this app.
        </p>
      </div>

      <div className="p-6 max-w-3xl w-full mx-auto space-y-6">
        {/* Processor gate (2026-10-13): Stripe has DISABLED this platform —
            payouts and Connect are off pending Stripe's review, and the
            replacement-processor decision is pending. The connect and
            dashboard actions below therefore cannot complete at Stripe
            right now; they are kept wired and will work unchanged if the
            platform is reinstated. Status reads remain truthful. */}
        <div className="border border-warning/40 bg-warning/10 px-4 py-3 text-[12px] text-foreground">
          <strong>Processor status:</strong> Stripe has disabled this platform (payouts and Connect off, review pending).
          Connecting a new account or opening the Stripe dashboard will fail at Stripe until the platform is reinstated
          or a replacement processor is in place. Nothing about your local records changes.
        </div>

        {notice && (
          <div className="border border-border bg-muted/40 px-4 py-3 text-[12px] text-foreground">
            {notice}
          </div>
        )}

        {error && (
          <div className="border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12px] text-destructive flex items-center justify-between gap-4">
            <span>{error}</span>
            <button
              onClick={loadStatus}
              className="shrink-0 border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-foreground cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        <div className="border border-border bg-card p-6 shadow-card-md space-y-4">
          <div className="border-b border-border pb-2 flex justify-between items-center">
            <h3 className="tabular-nums text-sm font-semibold text-foreground">STRIPE CONNECT ACCOUNT</h3>
            <span
              className={`text-[9px] font-semibold px-1.5 py-0.5 border uppercase ${
                connected && onboardingComplete
                  ? 'bg-success/10 border-success/30 text-success'
                  : 'bg-muted/40 border-border text-muted-foreground'
              }`}
            >
              {loading
                ? 'CHECKING'
                : !connected
                  ? 'NOT CONNECTED'
                  : onboardingComplete
                    ? 'ACTIVE'
                    : 'SETUP INCOMPLETE'}
            </span>
          </div>

          {loading ? (
            <p className="text-[12px] text-muted-foreground">Reading connection status…</p>
          ) : !connected ? (
            <div className="space-y-4">
              <p className="text-[12px] text-muted-foreground">
                No Stripe account is connected for this business yet. Connect one to receive payouts
                for dropship orders and to fund payroll. Stripe will ask for the business details and
                bank account on its own secure onboarding pages.
              </p>
              <button
                onClick={handleConnect}
                disabled={busy !== null}
                className="w-full bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 border border-border px-4 py-2 text-[12px] uppercase font-semibold tracking-wider transition-colors rounded-lg cursor-pointer disabled:opacity-50"
              >
                {busy === 'connect' ? 'OPENING STRIPE…' : 'CONNECT WITH STRIPE'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-[12px] text-muted-foreground space-y-1.5">
                <div className="flex justify-between">
                  <span>Connected account:</span>
                  <strong className="text-foreground">{maskedId}</strong>
                </div>
                {status?.updated_at && (
                  <div className="flex justify-between">
                    <span>Status last synced:</span>
                    <strong className="text-foreground">
                      {new Date(status.updated_at).toLocaleString()}
                    </strong>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <StatusBadge ok={onboardingComplete} label="Onboarding" />
                <StatusBadge ok={!!status?.charges_enabled} label="Charges" />
                <StatusBadge ok={!!status?.payouts_enabled} label="Payouts" />
              </div>

              {!onboardingComplete && (
                <p className="text-[12px] text-muted-foreground">
                  Stripe still needs information before this account can take charges and receive
                  payouts. Continue onboarding to finish setup.
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {!onboardingComplete && (
                  <button
                    onClick={handleConnect}
                    disabled={busy !== null}
                    className="bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 border border-border px-4 py-2 text-[12px] uppercase font-semibold tracking-wider transition-colors rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    {busy === 'connect' ? 'OPENING STRIPE…' : 'CONTINUE ONBOARDING'}
                  </button>
                )}
                <button
                  onClick={handleDashboard}
                  disabled={busy !== null}
                  className="bg-card hover:bg-muted/40 text-foreground border border-border px-4 py-2 text-[12px] uppercase font-semibold tracking-wider transition-colors rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {busy === 'dashboard' ? 'OPENING…' : 'OPEN STRIPE DASHBOARD'}
                </button>
                <button
                  onClick={loadStatus}
                  disabled={busy !== null}
                  className="bg-card hover:bg-muted/40 text-foreground border border-border px-4 py-2 text-[12px] uppercase font-semibold tracking-wider transition-colors rounded-lg cursor-pointer disabled:opacity-50"
                >
                  REFRESH STATUS
                </button>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Payouts, bank details, and tax forms are managed inside the Stripe dashboard — changes
                there sync back here automatically.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
