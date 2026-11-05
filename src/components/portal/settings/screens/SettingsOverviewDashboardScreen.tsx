'use client';

import React, { useState, useEffect } from 'react';
import {
  Database, Globe, CreditCard, Mail, MessageSquare, HardDrive,
  ExternalLink, ShieldCheck, Users, Building2, Calendar,
  Activity, CheckCircle2, AlertTriangle, ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
}

interface SystemHealth {
  service: string;
  label: string;
  status: 'operational' | 'degraded' | 'down';
  icon: React.ElementType;
}

interface QuickLinkRow { id: string; label: string; url: string; opens_new_tab: boolean }

export const SettingsOverviewDashboardScreen: React.FC<ScreenProps> = ({
  onNavigateScreen,
}) => {
  const [settings, setSettings] = useState<Record<string, any> | null>(null);
  const [userCount, setUserCount] = useState<number>(0);
  const [roleCount, setRoleCount] = useState<number>(0);
  const [stripeConnected, setStripeConnected] = useState<boolean | null>(null);
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [smsStatus, setSmsStatus] = useState<string | null>(null);
  const [quickLinks, setQuickLinks] = useState<QuickLinkRow[]>([]);
  const [quickLinksLoaded, setQuickLinksLoaded] = useState(false);

  // Fetch live settings + user counts
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    async function fetchData() {
      try {
        const [settingsRes, usersRes] = await Promise.all([
          fetch('/api/admin/settings'),
          fetch('/api/admin/users'),
        ]);
        if (settingsRes.ok) setSettings(await settingsRes.json());
        if (usersRes.ok) {
          const userData = await usersRes.json();
          setUserCount((userData.admins?.length || 0) + (userData.staff?.length || 0) + (userData.customers?.length || 0));
          setRoleCount(userData.roles?.length || 0);
        }
      } catch (err) {
        console.error('Failed to fetch overview data:', err);
      }
    }
    fetchData();
  }, []);

  // Health inputs from the live surfaces: Stripe Connect status, the
  // email settings route (is a Resend key configured?), and the backups
  // route (last completed run). Nothing here is asserted without a
  // source: SMS has no provider configured platform-wide, so it never
  // reports "operational".
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/admin/stripe-connections/status');
        if (r.ok) { const j = await r.json(); setStripeConnected(j.connected === true); }
      } catch { /* stays unknown → degraded */ }
      try {
        const r = await fetch('/api/admin/settings/email');
        if (r.ok) { const j = await r.json(); setEmailConfigured(j.configured === true); }
      } catch { /* stays unknown → degraded */ }
      try {
        const r = await fetch('/api/admin/settings/backups');
        if (r.ok) {
          const j = await r.json();
          setLastBackupAt(j.lastBackup?.completedAt || j.lastBackup?.createdAt || null);
        }
      } catch { /* no backup evidence → degraded */ }
      try {
        // SMS state comes from the MEASURED health registry (the probe
        // in Settings → System Health writes twilio_sms rows): ok /
        // not_configured / error from an actual account check, never a
        // hardcoded claim in either direction.
        const r = await fetch('/api/admin/system-health');
        if (r.ok) {
          const j = await r.json();
          const sms = (j.integrations || []).find((i: any) => i.integration_code === 'twilio_sms');
          if (sms) setSmsStatus(String(sms.status));
        }
      } catch { /* stays unknown → labelled unmeasured */ }
    })();
  }, []);

  // Quick Links render the tenant's stored platform_quick_links — the
  // same rows the command palette's View Quick Links returns. Managed
  // via the palette's Add/Edit/Retire Quick Link actions.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/admin/settings/quick-links');
        if (r.ok) { const j = await r.json(); setQuickLinks(j.links || []); }
      } catch { /* card falls back to its honest empty state */ }
      setQuickLinksLoaded(true);
    })();
  }, []);

  const systemHealth: SystemHealth[] = [
    { service: 'supabase', label: 'Supabase Database', status: settings ? 'operational' : 'down', icon: Database },
    { service: 'auth', label: 'Login & Authentication', status: settings ? 'operational' : 'down', icon: ShieldCheck },
    { service: 'website', label: 'Public Website', status: settings ? 'operational' : 'down', icon: Globe },
    { service: 'portal', label: 'Customer Portal', status: settings ? 'operational' : 'degraded', icon: Users },
    { service: 'stripe', label: 'Stripe Payments', status: stripeConnected ? 'operational' : 'degraded', icon: CreditCard },
    { service: 'email', label: 'Email Service (Resend)', status: emailConfigured ? 'operational' : 'degraded', icon: Mail },
    {
      service: 'sms',
      label: smsStatus === 'ok' ? 'SMS Service (Twilio)' : smsStatus === 'not_configured' ? 'SMS Service (not configured)' : smsStatus === 'error' ? 'SMS Service (check failed)' : 'SMS Service (not yet measured)',
      status: (smsStatus === 'ok' ? 'operational' : smsStatus === 'error' ? 'down' : 'degraded') as SystemHealth['status'],
      icon: MessageSquare,
    },
    { service: 'backups', label: 'Database Backups', status: lastBackupAt ? 'operational' : 'degraded', icon: HardDrive },
  ];

  const downCount = systemHealth.filter((h) => h.status === 'down').length;
  const degradedCount = systemHealth.filter((h) => h.status === 'degraded').length;
  const healthBadge = !settings || downCount > 0
    ? { text: 'Issues Detected', cls: 'text-destructive', dot: 'bg-destructive' }
    : degradedCount > 0
      ? { text: `${degradedCount} Need Attention`, cls: 'text-warning', dot: 'bg-warning' }
      : { text: 'All Operational', cls: 'text-success', dot: 'bg-success' };

  const moduleCards = [
    { id: 'org-multiloc', title: 'Locations & Branches', desc: 'Manage physical salon facilities and mobile vans.', action: 'Manage Locations', icon: Building2 },
    { id: 'org-brand', title: 'Brand & Identity', desc: 'Company logos, typography, SMS headers, receipt templates.', action: 'Edit Brand', icon: Globe },
    { id: 'users-staff', title: 'Staff & Role Permissions', desc: 'Team access, commission splits, shift assignments, PIN security.', action: 'Manage Staff', icon: Users },
    { id: 'booking-ops', title: 'Booking Rules & Windows', desc: 'Lead times, deposit rules, cancellation windows, vaccination requirements.', action: 'Configure Rules', icon: Calendar },
    { id: 'booking-rules', title: 'Business & Holiday Hours', desc: 'Weekly operating hours, weekend blocks, holiday blackout calendar.', action: 'Set Hours', icon: Calendar },
    { id: 'services-pricing', title: 'Services & Pricing Matrix', desc: 'Core grooming tiers, breed weight surcharges, membership packages.', action: 'Open Matrix', icon: Activity },
    { id: 'customer-portal', title: 'Client Portal Settings', desc: 'Self-service booking, digital intake, appointment management.', action: 'Configure Portal', icon: Users },
    { id: 'cms-wizard', title: 'Website CMS & Widget', desc: 'Booking flow config, website copy, embeddable appointment widgets.', action: 'Customize', icon: Globe },
    { id: 'system-telemetry', title: 'System Logs & Health', desc: 'Database connectivity, webhook monitors, audit trails, diagnostics.', action: 'View Health', icon: Activity },
  ];

  return (
    <div className="w-full bg-background text-foreground font-bar antialiased">
      {/* Header */}
      <div className="p-6 border-b border-border bg-card">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Settings Overview</h1>
        <p className="text-[13px] text-muted-foreground mt-1">Configure salon operations, branch profiles, staff permissions, service matrices, and client booking parameters.</p>
      </div>

      <div className="p-6 space-y-6">
        {/* System Health Status */}
        <div className="bg-card border border-border rounded-xl shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-foreground">System Health Status</h2>
            <span className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium', healthBadge.cls)}>
              <span className={cn('size-2 rounded-full animate-pulse', healthBadge.dot)} />
              {healthBadge.text}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {systemHealth.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.service} className="flex items-center gap-2.5 p-3 rounded-lg border border-border bg-background">
                  <Icon className={cn('size-4', item.status === 'operational' ? 'text-success' : item.status === 'degraded' ? 'text-warning' : 'text-destructive')} />
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-foreground truncate">{item.label}</p>
                    <p className={cn('text-[10px] capitalize', item.status === 'operational' ? 'text-success' : item.status === 'degraded' ? 'text-warning' : 'text-destructive')}>
                      {item.status}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Stats + Quick Links */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Stats */}
          <div className="bg-card border border-border rounded-xl shadow-card p-5">
            <h2 className="text-[15px] font-semibold text-foreground mb-4">Organization Summary</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-[13px] text-muted-foreground">Business Name</span>
                <span className="text-[13px] font-medium text-foreground">{settings?.org_business_name || '—'}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-[13px] text-muted-foreground">Total Users</span>
                <span className="text-[13px] font-semibold text-primary tabular-nums">{userCount}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-[13px] text-muted-foreground">Role Definitions</span>
                <span className="text-[13px] font-semibold text-primary tabular-nums">{roleCount}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-[13px] text-muted-foreground">Stripe Status</span>
                <span className={cn('text-[13px] font-medium', stripeConnected ? 'text-success' : 'text-foreground')}>
                  {stripeConnected === null ? 'Checking…' : stripeConnected ? 'Connected' : 'Not connected'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-[13px] text-muted-foreground">Tax Rate</span>
                <span className="text-[13px] font-medium text-foreground tabular-nums">{settings?.payment_tax_rate_percent ? `${settings.payment_tax_rate_percent}%` : '—'}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-[13px] text-muted-foreground">Commission Default</span>
                <span className="text-[13px] font-medium text-foreground tabular-nums">{settings?.payment_commission_default_rate ? `${settings.payment_commission_default_rate}%` : '—'}</span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="bg-card border border-border rounded-xl shadow-card p-5">
            <h2 className="text-[15px] font-semibold text-foreground mb-4">Quick Links</h2>
            <div className="space-y-2">
              {quickLinks.length === 0 ? (
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  {quickLinksLoaded
                    ? 'No quick links configured yet. Add them from the command palette — search “Add Quick Link”.'
                    : 'Loading quick links…'}
                </p>
              ) : (
                quickLinks.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    {...(link.opens_new_tab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-background hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                      <ExternalLink className="size-4 text-muted-foreground" />
                      {link.label}
                    </span>
                    <ExternalLink className="size-3.5 text-muted-foreground" />
                  </a>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Module Directory */}
        <div>
          <h2 className="text-[15px] font-semibold text-foreground mb-4">Configuration Modules</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {moduleCards.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  onClick={() => onNavigateScreen?.(m.id)}
                  className="text-left bg-card border border-border rounded-xl shadow-card p-4 hover:shadow-card-md hover:border-primary/30 transition-all duration-150 cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="size-4 text-primary" />
                    <h3 className="text-[14px] font-semibold text-foreground">{m.title}</h3>
                  </div>
                  <p className="text-[12px] text-muted-foreground leading-relaxed mb-3">{m.desc}</p>
                  <div className="flex items-center gap-1 text-[12px] font-medium text-primary">
                    {m.action}
                    <ArrowRight className="size-3.5" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
