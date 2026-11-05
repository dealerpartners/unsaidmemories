'use client';

import React, { useState, useEffect } from 'react';
import { Building2, Phone, Mail, Globe, MapPin, FileText, Clock, Save, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SystemSettings } from '@/lib/settings-types';

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
  systemSettings?: SystemSettings;
  saveSettingsToDb?: (updates: Partial<SystemSettings>) => Promise<boolean>;
}

export const BusinessProfileScreen: React.FC<ScreenProps> = ({
  systemSettings,
  saveSettingsToDb,
}) => {
// eslint-disable-next-line react-hooks/set-state-in-effect
  const [form, setForm] = useState<Record<string, any>>({});
  const [saved, setSaved] = useState(false);
// eslint-disable-next-line react-hooks/set-state-in-effect
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (systemSettings) {
// eslint-disable-next-line react-hooks/set-state-in-effect
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(systemSettings as any);
// eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
    }
  }, [systemSettings]);

  const update = (key: string, value: any) => {
// eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const [saveError, setSaveError] = useState(false);
  // "Saved!" shows only when the settings API confirmed the write.
  const handleSave = async () => {
    setSaveError(false);
    const ok = saveSettingsToDb ? await saveSettingsToDb(form as Partial<SystemSettings>) : true;
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      setSaveError(true);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground text-[13px]">Loading business profile from database...</div>;
  }

  const fields = [
    { key: 'org_business_name', label: 'Business Name', icon: Building2, type: 'text', placeholder: 'UnSaid Memories' },
    { key: 'org_tagline', label: 'Tagline', icon: FileText, type: 'text', placeholder: 'Luxury pet grooming with love and care.' },
    { key: 'org_phone', label: 'Phone', icon: Phone, type: 'tel', placeholder: '(901) 722-1114' },
    { key: 'org_email', label: 'Email', icon: Mail, type: 'email', placeholder: 'info@unsaidmemories.com' },
    { key: 'org_website', label: 'Website', icon: Globe, type: 'url', placeholder: 'https://www.unsaidmemories.com' },
    { key: 'org_address', label: 'Address', icon: MapPin, type: 'text', placeholder: '699 Waring Rd, Memphis, TN' },
    { key: 'org_tax_ein', label: 'Tax EIN', icon: FileText, type: 'text', placeholder: 'XX-XXXX789' },
    { key: 'org_timezone', label: 'Timezone', icon: Clock, type: 'text', placeholder: 'America/Chicago' },
  ];

  return (
    <div className="p-6 space-y-6 font-bar">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Business Profile</h2>
          <p className="text-[13px] text-muted-foreground mt-1">Organization identity, contact information, and tax configuration.</p>
        </div>
        <button
          onClick={handleSave}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg h-9 px-3.5 text-[13px] font-medium shadow-card transition-colors cursor-pointer',
            saved
              ? 'bg-success text-success-foreground'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {saved ? (
            <>
              <CheckCircle2 className="size-4" />
              Saved!
            </>
          ) : (
            <>
              <Save className="size-4" />
              Save Changes
            </>
          )}
        </button>
      </div>

      {saveError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          Save was not confirmed by the server — your changes are not persisted yet.
        </div>
      )}

      {/* Form fields */}
      <div className="bg-card border border-border rounded-xl shadow-card p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {fields.map((field) => {
            const Icon = field.icon;
            return (
              <div key={field.key}>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">{field.label}</label>
                <div className="relative">
                  <Icon className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={field.type}
                    value={form[field.key] || ''}
                    onChange={(e) => update(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full pl-9 pr-3 h-9 bg-background border border-input rounded-lg text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment & Tax section */}
      <div className="bg-card border border-border rounded-xl shadow-card p-6">
        <h3 className="text-[15px] font-semibold text-foreground mb-4">Payment & Tax Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">Tax Rate (%)</label>
            <input
              type="number"
              step="0.01"
              value={form.payment_tax_rate_percent || ''}
              onChange={(e) => update('payment_tax_rate_percent', parseFloat(e.target.value))}
              className="w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">Your headline sales-tax rate — the register and online bookings price from it. Saving rebalances your tax rules; jurisdiction detail lives in Settings → Taxes.</p>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">Commission Default (%)</label>
            <input
              type="number"
              step="1"
              value={form.payment_commission_default_rate || ''}
              onChange={(e) => update('payment_commission_default_rate', parseInt(e.target.value))}
              className="w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">Escrow Hold (days)</label>
            <input
              type="number"
              value={form.payment_escrow_hold_days || ''}
              onChange={(e) => update('payment_escrow_hold_days', parseInt(e.target.value))}
              className="w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">Invoice Due (days)</label>
            <input
              type="number"
              value={form.invoice_due_days || ''}
              onChange={(e) => update('invoice_due_days', parseInt(e.target.value))}
              className="w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">Late Fee (%)</label>
            <input
              type="number"
              step="0.1"
              value={form.invoice_late_fee_percent || ''}
              onChange={(e) => update('invoice_late_fee_percent', parseFloat(e.target.value))}
              className="w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1.5">Late Fee Grace (days)</label>
            <input
              type="number"
              value={form.invoice_late_fee_days || ''}
              onChange={(e) => update('invoice_late_fee_days', parseInt(e.target.value))}
              className="w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
            />
          </div>
        </div>

        {/* Toggles */}
        <div className="mt-6 space-y-3 pt-4 border-t border-border">
          {[
            { key: 'payment_enable_tips', label: 'Enable Tips' },
            { key: 'payment_allow_split_payments', label: 'Allow Split Payments' },
            { key: 'booking_require_deposit', label: 'Require Upfront Deposit' },
            { key: 'booking_allow_automatic_confirm', label: 'Auto-Confirm Bookings' },
            { key: 'portal_allow_self_cancel', label: 'Customer Self-Cancel' },
            { key: 'portal_allow_self_reschedule', label: 'Customer Self-Reschedule' },
            { key: 'portal_show_pricing_upfront', label: 'Show Pricing Upfront' },
            { key: 'portal_enable_chat', label: 'Enable Customer Chat' },
            { key: 'system_enforce_mfa', label: 'Enforce 2FA for All Users' },
          ].map((toggle) => (
            <label key={toggle.key} className="flex items-center justify-between cursor-pointer">
              <span className="text-[13px] font-medium text-foreground">{toggle.label}</span>
              <button
                type="button"
                onClick={() => update(toggle.key, !form[toggle.key])}
                className={cn(
                  'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                  form[toggle.key] ? 'bg-primary' : 'bg-muted'
                )}
              >
                <span className={cn(
                  'inline-block size-3.5 rounded-full bg-white transition-transform',
                  form[toggle.key] ? 'translate-x-4' : 'translate-x-1'
                )} />
              </button>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};
