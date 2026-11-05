'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, Clock, DollarSign, Shield, Save, CheckCircle2, CalendarClock, AlertTriangle, Percent } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SystemSettings } from '@/lib/settings-types';

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
  systemSettings?: SystemSettings;
  saveSettingsToDb?: (updates: Partial<SystemSettings>) => Promise<boolean>;
}

export const BookingOperationsRulesScreen: React.FC<ScreenProps> = ({
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

// eslint-disable-next-line react-hooks/set-state-in-effect
  const update = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));
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

  if (loading) return <div className="p-8 text-center text-muted-foreground text-[13px]">Loading booking rules from database...</div>;

  const numberFields = [
    { key: 'booking_cancellation_cutoff_hours', label: 'Cancellation Cutoff (hours)', icon: Clock, placeholder: '24', desc: 'Minimum hours before appointment to cancel without penalty' },
    { key: 'booking_cancellation_fee', label: 'Cancellation Fee ($)', icon: DollarSign, placeholder: '0.00', desc: 'Fee charged when a booking is cancelled inside the cutoff window', prefix: '$' },
    { key: 'booking_no_show_fee', label: 'No-Show Penalty ($)', icon: DollarSign, placeholder: '25.00', desc: 'Flat fee charged for no-shows', prefix: '$' },
    { key: 'booking_no_show_grace_period', label: 'No-Show Grace Period (min)', icon: Clock, placeholder: '15', desc: 'Minutes after the appointment start before it counts as a no-show' },
    { key: 'booking_max_horizon_days', label: 'Max Booking Future Horizon (days)', icon: CalendarClock, placeholder: '90', desc: 'How far in advance customers can book' },
    { key: 'booking_turnaround_buffer_minutes', label: 'Station Turnaround Buffer (min)', icon: Clock, placeholder: '15', desc: 'Buffer between appointments at same station' },
    { key: 'booking_default_duration_minutes', label: 'Default Duration (min)', icon: Calendar, placeholder: '120', desc: 'Default appointment length for standard grooming' },
    { key: 'booking_overbooking_threshold_percent', label: 'Overbooking Threshold (%)', icon: Percent, placeholder: '10', desc: 'Percentage above capacity before overbooking alert', suffix: '%' },
    { key: 'booking_deposit_percent', label: 'Deposit Percentage (%)', icon: Percent, placeholder: '25', desc: 'Percentage of service price required as deposit', suffix: '%' },
    { key: 'booking_deposit_flat_amount', label: 'Flat Deposit Amount ($)', icon: DollarSign, placeholder: '0.00', desc: 'Flat deposit amount (overrides percentage if > 0)', prefix: '$' },
  ];

  const toggles = [
    { key: 'booking_require_deposit', label: 'Require Upfront Deposit', desc: 'Force deposits on all new bookings' },
    { key: 'booking_allow_automatic_confirm', label: 'Auto-Confirm Bookings', desc: 'Automatically confirm bookings without staff review' },
  ];

  return (
    <div className="p-6 space-y-6 font-bar">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Booking Rules & Operations</h2>
          <p className="text-[13px] text-muted-foreground mt-1">Configure deposit rules, cancellation windows, no-show penalties, and station scheduling parameters.</p>
          <p className="text-[12px] text-muted-foreground mt-1">These rules are yours — they apply only to your business. When an appointment is marked as a no-show, or cancelled inside your cutoff window, the fee below is charged to the customer&apos;s account as an open invoice (a deposit you already hold for that appointment is applied first). A fee of $0 means no charge.</p>
        </div>
        <button
          onClick={handleSave}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg h-9 px-3.5 text-[13px] font-medium shadow-card transition-colors cursor-pointer',
            saved ? 'bg-success text-success-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {saved ? (<><CheckCircle2 className="size-4" /> Saved!</>) : (<><Save className="size-4" /> Save Changes</>)}
        </button>
      </div>

      {saveError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          <AlertTriangle className="size-4 shrink-0" /> Save was not confirmed by the server — your changes are not persisted yet.
        </div>
      )}

      {/* Numeric booking rules */}
      <div className="bg-card border border-border rounded-xl shadow-card p-6">
        <h3 className="text-[15px] font-semibold text-foreground mb-4">Booking Parameters</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {numberFields.map((field) => {
            const Icon = field.icon;
            return (
              <div key={field.key}>
                <label className="text-[12px] font-medium text-muted-foreground block mb-1">{field.label}</label>
                <div className="relative">
                  {field.prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">{field.prefix}</span>}
                  <Icon className={cn('size-4 absolute top-1/2 -translate-y-1/2 text-muted-foreground', field.prefix ? 'right-3' : 'left-3')} />
                  <input
                    type="number"
                    step="0.01"
                    value={form[field.key] ?? ''}
                    onChange={(e) => update(field.key, parseFloat(e.target.value) || 0)}
                    placeholder={field.placeholder}
                    className={cn(
                      'w-full h-9 bg-background border border-input rounded-lg text-[13px] text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-ring',
                      field.prefix ? 'pl-7 pr-9' : 'pl-9 pr-3'
                    )}
                  />
                  {field.suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">{field.suffix}</span>}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{field.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Toggle switches */}
      <div className="bg-card border border-border rounded-xl shadow-card p-6">
        <h3 className="text-[15px] font-semibold text-foreground mb-4">Booking Policy Toggles</h3>
        <div className="space-y-4">
          {toggles.map((toggle) => (
            <label key={toggle.key} className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-[13px] font-medium text-foreground block">{toggle.label}</span>
                <span className="text-[11px] text-muted-foreground">{toggle.desc}</span>
              </div>
              <button
                type="button"
                onClick={() => update(toggle.key, !form[toggle.key])}
                className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors', form[toggle.key] ? 'bg-primary' : 'bg-muted')}
              >
                <span className={cn('inline-block size-3.5 rounded-full bg-white transition-transform', form[toggle.key] ? 'translate-x-4' : 'translate-x-1')} />
              </button>
            </label>
          ))}
        </div>
      </div>

      {/* Required Vaccines */}
      <div className="bg-card border border-border rounded-xl shadow-card p-6">
        <h3 className="text-[15px] font-semibold text-foreground mb-4">Required Vaccinations</h3>
        <div className="relative">
          <Shield className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={form.booking_required_vaccines || ''}
            onChange={(e) => update('booking_required_vaccines', e.target.value)}
            placeholder="Rabies, DHPP, Bordetella"
            className="w-full pl-9 pr-3 h-9 bg-background border border-input rounded-lg text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">Comma-separated list of required vaccinations for booking.</p>
      </div>

      {/* Invoice & Payment Rules */}
      <div className="bg-card border border-border rounded-xl shadow-card p-6">
        <h3 className="text-[15px] font-semibold text-foreground mb-4">Invoice & Payment Rules</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">Invoice Due (days)</label>
            <input type="number" value={form.invoice_due_days ?? ''} onChange={(e) => update('invoice_due_days', parseInt(e.target.value))} className="w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">Late Fee (%)</label>
            <input type="number" step="0.1" value={form.invoice_late_fee_percent ?? ''} onChange={(e) => update('invoice_late_fee_percent', parseFloat(e.target.value))} className="w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">Late Fee Grace (days)</label>
            <input type="number" value={form.invoice_late_fee_days ?? ''} onChange={(e) => update('invoice_late_fee_days', parseInt(e.target.value))} className="w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>
        <div className="mt-3">
          <label className="text-[12px] font-medium text-muted-foreground block mb-1">Auto-Remind Schedule (days before due)</label>
          <input type="text" value={form.invoice_auto_remind_days || ''} onChange={(e) => update('invoice_auto_remind_days', e.target.value)} placeholder="3,7,14" className="w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>
    </div>
  );
};
