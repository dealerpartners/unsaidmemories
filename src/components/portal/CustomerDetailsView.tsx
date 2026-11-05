'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CustomerFullProfile, CustomerPetDetail, CustomerAppointmentItem } from '@/lib/types';
import { ChevronRight, MoreHorizontal, Pencil, Plus, ChevronDown, Phone, Mail, MapPin, Wallet, BadgeDollarSign, DollarSign, Star, Calendar, CheckCircle, ShieldCheck, AlertCircle, CalendarPlus, PawPrint, CreditCard, MessageSquare, FileEdit, FileCheck, ArrowRight, Scissors, X, Send, Upload, Check, Search, FileText, Dog, Camera, Pin, History, Tag, UserCheck, Clock, BellRing, RotateCcw, RefreshCw, Eye, Printer, CheckCheck } from 'lucide-react';
import Image from 'next/image';
import { EditPetModal, ManageVaccinesModal, RescheduleModal, AddonServiceModal, AppointmentDetailsModal, ViewGroomingRecordModal, ViewPhotosModal, RecommendNextVisitModal, InvoiceModal, RefundModal, AuditLogModal, CampaignModal, OptInOutModal } from './customer/CustomerModals';
import { QuickActionTakePaymentView, QuickActionNewAppointmentView, QuickActionAddPetView, QuickActionSendMessageView, QuickActionUpdateDocumentsView, QuickActionAddNoteView } from './customer/CustomerQuickActionsViews';
import { openPrintDocument, escapeHtmlClient as escHtml } from '@/lib/printing/client';
import {
  useEditCustomer,
  useMergeCustomer,
  useMergeHousehold,
  useSendRebookingLink,
  useAddToCampaign,
  usePrintCustomerHistory,
  useSendMagicLink,
  useCreateInvoiceAction,
  useBookNextVisit,
} from '@/hooks/admin/useActions';
import { useCheckout } from '@/hooks/admin/useCheckout';
import { useAppStore } from '@/lib/portal-store';
import { TablePagination, useTablePagination } from './_shared/TablePagination';

interface CustomerDetailsViewProps {
  customerProfile: CustomerFullProfile;
  onBackToDirectory?: () => void;
  onOpenNewAppointment?: () => void;
  onOpenAddPet?: () => void;
  onOpenTakePayment?: () => void;
  onOpenIntake?: () => void;
}

// Service Profile tab (1.20) — fetches per-customer service analytics
function ServiceProfileTab({ customerId }: { customerId: string }) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    fetch(`/api/admin/crm/customers/${customerId}/service-profile`)
      .then((r) => r.json())
      .then((d) => setProfile(d?.data || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) return <div className="p-8 text-muted-foreground">Loading service profile…</div>;
  if (!profile) return <div className="p-8 text-muted-foreground">No service data available.</div>;

  const rows: [string, string][] = [
    ['Most Common Service', profile.mostCommonService || '—'],
    ['Average Frequency', profile.averageFrequencyDays ? `Every ${profile.averageFrequencyDays} days` : '—'],
    ['Preferred Groomer', profile.preferredGroomer || '—'],
    ['Average Spend', profile.averageSpend != null ? `$${Number(profile.averageSpend).toFixed(2)}` : '—'],
    ['Last Service', profile.lastService ? `${profile.lastService} (${profile.lastServiceDate ? new Date(profile.lastServiceDate).toLocaleDateString() : ''})` : '—'],
    ['Recommended Next Service', profile.recommendedNextService || '—'],
    ['Recommended Next Visit', profile.recommendedNextVisitAt ? new Date(profile.recommendedNextVisitAt).toLocaleDateString() : '—'],
    ['Total Completed Visits', String(profile.totalCompletedAppointments || 0)],
  ];

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto" data-purpose="customer-service-profile-view">
      <h3 className="text-lg font-bold mb-4">Service Profile</h3>
      <div className="bg-card border border-border rounded-lg divide-y divide-border/10">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <span className="text-[13px] text-muted-foreground font-medium">{label}</span>
            <span className="text-[13px] font-semibold text-foreground">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Customer Settings — everything the customer can set in their own
// portal, read back from the SAME stores the customer writes (GET
// /api/admin/crm/customers/[id]/settings): communication opt-ins,
// booking + pet-service preferences (groomer, days, time window,
// shampoo, cut, special handling), preferred payment method, saved
// cards, and the address book. Sunny's ruling (2026-10-14): a setting
// the customer writes that staff cannot see is a broken contract.
const SETTINGS_PAYMENT_LABELS: Record<string, string> = {
  card_on_file: 'Card on file',
  card: 'Card at the salon',
  cash: 'Cash',
  check: 'Check',
  gift_card: 'Gift card',
};

function CustomerSettingsPanel({ customerId }: { customerId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  React.useEffect(() => {
    if (!customerId) { setLoading(false); return; }
    fetch(`/api/admin/crm/customers/${customerId}/settings`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => setData(d?.data || null))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) return <div className="p-8 text-muted-foreground">Loading customer settings…</div>;
  if (failed || !data) return <div className="p-8 text-muted-foreground">Customer settings could not be loaded.</div>;

  const onOff = (v: boolean) => (v ? 'On' : 'Off');
  const dayLabel = (d: string) => d.charAt(0).toUpperCase() + d.slice(1, 3);
  const timeWindow = data.booking.preferredTimeStart || data.booking.preferredTimeEnd
    ? `${data.booking.preferredTimeStart || '…'} – ${data.booking.preferredTimeEnd || '…'}`
    : '—';
  const cardStateText: Record<string, string> = {
    stripe_not_configured: 'Card management unavailable (processor not configured)',
    no_stripe_customer: 'No card account yet — cards appear after the first saved-card payment',
    no_cards: 'No saved cards',
    stripe_error: 'Saved cards could not be loaded from the processor',
  };

  const sections: { title: string; rows: [string, string][] }[] = [
    {
      title: 'Communication Preferences (set by the customer)',
      rows: [
        ['Appointment emails', onOff(!!data.comms.transactionalEmail)],
        ['Appointment texts', onOff(!!data.comms.transactionalSms)],
        ['Promotions by email', onOff(!!data.comms.marketingEmail)],
        ['Promotions by text', onOff(!!data.comms.marketingSms)],
        ...(data.comms.preferredContactMethod
          ? [['Preferred contact method', String(data.comms.preferredContactMethod)] as [string, string]]
          : []),
      ],
    },
    {
      title: 'Booking & Pet Service Preferences',
      rows: [
        ['Preferred Groomer', data.booking.preferredGroomerName || '—'],
        ['Preferred Days', data.booking.preferredDays?.length ? data.booking.preferredDays.map(dayLabel).join(', ') : '—'],
        ['Preferred Time Window', timeWindow],
        ['Preferred Shampoo', data.booking.preferredShampoo || '—'],
        ['Preferred Cut Style', data.booking.preferredCutStyle || '—'],
        ['Special Handling', data.booking.specialHandling || '—'],
      ],
    },
    {
      title: 'Payment',
      rows: [
        ['Preferred Payment Method', data.booking.preferredPaymentMethod ? (SETTINGS_PAYMENT_LABELS[data.booking.preferredPaymentMethod] || data.booking.preferredPaymentMethod) : '—'],
        ...(data.cards.state === 'ok'
          ? data.cards.cards.map((c: any) => [
              'Saved Card',
              `${c.brand} •••• ${c.last4}${c.expMonth ? ` (exp ${c.expMonth}/${c.expYear})` : ''}${c.isDefault ? ' — default' : ''}`,
            ] as [string, string])
          : [['Saved Cards', cardStateText[data.cards.state] || '—'] as [string, string]]),
      ],
    },
  ];

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto" data-purpose="customer-settings-view">
      <h3 className="text-lg font-bold mb-1">Customer Settings</h3>
      <p className="text-[12px] text-muted-foreground mb-4">
        What {data.contact?.email || 'this customer'} has set in their own portal — shown from the same records their portal writes.
      </p>
      <div className="space-y-4">
        {sections.map((s) => (
          <div key={s.title} className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/40 border-b border-border text-[12px] font-bold uppercase tracking-wider text-muted-foreground">{s.title}</div>
            <div className="divide-y divide-border/10">
              {s.rows.map(([label, value]) => (
                <div key={label + value} className="flex items-start justify-between gap-6 px-4 py-3">
                  <span className="text-[13px] text-muted-foreground font-medium">{label}</span>
                  <span className="text-[13px] font-semibold text-foreground text-right whitespace-pre-wrap">{value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/40 border-b border-border text-[12px] font-bold uppercase tracking-wider text-muted-foreground">Address Book</div>
          {Array.isArray(data.addresses) && data.addresses.length > 0 ? (
            <div className="divide-y divide-border/10">
              {data.addresses.map((a: any) => (
                <div key={a.id} className="px-4 py-3 text-[13px]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground capitalize">{a.addressType || 'Address'}</span>
                    {a.isDefault && <span className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">Default</span>}
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    {[a.name, a.company, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', '), a.postalCode, a.countryCode, a.phone]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-3 text-[13px] text-muted-foreground">No saved addresses.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Customer Intelligence (B.1.6 metrics, B.1.7 health, B.1.8 stages,
// B.1.9 behavioral, B.1.10 operational, B.1.11 marketing) — real data from
// GET /api/admin/crm/customers/[crmId]/metrics (customer-metrics +
// lifecycle-scoring libs over live tables). Stage apply persists through
// the same PATCH the directory uses. ----
const INTEL_STAGE_LABELS: Record<string, string> = {
  new_lead: 'New Lead',
  new_customer: 'New Customer',
  active: 'Active',
  vip: 'VIP',
  returning: 'Returning',
  lapsed: 'Lapsed',
  at_risk: 'At Risk',
  lost: 'Lost',
};

function CustomerIntelligencePanel({ crmId }: { crmId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [applying, setApplying] = useState(false);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!crmId) { setLoading(false); return; }
    setLoading(true);
    fetch(`/api/admin/crm/customers/${crmId}/metrics`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('metrics failed'))))
      .then((d) => {
        setData(d?.data || null);
        setCurrentStage(d?.data?.metrics?.lifecycleStage || null);
        setFailed(!d?.data);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [crmId]);

  useEffect(() => { load(); }, [load]);

  const applySuggested = async () => {
    const suggested = data?.lifecycle?.suggestedStage;
    if (!crmId || !suggested || applying) return;
    setApplying(true);
    setApplyMsg(null);
    try {
      const res = await fetch(`/api/admin/crm/customers/${crmId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lifecycle_stage: suggested }),
      });
      if (res.ok) {
        setCurrentStage(suggested);
        setApplyMsg(`Stage updated to ${INTEL_STAGE_LABELS[suggested] || suggested}.`);
      } else {
        setApplyMsg('Stage could not be saved.');
      }
    } catch {
      setApplyMsg('Stage could not be saved.');
    } finally {
      setApplying(false);
    }
  };

  const fmtMoney = (v: any) => `$${(Number(v) || 0).toFixed(2)}`;
  const fmtPct = (v: any) => `${Math.round((Number(v) || 0) * 100)}%`;
  const fmtDate = (v: any) => (v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

  if (!crmId) {
    return (
      <section data-purpose="customer-intelligence">
        <h2 className="text-sm font-semibold text-foreground mb-3">Customer Intelligence</h2>
        <div className="bg-card border border-border rounded-xl p-4 shadow-2xs text-[12px] text-muted-foreground">
          This profile is not linked to a CRM record, so lifecycle intelligence is unavailable.
        </div>
      </section>
    );
  }
  if (loading) {
    return (
      <section data-purpose="customer-intelligence">
        <h2 className="text-sm font-semibold text-foreground mb-3">Customer Intelligence</h2>
        <div className="bg-card border border-border rounded-xl p-4 shadow-2xs text-[12px] text-muted-foreground">Loading metrics, lifecycle health, and flags…</div>
      </section>
    );
  }
  if (failed || !data) {
    return (
      <section data-purpose="customer-intelligence">
        <h2 className="text-sm font-semibold text-foreground mb-3">Customer Intelligence</h2>
        <div className="bg-card border border-border rounded-xl p-4 shadow-2xs text-[12px] text-muted-foreground">Intelligence unavailable for this customer right now.</div>
      </section>
    );
  }

  const m = data.metrics || {};
  const lc = data.lifecycle || {};
  const beh = data.behavioral || {};
  const op = data.operational || {};
  const mkt = data.marketing || {};
  const suggested: string | null = lc.suggestedStage || null;
  const health = String(lc.health || 'healthy');
  const healthClass = health === 'at_risk'
    ? 'bg-red-100 text-red-700 border-red-300'
    : health === 'needs_attention'
      ? 'bg-amber-100 text-amber-700 border-amber-300'
      : 'bg-green-100 text-green-700 border-green-300';
  const healthLabel = health === 'at_risk' ? 'At Risk' : health === 'needs_attention' ? 'Needs Attention' : 'Healthy';

  const metricCells: [string, string][] = [
    ['Lifetime Value', fmtMoney(m.lifetimeValue)],
    ['Total Visits', String(m.totalVisits ?? 0)],
    ['Average Ticket', fmtMoney(m.averageTicket)],
    ['Last Visit', fmtDate(m.lastVisitAt)],
    ['Avg Frequency', m.averageVisitFrequencyDays ? `Every ${m.averageVisitFrequencyDays}d` : '—'],
    ['No-Show Rate', fmtPct(m.noShowRate)],
    ['Cancellation Rate', fmtPct(m.cancellationRate)],
    ['Rebook Rate', fmtPct(m.rebookRate)],
    ['Outstanding Balance', fmtMoney(m.outstandingBalance)],
    ['Customer Since', fmtDate(m.customerSince)],
    ['Total Appointments', String(m.totalAppointments ?? 0)],
  ];

  const behavioralChips: [string, boolean][] = [
    ['Frequent Visitor', !!beh.isFrequentVisitor],
    ['High LTV', !!beh.isHighLifetimeValue],
    ['Frequent No-Show', !!beh.isFrequentNoShow],
    ['Cancellation Risk', !!beh.isCancellationRisk],
    ['Price Sensitive', !!beh.isPriceSensitive],
    ['Online Booking Only', !!beh.isOnlineBookingOnly],
  ];
  const operationalFlags: [string, boolean][] = [
    ['Missing Documents', !!op.hasMissingDocuments],
    ['Vaccine Expiring', !!op.hasVaccineExpiring],
    ['Outstanding Balance', !!op.hasOutstandingBalance],
    ['No Upcoming Appointment', !!op.hasNoUpcomingAppointment],
    ['Intake Incomplete', !!op.hasIntakeIncomplete],
  ];
  const marketingChips: [string, boolean][] = [
    ['Birthday This Month', !!mkt.isBirthdayThisMonth],
    ['Rebooking Eligible', !!mkt.isEligibleForRebookingCampaign],
    ['Win-Back Candidate', !!mkt.isWinBackCandidate],
    ['New Customer Nurture', !!mkt.isNewCustomerNurture],
    ['Inactive 90+ Days', !!mkt.isInactive90Days],
  ];
  const chipCls = (on: boolean, tone: 'blue' | 'red' | 'violet') =>
    on
      ? tone === 'red'
        ? 'bg-red-50 text-red-700 border-red-300'
        : tone === 'violet'
          ? 'bg-violet-50 text-violet-700 border-violet-300'
          : 'bg-brand-teal/10 text-brand-teal border-brand-teal/40'
      : 'bg-muted/40 text-muted-foreground/60 border-border';

  return (
    <section data-purpose="customer-intelligence">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-foreground">Customer Intelligence</h2>
        <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full border ${healthClass}`}>{healthLabel}</span>
        <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full border bg-muted/40 text-foreground border-border">
          Stage: {INTEL_STAGE_LABELS[currentStage || ''] || currentStage || '—'}
        </span>
        {suggested && suggested !== currentStage && (
          <>
            <span className="text-[11px] text-muted-foreground">Suggested: <span className="font-semibold text-foreground">{INTEL_STAGE_LABELS[suggested] || suggested}</span></span>
            <button
              onClick={applySuggested}
              disabled={applying}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-40 cursor-pointer"
            >
              {applying ? 'Applying…' : 'Apply Suggested Stage'}
            </button>
          </>
        )}
        {applyMsg && <span className="text-[11px] text-muted-foreground">{applyMsg}</span>}
      </div>

      {Array.isArray(lc.reasons) && lc.reasons.length > 0 && (
        <div className="bg-card border border-border rounded-xl px-4 py-2.5 shadow-2xs mb-3">
          <ul className="list-disc pl-4 space-y-0.5">
            {lc.reasons.map((r: string, i: number) => (
              <li key={i} className="text-[12px] text-muted-foreground">{r}</li>
            ))}
          </ul>
          {lc.daysSinceLastVisit != null && (
            <div className="text-[11px] text-muted-foreground/70 mt-1">{lc.daysSinceLastVisit} days since last visit · expected cycle ~{lc.expectedCycleDays} days</div>
          )}
        </div>
      )}

      {/* 1.6 Metrics strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
        {metricCells.map(([label, value]) => (
          <div key={label} className="bg-card border border-border rounded-xl px-3 py-2.5 shadow-2xs">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
            <div className="text-[14px] tabular-nums font-semibold text-foreground mt-0.5">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* 1.9 Behavioral */}
        <div className="bg-card border border-border rounded-xl p-3 shadow-2xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Behavioral</div>
          <div className="flex flex-wrap gap-1.5">
            {behavioralChips.map(([label, on]) => (
              <span key={label} className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-full border ${chipCls(on, 'blue')}`}>{label}</span>
            ))}
          </div>
        </div>
        {/* 1.10 Operational */}
        <div className="bg-card border border-border rounded-xl p-3 shadow-2xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Operational Flags</div>
          <div className="flex flex-wrap gap-1.5">
            {operationalFlags.map(([label, on]) => (
              <span key={label} className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full border ${chipCls(on, 'red')}`}>
                {on && <AlertCircle className="w-3 h-3" />}{label}
              </span>
            ))}
          </div>
        </div>
        {/* 1.11 Marketing */}
        <div className="bg-card border border-border rounded-xl p-3 shadow-2xs">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Marketing Segments</div>
          <div className="flex flex-wrap gap-1.5">
            {marketingChips.map(([label, on]) => (
              <span key={label} className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-full border ${chipCls(on, 'violet')}`}>{label}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// Pet tags row (1.13) — badges + add/remove, wired to /api/admin/crm/pets/[id]/tags
function PetTagRow({ petId }: { petId: string }) {
  const [tags, setTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [available, setAvailable] = useState<{ id: string; name: string; color: string }[]>([]);
  const [open, setOpen] = useState(false);

  const load = () => {
    if (!petId) return;
    fetch(`/api/admin/crm/pets/${petId}/tags`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setTags(d.assigned || []);
        setAvailable(d.available || []);
      })
      .catch(() => {});
  };
  React.useEffect(() => { load(); }, [petId]);

  const assign = async (tagId: string) => {
    const res = await fetch(`/api/admin/crm/pets/${petId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: tagId }),
    });
    if (res.ok) load();
    setOpen(false);
  };
  const remove = async (tagId: string) => {
    const res = await fetch(`/api/admin/crm/pets/${petId}/tags?tag_id=${tagId}`, { method: 'DELETE' });
    if (res.ok) load();
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Tag className="w-3 h-3 text-muted-foreground" />
      {tags.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full border"
          style={{ borderColor: t.color || '#6B7280', color: t.color || '#6B7280', backgroundColor: `${t.color || '#6B7280'}14` }}
        >
          {t.name}
          <button onClick={() => remove(t.id)} className="hover:opacity-70 cursor-pointer" aria-label={`Remove ${t.name}`}>
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <Plus className="w-2.5 h-2.5" /> Tag
        </button>
        {open && (
          <div className="absolute z-50 mt-1 w-40 bg-background border border-border rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto">
            {available.length === 0 && <div className="px-3 py-1.5 text-[11px] text-muted-foreground">No tags available</div>}
            {available.map((t) => (
              <button
                key={t.id}
                onClick={() => assign(t.id)}
                className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-accent flex items-center gap-2 cursor-pointer"
              >
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: t.color || '#6B7280' }} />
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Customer appointment rows: real crm_appointments data (enriched list
// API) mapped into the display shape the appointments tab renders. ----
interface CustomerApptRow {
  id: string;
  date: string;
  time: string;
  duration: string;
  pet: string;
  service: string;
  groomer: string;
  status: string;
  location: string;
  startsAt: string;
  internalNotes: string;
  customerNotes: string;
}

// One row of the Communication tab — the normalized shape returned by
// GET /api/admin/crm/customers/[id]/communications.
interface CustomerCommRow {
  id: string;
  source: string;
  channel: string;
  type: string;
  direction: string;
  subject: string;
  preview: string;
  status: string;
  timestamp: string;
}

function commStatusBadgeClass(status: string): string {
  if (status === 'Sent' || status === 'Delivered' || status === 'Read') {
    return 'bg-success/10 text-success border-success/20';
  }
  if (status === 'Failed') {
    return 'bg-destructive/10 text-destructive border-destructive/20';
  }
  if (status === 'Queued') {
    return 'bg-primary/5 text-primary border-primary/20';
  }
  return 'bg-muted text-muted-foreground border-border';
}

const APPT_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  precheck: 'Pre-Check',
  rescheduled: 'Rescheduled',
  checked_in: 'Checked In',
  in_service: 'In Progress',
  completed: 'Checked Out',
  cancelled: 'Cancelled',
  canceled: 'Canceled',
  no_show: 'No Show',
  hold: 'On Hold',
  requested: 'Requested',
};

function formatApptDuration(startsAt?: string | null, endsAt?: string | null): string {
  if (!startsAt || !endsAt) return '';
  const mins = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins <= 0) return '';
  if (mins < 60) return `${mins} min`;
  const hrs = mins / 60;
  return `${Number.isInteger(hrs) ? hrs : hrs.toFixed(1)} hr${hrs === 1 ? '' : 's'}`;
}

function mapCrmAppointmentRow(a: any): CustomerApptRow {
  const startsAt = a.starts_at || '';
  const start = startsAt ? new Date(startsAt) : null;
  const statusKey = String(a.status || '').toLowerCase();
  return {
    id: String(a.id),
    date: start ? start.toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }) : '',
    time: start ? start.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }) : '',
    duration: formatApptDuration(a.starts_at, a.ends_at),
    pet: a.pet_names || a.pet_name || '',
    service: a.service_names || a.service_name || 'Grooming',
    groomer: a.groomer_name || '',
    status: APPT_STATUS_LABELS[statusKey] || (a.status || ''),
    location: a.location_name || '',
    startsAt,
    internalNotes: a.internal_notes || '',
    customerNotes: a.customer_notes || '',
  };
}

// Display label for a stored payment/invoice status. The stored value is
// the truth — this only renders it readably ('succeeded' → 'Paid').
function mapPaymentStatus(raw: string): string {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'succeeded' || s === 'paid') return 'Paid';
  if (s === 'refunded') return 'Refunded';
  if (s === 'pending') return 'Pending';
  if (s === 'failed') return 'Failed';
  if (s === 'unpaid') return 'Unpaid';
  if (s === 'open') return 'Open';
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const CustomerDetailsView: React.FC<CustomerDetailsViewProps> = ({
  customerProfile: initialProfile,
  onBackToDirectory,
  onOpenNewAppointment,
  onOpenAddPet,
  onOpenTakePayment,
  onOpenIntake,
}) => {
  const [profile, setProfile] = useState<CustomerFullProfile>(initialProfile);
  const [activeTab, setActiveTab] = useState<string>('Overview');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeQuickAction, setActiveQuickAction] = useState<
    'take_payment' | 'new_appointment' | 'add_pet' | 'send_message' | 'update_documents' | 'add_note' | null
  >(null);

  // Common Modals
  const [isEditCustomerOpen, setIsEditCustomerOpen] = useState(false);
  const [isSendMessageOpen, setIsSendMessageOpen] = useState(false);
  const [isAddPaymentMethodOpen, setIsAddPaymentMethodOpen] = useState(false);
  const [isUploadDocOpen, setIsUploadDocOpen] = useState(false);
  const [isAuditLogOpen, setIsAuditLogOpen] = useState(false);
  const [isCampaignOpen, setIsCampaignOpen] = useState(false);
  const [isOptInOutOpen, setIsOptInOutOpen] = useState(false);
  // Real campaigns (crm_campaigns) for the Campaign modal, and the
  // customer's STORED opt-in state for the Opt In/Out modal — both are
  // loaded when their modal opens, never defaulted or hardcoded.
  const [campaignOptions, setCampaignOptions] = useState<any[]>([]);
  const [optInPrefs, setOptInPrefs] = useState<{ sms: boolean; email: boolean; marketing: boolean; marketingSms: boolean } | null>(null);
  // Upload Document modal form state (real file upload).
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadPetId, setUploadPetId] = useState('');
  const [uploadSaving, setUploadSaving] = useState(false);

  // Pet Modals State
  const [selectedPetDetail, setSelectedPetDetail] = useState<CustomerPetDetail | null>(null);
  const [petToEdit, setPetToEdit] = useState<CustomerPetDetail | null>(null);
  const [petToManageVaccines, setPetToManageVaccines] = useState<CustomerPetDetail | null>(null);

  // Real API hooks (wired to /api/admin/*/actions)
  const editCustomer = useEditCustomer();
  const mergeCustomer = useMergeCustomer();
  const mergeHousehold = useMergeHousehold();
  const sendRebookingLink = useSendRebookingLink();
  const addToCampaign = useAddToCampaign();
  const printHistory = usePrintCustomerHistory();
  const sendMagicLink = useSendMagicLink();
  // Create Invoice opens the global invoice modal (SA-06) — the old
  // fin_create_invoice fire with only a customer_id created a $0.00
  // line-less invoice and toasted success.
  const setActiveModal = useAppStore((s) => s.setActiveModal);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [isMergeHouseholdOpen, setIsMergeHouseholdOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutAmount, setCheckoutAmount] = useState('');
  const [checkoutMethod, setCheckoutMethod] = useState('cash');
  const [checkoutApptId, setCheckoutApptId] = useState('');
  const [checkoutAppts, setCheckoutAppts] = useState<Array<{id: string; date: string; service: string; pet: string; status: string}>>([]);
  const checkout = useCheckout();
  const { bookNextVisit } = useBookNextVisit();

  // Load the customer's open appointments when the checkout modal opens.
  // crm_appointments.customer_id is the CRM id — the shop profile id
  // matches nothing there, so the CRM link keys this fetch.
  const openCheckout = async () => {
    setIsCheckoutOpen(true);
    setCheckoutApptId('');
    const apptCustomerId = (profile as any)?.crmCustomerId || profile.id;
    try {
      const res = await fetch(`/api/admin/crm/appointments?customer_id=${apptCustomerId}`, { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      const list = Array.isArray(j.appointments) ? j.appointments : Array.isArray(j.data) ? j.data : [];
      setCheckoutAppts(list.filter((a: any) => ['scheduled', 'confirmed', 'in_service', 'checked_in'].includes(String(a.status || '').toLowerCase())).map((a: any) => ({
        id: String(a.id), date: String(a.date || a.starts_at || ''), service: String(a.service || a.service_name || 'Service'),
        pet: String(a.pet || a.pet_name || ''), status: String(a.status || ''),
      })));
    } catch { setCheckoutAppts([]); }
  };

  // Appointment Modals & Data State — the customer's real appointments from
  // the CRM API (enriched with pet / service / groomer / location names).
  const [appointmentsList, setAppointmentsList] = useState<CustomerApptRow[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);

  // The enriched appointments list keys rows by crm_appointments.customer_id
  // — the CRM customer id, NOT the shop profile id (the old fetch used the
  // profile id and silently returned an empty list for every linked
  // customer). Reloadable so appointment actions can refresh after a write.
  const loadAppointments = useCallback(() => {
    const apptCustomerId = (initialProfile as any)?.crmCustomerId || (initialProfile as any)?.id;
    if (!apptCustomerId) return;
    setAppointmentsLoading(true);
    fetch(`/api/admin/crm/appointments?customer_id=${apptCustomerId}&enrich=1`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(d => {
        const rows = Array.isArray(d.data) ? d.data : Array.isArray(d.appointments) ? d.appointments : [];
        setAppointmentsList(rows.map(mapCrmAppointmentRow));
      })
      .catch(() => setAppointmentsList([]))
      .finally(() => setAppointmentsLoading(false));
  }, [(initialProfile as any)?.crmCustomerId, (initialProfile as any)?.id]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);
  const [activeApptActionMenu, setActiveApptActionMenu] = useState<string | null>(null);

  // Order Cases — real rows from /api/admin/crm/customers/[id]/cases
  // (public.order_cases: attached to the order AND this customer; the same
  // case is managed from the order detail screen too).
  type OrderCaseRow = {
    id: string; order_id: string; subject: string;
    reason?: string | null; note?: string | null; status: string;
    resolution_note?: string | null; created_at?: string; closed_at?: string | null;
  };
  const [casesList, setCasesList] = useState<OrderCaseRow[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);

  const fetchCases = async () => {
    const customerId = (initialProfile as any)?.id;
    if (!customerId) return;
    setCasesLoading(true);
    try {
      const r = await fetch(`/api/admin/crm/customers/${customerId}/cases`, { cache: 'no-store' });
      const d = r.ok ? await r.json() : { data: [] };
      setCasesList(Array.isArray(d.data) ? d.data : []);
    } catch { setCasesList([]); }
    finally { setCasesLoading(false); }
  };

  useEffect(() => {
    fetchCases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(initialProfile as any)?.id]);

  const toggleCaseStatus = async (c: OrderCaseRow) => {
    try {
      const res = await fetch(`/api/admin/orders/cases/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: c.status === 'open' ? 'closed' : 'open' }),
      });
      if (res.ok) fetchCases();
    } catch { /* leave the list as-is */ }
  };
  const [apptToReschedule, setApptToReschedule] = useState<any | null>(null);
  const [apptToUpdateAddons, setApptToUpdateAddons] = useState<any | null>(null);
  const [apptToViewDetails, setApptToViewDetails] = useState<any | null>(null);

  // Grooming History - real data from API
  const [groomingRecords, setGroomingRecords] = useState<any[]>([]);

  const loadGroomingRecords = useCallback(() => {
    // The grooming-records route keys rows by the CRM customer id
    // (crm_grooming_records.customer_id → crm_customers.id) and reads
    // the `customerId` param; it returns { records } with presented
    // field names (petName / serviceName / cutDetails / duration /
    // photos), mapped here to the field names this tab renders.
    const crmCustomerId = (initialProfile as any)?.crmCustomerId;
    if (!crmCustomerId) return;
    fetch(`/api/admin/crm/grooming-records?customerId=${crmCustomerId}`)
      .then(r => r.ok ? r.json() : { records: [] })
      .then(d => setGroomingRecords((d.records || []).map((rec: any) => ({
        ...rec,
        pet: rec.petName ?? '',
        service: rec.servicesSummary || rec.serviceName || '',
        notes: rec.cutDetails ?? '',
      }))))
      .catch(() => {});
  }, [(initialProfile as any)?.crmCustomerId]);

  useEffect(() => {
    loadGroomingRecords();
  }, [loadGroomingRecords]);
  const [recordToView, setRecordToView] = useState<any | null>(null);
  const [photosRecord, setPhotosRecord] = useState<any | null>(null);
  const [recommendRecord, setRecommendRecord] = useState<any | null>(null);

  // Payments & Invoice State
  const [invoiceToView, setInvoiceToView] = useState<any | null>(null);
  const [paymentToRefund, setPaymentToRefund] = useState<any | null>(null);
  const [paymentSearch, setPaymentSearch] = useState('');

  // Documents - real data from API
  const [documentsList, setDocumentsList] = useState<any[]>([]);

  const loadDocuments = useCallback(() => {
    // The documents route keys rows by the CRM customer id
    // (crm_documents.customer_id → crm_customers.id) and reads the
    // `customerId` param; it returns { documents } with presented field
    // names (petName / typeName / uploadedAt / expiresAt / storagePath),
    // mapped here to the field names this tab renders. Type shows the
    // document type's name when the row carries one, else its MIME type;
    // status is the stored crm_documents status, shown as-is.
    const crmCustomerId = (initialProfile as any)?.crmCustomerId;
    if (!crmCustomerId) return;
    fetch(`/api/admin/crm/documents?customerId=${crmCustomerId}`)
      .then(r => r.ok ? r.json() : { documents: [] })
      .then(d => setDocumentsList((d.documents || []).map((doc: any) => ({
        ...doc,
        type: doc.typeName || doc.mimeType || '—',
        pet: doc.petName || '—',
        uploaded: doc.uploadedAt ? String(doc.uploadedAt).slice(0, 10) : '—',
        expires: doc.expiresAt || '',
      }))))
      .catch(() => {});
  }, [(initialProfile as any)?.crmCustomerId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Notes & Timeline State (1.18) — real crm_notes rows, keyed by the CRM
  // customer id (the old load used the profile id and rendered the raw
  // rows against timeline fields they don't have, so real notes showed
  // blank). Rows are mapped to the timeline shape here; note_type is the
  // stored vocabulary: internal | customer_visible | appointment |
  // pet_handling | system.
  const [notesList, setNotesList] = useState<any[]>([]);

  const NOTE_TYPE_LABELS: Record<string, string> = {
    internal: 'Internal Note',
    customer_visible: 'Customer Note',
    appointment: 'Appointment Note',
    pet_handling: 'Pet Handling',
    system: 'System',
  };

  const loadNotes = () => {
    const customerId = (initialProfile as any)?.crmCustomerId || '';
    if (!customerId) return;
    fetch(`/api/admin/crm/notes?customer_id=${customerId}&order=created_at.desc&limit=100`)
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => {
        const rows = (d.data || []).map((row: any) => {
          const created = row.created_at ? new Date(row.created_at) : null;
          return {
            id: row.id,
            source: 'note',
            ts: created ? created.getTime() : 0,
            date: created ? created.toLocaleDateString() : '',
            time: created ? created.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '',
            actor: NOTE_TYPE_LABELS[row.note_type] || row.note_type || 'Note',
            actorType: row.note_type === 'system' ? 'System' : 'Staff',
            noteType: row.note_type || 'internal',
            petId: row.dependent_id || null,
            description: row.body || '',
            isPinned: !!row.is_pinned,
          };
        });
        // Keep in-session entries (payments etc.) that were prepended
        // locally with non-UUID ids; server rows replace the rest.
        setNotesList(prev => [...prev.filter((n: any) => !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(n.id))), ...rows]);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(initialProfile as any)?.crmCustomerId]);

  // Activity merge (B.1.3.7) — the timeline also carries REAL appointment
  // status transitions and audit entries from
  // GET /api/admin/crm/customers/[id]/activity (which merges crm_notes +
  // crm_appointment_status_history + crm_audit_log server-side). Notes
  // come from loadNotes above; here we keep only the activity + audit
  // sources so nothing is duplicated or fabricated.
  const [activityEntries, setActivityEntries] = useState<any[]>([]);
  const [auditEntries, setAuditEntries] = useState<any[]>([]);

  const loadActivity = useCallback(() => {
    const customerId = (initialProfile as any)?.id;
    if (!customerId) return;
    const linkedCrmId = (initialProfile as any)?.crmCustomerId || '';
    const qs = linkedCrmId ? `?crm_id=${encodeURIComponent(linkedCrmId)}` : '';
    fetch(`/api/admin/crm/customers/${customerId}/activity${qs}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(d => {
        const rows = Array.isArray(d.data) ? d.data : [];
        const mapped = rows
          .filter((r: any) => r.source !== 'note')
          .map((r: any) => {
            const when = r.timestamp ? new Date(r.timestamp) : null;
            return {
              id: r.id,
              source: r.source,
              ts: when ? when.getTime() : 0,
              date: when ? when.toLocaleDateString() : '',
              time: when ? when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '',
              actor: r.source === 'audit' ? 'Audit' : 'Activity',
              actorType: r.actorType || 'System',
              noteType: r.source === 'audit' ? 'system' : '__activity',
              description: r.description || '',
              isPinned: false,
            };
          });
        setActivityEntries(mapped);
        setAuditEntries(rows.filter((r: any) => r.source === 'audit'));
      })
      .catch(() => {});
  }, [(initialProfile as any)?.id, (initialProfile as any)?.crmCustomerId]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  // The rendered timeline: real notes + real activity/audit entries,
  // pinned notes first, then newest first.
  const timelineEntries = [...notesList, ...activityEntries].sort((a: any, b: any) => {
    if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1;
    return (b.ts || 0) - (a.ts || 0);
  });
  const [noteContent, setNoteContent] = useState('');
  const [notePetSelection, setNotePetSelection] = useState('');
  const [noteTypeSelection, setNoteTypeSelection] = useState('internal');
  const [noteSaving, setNoteSaving] = useState(false);
  const [activityFilter, setActivityFilter] = useState<'All' | 'internal' | 'customer_visible' | 'appointment' | 'pet_handling' | 'system'>('All');

  // ---- Tags & Lead Info (1.12, 1.14, 1.15) — real data from API ----
  const crmId = (initialProfile as any)?.crmCustomerId || '';

  // Load the real campaign list when the Campaign modal opens.
  useEffect(() => {
    if (!isCampaignOpen) return;
    fetch('/api/admin/crm/campaigns', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { campaigns: [] }))
      .then(d => setCampaignOptions(Array.isArray(d.campaigns) ? d.campaigns : []))
      .catch(() => setCampaignOptions([]));
  }, [isCampaignOpen]);

  // Load the customer's STORED opt-in columns when the Opt In/Out modal
  // opens, so the toggles show the saved state (never invented defaults).
  useEffect(() => {
    if (!isOptInOutOpen || !crmId) return;
    fetch(`/api/admin/crm/customers/${crmId}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const c = d?.customer || d?.data || d;
        if (!c) return;
        setOptInPrefs({
          sms: !!c.transactional_sms_opt_in,
          email: !!c.transactional_email_opt_in,
          marketing: !!c.marketing_email_opt_in,
          marketingSms: !!c.marketing_sms_opt_in,
        });
      })
      .catch(() => {});
  }, [isOptInOutOpen, crmId]);

  // Upload Document (Documents tab) — real multipart POST to the
  // documents route (private bucket customer-documents + crm_documents
  // row), keyed by the CRM customer id; the pet link resolves from the
  // profile pet to its CRM pet id when one exists.
  const handleUploadDocument = async () => {
    if (!uploadFile) {
      showToast('Choose a file to upload first.');
      return;
    }
    if (!crmId) {
      showToast('Link this profile to a CRM record to upload documents.');
      return;
    }
    setUploadSaving(true);
    try {
      const selectedPet = (profile.pets || []).find((p: any) => p.id === uploadPetId);
      const crmPetId = selectedPet ? await resolveCrmPetId(selectedPet) : null;
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('customer_id', crmId);
      if (crmPetId) fd.append('dependent_id', crmPetId);
      if (uploadName.trim()) fd.append('name', uploadName.trim());
      const res = await fetch('/api/admin/crm/documents', { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) {
        showToast(j?.error || 'Document upload failed.');
        return;
      }
      setIsUploadDocOpen(false);
      setUploadFile(null);
      setUploadName('');
      setUploadPetId('');
      showToast('Document uploaded and saved to the customer record.');
      loadDocuments();
    } catch {
      showToast('Document upload failed — network error.');
    } finally {
      setUploadSaving(false);
    }
  };
  const [customerTags, setCustomerTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [availableTags, setAvailableTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [leadSources, setLeadSources] = useState<{ id: string; name: string }[]>([]);
  const [leadInfo, setLeadInfo] = useState({
    lead_source_id: '',
    lead_owner_id: '',
    first_contact_at: '',
    last_activity_at: '',
    next_follow_up_at: '',
    lead_status: '',
    conversion_date: '',
    preferred_location_id: '',
  });
  // Preferred Location (audit §1.2.3a) — crm_customers.preferred_location_id
  // is the customer's location boundary: the Customers directory filter keys
  // off it. It was read-only-by-omission (no surface could assign it); this
  // picker writes it through the same PATCH as the rest of Lead Info.
  const [locationOptions, setLocationOptions] = useState<{ id: string; name: string }[]>([]);
  const [leadSaving, setLeadSaving] = useState(false);
  const [leadSavedTick, setLeadSavedTick] = useState(false);
  // Lead Owner picker (1.15) — real staff from crm_staff via the staff
  // route. lead_owner_id is an FK to crm_staff; the old free-text input
  // could only write values the FK rejects.
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string }[]>([]);
  // Permanent alerts for this customer (1.18 pet handling) — real rows
  // from /api/admin/crm/permanent_alerts, grouped per pet in the pet cards.
  const [petAlerts, setPetAlerts] = useState<any[]>([]);

  const loadPetAlerts = () => {
    if (!crmId) return;
    fetch(`/api/admin/crm/permanent_alerts?customerId=${crmId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPetAlerts((d?.alerts || []).filter((a: any) => a.is_active)))
      .catch(() => {});
  };

  const loadCustomerTags = () => {
    if (!crmId) return;
    fetch(`/api/admin/crm/customers/${crmId}/tags`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setCustomerTags(d.assigned || []);
        setAvailableTags(d.available || []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadCustomerTags();
    loadPetAlerts();
    fetch('/api/admin/crm/lead-sources')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setLeadSources(d?.data || []))
      .catch(() => {});
    fetch('/api/admin/crm/staff')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStaffOptions((d?.staff || []).map((s: any) => ({ id: s.id, name: s.displayName || [s.firstName, s.lastName].filter(Boolean).join(' ') || s.id }))))
      .catch(() => {});
    fetch('/api/admin/crm/locations')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setLocationOptions((d?.locations || []).map((l: any) => ({ id: l.id, name: l.name || l.id }))))
      .catch(() => {});
    if (crmId) {
      fetch(`/api/admin/crm/customers/${crmId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const row = d?.data || {};
          setLeadInfo({
            lead_source_id: row.lead_source_id || '',
            lead_owner_id: row.lead_owner_id || '',
            first_contact_at: row.first_contact_at ? String(row.first_contact_at).slice(0, 10) : '',
            // Last activity: the stored column when set; otherwise the
            // customer's updated_at — every real write to the record
            // touches it, so it is the honest activity signal on file.
            last_activity_at: row.last_activity_at ? String(row.last_activity_at).slice(0, 10) : (row.updated_at ? String(row.updated_at).slice(0, 10) : ''),
            next_follow_up_at: row.next_follow_up_at ? String(row.next_follow_up_at).slice(0, 10) : '',
            lead_status: row.lead_status || '',
            conversion_date: row.conversion_date ? String(row.conversion_date).slice(0, 10) : '',
            preferred_location_id: row.preferred_location_id || '',
          });
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crmId]);

  const assignTag = async (tagId: string) => {
    if (!crmId || !tagId) return;
    const res = await fetch(`/api/admin/crm/customers/${crmId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: tagId }),
    });
    if (res.ok) loadCustomerTags();
    setTagPickerOpen(false);
  };

  const removeTag = async (tagId: string) => {
    if (!crmId || !tagId) return;
    const res = await fetch(`/api/admin/crm/customers/${crmId}/tags?tag_id=${tagId}`, { method: 'DELETE' });
    if (res.ok) loadCustomerTags();
  };

  const saveLeadInfo = async () => {
    if (!crmId) return;
    setLeadSaving(true);
    try {
      const payload: Record<string, any> = {
        lead_source_id: leadInfo.lead_source_id || null,
        lead_owner_id: leadInfo.lead_owner_id || null,
        first_contact_at: leadInfo.first_contact_at || null,
        next_follow_up_at: leadInfo.next_follow_up_at || null,
        lead_status: leadInfo.lead_status || null,
        conversion_date: leadInfo.conversion_date || null,
        preferred_location_id: leadInfo.preferred_location_id || null,
      };
      const res = await fetch(`/api/admin/crm/customers/${crmId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setLeadSavedTick(true);
        setTimeout(() => setLeadSavedTick(false), 2000);
      }
    } finally {
      setLeadSaving(false);
    }
  };

  // Communication Tab State — real history from
  // GET /api/admin/crm/customers/[id]/communications (merges the
  // `communications` send log with `crm_messages` for the linked CRM record).
  const [commSubTab, setCommSubTab] = useState<'Messages' | 'Email History' | 'SMS History' | 'Templates'>('Messages');
  // Real message templates from GET /api/admin/crm/message_templates
  // (crm_message_templates rows, or the route's code defaults when the
  // table is empty — the endpoint is the single source of truth).
  const [messageTemplates, setMessageTemplates] = useState<any[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== 'Communication' || commSubTab !== 'Templates') return;
    setTemplatesLoading(true);
    fetch('/api/admin/crm/message_templates', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { templates: [] }))
      .then(d => setMessageTemplates(Array.isArray(d.templates) ? d.templates : []))
      .catch(() => setMessageTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, [activeTab, commSubTab]);

  // Open the send-message modal prefilled from a real template, with the
  // documented placeholders substituted for this customer.
  const applyTemplate = (tpl: any) => {
    const firstName = (profile.name || '').split(' ')[0] || profile.name || '';
    const petName = profile.pets?.[0]?.name || 'your pet';
    const body = String(tpl.body || '')
      .replaceAll('{customerName}', firstName)
      .replaceAll('{petName}', petName)
      .replaceAll('{date}', '')
      .replaceAll('{time}', '');
    setMessageText(body);
    setMessageChannel(String(tpl.channel || '').toLowerCase() === 'email' ? 'Email' : 'SMS');
    setIsSendMessageOpen(true);
  };
  const [commChannelFilter, setCommChannelFilter] = useState<string>('All Channels');
  const [commTypeFilter, setCommTypeFilter] = useState<string>('All Types');
  const [communicationsList, setCommunicationsList] = useState<CustomerCommRow[]>([]);
  const [commsLoading, setCommsLoading] = useState(false);

  const loadCommunications = useCallback(async () => {
    const customerId = (initialProfile as any)?.id;
    if (!customerId) return;
    setCommsLoading(true);
    try {
      const qs = crmId ? `?crm_id=${encodeURIComponent(crmId)}` : '';
      const res = await fetch(`/api/admin/crm/customers/${customerId}/communications${qs}`, { cache: 'no-store' });
      const j = res.ok ? await res.json().catch(() => ({})) : {};
      setCommunicationsList(Array.isArray(j.data) ? j.data : []);
    } catch {
      setCommunicationsList([]);
    } finally {
      setCommsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(initialProfile as any)?.id, crmId]);

  useEffect(() => {
    loadCommunications();
  }, [loadCommunications]);

  // Payment History — real records from
  // GET /api/admin/crm/customers/[id]/payments (commerce_payments +
  // shop invoices + acct_ar_receipts for this customer). Fetched rows are
  // kept apart from profile.paymentHistory, which holds only payments
  // recorded in this session; the tab renders the two merged.
  const [fetchedPayments, setFetchedPayments] = useState<any[]>([]);

  const loadPaymentHistory = useCallback(async () => {
    const customerId = (initialProfile as any)?.id;
    if (!customerId) return;
    try {
      const qs = crmId ? `?crm_id=${encodeURIComponent(crmId)}` : '';
      const res = await fetch(`/api/admin/crm/customers/${customerId}/payments${qs}`, { cache: 'no-store' });
      const j = res.ok ? await res.json().catch(() => ({})) : {};
      const rows = Array.isArray(j.data) ? j.data : [];
      setFetchedPayments(
        rows.map((r: any) => ({
          id: r.id,
          kind: r.kind,
          date: r.timestamp
            ? new Date(r.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '—',
          type: r.type,
          description: r.description,
          amount: Number(r.amount) || 0,
          status: mapPaymentStatus(r.status),
          method: r.method || 'Unspecified',
          invoiceNumber: r.invoiceNumber || null,
          reference: r.reference || null,
          petName: r.petName || null,
        })),
      );
    } catch {
      setFetchedPayments([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(initialProfile as any)?.id, crmId]);

  useEffect(() => {
    loadPaymentHistory();
  }, [loadPaymentHistory]);

  // Sub-tabs act as a channel filter on top of the dropdown filters.
  const commSubTabChannel =
    commSubTab === 'Email History' ? 'Email' : commSubTab === 'SMS History' ? 'SMS' : 'All Channels';
  const visibleComms = communicationsList
    .filter((c) => (commSubTabChannel === 'All Channels' ? true : c.channel === commSubTabChannel))
    .filter((c) => (commChannelFilter === 'All Channels' ? true : c.channel === commChannelFilter))
    .filter((c) => (commTypeFilter === 'All Types' ? true : c.type === commTypeFilter));
  const commTypeOptions = Array.from(new Set(communicationsList.map((c) => c.type)));

  // Message Form State
  const [messageChannel, setMessageChannel] = useState<'SMS' | 'Email'>('SMS');
  const [messageText, setMessageText] = useState('');
  const [messageSending, setMessageSending] = useState(false);

  // Edit Customer Form State
  const [editName, setEditName] = useState(profile.name);
  const [editPhone, setEditPhone] = useState(profile.phone);
  const [editEmail, setEditEmail] = useState(profile.email);
  const [editAddress, setEditAddress] = useState(profile.address);

  // Filters for Appointments and Grooming
  const [apptStatusFilter, setApptStatusFilter] = useState<'Upcoming' | 'Past' | 'All'>('Upcoming');
  const [apptPetFilter, setApptPetFilter] = useState<string>('All Pets');
  const [apptTypeFilter, setApptTypeFilter] = useState<string>('All Statuses');
  const [groomingPetFilter, setGroomingPetFilter] = useState<string>('All Pets');
  const [groomingServiceFilter, setGroomingServiceFilter] = useState<string>('All Services');
  const [groomingGroomerFilter, setGroomingGroomerFilter] = useState<string>('All Groomers');

  // ---- Real pagination for this profile's data tables -----------------
  // The filtered sets are hoisted out of the JSX (the exact filter chains
  // the tables always rendered) so paging composes AFTER filtering; any
  // filter change — or switching to a different customer — resets each
  // table to page 1.
  const pagerCustomerKey = (initialProfile as any)?.crmCustomerId || (initialProfile as any)?.id || '';
  const filteredApptRows = appointmentsList
    .filter((a) => {
      // Upcoming / Past / All — by the appointment's real start time and
      // terminal status (same semantics the table render always used).
      if (apptStatusFilter === 'All') return true;
      const starts = a.startsAt ? new Date(a.startsAt).getTime() : NaN;
      const terminal = ['Completed', 'Cancelled', 'No-Show'].includes(a.status);
      if (apptStatusFilter === 'Past') return terminal || (Number.isFinite(starts) && starts < Date.now());
      return !terminal && (!Number.isFinite(starts) || starts >= Date.now());
    })
    .filter((a) => (apptPetFilter === 'All Pets' ? true : a.pet === apptPetFilter))
    .filter((a) => (apptTypeFilter === 'All Statuses' ? true : a.status === apptTypeFilter));
  const apptDetailPager = useTablePagination(filteredApptRows, {
    resetDeps: [pagerCustomerKey, apptStatusFilter, apptPetFilter, apptTypeFilter],
  });
  const filteredGroomingRows = groomingRecords
    .filter((r) => (groomingPetFilter === 'All Pets' ? true : r.pet === groomingPetFilter))
    .filter((r) => (groomingServiceFilter === 'All Services' ? true : r.service === groomingServiceFilter))
    .filter((r) => (groomingGroomerFilter === 'All Groomers' ? true : r.groomer === groomingGroomerFilter));
  const groomingPager = useTablePagination(filteredGroomingRows, {
    resetDeps: [pagerCustomerKey, groomingPetFilter, groomingServiceFilter, groomingGroomerFilter],
  });
  const docsPager = useTablePagination(documentsList, {
    resetDeps: [pagerCustomerKey],
  });
  const commsPager = useTablePagination(visibleComms, {
    resetDeps: [pagerCustomerKey, commSubTab, commChannelFilter, commTypeFilter],
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  /* ------------------- ACTIONS: 1. OVERVIEW ------------------- */
  // Edit Customer (SA-15) — persists to the CRM record via
  // PATCH /api/admin/crm/customers/[crmId] (crm_customers columns:
  // first_name / last_name / phone / email / address_line1). Local state
  // updates ONLY on a confirmed 2xx — the old handler applied the edit
  // locally even when the API failed ("Saved locally"), which fabricated
  // a save that never happened, and it targeted the shop id, which the
  // crm_edit_customer handler silently no-ops on.
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crmId) {
      showToast('Link this profile to a CRM record to edit customer details.');
      return;
    }
    const parts = editName.trim().split(/\s+/);
    const firstName = parts.shift() || '';
    const lastName = parts.join(' ');
    try {
      const res = await fetch(`/api/admin/crm/customers/${crmId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          phone: editPhone,
          email: editEmail,
          address_line1: editAddress,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) {
        showToast(j?.error || 'Customer could not be saved — nothing was changed.');
        return;
      }
      setProfile(prev => ({
        ...prev,
        name: editName,
        phone: editPhone,
        email: editEmail,
        address: editAddress,
      }));
      setIsEditCustomerOpen(false);
      showToast('Customer contact & account details saved.');
    } catch {
      showToast('Customer could not be saved — network error.');
    }
  };

  // Sends through POST /api/admin/crm/customers/[id]/communications.
  // Email is a real Resend send and SMS a real Twilio send (BL-10,
  // lib/messaging/sms); both land in the history log. When a channel
  // isn't configured the API refuses and we surface that instead of
  // pretending the message went out.
  const handleSendMessageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || messageSending) return;
    const customerId = (initialProfile as any)?.id;
    if (!customerId) {
      showToast('Customer record unavailable.');
      return;
    }
    setMessageSending(true);
    try {
      const res = await fetch(`/api/admin/crm/customers/${customerId}/communications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: messageChannel.toLowerCase(),
          body: messageText,
          crm_id: crmId || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        showToast(j.error || `${messageChannel} could not be sent.`);
        return;
      }
      setMessageText('');
      setIsSendMessageOpen(false);
      showToast(`${messageChannel} sent to ${profile.name}`);
      loadCommunications();
    } catch {
      showToast(`${messageChannel} could not be sent.`);
    } finally {
      setMessageSending(false);
    }
  };

  /* ------------------- ACTIONS: 2. PETS ------------------- */
  // Profile pets carry shop dog ids (or, for pets added this session, CRM
  // pet ids). crm_pets rows link back to the shop dog via source_pet_id,
  // so resolve the CRM pet id before any CRM write: try the id itself,
  // then the source_pet_id link. Returns null when no CRM pet matches —
  // callers then refuse honestly instead of writing to the wrong record.
  const resolveCrmPetId = async (pet: any): Promise<string | null> => {
    const rawId = String(pet?.id || '');
    const isUuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
    if (!isUuidShape) return null;
    try {
      const byId = await fetch(`/api/admin/crm/pets?id=${rawId}&limit=1`, { cache: 'no-store' });
      const bj = byId.ok ? await byId.json().catch(() => ({})) : {};
      if (Array.isArray(bj.data) && bj.data.length > 0) return String(bj.data[0].id);
      const bySource = await fetch(`/api/admin/crm/pets?source_pet_id=${rawId}&limit=1`, { cache: 'no-store' });
      const sj = bySource.ok ? await bySource.json().catch(() => ({})) : {};
      if (Array.isArray(sj.data) && sj.data.length > 0) return String(sj.data[0].id);
    } catch { /* unresolved — caller refuses honestly */ }
    return null;
  };

  // Set Primary persists via PATCH /api/admin/crm/pets/[id] { isPrimary }
  // (the route demotes the customer's other primary pets and writes the
  // crm_party_dependents link). Local state changes only on a confirmed 2xx.
  const handleSetPrimaryPet = async (petId: string) => {
    const targetPet = (profile.pets || []).find(p => p.id === petId);
    const crmPetId = await resolveCrmPetId(targetPet);
    if (!crmPetId) {
      showToast('This pet has no CRM record yet — it cannot be marked primary.');
      return;
    }
    try {
      const res = await fetch(`/api/admin/crm/pets/${crmPetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrimary: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) {
        showToast(j?.error || 'Primary pet could not be saved.');
        return;
      }
      setProfile(prev => ({
        ...prev,
        pets: (prev.pets || []).map(p => ({ ...p, isPrimary: p.id === petId })),
      }));
      showToast(`Marked ${targetPet?.name || 'Pet'} as primary/default for booking.`);
    } catch {
      showToast('Primary pet could not be saved — network error.');
    }
  };

  // Edit Pet persists via PATCH /api/admin/crm/pets/[id] (name / breed /
  // sex / weight / date_of_birth / medical_notes). vaccinationsStatus is
  // derived from crm_pet_vaccinations, not a pet column, so it is managed
  // in the Vaccines modal, not written here.
  const handleSavePetEdit = async (updatedPet: CustomerPetDetail) => {
    const crmPetId = await resolveCrmPetId(updatedPet);
    if (!crmPetId) {
      showToast('This pet has no CRM record yet — its changes cannot be saved.');
      return;
    }
    const weightNum = parseFloat(String(updatedPet.weight || '').replace(/[^0-9.]/g, ''));
    try {
      const res = await fetch(`/api/admin/crm/pets/${crmPetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: updatedPet.name,
          breed: updatedPet.breed || null,
          sex: String(updatedPet.gender || '').toLowerCase() || undefined,
          weight: Number.isFinite(weightNum) && weightNum > 0 ? weightNum : undefined,
          dateOfBirth: updatedPet.birthDate || undefined,
          medicalNotes: updatedPet.medicalAlert || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) {
        showToast(j?.error || 'Pet could not be saved — nothing was changed.');
        return;
      }
      setProfile(prev => ({
        ...prev,
        pets: (prev.pets || []).map(p => (p.id === updatedPet.id ? updatedPet : p)),
      }));
      showToast(`Updated ${updatedPet.name}'s profile and health information.`);
    } catch {
      showToast('Pet could not be saved — network error.');
    }
  };

  /* ------------------- ACTIONS: 3. APPOINTMENTS ------------------- */
  // All appointment actions post to the real appointments actions API
  // (status transitions + history rows + audit are written server-side)
  // and the list reloads from the server afterwards. Nothing here
  // mutates local state on faith.
  const postApptAction = async (action: string, payload: Record<string, unknown>) => {
    const res = await fetch('/api/admin/crm/appointments/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j?.error) throw new Error(j?.error || 'Action failed');
    return j;
  };

  // Advance follows the stored status flow: Scheduled/Confirmed →
  // check_in, Checked In → in_service, In Progress → complete.
  const handleStatusCycle = async (apptId: string) => {
    const appt = appointmentsList.find(a => a.id === apptId);
    if (!appt) return;
    const action =
      appt.status === 'Checked In' ? 'apt_in_service'
      : appt.status === 'In Progress' ? 'apt_complete'
      : ['Scheduled', 'Confirmed', 'Requested', 'Pre-Check', 'Rescheduled'].includes(appt.status) ? 'apt_check_in'
      : null;
    if (!action) {
      showToast(`"${appt.status}" is the final state for this appointment — nothing to advance.`);
      return;
    }
    try {
      await postApptAction(action, { appointment_id: apptId });
      showToast(`Marked ${appt.pet}'s appointment as advanced.`);
      loadAppointments();
    } catch (err) {
      showToast(`Status could not be updated: ${(err as Error).message}`);
    }
  };

  const handleCancelAppointment = async (apptId: string) => {
    const target = appointmentsList.find(a => a.id === apptId);
    try {
      await postApptAction('apt_cancel', { appointment_id: apptId });
      showToast(`Appointment for ${target?.pet || 'pet'} has been cancelled.`);
      loadAppointments();
    } catch (err) {
      showToast(`Appointment could not be cancelled: ${(err as Error).message}`);
    }
  };

  // The actions API sends the branded reminder EMAIL and reports
  // honestly whether it went out.
  const handleSendApptReminder = async (appt: any) => {
    try {
      const j = await postApptAction('apt_send_reminder', { appointment_id: appt.id });
      showToast(j?.reminderSent ? `Reminder email sent for ${appt.pet}'s session on ${appt.date}.` : 'Reminder logged — no email address on file for this customer.');
    } catch (err) {
      showToast(`Reminder could not be sent: ${(err as Error).message}`);
    }
  };

  const handleAddToWaitlist = async () => {
    if (!crmId) {
      showToast('Link this profile to a CRM record to use the waitlist.');
      return;
    }
    try {
      await postApptAction('apt_add_to_waitlist', { customer_id: crmId });
      showToast(`Added ${profile.name} to the grooming waitlist.`);
    } catch (err) {
      showToast(`Could not add to waitlist: ${(err as Error).message}`);
    }
  };

  // Reschedule posts the new slot to the actions API (which also records
  // the status-history row and emails the customer); the list reloads.
  const handleRescheduleAppointment = async (appt: any, startsAtIso: string) => {
    try {
      await postApptAction('apt_reschedule', { appointment_id: appt.id, new_starts_at: startsAtIso });
      showToast(`Rescheduled ${appt.pet}'s appointment.`);
      loadAppointments();
    } catch (err) {
      showToast(`Reschedule failed: ${(err as Error).message}`);
    }
  };

  // Add-on services post to POST /api/admin/crm/appointments/[id]/services
  // (real crm_appointment_services rows at stored prices + totals update).
  const handleAddApptServices = async (appt: any, serviceIds: string[]) => {
    if (serviceIds.length === 0) return;
    try {
      for (const serviceId of serviceIds) {
        const res = await fetch(`/api/admin/crm/appointments/${appt.id}/services`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service_id: serviceId }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j?.error) throw new Error(j?.error || 'Service could not be added');
      }
      showToast(`Added ${serviceIds.length} service${serviceIds.length === 1 ? '' : 's'} to ${appt.pet}'s appointment.`);
      loadAppointments();
    } catch (err) {
      showToast(`Services could not be updated: ${(err as Error).message}`);
    }
  };

  /* ------------------- ACTIONS: 4. GROOMING HISTORY ------------------- */
  // Adds a real crm_notes row linked to the grooming record
  // (service_record_id) instead of editing the displayed text locally.
  const handleAddGroomingNotePrompt = async (recordId: string) => {
    const note = window.prompt('Enter clinical grooming note to add to this session:');
    if (!note) return;
    if (!crmId) {
      showToast('Link this profile to a CRM record to add grooming notes.');
      return;
    }
    try {
      const res = await fetch('/api/admin/crm/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: crmId,
          service_record_id: recordId,
          note_type: 'internal',
          body: note,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) {
        showToast(j?.error || 'Grooming note could not be saved.');
        return;
      }
      showToast('Grooming note saved to the customer timeline.');
      loadNotes();
    } catch {
      showToast('Grooming note could not be saved — network error.');
    }
  };

  // Print History (grooming tab) — compiles the customer's REAL grooming
  // records into a print window (the A.2.19 pattern), instead of printing
  // the whole admin page with window.print().
  const handlePrintGroomingHistory = async () => {
    const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const rows = groomingRecords.map((r: any) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #ddd">${esc(r.date)}</td><td style="padding:4px 8px;border-bottom:1px solid #ddd">${esc(r.pet)}</td><td style="padding:4px 8px;border-bottom:1px solid #ddd">${esc(r.service)}</td><td style="padding:4px 8px;border-bottom:1px solid #ddd">${esc(r.groomer)}</td><td style="padding:4px 8px;border-bottom:1px solid #ddd">${esc(r.duration || '—')}</td><td style="padding:4px 8px;border-bottom:1px solid #ddd">${esc(r.notes)}</td></tr>`).join('');
    const ok = await openPrintDocument({
      docType: 'document',
      title: `Grooming History — ${profile.name}`,
      bodyHtml: `<h2 style="margin:0 0 8px;">UnSaid Memories — Grooming History</h2><p><strong>${esc(profile.name)}</strong>${profile.email ? ` · ${esc(profile.email)}` : ''}</p><table style="border-collapse:collapse;width:100%"><thead><tr><th style="text-align:left;padding:4px 8px">Date</th><th style="text-align:left;padding:4px 8px">Pet</th><th style="text-align:left;padding:4px 8px">Service</th><th style="text-align:left;padding:4px 8px">Groomer</th><th style="text-align:left;padding:4px 8px">Duration</th><th style="text-align:left;padding:4px 8px">Notes</th></tr></thead><tbody>${rows || '<tr><td colspan="6" style="padding:8px">No grooming records on file.</td></tr>'}</tbody></table><p style="color:#666;font-size:12px;margin-top:16px">699 Waring Rd, Memphis, TN 38122 · 901-722-1114</p>`,
    });
    if (!ok) {
      showToast('History compiled — allow pop-ups to print it.');
    }
  };

  // Recommend Next Visit — persists a real crm_rebooking_recommendations
  // row via POST /api/admin/crm/customers/[crmId]/rebooking.
  const handleRecommendNextVisit = async (record: any, recommendedDate: string, intervalLabel: string) => {
    if (!crmId) {
      showToast('Link this profile to a CRM record to save a recommendation.');
      return;
    }
    try {
      const res = await fetch(`/api/admin/crm/customers/${crmId}/rebooking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dependent_id: record?.petId || undefined,
          recommended_date: recommendedDate,
          reason: `Grooming history recommendation (${intervalLabel})`,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) {
        showToast(j?.error || 'Recommendation could not be saved.');
        return;
      }
      showToast(`Next visit for ${record?.pet || 'pet'} recommended on ${recommendedDate}.`);
    } catch {
      showToast('Recommendation could not be saved — network error.');
    }
  };

  /* ------------------- ACTIONS: 5. PAYMENTS ------------------- */
  // Cards on file live in Stripe (see /api/customer/payment-methods —
  // SA-148): they are collected through Stripe at checkout or from the
  // customer's own portal, never by typing a raw card number into the
  // admin panel. The old handler fabricated a "saved" default method in
  // local state only. This now says so instead of pretending to save.
  const handleAddCard = (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddPaymentMethodOpen(false);
  };

  const handleConfirmRefund = async (amount: number, reason: string) => {
    // REAL refund (was fiction: a success toast with no API call at all).
    // Posts to the existing accounting refund handler — it writes the
    // acct_ar_refunds ledger row and the balanced GL reversal
    // (Dr 4000 / Cr 1000). Only uuid-shaped ids are passed: payment rows
    // here are a merged feed (commerce payments, shop invoices, AR
    // receipts) and acct_ar_refunds.payment_id/customer_id are uuid
    // columns, so non-uuid references stay out instead of dying on a cast.
    const isUuid = (v: unknown) =>
      typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
    const item: any = paymentToRefund || {};
    try {
      const res = await fetch('/api/admin/accounting/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refund_issue',
          payload: {
            payment_id: item.kind === 'payment' && isUuid(item.id) ? item.id : null,
            customer_id: isUuid(profile.id) ? profile.id : null,
            amount_cents: Math.round(amount * 100),
            reason,
          },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) {
        showToast(j?.error || 'Refund could not be issued — nothing was recorded.');
        return;
      }
      showToast(`Refund of $${amount.toFixed(2)} issued (${reason}).`);
      setPaymentToRefund(null);
      loadPaymentHistory();
    } catch {
      showToast('Refund could not be issued — nothing was recorded.');
    }
  };

  /* ------------------- ACTIONS: 6. DOCUMENTS ------------------- */
  const handleVerifyDocument = async (docId: string) => {
    // Real PATCH (was local-state only): PATCH /api/admin/crm/documents/[id]
    // accepts { status } from the crm_documents vocabulary; verification is
    // status 'approved'. Local state updates ONLY on a confirmed 2xx, using
    // the status the server returns; failures leave the row unchanged.
    try {
      const res = await fetch(`/api/admin/crm/documents/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        showToast(j.error || 'Document could not be verified.');
        return;
      }
      setDocumentsList(prev =>
        prev.map(d => (d.id === docId ? { ...d, status: j.status || 'approved' } : d))
      );
      showToast('Document marked as verified by staff.');
    } catch {
      showToast('Document could not be verified.');
    }
  };

  /* ------------------- ACTIONS: 7. NOTES & ACTIVITY ------------------- */
  // Add Note (1.18) — REAL write to crm_notes via POST /api/admin/crm/notes
  // with the stored note_type. (The old handler only prepended a local
  // object — the note vanished on reload.) Pet-handling notes also create
  // a permanent alert on the pet, which is how they surface on the pet
  // card and stay visible across appointments.
  const handleAddNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim() || noteSaving) return;
    if (!crmId) {
      showToast('Link this profile to a CRM record to add notes.');
      return;
    }
    setNoteSaving(true);
    try {
      // The pet picker carries profile (shop dog) ids — resolve to the
      // CRM pet id, since crm_notes.dependent_id FKs to crm_pets. Unresolved
      // pets attach no pet link rather than failing the whole note.
      const selectedPet = profile.pets.find((p) => p.id === notePetSelection);
      const petId = selectedPet ? await resolveCrmPetId(selectedPet) : null;
      const res = await fetch('/api/admin/crm/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: crmId,
          dependent_id: petId,
          note_type: noteTypeSelection,
          body: noteContent.trim(),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error || !j?.data) {
        showToast(j?.error || 'Note could not be saved — nothing was added.');
        return;
      }
      if (noteTypeSelection === 'pet_handling') {
        const pet = profile.pets.find((p) => p.id === petId);
        const alertRes = await fetch('/api/admin/crm/permanent_alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: crmId,
            dependent_id: petId,
            severity: 'warning',
            title: `Pet handling${pet ? ` — ${pet.name}` : ''}`,
            body: noteContent.trim(),
          }),
        }).catch(() => null);
        if (alertRes && alertRes.ok) loadPetAlerts();
        else showToast('Note saved, but the permanent pet alert could not be created.');
      }
      setNoteContent('');
      setNotePetSelection('');
      loadNotes();
      showToast('Note saved to client timeline.');
    } catch {
      showToast('Note could not be saved — network error.');
    } finally {
      setNoteSaving(false);
    }
  };

  // Pin toggle (1.18) — persists is_pinned through PATCH /api/admin/crm/notes
  // for real note rows; in-session entries (non-UUID ids) stay local.
  const togglePinNote = async (noteId: string) => {
    const note = notesList.find((n) => n.id === noteId);
    if (!note) return;
    const next = !note.isPinned;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(noteId))) {
      try {
        const res = await fetch(`/api/admin/crm/notes/${noteId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_pinned: next }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j?.error) {
          showToast(j?.error || 'Pin could not be saved.');
          return;
        }
      } catch {
        showToast('Pin could not be saved — network error.');
        return;
      }
    }
    setNotesList(prev =>
      prev.map(n => (n.id === noteId ? { ...n, isPinned: next } : n))
    );
    showToast(next ? 'Note pinned.' : 'Note unpinned.');
  };

  // Snooze rebooking (1.19) — writes crm_rebooking_recommendations
  // (status 'snoozed' + snoozed_until) via the crm_snooze_rebooking
  // action; the crm_needs_rebooking candidate view excludes actively
  // snoozed customers, so the snooze is respected, not just toasted.
  const snoozeRebooking = async () => {
    if (!crmId) {
      showToast('Link this profile to a CRM record to snooze rebooking.');
      return;
    }
    const input = window.prompt('Snooze rebooking reminders for how many days?', '30');
    if (input === null) return;
    const days = parseInt(input, 10);
    if (!days || days < 1 || days > 365) {
      showToast('Enter a number of days between 1 and 365.');
      return;
    }
    try {
      const res = await fetch('/api/admin/crm/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'crm_snooze_rebooking', payload: { customer_id: crmId, days } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        showToast(j?.error || 'Snooze could not be saved.');
        return;
      }
      showToast(`Rebooking snoozed until ${j.snoozedUntil || 'the selected date'}.`);
    } catch {
      showToast('Snooze could not be saved — network error.');
    }
  };

  // Add to Rebooking Campaign (1.19.3) — enrolls the customer in the
  // tenant's rebooking automation: a crm_automation_enrollments row
  // (status 'queued') against the workflow_type='rebooking' workflow,
  // via the crm_enroll_rebooking_campaign action. Distinct from Add to
  // Campaign (marketing → crm_campaign_members).
  const enrollRebookingCampaign = async () => {
    if (!crmId) {
      showToast('Link this profile to a CRM record to add them to the rebooking campaign.');
      return;
    }
    try {
      const res = await fetch('/api/admin/crm/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'crm_enroll_rebooking_campaign', payload: { customer_id: crmId } }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        showToast(j?.error || 'Enrollment could not be saved.');
        return;
      }
      showToast(j.alreadyEnrolled
        ? `${profile.name} is already enrolled in the rebooking campaign.`
        : `${profile.name} added to the rebooking campaign.`);
    } catch {
      showToast('Enrollment could not be saved — network error.');
    }
  };

  const tabsList = [
    'Overview',
    `Pets (${profile.pets.length})`,
    'Appointments',
    'Grooming History',
    'Service Profile',
    'Payments',
    'Documents',
    'Notes & Activity',
    'Communication',
  ];

  if (activeQuickAction === 'take_payment') {
    return (
      <main className="min-w-0 flex-1 overflow-y-auto bg-[#f8fafc] antialiased font-sans text-[13px] sm:text-sm text-foreground flex flex-col min-h-screen">
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 bg-card text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-[13px] font-medium border border-border animate-in fade-in slide-in-from-top-2 duration-200">
            <Check className="w-4 h-4 text-success" />
            <span>{toastMessage}</span>
          </div>
        )}
        <QuickActionTakePaymentView
          customer={profile}
          onCancel={() => setActiveQuickAction(null)}
          onSuccess={(msg) => {
            // The payment was recorded server-side by the QA view — reload
            // the real history (and its computed totals) rather than
            // fabricating an in-session row and fake timeline entry.
            loadPaymentHistory();
            showToast(msg);
            setActiveQuickAction(null);
          }}
        />
      </main>
    );
  }

  if (activeQuickAction === 'new_appointment') {
    return (
      <main className="min-w-0 flex-1 overflow-y-auto bg-[#f8fafc] antialiased font-sans text-[13px] sm:text-sm text-foreground flex flex-col min-h-screen">
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 bg-card text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-[13px] font-medium border border-border animate-in fade-in slide-in-from-top-2 duration-200">
            <Check className="w-4 h-4 text-success" />
            <span>{toastMessage}</span>
          </div>
        )}
        <QuickActionNewAppointmentView
          customer={profile}
          onCancel={() => setActiveQuickAction(null)}
          onOpenAddPetModal={() => setActiveQuickAction('add_pet')}
          onSuccess={(msg) => {
            // The appointment was created server-side — reload the real
            // list instead of fabricating a row with a fake id.
            loadAppointments();
            showToast(msg);
            setActiveQuickAction(null);
          }}
        />
      </main>
    );
  }

  if (activeQuickAction === 'add_pet') {
    return (
      <main className="min-w-0 flex-1 overflow-y-auto bg-[#f8fafc] antialiased font-sans text-[13px] sm:text-sm text-foreground flex flex-col min-h-screen">
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 bg-card text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-[13px] font-medium border border-border animate-in fade-in slide-in-from-top-2 duration-200">
            <Check className="w-4 h-4 text-success" />
            <span>{toastMessage}</span>
          </div>
        )}
        <QuickActionAddPetView
          customer={profile}
          onCancel={() => setActiveQuickAction(null)}
          onOpenManageVaccines={(pet) => setPetToManageVaccines(pet)}
          onSuccess={(msg, res) => {
            if (res?.pet) {
              setProfile(prev => ({
                ...prev,
                pets: [...prev.pets, res.pet],
              }));
            }
            showToast(msg);
            setActiveQuickAction(null);
          }}
        />
      </main>
    );
  }

  if (activeQuickAction === 'send_message') {
    return (
      <main className="min-w-0 flex-1 overflow-y-auto bg-[#f8fafc] antialiased font-sans text-[13px] sm:text-sm text-foreground flex flex-col min-h-screen">
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 bg-card text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-[13px] font-medium border border-border animate-in fade-in slide-in-from-top-2 duration-200">
            <Check className="w-4 h-4 text-success" />
            <span>{toastMessage}</span>
          </div>
        )}
        <QuickActionSendMessageView
          customer={profile}
          onCancel={() => setActiveQuickAction(null)}
          onSuccess={(msg) => {
            // Don't fabricate a "Delivered" history entry — refresh the
            // real communication log so the tab shows only actual records.
            loadCommunications();
            showToast(msg);
            setActiveQuickAction(null);
          }}
        />
      </main>
    );
  }

  if (activeQuickAction === 'update_documents') {
    return (
      <main className="min-w-0 flex-1 overflow-y-auto bg-[#f8fafc] antialiased font-sans text-[13px] sm:text-sm text-foreground flex flex-col min-h-screen">
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 bg-card text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-[13px] font-medium border border-border animate-in fade-in slide-in-from-top-2 duration-200">
            <Check className="w-4 h-4 text-success" />
            <span>{toastMessage}</span>
          </div>
        )}
        <QuickActionUpdateDocumentsView
          customer={profile}
          onCancel={() => setActiveQuickAction(null)}
          onSuccess={(msg) => {
            showToast(msg);
            setActiveQuickAction(null);
          }}
        />
      </main>
    );
  }

  if (activeQuickAction === 'add_note') {
    return (
      <main className="min-w-0 flex-1 overflow-y-auto bg-[#f8fafc] antialiased font-sans text-[13px] sm:text-sm text-foreground flex flex-col min-h-screen">
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 bg-card text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-[13px] font-medium border border-border animate-in fade-in slide-in-from-top-2 duration-200">
            <Check className="w-4 h-4 text-success" />
            <span>{toastMessage}</span>
          </div>
        )}
        <QuickActionAddNoteView
          customer={profile}
          onCancel={() => setActiveQuickAction(null)}
          onSuccess={(msg) => {
            // The note was saved server-side — reload the real timeline.
            loadNotes();
            showToast(msg);
            setActiveQuickAction(null);
          }}
        />
      </main>
    );
  }

  // In-session payments first, then the customer's fetched real history.
  const paymentRows = [...(profile.paymentHistory || []), ...fetchedPayments];
  // Payment Ledger paging — the search filter chain the table always
  // rendered, hoisted so the slice composes after it.
  const filteredPaymentRows = paymentRows.filter((p) =>
    p.description.toLowerCase().includes(paymentSearch.toLowerCase()) ||
    p.type.toLowerCase().includes(paymentSearch.toLowerCase())
  );
  const paymentsPager = useTablePagination(filteredPaymentRows, {
    resetDeps: [pagerCustomerKey, paymentSearch],
  });

  return (
    <div className="min-w-0 flex-1 flex flex-col h-screen overflow-hidden bg-card antialiased font-sans text-[13px] sm:text-sm text-foreground" data-purpose="customer-profile-container">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-primary text-primary-foreground px-4 py-3 rounded-lg shadow-2xl flex items-center gap-2.5 text-[13px] tabular-nums border border-border animate-in slide-in-from-bottom-3 duration-200">
          <Check className="w-4 h-4 text-success" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Section */}
      <header className="bg-card border-b border-border px-6 py-4 shrink-0" data-purpose="customer-page-header">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBackToDirectory}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border hover:border-border text-foreground hover:text-foreground text-[13px] tabular-nums font-semibold uppercase tracking-wider transition-colors cursor-pointer bg-muted/40"
            >
              ← Back
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-foreground uppercase tracking-tight">{profile.name}</h1>
                <span className="inline-flex items-center px-2 py-0.5 text-[10px] tabular-nums font-semibold uppercase bg-primary text-primary-foreground">
                  {profile.status || 'Active'}
                </span>
                {profile.vip && (
                  <span className="inline-flex items-center px-2 py-0.5 text-[10px] tabular-nums font-semibold uppercase bg-muted/40 text-foreground border border-border">
                    VIP Member
                  </span>
                )}
                <button
                  onClick={() => setIsEditCustomerOpen(true)}
                  className="text-muted-foreground/70 hover:text-foreground p-1 transition-colors cursor-pointer"
                  title="Edit Customer Details"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[13px] text-muted-foreground tabular-nums">
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-muted-foreground/70" />
                  <span>{profile.phone}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3 h-3 text-muted-foreground/70" />
                  <span>{profile.email}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-muted-foreground/70" />
                  <span>{profile.address}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveQuickAction('take_payment')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-border hover:border-border text-[13px] tabular-nums font-semibold uppercase tracking-wider text-foreground bg-card hover:bg-muted/40 transition-colors cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Take Payment</span>
            </button>

            <button
              onClick={() => {
                if (onOpenNewAppointment) onOpenNewAppointment();
                else setActiveQuickAction('new_appointment');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 text-[13px] tabular-nums font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Appointment</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container with Sidebar + Content */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Left Sidebar Navigation */}
        <aside className="w-full md:w-64 bg-muted/40/50 border-r border-border flex flex-col justify-between shrink-0 overflow-y-auto">
          <div className="p-4 space-y-6">
            <div>
              <div className="text-[10px] tabular-nums uppercase tracking-wider text-muted-foreground/70 font-semibold px-3 mb-2">
                Core Profile
              </div>
              <div className="space-y-1">
                <button
                  onClick={() => setActiveTab('Overview')}
                  className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-semibold transition-colors text-left cursor-pointer ${
                    activeTab === 'Overview'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <UserCheck className="w-4 h-4" />
                    <span>Overview &amp; Stats</span>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('Pets')}
                  className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-semibold transition-colors text-left cursor-pointer ${
                    activeTab === 'Pets'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <PawPrint className="w-4 h-4" />
                    <span>Pets &amp; Household</span>
                  </div>
                  <span className={`text-[10px] tabular-nums px-1.5 py-0.5 ${
                    activeTab === 'Pets' ? 'bg-muted text-white' : 'bg-muted text-foreground'
                  }`}>
                    {profile.pets.length}
                  </span>
                </button>
              </div>
            </div>

            <div>
              <div className="text-[10px] tabular-nums uppercase tracking-wider text-muted-foreground/70 font-semibold px-3 mb-2">
                Service &amp; Care
              </div>
              <div className="space-y-1">
                <button
                  onClick={() => setActiveTab('Appointments')}
                  className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-semibold transition-colors text-left cursor-pointer ${
                    activeTab === 'Appointments'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-4 h-4" />
                    <span>Appointments</span>
                  </div>
                  <span className={`text-[10px] tabular-nums px-1.5 py-0.5 ${
                    activeTab === 'Appointments' ? 'bg-muted text-white' : 'bg-muted text-foreground'
                  }`}>
                    {appointmentsList.length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('Grooming History')}
                  className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-semibold transition-colors text-left cursor-pointer ${
                    activeTab === 'Grooming History'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Scissors className="w-4 h-4" />
                    <span>Grooming Log</span>
                  </div>
                  <span className={`text-[10px] tabular-nums px-1.5 py-0.5 ${
                    activeTab === 'Grooming History' ? 'bg-muted text-white' : 'bg-muted text-foreground'
                  }`}>
                    {groomingRecords.length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('Service Profile')}
                  className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-semibold transition-colors text-left cursor-pointer ${
                    activeTab === 'Service Profile'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Star className="w-4 h-4" />
                    <span>Service Profile</span>
                  </div>
                </button>
              </div>
            </div>

            <div>
              <div className="text-[10px] tabular-nums uppercase tracking-wider text-muted-foreground/70 font-semibold px-3 mb-2">
                Financial &amp; Billing
              </div>
              <div className="space-y-1">
                <button
                  onClick={() => setActiveTab('Payments')}
                  className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-semibold transition-colors text-left cursor-pointer ${
                    activeTab === 'Payments'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <CreditCard className="w-4 h-4" />
                    <span>Invoices &amp; Ledger</span>
                  </div>
                </button>
              </div>
            </div>

            <div>
              <div className="text-[10px] tabular-nums uppercase tracking-wider text-muted-foreground/70 font-semibold px-3 mb-2">
                Records &amp; Comms
              </div>
              <div className="space-y-1">
                <button
                  onClick={() => setActiveTab('Documents')}
                  className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-semibold transition-colors text-left cursor-pointer ${
                    activeTab === 'Documents'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FileCheck className="w-4 h-4" />
                    <span>Documents &amp; Waivers</span>
                  </div>
                  <span className={`text-[10px] tabular-nums px-1.5 py-0.5 ${
                    activeTab === 'Documents' ? 'bg-muted text-white' : 'bg-muted text-foreground'
                  }`}>
                    {documentsList.length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('Notes & Activity')}
                  className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-semibold transition-colors text-left cursor-pointer ${
                    activeTab === 'Notes & Activity'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-4 h-4" />
                    <span>Timeline &amp; Notes</span>
                  </div>
                  <span className={`text-[10px] tabular-nums px-1.5 py-0.5 ${
                    activeTab === 'Notes & Activity' ? 'bg-muted text-white' : 'bg-muted text-foreground'
                  }`}>
                    {notesList.length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('Communication')}
                  className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-semibold transition-colors text-left cursor-pointer ${
                    activeTab === 'Communication'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <MessageSquare className="w-4 h-4" />
                    <span>Message Center</span>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('Cases')}
                  className={`w-full flex items-center justify-between px-3 py-2 text-[13px] font-semibold transition-colors text-left cursor-pointer ${
                    activeTab === 'Cases'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <AlertCircle className="w-4 h-4" />
                    <span>Order Cases</span>
                  </div>
                  <span className={`text-[10px] tabular-nums px-1.5 py-0.5 ${
                    activeTab === 'Cases' ? 'bg-muted text-white' : 'bg-muted text-foreground'
                  }`}>
                    {casesList.filter(c => c.status === 'open').length} open
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar Bottom Quick Actions & Balance summary */}
          <div className="p-4 border-t border-border bg-card space-y-3">
            <div className="bg-muted/40 border border-border p-3 space-y-1">
              <div className="text-[10px] tabular-nums uppercase text-muted-foreground font-semibold">Balance Due</div>
              <div className="text-base tabular-nums font-semibold text-foreground">
                ${(profile.outstandingBalance ?? 0).toFixed(2)}
              </div>
              <div className="text-[10px] tabular-nums text-muted-foreground/70">
                LTV: ${(profile.lifetimeValue ?? profile.totalSpent ?? 0).toFixed(2)}
              </div>
            </div>

            <div className="space-y-1.5">
              <button
                onClick={() => setActiveQuickAction('send_message')}
                className="w-full py-1.5 px-2.5 border border-border hover:border-border bg-card hover:bg-muted/40 text-[11px] tabular-nums font-semibold uppercase text-foreground flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Send className="w-3 h-3" />
                <span>Send SMS / Message</span>
              </button>
              <button
                onClick={() => setActiveQuickAction('add_note')}
                className="w-full py-1.5 px-2.5 border border-border hover:border-border bg-card hover:bg-muted/40 text-[11px] tabular-nums font-semibold uppercase text-foreground flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileEdit className="w-3 h-3" />
                <span>Add Note</span>
              </button>
              <button
                onClick={() => setActiveQuickAction('add_pet')}
                className="w-full py-1.5 px-2.5 border border-border hover:border-border bg-card hover:bg-muted/40 text-[11px] tabular-nums font-semibold uppercase text-foreground flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add New Pet</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Right Scrollable Main Content */}
        <main className="flex-1 overflow-y-auto bg-muted/40/60 p-6 lg:p-8">
          {/* -------------------------------------------------------------
           * TAB 1: OVERVIEW
           * ----------------------------------------------------------- */}
          {activeTab === 'Overview' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              {/* Metric Cards Section (5 columns) */}
              <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3" data-purpose="metric-summary-cards">
                <div className="bg-card p-4 border border-border shadow-2xs flex items-center gap-3">
                  <div className="w-9 h-9 bg-muted/40 text-foreground border border-border flex items-center justify-center shrink-0">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] tabular-nums uppercase tracking-wider text-muted-foreground">Lifetime Value</div>
                    <div className="text-base tabular-nums font-semibold text-foreground mt-0.5">${(profile.lifetimeValue ?? profile.totalSpent ?? 0).toFixed(2)}</div>
                  </div>
                </div>

                <div className="bg-card p-4 border border-border shadow-2xs flex items-center gap-3">
                  <div className="w-9 h-9 bg-muted/40 text-foreground border border-border flex items-center justify-center shrink-0">
                    <BadgeDollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] tabular-nums uppercase tracking-wider text-muted-foreground">Total Spent</div>
                    <div className="text-base tabular-nums font-semibold text-foreground mt-0.5">${(profile.totalSpent ?? 0).toFixed(2)}</div>
                  </div>
                </div>

                <div className="bg-card p-4 border border-border shadow-2xs flex items-center gap-3">
                  <div className="w-9 h-9 bg-muted/40 text-foreground border border-border flex items-center justify-center shrink-0">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] tabular-nums uppercase tracking-wider text-muted-foreground">Balance Due</div>
                    <div className="text-base tabular-nums font-semibold text-foreground mt-0.5">${(profile.outstandingBalance ?? 0).toFixed(2)}</div>
                  </div>
                </div>

                <div className="bg-card p-4 border border-border shadow-2xs flex items-center gap-3">
                  <div className="w-9 h-9 bg-muted/40 text-foreground border border-border flex items-center justify-center shrink-0">
                    <Star className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] tabular-nums uppercase tracking-wider text-muted-foreground">Loyalty Pts</div>
                    <div className="text-base tabular-nums font-semibold text-foreground mt-0.5">
                      {profile.loyaltyPoints ?? 0} <span className="text-[10px] text-muted-foreground/70 font-normal">pts</span>
                    </div>
                  </div>
                </div>

                <div className="bg-card p-4 border border-border shadow-2xs flex items-center gap-3">
                  <div className="w-9 h-9 bg-muted/40 text-foreground border border-border flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] tabular-nums uppercase tracking-wider text-muted-foreground">Customer Since</div>
                    <div className="text-sm tabular-nums font-semibold text-foreground mt-0.5">{profile.customerSince || profile.memberSince || 'Apr 12, 2023'}</div>
                  </div>
                </div>
              </section>

          {/* Customer Intelligence — B.1.6 metrics, B.1.7 health, B.1.8 stage,
              B.1.9 behavioral, B.1.10 operational, B.1.11 marketing */}
          <CustomerIntelligencePanel crmId={crmId} />

          {/* Tags & Lead Info (1.12, 1.14, 1.15) */}
          <section className="grid grid-cols-12 gap-5" data-purpose="tags-and-lead-info">
            {/* Customer Tags */}
            <div className="col-span-12 lg:col-span-5">
              <h2 className="text-sm font-semibold text-foreground mb-3">Tags</h2>
              <div className="bg-card border border-border rounded-xl p-4 shadow-2xs">
                <div className="flex flex-wrap items-center gap-2">
                  {customerTags.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-semibold rounded-full border"
                      style={{ borderColor: t.color || '#6B7280', color: t.color || '#6B7280', backgroundColor: `${t.color || '#6B7280'}14` }}
                    >
                      {t.name}
                      <button onClick={() => removeTag(t.id)} className="hover:opacity-70 cursor-pointer" aria-label={`Remove ${t.name}`}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {customerTags.length === 0 && (
                    <span className="text-[12px] text-muted-foreground">No tags assigned</span>
                  )}
                  <div className="relative">
                    <button
                      onClick={() => setTagPickerOpen(!tagPickerOpen)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-medium rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add Tag
                    </button>
                    {tagPickerOpen && (
                      <div className="absolute z-50 mt-1 w-48 bg-background border border-border rounded-lg shadow-lg py-1 max-h-56 overflow-y-auto">
                        {availableTags.length === 0 && (
                          <div className="px-3 py-1.5 text-[11px] text-muted-foreground">No tags available</div>
                        )}
                        {availableTags.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => assignTag(t.id)}
                            className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-accent flex items-center gap-2 cursor-pointer"
                          >
                            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color || '#6B7280' }} />
                            {t.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {!crmId && (
                  <div className="mt-2 text-[11px] text-muted-foreground">Link this profile to a CRM record to manage tags.</div>
                )}
              </div>
            </div>

            {/* Lead Info */}
            <div className="col-span-12 lg:col-span-7">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground">Lead Info</h2>
                <button
                  onClick={saveLeadInfo}
                  disabled={leadSaving || !crmId}
                  className="px-3 py-1.5 text-[12px] font-semibold rounded-lg border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-40 cursor-pointer"
                >
                  {leadSaving ? 'Saving…' : leadSavedTick ? 'Saved ✓' : 'Save Lead Info'}
                </button>
              </div>
              <div className="bg-card border border-border rounded-xl p-4 shadow-2xs grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Lead Source</span>
                  <select
                    value={leadInfo.lead_source_id}
                    onChange={(e) => setLeadInfo({ ...leadInfo, lead_source_id: e.target.value })}
                    className="mt-1 w-full h-9 rounded-lg border border-border bg-background px-2 text-[13px] text-foreground"
                  >
                    <option value="">— Select —</option>
                    {leadSources.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Lead Status</span>
                  <select
                    value={leadInfo.lead_status}
                    onChange={(e) => setLeadInfo({ ...leadInfo, lead_status: e.target.value })}
                    className="mt-1 w-full h-9 rounded-lg border border-border bg-background px-2 text-[13px] text-foreground"
                  >
                    <option value="">— Select —</option>
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                    <option value="converted">Converted</option>
                    <option value="lost">Lost</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Lead Owner</span>
                  <select
                    value={leadInfo.lead_owner_id}
                    onChange={(e) => setLeadInfo({ ...leadInfo, lead_owner_id: e.target.value })}
                    className="mt-1 w-full h-9 rounded-lg border border-border bg-background px-2 text-[13px] text-foreground"
                  >
                    <option value="">— Unassigned —</option>
                    {staffOptions.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                    {leadInfo.lead_owner_id && !staffOptions.some((s) => s.id === leadInfo.lead_owner_id) && (
                      <option value={leadInfo.lead_owner_id}>Current owner (inactive)</option>
                    )}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Preferred Location</span>
                  <select
                    value={leadInfo.preferred_location_id}
                    onChange={(e) => setLeadInfo({ ...leadInfo, preferred_location_id: e.target.value })}
                    className="mt-1 w-full h-9 rounded-lg border border-border bg-background px-2 text-[13px] text-foreground"
                  >
                    <option value="">— No location assigned —</option>
                    {locationOptions.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                    {leadInfo.preferred_location_id && !locationOptions.some((l) => l.id === leadInfo.preferred_location_id) && (
                      <option value={leadInfo.preferred_location_id}>Current location (inactive)</option>
                    )}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Next Follow-Up</span>
                  <input
                    type="date"
                    value={leadInfo.next_follow_up_at}
                    onChange={(e) => setLeadInfo({ ...leadInfo, next_follow_up_at: e.target.value })}
                    className="mt-1 w-full h-9 rounded-lg border border-border bg-background px-2 text-[13px] text-foreground"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">First Contact</span>
                  <input
                    type="date"
                    value={leadInfo.first_contact_at}
                    onChange={(e) => setLeadInfo({ ...leadInfo, first_contact_at: e.target.value })}
                    className="mt-1 w-full h-9 rounded-lg border border-border bg-background px-2 text-[13px] text-foreground"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Conversion Date</span>
                  <input
                    type="date"
                    value={leadInfo.conversion_date}
                    onChange={(e) => setLeadInfo({ ...leadInfo, conversion_date: e.target.value })}
                    className="mt-1 w-full h-9 rounded-lg border border-border bg-background px-2 text-[13px] text-foreground"
                  />
                </label>
                <div className="sm:col-span-2 flex items-center justify-between pt-1 border-t border-border/60">
                  <span className="text-[11px] text-muted-foreground">
                    Last activity: {leadInfo.last_activity_at || '—'}
                  </span>
                  {!crmId && (
                    <span className="text-[11px] text-muted-foreground">Link this profile to a CRM record to edit lead info.</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Middle Grid Section: Pets, Account & Payment, Quick Actions */}
          <section className="grid grid-cols-12 gap-5" data-purpose="pets-and-quick-actions-row">
            {/* Pets Grid Container (Col span 7) */}
            <div className="col-span-12 lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Pets ({profile.pets.length})</h2>
                <button
                  onClick={onOpenAddPet}
                  className="text-[13px] font-semibold text-primary hover:text-primary flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Pet</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {profile.pets.map((pet) => (
                  <div
                    key={pet.id}
                    className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-2xs"
                  >
                    <div>
                      <div className="flex gap-3.5 items-start">
                        <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-muted/40 shrink-0">
                          <Image
                            src={pet.imageUrl}
                            alt={pet.name}
                            fill
                            className="object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground text-sm">{pet.name}</span>
                            {pet.isPrimary && (
                              <span className="text-[10px] bg-primary/5 text-primary px-1.5 py-0.5 rounded font-medium border border-primary/20">
                                Primary
                              </span>
                            )}
                          </div>
                          <div className="text-[13px] text-muted-foreground">{pet.breed} • {pet.gender}</div>
                          <div className="text-[11px] text-muted-foreground/70">Born: {pet.birthDate} • {pet.age}</div>
                          <div className="text-[11px] text-muted-foreground font-medium">Weight: {pet.weight}</div>
                        </div>
                      </div>

                      <div className="mt-4 space-y-1.5 pt-3 border-t border-border">
                        <div className="flex items-center gap-1.5 text-[13px] text-foreground">
                          <CheckCircle className="w-3.5 h-3.5 text-success" />
                          <span><strong>Vaccinations</strong> {pet.vaccinationsStatus}</span>
                        </div>
                        {pet.medicalAlert && (
                          <div className="flex items-center gap-1.5 text-[13px] text-warning">
                            <AlertCircle className="w-3.5 h-3.5 text-warning" />
                            <span>{pet.medicalAlert}</span>
                          </div>
                        )}
                        {/* Permanent handling alerts (1.18) — real rows from
                            crm_permanent_alerts for this pet. */}
                        {petAlerts.filter((a) => a.dependent_id === pet.id).map((a) => (
                          <div key={a.id} className={`flex items-start gap-1.5 text-[13px] ${a.severity === 'critical' ? 'text-destructive' : 'text-warning'}`}>
                            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span><strong>{a.title}:</strong> {a.body}</span>
                          </div>
                        ))}
                        <PetTagRow petId={pet.id} />
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border">
                      <div className="grid grid-cols-2 text-[11px] mb-3">
                        <div>
                          <span className="text-muted-foreground/70 block">Last Groom</span>
                          <span className="font-semibold text-foreground">{pet.lastGroomDate}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground/70 block">Next Appt</span>
                          <span className="font-semibold text-foreground">{pet.nextApptDate}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedPetDetail(pet)}
                        className="w-full py-2 bg-muted/40 hover:bg-muted/40 text-primary text-[13px] font-semibold rounded-lg transition border border-border/60 cursor-pointer"
                      >
                        View Pet Profile
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Account & Payment Widget (Col span 3) */}
            <div className="col-span-12 lg:col-span-3 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Account &amp; Payment</h2>
              <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between h-[calc(100%-2rem)] shadow-2xs">
                <div className="space-y-4">
                  <div className="text-[13px] font-medium text-muted-foreground">Default Payment Method</div>
                  {profile.defaultPaymentMethod?.last4 ? (
                    <div className="p-3 bg-muted/40 border border-border rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-7 bg-primary text-primary-foreground font-semibold rounded flex items-center justify-center text-[10px]">
                          {profile.defaultPaymentMethod.cardBrand || 'Card'}
                        </div>
                        <div>
                          <div className="text-[13px] font-semibold text-foreground">
                            {profile.defaultPaymentMethod.cardBrand || 'Card'} •••• {profile.defaultPaymentMethod.last4}
                          </div>
                          {profile.defaultPaymentMethod.expires ? (
                            <div className="text-[10px] text-muted-foreground/70">
                              Expires {profile.defaultPaymentMethod.expires}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <span className="bg-success/10 text-success text-[10px] font-semibold px-2 py-0.5 rounded border border-success/20">
                        Default
                      </span>
                    </div>
                  ) : (
                    <div className="p-3 bg-muted/40 border border-border rounded-xl text-[13px] text-muted-foreground">
                      No payment method on file
                    </div>
                  )}

                  <button
                    onClick={() => setIsAddPaymentMethodOpen(true)}
                    className="text-[13px] font-medium text-primary hover:text-primary flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Payment Method</span>
                  </button>
                </div>

                <div className="mt-6 pt-4 border-t border-border">
                  <div className="text-[13px] text-muted-foreground">Outstanding Balance</div>
                  <div className="text-xl font-semibold text-success mt-0.5">
                    ${(profile.outstandingBalance ?? 0).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions Sidebar (Col span 2) - ALL ACTIONS FROM SPEC */}
            <div className="col-span-12 lg:col-span-2 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Quick Actions</h2>
              <div className="bg-card border border-border rounded-xl p-2.5 flex flex-col gap-1.5 shadow-2xs">
                <button
                  onClick={() => setActiveQuickAction('new_appointment')}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer"
                >
                  <CalendarPlus className="w-4 h-4 text-primary" />
                  <span>New Appointment</span>
                </button>

                <button
                  onClick={() => setActiveQuickAction('add_pet')}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer"
                >
                  <PawPrint className="w-4 h-4 text-primary" />
                  <span>Add Pet</span>
                </button>

                <button
                  onClick={() => setActiveQuickAction('take_payment')}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer"
                >
                  <CreditCard className="w-4 h-4 text-primary" />
                  <span>Take Payment</span>
                </button>

                <button
                  onClick={() => setActiveQuickAction('send_message')}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <span>Send Message</span>
                </button>

                <button
                  onClick={() => {
                    // Honest call action: no telephony provider exists, so
                    // this hands the real number to the device's dialer
                    // (tel:) — never a simulated "calling…" state.
                    const phone = profile.phone;
                    if (phone && phone !== '—') {
                      window.location.href = `tel:${phone}`;
                    } else {
                      showToast('No phone number on file for this customer.');
                    }
                  }}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer"
                >
                  <Phone className="w-4 h-4 text-primary" />
                  <span>Call Customer</span>
                </button>

                <button
                  onClick={() => setActiveQuickAction('add_note')}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer"
                >
                  <FileEdit className="w-4 h-4 text-primary" />
                  <span>Add Note</span>
                </button>

                <button
                  onClick={() => setActiveQuickAction('update_documents')}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer"
                >
                  <FileCheck className="w-4 h-4 text-primary" />
                  <span>Update Documents</span>
                </button>

                <button
                  onClick={() => setIsEditCustomerOpen(true)}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer"
                >
                  <Pencil className="w-4 h-4 text-primary" />
                  <span>Edit Customer</span>
                </button>

                <button
                  onClick={() => setIsCampaignOpen(true)}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer"
                >
                  <Tag className="w-4 h-4 text-primary" />
                  <span>Add to Campaign</span>
                </button>

                <button
                  onClick={() => {
                    sendRebookingLink.mutate(
                      { customer_id: profile.id } as never,
                      {
                        onSuccess: () => showToast(`Rebooking email sent to ${profile.email || profile.name}.`),
                        onError: (err: any) => showToast(err?.message || 'Failed to send rebooking link — nothing was sent.'),
                      },
                    );
                  }}
                  disabled={sendRebookingLink.isPending}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4 text-primary" />
                  <span>{sendRebookingLink.isPending ? 'Sending…' : 'Send Rebooking Link'}</span>
                </button>

                <button
                  onClick={() => {
                    // The system handler needs the customer's email AND crm
                    // id — the old payload sent only {user_id}, so the link
                    // row was created with no customer and the email went
                    // nowhere. The server now delivers via Resend and the
                    // toast keys off the real `emailed` outcome.
                    sendMagicLink.mutate(
                      { customer_id: profile.id, email: profile.email || '' } as never,
                      {
                        onSuccess: (data: any) => showToast(
                          data?.emailed
                            ? `Magic link emailed to ${profile.email}.`
                            : 'Magic link created, but the email could not be sent.',
                        ),
                        onError: (err: any) => showToast(err?.message || 'Failed to send magic link — nothing was sent.'),
                      },
                    );
                  }}
                  disabled={sendMagicLink.isPending}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer disabled:opacity-50"
                >
                  <Mail className="w-4 h-4 text-primary" />
                  <span>{sendMagicLink.isPending ? 'Sending…' : 'Send Magic Link'}</span>
                </button>

                <button
                  onClick={() => setIsMergeOpen(true)}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer"
                >
                  <UserCheck className="w-4 h-4 text-primary" />
                  <span>Merge Customer</span>
                </button>

                <button
                  onClick={() => setIsMergeHouseholdOpen(true)}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer"
                >
                  <CheckCheck className="w-4 h-4 text-primary" />
                  <span>Merge Household</span>
                </button>

                <button
                  onClick={() => setActiveTab('Grooming History')}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer"
                >
                  <Scissors className="w-4 h-4 text-primary" />
                  <span>View Grooming History</span>
                </button>

                <button
                  onClick={() => setActiveTab('Payments')}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer"
                >
                  <History className="w-4 h-4 text-primary" />
                  <span>View Payment History</span>
                </button>

                <button
                  onClick={() => setActiveTab('Documents')}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-primary" />
                  <span>View Documents</span>
                </button>

                <button
                  onClick={() => {
                    printHistory.mutate(
                      { customer_id: crmId || profile.id } as never,
                      {
                        onSuccess: async (data: any) => {
                          // The route compiles the customer's real history —
                          // actually print it instead of discarding the data
                          // behind a fake "sent to printer" toast.
                          const ph = data?.printHistory;
                          if (!ph) {
                            showToast('No history data came back — nothing to print.');
                            return;
                          }
                          const rows = (ph.appointments || []).map((a: any) => {
                            const when = a.date ? new Date(a.date).toLocaleString() : '—';
                            return `<tr><td style="padding:4px 8px;border-bottom:1px solid #ddd">${escHtml(when)}</td><td style="padding:4px 8px;border-bottom:1px solid #ddd">${escHtml(a.status || '')}</td><td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:right">$${Number(a.total || 0).toFixed(2)}</td><td style="padding:4px 8px;border-bottom:1px solid #ddd;text-align:right">$${Number(a.amountPaid || 0).toFixed(2)}</td></tr>`;
                          }).join('');
                          const ok = await openPrintDocument({
                            docType: 'document',
                            title: `Customer History — ${profile.name}`,
                            bodyHtml: `<h2 style="margin:0 0 8px;">UnSaid Memories — Customer History</h2><p><strong>${escHtml(profile.name)}</strong>${profile.email ? ` · ${escHtml(profile.email)}` : ''}</p><table style="border-collapse:collapse;width:100%"><thead><tr><th style="text-align:left;padding:4px 8px">Appointment</th><th style="text-align:left;padding:4px 8px">Status</th><th style="text-align:right;padding:4px 8px">Total</th><th style="text-align:right;padding:4px 8px">Paid</th></tr></thead><tbody>${rows || '<tr><td colspan="4" style="padding:8px">No appointments on record.</td></tr>'}</tbody></table><p style="margin-top:16px">Visits: ${ph.totals?.totalVisits ?? 0} · Total paid: $${Number(ph.totals?.totalSpend || 0).toFixed(2)} · Outstanding: $${Number(ph.totals?.totalOutstanding || 0).toFixed(2)}</p><p style="color:#666;font-size:12px">699 Waring Rd, Memphis, TN 38122 · 901-722-1114</p>`,
                          });
                          if (!ok) {
                            showToast('History compiled — allow pop-ups to print it.');
                            return;
                          }
                          showToast('Customer history opened for printing.');
                        },
                        onError: (err: any) => showToast(err?.message || 'Failed to compile customer history.'),
                      },
                    );
                  }}
                  disabled={printHistory.isPending}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer disabled:opacity-50"
                >
                  <Printer className="w-4 h-4 text-primary" />
                  <span>{printHistory.isPending ? 'Printing…' : 'Print History'}</span>
                </button>

                <button
                  onClick={() => setActiveModal('invoice')}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer"
                >
                  <BadgeDollarSign className="w-4 h-4 text-primary" />
                  <span>Create Invoice</span>
                </button>

                <button
                  onClick={() => bookNextVisit(profile.id, profile.name)}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer"
                >
                  <Calendar className="w-4 h-4 text-primary" />
                  <span>Book Next Visit</span>
                </button>

                <button
                  onClick={snoozeRebooking}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer"
                >
                  <BellRing className="w-4 h-4 text-primary" />
                  <span>Snooze Rebooking</span>
                </button>

                <button
                  onClick={enrollRebookingCampaign}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4 text-primary" />
                  <span>Add to Rebooking Campaign</span>
                </button>

                <button
                  onClick={() => openCheckout()}
                  className="w-full text-left px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted/40 rounded-lg flex items-center gap-2.5 border border-transparent hover:border-border transition cursor-pointer"
                >
                  <DollarSign className="w-4 h-4 text-primary" />
                  <span>Checkout</span>
                </button>
              </div>
            </div>
          </section>

          {/* Bottom Dashboard Section (3 Columns) */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-5" data-purpose="bottom-details-cards">
            {/* Upcoming Appointments */}
            <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-2xs">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <h3 className="font-semibold text-foreground text-sm">Upcoming Appointments</h3>
                  <button
                    onClick={() => setActiveTab('Appointments')}
                    className="text-[13px] text-primary hover:text-primary font-medium cursor-pointer"
                  >
                    View calendar
                  </button>
                </div>

                <div className="space-y-3.5 mt-3">
                  {appointmentsList.length === 0 && (
                    <div className="text-[12px] text-muted-foreground/70">
                      {appointmentsLoading ? 'Loading appointments…' : 'No appointments on file.'}
                    </div>
                  )}
                  {appointmentsList.slice(0, 3).map((appt) => (
                    <div key={appt.id} className="flex items-center justify-between text-[13px]">
                      <div>
                        <div className="font-semibold text-foreground">{appt.pet} • {appt.service}</div>
                        <div className="text-muted-foreground/70 text-[11px]">{appt.date} at {appt.time} ({appt.groomer})</div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-primary/5 text-primary font-medium border border-primary/20">
                        {appt.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-4 mt-3 border-t border-border">
                <button
                  onClick={() => setActiveTab('Appointments')}
                  className="text-[13px] font-semibold text-primary hover:text-primary flex items-center gap-1 cursor-pointer"
                >
                  <span>View all appointments</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Payment & Purchase History */}
            <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-2xs">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <h3 className="font-semibold text-foreground text-sm">Payment History</h3>
                  <button
                    onClick={() => setActiveTab('Payments')}
                    className="text-[13px] text-primary hover:text-primary font-medium cursor-pointer"
                  >
                    View all
                  </button>
                </div>
                <div className="space-y-2 mt-3">
                  {paymentRows.slice(0, 3).map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-[13px] py-1 border-b border-border">
                      <div>
                        <div className="font-semibold text-foreground">{item.description}</div>
                        <div className="text-[11px] text-muted-foreground/70">{item.date}</div>
                      </div>
                      <div className="font-semibold text-foreground">${item.amount.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-4 mt-3 border-t border-border">
                <button
                  onClick={() => setActiveTab('Payments')}
                  className="text-[13px] font-semibold text-primary hover:text-primary flex items-center gap-1 cursor-pointer"
                >
                  <span>View all payments</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-2xs">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <h3 className="font-semibold text-foreground text-sm">Recent Activity</h3>
                  <button
                    onClick={() => setActiveTab('Notes & Activity')}
                    className="text-[13px] text-primary hover:text-primary font-medium cursor-pointer"
                  >
                    View feed
                  </button>
                </div>
                <div className="space-y-3 mt-3">
                  {notesList.slice(0, 3).map((act) => (
                    <div key={act.id} className="text-[13px]">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground/70">
                        <span>{act.date} • {act.time}</span>
                        <span className="font-medium text-muted-foreground">{act.actor}</span>
                      </div>
                      <p className="text-foreground mt-0.5 text-[11px]">{act.description}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-4 mt-3 border-t border-border">
                <button
                  onClick={() => setActiveTab('Notes & Activity')}
                  className="text-[13px] font-semibold text-primary hover:text-primary flex items-center gap-1 cursor-pointer"
                >
                  <span>View all activity</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* -------------------------------------------------------------
       * TAB 2: PETS (All Primary Actions Included)
       * ----------------------------------------------------------- */}
      {activeTab === 'Pets' && (
        <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto" data-purpose="customer-pets-tab">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Pets Belonging to {profile.name}</h2>
            <button
              onClick={onOpenAddPet}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-primary/20 text-[13px] font-semibold rounded-lg text-primary bg-primary/5 hover:bg-primary/10 transition shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Pet</span>
            </button>
          </div>

          {/* Pet Profile Cards Grid with Action Buttons */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6" data-purpose="pet-profile-cards">
            {profile.pets.map((pet) => (
              <div
                key={pet.id}
                className="bg-card rounded-xl border border-border shadow-2xs overflow-hidden flex flex-col justify-between"
              >
                <div className="p-5 flex gap-4">
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden ring-1 ring-neutral-200 shrink-0">
                    <Image
                      src={pet.imageUrl}
                      alt={pet.name}
                      fill
                      className="object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-foreground leading-none">{pet.name}</h3>
                        {pet.isPrimary ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/5 text-primary border border-primary/20">
                            Primary Pet
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSetPrimaryPet(pet.id)}
                            className="text-[10px] text-muted-foreground/70 hover:text-primary font-medium underline cursor-pointer"
                          >
                            Set as Primary
                          </button>
                        )}
                      </div>

                      <button
                        onClick={() => setPetToEdit(pet)}
                        className="text-[13px] font-semibold text-muted-foreground hover:text-primary flex items-center gap-1 p-1 hover:bg-muted/40 rounded cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit Pet</span>
                      </button>
                    </div>

                    <p className="text-[13px] text-muted-foreground mt-1.5 font-medium">{pet.breed} • {pet.gender}</p>
                    <p className="text-[13px] text-muted-foreground mt-0.5">
                      Born: {pet.birthDate} ({pet.age}) • {pet.weight}
                    </p>

                    <div className="mt-2.5 flex flex-wrap gap-2 text-[11px]">
                      <button
                        onClick={() => setPetToManageVaccines(pet)}
                        className="inline-flex items-center text-success bg-success/10 px-2 py-0.5 rounded border border-success/20 font-semibold hover:bg-success/10 transition cursor-pointer"
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1 text-success" />
                        Manage Vaccines ({pet.vaccinationsStatus})
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Row with View Pet Profile, Documents, History, Appointments */}
                <div className="px-5 py-2.5 bg-muted/40/80 border-t border-border flex flex-wrap items-center justify-between text-[13px] text-muted-foreground font-medium">
                  <button
                    onClick={() => setSelectedPetDetail(pet)}
                    className="inline-flex items-center gap-1.5 hover:text-primary transition cursor-pointer"
                  >
                    <PawPrint className="w-3.5 h-3.5 text-muted-foreground/70" />
                    <span>View Pet Profile</span>
                  </button>
                  <button
                    onClick={() => {
                      setGroomingPetFilter(pet.name);
                      setActiveTab('Grooming History');
                    }}
                    className="inline-flex items-center gap-1.5 hover:text-primary transition cursor-pointer"
                  >
                    <Scissors className="w-3.5 h-3.5 text-muted-foreground/70" />
                    <span>View Grooming History</span>
                  </button>
                  <button
                    onClick={() => {
                      setApptPetFilter(pet.name);
                      setActiveTab('Appointments');
                    }}
                    className="inline-flex items-center gap-1.5 hover:text-primary transition cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground/70" />
                    <span>View Appointments</span>
                  </button>
                </div>
              </div>
            ))}
          </section>

          {/* Household Summary Table */}
          <section className="bg-card rounded-xl border border-border shadow-2xs overflow-hidden mt-6">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">All Pets in Household</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40/75 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="py-3 px-6">Pet Name</th>
                    <th className="py-3 px-4">Breed</th>
                    <th className="py-3 px-4">Gender</th>
                    <th className="py-3 px-4">Born</th>
                    <th className="py-3 px-4">Weight</th>
                    <th className="py-3 px-4">Last Groom</th>
                    <th className="py-3 px-4">Next Appointment</th>
                    <th className="py-3 px-6 text-right">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-medium text-foreground">
                  {profile.pets.map((pet) => (
                    <tr key={pet.id} className="hover:bg-muted/40/60 transition-colors">
                      <td className="py-3.5 px-6 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{pet.name}</span>
                          {pet.isPrimary && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/5 text-primary border border-primary/20">
                              Primary
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground">{pet.breed}</td>
                      <td className="py-3.5 px-4 text-muted-foreground">{pet.gender}</td>
                      <td className="py-3.5 px-4 text-muted-foreground">{pet.birthDate}</td>
                      <td className="py-3.5 px-4 text-muted-foreground">{pet.weight}</td>
                      <td className="py-3.5 px-4 text-muted-foreground">{pet.lastGroomDate}</td>
                      <td className="py-3.5 px-4 text-muted-foreground">{pet.nextApptDate}</td>
                      <td className="py-3.5 px-6 text-right whitespace-nowrap">
                        <button
                          onClick={() => setPetToEdit(pet)}
                          className="px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5 rounded cursor-pointer mr-2"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setPetToManageVaccines(pet)}
                          className="px-2 py-1 text-[11px] font-semibold text-success hover:bg-success/10 rounded cursor-pointer"
                        >
                          Vaccines
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* -------------------------------------------------------------
       * TAB 3: APPOINTMENTS (All Primary Actions Included)
       * ----------------------------------------------------------- */}
      {activeTab === 'Appointments' && (
        <div className="p-6 sm:p-8 space-y-4 max-w-7xl mx-auto" data-purpose="customer-appointments-tab">
          {/* Sub-navigation & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex bg-muted/40 p-0.5 rounded-lg text-[13px] font-medium text-muted-foreground border border-border/80">
                {(['Upcoming', 'Past', 'All'] as const).map((filterOpt) => (
                  <button
                    key={filterOpt}
                    onClick={() => setApptStatusFilter(filterOpt)}
                    className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      apptStatusFilter === filterOpt
                        ? 'bg-card text-primary font-semibold shadow-2xs'
                        : 'hover:text-foreground'
                    }`}
                  >
                    {filterOpt}
                  </button>
                ))}
              </div>

              <div className="relative">
                <select
                  value={apptPetFilter}
                  onChange={(e) => setApptPetFilter(e.target.value)}
                  className="appearance-none bg-card border border-border rounded-lg pl-3 pr-8 py-1.5 text-[13px] text-foreground font-medium hover:bg-muted/40 cursor-pointer shadow-2xs focus:outline-none focus:border-primary"
                >
                  <option>All Pets</option>
                  {(profile.pets || []).map((p: any) => (
                    <option key={p.id || p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/70 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              <div className="relative">
                <select
                  value={apptTypeFilter}
                  onChange={(e) => setApptTypeFilter(e.target.value)}
                  className="appearance-none bg-card border border-border rounded-lg pl-3 pr-8 py-1.5 text-[13px] text-foreground font-medium hover:bg-muted/40 cursor-pointer shadow-2xs focus:outline-none focus:border-primary"
                >
                  <option>All Statuses</option>
                  <option>Scheduled</option>
                  <option>Checked In</option>
                  <option>In Progress</option>
                  <option>Completed</option>
                  <option>Requested</option>
                  <option>Cancelled</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/70 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleAddToWaitlist}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold text-foreground bg-card border border-border hover:bg-muted/40 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-warning" />
                <span>Add to Waitlist</span>
              </button>

              <button
                onClick={onOpenNewAppointment}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Appointment</span>
              </button>
            </div>
          </div>

          {/* Appointments Table */}
          <div className="bg-card border border-border rounded-xl shadow-2xs overflow-hidden">
            <table className="min-w-full divide-y divide-border text-left" data-purpose="appointments-data-table">
              <thead className="bg-muted/40/75 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-3 px-6">Date &amp; Time</th>
                  <th className="py-3 px-6">Pet</th>
                  <th className="py-3 px-6">Service</th>
                  <th className="py-3 px-6">Groomer</th>
                  <th className="py-3 px-6">Status (Click to Advance)</th>
                  <th className="py-3 px-6">Location</th>
                  <th className="py-3 px-6 text-right">Actions Menu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card text-[13px] text-foreground">
                {apptDetailPager.pagedRows.map((appt) => (
                    <tr key={appt.id} className="hover:bg-muted/40/80 transition-colors">
                      <td className="py-3.5 px-6 font-medium text-foreground whitespace-nowrap">
                        <div className="font-semibold text-foreground">{appt.date}</div>
                        <div className="text-[11px] text-muted-foreground/70">{appt.time} ({appt.duration})</div>
                      </td>
                      <td className="py-3.5 px-6 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-warning/10 border border-warning/20 flex items-center justify-center text-warning font-semibold overflow-hidden shrink-0">
                            <Dog className="w-4 h-4" />
                          </div>
                          <span className="font-medium text-foreground">{appt.pet}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-6 whitespace-nowrap font-medium text-foreground">
                        {appt.service}
                      </td>
                      <td className="py-3.5 px-6 whitespace-nowrap text-muted-foreground">
                        {appt.groomer}
                      </td>
                      <td className="py-3.5 px-6 whitespace-nowrap">
                        <button
                          onClick={() => handleStatusCycle(appt.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border cursor-pointer transition ${
                            appt.status === 'Scheduled'
                              ? 'bg-primary/5 text-primary border-primary/20 hover:bg-primary/10'
                              : appt.status === 'Checked In'
                              ? 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/10'
                              : appt.status === 'In Progress'
                              ? 'bg-primary/5 text-primary border-primary/20 hover:bg-primary/10'
                              : appt.status === 'Completed'
                              ? 'bg-success/10 text-success border-success/20 hover:bg-success/10'
                              : 'bg-muted/40 text-muted-foreground border-border'
                          }`}
                          title="Click to advance status (Check In / Check Out)"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>{appt.status}</span>
                        </button>
                      </td>
                      <td className="py-3.5 px-6 whitespace-nowrap text-muted-foreground">
                        {appt.location}
                      </td>
                      <td className="py-3.5 px-6 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setApptToViewDetails(appt)}
                            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted/40 rounded-lg cursor-pointer"
                            title="View Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setApptToReschedule(appt)}
                            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted/40 rounded-lg cursor-pointer"
                            title="Reschedule"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setApptToUpdateAddons(appt)}
                            className="p-1.5 text-muted-foreground hover:text-warning hover:bg-muted/40 rounded-lg cursor-pointer"
                            title="Add-on / Service Update"
                          >
                            <PawPrint className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleSendApptReminder(appt)}
                            className="p-1.5 text-muted-foreground hover:text-success hover:bg-muted/40 rounded-lg cursor-pointer"
                            title="Send Reminder"
                          >
                            <BellRing className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleCancelAppointment(appt.id)}
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted/40 rounded-lg cursor-pointer"
                            title="Cancel Appointment"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {appointmentsList.length === 0 && (
              <div className="py-10 text-center text-[13px] text-muted-foreground">
                {appointmentsLoading ? 'Loading appointments…' : 'No appointments on file for this customer yet.'}
              </div>
            )}
            <TablePagination
              total={apptDetailPager.total}
              rangeStart={apptDetailPager.rangeStart}
              rangeEnd={apptDetailPager.rangeEnd}
              pageSize={apptDetailPager.pageSize}
              onPageSizeChange={apptDetailPager.setPageSize}
              safePage={apptDetailPager.safePage}
              pageCount={apptDetailPager.pageCount}
              onPageChange={apptDetailPager.setPage}
              unitLabel="appointments"
            />
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
       * TAB 4: GROOMING HISTORY (All Primary Actions Included)
       * ----------------------------------------------------------- */}
      {activeTab === 'Grooming History' && (
        <div className="p-6 sm:p-8 space-y-4 max-w-7xl mx-auto" data-purpose="customer-grooming-history-view">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <select
                  value={groomingPetFilter}
                  onChange={(e) => setGroomingPetFilter(e.target.value)}
                  className="appearance-none bg-card border border-border rounded-lg pl-3.5 pr-8 py-1.5 text-[13px] text-foreground font-medium hover:border-border focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer shadow-2xs"
                >
                  <option>All Pets</option>
                  {Array.from(new Set(groomingRecords.map((r: any) => r.pet).filter(Boolean))).map((name: any) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/70 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              <div className="relative">
                <select
                  value={groomingServiceFilter}
                  onChange={(e) => setGroomingServiceFilter(e.target.value)}
                  className="appearance-none bg-card border border-border rounded-lg pl-3.5 pr-8 py-1.5 text-[13px] text-foreground font-medium hover:border-border focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer shadow-2xs"
                >
                  <option>All Services</option>
                  {Array.from(new Set(groomingRecords.map((r: any) => r.service).filter(Boolean))).map((name: any) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/70 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              <div className="relative">
                <select
                  value={groomingGroomerFilter}
                  onChange={(e) => setGroomingGroomerFilter(e.target.value)}
                  className="appearance-none bg-card border border-border rounded-lg pl-3.5 pr-8 py-1.5 text-[13px] text-foreground font-medium hover:border-border focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer shadow-2xs"
                >
                  <option>All Groomers</option>
                  {Array.from(new Set(groomingRecords.map((r: any) => r.groomer).filter(Boolean))).map((name: any) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/70 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (groomingRecords.length === 0) {
                    showToast('No grooming record on file to base a recommendation on.');
                    return;
                  }
                  setRecommendRecord(groomingRecords[0]);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border hover:bg-muted/40 text-[13px] font-semibold text-foreground rounded-lg shadow-2xs cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span>Recommend Next Visit</span>
              </button>

              <button
                onClick={handlePrintGroomingHistory}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border hover:bg-muted/40 text-[13px] font-semibold text-foreground rounded-lg shadow-2xs cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Print History</span>
              </button>
            </div>
          </div>

          {/* Table Container Card */}
          <div className="bg-card border border-border rounded-xl shadow-2xs overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted/40 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="py-3.5 px-4 font-semibold">Date</th>
                    <th className="py-3.5 px-4 font-semibold">Pet</th>
                    <th className="py-3.5 px-4 font-semibold">Service</th>
                    <th className="py-3.5 px-4 font-semibold">Groomer</th>
                    <th className="py-3.5 px-4 font-semibold">Duration</th>
                    <th className="py-3.5 px-6 font-semibold">Notes</th>
                    <th className="py-3.5 px-4 font-semibold text-center">Photos</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-[13px] text-muted-foreground">
                  {groomingPager.pagedRows.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/40/70 transition-colors group">
                        <td className="py-4 px-4 font-medium text-foreground whitespace-nowrap">
                          {item.date}
                        </td>
                        <td className="py-4 px-4 font-medium text-foreground whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-primary/60" />
                            {item.pet}
                          </span>
                        </td>
                        <td className="py-4 px-4 whitespace-nowrap font-medium text-foreground">
                          {item.service}
                        </td>
                        <td className="py-4 px-4 whitespace-nowrap text-muted-foreground">
                          {item.groomer}
                        </td>
                        <td className="py-4 px-4 whitespace-nowrap text-muted-foreground">
                          {item.duration}
                        </td>
                        <td className="py-4 px-6 text-muted-foreground leading-relaxed max-w-sm truncate">
                          {item.notes}
                        </td>
                        <td className="py-4 px-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => setPhotosRecord(item)}
                            className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted/40 text-foreground hover:bg-muted cursor-pointer"
                          >
                            <Camera className="w-3 h-3 mr-1 text-muted-foreground/70" />
                            {item.photosCount}
                          </button>
                        </td>
                        <td className="py-4 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setRecordToView(item)}
                              className="px-2 py-1 bg-muted/40 hover:bg-muted text-foreground rounded text-[11px] font-medium cursor-pointer"
                              title="View Grooming Record"
                            >
                              View Record
                            </button>
                            <button
                              onClick={() => handleAddGroomingNotePrompt(item.id)}
                              className="px-2 py-1 bg-primary/5 hover:text-primary rounded text-[11px] font-medium cursor-pointer"
                              title="Add Grooming Note"
                            >
                              Add Note
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  {groomingRecords.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 px-4 text-center text-muted-foreground">
                        No grooming records on file for this customer yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              total={groomingPager.total}
              rangeStart={groomingPager.rangeStart}
              rangeEnd={groomingPager.rangeEnd}
              pageSize={groomingPager.pageSize}
              onPageSizeChange={groomingPager.setPageSize}
              safePage={groomingPager.safePage}
              pageCount={groomingPager.pageCount}
              onPageChange={groomingPager.setPage}
              unitLabel="records"
            />
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
       * TAB: SERVICE PROFILE (1.20)
       * ----------------------------------------------------------- */}
      {activeTab === 'Service Profile' && (
        <>
          <ServiceProfileTab customerId={crmId || profile.id} />
          <CustomerSettingsPanel customerId={crmId || profile.id} />
        </>
      )}

      {/* -------------------------------------------------------------
       * TAB 5: PAYMENTS (All Primary Actions Included)
       * ----------------------------------------------------------- */}
      {activeTab === 'Payments' && (
        <div className="p-6 sm:p-8 space-y-4 max-w-7xl mx-auto" data-purpose="payments-tab-view">
          <div className="bg-card rounded-xl border border-border shadow-2xs overflow-hidden">
            {/* Table Control / Search Bar Header */}
            <div className="px-6 py-4 border-b border-border flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-foreground">Payment Ledger</h2>
                <span className="text-[13px] bg-muted/40 text-muted-foreground px-2 py-0.5 rounded-full font-medium">
                  {paymentRows.length} transactions
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    type="text"
                    value={paymentSearch}
                    onChange={(e) => setPaymentSearch(e.target.value)}
                    placeholder="Search payments..."
                    className="pl-8 pr-3 py-1.5 text-[13px] bg-muted/40 border border-border rounded-lg text-foreground placeholder-neutral-400 focus:bg-card focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary w-52"
                  />
                  <Search className="w-3.5 h-3.5 text-muted-foreground/70 absolute left-2.5 top-2.5" />
                </div>
                <button
                  onClick={() => setIsAddPaymentMethodOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border hover:bg-muted/40 text-foreground text-[13px] font-semibold rounded-lg transition-colors shadow-2xs cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Edit / Add Method</span>
                </button>
                <button
                  onClick={onOpenTakePayment}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-white text-[13px] font-semibold rounded-lg transition-colors shadow-2xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Take Payment</span>
                </button>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13px]" data-purpose="payments-table">
                <thead>
                  <tr className="bg-muted/40 border-b border-border text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                    <th className="py-3 px-6">Date</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-6">Description</th>
                    <th className="py-3 px-4">Pet</th>
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paymentsPager.pagedRows.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/40/70 transition-colors">
                        <td className="py-3.5 px-6 text-foreground font-medium whitespace-nowrap">{item.date}</td>
                        <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap">{item.type}</td>
                        <td className="py-3.5 px-6 text-foreground font-medium whitespace-nowrap">{item.description}</td>
                        <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap">
                          {item.petName || '—'}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {item.invoiceNumber ? (
                            <button
                              onClick={() => setInvoiceToView(item)}
                              className="text-primary hover:text-primary font-medium cursor-pointer underline"
                            >
                              {item.invoiceNumber}
                            </button>
                          ) : item.reference ? (
                            <span className="text-muted-foreground">{item.reference}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-foreground whitespace-nowrap">${item.amount.toFixed(2)}</td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                              item.status === 'Paid'
                                ? 'bg-success/10 text-success border-success/20'
                                : item.status === 'Refunded' || item.status === 'Failed'
                                  ? 'bg-destructive/10 text-destructive border-destructive/20'
                                  : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {item.invoiceNumber ? (
                              <button
                                onClick={() => setInvoiceToView(item)}
                                className="px-2 py-1 bg-muted/40 hover:bg-muted text-foreground rounded text-[11px] font-medium cursor-pointer"
                              >
                                View Invoice
                              </button>
                            ) : null}
                            <button
                              onClick={() => {
                                showToast(
                                  item.reference
                                    ? `Receipt reference: ${item.reference}`
                                    : 'No receipt reference is recorded for this entry.',
                                );
                              }}
                              className="px-2 py-1 bg-muted/40 hover:bg-muted text-foreground rounded text-[11px] font-medium cursor-pointer"
                            >
                              Receipt
                            </button>
                            <button
                              onClick={() => setPaymentToRefund(item)}
                              className="px-2 py-1 bg-destructive/5 hover:bg-destructive/10 text-destructive rounded text-[11px] font-medium cursor-pointer"
                            >
                              Refund
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  {paymentRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 px-6 text-center text-muted-foreground">
                        No payments recorded for this customer yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              total={paymentsPager.total}
              rangeStart={paymentsPager.rangeStart}
              rangeEnd={paymentsPager.rangeEnd}
              pageSize={paymentsPager.pageSize}
              onPageSizeChange={paymentsPager.setPageSize}
              safePage={paymentsPager.safePage}
              pageCount={paymentsPager.pageCount}
              onPageChange={paymentsPager.setPage}
              unitLabel="transactions"
            />
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
       * TAB 6: DOCUMENTS (All Primary Actions Included)
       * ----------------------------------------------------------- */}
      {activeTab === 'Documents' && (
        <div className="p-6 sm:p-8 space-y-4 max-w-7xl mx-auto" data-purpose="documents-tab-content">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">Documents &amp; Records</h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">Manage vaccination proof, signed health agreements, and client waivers.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsUploadDocOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-white text-[13px] font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Document</span>
              </button>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border shadow-2xs overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13px] text-muted-foreground">
                <thead>
                  <tr className="border-b border-border bg-muted/40/75 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="py-3.5 pl-6 pr-4">Document Name</th>
                    <th className="py-3.5 px-4">Type</th>
                    <th className="py-3.5 px-4">Pet</th>
                    <th className="py-3.5 px-4">Uploaded</th>
                    <th className="py-3.5 px-4">Expires</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 pr-6 pl-4 text-right">Document Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {docsPager.pagedRows.map((doc) => (
                    <tr key={doc.id} className="hover:bg-muted/40/70 transition-colors">
                      <td className="py-4 pl-6 pr-4 font-medium text-foreground">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            doc.isWaiver ? 'bg-primary/5 text-primary' : 'bg-primary/5 text-primary'
                          }`}>
                            <FileText className="w-4 h-4" />
                          </div>
                          <span>{doc.name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-muted-foreground">{doc.type}</td>
                      <td className="py-4 px-4 font-medium text-foreground">{doc.pet}</td>
                      <td className="py-4 px-4 text-muted-foreground">{doc.uploaded}</td>
                      <td className="py-4 px-4 text-muted-foreground">{doc.expires || '—'}</td>
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border capitalize ${
                          ['approved', 'signed', 'verified'].includes(String(doc.status || '').toLowerCase())
                            ? 'bg-success/10 text-success border-success/20'
                            : ['rejected', 'expired'].includes(String(doc.status || '').toLowerCase())
                              ? 'bg-destructive/10 text-destructive border-destructive/20'
                              : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                        }`}>
                          {doc.status}
                        </span>
                      </td>
                      <td className="py-4 pr-6 pl-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              // storagePath is the signed URL minted by the
                              // documents route (private bucket) — open the
                              // real file; documents without an uploaded
                              // file say so instead of faking a preview.
                              if (doc.storagePath) {
                                window.open(doc.storagePath, '_blank', 'noopener');
                              } else {
                                showToast('No file has been uploaded for this document yet.');
                              }
                            }}
                            className="px-2 py-1 bg-muted/40 hover:bg-muted text-foreground rounded text-[11px] font-medium cursor-pointer"
                          >
                            View
                          </button>
                          <button
                            onClick={async () => {
                              const newExp = window.prompt(`Set new expiration date (YYYY-MM-DD) for ${doc.name}:`, doc.expires || '');
                              if (!newExp) return;
                              try {
                                const res = await fetch(`/api/admin/crm/documents/${doc.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ expires_at: newExp.trim() }),
                                });
                                const j = await res.json().catch(() => ({}));
                                if (!res.ok || j?.error) {
                                  showToast(j?.error || 'Expiration date could not be saved.');
                                  return;
                                }
                                setDocumentsList(prev =>
                                  prev.map(d => (d.id === doc.id ? { ...d, expires: j.expires_at || '' } : d))
                                );
                                showToast('Expiration date saved.');
                              } catch {
                                showToast('Expiration date could not be saved — network error.');
                              }
                            }}
                            className="px-2 py-1 bg-muted/40 hover:bg-muted text-foreground rounded text-[11px] font-medium cursor-pointer"
                          >
                            Set Expiry
                          </button>
                          <button
                            onClick={() => handleVerifyDocument(doc.id)}
                            className="px-2 py-1 bg-success/10 hover:bg-success/10 text-success rounded text-[11px] font-medium cursor-pointer"
                          >
                            Verify
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              total={docsPager.total}
              rangeStart={docsPager.rangeStart}
              rangeEnd={docsPager.rangeEnd}
              pageSize={docsPager.pageSize}
              onPageSizeChange={docsPager.setPageSize}
              safePage={docsPager.safePage}
              pageCount={docsPager.pageCount}
              onPageChange={docsPager.setPage}
              unitLabel="documents"
            />
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
       * TAB 7: NOTES & ACTIVITY (All Primary Actions Included)
       * ----------------------------------------------------------- */}
      {activeTab === 'Notes & Activity' && (
        <div className="p-6 sm:p-8 max-w-7xl mx-auto" data-purpose="notes-activity-content">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Add Note Card (4 cols) */}
            <section className="lg:col-span-4 bg-card rounded-xl border border-border shadow-2xs p-5" data-purpose="add-note-card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-foreground">Add Note</h2>
                <button
                  onClick={() => setIsAuditLogOpen(true)}
                  className="text-[13px] text-primary hover:text-primary font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>View Audit Log</span>
                </button>
              </div>

              <form onSubmit={handleAddNoteSubmit} className="space-y-4">
                <div>
                  <div className="relative">
                    <select
                      value={noteTypeSelection}
                      onChange={(e) => setNoteTypeSelection(e.target.value)}
                      aria-label="Note type"
                      className="w-full text-[13px] rounded-lg border border-border text-foreground focus:border-primary focus:ring-1 focus:ring-primary appearance-none bg-card py-2 pl-3 pr-8"
                    >
                      <option value="internal">Internal (staff only)</option>
                      <option value="customer_visible">Customer Note</option>
                      <option value="appointment">Appointment Note</option>
                      <option value="pet_handling">Pet Handling (permanent alert)</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/70 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <textarea
                    required
                    rows={4}
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Type client or grooming notes here..."
                    className="w-full text-[13px] rounded-lg border border-border placeholder-neutral-400 focus:border-primary focus:ring-1 focus:ring-primary resize-none p-3"
                  />
                </div>
                <div>
                  <div className="relative">
                    <select
                      value={notePetSelection}
                      onChange={(e) => setNotePetSelection(e.target.value)}
                      className="w-full text-[13px] rounded-lg border border-border text-foreground focus:border-primary focus:ring-1 focus:ring-primary appearance-none bg-card py-2 pl-3 pr-8"
                    >
                      <option value="">Select Pet (optional)</option>
                      {profile.pets.map((pet) => (
                        <option key={pet.id} value={pet.id}>{pet.name}{pet.breed ? ` (${pet.breed})` : ''}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/70 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <button
                    type="submit"
                    disabled={noteSaving}
                    className="w-full py-2.5 px-4 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg text-[13px] shadow-2xs transition-colors flex justify-center items-center cursor-pointer disabled:opacity-50"
                  >
                    {noteSaving ? 'Saving…' : 'Add Note'}
                  </button>
                </div>
              </form>
            </section>

            {/* Right Column: Activity Timeline & Feed (8 cols) */}
            <section className="lg:col-span-8 bg-card rounded-xl border border-border shadow-2xs p-6" data-purpose="activity-feed-card">
              <div className="flex items-center justify-between pb-5 border-b border-border">
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  {([
                    { value: 'All', label: 'All' },
                    { value: 'internal', label: 'Internal' },
                    { value: 'customer_visible', label: 'Customer' },
                    { value: 'appointment', label: 'Appointment' },
                    { value: 'pet_handling', label: 'Pet Handling' },
                    { value: 'system', label: 'System' },
                  ] as const).map((fil) => (
                    <button
                      key={fil.value}
                      onClick={() => setActivityFilter(fil.value as typeof activityFilter)}
                      className={`px-3 py-1 rounded-full text-[13px] transition-colors cursor-pointer ${
                        activityFilter === fil.value
                          ? 'font-semibold bg-primary/5 text-primary border border-primary/20'
                          : 'font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40'
                      }`}
                    >
                      {fil.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setIsAuditLogOpen(true)}
                  className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground font-medium cursor-pointer"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Audit History</span>
                </button>
              </div>

              {/* Timeline Events List */}
              <div className="mt-6 relative" data-purpose="timeline-list">
                <div className="absolute left-[7px] top-3 bottom-3 w-[1.5px] bg-muted" />
                <div className="space-y-6">
                  {timelineEntries
                    .filter((act) => {
                      if (activityFilter === 'All') return true;
                      // Filter by the stored note_type (1.18). Audit entries
                      // carry noteType 'system'; appointment activity
                      // entries only show under All.
                      return act.noteType === activityFilter;
                    })
                    .map((act) => (
                      <div key={act.id} className="relative flex items-start space-x-3 text-[13px]">
                        <div className={`relative z-10 w-3.5 h-3.5 rounded-full border-2 border-white ring-2 shrink-0 mt-0.5 ${
                          act.isPinned ? 'bg-warning/100 ring-amber-200' : 'bg-primary ring-brand-teal/20'
                        }`} />
                        <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground">{act.date}</span>
                              <span className="text-muted-foreground/70">{act.time}</span>
                              {act.isPinned && (
                                <span className="px-1.5 py-0.2 bg-warning/10 text-warning border border-warning/20 rounded text-[10px] font-semibold flex items-center gap-0.5">
                                  <Pin className="w-2.5 h-2.5" /> Pinned
                                </span>
                              )}
                            </div>
                            <p className="text-foreground font-medium mt-0.5">{act.description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-muted/40 text-muted-foreground">
                              {act.actor}
                            </span>
                            <button
                              onClick={() => togglePinNote(act.id)}
                              className="p-1 hover:bg-muted/40 rounded text-muted-foreground/70 hover:text-warning cursor-pointer"
                              title={act.isPinned ? 'Unpin note' : 'Pin note to top'}
                            >
                              <Pin className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
       * TAB 8: COMMUNICATION (All Primary Actions Included)
       * ----------------------------------------------------------- */}
      {activeTab === 'Communication' && (
        <div className="p-6 sm:p-8 flex flex-col md:flex-row gap-6 max-w-7xl mx-auto" data-purpose="communication-tab-content">
          <div className="w-full md:w-48 shrink-0 space-y-4">
            <ul className="space-y-1 text-[13px] font-medium">
              {(['Messages', 'Email History', 'SMS History', 'Templates'] as const).map((subItem) => (
                <li key={subItem}>
                  <button
                    onClick={() => setCommSubTab(subItem)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-left cursor-pointer ${
                      commSubTab === subItem
                        ? 'bg-primary/5 text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    <span>{subItem}</span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="pt-3 border-t border-border space-y-2">
              <button
                onClick={() => setIsCampaignOpen(true)}
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] font-semibold text-foreground hover:bg-muted/40 flex items-center gap-2 cursor-pointer"
              >
                <Tag className="w-3.5 h-3.5 text-primary" />
                <span>Add to Campaign</span>
              </button>

              <button
                onClick={() => setIsOptInOutOpen(true)}
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] font-semibold text-foreground hover:bg-muted/40 flex items-center gap-2 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5 text-primary" />
                <span>Opt In/Out Settings</span>
              </button>
            </div>
          </div>

          <div className="flex-1 bg-card rounded-xl border border-border shadow-2xs flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="relative inline-block text-[13px]">
                  <select
                    value={commChannelFilter}
                    onChange={(e) => setCommChannelFilter(e.target.value)}
                    className="appearance-none bg-muted/40 hover:bg-muted/40 border border-border rounded-lg pl-3 pr-8 py-1.5 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option>All Channels</option>
                    <option>SMS</option>
                    <option>Email</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/70 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                <div className="relative inline-block text-[13px]">
                  <select
                    value={commTypeFilter}
                    onChange={(e) => setCommTypeFilter(e.target.value)}
                    className="appearance-none bg-muted/40 hover:bg-muted/40 border border-border rounded-lg pl-3 pr-8 py-1.5 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option>All Types</option>
                    {commTypeOptions.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/70 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setMessageChannel('Email');
                    setIsSendMessageOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold text-foreground bg-card border border-border hover:bg-muted/40 rounded-lg transition-colors cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5 text-primary" />
                  <span>Send Email</span>
                </button>

                <button
                  onClick={() => {
                    setMessageChannel('SMS');
                    setIsSendMessageOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Send SMS</span>
                </button>
              </div>
            </div>

            {commSubTab === 'Templates' ? (
              <div className="p-4 space-y-3">
                {templatesLoading && (
                  <div className="p-6 text-center text-[13px] text-muted-foreground">Loading templates…</div>
                )}
                {!templatesLoading && messageTemplates.length === 0 && (
                  <div className="p-6 text-center text-[13px] text-muted-foreground">No message templates are configured.</div>
                )}
                {messageTemplates.map((tpl: any) => (
                  <button
                    key={tpl.id}
                    onClick={() => applyTemplate(tpl)}
                    className="w-full text-left p-4 border border-border rounded-xl hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-foreground text-[13px]">{tpl.name}</span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-muted/40 text-muted-foreground uppercase">
                        {tpl.channel}
                      </span>
                    </div>
                    {tpl.subject && <div className="text-[12px] font-medium text-foreground mt-1">{tpl.subject}</div>}
                    <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2">{tpl.body}</p>
                    <span className="text-[11px] text-primary font-medium mt-2 inline-block">Use template →</span>
                  </button>
                ))}
              </div>
            ) : (
            <>
            {/* Communication Log Data Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] text-muted-foreground">
                <thead className="bg-muted/40 text-muted-foreground/70 uppercase text-[10px] font-semibold border-b border-border">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Channel</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Direction</th>
                    <th className="py-3 px-4">Subject / Message</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {commsPager.pagedRows.map((comm) => {
                    const when = new Date(comm.timestamp);
                    const validDate = !Number.isNaN(when.getTime());
                    return (
                      <tr key={comm.id} className="hover:bg-muted/40/75 transition-colors">
                        <td className="py-3.5 px-4 font-medium text-foreground whitespace-nowrap">
                          {validDate ? when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          <span className="text-muted-foreground/70 text-[11px] block font-normal">
                            {validDate ? when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 text-foreground font-medium">
                            {comm.channel === 'SMS' ? (
                              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground/70" />
                            ) : (
                              <Mail className="w-3.5 h-3.5 text-muted-foreground/70" />
                            )}
                            {comm.channel}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap text-foreground">{comm.type}</td>
                        <td className="py-3.5 px-4 whitespace-nowrap text-muted-foreground">{comm.direction}</td>
                        <td className="py-3.5 px-4 max-w-xs text-foreground font-medium" title={comm.subject}>
                          <span className="block truncate">{comm.subject}</span>
                          {comm.preview && comm.preview !== comm.subject && (
                            <span className="block truncate text-[12px] font-normal text-muted-foreground">{comm.preview}</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${commStatusBadgeClass(comm.status)}`}>
                            {comm.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination
              total={commsPager.total}
              rangeStart={commsPager.rangeStart}
              rangeEnd={commsPager.rangeEnd}
              pageSize={commsPager.pageSize}
              onPageSizeChange={commsPager.setPageSize}
              safePage={commsPager.safePage}
              pageCount={commsPager.pageCount}
              onPageChange={commsPager.setPage}
              unitLabel="messages"
            />
            {commsLoading && (
              <div className="p-6 text-center text-[13px] text-muted-foreground">Loading communications…</div>
            )}
            {!commsLoading && visibleComms.length === 0 && (
              <div className="p-6 text-center text-[13px] text-muted-foreground">
                {communicationsList.length === 0
                  ? 'No communications with this customer yet.'
                  : 'No communications match these filters.'}
              </div>
            )}
            </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'Cases' && (
        <div className="p-6 sm:p-8 max-w-7xl mx-auto" data-purpose="cases-tab-content">
          <div className="bg-card rounded-xl border border-border shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="text-[15px] font-semibold text-foreground">Order Cases</h3>
              <p className="text-[12px] text-muted-foreground">Issues opened on this customer&rsquo;s orders. The same case appears on the order itself — closing it here closes it there too.</p>
            </div>
            {casesLoading && (
              <div className="p-6 text-center text-[13px] text-muted-foreground">Loading cases…</div>
            )}
            {!casesLoading && casesList.length === 0 && (
              <div className="p-6 text-center text-[13px] text-muted-foreground">No cases for this customer yet.</div>
            )}
            {!casesLoading && casesList.length > 0 && (
              <div className="divide-y divide-border">
                {casesList.map((c) => (
                  <div key={c.id} className="p-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-[14px] font-semibold text-foreground">{c.subject}</p>
                      <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase ${c.status === 'open' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>{c.status}</span>
                    </div>
                    <p className="text-[12px] text-muted-foreground tabular-nums">
                      {c.reason ? `${c.reason} · ` : ''}
                      Order{' '}
                      <a href={`/admin/order-details?id=${c.order_id}`} className="underline font-semibold">
                        #{String(c.order_id).slice(0, 8)}
                      </a>
                      {c.created_at ? ` · Opened ${new Date(c.created_at).toLocaleString()}` : ''}
                      {c.closed_at ? ` · Closed ${new Date(c.closed_at).toLocaleString()}` : ''}
                    </p>
                    {c.note && <p className="text-[13px] text-foreground">{c.note}</p>}
                    {c.resolution_note && <p className="text-[13px] text-muted-foreground">Resolution: {c.resolution_note}</p>}
                    <button
                      onClick={() => toggleCaseStatus(c)}
                      className="text-[11px] font-semibold uppercase underline cursor-pointer"
                    >
                      {c.status === 'open' ? 'Close case' : 'Reopen case'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

        </main>
      </div>

      {/* -------------------------------------------------------------
       * MODALS & POPUPS
       * ----------------------------------------------------------- */}
      {/* Edit Customer Modal */}
      {isEditCustomerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/40">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground text-sm">Edit Customer Profile</h3>
              </div>
              <button onClick={() => setIsEditCustomerOpen(false)} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-6 space-y-4 text-[13px]">
              <div>
                <label className="block text-foreground font-semibold mb-1">Customer Full Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-foreground font-semibold mb-1">Phone Number</label>
                  <input
                    type="text"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-foreground font-semibold mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="block text-foreground font-semibold mb-1">Home Address</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground"
                />
              </div>

              <div className="pt-4 border-t border-border flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditCustomerOpen(false)}
                  className="px-4 py-2 border rounded-xl text-muted-foreground hover:bg-muted/40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold shadow-xs cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Send Message Modal */}
      {isSendMessageOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/40">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground text-sm">Send {messageChannel}</h3>
              </div>
              <button onClick={() => setIsSendMessageOpen(false)} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendMessageSubmit} className="p-6 space-y-4 text-[13px]">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMessageChannel('SMS')}
                  className={`flex-1 py-2 rounded-xl font-semibold border ${
                    messageChannel === 'SMS' ? 'bg-primary/5 border-primary text-primary' : 'text-muted-foreground'
                  }`}
                >
                  SMS ({profile.phone})
                </button>
                <button
                  type="button"
                  onClick={() => setMessageChannel('Email')}
                  className={`flex-1 py-2 rounded-xl font-semibold border ${
                    messageChannel === 'Email' ? 'bg-primary/5 border-primary text-primary' : 'text-muted-foreground'
                  }`}
                >
                  Email ({profile.email})
                </button>
              </div>

              {messageChannel === 'SMS' && (
                <p className="text-[12px] text-muted-foreground bg-muted/40 border border-border rounded-lg px-3 py-2">
                  Texts send through the platform&apos;s Twilio provider and are recorded in this customer&apos;s history with their delivery status.
                </p>
              )}

              <div>
                <label className="block text-foreground font-semibold mb-1">Message Content</label>
                <textarea
                  required
                  rows={4}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder={`Hi ${profile.name.split(' ')[0]}, your grooming appointment...`}
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl"
                />
              </div>

              <div className="pt-4 border-t border-border flex justify-end gap-3">
                <button type="button" onClick={() => setIsSendMessageOpen(false)} className="px-4 py-2 border rounded-xl">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={messageSending || messageChannel === 'SMS'}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {messageSending ? 'Sending…' : `Send ${messageChannel}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Payment Method Modal */}
      {isAddPaymentMethodOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/40">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground text-sm">Save Card On File</h3>
              </div>
              <button onClick={() => setIsAddPaymentMethodOpen(false)} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCard} className="p-6 space-y-4 text-[13px]">
              <p className="text-muted-foreground leading-relaxed">
                Cards on file are collected and stored by <strong className="text-foreground">Stripe</strong> — never typed
                into the admin panel. A card is saved when the customer checks out online, pays a payment link, or adds
                one from their own account portal. Once saved, it appears here as the default payment method and can be
                charged from Take Payment.
              </p>
              {profile.defaultPaymentMethod ? (
                <div className="p-3.5 bg-muted/40 rounded-xl border border-border flex items-center justify-between">
                  <span className="font-semibold text-foreground">Current default</span>
                  <span className="font-medium text-muted-foreground">
                    {profile.defaultPaymentMethod.cardBrand} •••• {profile.defaultPaymentMethod.last4}
                    {profile.defaultPaymentMethod.expires ? ` · exp ${profile.defaultPaymentMethod.expires}` : ''}
                  </span>
                </div>
              ) : (
                <p className="text-muted-foreground">No card is currently on file for this customer.</p>
              )}
              <div className="pt-4 border-t border-border flex justify-end gap-3">
                <button type="submit" className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold">
                  Got it
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Document Modal */}
      {isUploadDocOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/40">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground text-sm">Upload Document</h3>
              </div>
              <button onClick={() => setIsUploadDocOpen(false)} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-[13px]">
              <div>
                <label className="block text-foreground font-semibold mb-1">Document Name</label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="e.g. Rabies Certificate"
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl"
                />
              </div>

              <div>
                <label className="block text-foreground font-semibold mb-1">Associated Pet</label>
                <select
                  value={uploadPetId}
                  onChange={(e) => setUploadPetId(e.target.value)}
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl"
                >
                  <option value="">Household (All Pets)</option>
                  {(profile.pets || []).map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}{p.breed ? ` (${p.breed})` : ''}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-foreground font-semibold mb-1">File</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl"
                />
                <p className="text-[11px] text-muted-foreground/70 mt-1">PDF, JPG, PNG up to 10MB — stored in the private customer-documents bucket.</p>
              </div>

              <div className="pt-4 border-t border-border flex justify-end gap-3">
                <button type="button" onClick={() => setIsUploadDocOpen(false)} className="px-4 py-2 border rounded-xl">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={uploadSaving}
                  onClick={handleUploadDocument}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold disabled:opacity-50"
                >
                  {uploadSaving ? 'Uploading…' : 'Upload & Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Selected Pet Detail Modal */}
      {selectedPetDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/40">
              <div className="flex items-center gap-2">
                <PawPrint className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground text-sm">
                  {selectedPetDetail.name} &bull; Pet Record
                </h3>
              </div>
              <button onClick={() => setSelectedPetDetail(null)} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-[13px]">
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-muted/40 shrink-0 border border-border">
                  <Image
                    src={selectedPetDetail.imageUrl || selectedPetDetail.photoUrl || 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=400&q=80'}
                    alt={selectedPetDetail.name}
                    fill
                    className="object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="space-y-1">
                  <h4 className="font-semibold text-base text-foreground">{selectedPetDetail.name}</h4>
                  <p className="text-muted-foreground font-medium">{selectedPetDetail.breed} &bull; {selectedPetDetail.gender}</p>
                  <p className="text-muted-foreground/70">Age: {selectedPetDetail.age} (Born {selectedPetDetail.birthDate})</p>
                  <p className="text-muted-foreground font-semibold">Weight: {selectedPetDetail.weight}</p>
                </div>
              </div>

              <div className="p-3.5 bg-muted/40 rounded-xl border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">Vaccination Status:</span>
                  <span className="font-semibold text-success bg-success/10 px-2 py-0.5 rounded border border-success/20">
                    {selectedPetDetail.vaccinationsStatus}
                  </span>
                </div>
                {selectedPetDetail.medicalAlert && (
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">Special Medical / Coat Care:</span>
                    <span className="font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded border border-warning/20">
                      {selectedPetDetail.medicalAlert}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Last Service:</span>
                  <span className="font-semibold">{selectedPetDetail.lastGroomDate}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Upcoming Appointment:</span>
                  <span className="font-semibold">{selectedPetDetail.nextApptDate} ({selectedPetDetail.nextApptType})</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setSelectedPetDetail(null)}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Other Modular Modals from CustomerModals */}
      {petToEdit && (
        <EditPetModal
          pet={petToEdit}
          isOpen={true}
          onClose={() => setPetToEdit(null)}
          onSave={handleSavePetEdit}
        />
      )}

      {petToManageVaccines && (
        <ManageVaccinesModal
          pet={petToManageVaccines}
          isOpen={true}
          onClose={() => setPetToManageVaccines(null)}
          onSave={(records) => {
            showToast(`Updated ${records.length} vaccine records for ${petToManageVaccines.name}.`);
          }}
        />
      )}

      {apptToReschedule && (
        <RescheduleModal
          appointment={apptToReschedule}
          isOpen={true}
          onClose={() => setApptToReschedule(null)}
          onReschedule={(startsAtIso) => {
            const appt = apptToReschedule;
            setApptToReschedule(null);
            handleRescheduleAppointment(appt, startsAtIso);
          }}
        />
      )}

      {apptToUpdateAddons && (
        <AddonServiceModal
          appointment={apptToUpdateAddons}
          isOpen={true}
          onClose={() => setApptToUpdateAddons(null)}
          onUpdate={(serviceIds) => {
            const appt = apptToUpdateAddons;
            setApptToUpdateAddons(null);
            handleAddApptServices(appt, serviceIds);
          }}
        />
      )}

      {apptToViewDetails && (
        <AppointmentDetailsModal
          appointment={apptToViewDetails}
          isOpen={true}
          onClose={() => setApptToViewDetails(null)}
        />
      )}

      {recordToView && (
        <ViewGroomingRecordModal
          record={recordToView}
          isOpen={true}
          onClose={() => setRecordToView(null)}
        />
      )}

      {photosRecord && (
        <ViewPhotosModal
          petName={photosRecord.pet || 'Pet'}
          photos={photosRecord.photos || []}
          recordDate={photosRecord.date || ''}
          isOpen={true}
          onClose={() => setPhotosRecord(null)}
        />
      )}

      {recommendRecord && (
        <RecommendNextVisitModal
          petName={recommendRecord.pet || 'Pet'}
          isOpen={true}
          onClose={() => setRecommendRecord(null)}
          onSave={(intervalLabel, dateIso) => {
            const record = recommendRecord;
            setRecommendRecord(null);
            handleRecommendNextVisit(record, dateIso, intervalLabel);
          }}
        />
      )}

      {invoiceToView && (
        <InvoiceModal
          payment={invoiceToView}
          isOpen={true}
          onClose={() => setInvoiceToView(null)}
        />
      )}

      {paymentToRefund && (
        <RefundModal
          payment={paymentToRefund}
          isOpen={true}
          onClose={() => setPaymentToRefund(null)}
          onConfirmRefund={handleConfirmRefund}
        />
      )}

      <AuditLogModal
        isOpen={isAuditLogOpen}
        onClose={() => setIsAuditLogOpen(false)}
        entries={auditEntries}
      />

      <CampaignModal
        customerName={profile.name}
        campaigns={campaignOptions}
        isOpen={isCampaignOpen}
        onClose={() => setIsCampaignOpen(false)}
        onAssign={(campaignId) => {
          // crm_add_to_campaign keys crm_campaign_members by the CRM
          // customer id + the campaign's UUID. The old call passed the
          // shop id and a campaign NAME string (FK-fails), and toasted
          // success on error too.
          if (!crmId) {
            showToast('Link this profile to a CRM record to add them to a campaign.');
            return;
          }
          const camp = campaignOptions.find((c: any) => c.id === campaignId);
          addToCampaign.mutate(
            { customer_id: crmId, campaign_id: campaignId } as never,
            {
              onSuccess: () => {
                setIsCampaignOpen(false);
                showToast(`Added ${profile.name} to marketing campaign "${camp?.name || 'campaign'}".`);
              },
              onError: (err) => showToast(`Could not add to campaign: ${(err as Error).message}`),
            },
          );
        }}
      />

      <OptInOutModal
        isOpen={isOptInOutOpen}
        initialPrefs={optInPrefs}
        onClose={() => setIsOptInOutOpen(false)}
        onSave={async (prefs) => {
          // Persist to the stored crm_customers opt-in columns; the modal
          // only closes (and this only toasts success) on a confirmed 2xx.
          if (!crmId) {
            showToast('Link this profile to a CRM record to save communication preferences.');
            return false;
          }
          try {
            const res = await fetch(`/api/admin/crm/customers/${crmId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                transactional_sms_opt_in: prefs.sms,
                transactional_email_opt_in: prefs.email,
                marketing_email_opt_in: prefs.marketing,
                marketing_sms_opt_in: prefs.marketingSms,
              }),
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok || j?.error) {
              showToast(j?.error || 'Communication preferences could not be saved.');
              return false;
            }
            setOptInPrefs(prefs);
            showToast('Customer communication preferences updated.');
            return true;
          } catch {
            showToast('Communication preferences could not be saved — network error.');
            return false;
          }
        }}
      />

      {/* Merge Customer Modal */}
      {isMergeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/40">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground text-sm">Merge Customer</h3>
              </div>
              <button onClick={() => setIsMergeOpen(false)} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-[13px]">
              <p className="text-muted-foreground">
                Merge <strong className="text-foreground">{profile.name}</strong> into another customer record.
                Pets, appointments, and documents will be reassigned.
              </p>
              <div>
                <label className="block text-foreground font-semibold mb-1">Target Customer ID</label>
                <input
                  type="text"
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  placeholder="Enter target customer UUID"
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground"
                />
              </div>
              <div className="pt-4 border-t border-border flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsMergeOpen(false)}
                  className="px-4 py-2 border rounded-xl text-muted-foreground hover:bg-muted/40 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!mergeTargetId.trim()) {
                      showToast('Enter a target customer ID.');
                      return;
                    }
                    mergeCustomer.mutate(
                      { source_id: profile.id, target_id: mergeTargetId.trim() } as never,
                      {
                        onSuccess: () => {
                          setIsMergeOpen(false);
                          setMergeTargetId('');
                          showToast('Customers merged successfully.');
                        },
                        onError: (err) => showToast(`Merge failed: ${(err as Error).message}`),
                      },
                    );
                  }}
                  disabled={mergeCustomer.isPending}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {mergeCustomer.isPending ? 'Merging…' : 'Merge'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Merge Household Modal */}
      {isMergeHouseholdOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/40">
              <div className="flex items-center gap-2">
                <CheckCheck className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground text-sm">Merge Household</h3>
              </div>
              <button onClick={() => setIsMergeHouseholdOpen(false)} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-[13px]">
              <p className="text-muted-foreground">
                Link <strong className="text-foreground">{profile.name}</strong> and another customer into one shared household. Both customers and their pets are linked to the household.
              </p>
              <div>
                <label className="block text-foreground font-semibold mb-1">Other Customer ID</label>
                <input
                  type="text"
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  placeholder="Enter the other customer's UUID"
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground"
                />
              </div>
              <div className="pt-4 border-t border-border flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsMergeHouseholdOpen(false)}
                  className="px-4 py-2 border rounded-xl text-muted-foreground hover:bg-muted/40 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!mergeTargetId.trim()) {
                      showToast('Enter the other customer ID.');
                      return;
                    }
                    mergeHousehold.mutate(
                      { customer_ids: [profile.id, mergeTargetId.trim()] } as never,
                      {
                        onSuccess: () => {
                          setIsMergeHouseholdOpen(false);
                          setMergeTargetId('');
                          showToast('Households merged successfully.');
                        },
                        onError: (err) => showToast(`Merge failed: ${(err as Error).message}`),
                      },
                    );
                  }}
                  disabled={mergeHousehold.isPending}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {mergeHousehold.isPending ? 'Merging…' : 'Merge'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/40">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground text-sm">Checkout — {profile.name}</h3>
              </div>
              <button onClick={() => setIsCheckoutOpen(false)} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-[13px]">
              <div>
                <label className="block text-foreground font-semibold mb-1">Appointment (optional)</label>
                <select
                  value={checkoutApptId}
                  onChange={(e) => setCheckoutApptId(e.target.value)}
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground"
                >
                  <option value="">No appointment — walk-in / manual charge</option>
                  {checkoutAppts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.date} — {a.service}{a.pet ? ` (${a.pet})` : ''} [{a.status}]
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-foreground font-semibold mb-1">Amount ($)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={checkoutAmount}
                  onChange={(e) => setCheckoutAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground"
                />
              </div>
              <div>
                <label className="block text-foreground font-semibold mb-1">Payment Method</label>
                <select
                  value={checkoutMethod}
                  onChange={(e) => setCheckoutMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="check">Check</option>
                  <option value="gift_card">Gift Card</option>
                  <option value="store_credit">Store Credit</option>
                </select>
              </div>
              <div className="pt-4 border-t border-border flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCheckoutOpen(false)}
                  className="px-4 py-2 border rounded-xl text-muted-foreground hover:bg-muted/40 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const amount = parseFloat(checkoutAmount);
                    if (!amount || amount <= 0) {
                      showToast('Enter a valid amount.');
                      return;
                    }
                    checkout.mutate(
                      { customer_id: profile.id, payment_method: checkoutMethod, amount, appointment_id: checkoutApptId || undefined },
                      {
                        onSuccess: (data) => {
                          setIsCheckoutOpen(false);
                          setCheckoutAmount('');
                          showToast(data.message || 'Checkout complete.');
                        },
                        onError: (err) => showToast(`Checkout failed: ${(err as Error).message}`),
                      },
                    );
                  }}
                  disabled={checkout.isPending}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {checkout.isPending ? 'Processing…' : 'Complete Checkout'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/40">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground text-sm">Checkout — {profile.name}</h3>
              </div>
              <button onClick={() => setIsCheckoutOpen(false)} className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-[13px]">
              <div>
                <label className="block text-foreground font-semibold mb-1">Appointment (optional)</label>
                <select
                  value={checkoutApptId}
                  onChange={(e) => setCheckoutApptId(e.target.value)}
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground"
                >
                  <option value="">No appointment — walk-in / manual charge</option>
                  {checkoutAppts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.date} — {a.service}{a.pet ? ` (${a.pet})` : ''} [{a.status}]
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-foreground font-semibold mb-1">Amount ($)</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={checkoutAmount}
                  onChange={(e) => setCheckoutAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground"
                />
              </div>
              <div>
                <label className="block text-foreground font-semibold mb-1">Payment Method</label>
                <select
                  value={checkoutMethod}
                  onChange={(e) => setCheckoutMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-muted/40 border border-border rounded-xl text-foreground"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="check">Check</option>
                  <option value="gift_card">Gift Card</option>
                  <option value="store_credit">Store Credit</option>
                </select>
              </div>
              <div className="pt-4 border-t border-border flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCheckoutOpen(false)}
                  className="px-4 py-2 border rounded-xl text-muted-foreground hover:bg-muted/40 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const amount = parseFloat(checkoutAmount);
                    if (!amount || amount <= 0) {
                      showToast('Enter a valid amount.');
                      return;
                    }
                    checkout.mutate(
                      { customer_id: profile.id, payment_method: checkoutMethod, amount, appointment_id: checkoutApptId || undefined },
                      {
                        onSuccess: (data) => {
                          setIsCheckoutOpen(false);
                          setCheckoutAmount('');
                          showToast(data.message || 'Checkout complete.');
                        },
                        onError: (err) => showToast(`Checkout failed: ${(err as Error).message}`),
                      },
                    );
                  }}
                  disabled={checkout.isPending}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {checkout.isPending ? 'Processing…' : 'Complete Checkout'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
