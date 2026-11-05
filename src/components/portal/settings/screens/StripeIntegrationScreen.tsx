'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  ExternalLink,
  Copy,
} from 'lucide-react';

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
  systemSettings?: any;
  saveSettingsToDb?: (updates: any) => Promise<boolean>;
}

// This screen is a STATUS surface, not a key editor. Connection state
// comes from GET /api/admin/stripe-connections/status (the tenant's
// tenant_stripe_accounts row, refreshed live from Stripe when the API
// is reachable). API keys are environment-managed: the secret key lives
// only in the production environment and is never displayed, edited, or
// stored in the settings table from here. Onboarding and connection
// management live on /admin/stripe-connections.

type StripeStatus = {
  connected: boolean;
  synced?: boolean;
  stripe_account_id?: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  onboarding_complete?: boolean;
  updated_at?: string;
};

const WEBHOOK_URL = 'https://unsaid.com/api/stripe/webhook';

// The event types src/app/api/stripe/webhook actually handles.
const HANDLED_EVENTS = [
  'checkout.session.completed',
  'payment_intent.succeeded',
  'charge.refunded',
  'invoice.paid',
  'invoice.upcoming',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.updated',
  'account.updated',
];

const flag = (v?: boolean) => (v === undefined ? '—' : v ? 'YES' : 'NO');

export const StripeIntegrationScreen: React.FC<ScreenProps> = ({
  onNavigateScreen,
}) => {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [status, setStatus] = useState<StripeStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/admin/stripe-connections/status');
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) { setStatusError(j.error || `Status check failed (${r.status})`); return; }
        setStatus(j as StripeStatus);
      } catch {
        if (!cancelled) setStatusError('Status check could not reach the server');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Register payment methods (SA-124) — the tenant's
  // commerce_payment_methods rows, toggled through cms_edit_gateway_settings.
  // These flags decide which tenders the register offers. Processor-level
  // method toggles (Apple Pay, WeChat Pay, …) live in the Stripe Dashboard
  // under Settings → Payments — not here.
  const [payMethods, setPayMethods] = useState<Array<{ id: string; code: string; name: string | null; isActive: boolean }> | null>(null);

  const loadPayMethods = React.useCallback(async () => {
    try {
      const r = await fetch('/api/admin/cms/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cms_overview', payload: {} }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) setPayMethods(j.overview?.paymentMethods || []);
      else setPayMethods([]);
    } catch { setPayMethods([]); }
  }, []);

  React.useEffect(() => { loadPayMethods(); }, [loadPayMethods]);

  const togglePayMethod = async (code: string, next: boolean) => {
    try {
      const r = await fetch('/api/admin/cms/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cms_edit_gateway_settings', payload: { payment_method_code: code, is_active: next } }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Toggle failed (${r.status})`);
      showToast(`${code} ${next ? 'ENABLED' : 'RETIRED'} AT THE REGISTER`);
      await loadPayMethods();
    } catch (e) {
      showToast(`TOGGLE FAILED — ${e instanceof Error ? e.message : 'unknown'}`);
    }
  };

  const connected = status?.connected === true;
  const statusWord = statusError ? 'STATUS UNAVAILABLE' : status === null ? 'CHECKING…' : connected ? 'CONNECTED' : 'NOT CONNECTED';

  return (
    <div className="w-full bg-card text-foreground font-sans antialiased text-[13px]">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-4 py-3 border border-white z-50 flex items-center gap-3 tabular-nums text-[13px] shadow-2xl">
          <span className="w-2 h-2 bg-card animate-pulse"></span>
          <span className="uppercase font-semibold tracking-wider">{toastMsg}</span>
          <button onClick={() => setToastMsg(null)} className="ml-2 text-white hover:opacity-70 cursor-pointer">✕</button>
        </div>
      )}

      {/* STATUS BAR */}
      <div className="w-full bg-primary text-primary-foreground px-4 py-2 flex flex-wrap items-center justify-between border-b border-border text-[10px] tabular-nums tracking-wider uppercase">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 ${connected ? 'bg-success' : 'bg-destructive'}`}></span>
          <span className="font-semibold tracking-tight">MERCHANT CONNECT</span>
          <span className="text-muted-foreground">{"//"}</span>
          <span className="text-white">STATUS READ FROM STRIPE</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] tabular-nums text-muted-foreground/70">
          <span>CONNECTION: {statusWord}</span>
        </div>
      </div>

      {/* BREADCRUMB & EXECUTIVE TOOLBAR */}
      <div className="w-full bg-card border-b border-border p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 tabular-nums text-[10px] text-muted-foreground">
            <span>ADMIN SETTINGS</span>
            <span className="text-foreground font-semibold">&gt;&gt;</span>
            <span className="text-foreground font-semibold">REVENUE &amp; STRIPE MERCHANT</span>
            <span className="text-foreground font-semibold">&gt;&gt;</span>
            <span className="bg-primary text-primary-foreground px-1 text-[9px] font-semibold">API GATEWAY</span>
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="font-semibold text-lg md:text-xl tracking-tight uppercase text-foreground">STRIPE CONNECTED GATEWAY CONFIG</h1>
            <span className="tabular-nums text-[11px] text-muted-foreground">{"// MERCHANT ACCOUNT DIRECTORY"}</span>
          </div>
        </div>

        {/* ACTION BUTTONS — both do exactly what they say */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { navigator.clipboard.writeText(WEBHOOK_URL); showToast('COPIED WEBHOOK ENDPOINT'); }}
            className="h-8 px-3 bg-card border border-border text-foreground tabular-nums text-[10px] uppercase hover:bg-muted/40 transition-none flex items-center gap-1.5 cursor-pointer"
          >
            COPY WEBHOOK URL
          </button>
          <a
            href="/admin/stripe-connections"
            className="h-8 px-3 bg-primary text-primary-foreground border border-border tabular-nums text-[10px] uppercase hover:bg-muted transition-none flex items-center gap-1.5 cursor-pointer"
          >
            MANAGE CONNECTION
          </a>
        </div>
      </div>

      {/* RESTRICTED SETTINGS SUB-NAV TAB MATRIX */}
      <div className="w-full bg-muted/40 border-b border-border overflow-x-auto">
        <div className="flex items-stretch min-w-max text-[11px] tabular-nums">
          <button onClick={() => onNavigateScreen?.('org-multiloc')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            01 LOCATIONS &amp; SALONS
          </button>
          <button onClick={() => onNavigateScreen?.('users-staff')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            02 USERS, STAFF &amp; ROLES
          </button>
          <button onClick={() => onNavigateScreen?.('booking-rules')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            03 BOOKING RULES &amp; POLICIES
          </button>
          <div className="px-4 py-2 bg-primary text-primary-foreground border-r border-border flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-card inline-block"></span>
            <span>04 REVENUE &amp; STRIPE GATEWAY</span>
            <span className="text-[9px] px-1 bg-card text-foreground uppercase font-semibold ml-1">[ACTIVE]</span>
          </div>
          <button onClick={() => onNavigateScreen?.('system-telemetry')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            05 SYSTEM HEALTH &amp; TELEMETRY
          </button>
          <button onClick={() => onNavigateScreen?.('services-pricing')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            06 SERVICES &amp; PRICING MATRIX
          </button>
          <button onClick={() => onNavigateScreen?.('analytics-reporting')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            07 ANALYTICS &amp; REPORTING
          </button>
          <button onClick={() => onNavigateScreen?.('cms-wizard')} className="px-4 py-2 text-muted-foreground hover:bg-card cursor-pointer">
            08 CMS &amp; BOOKING WIZARD
          </button>
        </div>
      </div>

      {/* TWO-COLUMN STRIPE GATEWAY CONFIG GRID */}
      <div className="p-6 grid grid-cols-1 xl:grid-cols-12 gap-6">

        {/* COLUMN 1-7: CONNECTION STATUS, KEYS, WEBHOOK */}
        <div className="xl:col-span-7 space-y-6">
          <div className="border-2 border-border p-5 bg-card shadow-card-md">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4 tabular-nums">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-black"></span>
                <h3 className="font-semibold text-sm uppercase text-foreground">SECTION A: CONNECTION STATUS</h3>
              </div>
              <span className={`text-[10px] tabular-nums px-1.5 py-0.5 font-semibold uppercase ${connected ? 'bg-primary text-primary-foreground' : 'border border-border'}`}>{statusWord}</span>
            </div>

            {statusError ? (
              <p className="tabular-nums text-[13px] text-destructive">Stripe status could not be read: {statusError}. Connection state is unknown — not assumed.</p>
            ) : status === null ? (
              <p className="tabular-nums text-[13px] text-muted-foreground">Reading connection status…</p>
            ) : !connected ? (
              <div className="space-y-3 tabular-nums text-[13px]">
                <p className="text-muted-foreground">
                  No Stripe Connect account is linked for this tenant yet, so card payments, payouts, and
                  payroll disbursement stay off until onboarding completes.
                </p>
                <a
                  href="/admin/stripe-connections"
                  className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 text-[11px] uppercase font-semibold hover:bg-muted"
                >
                  <span>START STRIPE ONBOARDING</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ) : (
              <div className="space-y-2 tabular-nums text-[13px]">
                <div className="flex justify-between border-b border-border pb-1.5">
                  <span className="text-muted-foreground text-[10px] uppercase font-semibold">STRIPE ACCOUNT ID</span>
                  <span className="font-semibold">{status.stripe_account_id || '—'}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-1.5">
                  <span className="text-muted-foreground text-[10px] uppercase font-semibold">CHARGES ENABLED</span>
                  <span className="font-semibold">{flag(status.charges_enabled)}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-1.5">
                  <span className="text-muted-foreground text-[10px] uppercase font-semibold">PAYOUTS ENABLED</span>
                  <span className="font-semibold">{flag(status.payouts_enabled)}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-1.5">
                  <span className="text-muted-foreground text-[10px] uppercase font-semibold">ONBOARDING COMPLETE</span>
                  <span className="font-semibold">{flag(status.onboarding_complete)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-[10px] uppercase font-semibold">STATUS SOURCE</span>
                  <span className="font-semibold">
                    {status.synced ? 'LIVE FROM STRIPE' : 'LAST SYNCED RECORD'}
                    {status.updated_at ? ` · ${new Date(status.updated_at).toLocaleString()}` : ''}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground pt-1">
                  Bank and payout-account details live in Stripe and are never stored in this app — change them from the connection page or the Stripe Dashboard.
                </p>
              </div>
            )}
          </div>

          <div className="border-2 border-border p-5 bg-card shadow-card-md">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4 tabular-nums">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-black"></span>
                <h3 className="font-semibold text-sm uppercase text-foreground">SECTION B: API KEYS — ENVIRONMENT MANAGED</h3>
              </div>
              <Lock className="w-4 h-4 text-foreground" />
            </div>

            <div className="space-y-4 tabular-nums text-[13px]">
              <div className="space-y-1.5">
                <label className="block text-[10px] text-muted-foreground uppercase font-semibold">STRIPE PUBLISHABLE KEY</label>
                <p className="text-muted-foreground">
                  Served to the browser from the environment (<code className="bg-muted/40 px-1 font-semibold text-foreground">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>).
                  It is not stored in the settings database and is not edited here.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] text-muted-foreground uppercase font-semibold">STRIPE SECRET API KEY</label>
                <p className="text-muted-foreground">
                  Server-side only (<code className="bg-muted/40 px-1 font-semibold text-foreground">STRIPE_SECRET_KEY</code> in the production
                  environment). It is never displayed in this panel and never exercised from development machines.
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] text-muted-foreground uppercase font-semibold">LIVE / TEST MODE</label>
                <p className="text-muted-foreground">
                  Determined by which keys the production environment holds — there is no in-app switch,
                  because a settings toggle cannot reroute real charges.
                </p>
              </div>
            </div>
          </div>

          <div className="border-2 border-border p-5 bg-card shadow-card-md">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-black"></span>
                <h3 className="font-semibold text-sm uppercase tabular-nums tracking-wider">SECTION C: REALTIME EVENT WEBHOOK HANDLERS</h3>
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground uppercase">ACTIVE CONFIG</span>
            </div>

            <div className="space-y-4 tabular-nums text-[13px]">
              <div className="space-y-1.5">
                <label className="block text-[10px] text-muted-foreground uppercase font-semibold">WEBHOOK LISTENER ENDPOINT</label>
                <div className="flex items-center">
                  <input
                    type="text"
                    value={WEBHOOK_URL}
                    className="flex-1 border border-border p-2 bg-muted/40 tabular-nums text-muted-foreground font-semibold focus:outline-none"
                    readOnly
                  />
                  <button onClick={() => { navigator.clipboard.writeText(WEBHOOK_URL); showToast('COPIED WEBHOOK ENDPOINT'); }} className="border border-border p-2 bg-muted/40 hover:bg-muted cursor-pointer">
                    <Copy className="w-4 h-4 text-foreground" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] text-muted-foreground uppercase font-semibold">WEBHOOK SIGNING SECRET (WHSEC)</label>
                <p className="text-muted-foreground text-[13px]">
                  Verified server-side from the environment (<code className="bg-muted/40 px-1 font-semibold text-foreground">STRIPE_WEBHOOK_SECRET</code>).
                  The value is never shown here.
                </p>
              </div>

              <div className="border border-border p-3 bg-muted/30 space-y-1.5">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">LISTENED EVENTS STATUS</span>
                {HANDLED_EVENTS.map((evt) => (
                  <div key={evt} className="flex justify-between items-center text-[13px] tabular-nums">
                    <span>↳ <code className="bg-muted/40 px-1 font-semibold text-foreground">{evt}</code>:</span>
                    <span className="bg-primary text-primary-foreground text-[9px] px-1.5 py-0.2 font-semibold uppercase">HANDLED</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* COLUMN 8-12: CONNECT CARD + SECURITY NOTE */}
        <div className="xl:col-span-5 space-y-6">
          <div className="border-2 border-border p-4 bg-card shadow-card-md">
            <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
              <h4 className="font-semibold text-[13px] uppercase tabular-nums tracking-wider">STRIPE CONNECT</h4>
              <span className="text-[10px] tabular-nums text-muted-foreground">{statusWord}</span>
            </div>

            <div className="space-y-3 tabular-nums text-[13px]">
              <div className="border border-border p-3 bg-muted/30 space-y-1">
                <span className="text-[9px] text-muted-foreground uppercase block font-semibold">CONNECTED ACCOUNT</span>
                <div className="font-semibold text-sm text-foreground">
                  {connected ? (status?.stripe_account_id || 'Linked') : 'No account linked'}
                </div>
                <span className="text-[10px] text-muted-foreground block">
                  {connected
                    ? `Charges ${flag(status?.charges_enabled)} · Payouts ${flag(status?.payouts_enabled)} · Onboarding ${flag(status?.onboarding_complete)}`
                    : 'Onboarding runs on the Stripe Connections page.'}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border space-y-2">
              <a
                href="/admin/stripe-connections"
                className="w-full border border-border py-2 text-[13px] tabular-nums uppercase font-semibold hover:bg-muted flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>CONNECTION &amp; ONBOARDING</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://dashboard.stripe.com"
                target="_blank"
                rel="noreferrer"
                className="w-full bg-primary text-primary-foreground py-2 text-[13px] tabular-nums uppercase font-semibold hover:bg-muted flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>OPEN STRIPE DASHBOARD</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="border border-border bg-muted/30 p-4 space-y-2.5 tabular-nums text-[13px]">
            <div className="flex items-center gap-1.5 font-semibold uppercase text-foreground border-b border-border pb-1.5">
              <ShieldCheck className="w-4 h-4 text-foreground" />
              <span>SECURITY</span>
            </div>
            <p className="text-muted-foreground font-sans leading-tight">
              Card data is collected by Stripe (a PCI DSS Level 1 provider) — card numbers never touch this
              application or its database. Secret keys live only in the production environment and are rotated
              from the Stripe Dashboard, never from this panel.
            </p>
          </div>
        </div>

      </div>

      {/* SECTION D: REGISTER PAYMENT METHODS (SA-124) */}
      <div className="border-2 border-border p-5 bg-card shadow-card-md">
        <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-black"></span>
            <h3 className="font-semibold text-sm uppercase tabular-nums tracking-wider">SECTION D: REGISTER PAYMENT METHODS</h3>
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground uppercase">COMMERCE_PAYMENT_METHODS</span>
        </div>
        <p className="text-[13px] tabular-nums text-muted-foreground mb-4">
          These flags decide which tenders this shop&apos;s register offers — they write
          <code className="bg-muted/40 px-1 font-semibold text-foreground"> commerce_payment_methods.is_active</code>.
          Card-brand and wallet toggles inside Stripe itself (Apple Pay, WeChat Pay, Link) are managed in the
          Stripe Dashboard under Settings → Payments.
        </p>
        {payMethods === null ? (
          <p className="text-[13px] tabular-nums text-muted-foreground">LOADING PAYMENT METHODS…</p>
        ) : payMethods.length === 0 ? (
          <p className="text-[13px] tabular-nums text-muted-foreground">NO PAYMENT METHODS FOUND FOR THIS SHOP.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 tabular-nums text-[13px]">
            {payMethods.map((m) => (
              <div key={m.id} className="flex items-center justify-between border border-border px-3 py-2 bg-muted/20">
                <div>
                  <span className="font-semibold text-foreground">{m.code}</span>
                  {m.name && <span className="block text-[11px] text-muted-foreground">{m.name}</span>}
                </div>
                <button
                  onClick={() => togglePayMethod(m.code, !m.isActive)}
                  className={`text-[10px] px-2 py-1 font-semibold uppercase cursor-pointer border ${m.isActive ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border'}`}
                >
                  {m.isActive ? 'ACTIVE' : 'RETIRED'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="w-full bg-muted/30 border-t border-border border-b border-border p-4 flex flex-col md:flex-row items-center justify-between gap-4 select-none tabular-nums text-[13px]">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-primary text-primary-foreground flex items-center justify-center border border-border font-semibold">
            <Lock className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] text-muted-foreground">
            Changes to keys, webhook routes, or payout accounts are made in the Stripe Dashboard and the
            production environment — this panel reports status only.
          </span>
        </div>
      </div>

      {/* STATUS LINE */}
      <div className="w-full bg-primary text-primary-foreground px-4 py-1.5 flex items-center justify-between tabular-nums text-[11px]">
        <div className="flex items-center gap-2">
          <span>&gt; STRIPE_GATEWAY: {statusWord}</span>
          <span className="inline-block w-[7px] h-[14px] bg-card animate-pulse"></span>
        </div>
        <div className="flex items-center gap-4 text-muted-foreground/70">
          <span>SOURCE: /API/ADMIN/STRIPE-CONNECTIONS/STATUS</span>
        </div>
      </div>
    </div>
  );
};
