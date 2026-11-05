'use client';

import React, { useState } from 'react';

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
}

export const InvoicesAgingReportsScreen: React.FC<ScreenProps> = ({
  onNavigateScreen,
}) => {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState('CURRENT');
  const [locFilter, setLocFilter] = useState('ALL');
  const [searchGrep, setSearchGrep] = useState('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const agingData = [
    {
      inv: 'INV-2025-0891',
      client: 'Marcus Aurelius (Max)',
      location: 'FRISCO HQ',
      issued: '2025-02-10',
      due: '2025-02-24',
      total: '$145.00',
      paid: '$0.00',
      balance: '$145.00',
      bucket: 'CURRENT (1-30)',
      status: 'SENT // UNPAID',
    },
    {
      inv: 'INV-2025-0842',
      client: 'Sarah Jenkins (Bella & Luna)',
      location: 'PLANO WEST',
      issued: '2025-01-20',
      due: '2025-02-03',
      total: '$210.00',
      paid: '$50.00',
      balance: '$160.00',
      bucket: '31-60 DAYS',
      status: 'PAST DUE (21D)',
    },
    {
      inv: 'INV-2025-0799',
      client: 'David Vance (Thor - Giant Schnauzer)',
      location: 'FRISCO HQ',
      issued: '2024-12-18',
      due: '2025-01-01',
      total: '$180.00',
      paid: '$0.00',
      balance: '$180.00',
      bucket: '61-90 DAYS',
      status: 'DUNNING NOTICE 2',
    },
    {
      inv: 'INV-2025-0650',
      client: 'Elena Rostova (Zeus)',
      location: 'MOBILE VAN #1',
      issued: '2024-11-04',
      due: '2024-11-18',
      total: '$125.00',
      paid: '$0.00',
      balance: '$125.00',
      bucket: '90+ DAYS',
      status: 'COLLECTIONS HOLD',
    },
  ];

  const filteredInvoices = agingData.filter((i) => {
    const matchesLoc = locFilter === 'ALL' || i.location.includes(locFilter);
    const matchesSearch =
      !searchGrep ||
      i.inv.toLowerCase().includes(searchGrep.toLowerCase()) ||
      i.client.toLowerCase().includes(searchGrep.toLowerCase());
    return matchesLoc && matchesSearch;
  });

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
            <span className="tabular-nums text-[11px] uppercase tracking-wider text-foreground font-semibold">MODULE // REPORTS &amp; AR</span>
          </div>
          <nav className="flex items-center text-[13px] tabular-nums">
            {[
              { label: 'Overview', id: 'overview' },
              { label: 'Payments & Gateway', id: 'revenue-stripe' },
              { label: 'Tax & Entity', id: 'payments-tax' },
              { label: '■ Invoices & AR Aging', id: 'invoices-aging', active: true },
              { label: 'Services Matrix', id: 'services-pricing' },
              { label: 'System Audit', id: 'system-telemetry' },
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
              <span className="text-[9px] tabular-nums uppercase tracking-wider px-2 py-0.5 border border-border bg-primary text-primary-foreground font-semibold">
                SEC:07 // FINANCIAL REPORTING &amp; AGING
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground uppercase">
                ACCOUNTS RECEIVABLE // LEDGER DISPATCH // GAAP TAX BREAKDOWN
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-semibold uppercase tracking-tight font-sans text-foreground mt-1">
              Invoices, Accounts Receivable Aging &amp; Revenue Reports
            </h1>
            <p className="text-[13px] tabular-nums text-muted-foreground">
              Audit unpaid balances by aging bracket, trigger automated SMS/email payment dunning cascades, and export general ledger records.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 tabular-nums text-[13px]">
            <button
              onClick={() => showToast('NEW INVOICE GENERATOR OPEN')}
              className="h-8 px-3 bg-primary text-primary-foreground border border-border uppercase font-semibold hover:bg-muted cursor-pointer"
            >
              + Create Invoice
            </button>
            <button
              onClick={() => showToast('DUNNING SMS CASCADE DISPATCHED TO 4 ACCOUNTS')}
              className="h-8 px-3 bg-card text-foreground border border-border uppercase hover:bg-muted/40 cursor-pointer"
            >
              ⚡ Run Dunning Cascade
            </button>
            <button
              onClick={() => showToast('EXPORTING AR AGING LEDGER (.CSV)')}
              className="h-8 px-3 bg-card text-foreground border border-border uppercase hover:bg-muted/40 cursor-pointer"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* AGING BRACKET STAT CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-5 bg-black gap-px border-b border-border tabular-nums">
        <div className="bg-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase">
            <span>CURRENT (0-30D)</span>
            <span className="border border-border px-1 text-[9px] bg-muted/40">84%</span>
          </div>
          <div className="text-2xl font-semibold font-sans mt-2 text-foreground">$3,420.00</div>
          <div className="text-[10px] text-muted-foreground mt-1">18 INVOICES ACTIVE</div>
        </div>

        <div className="bg-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase">
            <span>31-60 DAYS</span>
            <span className="border border-border px-1 text-[9px] bg-muted/40">10%</span>
          </div>
          <div className="text-2xl font-semibold font-sans mt-2 text-foreground">$840.00</div>
          <div className="text-[10px] text-muted-foreground mt-1">4 INVOICES (FIRST DUNNING)</div>
        </div>

        <div className="bg-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase">
            <span>61-90 DAYS</span>
            <span className="border border-border px-1 text-[9px] bg-muted/40">4%</span>
          </div>
          <div className="text-2xl font-semibold font-sans mt-2 text-foreground">$360.00</div>
          <div className="text-[10px] text-muted-foreground mt-1">2 INVOICES (URGENT NOTICE)</div>
        </div>

        <div className="bg-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase">
            <span>90+ DAYS (DELINQUENT)</span>
            <span className="border border-border px-1 text-[9px] bg-primary text-primary-foreground font-semibold">CRITICAL</span>
          </div>
          <div className="text-2xl font-semibold font-sans mt-2 text-foreground">$250.00</div>
          <div className="text-[10px] text-muted-foreground mt-1">1 ACCOUNT ON HOLD</div>
        </div>

        <div className="bg-muted/40 p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-semibold">
            <span>TOTAL UNCOLLECTED AR</span>
            <span className="bg-primary text-primary-foreground px-1 text-[9px] font-semibold">TOTAL</span>
          </div>
          <div className="text-2xl font-semibold font-sans mt-2 text-foreground">$4,870.00</div>
          <div className="text-[10px] text-muted-foreground mt-1">COLLECTION EFFICIENCY: 96.8%</div>
        </div>
      </div>

      {/* FILTER CONTROLS STRIP */}
      <div className="p-3 bg-muted/30 border-b border-border flex flex-wrap items-center justify-between gap-3 tabular-nums text-[13px] select-none">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <span className="font-semibold text-foreground uppercase">SEARCH //</span>
          <input
            value={searchGrep}
            onChange={(e) => setSearchGrep(e.target.value)}
            className="w-full h-8 bg-card border border-border px-2 text-[13px] focus:outline-none"
            placeholder="Filter invoice # or client name..."
            type="text"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground uppercase text-[10px]">FACILITY:</span>
            <select
              value={locFilter}
              onChange={(e) => setLocFilter(e.target.value)}
              className="h-8 border border-border bg-card px-2 font-semibold focus:outline-none"
            >
              <option value="ALL">ALL LOCATIONS</option>
              <option value="FRISCO">FRISCO HQ</option>
              <option value="PLANO">PLANO WEST</option>
              <option value="MOBILE">MOBILE VAN #1</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground uppercase text-[10px]">BUCKET:</span>
            <select
              value={selectedRange}
              onChange={(e) => setSelectedRange(e.target.value)}
              className="h-8 border border-border bg-card px-2 font-semibold focus:outline-none"
            >
              <option value="ALL">ALL AGING BUCKETS</option>
              <option value="CURRENT">CURRENT (0-30)</option>
              <option value="PAST">PAST DUE (&gt;30D)</option>
            </select>
          </div>
        </div>
      </div>

      {/* AGING INVOICE TABLE */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse tabular-nums text-[13px]">
          <thead>
            <tr className="border-b border-border bg-muted/40 uppercase text-[10px] font-semibold text-foreground">
              <th className="p-3 border-r border-border">Invoice ID</th>
              <th className="p-3 border-r border-border min-w-[220px]">Client / Pet Name</th>
              <th className="p-3 border-r border-border">Salon Facility</th>
              <th className="p-3 border-r border-border">Issued</th>
              <th className="p-3 border-r border-border">Due Date</th>
              <th className="p-3 border-r border-border text-right">Total</th>
              <th className="p-3 border-r border-border text-right">Paid</th>
              <th className="p-3 border-r border-border text-right">Balance Due</th>
              <th className="p-3 border-r border-border text-center">Aging Bracket</th>
              <th className="p-3 border-r border-border text-center">Status</th>
              <th className="p-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {filteredInvoices.map((inv) => (
              <tr key={inv.inv} className="hover:bg-muted/30">
                <td className="p-3 border-r border-border font-semibold whitespace-nowrap">{inv.inv}</td>
                <td className="p-3 border-r border-border font-sans font-semibold text-foreground">{inv.client}</td>
                <td className="p-3 border-r border-border text-[11px]">{inv.location}</td>
                <td className="p-3 border-r border-border text-[11px] text-muted-foreground">{inv.issued}</td>
                <td className="p-3 border-r border-border text-[11px] text-muted-foreground">{inv.due}</td>
                <td className="p-3 border-r border-border text-right font-semibold font-sans">{inv.total}</td>
                <td className="p-3 border-r border-border text-right text-muted-foreground font-sans">{inv.paid}</td>
                <td className="p-3 border-r border-border text-right font-semibold text-foreground font-sans text-sm">{inv.balance}</td>
                <td className="p-3 border-r border-border text-center">
                  <span className="border border-border px-2 py-0.5 text-[9px] font-semibold bg-muted/40 uppercase">
                    {inv.bucket}
                  </span>
                </td>
                <td className="p-3 border-r border-border text-center">
                  <span className="px-2 py-0.5 bg-primary text-primary-foreground text-[9px] font-semibold uppercase">
                    {inv.status}
                  </span>
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button
                    onClick={() => showToast(`PAYMENT LINK DISPATCHED FOR ${inv.inv}`)}
                    className="px-2 py-1 border border-border text-[10px] uppercase font-semibold hover:bg-muted cursor-pointer"
                  >
                    SMS Link
                  </button>
                  <button
                    onClick={() => showToast(`CHARGING CARD ON FILE FOR ${inv.inv}`)}
                    className="ml-1 px-2 py-1 bg-primary text-primary-foreground border border-border text-[10px] uppercase font-semibold hover:bg-muted cursor-pointer"
                  >
                    Charge Card
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* REVENUE BREAKDOWN & TAX LEDGER */}
      <div className="grid grid-cols-1 lg:grid-cols-2 border-t border-border divide-y lg:divide-y-0 lg:divide-x divide-border tabular-nums text-[13px]">
        <div className="p-4 bg-card space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="font-semibold uppercase text-foreground">MONTH-TO-DATE REVENUE STREAM BREAKDOWN</span>
            <span className="text-[10px] text-muted-foreground">FEB 2025</span>
          </div>
          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between items-center p-2 bg-muted/30 border border-border">
              <span>Full Groom Services (Grooming Tiers)</span>
              <span className="font-semibold text-foreground font-sans">$24,190.00</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/30 border border-border">
              <span>Bath &amp; Brush (Hydro-Massage)</span>
              <span className="font-semibold text-foreground font-sans">$8,450.00</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/30 border border-border">
              <span>Spa Add-Ons (Facial, Teeth, Paw Wax)</span>
              <span className="font-semibold text-foreground font-sans">$4,120.00</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/30 border border-border">
              <span>Retail &amp; Boutique Merchandising</span>
              <span className="font-semibold text-foreground font-sans">$2,940.00</span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-card space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="font-semibold uppercase text-foreground">TEXAS COMPTROLLER SALES TAX LEDGER</span>
            <span className="text-[9px] bg-primary text-primary-foreground px-1.5 py-0.5 font-semibold">STATE + LOCAL (8.25%)</span>
          </div>
          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between items-center p-2 bg-muted/30 border border-border">
              <span>Gross Taxable Service Revenue</span>
              <span className="font-semibold text-foreground font-sans">$36,760.00</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/30 border border-border">
              <span>Taxable Retail Merchandise</span>
              <span className="font-semibold text-foreground font-sans">$2,940.00</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-primary text-primary-foreground border border-border font-semibold">
              <span>Accrued Sales Tax Remittance Due</span>
              <span className="text-sm font-sans">$3,275.25</span>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="border-t border-border bg-muted/40 p-3 flex items-center justify-between tabular-nums text-[13px]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-black"></span>
          <span className="font-semibold uppercase">FINANCIAL ENGINE: AUTOMATED RECONCILIATION COMPLETE</span>
        </div>
        <div className="text-muted-foreground text-[10px]">
          STRIPE SETTLEMENT CYCLE: DAILY BATCH 23:59 UTC
        </div>
      </div>
    </div>
  );
};
