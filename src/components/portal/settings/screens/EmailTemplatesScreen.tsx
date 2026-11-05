'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Mail,
  Copy,
  Check,
  Send,
  Monitor,
  Smartphone,
  RefreshCw,
  AlertTriangle,
  ClipboardPaste,
  Search,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// EMAIL TEMPLATE STUDIO — every email UnSaid Memories sends, one branded
// design. Browses the /api/admin/email-templates catalog (35 templates,
// 8 groups), previews each one pixel-perfect in a sandboxed iframe
// (desktop 600px / mobile 375px), copies the HTML + subject for pasting
// into the Supabase dashboard, and test-sends the Resend-channel
// templates through the real production pipeline.
//
// Design language: the settings screens' DAWG-OS chrome (tabular-nums
// micro-labels, bordered panels, muted section headers) rendered in the
// email brand palette itself — cream / gold / ink — so the studio echoes
// the design system it is showcasing.
// ---------------------------------------------------------------------------

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
}

type TemplateChannel = 'supabase' | 'resend';

interface CatalogGroup {
  id: string;
  label: string;
  description: string;
}

interface CatalogTemplate {
  id: string;
  name: string;
  group: string;
  channel: TemplateChannel;
  description: string;
  subject: string;
  html: string;
  /** Same-origin asset URLs — what the preview iframe renders (paw logo
   *  loads on any origin the admin runs on; `html` keeps absolute URLs
   *  for copying into Supabase / sending). */
  previewHtml?: string;
  supabasePath?: string;
  notes?: string[];
  wired?: string;
}

interface Catalog {
  groups: CatalogGroup[];
  templates: CatalogTemplate[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- Clipboard with fallback -------------------------------------------------
// navigator.clipboard is blocked in some browsers / insecure frames — fall
// back to the classic hidden-textarea + execCommand("copy") dance.

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// --- Small presentational helpers --------------------------------------------

function StatusBadge({ t }: { t: CatalogTemplate }) {
  if (t.channel === 'supabase') {
    return (
      <span className="shrink-0 inline-flex items-center text-[8px] uppercase font-bold tracking-wide px-1.5 py-0.5 border border-gold/40 bg-gold/10 text-gold-deep rounded-sm">
        Supabase
      </span>
    );
  }
  if (t.wired) {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 text-[8px] uppercase font-bold tracking-wide px-1.5 py-0.5 border border-success/30 bg-success/10 text-success rounded-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
        Live
      </span>
    );
  }
  return (
    <span className="shrink-0 inline-flex items-center text-[8px] uppercase font-bold tracking-wide px-1.5 py-0.5 border border-border bg-muted text-muted-foreground rounded-sm">
      Ready
    </span>
  );
}

export const EmailTemplatesScreen: React.FC<ScreenProps> = ({
  onNavigateScreen,
  selectedLocation,
}) => {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [copiedKind, setCopiedKind] = useState<'html' | 'subject' | null>(null);
  const [testTo, setTestTo] = useState('');
  const [sending, setSending] = useState(false);
  const [sentMessageId, setSentMessageId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // ---- Catalog load ----------------------------------------------------------

  useEffect(() => {
    let alive = true;
    setCatalog(null);
    setError(null);
    fetch('/api/admin/email-templates')
      .then(async (r) => {
        if (r.ok) return r.json();
        const body = await r.json().catch(() => null);
        if (r.status === 401) {
          throw new Error('Admin sign-in required — sign in to the CRM as an admin, then retry.');
        }
        throw new Error(body?.error || `Failed to load the template catalog (HTTP ${r.status}).`);
      })
      .then((data: Catalog) => {
        if (!alive) return;
        if (!data || !Array.isArray(data.templates) || !Array.isArray(data.groups)) {
          setError('The catalog response was malformed. Retry in a moment.');
          return;
        }
        setCatalog(data);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Failed to load the template catalog.');
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  // Default selection — lead with the flagship live template so the first
  // impression is a fully wired, production email.
  useEffect(() => {
    if (catalog && !selectedId) {
      const preferred =
        catalog.templates.find((t) => t.id === 'booking_confirmed') ?? catalog.templates[0];
      setSelectedId(preferred ? preferred.id : null);
    }
  }, [catalog, selectedId]);

  // Per-template send state resets.
  useEffect(() => {
    setSentMessageId(null);
    setSendError(null);
  }, [selectedId]);

  const selected = useMemo(
    () => catalog?.templates.find((t) => t.id === selectedId) ?? null,
    [catalog, selectedId]
  );
  const selectedGroup = useMemo(
    () => catalog?.groups.find((g) => g.id === selected?.group) ?? null,
    [catalog, selected?.group]
  );

  const grouped = useMemo(() => {
    if (!catalog) return [];
    const q = filter.trim().toLowerCase();
    const matches = q
      ? catalog.templates.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.subject.toLowerCase().includes(q) ||
            t.id.toLowerCase().includes(q)
        )
      : catalog.templates;
    return catalog.groups
      .map((g) => ({ group: g, items: matches.filter((t) => t.group === g.id) }))
      .filter((entry) => entry.items.length > 0);
  }, [catalog, filter]);

  const visibleCount = useMemo(
    () => grouped.reduce((n, g) => n + g.items.length, 0),
    [grouped]
  );
  const supabaseCount = useMemo(
    () => catalog?.templates.filter((t) => t.channel === 'supabase').length ?? 0,
    [catalog]
  );
  const resendCount = useMemo(
    () => catalog?.templates.filter((t) => t.channel === 'resend').length ?? 0,
    [catalog]
  );

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 3200);
  };

  // ---- Copy actions ----------------------------------------------------------

  const handleCopy = async (kind: 'html' | 'subject') => {
    if (!selected) return;
    const text = kind === 'html' ? selected.html : selected.subject;
    const ok = await copyText(text);
    if (!ok) {
      showToast('CLIPBOARD BLOCKED BY THE BROWSER — TRY AGAIN OR COPY MANUALLY');
      return;
    }
    setCopiedKind(kind);
    window.setTimeout(() => setCopiedKind(null), 2000);
    if (kind === 'html') {
      showToast(
        selected.channel === 'supabase'
          ? 'HTML COPIED — PASTE INTO THE SUPABASE MESSAGE BODY'
          : 'FULL EMAIL HTML COPIED TO CLIPBOARD'
      );
    }
  };

  // ---- Test send (Resend channel only) ---------------------------------------

  const sendTest = async () => {
    if (!selected || selected.channel !== 'resend' || sending) return;
    const to = testTo.trim();
    if (!EMAIL_RE.test(to)) {
      setSendError('Enter a valid recipient email address first.');
      return;
    }
    setSending(true);
    setSendError(null);
    setSentMessageId(null);
    try {
      const res = await fetch('/api/admin/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selected.id, to }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Send failed (HTTP ${res.status}).`);
      }
      setSentMessageId(String(data?.messageId || ''));
      showToast('TEST EMAIL SENT — CHECK THE INBOX');
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Send failed.');
    } finally {
      setSending(false);
    }
  };

  const retry = () => {
    setCatalog(null);
    setError(null);
    setSelectedId(null);
    setReloadKey((k) => k + 1);
  };

  // ---- Early states ----------------------------------------------------------

  if (error) {
    return (
      <div className="w-full bg-card text-foreground font-sans antialiased text-[13px]">
        <div className="max-w-xl mx-auto my-16 p-6 border border-destructive/30 bg-destructive/5 flex flex-col items-center gap-4 text-center">
          <AlertTriangle className="size-6 text-destructive" />
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-destructive">
              Email Template Studio — catalog unavailable
            </div>
            <p className="text-[13px] text-muted-foreground">{error}</p>
          </div>
          <button
            onClick={retry}
            className="h-9 px-4 bg-card text-brand-teal border border-border text-[11px] font-semibold uppercase tracking-wider hover:border-brand-teal/60 hover:bg-brand-teal/5 transition-colors inline-flex items-center gap-2 cursor-pointer rounded-lg"
          >
            <RefreshCw className="size-3.5" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="w-full bg-card text-foreground font-sans antialiased text-[13px]">
        <div className="py-24 flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <div className="size-9 rounded-full border-2 border-gold/30 border-t-gold-deep animate-spin" />
          <span className="text-[11px] uppercase tracking-wider font-semibold">
            Loading the email template catalog…
          </span>
          <span className="text-[11px] tabular-nums">35 templates · 8 groups · one brand</span>
        </div>
      </div>
    );
  }

  const previewWidth = viewport === 'mobile' ? 375 : 600;
  const htmlKb = selected ? (selected.html.length / 1024).toFixed(1) : '0';

  // ---- Studio -----------------------------------------------------------------

  return (
    <div className="w-full bg-card text-foreground font-sans antialiased text-[13px]">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-4 right-4 bg-ink text-cream px-4 py-3 border border-gold/40 z-50 flex items-center gap-3 tabular-nums text-[13px] shadow-2xl">
          <span className="w-2 h-2 bg-gold animate-pulse" />
          <span className="uppercase font-semibold tracking-wider">{toastMsg}</span>
          <button
            onClick={() => setToastMsg(null)}
            className="ml-2 text-cream hover:opacity-70 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Sub-Navigation Strip */}
      <div className="w-full bg-muted/40 border-b border-border overflow-x-auto select-none">
        <div className="flex items-stretch min-w-max text-[11px] tabular-nums">
          <button
            onClick={() => onNavigateScreen?.('overview')}
            className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer"
          >
            01 OVERVIEW
          </button>
          <button
            onClick={() => onNavigateScreen?.('cms-wizard')}
            className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer"
          >
            02 CMS &amp; WEBSITE
          </button>
          <button
            onClick={() => onNavigateScreen?.('users-staff')}
            className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer"
          >
            03 USERS &amp; ACCESS
          </button>
          <button
            onClick={() => onNavigateScreen?.('customer-portal')}
            className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer"
          >
            04 CUSTOMER PORTAL
          </button>
          <div className="px-4 py-2 bg-ink text-cream border-r border-border flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-gold inline-block" />
            <span>05 EMAIL TEMPLATES</span>
            <span className="text-[9px] px-1 bg-gold text-ink uppercase font-semibold ml-1">
              [ACTIVE]
            </span>
          </div>
          <button
            onClick={() => onNavigateScreen?.('analytics-reporting')}
            className="px-4 py-2 border-r border-border/20 hover:bg-card text-muted-foreground cursor-pointer"
          >
            06 ANALYTICS &amp; REPORTING
          </button>
          <button
            onClick={() => onNavigateScreen?.('system-telemetry')}
            className="px-4 py-2 text-muted-foreground hover:bg-card cursor-pointer"
          >
            07 SYSTEM HEALTH
          </button>
        </div>
      </div>

      {/* Command Control & Header Bar */}
      <div className="w-full bg-card border-b border-border p-4 flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="tabular-nums text-[11px] text-gold-deep font-semibold">
              SEC:4.2 // COMMUNICATIONS &amp; EMAIL // ADMIN SETTINGS
            </span>
            <span className="text-[9px] tabular-nums px-1.5 py-0.5 border border-gold/40 text-gold-deep bg-gold/10 uppercase">
              NODE:MAIL-STUDIO
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight uppercase text-ink font-sans">
            Email Template Studio
          </h1>
          <p className="text-[12px] text-muted-foreground max-w-2xl leading-relaxed">
            Every email UnSaid Memories sends — one branded design. Preview each template on desktop
            or mobile, copy the HTML + subject for the Supabase dashboard, and send test emails
            through the live pipeline.
          </p>
        </div>

        {/* Catalog stat chips */}
        <div className="flex flex-wrap items-center gap-2 tabular-nums">
          <span className="inline-flex items-center gap-1.5 border border-border bg-muted/40 px-2.5 py-1.5 text-[10px] uppercase font-semibold text-foreground">
            <Mail className="size-3 text-gold-deep" />
            {catalog.templates.length} Templates
          </span>
          <span className="inline-flex items-center gap-1.5 border border-gold/40 bg-gold/10 px-2.5 py-1.5 text-[10px] uppercase font-semibold text-gold-deep">
            <ClipboardPaste className="size-3" />
            {supabaseCount} Supabase paste-in
          </span>
          <span className="inline-flex items-center gap-1.5 border border-success/30 bg-success/10 px-2.5 py-1.5 text-[10px] uppercase font-semibold text-success">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            {resendCount} Live pipeline
          </span>
        </div>
      </div>

      {/* STUDIO WORKSPACE: catalog sidebar + detail pane */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12">
        {/* LEFT — Template catalog */}
        <aside className="lg:col-span-4 xl:col-span-3 bg-card border-b lg:border-b-0 lg:border-r border-border flex flex-col">
          <div className="p-3 border-b border-border bg-muted/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Template Catalog
              </span>
              <span className="text-[9px] tabular-nums text-muted-foreground">
                {visibleCount}/{catalog.templates.length}
              </span>
            </div>
            <div className="relative">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter templates…"
                className="w-full pl-8 pr-3 h-8 bg-card border border-input rounded-lg text-[12px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Grouped list — scrolls independently; scrollbar is the
              .portal-theme styled one (thin, rounded, muted). */}
          <div className="max-h-[420px] md:max-h-[520px] lg:max-h-[720px] overflow-y-auto p-2 space-y-4">
            {grouped.length === 0 && (
              <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">
                No templates match “{filter.trim()}”.
              </div>
            )}
            {grouped.map(({ group, items }) => (
              <div key={group.id} className="space-y-1">
                <div className="px-1.5 pb-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground leading-snug">
                    {group.label}
                  </span>
                  <span className="text-[9px] tabular-nums text-muted-foreground/70 shrink-0">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-1">
                  {items.map((t) => {
                    const isActive = t.id === selectedId;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setSelectedId(t.id)}
                        title={`${t.name} — ${t.subject}`}
                        className={`w-full text-left px-2.5 py-2 border rounded-lg flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-gold/15 border-gold/40'
                            : 'border-transparent hover:bg-muted/40 hover:border-border'
                        }`}
                      >
                        <span
                          className={`truncate text-[12.5px] ${
                            isActive
                              ? 'text-gold-deep font-semibold'
                              : 'text-foreground font-medium'
                          }`}
                        >
                          {t.name}
                        </span>
                        <StatusBadge t={t} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-border flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground font-medium">Active Branch:</span>
            <span className="font-semibold text-foreground truncate max-w-[140px]">
              {selectedLocation || '—'}
            </span>
          </div>
        </aside>

        {/* RIGHT — Detail pane */}
        <section className="lg:col-span-8 xl:col-span-9 bg-card min-w-0 flex flex-col">
          {!selected ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Mail className="size-6 text-gold/50" />
              <span className="text-[11px] uppercase tracking-wider font-semibold">
                Select a template from the catalog
              </span>
            </div>
          ) : (
            <>
              {/* Template header */}
              <div className="px-4 py-3 border-b border-border bg-card flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-semibold tracking-tight text-ink truncate">
                      {selected.name}
                    </h2>
                    <span
                      className={`inline-flex items-center text-[9px] uppercase font-bold tracking-wide px-1.5 py-0.5 border rounded-sm ${
                        selected.channel === 'supabase'
                          ? 'border-gold/40 bg-gold/10 text-gold-deep'
                          : 'border-ink bg-ink text-cream'
                      }`}
                    >
                      {selected.channel === 'supabase' ? 'Supabase paste-in' : 'Resend pipeline'}
                    </span>
                    {selected.channel === 'resend' && (
                      <span
                        className={`inline-flex items-center gap-1 text-[9px] uppercase font-bold tracking-wide px-1.5 py-0.5 border rounded-sm ${
                          selected.wired
                            ? 'border-success/30 bg-success/10 text-success'
                            : 'border-border bg-muted text-muted-foreground'
                        }`}
                      >
                        {selected.wired && (
                          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                        )}
                        {selected.wired ? 'Live' : 'Ready'}
                      </span>
                    )}
                    {selectedGroup && (
                      <span className="inline-flex items-center text-[9px] uppercase font-bold tracking-wide px-1.5 py-0.5 border border-gold/25 bg-cream text-gold-deep rounded-sm">
                        {selectedGroup.label}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-muted-foreground max-w-3xl leading-relaxed">
                    {selected.description}
                  </p>
                </div>
                <span className="shrink-0 text-[9px] tabular-nums px-1.5 py-0.5 border border-border bg-muted/40 text-muted-foreground">
                  ID: {selected.id}
                </span>
              </div>

              {/* Subject row + preview toolbar */}
              <div className="px-4 py-3 border-b border-border bg-card space-y-3">
                <div>
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 flex items-center gap-1.5">
                    <Mail className="size-3" />
                    Subject line
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex-1 min-w-[240px] bg-cream border border-gold/25 px-3 py-2 text-[13px] font-medium text-ink truncate rounded-lg">
                      {selected.subject}
                    </div>
                    <button
                      onClick={() => handleCopy('subject')}
                      className={`h-9 px-3 border text-[10px] font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer rounded-lg transition-colors ${
                        copiedKind === 'subject'
                          ? 'bg-success/10 border-success/40 text-success'
                          : 'bg-card border-border text-foreground hover:bg-muted/40'
                      }`}
                    >
                      {copiedKind === 'subject' ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                      {copiedKind === 'subject' ? 'Copied' : 'Copy subject'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                      Preview
                    </span>
                    <div className="flex items-center border border-border rounded-lg overflow-hidden">
                      <button
                        onClick={() => setViewport('desktop')}
                        className={`h-8 px-3 text-[10px] font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                          viewport === 'desktop'
                            ? 'bg-brand-teal/10 text-brand-teal'
                            : 'bg-card text-muted-foreground hover:bg-muted/40'
                        }`}
                      >
                        <Monitor className="size-3.5" />
                        Desktop
                      </button>
                      <button
                        onClick={() => setViewport('mobile')}
                        className={`h-8 px-3 text-[10px] font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer border-l border-border transition-colors ${
                          viewport === 'mobile'
                            ? 'bg-brand-teal/10 text-brand-teal'
                            : 'bg-card text-muted-foreground hover:bg-muted/40'
                        }`}
                      >
                        <Smartphone className="size-3.5" />
                        Mobile
                      </button>
                    </div>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {previewWidth} px
                    </span>
                  </div>

                  <button
                    onClick={() => handleCopy('html')}
                    className={`h-9 px-4 border text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer rounded-lg transition-colors ${
                      copiedKind === 'html'
                        ? 'bg-success text-white border-success'
                        : 'bg-card text-brand-teal border-border hover:border-brand-teal/60 hover:bg-brand-teal/5'
                    }`}
                  >
                    {copiedKind === 'html' ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    {copiedKind === 'html' ? 'Copied' : 'Copy HTML'}
                  </button>
                </div>
              </div>

              {/* Live preview — full email documents (dark ink headers),
                  so a sandboxed iframe is the only faithful renderer. */}
              <div className="bg-cream-deep border-b border-border overflow-x-auto">
                <div className="w-max min-w-full mx-auto p-4 md:p-6 flex flex-col items-center gap-2">
                  <div className="w-full max-w-[600px] flex items-center justify-between text-[9px] uppercase tracking-wider text-muted-foreground">
                    <span>
                      {viewport === 'mobile' ? 'Mobile preview' : 'Desktop preview'} ·{' '}
                      {previewWidth}px · {htmlKb} KB
                    </span>
                    <span>email-safe HTML</span>
                  </div>
                  <iframe
                    key={selected.id}
                    title={`${selected.name} — live email preview`}
                    srcDoc={selected.previewHtml || selected.html}
                    sandbox=""
                    style={{ width: previewWidth, height: 720 }}
                    className="block bg-white border border-gold/25 shadow-lg"
                  />
                  <p className="max-w-[600px] text-[10px] text-muted-foreground text-center leading-relaxed">
                    Preview renders with sample data — production sends use live values.
                    {selected.channel === 'supabase' &&
                      ' Placeholders like {{ .ConfirmationURL }} are filled in by Supabase when the email actually sends.'}
                  </p>
                </div>
              </div>

              {/* Channel-specific panels */}
              {selected.channel === 'resend' ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 border-b border-border">
                  {/* Send a test email */}
                  <div className="p-4 space-y-3 bg-card border-b xl:border-b-0 xl:border-r border-border">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Send className="size-4 text-gold-deep" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                          Send a test email
                        </span>
                      </div>
                      <span className="text-[9px] uppercase font-bold tracking-wide px-1.5 py-0.5 border border-ink bg-ink text-cream rounded-sm">
                        Live Resend pipeline
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <Mail className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input
                          type="email"
                          value={testTo}
                          onChange={(e) => setTestTo(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') sendTest();
                          }}
                          placeholder="brea@unsaidmemories901.com"
                          className="w-full pl-9 pr-3 h-9 bg-background border border-input rounded-lg text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <button
                        onClick={sendTest}
                        disabled={sending}
                        className="h-9 px-4 bg-card text-brand-teal border border-border text-[11px] font-bold uppercase tracking-wider inline-flex items-center justify-center gap-2 hover:border-brand-teal/60 hover:bg-brand-teal/5 transition-colors rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {sending ? (
                          <RefreshCw className="size-3.5 animate-spin" />
                        ) : (
                          <Send className="size-3.5" />
                        )}
                        {sending ? 'Sending…' : 'Send test'}
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Sends with sample data through the real Resend pipeline — the exact code path
                      production emails use. Check the inbox (and spam folder) for the fully styled
                      email.
                    </p>
                    {sentMessageId !== null && (
                      <div className="flex items-start gap-2 border border-success/30 bg-success/10 px-3 py-2 text-[12px] text-success rounded-lg">
                        <Check className="size-3.5 shrink-0 mt-0.5" />
                        <span>
                          Test email sent
                          {sentMessageId ? (
                            <>
                              {' '}
                              — message <span className="tabular-nums font-semibold">{sentMessageId}</span>
                            </>
                          ) : null}
                          .
                        </span>
                      </div>
                    )}
                    {sendError && (
                      <div className="flex items-start gap-2 border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive rounded-lg">
                        <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                        <span>{sendError}</span>
                      </div>
                    )}
                  </div>

                  {/* Deployment status + group context */}
                  <div className="p-4 space-y-3 bg-muted/20">
                    <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                      Deployment status
                    </div>
                    {selected.wired ? (
                      <div className="flex items-start gap-2 text-[12px]">
                        <span className="mt-1 w-2 h-2 rounded-full bg-success animate-pulse shrink-0" />
                        <span>
                          <span className="font-semibold text-foreground">In production: </span>
                          <span className="text-muted-foreground">{selected.wired}</span>
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 text-[12px] text-muted-foreground">
                        <span className="mt-1 w-2 h-2 rounded-full bg-gold shrink-0" />
                        <span>Ready — not yet wired to an automation.</span>
                      </div>
                    )}
                    {selectedGroup && (
                      <div className="border-t border-border pt-3 space-y-1">
                        <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                          Group
                        </div>
                        <div className="text-[12px] font-semibold text-foreground">
                          {selectedGroup.label}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {selectedGroup.description}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Supabase install instructions — amber callout */
                <div className="p-4 border-b border-border bg-card">
                  <div className="border border-warning/30 bg-warning/10 rounded-lg">
                    <div className="px-4 py-2.5 border-b border-warning/20 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <ClipboardPaste className="size-4 text-warning shrink-0" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-warning">
                          This template pastes into the Supabase dashboard
                        </span>
                      </div>
                      <span className="text-[9px] uppercase font-bold tracking-wide tabular-nums px-1.5 py-0.5 border border-warning/30 bg-card text-warning rounded-sm">
                        Paste-in · no code
                      </span>
                    </div>
                    <div className="p-4 space-y-3">
                      <ol className="list-decimal pl-5 space-y-2 text-[12.5px] text-ink-soft">
                        <li>
                          Click{' '}
                          <span className="font-semibold text-ink">Copy HTML</span> above — the full
                          email document is now on your clipboard.
                        </li>
                        <li>
                          Open{' '}
                          <span className="font-semibold text-ink">{selected.supabasePath}</span>.
                        </li>
                        <li>
                          Replace the <span className="font-semibold text-ink">Message body</span>{' '}
                          with the copied HTML — click the source{' '}
                          <code className="px-1 py-0.5 bg-card border border-warning/25 text-gold-deep tabular-nums rounded-sm">
                            {'< >'}
                          </code>{' '}
                          code view button in the editor first if one is shown.
                        </li>
                        <li>
                          Paste the subject from above into the{' '}
                          <span className="font-semibold text-ink">Subject</span> field.
                        </li>
                        <li>
                          <span className="font-semibold text-ink">Save</span>.
                        </li>
                      </ol>
                      {selected.notes && selected.notes.length > 0 && (
                        <ul className="border-t border-warning/20 pt-3 space-y-1.5">
                          {selected.notes.map((n, i) => (
                            <li key={i} className="flex gap-2 text-[11px] text-muted-foreground">
                              <span className="text-warning shrink-0">▸</span>
                              <span className="leading-relaxed">{n}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="text-[11px] text-muted-foreground border-t border-warning/20 pt-3 leading-relaxed">
                        The preview shows{' '}
                        <code className="px-1 py-0.5 bg-card border border-warning/25 text-gold-deep tabular-nums rounded-sm">
                          {'{{ .ConfirmationURL }}'}
                        </code>
                        -style placeholders on purpose — Supabase fills them in when the email
                        actually sends.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Studio status footer */}
      <div className="w-full bg-ink text-cream px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 tabular-nums text-[11px]">
        <div className="flex items-center gap-2">
          <span>&gt; MAIL_STUDIO: READY</span>
          <span className="inline-block w-[7px] h-[14px] bg-gold animate-pulse" />
        </div>
        <div className="flex items-center gap-4 text-cream/60">
          <span>CHANNELS: RESEND + SUPABASE AUTH</span>
          <span>BRAND: CREAM / GOLD / INK</span>
          <span className="truncate">ACTIVE BRANCH: {selectedLocation || '—'}</span>
        </div>
      </div>
    </div>
  );
};
