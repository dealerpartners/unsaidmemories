'use client';

import React, { useState } from 'react';

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
}

export const RevenueStripeGatewayScreen: React.FC<ScreenProps> = ({
  onNavigateScreen,
}) => {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [stripeConnected, setStripeConnected] = useState(true);
  const [terminalReaderStatus, setTerminalReaderStatus] = useState('ONLINE // IDLE');
  const [cardPresentFee, setCardPresentFee] = useState('2.6% + 10¢');
  const [cardNotPresentFee, setCardNotPresentFee] = useState('2.9% + 30¢');
  const [tipSuggested, setTipSuggested] = useState('18%, 20%, 25%');
  const [payoutSchedule, setPayoutSchedule] = useState('DAILY_AUTOMATIC');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

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

      {/* SUB-NAV STRIP */}
      <div className="w-full bg-card border-b border-border overflow-x-auto select-none">
        <div className="flex items-center min-w-max">
          <div className="px-3 py-2 bg-muted/40 border-r border-border flex items-center gap-2">
            <span className="w-2 h-2 bg-black"></span>
            <span className="tabular-nums text-[11px] uppercase tracking-wider text-foreground font-semibold">MODULE // REVENUE &amp; STRIPE</span>
          </div>
          <nav className="flex items-center text-[13px] tabular-nums">
            {[
              { label: 'Overview', id: 'overview' },
              { label: '■ Stripe Gateway & Connect', id: 'revenue-stripe', active: true },
              { label: 'Tax & Entity', id: 'payments-tax' },
              { label: 'Invoices & AR Aging', id: 'invoices-aging' },
              { label: 'Services Matrix', id: 'services-pricing' },
              { label: 'System Logs', id: 'system-telemetry' },
            ].map((tab) => (
              <button
                key={tab.label}
                onClick={() => onNavigateScreen?.(tab.id)}
                className={`px-3 py-2 border-r border-border/30 tabular-nums text-[13px] cursor-pointer transition-none flex items-center gap-1.5 ${
                  tab.active ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:bg-brand-teal/5 hover:text-brand-teal'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* HEADER SECTION */}
      <div className="p-4 lg:p-6 border-b border-border">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-medium uppercase tracking-wider px-2 py-0.5 border border-border bg-primary text-primary-foreground">
                Revenue &amp; Stripe Connect Engine
              </span>
              <span className="font-medium text-[11px] text-muted-foreground">
                Embedded POS • Card Vaulting • EMV Hardware • Automated Settlements
              </span>
            </div>
            <h1 className="font-display text-xl md:text-2xl font-semibold tracking-tight text-foreground mt-1">
              Stripe Connect, Card Vaulting &amp; Hardware POS Terminals
            </h1>
            <p className="text-[13px] text-muted-foreground">
              Configure Stripe custom Connect accounts, BBPOS WisePOS E counter hardware readers, tip tipping prompts, and merchant payouts.
            </p>
          </div>

          <div className="flex items-center gap-2 tabular-nums text-[13px]">
            <button
              onClick={() => showToast('STRIPE CONNECT DASHBOARD LINK GENERATED')}
              className="h-8 px-3 border border-border bg-card uppercase font-semibold hover:bg-muted/40 cursor-pointer"
            >
              Open Stripe Dashboard
            </button>
            <button
              onClick={() => showToast('GATEWAY RE-AUTHENTICATED // KMS ENCRYPTION VALIDATED')}
              className="h-8 px-4 bg-primary text-primary-foreground border border-border uppercase font-semibold hover:bg-muted cursor-pointer"
            >
              [SYNC STRIPE VAULT]
            </button>
          </div>
        </div>
      </div>

      {/* TELEMETRY TILES */}
      <div className="grid grid-cols-2 md:grid-cols-4 bg-black gap-px border-b border-border tabular-nums">
        <div className="bg-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase">
            <span>STRIPE CONNECT STATUS</span>
            <span className="bg-primary text-primary-foreground px-1 text-[9px] font-semibold">VERIFIED</span>
          </div>
          <div className="text-xl font-semibold font-sans mt-2 text-foreground">ACCT_1NW49x...</div>
          <div className="text-[10px] text-muted-foreground mt-1">CHARGES &amp; PAYOUTS: ACTIVE</div>
        </div>

        <div className="bg-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase">
            <span>VAULTED CLIENT CARDS</span>
            <span className="border border-border px-1 text-[9px] bg-muted/40">SETUP_INTENT</span>
          </div>
          <div className="text-xl font-semibold font-sans mt-2 text-foreground">842 CARDS</div>
          <div className="text-[10px] text-muted-foreground mt-1">ZERO RAW PAN EXPOSURE</div>
        </div>

        <div className="bg-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase">
            <span>PENDING SETTLEMENT</span>
            <span className="border border-border px-1 text-[9px] bg-muted/40">DAILY_ROLL</span>
          </div>
          <div className="text-xl font-semibold font-sans mt-2 text-foreground">$4,120.50</div>
          <div className="text-[10px] text-muted-foreground mt-1">SETTLING TONIGHT AT 23:59 UTC</div>
        </div>

        <div className="bg-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase">
            <span>DISPUTE / CHARGEBACK</span>
            <span className="bg-primary text-primary-foreground px-1 text-[9px] font-semibold">0.00%</span>
          </div>
          <div className="text-xl font-semibold font-sans mt-2 text-foreground">0 ACTIVE</div>
          <div className="text-[10px] text-muted-foreground mt-1">RADAR SHIELD: MAXIMAL</div>
        </div>
      </div>

      {/* MAIN CONTENT SPLIT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 bg-black gap-px border-b border-border tabular-nums text-[13px]">
        {/* LEFT 7 COLS: SETTINGS & HARDWARE POS */}
        <div className="lg:col-span-7 bg-card p-5 space-y-6">
          {/* HARDWARE POS TERMINALS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="font-semibold text-foreground uppercase">01 // COUNTERTOP &amp; MOBILE EMV TERMINALS</span>
              <button
                onClick={() => showToast('REGISTERING NEW WISEPOS E TERMINAL')}
                className="border border-border px-2 py-0.5 text-[9px] uppercase font-semibold hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal cursor-pointer"
              >
                + Pair Reader
              </button>
            </div>

            <div className="space-y-2">
              <div className="border border-border p-3 bg-muted/30 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground text-[9px] px-1.5 py-0.2 font-semibold">BBPOS WISEPOS E</span>
                    <span className="font-semibold text-[13px]">Frisco Seller Primary</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">IP: 192.168.1.144 // SN: WSC514981023</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="border border-border bg-card px-2 py-0.5 text-[9px] font-semibold">BATTERY: 98%</span>
                  <span className="bg-primary text-primary-foreground px-2 py-0.5 text-[9px] font-semibold">ONLINE</span>
                </div>
              </div>

              <div className="border border-border p-3 bg-muted/30 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground text-[9px] px-1.5 py-0.2 font-semibold">STRIPE READER M2</span>
                    <span className="font-semibold text-[13px]">Mobile Van Unit #1 Bluetooth</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">BT: PORTAL-VAN-M2 // SN: STR9023418</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="border border-border bg-card px-2 py-0.5 text-[9px] font-semibold">STANDBY</span>
                  <span className="border border-border bg-card px-2 py-0.5 text-[9px] font-semibold">CONNECTED</span>
                </div>
              </div>
            </div>
          </div>

          {/* TIPPING & CHECKOUT PROMPTS */}
          <div className="space-y-3 pt-3 border-t border-border">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="font-semibold text-foreground uppercase">02 // TIP SUGGESTIONS &amp; TERMINAL DISPLAY</span>
              <span className="text-[10px] text-muted-foreground">GRATUITY ENGINE</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-muted-foreground uppercase text-[10px] block mb-1">SUGGESTED TIP TIERS (READER SCREEN)</label>
                <input
                  value={tipSuggested}
                  onChange={(e) => setTipSuggested(e.target.value)}
                  className="w-full border border-border p-2 font-semibold bg-muted/30 focus:bg-card focus:outline-none text-[13px]"
                  type="text"
                />
              </div>

              <div>
                <label className="text-muted-foreground uppercase text-[10px] block mb-1">SETTLEMENT PAYOUT TIMING</label>
                <select
                  value={payoutSchedule}
                  onChange={(e) => setPayoutSchedule(e.target.value)}
                  className="w-full border border-border p-2 font-semibold bg-muted/30 focus:bg-card focus:outline-none text-[13px]"
                >
                  <option value="DAILY_AUTOMATIC">DAILY AUTOMATIC BATCH (DEFAULT)</option>
                  <option value="WEEKLY_MONDAY">WEEKLY EVERY MONDAY</option>
                  <option value="MANUAL_DRAW">MANUAL ON-DEMAND DRAW</option>
                </select>
              </div>
            </div>
          </div>

          {/* SURCHARGE & PROCESSING FEES */}
          <div className="space-y-3 pt-3 border-t border-border">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="font-semibold text-foreground uppercase">03 // BLENDED PROCESSING RATES</span>
              <span className="text-[10px] text-muted-foreground">STRIPE INTERCHANGE-PLUS</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-2.5 border border-border bg-muted/30">
                <div className="text-[9px] text-muted-foreground uppercase">CARD PRESENT (EMV TAP/CHIP)</div>
                <div className="font-semibold text-sm mt-1">{cardPresentFee}</div>
              </div>
              <div className="p-2.5 border border-border bg-muted/30">
                <div className="text-[9px] text-muted-foreground uppercase">CARD NOT PRESENT (WEB/VAULT)</div>
                <div className="font-semibold text-sm mt-1">{cardNotPresentFee}</div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT 5 COLS: RECENT STRIPE SETTLEMENT RUNS */}
        <div className="lg:col-span-5 bg-muted/30 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="font-semibold text-foreground uppercase">RECENT STRIPE PAYOUT RUNS</span>
            <span className="bg-primary text-primary-foreground px-1.5 py-0.2 text-[9px] font-semibold">CHASE LEDGER</span>
          </div>

          <div className="space-y-2">
            {[
              { id: 'po_1OaX90Portal01', date: '2025-02-23', amount: '$4,120.00', status: 'PAID' },
              { id: 'po_1OaX89Portal02', date: '2025-02-22', amount: '$3,890.50', status: 'PAID' },
              { id: 'po_1OaX72Portal03', date: '2025-02-21', amount: '$5,210.00', status: 'PAID' },
              { id: 'po_1OaX61Portal04', date: '2025-02-20', amount: '$4,650.00', status: 'PAID' },
            ].map((p) => (
              <div key={p.id} className="p-3 border border-border bg-card flex items-center justify-between">
                <div>
                  <div className="font-semibold">{p.amount}</div>
                  <div className="text-[10px] text-muted-foreground">{p.id} &bull; {p.date}</div>
                </div>
                <span className="border border-border bg-muted/40 text-foreground px-2 py-0.5 text-[9px] font-semibold">
                  {p.status}
                </span>
              </div>
            ))}
          </div>

          <div className="p-3 border border-border bg-card space-y-1 text-[11px]">
            <div className="font-semibold uppercase">PCI-DSS LEVEL 1 COMPLIANCE:</div>
            <p className="text-muted-foreground">
              Cardholder data is transmitted directly from client browser or reader to Stripe tokenization vaults. No card numbers ever touch salon servers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
