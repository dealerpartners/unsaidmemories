'use client';

import React, { useState } from 'react';

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
  systemSettings?: any;
  saveSettingsToDb?: (updates: any) => Promise<boolean>;
}

// Tax & Legal Entity — a READ surface over real stores:
//   • Legal identity comes from the tenant settings the Business
//     Profile screen writes (org_legal_name / org_address /
//     org_tax_ein). Editing happens there, not here.
//   • The tax table is acct_tax_rules via /api/admin/taxes/rules —
//     the same rules the POS register charges and Accounting → Taxes
//     manages. Nothing on this screen invents a rate, filing, policy,
//     or audit event; panels with no data source say so.

type TaxRule = {
  id: string;
  jurisdiction: string;
  tax_type: string;
  state_code: string;
  rate: number | string;
  classification: string | null;
  auto_calc: boolean;
};

export const PaymentsTaxLegalScreen: React.FC<ScreenProps> = ({
  onNavigateScreen,
  systemSettings,
}) => {
  const [locCount, setLocCount] = useState<number | null>(null);
  const [staffCount, setStaffCount] = useState<number | null>(null);
  const [taxRules, setTaxRules] = useState<TaxRule[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/admin/locations?tenant_id=active');
        if (r.ok) { const j = await r.json(); if (!cancelled) setLocCount((j.locations || []).length); }
      } catch { /* counts stay unknown → rendered as — */ }
      try {
        const r = await fetch('/api/admin/users');
        if (r.ok) { const j = await r.json(); if (!cancelled) setStaffCount((j.admins?.length || 0) + (j.staff?.length || 0)); }
      } catch { /* counts stay unknown → rendered as — */ }
      try {
        const r = await fetch('/api/admin/taxes/rules');
        if (r.ok) { const j = await r.json(); if (!cancelled) setTaxRules(j.rules || []); }
      } catch { if (!cancelled) setTaxRules([]); }
    })();
    return () => { cancelled = true; };
  }, []);

  const legalName = systemSettings?.org_legal_name || '';
  const businessName = systemSettings?.org_business_name || '';
  const einRaw = systemSettings?.org_tax_ein || '';
  // 'XX-XXXX789' is the shipped placeholder default in settings-types,
  // not a recorded EIN — treat it as unset.
  const ein = einRaw && einRaw !== 'XX-XXXX789' ? einRaw : '';
  const address = systemSettings?.org_address || '';

  return (
    <div className="w-full bg-card text-foreground font-sans antialiased text-[13px]">
      {/* SUB-NAV / PATH BANNER */}
      <div className="px-6 py-2 border-b border-border bg-muted/30 flex items-center justify-between text-[13px] tabular-nums">
        <div className="flex items-center gap-2">
          <span className="font-semibold">ADMIN SETTINGS</span>
          <span className="text-muted-foreground/70">&gt;&gt;</span>
          <span className="bg-primary text-primary-foreground px-2 py-0.5">ORGANIZATION &amp; MULTI-LOCATION MANAGEMENT</span>
          <span className="text-muted-foreground/70">{"//"}</span>
          <span className="border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase">RESTRICTED // ADMIN PERMISSION REQUIRED</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigateScreen?.('org-multiloc')}
            className="border border-border bg-card px-2.5 py-1 hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal font-semibold text-[13px] uppercase flex items-center gap-1.5 cursor-pointer"
          >
            <span>+ ADD NEW LOCATION</span>
          </button>
          <button
            onClick={() => onNavigateScreen?.('business-profile')}
            className="bg-primary text-primary-foreground px-3 py-1 hover:bg-muted font-semibold text-[13px] uppercase flex items-center gap-1.5 cursor-pointer"
          >
            <span>[EDIT IN BUSINESS PROFILE]</span>
          </button>
        </div>
      </div>

      {/* PAGE TITLE & SUMMARY HEADER */}
      <div className="p-6 border-b border-border">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="text-[13px] tabular-nums uppercase text-muted-foreground tracking-wider">BUSINESS PROFILE // ENTITY STRUCTURE // MULTI-UNIT SYNC</div>
            <h2 className="text-2xl font-semibold uppercase tracking-tight mt-1">ORGANIZATION, MULTI-LOCATION &amp; BRAND SETTINGS</h2>
            <p className="text-[13px] tabular-nums text-muted-foreground mt-1 max-w-3xl">
              Configure enterprise brand identities, manage multi-facility tax &amp; merchant bindings, configure physical salon operating hours, and govern global salon holidays across every location.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="border border-border p-2.5 bg-muted/30 text-right min-w-[120px]">
              <div className="text-[10px] tabular-nums text-muted-foreground uppercase">ACTIVE LOCATIONS</div>
              <div className="text-xl font-semibold tabular-nums">{locCount !== null ? `${locCount} LOCATION${locCount === 1 ? '' : 'S'}` : '—'}</div>
            </div>
            <div className="border border-border p-2.5 bg-muted/30 text-right min-w-[120px]">
              <div className="text-[10px] tabular-nums text-muted-foreground uppercase">ACTIVE STAFF</div>
              <div className="text-xl font-semibold tabular-nums">{staffCount !== null ? `${staffCount} TEAM` : '—'}</div>
            </div>
            <div className="border border-border p-2.5 bg-muted/30 text-right min-w-[140px]">
              <div className="text-[10px] tabular-nums text-muted-foreground uppercase">ENTERPRISE ENTITY</div>
              <div className="text-sm font-semibold tabular-nums truncate">{businessName || '—'}</div>
            </div>
          </div>
        </div>

        {/* OPERATIONS INNER TABS */}
        <div className="flex items-center gap-1 mt-6 border-b border-border -mb-6">
          <button onClick={() => onNavigateScreen?.('org-multiloc')} className="px-4 py-2 bg-muted/40 hover:bg-muted text-foreground tabular-nums text-[13px] font-semibold border-t border-l border-r border-border uppercase cursor-pointer">
            LOCATIONS &amp; SALONS ({locCount ?? '—'})
          </button>
          <button onClick={() => onNavigateScreen?.('org-brand')} className="px-4 py-2 bg-muted/40 hover:bg-muted text-foreground tabular-nums text-[13px] font-semibold border-t border-l border-r border-border uppercase cursor-pointer">
            BRAND &amp; VISUAL IDENTITY
          </button>
          <button onClick={() => onNavigateScreen?.('booking-rules')} className="px-4 py-2 bg-muted/40 hover:bg-muted text-foreground tabular-nums text-[13px] font-semibold border-t border-l border-r border-border uppercase cursor-pointer">
            OPERATING &amp; HOLIDAY HOURS
          </button>
          <button onClick={() => {}} className="px-4 py-2 bg-primary text-primary-foreground tabular-nums text-[13px] font-semibold border-t border-l border-r border-border uppercase cursor-pointer">
            ■ TAX &amp; LEGAL ENTITY
          </button>
        </div>
      </div>

      {/* MAIN CONFIGURATION GRID */}
      <div className="p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* COLUMN 1 & 2 */}
        <div className="xl:col-span-2 space-y-6">
          {/* SECTION A */}
          <div className="border-2 border-border p-5 bg-card">
            <div className="flex items-start justify-between border-b border-border pb-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 bg-primary text-primary-foreground tabular-nums font-semibold flex items-center justify-center text-[13px]">A</div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base uppercase">SECTION A: CORPORATE LEGAL ENTITY &amp; REGISTRATION</h3>
                    <span className="bg-primary text-primary-foreground tabular-nums text-[10px] px-1.5 py-0.2 font-semibold uppercase">{legalName ? 'ON FILE' : 'NOT SET'}</span>
                  </div>
                  <div className="text-[13px] tabular-nums text-muted-foreground">VALUES COME FROM BUSINESS PROFILE — EDIT THEM THERE</div>
                </div>
              </div>
              <button onClick={() => onNavigateScreen?.('business-profile')} className="bg-primary text-primary-foreground px-2 py-1 text-[13px] tabular-nums font-semibold hover:bg-muted uppercase cursor-pointer">[EDIT FILING]</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[13px] tabular-nums">
              <div className="space-y-1">
                <span className="text-muted-foreground uppercase text-[10px] block">LEGAL BUSINESS NAME</span>
                <p className="font-semibold text-sm">{legalName || '—'}</p>
                <p className="text-muted-foreground">{businessName ? `dba ${businessName}` : ''}</p>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground uppercase text-[10px] block">FEDERAL TAX IDENTIFIER (EIN)</span>
                <p className="font-semibold text-sm">{ein || '—'}</p>
                <p className="text-muted-foreground">{ein ? 'As recorded in Business Profile' : 'Not recorded yet — add it in Business Profile'}</p>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground uppercase text-[10px] block">REGISTERED ADDRESS</span>
                <p className="font-semibold">{address || '—'}</p>
                <p className="text-muted-foreground">{address ? '' : 'No address recorded in Business Profile'}</p>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground uppercase text-[10px] block">TIMEZONE</span>
                <p className="font-semibold">{systemSettings?.org_timezone || '—'}</p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border bg-muted/30 p-3 tabular-nums text-[13px]">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold uppercase text-[11px] flex items-center gap-2">
                  <span className="w-2 h-2 bg-black inline-block"></span>
                  INSURANCE
                </span>
                <span className="border border-border bg-card text-[9px] px-1.5 py-0.5 font-semibold uppercase">NOT TRACKED</span>
              </div>
              <p className="text-muted-foreground text-[11px]">
                Insurance policies and certificates are not tracked in this app yet — no policy numbers,
                coverage limits, or expirations are recorded here.
              </p>
            </div>
          </div>

          {/* SECTION B */}
          <div className="border-2 border-border p-5 bg-card">
            <div className="flex items-start justify-between border-b border-border pb-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 bg-primary text-primary-foreground tabular-nums font-semibold flex items-center justify-center text-[13px]">B</div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base uppercase">SECTION B: SALES TAX RULES</h3>
                    <span className="border border-border tabular-nums text-[10px] px-1.5 py-0.2 uppercase bg-muted/40">ACCT_TAX_RULES</span>
                  </div>
                  <div className="text-[13px] tabular-nums text-muted-foreground">THE SAME RULES THE POS REGISTER CHARGES — MANAGED IN ACCOUNTING → TAXES</div>
                </div>
              </div>
              <a href="/admin/taxes" className="border border-border px-2 py-1 text-[13px] tabular-nums font-semibold hover:bg-muted/40 uppercase cursor-pointer">[OPEN TAXES]</a>
            </div>

            <div className="mb-4">
              <div className="text-[13px] tabular-nums uppercase text-muted-foreground mb-2 font-semibold">ACTIVE TAX RULES FOR THIS TENANT</div>
              <div className="border border-border divide-y divide-border tabular-nums text-[13px]">
                <div className="p-2.5 bg-muted/40 font-semibold grid grid-cols-12 gap-2 text-[10px] uppercase">
                  <div className="col-span-4">JURISDICTION</div>
                  <div className="col-span-3">TYPE / CLASSIFICATION</div>
                  <div className="col-span-2 text-right">STATE</div>
                  <div className="col-span-3 text-right">RATE</div>
                </div>
                {taxRules === null ? (
                  <div className="p-2.5 bg-card text-muted-foreground">Loading tax rules…</div>
                ) : taxRules.length === 0 ? (
                  <div className="p-2.5 bg-card text-muted-foreground">No active tax rules configured — the register charges no tax until rules exist.</div>
                ) : (
                  taxRules.map((r) => (
                    <div key={r.id} className="p-2.5 bg-card grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4 font-semibold">{r.jurisdiction}</div>
                      <div className="col-span-3 text-muted-foreground">{r.tax_type}{r.classification ? ` · ${r.classification}` : ''}</div>
                      <div className="col-span-2 text-right">{r.state_code}</div>
                      <div className="col-span-3 text-right font-semibold">{Number(r.rate)}%{r.auto_calc ? '' : ' (manual)'}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="border border-border p-3 bg-muted/30 tabular-nums text-[13px]">
              <div className="font-semibold uppercase text-[11px] mb-2">HOW TAXABILITY IS DECIDED</div>
              <p className="text-muted-foreground text-[11px]">
                Each rule carries a classification (for example goods vs services). The register applies the
                rules whose classification matches the sale line — there are no per-screen exemption overrides.
                Change rates or classifications in Accounting → Taxes.
              </p>
            </div>
          </div>

          {/* SECTION C */}
          <div className="border-2 border-border p-5 bg-card">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 bg-primary text-primary-foreground tabular-nums font-semibold flex items-center justify-center text-[13px]">C</div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base uppercase">SECTION C: WAIVERS &amp; VACCINE ENFORCEMENT</h3>
                  </div>
                  <div className="text-[13px] tabular-nums text-muted-foreground">CAPTURED AT BOOKING AND CHECK-IN</div>
                </div>
              </div>
            </div>

            <div className="space-y-3 tabular-nums text-[13px]">
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Signed intake documents and vaccination records are stored against the customer&apos;s profile
                (the customer-documents store and CRM vaccination records) when they are collected. This screen
                does not hold waiver versions or retention policies of its own — document requirements are set
                in Booking Rules &amp; Policies.
              </p>
              <button onClick={() => onNavigateScreen?.('booking-rules')} className="bg-primary text-primary-foreground px-3 py-1 text-[13px] tabular-nums font-semibold hover:bg-muted uppercase cursor-pointer">[OPEN BOOKING RULES]</button>
            </div>
          </div>
        </div>

        {/* COLUMN 3 */}
        <div className="space-y-6">
          {/* Tax Calendar */}
          <div className="border-2 border-border p-4 bg-card">
            <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
              <h4 className="font-semibold text-[13px] uppercase tabular-nums tracking-wider">TAX FILING CALENDAR</h4>
              <span className="text-[10px] tabular-nums bg-muted/40 border border-border px-1">NOT TRACKED</span>
            </div>
            <p className="text-[13px] tabular-nums text-muted-foreground">
              Filings and due dates are not tracked on this screen. Tax reports and filing figures live in
              Accounting → Taxes and Reports.
            </p>
            <a href="/admin/taxes" className="mt-3 w-full border border-border py-2 text-[13px] tabular-nums uppercase font-semibold hover:bg-muted flex items-center justify-center cursor-pointer">[OPEN TAXES]</a>
          </div>

          {/* Audit & Compliance */}
          <div className="border-2 border-border p-4 bg-card">
            <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
              <h4 className="font-semibold text-[13px] uppercase tabular-nums tracking-wider">AUDIT LOG &amp; COMPLIANCE</h4>
              <span className="text-[10px] tabular-nums text-muted-foreground">IMMUTABLE</span>
            </div>
            <p className="text-[13px] tabular-nums text-muted-foreground">
              Settings and system changes are written to the platform audit log. The live activity stream is
              on the System Health &amp; Telemetry screen.
            </p>
            <button onClick={() => onNavigateScreen?.('system-telemetry')} className="mt-3 w-full bg-primary text-primary-foreground py-2 text-[13px] tabular-nums uppercase font-semibold hover:bg-muted cursor-pointer">[VIEW SYSTEM HEALTH]</button>
          </div>

          {/* Export Dossier */}
          <div className="border-2 border-border p-4 bg-muted/30">
            <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
              <h4 className="font-semibold text-[13px] uppercase tabular-nums tracking-wider">EXPORT LEGAL DOSSIER</h4>
              <span className="text-[10px] tabular-nums text-muted-foreground">NOT AVAILABLE</span>
            </div>
            <p className="text-[13px] tabular-nums text-muted-foreground mb-3">There is no legal-dossier export in the app yet — corporate documents are not stored here to bundle.</p>
            <button
              disabled
              className="w-full bg-muted text-muted-foreground py-2 text-[13px] tabular-nums uppercase font-semibold cursor-not-allowed"
            >
              [DOWNLOAD LEGAL BINDER .ZIP]
            </button>
          </div>
        </div>

      </div>

      {/* BOTTOM FOOTER BAR */}
      <div className="mt-auto border-border bg-muted/30 px-6 py-2.5 flex items-center justify-between text-[13px] tabular-nums">
        <div className="flex items-center gap-4 text-muted-foreground">
          <span>Legal identity is stored per tenant in the settings store; tax rates live in acct_tax_rules.</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">SOURCES: CMS_GLOBAL_CONTENT · ACCT_TAX_RULES</span>
        </div>
      </div>
    </div>
  );
};
