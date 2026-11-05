'use client';

import React, { useState } from 'react';

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
  systemSettings?: any;
  saveSettingsToDb?: (updates: any) => Promise<boolean>;
}

export const OrgBrandIdentityScreen: React.FC<ScreenProps> = ({
  onNavigateScreen,
  systemSettings,
  saveSettingsToDb,
}) => {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [tagline, setTagline] = useState('');
  const [smsHeader, setSmsHeader] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [darkPreview, setDarkPreview] = useState(false);
  // Real counts for the header chips + replication panel — fetched from
  // the same live endpoints the Overview uses, never hardcoded.
  const [locNames, setLocNames] = useState<string[]>([]);
  const [staffCount, setStaffCount] = useState<number | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (systemSettings) {
      if (systemSettings.org_tagline) setTagline(systemSettings.org_tagline);
      if (systemSettings.org_logo_url) setLogoUrl(systemSettings.org_logo_url);
      if (systemSettings.org_receipt_footer) setReceiptFooter(systemSettings.org_receipt_footer);
      if (systemSettings.org_sms_header) setSmsHeader(systemSettings.org_sms_header);
      else if (systemSettings.org_business_name) setSmsHeader(`[${systemSettings.org_business_name.toUpperCase()}]`);
    }
  }, [systemSettings]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const loadCounts = React.useCallback(async () => {
    try {
      const [locRes, usersRes] = await Promise.all([
        fetch('/api/admin/locations?tenant_id=active', { cache: 'no-store' }),
        fetch('/api/admin/users'),
      ]);
      if (locRes.ok) {
        const d = await locRes.json();
        setLocNames((d.data || []).map((r: any) => r.name));
      }
      if (usersRes.ok) {
        const u = await usersRes.json();
        setStaffCount((u.admins?.length || 0) + (u.staff?.length || 0));
      }
    } catch {
      /* counts stay unknown (—) rather than invented */
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCounts();
  }, [loadCounts]);

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

      {/* SUB-NAV / PATH BANNER */}
      <div className="px-6 py-2 border-b border-border bg-muted/30 flex flex-wrap items-center justify-between text-[13px] tabular-nums gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">ADMIN SETTINGS</span>
          <span className="text-muted-foreground/70">&gt;&gt;</span>
          <span className="bg-primary text-primary-foreground px-2 py-0.5">ORGANIZATION &amp; MULTI-LOCATION MANAGEMENT</span>
          <span className="text-muted-foreground/70">{'//'}</span>
          <span className="border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase">
            RESTRICTED // ADMIN PERMISSION REQUIRED
          </span>
          <span className="text-muted-foreground/70">{'//'}</span>
          <span className="text-muted-foreground">STATION_ID: HQ-OPS-ROOT</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigateScreen?.('org-multiloc')}
            className="border border-border bg-card px-2.5 py-1 hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal font-semibold text-[13px] uppercase cursor-pointer"
          >
            + ADD NEW LOCATION
          </button>
          <button
            onClick={async () => {
              // Brand fields persist under their OWN settings keys — the
              // SMS header used to be written back into org_business_name,
              // silently renaming the business on every brand save.
              const ok = saveSettingsToDb
                ? await saveSettingsToDb({
                    org_tagline: tagline,
                    org_logo_url: logoUrl,
                    org_sms_header: smsHeader,
                    org_receipt_footer: receiptFooter,
                  })
                : false;
              showToast(ok ? 'BRAND SETTINGS SAVED' : 'SAVE NOT CONFIRMED BY THE SERVER — CHANGES ARE NOT PERSISTED');
            }}
            className="bg-primary text-primary-foreground px-3 py-1 hover:bg-muted font-semibold text-[13px] uppercase cursor-pointer"
          >
            [SAVE CONFIG CHANGES]
          </button>
        </div>
      </div>

      {/* PAGE TITLE & SUMMARY HEADER */}
      <div className="p-6 border-b border-border">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="text-[13px] tabular-nums uppercase text-muted-foreground tracking-wider">
              BUSINESS PROFILE // ENTITY STRUCTURE // MULTI-UNIT SYNC
            </div>
            <h2 className="text-2xl font-semibold uppercase tracking-tight mt-1 font-sans">
              ORGANIZATION, MULTI-LOCATION &amp; BRAND SETTINGS
            </h2>
            <p className="text-[13px] tabular-nums text-muted-foreground mt-1 max-w-3xl">
              Configure enterprise brand identities, manage multi-facility tax &amp; merchant bindings, configure physical salon operating hours, and govern global salon holidays across every location.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="border border-border p-2.5 bg-muted/30 text-right min-w-[120px]">
              <div className="text-[10px] tabular-nums text-muted-foreground uppercase">ACTIVE LOCATIONS</div>
              <div className="text-xl font-semibold tabular-nums">{locNames.length ? `${locNames.length} LOCATION${locNames.length === 1 ? '' : 'S'}` : '—'}</div>
            </div>
            <div className="border border-border p-2.5 bg-muted/30 text-right min-w-[120px]">
              <div className="text-[10px] tabular-nums text-muted-foreground uppercase">ACTIVE STAFF</div>
              <div className="text-xl font-semibold tabular-nums">{staffCount !== null ? `${staffCount} TEAM` : '—'}</div>
            </div>
            <div className="border border-border p-2.5 bg-muted/30 text-right min-w-[140px]">
              <div className="text-[10px] tabular-nums text-muted-foreground uppercase">ENTERPRISE ENTITY</div>
              <div className="text-sm font-semibold tabular-nums truncate">{systemSettings?.org_business_name || '—'}</div>
            </div>
          </div>
        </div>

        {/* OPERATIONS INNER TABS */}
        <div className="flex items-center gap-1 mt-6 border-b border-border -mb-6 overflow-x-auto">
          <button
            onClick={() => onNavigateScreen?.('org-multiloc')}
            className="px-4 py-2 bg-muted/40 hover:bg-muted text-foreground tabular-nums text-[13px] font-semibold border-t border-l border-r border-border uppercase whitespace-nowrap cursor-pointer"
          >
            LOCATIONS &amp; SALONS ({locNames.length})
          </button>
          <button
            className="px-4 py-2 bg-primary text-primary-foreground tabular-nums text-[13px] font-semibold border-t border-l border-r border-border uppercase whitespace-nowrap cursor-pointer"
          >
            ■ BRAND &amp; VISUAL IDENTITY
          </button>
          <button
            onClick={() => onNavigateScreen?.('booking-rules')}
            className="px-4 py-2 bg-muted/40 hover:bg-muted text-foreground tabular-nums text-[13px] font-semibold border-t border-l border-r border-border uppercase whitespace-nowrap cursor-pointer"
          >
            OPERATING &amp; HOLIDAY HOURS
          </button>
          <button
            onClick={() => onNavigateScreen?.('org-social')}
            className="px-4 py-2 bg-muted/40 hover:bg-muted text-foreground tabular-nums text-[13px] font-semibold border-t border-l border-r border-border uppercase whitespace-nowrap cursor-pointer"
          >
            SOCIAL LINKS &amp; DIRECTORIES
          </button>
          <button
            onClick={() => onNavigateScreen?.('payments-tax')}
            className="px-4 py-2 bg-muted/40 hover:bg-muted text-foreground tabular-nums text-[13px] font-semibold border-t border-l border-r border-border uppercase whitespace-nowrap cursor-pointer"
          >
            TAX &amp; LEGAL ENTITY
          </button>
        </div>
      </div>

      {/* MAIN CONFIGURATION GRID */}
      <div className="p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {/* SECTION A: CORE BRAND ASSETS & WORDMARK SPECS */}
          <div className="border-2-black p-5 bg-card space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="bg-primary text-primary-foreground px-2 py-0.5 tabular-nums text-[13px] font-semibold uppercase">SECTION A</span>
                <h3 className="font-semibold text-base uppercase tabular-nums">CORE BRAND ASSETS &amp; WORDMARK SPECS</h3>
              </div>
              <span className="text-[13px] tabular-nums text-muted-foreground">SPEC://ASSETS-V2.4</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Primary Logo Asset Card */}
              <div className="border border-border p-4 bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[13px] uppercase tabular-nums">PRIMARY LOGO MARK (VECTOR)</span>
                  <span className="bg-success/10 border border-border text-[10px] tabular-nums px-1.5 py-0.2 uppercase font-semibold">{logoUrl ? 'URL SET' : 'NOT SET'}</span>
                </div>
                <div className="border border-border p-4 bg-card flex items-center justify-center">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="Primary logo" className="max-h-20 object-contain" />
                  ) : (
                    <div className="w-20 h-20 bg-primary text-primary-foreground flex flex-col items-center justify-center font-semibold text-2xl tracking-tighter">
                      <span className="text-2xl">🐾</span>
                      <span className="text-[9px] tabular-nums tracking-wider mt-0.5">PORTAL</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1 text-[13px] tabular-nums">
                  <label className="text-muted-foreground uppercase text-[10px] block">LOGO IMAGE URL (SAVED AS org_logo_url)</label>
                  <input
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://…/logo.svg"
                    className="w-full border border-border p-2 font-semibold bg-card focus:outline-none text-[13px]"
                    type="url"
                  />
                  <div className="text-[10px] text-muted-foreground">The public site and booking wizard read the logo from this saved URL. File upload is not wired — host the asset and paste its URL.</div>
                </div>
                <div className="flex gap-2 pt-2 border-t border-border">
                  <button
                    onClick={() => { if (logoUrl) { navigator.clipboard.writeText(logoUrl); showToast('LOGO URL COPIED'); } else showToast('NO LOGO URL SET'); }}
                    className="flex-1 bg-primary text-primary-foreground py-1.5 text-[13px] tabular-nums font-semibold uppercase hover:bg-muted cursor-pointer"
                  >
                    [COPY LOGO URL]
                  </button>
                  <button
                    onClick={() => { if (logoUrl) window.open(logoUrl, '_blank'); else showToast('NO LOGO URL SET'); }}
                    className="border border-border px-3 py-1.5 text-[13px] tabular-nums font-semibold uppercase hover:bg-muted cursor-pointer"
                  >
                    OPEN
                  </button>
                </div>
              </div>

              {/* Secondary Horizontal Wordmark */}
              <div className="border border-border p-4 bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[13px] uppercase tabular-nums">SECONDARY HORIZONTAL WORDMARK</span>
                  <span className="border border-border bg-card text-[10px] tabular-nums px-1.5 py-0.2 uppercase font-semibold">PROD APPROVED</span>
                </div>
                <div className={`border border-border p-4 flex flex-col items-center justify-center space-y-2 ${darkPreview ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground'}`}>
                  <div className="text-lg font-semibold tracking-tight tabular-nums uppercase border-b border-border pb-1">{(systemSettings?.org_business_name || 'UNSAID MEMORIES').toUpperCase()}</div>
                  <div className={`text-[10px] tabular-nums tracking-wider ${darkPreview ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{tagline || 'BRAND TAGLINE APPEARS HERE'}</div>
                </div>
                <div className="space-y-1 text-[13px] tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-[10px] uppercase">EXPORT DIMENSIONS:</span>
                    <span className="font-semibold text-[11px]">1200 x 300 PX (4:1 RATIO)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-[10px] uppercase">VARIANTS COMPILED:</span>
                    <span className="text-[11px]">DARK MODE &amp; LIGHT MODE SVG</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-[10px] uppercase">TRACKING / KERNING:</span>
                    <span className="text-[11px]">-0.02EM // ALL-CAPS STRICT</span>
                  </div>
                </div>
                <div className="flex gap-2 pt-2 border-t border-border">
                  <button
                    onClick={() => setDarkPreview((v) => !v)}
                    className="flex-1 border border-border bg-card py-1.5 text-[13px] tabular-nums font-semibold uppercase hover:bg-muted cursor-pointer"
                  >
                    [PREVIEW {darkPreview ? 'LIGHT' : 'DARK'}]
                  </button>
                  <button
                    onClick={() => onNavigateScreen?.('business-profile')}
                    className="border border-border px-3 py-1.5 text-[13px] tabular-nums font-semibold uppercase hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal cursor-pointer"
                    title="The wordmark is the business name — edit it in Business Profile"
                  >
                    EDIT NAME
                  </button>
                </div>
              </div>
            </div>

            {/* Favicon, App Icon & Print Stamp Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border">
              <div className="border border-border p-3 bg-muted/30 flex items-center justify-between tabular-nums text-[13px]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 border border-border bg-card flex items-center justify-center font-semibold text-[13px] shadow-none">32px</div>
                  <div>
                    <div className="font-semibold text-[13px]">FAVICON &amp; APP TOUCH ICON</div>
                    <div className="text-[10px] text-muted-foreground">32x32 / 180x180 PWA ICON</div>
                  </div>
                </div>
                <span className="bg-primary text-primary-foreground text-[10px] px-2 py-0.5 font-semibold uppercase">SITE ASSET</span>
              </div>
              <div className="border border-border p-3 bg-muted/30 flex items-center justify-between tabular-nums text-[13px]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 border border-border bg-primary text-primary-foreground flex items-center justify-center font-semibold text-[13px]">STAMP</div>
                  <div>
                    <div className="font-semibold text-[13px]">WATERMARK &amp; PRINT STAMP</div>
                    <div className="text-[10px] text-muted-foreground">THERMAL RECEIPT &amp; PDF SEAL</div>
                  </div>
                </div>
                <span className="border border-border bg-card text-[10px] px-2 py-0.5 font-semibold uppercase">NOT CONFIGURED</span>
              </div>
            </div>
          </div>

          {/* SECTION B: DESIGN SYSTEM TOKENS & MONOCHROME SPECIFICATION */}
          <div className="border-2-black p-5 bg-card space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="bg-primary text-primary-foreground px-2 py-0.5 tabular-nums text-[13px] font-semibold uppercase">SECTION B</span>
                <h3 className="font-semibold text-base uppercase tabular-nums">DESIGN SYSTEM TOKENS &amp; MONOCHROME SPECIFICATION</h3>
              </div>
              <span className="text-[13px] tabular-nums text-muted-foreground">DAWG_CORE // REVISION 4</span>
            </div>

            {/* Color Tokens */}
            <div className="space-y-2">
              <div className="text-[13px] tabular-nums font-semibold uppercase tracking-wider text-muted-foreground">01 // SYSTEM PALETTE TOKENS</div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 tabular-nums text-[13px]">
                <div className="border border-border p-2 bg-primary text-primary-foreground">
                  <div className="text-[9px] text-muted-foreground/50 uppercase">PRIMARY</div>
                  <div className="font-semibold text-[13px] mt-1">#000000</div>
                  <div className="text-[9px] text-muted-foreground/70 mt-1">PITCH BLACK</div>
                </div>
                <div className="border border-border p-2 bg-card text-foreground">
                  <div className="text-[9px] text-muted-foreground uppercase">BG SURFACE</div>
                  <div className="font-semibold text-[13px] mt-1">#FFFFFF</div>
                  <div className="text-[9px] text-muted-foreground mt-1">STARK WHITE</div>
                </div>
                <div className="border border-border p-2 bg-muted/40 text-foreground">
                  <div className="text-[9px] text-muted-foreground uppercase">SURFACE DIM</div>
                  <div className="font-semibold text-[13px] mt-1">#F3F3F4</div>
                  <div className="text-[9px] text-muted-foreground mt-1">OFF-WHITE CONT</div>
                </div>
                <div className="border border-border p-2 bg-muted/30 text-foreground">
                  <div className="text-[9px] text-muted-foreground uppercase">BORDER RULE</div>
                  <div className="font-semibold text-[13px] mt-1">#E5E5E5 / 000</div>
                  <div className="text-[9px] text-muted-foreground mt-1">1PX SOLID</div>
                </div>
                <div className="border border-border p-2 bg-primary text-primary-foreground">
                  <div className="text-[9px] text-muted-foreground/50 uppercase">ACCENT / INVERSE</div>
                  <div className="font-semibold text-[13px] mt-1">INVERSE_FILL</div>
                  <div className="text-[9px] text-muted-foreground/70 mt-1">HIGH CONTRAST</div>
                </div>
              </div>
            </div>

            {/* Typography & Geometry Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-border">
              <div className="border border-border p-3 bg-muted/30 space-y-2">
                <div className="text-[13px] tabular-nums font-semibold uppercase">TYPOGRAPHY SYSTEM RULES</div>
                <div className="space-y-1 text-[13px] tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-[10px] uppercase">PRIMARY DISPLAY FONT:</span>
                    <span className="font-semibold text-[11px]">SPACE GROTESK</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-[10px] uppercase">DATA &amp; TABLES CODE FONT:</span>
                    <span className="font-semibold text-[11px]">JETBRAINS MONO</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-[10px] uppercase">BODY COPY SYSTEM FONT:</span>
                    <span className="font-semibold text-[11px]">INTER / CLEAN SANS</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-[10px] uppercase">TABULAR FIGURES NUMBERS:</span>
                    <span className="bg-primary text-primary-foreground text-[10px] px-1 font-semibold">[ENFORCED]</span>
                  </div>
                </div>
              </div>

              <div className="border border-border p-3 bg-muted/30 space-y-2">
                <div className="text-[13px] tabular-nums font-semibold uppercase">GEOMETRY &amp; BORDER RULES</div>
                <div className="space-y-1 text-[13px] tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-[10px] uppercase">CORNER RADIUS:</span>
                    <span className="font-semibold text-[11px]">0px [SHARP / SQUARE STRICT]</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-[10px] uppercase">DEFAULT BORDER WIDTH:</span>
                    <span className="font-semibold text-[11px]">1px UNIFORM BLACK RULE</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-[10px] uppercase">CONTAINER ACCENT BORDER:</span>
                    <span className="font-semibold text-[11px]">2px SOLID BLACK (.border-2-black)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-[10px] uppercase">SHADOW TOKEN:</span>
                    <span className="font-semibold text-[11px]">NONE (FLAT ARCHITECTURE)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMN 3: SECTION C DIGITAL & PHYSICAL TOUCHPOINTS */}
        <div className="space-y-6">
          <div className="border-2-black p-4 bg-card space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="flex items-center gap-2">
                <span className="bg-primary text-primary-foreground px-2 py-0.5 tabular-nums text-[10px] font-semibold uppercase">SECTION C</span>
                <h4 className="font-semibold text-[13px] uppercase tabular-nums tracking-wider">TOUCHPOINTS BRANDING</h4>
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground">OMNICHANNEL</span>
            </div>

            {/* Client Portal Theme */}
            <div className="space-y-2 tabular-nums text-[13px]">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground">01 // CLIENT BOOKING PORTAL THEME</div>
              <div>
                <label className="text-muted-foreground uppercase text-[10px] block mb-1">HEADER BRAND TAGLINE</label>
                <input
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="w-full border border-border p-2 font-semibold bg-muted/30 focus:bg-card focus:outline-none text-[13px]"
                  type="text"
                />
              </div>
              <div>
                <label className="text-muted-foreground uppercase text-[10px] block mb-1">CUSTOMER PORTAL HERO BANNER</label>
                <div className="border border-border p-2 bg-muted/30 flex items-center justify-between">
                  <span className="text-[13px]">Managed in the CMS booking wizard</span>
                  <button onClick={() => onNavigateScreen?.('cms-wizard')} className="border border-border px-2 py-0.5 text-[10px] uppercase font-semibold hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal cursor-pointer">CONFIGURE</button>
                </div>
              </div>
              <div>
                <label className="text-muted-foreground uppercase text-[10px] block mb-1">ACCENT PILL STYLING</label>
                <div className="flex items-center gap-2">
                  <span className="bg-primary text-primary-foreground px-2 py-1 text-[10px] font-semibold uppercase">SOLID BLACK PILL</span>
                  <span className="border border-border px-2 py-1 text-[10px] font-semibold uppercase">MONO OUTLINE</span>
                </div>
              </div>
            </div>

            {/* Automated Communications */}
            <div className="space-y-2 tabular-nums text-[13px] pt-3 border-t border-border">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground">02 // AUTOMATED COMMUNICATIONS HEADER</div>
              <div>
                <label className="text-muted-foreground uppercase text-[10px] block mb-1">SMS NOTIFICATION HEADER BADGE</label>
                <input
                  value={smsHeader}
                  onChange={(e) => setSmsHeader(e.target.value)}
                  className="w-full border border-border p-2 font-semibold bg-muted/30 focus:bg-card focus:outline-none text-[13px]"
                  type="text"
                />
              </div>
              <div>
                <label className="text-muted-foreground uppercase text-[10px] block mb-1">EMAIL HTML NOTIFICATION HEADER</label>
                <div className="border border-border p-2.5 bg-muted/30 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-[10px]">EMAIL HEADER TEMPLATE PREVIEW</span>
                    <span className="bg-primary text-primary-foreground text-[9px] px-1 py-0.2 font-semibold">PREVIEW</span>
                  </div>
                  <div className="border border-border bg-card p-2 text-center text-[13px] font-semibold tracking-wider uppercase">
                    🐾 UNSAID MEMORIES // CONFIRMATION NOTICE
                  </div>
                  <div className="text-[10px] text-muted-foreground">CUSTOM SENDER SIGNATURE: Concierge Team @ UnSaid Memories</div>
                </div>
              </div>
            </div>

            {/* Physical In-Salon Merchandising & POS Collateral */}
            <div className="space-y-2 tabular-nums text-[13px] pt-3 border-t border-border">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground">03 // PHYSICAL POS &amp; IN-SALON COLLATERAL</div>
              <div>
                <label className="text-muted-foreground uppercase text-[10px] block mb-1">THERMAL RECEIPT FOOTER TEXT</label>
                <textarea
                  value={receiptFooter}
                  onChange={(e) => setReceiptFooter(e.target.value)}
                  placeholder="Thank you for trusting us with your furry family!"
                  className="w-full border border-border p-2 bg-muted/30 focus:bg-card focus:outline-none text-[13px] tabular-nums"
                  rows={2}
                />
                <div className="text-[10px] text-muted-foreground">Saved as tenant brand config (org_receipt_footer). The POS receipt renderer does not consume this key yet.</div>
              </div>
              <div className="border border-border p-2.5 bg-muted/30 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="font-semibold text-[13px] uppercase">DOG COLLAR TAG BRANDING PRINT</div>
                  <div className="text-[10px] text-muted-foreground">DIRECT THERMAL PRINT TEMPLATE</div>
                </div>
                <span className="bg-primary text-primary-foreground text-[10px] px-2 py-0.5 font-semibold uppercase">NOT CONFIGURED</span>
              </div>
            </div>
          </div>

          {/* SYNC & AUDIT TRAIL MINI-PANEL — brand settings are stored per
              tenant and read by every surface from the settings store;
              there are no per-location brand copies to replicate. The list
              below is this tenant's real locations. */}
          <div className="border-2-black p-4 bg-muted/30 tabular-nums text-[13px] space-y-2">
            <div className="flex items-center justify-between border-b border-border pb-1.5">
              <span className="font-semibold text-[11px] uppercase">BRAND COVERAGE</span>
              <span className="bg-primary text-primary-foreground text-[9px] px-1 py-0.2 font-semibold">{locNames.length} LOCATION{locNames.length === 1 ? '' : 'S'}</span>
            </div>
            <div className="text-[10px] text-muted-foreground space-y-1">
              {locNames.length === 0 ? (
                <div>No locations on record for this tenant yet.</div>
              ) : (
                locNames.map((n) => (
                  <div key={n} className="flex justify-between"><span>{n.toUpperCase()}:</span><span className="font-semibold text-foreground">TENANT SETTINGS APPLY</span></div>
                ))
              )}
            </div>
            <div className="pt-2 border-t border-border flex gap-2">
              <button
                onClick={() => { loadCounts(); showToast('LOCATION LIST REFRESHED'); }}
                className="flex-1 bg-primary text-primary-foreground py-1 text-[13px] font-semibold uppercase hover:bg-muted cursor-pointer"
              >
                [REFRESH]
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM FOOTER BAR */}
      <div className="mt-auto -black bg-muted/30 px-6 py-2.5 flex flex-wrap items-center justify-between text-[13px] tabular-nums gap-2">
        <div className="flex items-center gap-4 text-muted-foreground">
          <span>Brand settings are stored per tenant in the settings store and served to the public site from there.</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">STORE: CMS_GLOBAL_CONTENT (LOCALE EN-US)</span>
        </div>
      </div>
    </div>
  );
};
