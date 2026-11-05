'use client';

import React, { useEffect, useState } from 'react';
import { 
  X, 
  Calendar, 
  User, 
  DollarSign, 
  Receipt, 
  FileText, 
  Check, 
  Search,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { AppointmentItem, Customer, DawgNavSection } from '@/lib/types';
import { AdminSearch } from '@/components/admin/AdminSearch';
import StripeCardForm from '@/components/portal/StripeCardForm';
import { CreditCard, Link2, Copy, Mail } from 'lucide-react';

interface QuickActionModalsProps {
  activeModal: 'customer' | 'payment' | 'invoice' | 'search' | null;
  onClose: () => void;
  onSaveAppointment: (appt: Partial<AppointmentItem>) => void;
  onSaveCustomer: (cust: Partial<Customer>) => void;
  onNavigateSection: (sec: DawgNavSection) => void;
}

// ── Real-data pickers ──────────────────────────────────────────────────────
// Every quick-action form below works off REAL records: customers,
// services and staff are fetched from the CRM APIs and the chosen rows'
// IDs are what get submitted. Free-text names are never saved as data.
type PickerCustomer = { id: string; name: string; email: string };
type PickerService = { id: string; name: string; price: number; durationMinutes: number };
type PickerStaff = { id: string; name: string };

async function searchCustomers(q: string): Promise<PickerCustomer[]> {
  const res = await fetch(`/api/admin/crm/customers?search=${encodeURIComponent(q)}&limit=10`);
  const j = await res.json().catch(() => ({}));
  const rows: any[] = j.data || j.customers || [];
  return rows.map((r) => ({
    id: String(r.id),
    name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email || 'Customer',
    email: r.email || '',
  }));
}

const CustomerPicker: React.FC<{
  selected: PickerCustomer | null;
  onSelect: (c: PickerCustomer | null) => void;
}> = ({ selected, onSelect }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickerCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);

  useEffect(() => {
    if (selected) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const found = await searchCustomers(q);
        if (!cancelled) {
          setResults(found);
          setSearchFailed(false);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setSearchFailed(true);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, selected]);

  if (selected) {
    return (
      <div className="flex items-center justify-between px-2.5 py-1.5 border border-border bg-muted/30">
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">{selected.name}</p>
          {selected.email && <p className="text-[11px] text-muted-foreground truncate">{selected.email}</p>}
        </div>
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            setQuery('');
            setResults([]);
          }}
          className="text-[11px] font-semibold uppercase text-primary hover:underline cursor-pointer shrink-0 ml-2"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search customers by name, email, or phone…"
        className="w-full px-2.5 py-1.5 border border-border bg-card focus:outline-none text-foreground font-semibold"
      />
      {query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border shadow-popover z-20 max-h-48 overflow-y-auto">
          {searching && <p className="px-2.5 py-2 text-[12px] text-muted-foreground">Searching…</p>}
          {!searching && results.length === 0 && (
            <p className="px-2.5 py-2 text-[12px] text-muted-foreground">
              {searchFailed ? 'Could not search customers — please try again.' : 'No customers match that search.'}
            </p>
          )}
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c)}
              className="w-full text-left px-2.5 py-2 hover:bg-accent/50 cursor-pointer"
            >
              <span className="block font-semibold text-foreground">{c.name}</span>
              {c.email && <span className="block text-[11px] text-muted-foreground">{c.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

function formatTime12h(t: string): string {
  const [hRaw, mRaw] = t.split(':');
  const h = parseInt(hRaw || '0', 10);
  const m = mRaw || '00';
  if (Number.isNaN(h)) return t;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

export const QuickActionModals: React.FC<QuickActionModalsProps> = ({
  activeModal,
  onClose,
  onSaveAppointment,
  onSaveCustomer,
  onNavigateSection
}) => {
  // Appointment Form State — ID-backed pickers only (real CRM records)
  const [apptCustomer, setApptCustomer] = useState<PickerCustomer | null>(null);
  const [services, setServices] = useState<PickerService[]>([]);
  const [apptServiceId, setApptServiceId] = useState('');
  const [staffList, setStaffList] = useState<PickerStaff[]>([]);
  const [apptStaffId, setApptStaffId] = useState('');
  const [apptDate, setApptDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [apptTime, setApptTime] = useState('10:00');
  const [apptPrice, setApptPrice] = useState('');
  const [apptDuration, setApptDuration] = useState(60);
  const [apptNotes, setApptNotes] = useState('');
  const [apptSubmitting, setApptSubmitting] = useState(false);
  const [apptError, setApptError] = useState<string | null>(null);

  // Customer Form State
  const [custName, setCustName] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPhone, setCustPhone] = useState('');

  // Payment Form State — manual tender recording (no card terminal exists)
  const [payCustomer, setPayCustomer] = useState<PickerCustomer | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [payReference, setPayReference] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [recordedPayment, setRecordedPayment] = useState<{ number: string; amount: number; note?: string } | null>(null);
  // Card mode (Stripe): the same four tender choices as the POS register —
  // type the card, send a payment link, charge a card on file, or record
  // manually (the original form). Card charges finalize through
  // /api/admin/card-payments → the same commerce_payments write
  // take_payment makes, with the Stripe payment id attached.
  const [payMode, setPayMode] = useState<'manual' | 'card'>('manual');
  const [payCardOpts, setPayCardOpts] = useState<any | null>(null);
  const [payCardBusy, setPayCardBusy] = useState(false);
  const [payCardError, setPayCardError] = useState<string | null>(null);
  const [payCardNotice, setPayCardNotice] = useState<string | null>(null);
  const [paySaveCard, setPaySaveCard] = useState(false);
  const [payKeyed, setPayKeyed] = useState<{ pendingId: string; clientSecret: string } | null>(null);
  const [payLink, setPayLink] = useState<{ pendingId: string; url: string; emailed: boolean; emailError?: string } | null>(null);
  const [paySavedCardId, setPaySavedCardId] = useState('');

  useEffect(() => {
    if (activeModal !== 'payment' || payMode !== 'card' || !payCustomer) { setPayCardOpts(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/card-payments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'options', customerId: payCustomer.id }),
        });
        const data = await res.json();
        if (!cancelled && res.ok && data.ok) {
          setPayCardOpts(data);
          if (data.savedCards?.length) setPaySavedCardId(data.savedCards[0].id);
        }
      } catch { /* card section keeps its checking state */ }
    })();
    return () => { cancelled = true; };
  }, [activeModal, payMode, payCustomer]);

  // Invoice Form State — real customer + real line items + real due date
  const [invCustomer, setInvCustomer] = useState<PickerCustomer | null>(null);
  const [invItems, setInvItems] = useState<Array<{ description: string; amount: string }>>([
    { description: '', amount: '' },
  ]);
  const [invDueDate, setInvDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().slice(0, 10);
  });
  const [invSubmitting, setInvSubmitting] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);
  const [createdInvoice, setCreatedInvoice] = useState<{ number: string; total: number } | null>(null);

  // Search State
  const [searchTerm, setSearchTerm] = useState('');

  // (Appointment-modal data loading removed with the severed modal, 2026-10-30.)

  if (!activeModal) return null;

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setApptError(null);
    if (!apptCustomer) {
      setApptError('Pick the customer this appointment is for.');
      return;
    }
    const service = services.find((s) => s.id === apptServiceId) || null;
    if (!service) {
      setApptError('Pick a service.');
      return;
    }
    const staff = staffList.find((s) => s.id === apptStaffId) || null;
    const priceNum = parseFloat(apptPrice) || 0;
    const starts = new Date(`${apptDate}T${apptTime}`);
    if (Number.isNaN(starts.getTime())) {
      setApptError('Pick a valid date and time.');
      return;
    }
    const ends = new Date(starts.getTime() + Math.max(15, apptDuration || 60) * 60000);
    setApptSubmitting(true);
    try {
      // Real write: POST /api/admin/crm/appointments inserts the
      // crm_appointments row with the picked customer + groomer IDs, plus
      // crm_appointment_services join rows from service_id (the joins
      // are what list views read names from). internal_notes keeps a
      // human-readable summary as well.
      const res = await fetch('/api/admin/crm/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: apptCustomer.id,
          service_id: service.id,
          assigned_groomer_id: staff?.id || undefined,
          starts_at: starts.toISOString(),
          ends_at: ends.toISOString(),
          status: 'scheduled',
          subtotal: priceNum,
          total: priceNum,
          currency: 'USD',
          source_channel: 'admin_quick_action',
          customer_notes: apptNotes.trim() || undefined,
          internal_notes:
            `Booked via quick action — Service: ${service.name}`,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.data?.id) {
        setApptError(j.error || 'Appointment could not be booked. Please try again.');
        return;
      }
      onSaveAppointment({
        customerName: apptCustomer.name,
        serviceName: service.name,
        staffName: staff?.name || 'Unassigned',
        date: apptDate,
        time: formatTime12h(apptTime),
        price: priceNum,
        status: 'Scheduled',
        notes: apptNotes,
      });
      onClose();
    } catch {
      setApptError('Appointment could not be booked — network error.');
    } finally {
      setApptSubmitting(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    // Real write: POST crm add_customer inserts the crm_customers row.
    // No fabricated contact defaults — empty fields stay empty server-side.
    const parts = custName.trim().split(/\s+/).filter(Boolean);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ');
    if (!firstName) {
      alert('Enter the customer name.');
      return;
    }
    try {
      const res = await fetch('/api/admin/crm/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'crm_add_customer',
          first_name: firstName,
          last_name: lastName || undefined,
          email: custEmail.trim() || undefined,
          phone: custPhone.trim() || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        alert(j.error || 'Customer could not be saved. Please try again.');
        return;
      }
    } catch {
      alert('Customer could not be saved — network error.');
      return;
    }
    onSaveCustomer({
      name: custName.trim(),
      email: custEmail.trim(),
      phone: custPhone.trim(),
      totalSpent: 0,
      lastVisit: 'Today',
    });
    onClose();
  };

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayError(null);
    if (!payCustomer) {
      setPayError('Pick the customer this payment belongs to.');
      return;
    }
    const amount = parseFloat(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPayError('Enter an amount greater than zero.');
      return;
    }
    setPaySubmitting(true);
    try {
      // Real write: finance take_payment records a commerce_payments row.
      // This records a MANUAL tender (money taken outside a terminal) —
      // it never charges a card. The tender the staff member chose is
      // written into the payment reference so the ledger says what happened.
      const res = await fetch('/api/admin/finance/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'fin_take_payment',
          customer_id: payCustomer.id,
          amount,
          reference: `Manual tender: ${payMethod}${payReference.trim() ? ` — ${payReference.trim()}` : ''}`,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setPayError(j.error || 'Payment could not be recorded. Please try again.');
        return;
      }
      setRecordedPayment({ number: String(j.paymentNumber || ''), amount: Number(j.amount ?? amount) });
    } catch {
      setPayError('Payment could not be recorded — network error.');
    } finally {
      setPaySubmitting(false);
    }
  };

  // ── Card mode handlers (Stripe paths — kind 'manual_payment') ──
  const postCardPayment = async (payload: any) => {
    const res = await fetch('/api/admin/card-payments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  const cardBasePayload = () => ({
    kind: 'manual_payment',
    customerId: payCustomer?.id || null,
    amount: parseFloat(payAmount),
    reference: payReference.trim() || 'Counter payment',
  });

  const validCardAmount = () => {
    if (!payCustomer) { setPayCardError('Pick the customer this payment belongs to.'); return false; }
    const amount = parseFloat(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setPayCardError('Enter an amount greater than zero.'); return false; }
    return true;
  };

  const startModalKeyed = async () => {
    if (payCardBusy || !validCardAmount()) return;
    setPayCardBusy(true); setPayCardError(null); setPayCardNotice(null);
    try {
      const { res, data } = await postCardPayment({ action: 'keyed_intent', ...cardBasePayload(), saveCard: paySaveCard });
      if (!res.ok || !data.ok) { setPayCardError(data.error || 'Could not start the card payment.'); return; }
      setPayKeyed({ pendingId: data.pendingId, clientSecret: data.clientSecret });
    } catch { setPayCardError('Could not start the card payment — network error.'); }
    finally { setPayCardBusy(false); }
  };

  const onModalKeyedConfirmed = async (paymentIntentId: string) => {
    if (!payKeyed) return;
    setPayCardBusy(true); setPayCardError(null);
    try {
      const { res, data } = await postCardPayment({ action: 'confirm', pendingId: payKeyed.pendingId, paymentIntentId });
      if (res.ok && data.ok && data.status === 'completed') {
        setRecordedPayment({
          number: String(data.paymentNumber || ''),
          amount: parseFloat(payAmount),
          note: 'charged to the card typed at the register via Stripe',
        });
        return;
      }
      if (res.ok && data.ok && data.status === 'processing') {
        setPayCardNotice('The bank is still processing this charge — it records itself when it clears. Don\'t charge the card again.');
        return;
      }
      setPayCardError(data.error || 'The charge did not complete. Nothing was recorded.');
    } catch { setPayCardError('Could not verify the charge — network error. Check Payments before re-charging.'); }
    finally { setPayCardBusy(false); }
  };

  const startModalLink = async () => {
    if (payCardBusy || !validCardAmount()) return;
    setPayCardBusy(true); setPayCardError(null); setPayCardNotice(null);
    try {
      const { res, data } = await postCardPayment({ action: 'link', ...cardBasePayload(), saveCard: paySaveCard });
      if (!res.ok || !data.ok) { setPayCardError(data.error || 'Could not create the payment link.'); return; }
      setPayLink({ pendingId: data.pendingId, url: data.url, emailed: false });
    } catch { setPayCardError('Could not create the payment link — network error.'); }
    finally { setPayCardBusy(false); }
  };

  const sendModalLinkEmail = async () => {
    if (!payLink || payCardBusy) return;
    setPayCardBusy(true);
    try {
      const { res, data } = await postCardPayment({ action: 'link_send', pendingId: payLink.pendingId });
      if (res.ok && data.ok && data.emailed) setPayLink({ ...payLink, emailed: true });
      else setPayLink({ ...payLink, emailError: data.error || 'Email could not be sent — copy the link instead.' });
    } catch { setPayLink({ ...payLink, emailError: 'Email could not be sent — network error.' }); }
    finally { setPayCardBusy(false); }
  };

  const checkModalLink = async () => {
    if (!payLink || payCardBusy) return;
    setPayCardBusy(true); setPayCardError(null);
    try {
      const { res, data } = await postCardPayment({ action: 'status', pendingId: payLink.pendingId });
      if (res.ok && data.ok && data.status === 'completed') {
        setRecordedPayment({
          number: '',
          amount: parseFloat(payAmount),
          note: 'paid by the customer through the Stripe payment link',
        });
        return;
      }
      setPayCardNotice('Not paid yet — the payment records itself the moment the customer pays. You can close this window; nothing is lost.');
    } catch { setPayCardError('Could not check the link status — network error.'); }
    finally { setPayCardBusy(false); }
  };

  const chargeModalOnFile = async () => {
    if (payCardBusy || !validCardAmount()) return;
    setPayCardBusy(true); setPayCardError(null); setPayCardNotice(null);
    try {
      const { res, data } = await postCardPayment({ action: 'on_file_charge', ...cardBasePayload(), paymentMethodId: paySavedCardId || undefined });
      if (!res.ok || !data.ok) { setPayCardError(data.error || 'The card on file could not be charged.'); return; }
      if (data.outcome === 'completed') {
        setRecordedPayment({
          number: String(data.paymentNumber || ''),
          amount: parseFloat(payAmount),
          note: 'charged to the customer\'s card on file via Stripe',
        });
        return;
      }
      if (data.outcome === 'authentication_required') { setPayCardNotice(data.message); return; }
      setPayCardError(data.message || 'The card on file was declined.');
    } catch { setPayCardError('Could not charge the card on file — network error.'); }
    finally { setPayCardBusy(false); }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setInvError(null);
    if (!invCustomer) {
      setInvError('Pick the customer this invoice is for.');
      return;
    }
    const lineItems = invItems
      .map((i) => ({ description: i.description.trim(), amount: parseFloat(i.amount) || 0 }))
      .filter((i) => i.description && i.amount > 0);
    if (lineItems.length === 0) {
      setInvError('Add at least one line item with a description and an amount.');
      return;
    }
    if (!invDueDate) {
      setInvError('Pick a due date.');
      return;
    }
    setInvSubmitting(true);
    try {
      // Real write: finance create_invoice creates the invoice (AR ledger +
      // legacy invoices table) and returns the server-issued invoice number.
      const res = await fetch('/api/admin/finance/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'fin_create_invoice',
          customer_id: invCustomer.id,
          line_items: lineItems,
          due_date: invDueDate,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setInvError(j.error || 'Invoice could not be created. Please try again.');
        return;
      }
      setCreatedInvoice({ number: String(j.invoiceNumber || ''), total: Number(j.total || 0) });
    } catch {
      setInvError('Invoice could not be created — network error.');
    } finally {
      setInvSubmitting(false);
    }
  };

  const invTotal = invItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 bg-foreground/[0-9]0 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg bg-card border border-border rounded-xl shadow-popover my-6 transition-all animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-card rounded-t-xl">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-card">
              {activeModal === 'customer' && <User className="w-4 h-4" />}
              {activeModal === 'payment' && <DollarSign className="w-4 h-4" />}
              {activeModal === 'invoice' && <Receipt className="w-4 h-4" />}
              {activeModal === 'search' && <Search className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="font-display text-sm font-semibold tracking-tight text-foreground">
                {activeModal === 'customer' && 'Register Customer Profile'}
                {activeModal === 'payment' && 'Process Payment'}
                {activeModal === 'invoice' && 'Generate Client Invoice'}
                {activeModal === 'search' && 'Command Palette'}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Quick Actions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-8 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer flex items-center justify-center text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Appointments modals SEVERED 2026-10-30:
            the Appointments module is excluded from the Unsaid import.
            Their form handlers remain below as dead code (unreachable:
            the modal types were removed from the store union). */}

        {/* Modal Body: Customer Form */}
        {activeModal === 'customer' && (
          <form onSubmit={handleCreateCustomer} className="p-5 space-y-3.5 text-[13px] text-foreground">
            <div>
              <label className="block font-semibold uppercase text-[10px] text-foreground mb-1">Full Name</label>
              <input
                type="text"
                required
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                placeholder="e.g. Rachel Green"
                className="w-full px-2.5 py-1.5 border border-border bg-card focus:outline-none text-foreground font-semibold"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold uppercase text-[10px] text-foreground mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={custEmail}
                  onChange={(e) => setCustEmail(e.target.value)}
                  placeholder="rachel@portalmail.com"
                  className="w-full px-2.5 py-1.5 border border-border bg-card focus:outline-none text-foreground"
                />
              </div>
              <div>
                <label className="block font-semibold uppercase text-[10px] text-foreground mb-1">Phone</label>
                <input
                  type="tel"
                  required
                  value={custPhone}
                  onChange={(e) => setCustPhone(e.target.value)}
                  placeholder="(214) 555-0199"
                  className="w-full px-2.5 py-1.5 border border-border bg-card focus:outline-none text-foreground"
                />
              </div>
            </div>
            <div className="pt-2 border-t border-border flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 border border-border bg-card hover:bg-accent/50 font-semibold uppercase text-[13px] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 border border-border bg-primary text-primary-foreground hover:bg-primary/90 font-semibold uppercase text-[13px] cursor-pointer"
              >
                Save Client Record
              </button>
            </div>
          </form>
        )}

        {/* Modal Body: Payment Form */}
        {activeModal === 'payment' && (
          <div className="p-5 space-y-3.5 text-[13px] text-foreground tabular-nums">
            {recordedPayment ? (
              <>
                <div className="p-3 bg-success/10 border border-success/20 space-y-1">
                  <p className="font-semibold text-foreground uppercase flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-success" /> Payment Recorded
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    ${recordedPayment.amount.toFixed(2)} recorded for {payCustomer?.name || 'the customer'}
                    {recordedPayment.number ? ` (ref ${recordedPayment.number})` : ''}
                    {recordedPayment.note
                      ? ` — ${recordedPayment.note}.`
                      : ` as a manual tender (${payMethod}). No card was charged.`}
                  </p>
                </div>
                <div className="pt-2 border-t border-border flex justify-end">
                  <button
                    onClick={onClose}
                    className="px-4 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold uppercase text-[13px] cursor-pointer border border-border"
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleProcessPayment} className="space-y-3.5">
                {/* Mode: charge a card for real (Stripe) or record manually */}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setPayMode('card'); setPayError(null); }}
                    className={`py-2 px-2 border font-semibold uppercase text-[11px] cursor-pointer flex items-center justify-center gap-1.5 ${payMode === 'card' ? 'bg-primary text-primary-foreground border-border' : 'bg-card hover:bg-accent/50 border-border'}`}>
                    <CreditCard className="w-3.5 h-3.5" /> Charge a card
                  </button>
                  <button type="button" onClick={() => { setPayMode('manual'); setPayCardError(null); }}
                    className={`py-2 px-2 border font-semibold uppercase text-[11px] cursor-pointer ${payMode === 'manual' ? 'bg-primary text-primary-foreground border-border' : 'bg-card hover:bg-accent/50 border-border'}`}>
                    Record manually
                  </button>
                </div>
                {payMode === 'manual' && (
                  <div className="p-3 bg-warning/10 border border-warning/30 space-y-1">
                    <p className="font-semibold text-foreground uppercase text-[11px]">Manual record — no card is charged</p>
                    <p className="text-[11px] text-muted-foreground">
                      Record a payment taken at the counter: cash, check, or a card payment completed another way.
                      It lands in the payments ledger as a manual tender. To charge a card for real, switch to
                      “Charge a card” above.
                    </p>
                  </div>
                )}
                <div>
                  <label className="block font-semibold uppercase text-[10px] text-foreground mb-1">Client</label>
                  <CustomerPicker selected={payCustomer} onSelect={setPayCustomer} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold uppercase text-[10px] text-foreground mb-1">Amount ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-2.5 py-1.5 border border-border bg-card focus:outline-none text-foreground font-semibold text-sm"
                    />
                  </div>
                  {payMode === 'manual' && (
                    <div>
                      <label className="block font-semibold uppercase text-[10px] text-foreground mb-1">Manual Tender</label>
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value)}
                        className="w-full px-2 py-1.5 border border-border bg-card focus:outline-none text-foreground font-semibold cursor-pointer"
                      >
                        <option>Cash</option>
                        <option>Check</option>
                        <option>Card (recorded manually)</option>
                        <option>Store Credit</option>
                        <option>Gift Card</option>
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block font-semibold uppercase text-[10px] text-foreground mb-1">Reference (optional)</label>
                  <input
                    type="text"
                    value={payReference}
                    onChange={(e) => setPayReference(e.target.value)}
                    placeholder="e.g. Check #1042, receipt note…"
                    className="w-full px-2.5 py-1.5 border border-border bg-card focus:outline-none text-foreground"
                  />
                </div>

                {payMode === 'card' && (
                  <div className="space-y-2.5 border border-border p-3">
                    {!payCustomer ? (
                      <p className="text-[11px] text-muted-foreground">Pick the client first — card options are tied to their record.</p>
                    ) : payCardOpts === null ? (
                      <p className="text-[11px] text-muted-foreground">Checking card options…</p>
                    ) : !payCardOpts.configured ? (
                      <p className="text-[11px] font-medium text-destructive bg-destructive/10 border border-destructive/20 px-2.5 py-2">{payCardOpts.reason}</p>
                    ) : (
                      <>
                        {!payKeyed && !payLink && (
                          <>
                            <div className="grid grid-cols-3 gap-2">
                              <button type="button" onClick={startModalKeyed} disabled={payCardBusy}
                                className="py-2 px-1.5 border border-border bg-card hover:bg-accent/50 font-semibold text-[11px] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1">
                                <CreditCard className="w-3.5 h-3.5" /> Type card
                              </button>
                              <button type="button" onClick={startModalLink} disabled={payCardBusy}
                                className="py-2 px-1.5 border border-border bg-card hover:bg-accent/50 font-semibold text-[11px] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1">
                                <Link2 className="w-3.5 h-3.5" /> Payment link
                              </button>
                              <button type="button" onClick={chargeModalOnFile} disabled={payCardBusy || !(payCardOpts.savedCards?.length > 0)}
                                className="py-2 px-1.5 border border-border bg-card hover:bg-accent/50 font-semibold text-[11px] cursor-pointer disabled:opacity-40">
                                Card on file{payCardOpts.savedCards?.length ? ` •••• ${payCardOpts.savedCards[0].last4}` : ''}
                              </button>
                            </div>
                            {payCardOpts.savedCards?.length > 1 && (
                              <select value={paySavedCardId} onChange={(e) => setPaySavedCardId(e.target.value)}
                                className="w-full px-2 py-1.5 border border-border bg-card focus:outline-none text-foreground text-[12px] cursor-pointer">
                                {payCardOpts.savedCards.map((c: any) => (
                                  <option key={c.id} value={c.id}>{c.brand} •••• {c.last4} — exp {c.expMonth}/{c.expYear}</option>
                                ))}
                              </select>
                            )}
                            {payCardOpts.savedCards?.length === 0 && (
                              <p className="text-[11px] text-muted-foreground">No card on file for this customer — type the card or send a link; either can save one for next time.</p>
                            )}
                            {payCardOpts.canSaveCard && (
                              <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
                                <input type="checkbox" checked={paySaveCard} onChange={(e) => setPaySaveCard(e.target.checked)} className="rounded border-border" />
                                Save the card for next time (typed card / link)
                              </label>
                            )}
                          </>
                        )}
                        {payKeyed && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="font-semibold text-[12px]">Type the customer&apos;s card</p>
                              <button type="button" onClick={() => setPayKeyed(null)} className="text-[11px] underline text-muted-foreground cursor-pointer">Back</button>
                            </div>
                            <StripeCardForm clientSecret={payKeyed.clientSecret} amount={parseFloat(payAmount) || 0} onConfirmed={onModalKeyedConfirmed} />
                          </div>
                        )}
                        {payLink && (
                          <div className="space-y-2">
                            <p className="font-semibold text-[12px]">Payment link created</p>
                            <div className="flex gap-2">
                              <input readOnly value={payLink.url} onFocus={(e) => e.target.select()}
                                className="flex-1 px-2 py-1.5 border border-border bg-muted/40 text-[11px] focus:outline-none" />
                              <button type="button" onClick={() => { try { navigator.clipboard.writeText(payLink.url); } catch { /* select-to-copy fallback */ } }}
                                className="px-2.5 py-1.5 border border-border bg-card hover:bg-accent/50 text-[11px] font-semibold cursor-pointer flex items-center gap-1">
                                <Copy className="w-3 h-3" /> Copy
                              </button>
                            </div>
                            {payCardOpts.customerEmail && (
                              <button type="button" onClick={sendModalLinkEmail} disabled={payLink.emailed || payCardBusy}
                                className="w-full py-1.5 border border-border bg-card hover:bg-accent/50 text-[11px] font-semibold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5">
                                <Mail className="w-3.5 h-3.5" /> {payLink.emailed ? `Sent to ${payCardOpts.customerEmail}` : `Email the link to ${payCardOpts.customerEmail}`}
                              </button>
                            )}
                            {payLink.emailError && <p className="text-[11px] text-destructive">{payLink.emailError}</p>}
                            <p className="text-[11px] text-muted-foreground">The payment records itself the moment the customer pays — you can close this window and nothing is lost.</p>
                            <div className="flex gap-2">
                              <button type="button" onClick={checkModalLink} disabled={payCardBusy}
                                className="flex-1 py-1.5 border border-border bg-card hover:bg-accent/50 text-[11px] font-semibold cursor-pointer disabled:opacity-50">
                                Check if they&apos;ve paid
                              </button>
                              <button type="button" onClick={() => setPayLink(null)} className="flex-1 py-1.5 border border-border bg-card hover:bg-accent/50 text-[11px] font-semibold cursor-pointer">
                                Back
                              </button>
                            </div>
                          </div>
                        )}
                        {payCardNotice && (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-2">{payCardNotice}</p>
                        )}
                        {payCardError && (
                          <p className="text-[11px] font-medium text-destructive bg-destructive/10 border border-destructive/20 px-2.5 py-2">{payCardError}</p>
                        )}
                      </>
                    )}
                  </div>
                )}

                {payError && payMode === 'manual' && (
                  <p className="text-[12px] font-medium text-destructive bg-destructive/10 border border-destructive/20 px-2.5 py-2">
                    {payError}
                  </p>
                )}
                <div className="pt-2 border-t border-border flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-1.5 border border-border bg-card hover:bg-accent/50 font-semibold uppercase text-[13px] cursor-pointer"
                  >
                    Cancel
                  </button>
                  {payMode === 'manual' && (
                    <button
                      type="submit"
                      disabled={paySubmitting}
                      className="px-4 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold uppercase text-[13px] cursor-pointer border border-border flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>{paySubmitting ? 'Recording…' : 'Record Payment'}</span>
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        )}

        {/* Modal Body: Invoice Form */}
        {activeModal === 'invoice' && (
          <div className="p-5 space-y-3.5 text-[13px] text-foreground tabular-nums">
            {createdInvoice ? (
              <>
                <div className="p-3 bg-success/10 border border-success/20 space-y-1">
                  <p className="font-semibold text-foreground uppercase flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-success" /> Invoice {createdInvoice.number} Created
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    ${createdInvoice.total.toFixed(2)} for {invCustomer?.name || 'the customer'}, due {invDueDate}.
                    The invoice is in the AR ledger — creating it here doesn&apos;t email it to the client.
                  </p>
                </div>
                <div className="pt-2 border-t border-border flex justify-end">
                  <button
                    onClick={onClose}
                    className="px-4 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold uppercase text-[13px] cursor-pointer border border-border"
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleCreateInvoice} className="space-y-3.5">
                <div>
                  <label className="block font-semibold uppercase text-[10px] text-foreground mb-1">Recipient Client</label>
                  <CustomerPicker selected={invCustomer} onSelect={setInvCustomer} />
                </div>
                <div className="space-y-2">
                  <label className="block font-semibold uppercase text-[10px] text-foreground">Line Items</label>
                  {invItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) =>
                          setInvItems((prev) => prev.map((it, i) => (i === idx ? { ...it, description: e.target.value } : it)))
                        }
                        placeholder="Description (e.g. Full Groom — Buddy)"
                        className="flex-1 px-2.5 py-1.5 border border-border bg-card focus:outline-none text-foreground"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.amount}
                        onChange={(e) =>
                          setInvItems((prev) => prev.map((it, i) => (i === idx ? { ...it, amount: e.target.value } : it)))
                        }
                        placeholder="0.00"
                        className="w-24 px-2.5 py-1.5 border border-border bg-card focus:outline-none text-foreground font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => setInvItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))}
                        disabled={invItems.length <= 1}
                        className="size-7 flex items-center justify-center border border-border bg-card hover:bg-accent/50 cursor-pointer disabled:opacity-40"
                        aria-label="Remove line item"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setInvItems((prev) => [...prev, { description: '', amount: '' }])}
                    className="text-[12px] font-semibold text-primary hover:underline cursor-pointer"
                  >
                    + Add line item
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold uppercase text-[10px] text-foreground mb-1">Due Date</label>
                    <input
                      type="date"
                      required
                      value={invDueDate}
                      onChange={(e) => setInvDueDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-border bg-card focus:outline-none text-foreground font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold uppercase text-[10px] text-foreground mb-1">Total</label>
                    <p className="px-2.5 py-1.5 border border-border bg-muted/30 font-semibold text-foreground">
                      ${invTotal.toFixed(2)}
                    </p>
                  </div>
                </div>
                {invError && (
                  <p className="text-[12px] font-medium text-destructive bg-destructive/10 border border-destructive/20 px-2.5 py-2">
                    {invError}
                  </p>
                )}
                <div className="pt-2 border-t border-border flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-1.5 border border-border bg-card hover:bg-accent/50 font-semibold uppercase text-[13px] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={invSubmitting}
                    className="px-4 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold uppercase text-[13px] cursor-pointer border border-border flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>{invSubmitting ? 'Creating…' : 'Create Invoice'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Modal Body: Command Palette Search */}
        {activeModal === 'search' && (
          <div className="p-4 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search commands, orders, clients, or navigate..."
                className="w-full pl-9 pr-3 h-9 bg-background border border-input rounded-lg text-[13px] text-foreground font-sans focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring transition-colors"
              />
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hidden sm:inline">
                ESC
              </kbd>
            </div>

            <div className="space-y-1">
              <AdminSearch
                query={searchTerm}
                onNavigate={(type, id, hit) => {
                  // Land on the RECORD where the target view supports a
                  // deep link: customers (and messages/documents via
                  // their owning customer) open the profile through the
                  // CustomersView ?customer_id= deep link; appointments
                  // open their detail through ?appointment_id=. Other
                  // types land on their section page.
                  const ownerId = (hit as any)?.primary_customer_id || (hit as any)?.customer_id || null;
                  if (type === 'customers') {
                    window.location.assign(`/admin/customers?customer_id=${id}`);
                    onClose();
                    return;
                  }
                  if ((type === 'messages' || type === 'documents') && ownerId) {
                    window.location.assign(`/admin/customers?customer_id=${ownerId}`);
                    onClose();
                    return;
                  }
                  if (type === 'appointments') {
                    window.location.assign(`/admin/appointments?appointment_id=${id}`);
                    onClose();
                    return;
                  }
                  const sectionMap: Record<string, string> = {
                    invoices: 'invoices',
                    payments: 'payments',
                    messages: 'messages',
                    documents: 'documents',
                  };
                  const sec = sectionMap[type];
                  if (sec) {
                    onNavigateSection(sec as DawgNavSection);
                    onClose();
                  }
                }}
              />
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pb-1">
                Direct Navigation
              </p>
              {[
                { label: 'Orders & Fulfillment', sec: 'orders' },
                { label: 'Shipping & Label Station', sec: 'shipping' },
                { label: 'Returns & Exchanges', sec: 'returns' },
                { label: 'Purchase Orders & Receiving', sec: 'purchase-orders' },
                { label: 'Payments & Revenue Ledger', sec: 'payments' },
                { label: 'Customer Directory', sec: 'customers' },
                { label: 'Appointments Schedule', sec: 'appointments' },
                { label: 'Settings', sec: 'settings' },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    onNavigateSection(item.sec as DawgNavSection);
                    onClose();
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-accent hover:text-accent-foreground text-foreground text-[13px] font-medium transition-colors flex items-center justify-between border border-transparent hover:border-border cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring"
                >
                  <span>{item.label}</span>
                  <span className="text-[10px] uppercase tabular-nums text-muted-foreground">Jump →</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
