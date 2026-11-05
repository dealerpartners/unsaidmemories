'use client';

import React, { useState } from 'react';
import { 
  FileText, 
  DollarSign, 
  ShieldCheck, 
  AlertTriangle, 
  Clock, 
  Search, 
  ArrowRight, 
  RefreshCw, 
  Download, 
  Printer, 
  Lock,
  Percent,
  CheckCircle,
  HelpCircle
} from 'lucide-react';

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
  systemSettings?: any;
  saveSettingsToDb?: (updates: any) => Promise<boolean>;
}

export const EscrowDepositsForfeituresScreen: React.FC<ScreenProps> = ({
  onNavigateScreen,
  selectedLocation,
  onSelectLocation,
  systemSettings,
  saveSettingsToDb,
}) => {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [escrowList, setEscrowList] = useState([
    { id: 'TXN-90241-1', date: 'MAY 18, 2025', client: 'AMARA OKAFOR', pet: 'Duke (Boxer)', amt: '$42.10', type: 'ESCROW_DEPOSIT', status: 'HELD_SECURE', stripeId: 'ch_3Mv8X3Lkd' },
    { id: 'TXN-90114-2', date: 'MAY 15, 2025', client: 'BENTLEY SUTTON', pet: 'Zeus (Rottweiler)', amt: '$75.00', type: 'ESCROW_DEPOSIT', status: 'HELD_SECURE', stripeId: 'ch_3Mv8Y8Lkd' },
    { id: 'TXN-89912-3', date: 'MAY 10, 2025', client: 'CYNTHIA VANCE', pet: 'Molly (Shih Tzu)', amt: '$30.00', type: 'CANCELLATION_FORFEIT', status: 'FORFEITED_TO_POOL', stripeId: 'ch_3Mv8P1Lkd' },
    { id: 'TXN-89410-4', date: 'MAY 02, 2025', client: 'DOUGLAS REID', pet: 'Rex (German Shepherd)', amt: '$50.00', type: 'CANCELLATION_REFUND', status: 'REFUNDED_100', stripeId: 'ch_3Mv8N9Lkd' },
  ]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleForfeitManual = (txnId: string) => {
    setEscrowList(prev => prev.map(item => {
      if (item.id === txnId) {
        return { ...item, type: 'CANCELLATION_FORFEIT', status: 'FORFEITED_TO_POOL' };
      }
      return item;
    }));
    showToast(`ESCROW TRANSACTION ${txnId} SECURED FORFEIT EXECUTED`);
  };

  const handleRefundManual = (txnId: string) => {
    setEscrowList(prev => prev.map(item => {
      if (item.id === txnId) {
        return { ...item, type: 'CANCELLATION_REFUND', status: 'REFUNDED_100' };
      }
      return item;
    }));
    showToast(`ESCROW TRANSACTION ${txnId} STRIPE REFUND DISPATCHED`);
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

      {/* SECURITY CLEARANCE BAR */}
      <div className="w-full bg-primary text-primary-foreground px-4 py-2 flex flex-wrap items-center justify-between border-b border-border text-[10px] tabular-nums tracking-wider uppercase">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-destructive animate-pulse"></span>
          <span className="text-destructive font-semibold tracking-tight">RESTRICTED ESCROW ACCESS</span>
          <span className="text-muted-foreground">{"//"}</span>
          <span className="text-white">AUTH_SCOPE: SUPER_ADMIN_LEVEL_0</span>
          <span className="text-muted-foreground">{"//"}</span>
          <span className="text-muted-foreground/50">NODE: TX-PROD-ESCROW-01</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] tabular-nums text-muted-foreground/70">
          <span>STRIPE API MODE: LIVE_PRODUCTION</span>
          <span>COMPLIANCE STATE: VERIFIED</span>
        </div>
      </div>

      {/* BREADCRUMB & EXECUTIVE TOOLBAR */}
      <div className="w-full bg-card border-b border-border p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 tabular-nums text-[10px] text-muted-foreground">
            <span>ADMIN SETTINGS</span>
            <span className="text-foreground font-semibold">&gt;&gt;</span>
            <span className="text-foreground font-semibold">ESCROW DEPOSITS &amp; FORFEITURES</span>
            <span className="text-foreground font-semibold">&gt;&gt;</span>
            <span className="bg-primary text-primary-foreground px-1 text-[9px] font-semibold">DEPOSIT POLICIES</span>
          </div>
          <div className="flex items-baseline gap-2">
            <h1 className="font-semibold text-lg md:text-xl tracking-tight uppercase text-foreground">ESCROW DEPOSITS, NO-SHOW COHORT &amp; FORFEITURES</h1>
            <span className="tabular-nums text-[11px] text-muted-foreground">{"// PRE-BOOKING COMMITMENTS"}</span>
          </div>
        </div>
        
        {/* ACTION BUTTONS */}
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={() => showToast('HOLIDAY DEPOSIT RATE SETTINGS MODIFIED')}
            className="h-8 px-3 bg-card border border-border text-foreground tabular-nums text-[10px] uppercase hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal transition-none flex items-center gap-1.5 cursor-pointer"
          >
            MODULATE DEPOSIT CAP
          </button>
          <button 
            onClick={() => showToast('ESCROW RECONCILIATION SUMMARY REPORT CSV EXPORTED')}
            className="h-8 px-3 bg-muted/40 text-foreground border border-border tabular-nums text-[10px] uppercase hover:bg-muted transition-none flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            EXPORT ESCROW RECONCILIATION (.CSV)
          </button>
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
          <button onClick={() => onNavigateScreen?.('revenue-stripe')} className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer">
            04 REVENUE &amp; STRIPE GATEWAY
          </button>
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

      {/* MAIN TWO-COLUMN CONFIG MATRIX */}
      <div className="p-6 grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* COLUMN 1-7: ESCROW RULE MATRIX & POLICY CONTROLS */}
        <div className="xl:col-span-7 space-y-6">
          <div className="border-2 border-border p-5 bg-card shadow-card-md">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-black"></span>
                <h3 className="font-semibold text-sm uppercase tabular-nums tracking-wider">SECTION A: PRE-BOOKING DEPOSIT &amp; CANCELLATION MATRICES</h3>
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground uppercase">ACTIVE CONFIG</span>
            </div>

            <div className="space-y-4 tabular-nums text-[13px]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-border p-3.5 bg-muted/30 space-y-2">
                  <span className="text-muted-foreground text-[10px] uppercase font-semibold block">STANDARD BOOKINGS PRE-DEPOSIT RATE</span>
                  <div className="flex items-center">
                    <span className="border-2  border-border p-1.5 bg-muted/40 font-semibold text-foreground">%</span>
                    <input type="text" defaultValue="50.00" className="flex-1 border-2 border-border p-1 text-[13px] focus:outline-none font-semibold bg-card" />
                  </div>
                  <span className="text-[10px] text-muted-foreground block">50% pre-payment captures coat-type commitment on Stripe checkout.</span>
                </div>

                <div className="border border-border p-3.5 bg-muted/30 space-y-2">
                  <span className="text-muted-foreground text-[10px] uppercase font-semibold block">HOLIDAY / PEAK DEPOSIT LOCK</span>
                  <div className="flex items-center">
                    <span className="border-2  border-border p-1.5 bg-muted/40 font-semibold text-foreground">%</span>
                    <input type="text" defaultValue="100.00" className="flex-1 border-2 border-border p-1 text-[13px] focus:outline-none font-semibold bg-card" />
                  </div>
                  <span className="text-[10px] text-muted-foreground block">Peak periods (Thanksgiving, Christmas) enforce 100% full upfront prepayments.</span>
                </div>
              </div>

              <div className="border border-border p-3.5 bg-card space-y-2">
                <span className="text-foreground text-[13px] font-semibold uppercase block">CANCELLATION &amp; NO-SHOW TIMING THRESHOLD MATRIX</span>
                <div className="space-y-1.5 text-[11px] text-muted-foreground">
                  <div className="flex justify-between border-b border-border pb-1">
                    <span>↳ Greater than 48 Hours cancellation:</span>
                    <strong className="text-foreground font-semibold">100% REFUND DISPATCHED AUTO</strong>
                  </div>
                  <div className="flex justify-between border-b border-border pb-1">
                    <span>↳ Between 24 and 48 Hours cancellation:</span>
                    <strong className="text-foreground font-semibold">50% REFUNDED // 50% RESERVED TO STAFF COHORT</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>↳ Less than 24 Hours or No-show:</span>
                    <strong className="text-destructive font-semibold">100% DEPOSIT FORFEITED TO SALON DISPATCH POOL</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ACTIVE HELD ESCROW LEDGER */}
          <div className="border-2 border-border p-5 bg-card shadow-card-md">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <span className="font-semibold tabular-nums text-[13px] uppercase text-foreground">SECTION B: REALTIME HELD ESCROW &amp; FORFEIT TRANSACTION LEDGER</span>
              <span className="text-muted-foreground tabular-nums text-[10px] uppercase">ESC_POOL_v2</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left tabular-nums text-[13px] border border-border">
                <thead className="bg-muted/40 border-b border-border text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 border-r border-border">TXN FILE ID</th>
                    <th className="p-2 border-r border-border">CLIENT / PET</th>
                    <th className="p-2 border-r border-border text-right">SECURED HELD</th>
                    <th className="p-2 border-r border-border">STATE TYPE</th>
                    <th className="p-2 border-r border-border">LEDGER STATUS</th>
                    <th className="p-2 text-center">MANUAL OVERRIDE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {escrowList.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="p-2 border-r border-border font-semibold">{item.id}</td>
                      <td className="p-2 border-r border-border">
                        <div>
                          <div className="font-semibold text-foreground">{item.client}</div>
                          <div className="text-[10px] text-muted-foreground">{item.pet}</div>
                        </div>
                      </td>
                      <td className="p-2 border-r border-border text-right font-semibold text-foreground">{item.amt}</td>
                      <td className="p-2 border-r border-border font-semibold text-[10px]">{item.type}</td>
                      <td className="p-2 border-r border-border text-center">
                        <span className={`px-1.5 py-0.2 text-[9px] font-semibold uppercase ${
                          item.status === 'HELD_SECURE' ? 'bg-primary text-primary-foreground' : 
                          item.status === 'REFUNDED_100' ? 'border border-border text-foreground bg-card' : 
                          'bg-destructive/10 text-destructive border border-destructive'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex justify-center gap-1">
                          {item.status === 'HELD_SECURE' && (
                            <>
                              <button 
                                onClick={() => handleForfeitManual(item.id)}
                                className="bg-destructive text-white px-1.5 py-0.5 text-[9px] uppercase font-semibold hover:bg-destructive cursor-pointer"
                              >
                                FORFEIT
                              </button>
                              <button 
                                onClick={() => handleRefundManual(item.id)}
                                className="border border-border bg-card text-foreground px-1.5 py-0.5 text-[9px] uppercase font-semibold hover:bg-muted/40 cursor-pointer"
                              >
                                REFUND
                              </button>
                            </>
                          )}
                          {item.status !== 'HELD_SECURE' && (
                            <span className="text-muted-foreground/70 font-semibold uppercase text-[9px]">SETTLED</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* COLUMN 8-12: ESCROW POOL METRICS & ANALYTICS */}
        <div className="xl:col-span-5 space-y-6">
          <div className="border-2 border-border p-4 bg-card shadow-card-md">
            <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
              <h4 className="font-semibold text-[13px] uppercase tabular-nums tracking-wider">ESCROW COMPLIANCE DIRECTORY</h4>
              <span className="text-[10px] tabular-nums text-muted-foreground">POOL RECOVERED</span>
            </div>

            <div className="space-y-3 tabular-nums text-[13px]">
              <div className="border border-border p-3 bg-muted/30 flex flex-col justify-between">
                <span className="text-muted-foreground text-[10px] uppercase font-semibold">TOTAL ACTIVE SECURED DEPOSITS (MTD)</span>
                <span className="text-xl font-semibold text-foreground mt-1">$4,850.00</span>
                <span className="text-[10px] text-muted-foreground mt-1">Held in locked Stripe escrow accounts. Releases upon successful groom checkout completion.</span>
              </div>

              <div className="border border-border p-3 bg-muted/30 flex flex-col justify-between">
                <span className="text-muted-foreground text-[10px] uppercase font-semibold">TOTAL CANCELLATION FORFEITS SECURED</span>
                <span className="text-xl font-semibold text-destructive mt-1">$680.00</span>
                <span className="text-[10px] text-muted-foreground mt-1">100% of collected no-show fees disbursed to stylist grooming commission pools to offset idle bay hours.</span>
              </div>
            </div>
          </div>

          {/* Compliance & Liability Banner */}
          <div className="border border-border bg-muted/30 p-4 space-y-2.5 tabular-nums text-[13px]">
            <div className="flex items-center gap-1.5 font-semibold uppercase text-foreground border-b border-border pb-1.5">
              <ShieldCheck className="w-4 h-4 text-foreground" />
              <span>PCI-DSS &amp; STRIPE ESCROW COMPLIANCE</span>
            </div>
            <p className="text-muted-foreground font-sans leading-tight">
              Pre-booking escrow transactions are routed via Stripe Connected Express Accounts. UnSaid Memories does not store raw credit card credentials. Vault tokens are secured under standard industry high-security protocols.
            </p>
          </div>
        </div>

      </div>

      {/* SUPER ADMIN SECURITY LOCK FOOTER / HARDWARE ATTESTATION */}
      <div className="w-full bg-muted/30 border-t border-border border-b border-border p-4 flex flex-col md:flex-row items-center justify-between gap-4 select-none tabular-nums text-[13px]">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-primary text-primary-foreground flex items-center justify-center border border-border font-semibold">
            <Lock className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-foreground uppercase">
              <span>SUPER_ADMIN LEVEL 0 // ESCROW CONFIG VAULT KEY</span>
              <span className="border border-border px-1.5 bg-card text-[9px] font-semibold">[YUBIKEY_FIDO2_ACTIVE]</span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Changes to standard deposit rates, peak period triggers, cancellation thresholds, or payout bank routes require dual-signature multi-factor ratification.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-[10px] uppercase">AUDIT TRAIL:</span>
          <span className="border border-border bg-card px-2 py-0.5 text-foreground font-semibold tabular-nums">ESC_REF #TX-91024-2025</span>
          <button 
            onClick={() => showToast('SUPER_ADMIN ENCLAVE SESSION TERMINATED')}
            className="h-6 px-3 bg-primary text-primary-foreground text-[10px] uppercase font-semibold hover:bg-muted transition-none cursor-pointer"
          >
            TERMINATE SESSION
          </button>
        </div>
      </div>

      {/* MONOCHROME TERMINAL STATUS LINE */}
      <div className="w-full bg-primary text-primary-foreground px-4 py-1.5 flex items-center justify-between tabular-nums text-[11px]">
        <div className="flex items-center gap-2">
          <span>&gt; ESCROW_DAEMON: CONNECTED</span>
          <span className="inline-block w-[7px] h-[14px] bg-card animate-pulse"></span>
        </div>
        <div className="flex items-center gap-4 text-muted-foreground/70">
          <span>ESCROW POOL: SYNCED</span>
          <span>CURRENCY: USD</span>
          <span>DAWG-OS ESCROW ENGINE v2.0</span>
        </div>
      </div>
    </div>
  );
};
