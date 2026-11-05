'use client';

import React, { useState } from 'react';
import { Play, Zap } from 'lucide-react';
import {
  useRunRebookingAutomation,
  useRunAppointmentReminders,
  useRunVaccineReminders,
  useRunUnsignedDocReminders,
  useRunBirthdayMessages,
  useRunWinBackCampaign,
  useRunPaymentReminders,
  useRunDuplicateDetection,
  useRunMissingContactInfo,
} from '@/hooks/admin/useActions';

interface AutomationDef {
  key: string;
  label: string;
  description: string;
  hook: () => { mutateAsync: (payload: Record<string, unknown>) => Promise<unknown> };
}

const AUTOMATIONS: AutomationDef[] = [
  { key: 'rebooking', label: 'Rebooking Automation', description: 'Find customers not seen in 42+ days and queue rebooking messages', hook: useRunRebookingAutomation },
  { key: 'appt-reminders', label: 'Appointment Reminders', description: 'Send reminders for upcoming appointments', hook: useRunAppointmentReminders },
  { key: 'vaccine-reminders', label: 'Vaccine Reminders', description: 'Remind customers of upcoming vaccine due dates', hook: useRunVaccineReminders },
  { key: 'unsigned-docs', label: 'Unsigned Document Reminders', description: 'Nudge customers with unsigned intake forms/waivers', hook: useRunUnsignedDocReminders },
  { key: 'birthday', label: 'Birthday Messages', description: 'Send birthday messages to pets/customers', hook: useRunBirthdayMessages },
  { key: 'winback', label: 'Win-Back Campaign', description: 'Target lapsed customers with win-back offers', hook: useRunWinBackCampaign },
  { key: 'payment-reminders', label: 'Payment Reminders', description: 'Remind customers of overdue invoices', hook: useRunPaymentReminders },
  { key: 'duplicate-detection', label: 'Duplicate Detection', description: 'Detect duplicate customer records by email', hook: useRunDuplicateDetection },
];

function AutomationCard({ def }: { def: AutomationDef }) {
  const mutation = def.hook();
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await mutation.mutateAsync({});
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Automation failed');
    } finally {
      setBusy(false);
    }
  };

  // Extract a count from common result shapes
  const count = (() => {
    if (!result || typeof result !== 'object') return null;
    const r = result as Record<string, unknown>;
    if (typeof r.count === 'number') return r.count;
    if (typeof r.affected === 'number') return r.affected;
    if (Array.isArray(r.duplicates)) return r.duplicates.length;
    if (typeof r.message === 'string') return r.message;
    return null;
  })();

  return (
    <div className="border border-border rounded-lg p-4 bg-card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">{def.label}</h3>
        <button
          onClick={run}
          disabled={busy}
          className="bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          <Play className="w-3 h-3" /> {busy ? 'RUNNING…' : 'RUN'}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-2">{def.description}</p>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {count !== null && (
        <p className="text-[11px] text-success font-medium">
          {typeof count === 'number' ? `${count} records affected` : count}
        </p>
      )}
      {result !== null && (
        <div className="mt-2">
          <button onClick={() => { setResult(null); setError(null); }} className="text-[11px] text-muted-foreground hover:text-foreground mb-1">Clear</button>
          <pre className="text-[10px] bg-muted/40 rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// Data Management (Master Tree 1.22): customers missing an email or a
// phone — the real list from sys_run_missing_contact_info, each row
// deep-linking to that customer's profile to fix the record.
function MissingContactCard() {
  const mutation = useRunMissingContactInfo();
  const [rows, setRows] = useState<{ id: string; name: string; email: string | null; phone: string | null; missing: string[] }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res: any = await mutation.mutateAsync({});
      setRows(Array.isArray(res?.customers) ? res.customers : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed');
      setRows(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border rounded-lg p-4 bg-card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">Missing Contact Info</h3>
        <button
          onClick={run}
          disabled={busy}
          className="bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          <Play className="w-3 h-3" /> {busy ? 'RUNNING…' : 'RUN'}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-2">Active customers with no email or no phone on file — reminders can&apos;t reach them until the record is fixed</p>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {rows !== null && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[11px] text-success font-medium">{rows.length} customer(s) missing contact info</p>
          {rows.map((r) => (
            <a
              key={r.id}
              href={`/admin/customers?customer_id=${r.id}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2 py-1.5 text-[11px] hover:bg-accent"
            >
              <span className="font-medium truncate">{r.name}</span>
              <span className="text-muted-foreground shrink-0">missing: {r.missing.join(', ')}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export const AutomationView: React.FC = () => {
  return (
    <div className="flex flex-col w-full bg-background text-foreground min-h-full p-4">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5" />
        <h1 className="text-lg font-bold">Automation Center</h1>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {AUTOMATIONS.map((def) => (
          <AutomationCard key={def.key} def={def} />
        ))}
        <MissingContactCard />
      </div>
    </div>
  );
};
