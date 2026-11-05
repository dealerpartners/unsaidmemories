'use client';

import React, { useEffect, useState } from 'react';
import { CustomerFullProfile, CustomerPetDetail } from '@/lib/types';
import { Calendar, Check, ChevronRight, Plus, PawPrint, Upload, ArrowRight, Phone, Mail, X, FileText, ShieldCheck, CheckCircle } from 'lucide-react';

interface CustomerQuickActionsProps {
  customer: CustomerFullProfile;
  onCancel: () => void;
  onSuccess: (message: string, data?: any) => void;
  onOpenManageVaccines?: (pet: CustomerPetDetail) => void;
  onOpenAddPetModal?: () => void;
}

// CRM-keyed writes (crm_pets / crm_notes / commerce_payments.customer_id)
// must carry the crm_customers.id — NOT the shop profile id, which either
// FK-fails or silently no-ops. Resolve it the same way the New
// Appointment view does: the merged crmCustomerId prop when present,
// otherwise an exact-email match against the CRM customer list (identity
// discovery only — never used to match money or records across stores).
function useResolvedCrmId(customer: CustomerFullProfile): string | null {
  const [crmId, setCrmId] = useState<string | null>((customer as any).crmCustomerId || null);
  useEffect(() => {
    if (crmId) return;
    const email = (customer.email || '').trim();
    if (!email) return;
    let cancelled = false;
    fetch(`/api/admin/crm/customers?search=${encodeURIComponent(email)}&limit=10`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        const rows: any[] = j?.data || j?.customers || [];
        const match = rows.find((r) => String(r.email || '').toLowerCase() === email.toLowerCase());
        if (match) setCrmId(String(match.id));
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(customer as any).crmCustomerId, customer.email]);
  return crmId;
}

/* =========================================================================
 * 1. TAKE PAYMENT QUICK ACTION
 * ========================================================================= */
// Manual tenders this form can record — the same set the header terminal
// modal offers. No processor is wired to saved cards, so a card on file is
// only ever displayed here, never offered as a way to pay.
const MANUAL_TENDERS = ['Cash', 'Check', 'Card (recorded manually)', 'Store Credit', 'Gift Card'] as const;
type ManualTender = (typeof MANUAL_TENDERS)[number];

export const QuickActionTakePaymentView: React.FC<CustomerQuickActionsProps> = ({
  customer,
  onCancel,
  onSuccess,
}) => {
  const crmId = useResolvedCrmId(customer);
  const [paymentTarget, setPaymentTarget] = useState<'appointment' | 'invoice' | 'custom'>('invoice');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [appointmentAmount, setAppointmentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<ManualTender>('Cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // The customer's REAL open invoices from the canonical `invoices` table
  // (via GET /api/admin/invoices, filtered to this customer's CRM id —
  // invoice rows created from CRM flows carry the crm_customers id in
  // "customerId"). An invoice is open when it still has a balance due and
  // is not PAID / VOID / CANCELLED.
  interface OpenInvoice { id: string; number: string; balanceDue: number; total: number; createdAt: string | null }
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);
  useEffect(() => {
    if (!crmId) return;
    let cancelled = false;
    fetch('/api/admin/invoices', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        const rows: any[] = Array.isArray(j.invoices) ? j.invoices : [];
        const open = rows
          .filter((inv) => String(inv.customerId || '') === crmId
            && Number(inv.balanceDue || 0) > 0.005
            && !['PAID', 'VOID', 'CANCELLED'].includes(String(inv.status || '').toUpperCase()))
          .map((inv) => ({
            id: String(inv.id),
            number: String(inv.number || inv.id),
            balanceDue: Number(inv.balanceDue || 0),
            total: Number(inv.total || 0),
            createdAt: inv.createdAt || null,
          }));
        setOpenInvoices(open);
        setInvoicesLoaded(true);
        if (open.length > 0) {
          setSelectedInvoiceId((prev) => prev || open[0].id);
        } else {
          // Honest default: with nothing owed on invoice, the form opens
          // on Custom Amount instead of a fabricated invoice.
          setPaymentTarget((prev) => (prev === 'invoice' ? 'custom' : prev));
        }
      })
      .catch(() => { if (!cancelled) setInvoicesLoaded(true); });
    return () => { cancelled = true; };
  }, [crmId]);

  const selectedInvoice = openInvoices.find((i) => i.id === selectedInvoiceId) || null;
  const totalOutstanding = openInvoices.reduce((s, i) => s + i.balanceDue, 0);

  // Amount owed for the chosen target — always real: the selected
  // invoice's balance due, or an amount the user enters. No starter
  // amounts and no invented tax: invoice totals are already final.
  const amountOwed = paymentTarget === 'invoice'
    ? (selectedInvoice ? selectedInvoice.balanceDue : 0)
    : paymentTarget === 'appointment'
      ? (parseFloat(appointmentAmount) || 0)
      : (parseFloat(customAmount) || 0);

  // Default the Amount Paid field to the real amount owed whenever the
  // target/selection changes — until the user types their own amount.
  useEffect(() => {
    if (!amountTouched) setAmountPaid(amountOwed > 0 ? amountOwed.toFixed(2) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountOwed, invoicesLoaded]);

  const numericPaid = parseFloat(amountPaid) || 0;
  const balanceDue = Math.max(0, Math.round((amountOwed - numericPaid) * 100) / 100);

  // The customer's real card on file, if the profile carries one. Display
  // only — it is never charged from this form (see MANUAL_TENDERS note).
  const savedCard = customer.paymentMethods?.find((m) => m.isDefault) || customer.paymentMethods?.[0];
  const cardOnFile = savedCard
    ? {
        brand: savedCard.brand,
        last4: savedCard.last4,
        expires: `${String(savedCard.expMonth).padStart(2, '0')}/${String(savedCard.expYear).slice(-2)}`,
      }
    : customer.defaultPaymentMethod
      ? {
          brand: customer.defaultPaymentMethod.cardBrand,
          last4: customer.defaultPaymentMethod.last4,
          expires: customer.defaultPaymentMethod.expires,
        }
      : null;

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(numericPaid > 0)) {
      alert('Enter an amount greater than zero.');
      return;
    }
    if (!crmId) {
      alert('This profile is not linked to a CRM customer record, so the payment cannot be recorded.');
      return;
    }
    setIsProcessing(true);
    try {
      // Real write: POST finance take_payment records a commerce_payments row
      // for this customer (manual tender — card-on-file charging is not wired
      // to a processor here). commerce_payments.customer_id FKs to
      // crm_customers, so the CRM id is required — the shop profile id
      // FK-fails. Success is only reported after the server confirms the row.
      const res = await fetch('/api/admin/finance/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'fin_take_payment',
          customer_id: crmId,
          amount: numericPaid,
          reference: `Manual tender: ${paymentMethod}${paymentTarget === 'invoice' && selectedInvoice ? ` — ${selectedInvoice.number}` : ''}`,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        alert(j.error || 'Payment could not be recorded. Please try again.');
        return;
      }
      onSuccess(`Payment of $${numericPaid.toFixed(2)} recorded for ${customer.name} (ref ${j.paymentNumber}).`, {
        type: 'payment',
        amount: numericPaid,
        method: paymentMethod,
      });
    } catch {
      alert('Payment could not be recorded — network error.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col px-6 sm:px-8 py-6 max-w-7xl mx-auto w-full">
      {/* Customer Context Header */}
      <header className="mb-6">
        {/* Breadcrumbs */}
        <nav className="flex items-center text-[13px] font-medium text-muted-foreground/70 space-x-2 mb-2">
          <button onClick={onCancel} className="hover:text-muted-foreground transition-colors cursor-pointer">
            Customers
          </button>
          <span>&gt;</span>
          <button onClick={onCancel} className="text-muted-foreground hover:text-primary font-medium transition-colors cursor-pointer">
            {customer.name}
          </button>
          <span>&gt;</span>
          <span className="text-primary font-semibold">Take Payment</span>
        </nav>

        {/* Customer Profile Title Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4">
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">{customer.name}</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[13px] font-medium bg-success/10 text-success border border-success/20">
              Active Customer
            </span>
          </div>

          {/* Contact Details */}
          <div className="flex items-center space-x-4 text-[13px] text-muted-foreground mt-2 sm:mt-0 sm:pl-4 sm:border-l sm:border-border">
            <div className="flex items-center space-x-1.5">
              <Phone className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span>{customer.phone}</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <Mail className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span>{customer.email}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Payment Form Card */}
      <section className="bg-card rounded-xl border border-border shadow-sm p-6 flex flex-col flex-1">
        {/* Card Title */}
        <div className="border-b border-border pb-4 mb-6">
          <h2 className="text-base font-semibold text-foreground">Take Payment</h2>
        </div>

        {/* Content Grid: Left Form & Right Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-8">
          {/* LEFT COLUMN: Payment For & Payment Method */}
          <div className="lg:col-span-7 space-y-6">
            {/* Group 1: Payment For */}
            <div>
              <label className="block text-[13px] font-semibold text-foreground uppercase tracking-wider mb-2.5">
                Payment For
              </label>
              <div className="space-y-2.5">
                {/* Option 1: Invoice — the customer's real open invoices */}
                <label
                  className={`relative flex items-start p-3.5 rounded-lg border transition-colors cursor-pointer ${
                    paymentTarget === 'invoice'
                      ? 'border-primary/20 bg-primary/5/20'
                      : 'border-border hover:border-border hover:bg-muted/40/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="payment_target"
                    value="invoice"
                    checked={paymentTarget === 'invoice'}
                    onChange={() => { setPaymentTarget('invoice'); setAmountTouched(false); }}
                    className="mt-1 h-4 w-4 text-primary border-border focus:ring-primary"
                  />
                  <div className="ml-3 flex-1">
                    <div className="flex justify-between items-start">
                      <div className="text-sm font-semibold text-foreground">Invoice</div>
                      {invoicesLoaded && openInvoices.length > 0 && (
                        <span className="text-sm font-semibold text-foreground">${totalOutstanding.toFixed(2)} owed</span>
                      )}
                    </div>
                    {!invoicesLoaded && (
                      <div className="text-[13px] text-muted-foreground/70 mt-0.5">Loading open invoices…</div>
                    )}
                    {invoicesLoaded && openInvoices.length === 0 && (
                      <div className="text-[13px] text-muted-foreground/70 mt-0.5">
                        This customer has no open invoices — nothing is owed on invoice.
                      </div>
                    )}
                    {invoicesLoaded && openInvoices.length > 0 && (
                      <>
                        <div className="text-[13px] text-muted-foreground mt-0.5">
                          {openInvoices.length} open invoice{openInvoices.length === 1 ? '' : 's'} — select one to pay
                        </div>
                        {paymentTarget === 'invoice' && (
                          <select
                            value={selectedInvoiceId}
                            onChange={(e) => { setSelectedInvoiceId(e.target.value); setAmountTouched(false); }}
                            className="mt-2 text-[13px] w-full rounded-lg border-border py-1.5 px-2 bg-card"
                          >
                            {openInvoices.map((inv) => (
                              <option key={inv.id} value={inv.id}>
                                {inv.number}
                                {inv.createdAt ? ` (${new Date(inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})` : ''}
                                {` - $${inv.balanceDue.toFixed(2)} due`}
                              </option>
                            ))}
                          </select>
                        )}
                      </>
                    )}
                  </div>
                </label>

                {/* Option 2: Appointment — amount owed is entered here;
                    appointment balances are not itemized on this form. */}
                <label
                  className={`relative flex items-start p-3.5 rounded-lg border transition-colors cursor-pointer ${
                    paymentTarget === 'appointment'
                      ? 'border-primary/20 bg-primary/5/20'
                      : 'border-border hover:border-border hover:bg-muted/40/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="payment_target"
                    value="appointment"
                    checked={paymentTarget === 'appointment'}
                    onChange={() => { setPaymentTarget('appointment'); setAmountTouched(false); }}
                    className="mt-1 h-4 w-4 text-primary border-border focus:ring-primary"
                  />
                  <div className="ml-3 flex-1">
                    <div className="text-sm font-medium text-foreground">Appointment</div>
                    <div className="text-[13px] text-muted-foreground/70 mt-0.5">
                      Record a payment toward an appointment — enter the amount owed.
                    </div>
                    {paymentTarget === 'appointment' && (
                      <div className="mt-2 flex items-center max-w-xs">
                        <span className="text-[13px] text-muted-foreground mr-2">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={appointmentAmount}
                          onChange={(e) => setAppointmentAmount(e.target.value)}
                          className="w-full text-[13px] rounded-lg border-border py-1.5 px-2 text-foreground"
                          placeholder="0.00"
                        />
                      </div>
                    )}
                  </div>
                </label>

                {/* Option 3: Custom Amount */}
                <label
                  className={`relative flex items-start p-3.5 rounded-lg border transition-colors cursor-pointer ${
                    paymentTarget === 'custom'
                      ? 'border-primary/20 bg-primary/5/20'
                      : 'border-border hover:border-border hover:bg-muted/40/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="payment_target"
                    value="custom"
                    checked={paymentTarget === 'custom'}
                    onChange={() => { setPaymentTarget('custom'); setAmountTouched(false); }}
                    className="mt-1 h-4 w-4 text-primary border-border focus:ring-primary"
                  />
                  <div className="ml-3 flex-1">
                    <div className="text-sm font-medium text-foreground">Custom Amount</div>
                    <div className="text-[13px] text-muted-foreground/70 mt-0.5">Enter custom amount</div>
                    {paymentTarget === 'custom' && (
                      <div className="mt-2 flex items-center max-w-xs">
                        <span className="text-[13px] text-muted-foreground mr-2">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={customAmount}
                          onChange={(e) => setCustomAmount(e.target.value)}
                          className="w-full text-[13px] rounded-lg border-border py-1.5 px-2 text-foreground"
                          placeholder="0.00"
                        />
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>

            {/* Group 2: Payment Method */}
            <div>
              <label className="block text-[13px] font-semibold text-foreground uppercase tracking-wider mb-2.5">
                Payment Method
              </label>
              <div className="space-y-2.5">
                {/* Manual tenders — the choices this form actually records.
                    A saved card is never offered as a way to pay here:
                    no processor is wired to charge cards on file. */}
                {MANUAL_TENDERS.map((tender) => (
                  <label
                    key={tender}
                    className={`relative flex items-center justify-between p-3.5 rounded-lg border transition-colors cursor-pointer ${
                      paymentMethod === tender
                        ? 'border-primary/20 bg-primary/5/20'
                        : 'border-border hover:border-border'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <input
                        type="radio"
                        name="payment_method"
                        value={tender}
                        checked={paymentMethod === tender}
                        onChange={() => setPaymentMethod(tender)}
                        className="h-4 w-4 text-primary border-border focus:ring-primary"
                      />
                      <div>
                        <div className="text-[13px] font-semibold text-foreground">{tender}</div>
                        {tender === 'Card (recorded manually)' && (
                          <div className="text-[11px] text-muted-foreground/70">
                            Card payment completed another way — recorded here as a manual tender
                          </div>
                        )}
                      </div>
                    </div>
                  </label>
                ))}

                {/* The customer's real card on file, when the profile has
                    one — display only, it cannot be charged from here. */}
                {cardOnFile && (
                  <div className="p-3.5 rounded-lg border border-border bg-muted/40/50">
                    <div className="text-[13px] font-semibold text-foreground">
                      Card on file: {cardOnFile.brand} •••• {cardOnFile.last4}
                    </div>
                    <div className="text-[11px] text-muted-foreground/70 mt-0.5">
                      Expires {cardOnFile.expires}. Charging a saved card is not available here — choose above how this payment was actually taken.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Order Summary & Balance */}
          <div className="lg:col-span-5 bg-muted/40/70 border border-border rounded-xl p-5">
            <h3 className="text-[13px] font-semibold text-foreground uppercase tracking-wider mb-4">
              Order Summary
            </h3>

            {/* What is owed — real figures only: an invoice's balance due
                is already its final total; entered amounts are taken as
                the amount owed. No tax is invented on top. */}
            <div className="space-y-2.5 text-[13px] pb-4 border-b border-border">
              <div className="flex justify-between text-muted-foreground">
                <span>
                  {paymentTarget === 'invoice'
                    ? (selectedInvoice ? `Invoice ${selectedInvoice.number}` : 'Invoice')
                    : paymentTarget === 'appointment' ? 'Appointment payment' : 'Custom amount'}
                </span>
                <span className="font-medium text-foreground">${amountOwed.toFixed(2)}</span>
              </div>
              {paymentTarget === 'invoice' && selectedInvoice && (
                <div className="flex justify-between text-muted-foreground/70 text-[11px]">
                  <span>Invoice total</span>
                  <span>${selectedInvoice.total.toFixed(2)}</span>
                </div>
              )}
              {paymentTarget === 'invoice' && openInvoices.length > 1 && (
                <div className="flex justify-between text-muted-foreground/70 text-[11px]">
                  <span>Total outstanding (all open invoices)</span>
                  <span>${totalOutstanding.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Total owed */}
            <div className="flex justify-between items-center py-4 border-b border-border">
              <span className="text-sm font-semibold text-foreground">Amount Owed</span>
              <span className="text-base font-semibold text-foreground">${amountOwed.toFixed(2)}</span>
            </div>

            {/* Amount Paid Input Field */}
            <div className="pt-4 pb-3">
              <label className="block text-[13px] font-medium text-muted-foreground mb-1.5" htmlFor="amount-paid">
                Amount Paid
              </label>
              <div className="relative rounded-lg shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <span className="text-muted-foreground/70 sm:text-[13px]">$</span>
                </div>
                <input
                  type="text"
                  id="amount-paid"
                  value={amountPaid}
                  onChange={(e) => { setAmountPaid(e.target.value); setAmountTouched(true); }}
                  className="block w-full rounded-lg border-border pl-7 pr-3 py-1.5 text-[13px] text-right font-medium text-foreground focus:border-primary focus:ring-primary"
                />
              </div>
            </div>

            {/* Balance Due */}
            <div className="flex justify-between items-center text-[13px] pt-1 text-muted-foreground">
              <span className="font-medium">Balance Due</span>
              <span className="font-semibold text-foreground">${balanceDue.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="mt-auto pt-4 border-t border-border flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2 text-[13px] font-medium text-muted-foreground bg-card border border-border rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleProcessPayment}
            disabled={isProcessing}
            className="px-6 py-2 text-[13px] font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 shadow-sm transition-colors cursor-pointer flex items-center gap-2"
          >
            {isProcessing ? 'Processing...' : `Process Payment $${numericPaid.toFixed(2)}`}
          </button>
        </div>
      </section>
    </div>
  );
};

/* =========================================================================
 * 2. NEW APPOINTMENT QUICK ACTION
 * ========================================================================= */
type BookingPet = { id: string; name: string; breed: string; sex: string; weight: string };
type BookingService = { id: string; name: string; price: number; durationMinutes: number; isAddOn: boolean };
type BookingStaff = { id: string; name: string };
type BookingLocation = { id: string; name: string };

const apptTime12h = (t: string): string => {
  const [hRaw, mRaw] = t.split(':');
  const h = parseInt(hRaw || '0', 10);
  if (Number.isNaN(h)) return t;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mRaw || '00'} ${suffix}`;
};

export const QuickActionNewAppointmentView: React.FC<CustomerQuickActionsProps> = ({
  customer,
  onCancel,
  onSuccess,
  onOpenAddPetModal,
}) => {
  // The customer is known and locked. Appointments live in the CRM, so
  // resolve the customer's crm_customers.id (prop when the directory merged
  // it in; otherwise an exact-email match against the CRM customer list).
  const [crmId, setCrmId] = useState<string | null>(customer.crmCustomerId || null);
  const [crmChecked, setCrmChecked] = useState<boolean>(!!customer.crmCustomerId);

  const [pets, setPets] = useState<BookingPet[]>([]);
  const [petsLoaded, setPetsLoaded] = useState(false);
  const [selectedPetId, setSelectedPetId] = useState('');

  const [services, setServices] = useState<BookingService[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [durationMin, setDurationMin] = useState(60);
  const [price, setPrice] = useState('');
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('10:00');
  const [staff, setStaff] = useState<BookingStaff[]>([]);
  const [groomerId, setGroomerId] = useState('');
  const [locations, setLocations] = useState<BookingLocation[]>([]);
  const [locationId, setLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (crmId) {
      setCrmChecked(true);
      return;
    }
    const email = (customer.email || '').trim();
    if (!email) {
      setCrmChecked(true);
      return;
    }
    let cancelled = false;
    fetch(`/api/admin/crm/customers?search=${encodeURIComponent(email)}&limit=10`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const rows: any[] = j?.data || j?.customers || [];
        const match = rows.find((r) => String(r.email || '').toLowerCase() === email.toLowerCase());
        if (match) setCrmId(String(match.id));
        setCrmChecked(true);
      })
      .catch(() => {
        if (!cancelled) setCrmChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [crmId, customer.email]);

  useEffect(() => {
    if (!crmId) return;
    let cancelled = false;
    // The customer's real pets.
    fetch(`/api/admin/crm/pets?primary_customer_id=${crmId}&limit=100`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const rows: any[] = j?.data || j?.pets || [];
        const mapped = rows.map((p) => ({
          id: String(p.id),
          name: p.name || 'Pet',
          breed: p.breed || '',
          sex: p.sex || '',
          weight: p.weight ? `${p.weight} lbs` : '',
        }));
        setPets(mapped);
        setSelectedPetId(mapped[0]?.id || '');
        setPetsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setPetsLoaded(true);
      });
    // Real services (main services + add-ons).
    fetch('/api/admin/crm/services?limit=200')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const rows: any[] = j?.services || [];
        const mapped = rows.map((s) => ({
          id: String(s.id),
          name: s.name || 'Service',
          price: Number(s.defaultPrice || 0),
          durationMinutes: Number(s.defaultDurationMinutes || 60),
          isAddOn: !!s.isAddOn,
        }));
        setServices(mapped);
        const firstMain = mapped.find((s) => !s.isAddOn);
        if (firstMain) {
          setServiceId(firstMain.id);
          setPrice(firstMain.price ? firstMain.price.toFixed(2) : '');
          setDurationMin(firstMain.durationMinutes);
        }
      })
      .catch(() => {});
    // Real staff for the groomer picker.
    fetch('/api/admin/crm/staff?limit=200')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const rows: any[] = j?.staff || [];
        setStaff(rows.map((s) => ({ id: String(s.id), name: s.displayName || 'Staff' })));
      })
      .catch(() => {});
    // Real locations (the picker hides itself if locations can't load).
    fetch('/api/admin/crm/locations')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const rows: any[] = (j?.locations || []).filter((l: any) => l.is_active !== false);
        const mapped = rows.map((l) => ({ id: String(l.id), name: l.name || 'Location' }));
        setLocations(mapped);
        if (mapped.length > 0) setLocationId(mapped[0].id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [crmId]);

  const mainServices = services.filter((s) => !s.isAddOn);
  const addonServices = services.filter((s) => s.isAddOn);
  const selectedService = services.find((s) => s.id === serviceId) || null;
  const addonsTotal = addonServices
    .filter((a) => selectedAddons.includes(a.id))
    .reduce((sum, a) => sum + a.price, 0);
  const totalPrice = (parseFloat(price) || 0) + addonsTotal;

  const handleServiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const svc = services.find((s) => s.id === e.target.value);
    setServiceId(e.target.value);
    if (svc) {
      setPrice(svc.price ? svc.price.toFixed(2) : '');
      setDurationMin(svc.durationMinutes);
    }
  };

  const handleToggleAddon = (addonId: string) => {
    setSelectedAddons((prev) =>
      prev.includes(addonId) ? prev.filter((a) => a !== addonId) : [...prev, addonId],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!crmId) {
      setSubmitError("This customer doesn't have a CRM record, so an appointment can't be booked for them yet.");
      return;
    }
    const pet = pets.find((p) => p.id === selectedPetId) || null;
    if (!pet) {
      setSubmitError('Pick the pet this appointment is for.');
      return;
    }
    if (!selectedService) {
      setSubmitError('Pick a service.');
      return;
    }
    const starts = new Date(`${date}T${time}`);
    if (Number.isNaN(starts.getTime())) {
      setSubmitError('Pick a valid date and time.');
      return;
    }
    const ends = new Date(starts.getTime() + Math.max(15, durationMin || 60) * 60000);
    const chosenAddons = addonServices.filter((a) => selectedAddons.includes(a.id));
    setSubmitting(true);
    try {
      // Real write: POST /api/admin/crm/appointments inserts the
      // crm_appointments row with the real customer / groomer / location
      // IDs, plus crm_appointment_pets / crm_appointment_services join
      // rows from dependent_id / service_id / addon_service_ids (the joins are
      // what list views read pet/service names from). internal_notes
      // keeps a human-readable summary as well.
      const res = await fetch('/api/admin/crm/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: crmId,
          dependent_id: pet.id,
          service_id: selectedService.id,
          addon_service_ids: selectedAddons.length ? selectedAddons : undefined,
          location_id: locationId || undefined,
          assigned_groomer_id: groomerId || undefined,
          starts_at: starts.toISOString(),
          ends_at: ends.toISOString(),
          status: 'scheduled',
          subtotal: totalPrice,
          total: totalPrice,
          currency: 'USD',
          source_channel: 'admin_quick_action',
          customer_notes: notes.trim() || undefined,
          internal_notes:
            `Booked from customer profile — Pet: ${pet.name}; Service: ${selectedService.name}` +
            (chosenAddons.length ? `; Add-ons: ${chosenAddons.map((a) => a.name).join(', ')}` : ''),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.data?.id) {
        setSubmitError(j.error || 'Appointment could not be booked. Please try again.');
        return;
      }
      const dateLabel = starts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      onSuccess(`Appointment booked for ${pet.name} on ${dateLabel} at ${apptTime12h(time)} (${selectedService.name}).`, {
        type: 'appointment',
        appointmentId: j.data.id,
        pet: pet.name,
        service: selectedService.name,
        date,
        time,
      });
    } catch {
      setSubmitError('Appointment could not be booked — network error.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto px-6 sm:px-8 py-6 max-w-5xl mx-auto w-full">
      {/* Top Breadcrumbs and Customer Info Banner */}
      <header className="mb-6">
        <nav className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground/70 mb-2">
          <button onClick={onCancel} className="hover:text-muted-foreground transition-colors cursor-pointer">
            Customers
          </button>
          <span>›</span>
          <button onClick={onCancel} className="text-muted-foreground hover:text-primary font-medium transition-colors cursor-pointer">
            {customer.name}
          </button>
          <span>›</span>
          <span className="text-primary font-semibold">New Appointment</span>
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{customer.name}</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[13px] font-medium bg-success/10 text-success border border-success/20/60">
              Active Customer
            </span>
          </div>

          <div className="flex items-center gap-6 text-[13px] text-muted-foreground font-normal">
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span>{customer.phone}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-muted-foreground/70" />
              <span>{customer.email}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Appointment Form Container */}
      <div className="bg-card border border-border/90 rounded-2xl shadow-sm overflow-hidden p-6 sm:p-7">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-foreground">New Appointment</h2>
        </div>

        {!crmChecked ? (
          <p className="text-[13px] text-muted-foreground">Loading this customer&apos;s record…</p>
        ) : !crmId ? (
          <div className="rounded-xl border border-border bg-muted/40 p-5">
            <h3 className="text-sm font-semibold text-foreground">Booking isn&apos;t available for this customer yet</h3>
            <p className="text-[13px] text-muted-foreground mt-1 max-w-xl">
              {customer.name} doesn&apos;t have a CRM record, and appointments are stored against the CRM record —
              so a booking can&apos;t be created from here until one exists.
            </p>
            <button
              type="button"
              onClick={onCancel}
              className="mt-4 px-5 py-2.5 text-[13px] font-medium text-foreground bg-card hover:bg-muted/40 border border-border rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              Back to Customer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* STEP 1: Select Pet — the customer's real pets */}
            <div className="space-y-3">
              <label className="block text-[13px] font-semibold uppercase tracking-wider text-foreground">
                1. Select Pet
              </label>
              {!petsLoaded ? (
                <p className="text-[13px] text-muted-foreground">Loading pets…</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  {pets.map((pet) => (
                    <div
                      key={pet.id}
                      onClick={() => setSelectedPetId(pet.id)}
                      className={`relative rounded-xl p-3.5 flex items-center gap-3.5 cursor-pointer transition-all ${
                        selectedPetId === pet.id
                          ? 'border-2 border-primary bg-primary/5/20 shadow-xs ring-2 ring-brand-teal/10'
                          : 'border border-border bg-card hover:border-border hover:bg-muted/40/40'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-lg border border-primary/20 bg-muted/40 shrink-0 flex items-center justify-center">
                        <PawPrint className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-foreground leading-tight">{pet.name}</h3>
                        {(pet.breed || pet.sex) && (
                          <p className="text-[13px] text-muted-foreground truncate mt-0.5">
                            {[pet.breed, pet.sex].filter(Boolean).join(' • ')}
                          </p>
                        )}
                        {pet.weight && <p className="text-[13px] text-muted-foreground/70">{pet.weight}</p>}
                      </div>
                      {selectedPetId === pet.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                    </div>
                  ))}

                  {/* Add New Pet Card */}
                  <div
                    onClick={onOpenAddPetModal}
                    className="border-2 border-dashed border-border hover:border-primary/30 hover:bg-primary/5/20 rounded-xl p-3.5 flex flex-col items-center justify-center cursor-pointer text-primary transition-all min-h-[96px]"
                  >
                    <Plus className="w-5 h-5 mb-1 stroke-2" />
                    <span className="text-[13px] font-medium">Add New Pet</span>
                  </div>
                </div>
              )}
              {petsLoaded && pets.length === 0 && (
                <p className="text-[13px] text-muted-foreground">
                  No pets on file for {customer.name} yet — add a pet before booking.
                </p>
              )}
            </div>

            {/* STEP 2: Select Service — real crm_services */}
            <div className="space-y-3">
              <label className="block text-[13px] font-semibold uppercase tracking-wider text-foreground">
                2. Select Service
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                <div className="sm:col-span-6">
                  <label className="block text-[13px] text-muted-foreground mb-1" htmlFor="service-select">
                    Service
                  </label>
                  <select
                    id="service-select"
                    value={serviceId}
                    onChange={handleServiceChange}
                    className="w-full text-[13px] rounded-lg border-border py-2.5 pl-3 pr-8 focus:border-primary focus:ring-1 focus:ring-primary bg-card font-medium text-foreground"
                  >
                    {mainServices.length === 0 && <option value="">No active services found</option>}
                    {mainServices.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — ${s.price.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[13px] text-muted-foreground mb-1" htmlFor="duration-select">
                    Duration
                  </label>
                  <select
                    id="duration-select"
                    value={durationMin}
                    onChange={(e) => setDurationMin(parseInt(e.target.value, 10))}
                    className="w-full text-[13px] rounded-lg border-border py-2.5 pl-3 pr-8 focus:border-primary focus:ring-1 focus:ring-primary bg-card font-medium text-foreground"
                  >
                    {[30, 60, 90, 120, 150, 180, 210, 240].map((mins) => (
                      <option key={mins} value={mins}>
                        {mins % 60 === 0 ? `${mins / 60}.0 hr` : `${Math.floor(mins / 60)}.${mins % 60 === 30 ? '5' : '0'} hrs`} ({mins} min)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[13px] text-muted-foreground mb-1" htmlFor="price-input">
                    Price
                  </label>
                  <input
                    id="price-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full text-[13px] rounded-lg border-border py-2.5 px-3 focus:border-primary focus:ring-1 focus:ring-primary bg-card font-medium text-foreground"
                  />
                </div>
              </div>

              {/* Add-ons — real add-on services from crm_services */}
              {addonServices.length > 0 && (
                <div className="pt-1">
                  <p className="text-[13px] font-medium text-foreground mb-2">Add-ons / Extras</p>
                  <div className="p-3 bg-muted/40 rounded-xl border border-border flex flex-wrap gap-2 text-[13px]">
                    {addonServices.map((addon) => {
                      const isSelected = selectedAddons.includes(addon.id);
                      return (
                        <button
                          key={addon.id}
                          type="button"
                          onClick={() => handleToggleAddon(addon.id)}
                          className={`px-3 py-1.5 rounded-lg border text-[13px] font-medium transition cursor-pointer ${
                            isSelected
                              ? 'bg-primary text-white border-primary shadow-2xs'
                              : 'bg-card text-foreground border-border hover:border-border'
                          }`}
                        >
                          {addon.name} <span className="opacity-80">(+${addon.price.toFixed(2)})</span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedAddons.length > 0 && (
                    <p className="text-[13px] text-muted-foreground mt-2">
                      Add-ons: +${addonsTotal.toFixed(2)} — Total ${totalPrice.toFixed(2)}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* STEP 3: Date & Time */}
            <div className="space-y-3">
              <label className="block text-[13px] font-semibold uppercase tracking-wider text-foreground">
                3. Date &amp; Time
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-4">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full text-[13px] rounded-lg border-border py-2.5 px-3 focus:border-primary focus:ring-1 focus:ring-primary text-foreground font-medium bg-card"
                  />
                </div>

                <div className="sm:col-span-4">
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    required
                    className="w-full text-[13px] rounded-lg border-border py-2.5 px-3 focus:border-primary focus:ring-1 focus:ring-primary text-foreground font-medium bg-card"
                  />
                </div>

                <div className="sm:col-span-4">
                  <select
                    value={groomerId}
                    onChange={(e) => setGroomerId(e.target.value)}
                    className="w-full text-[13px] rounded-lg border-border py-2.5 pl-3 pr-8 focus:border-primary focus:ring-1 focus:ring-primary bg-card font-medium text-foreground"
                  >
                    <option value="">Any Available</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* STEP 4: Appointment Details */}
            <div className="space-y-3">
              <label className="block text-[13px] font-semibold uppercase tracking-wider text-foreground">
                4. Appointment Details
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                {locations.length > 0 && (
                  <div className="sm:col-span-4">
                    <label className="block text-[13px] text-muted-foreground mb-1" htmlFor="location-select">
                      Location
                    </label>
                    <select
                      id="location-select"
                      value={locationId}
                      onChange={(e) => setLocationId(e.target.value)}
                      className="w-full text-[13px] rounded-lg border-border py-2.5 pl-3 pr-8 focus:border-primary focus:ring-1 focus:ring-primary bg-card font-medium text-foreground"
                    >
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={locations.length > 0 ? 'sm:col-span-8' : 'sm:col-span-12'}>
                  <label className="block text-[13px] text-muted-foreground mb-1" htmlFor="appointment-notes">
                    Notes (optional)
                  </label>
                  <textarea
                    id="appointment-notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any notes about this appointment..."
                    className="w-full text-[13px] rounded-lg border-border p-2.5 focus:border-primary focus:ring-1 focus:ring-primary text-foreground placeholder-neutral-400 bg-card"
                  ></textarea>
                </div>
              </div>
            </div>

            {submitError && (
              <p className="text-[13px] font-medium text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2.5">
                {submitError}
              </p>
            )}

            {/* Form Actions */}
            <div className="pt-4 flex items-center justify-end gap-3 border-t border-border">
              <button
                type="button"
                onClick={onCancel}
                className="px-5 py-2.5 text-[13px] font-medium text-foreground bg-card hover:bg-muted/40 border border-border rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 text-[13px] font-medium text-white bg-primary hover:bg-primary/90 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Booking…' : 'Book Appointment'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
/* =========================================================================
 * 3. ADD PET QUICK ACTION
 * ========================================================================= */
export const QuickActionAddPetView: React.FC<CustomerQuickActionsProps> = ({
  customer,
  onCancel,
  onSuccess,
  onOpenManageVaccines,
}) => {
  const crmId = useResolvedCrmId(customer);
  // All fields start EMPTY — the old form shipped prefilled with an
  // invented pet ("Max", a fake microchip number, written-up behavior
  // notes), so a rushed save would have recorded fiction as fact.
  const [petName, setPetName] = useState('');
  const [species, setSpecies] = useState('Dog');
  const [breed, setBreed] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female'>('Male');
  const [dob, setDob] = useState('');
  const [color, setColor] = useState('');
  const [microchip, setMicrochip] = useState('');

  const [allergies, setAllergies] = useState('');
  const [medicalConditions, setMedicalConditions] = useState('');
  const [medications, setMedications] = useState('');
  const [behaviorNotes, setBehaviorNotes] = useState('');
  const [vaccineStatus, setVaccineStatus] = useState<'Up to date' | 'Expiring Soon' | 'Expired'>('Up to date');
  const [preferredService, setPreferredService] = useState('Full Groom');
  const [preferredGroomer, setPreferredGroomer] = useState('No Preference');
  const [generalNotes, setGeneralNotes] = useState('');

  const handleSavePet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!petName.trim()) {
      alert('Please enter a pet name');
      return;
    }
    if (!crmId) {
      alert('This profile is not linked to a CRM customer record, so the pet cannot be saved.');
      return;
    }

    // Real write: POST crm add_pet inserts the crm_pets row for this
    // customer. The detail object below is only built (and success only
    // reported) after the server confirms the insert and returns the id.
    const dobIso = (() => {
      const m = dob.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) return `${m[3]}-${m[1]}-${m[2]}`;
      return /^\d{4}-\d{2}-\d{2}$/.test(dob.trim()) ? dob.trim() : undefined;
    })();
    let petId = '';
    try {
      const res = await fetch('/api/admin/crm/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'crm_add_pet',
          // crm_pets.primary_customer_id + the crm_party_dependents link key
          // on the CRM customer id — the shop profile id FK-fails.
          customer_id: crmId,
          name: petName.trim(),
          species,
          breed: breed || undefined,
          sex: gender.toLowerCase(),
          date_of_birth: dobIso,
          color: color || undefined,
          microchip_number: microchip || undefined,
          medical_notes: medicalConditions || undefined,
          medical_alert: medicalConditions ? true : undefined,
          behavioral_notes: behaviorNotes || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        alert(j.error || 'Pet could not be saved. Please try again.');
        return;
      }
      petId = j.petId || '';
    } catch {
      alert('Pet could not be saved — network error.');
      return;
    }

    // Age is computed from the entered DOB only; weight was never asked
    // for on this form, so it stays empty rather than invented.
    const ageLabel = (() => {
      if (!dobIso) return '';
      const born = new Date(`${dobIso}T00:00:00`);
      if (Number.isNaN(born.getTime())) return '';
      const years = Math.floor((Date.now() - born.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      return years >= 1 ? `${years} yrs` : '< 1 yr';
    })();

    const newPetDetail: CustomerPetDetail = {
      id: petId,
      name: petName,
      breed,
      gender,
      age: ageLabel,
      birthDate: dob,
      weight: '',
      imageUrl:
        species === 'Dog'
          ? 'https://images.unsplash.com/photo-1537151625747-768eb6cf92b2?auto=format&fit=crop&w=300&q=80'
          : 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=300&q=80',
      vaccinationsStatus: vaccineStatus,
      lastGroomDate: 'None',
      nextApptDate: 'None',
      nextApptType: preferredService,
      medicalAlert: medicalConditions || undefined,
    };

    onSuccess(`Successfully added ${petName} (${breed}) to ${customer.name}'s household!`, {
      type: 'add_pet',
      pet: newPetDetail,
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto px-6 sm:px-8 py-6 max-w-6xl mx-auto w-full">
      {/* Breadcrumb & Header */}
      <header className="space-y-1 mb-5">
        <nav className="flex items-center text-[13px] text-muted-foreground font-medium space-x-1.5 mb-1">
          <button onClick={onCancel} className="hover:text-foreground cursor-pointer">
            Customers
          </button>
          <span>›</span>
          <button onClick={onCancel} className="text-foreground hover:text-primary font-medium cursor-pointer">
            {customer.name}
          </button>
          <span>›</span>
          <span className="text-primary font-semibold">Add Pet</span>
        </nav>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground tracking-tight">{customer.name}</h1>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[13px] font-medium bg-success/10 text-success border border-success/20/60">
            Active Customer
          </span>
        </div>

        <div className="flex items-center gap-4 text-[13px] text-muted-foreground pt-0.5">
          <span className="flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-muted-foreground/70 stroke-2" />
            {customer.phone}
          </span>
          <span className="flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-muted-foreground/70 stroke-2" />
            {customer.email}
          </span>
        </div>
      </header>

      {/* Add Pet Form Card */}
      <section className="bg-card rounded-xl border border-border/90 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Add Pet</h2>
        </div>

        <form onSubmit={handleSavePet} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* LEFT COLUMN: Pet Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground tracking-tight">Pet Information</h3>

              {/* Photo Upload Field */}
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5">Photo</label>
                <div className="border-2 border-dashed border-border hover:border-primary/20 rounded-lg p-5 flex flex-col items-center justify-center bg-muted/40/40 cursor-pointer transition">
                  <span className="text-[13px] font-medium text-primary hover:underline">Upload Photo</span>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">JPG, PNG up to 5MB</p>
                </div>
              </div>

              {/* Pet Name */}
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1" htmlFor="pet-name">
                  Pet Name <span className="text-destructive">*</span>
                </label>
                <input
                  id="pet-name"
                  type="text"
                  value={petName}
                  onChange={(e) => setPetName(e.target.value)}
                  className="w-full text-[13px] rounded-lg border-border shadow-sm focus:border-primary focus:ring-primary py-2 px-3 text-foreground"
                  required
                />
              </div>

              {/* Species */}
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1" htmlFor="species">
                  Species <span className="text-destructive">*</span>
                </label>
                <select
                  id="species"
                  value={species}
                  onChange={(e) => setSpecies(e.target.value)}
                  className="w-full text-[13px] rounded-lg border-border shadow-sm focus:border-primary focus:ring-primary py-2 px-3 text-foreground bg-card"
                >
                  <option>Dog</option>
                  <option>Cat</option>
                  <option>Other</option>
                </select>
              </div>

              {/* Breed */}
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1" htmlFor="breed">
                  Breed <span className="text-destructive">*</span>
                </label>
                <input
                  id="breed"
                  type="text"
                  value={breed}
                  onChange={(e) => setBreed(e.target.value)}
                  className="w-full text-[13px] rounded-lg border-border shadow-sm focus:border-primary focus:ring-primary py-2 px-3 text-foreground"
                  required
                />
              </div>

              {/* Gender */}
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1" htmlFor="gender">
                  Gender <span className="text-destructive">*</span>
                </label>
                <select
                  id="gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'Male' | 'Female')}
                  className="w-full text-[13px] rounded-lg border-border shadow-sm focus:border-primary focus:ring-primary py-2 px-3 text-foreground bg-card"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              {/* Date of Birth */}
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1" htmlFor="dob">
                  Date of Birth <span className="text-destructive">*</span>
                </label>
                <div className="relative rounded-lg shadow-sm">
                  <input
                    id="dob"
                    type="text"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full text-[13px] rounded-lg border-border pr-9 focus:border-primary focus:ring-primary py-2 px-3 text-foreground"
                  />
                  <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-muted-foreground/70">
                    <Calendar className="w-4 h-4 stroke-2" />
                  </div>
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1" htmlFor="color">
                  Color
                </label>
                <input
                  id="color"
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full text-[13px] rounded-lg border-border shadow-sm focus:border-primary focus:ring-primary py-2 px-3 text-foreground"
                />
              </div>

              {/* Microchip Number */}
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1" htmlFor="microchip">
                  Microchip Number
                </label>
                <input
                  id="microchip"
                  type="text"
                  value={microchip}
                  onChange={(e) => setMicrochip(e.target.value)}
                  className="w-full text-[13px] rounded-lg border-border shadow-sm focus:border-primary focus:ring-primary py-2 px-3 text-foreground"
                />
              </div>
            </div>

            {/* RIGHT COLUMN: Health & Safety */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground tracking-tight">Health &amp; Safety</h3>

              {/* Allergies */}
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1" htmlFor="allergies">
                  Allergies
                </label>
                <input
                  id="allergies"
                  type="text"
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  className="w-full text-[13px] rounded-lg border-border shadow-sm focus:border-primary focus:ring-primary py-2 px-3 text-foreground"
                />
              </div>

              {/* Medical Conditions */}
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1" htmlFor="medical-conditions">
                  Medical Conditions
                </label>
                <input
                  id="medical-conditions"
                  type="text"
                  value={medicalConditions}
                  onChange={(e) => setMedicalConditions(e.target.value)}
                  className="w-full text-[13px] rounded-lg border-border shadow-sm focus:border-primary focus:ring-primary py-2 px-3 text-foreground"
                />
              </div>

              {/* Medications */}
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1" htmlFor="medications">
                  Medications
                </label>
                <input
                  id="medications"
                  type="text"
                  value={medications}
                  onChange={(e) => setMedications(e.target.value)}
                  className="w-full text-[13px] rounded-lg border-border shadow-sm focus:border-primary focus:ring-primary py-2 px-3 text-foreground"
                />
              </div>

              {/* Behavior Notes */}
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1" htmlFor="behavior-notes">
                  Behavior Notes
                </label>
                <textarea
                  id="behavior-notes"
                  rows={2}
                  value={behaviorNotes}
                  onChange={(e) => setBehaviorNotes(e.target.value)}
                  className="w-full text-[13px] rounded-lg border-border shadow-sm focus:border-primary focus:ring-primary py-2 px-3 text-foreground"
                />
              </div>

              {/* Vaccination Status */}
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1">Vaccination Status</label>
                <div className="flex items-center justify-between gap-3">
                  <select
                    value={vaccineStatus}
                    onChange={(e) => setVaccineStatus(e.target.value as 'Up to date' | 'Expiring Soon' | 'Expired')}
                    className="flex-1 text-[13px] rounded-lg border-border bg-card py-1.5 px-3 font-medium text-success"
                  >
                    <option value="Up to date">Up to date</option>
                    <option value="Expiring Soon">Expiring Soon</option>
                    <option value="Expired">Expired</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (customer.pets[0] && onOpenManageVaccines) {
                        onOpenManageVaccines(customer.pets[0]);
                      }
                    }}
                    className="text-[13px] font-medium text-primary hover:text-primary hover:underline whitespace-nowrap cursor-pointer"
                  >
                    Manage Vaccines
                  </button>
                </div>
              </div>

              {/* Sub-section: Preferences */}
              <div className="pt-2">
                <h4 className="text-[13px] font-semibold text-foreground tracking-tight mb-2">Preferences</h4>

                <div className="mb-3">
                  <label className="block text-[13px] font-medium text-foreground mb-1" htmlFor="preferred-services">
                    Preferred Services
                  </label>
                  <select
                    id="preferred-services"
                    value={preferredService}
                    onChange={(e) => setPreferredService(e.target.value)}
                    className="w-full text-[13px] rounded-lg border-border shadow-sm focus:border-primary focus:ring-primary py-2 px-3 text-foreground bg-card"
                  >
                    <option>Full Groom</option>
                    <option>Bath &amp; Brush</option>
                    <option>Puppy Trim</option>
                  </select>
                </div>

                <div className="mb-3">
                  <label className="block text-[13px] font-medium text-foreground mb-1" htmlFor="preferred-groomer">
                    Preferred Groomer
                  </label>
                  <select
                    id="preferred-groomer"
                    value={preferredGroomer}
                    onChange={(e) => setPreferredGroomer(e.target.value)}
                    className="w-full text-[13px] rounded-lg border-border shadow-sm focus:border-primary focus:ring-primary py-2 px-3 text-foreground bg-card"
                  >
                    <option>No Preference</option>
                    <option>Sarah M.</option>
                    <option>Jessica T.</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-1" htmlFor="general-notes">
                    Notes
                  </label>
                  <input
                    id="general-notes"
                    type="text"
                    value={generalNotes}
                    onChange={(e) => setGeneralNotes(e.target.value)}
                    className="w-full text-[13px] rounded-lg border-border shadow-sm focus:border-primary focus:ring-primary py-2 px-3 text-foreground"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="mt-8 pt-4 border-t border-border flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-[13px] font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted/40 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-[13px] font-medium text-white bg-primary rounded-lg hover:bg-primary/90 shadow-sm transition cursor-pointer"
            >
              Save Pet
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

/* =========================================================================
 * 4. SEND MESSAGE QUICK ACTION
 * ========================================================================= */
export const QuickActionSendMessageView: React.FC<CustomerQuickActionsProps> = ({
  customer,
  onCancel,
  onSuccess,
}) => {
  const [channel, setChannel] = useState<'SMS' | 'Email'>('Email');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Templates come from the real endpoint — GET
  // /api/admin/crm/message_templates returns the tenant's
  // crm_message_templates rows, or the platform's code templates when the
  // table is empty. Bodies use {customerName} / {petName} / {date} /
  // {time} placeholders, substituted from THIS customer's real record.
  // (The old selector invented four template names with locally written
  // bodies that existed nowhere else in the system.)
  const firstName = customer.name?.split(' ')[0] || 'there';
  const petName = (customer.pets?.[0] as any)?.name || 'your pet';
  const [templates, setTemplates] = useState<{ id: string; name: string; channel: string; body: string }[]>([]);
  const [message, setMessage] = useState('');
  const [template, setTemplate] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/crm/message_templates', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => {
        if (cancelled) return;
        const rows = Array.isArray(d.templates) ? d.templates : [];
        setTemplates(rows);
        if (rows.length > 0) {
          setTemplate(String(rows[0].id));
          setMessage(substituteTemplate(rows[0].body));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const substituteTemplate = (body: string) =>
    String(body || '')
      .replaceAll('{customerName}', firstName)
      .replaceAll('{petName}', petName)
      .replaceAll('{date}', '')
      .replaceAll('{time}', '');

  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setTemplate(id);
    const tpl = templates.find((t) => String(t.id) === id);
    if (tpl) setMessage(substituteTemplate(tpl.body));
  };

  // Real send via POST /api/admin/crm/customers/[id]/communications.
  // Email goes out through the Resend pipeline (sendEmail); SMS through
  // the platform's Twilio provider (BL-10, lib/messaging/sms). Both land
  // in the customer's communication history; the API answers with the
  // real reason when a channel isn't configured.
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/admin/crm/customers/${customer.id}/communications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: channel.toLowerCase(),
          body: message,
          crm_id: customer.crmCustomerId || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setSendError(j.error || 'Message could not be sent.');
        return;
      }
      onSuccess(channel === 'SMS'
        ? `Text sent to ${customer.name} (${customer.phone}).`
        : `Email sent to ${customer.name} (${customer.email}).`);
    } catch {
      setSendError('Message could not be sent. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 md:p-8 lg:p-10 max-w-7xl mx-auto w-full">
      {/* Header */}
      <header className="mb-6">
        <nav className="flex items-center space-x-2 text-[13px] font-medium text-muted-foreground mb-2">
          <button onClick={onCancel} className="hover:text-foreground cursor-pointer">
            Customers
          </button>
          <span>›</span>
          <button onClick={onCancel} className="text-foreground hover:text-primary font-medium cursor-pointer">
            {customer.name}
          </button>
          <span>›</span>
          <span className="text-primary font-semibold">Send Message</span>
        </nav>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">{customer.name}</h1>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[13px] font-medium bg-success/10 text-success border border-success/20">
            Active Customer
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-5 mt-2 text-[13px] text-muted-foreground font-normal">
          <div className="flex items-center space-x-1.5">
            <Phone className="w-3.5 h-3.5 text-muted-foreground/70" />
            <span>{customer.phone}</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <Mail className="w-3.5 h-3.5 text-muted-foreground/70" />
            <span>{customer.email}</span>
          </div>
        </div>
      </header>

      {/* Send Message Card */}
      <section className="bg-card rounded-xl border border-border shadow-sm flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Send Message</h2>
        </div>

        <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
          {/* LEFT COLUMN: Recipient Selection */}
          <div className="lg:col-span-4 flex flex-col space-y-4">
            <label className="block text-[13px] font-semibold text-foreground tracking-wide uppercase">
              To
            </label>
            <div className="space-y-3">
              {/* The endpoint sends to the customer's address on file —
                  there are no per-pet or alternate recipients. */}
              <div className="relative flex items-start p-3.5 rounded-lg border border-border bg-muted/40/50">
                <div className="ml-1 text-sm leading-5">
                  <div className="font-medium text-foreground">{customer.name}</div>
                  <div className="text-[13px] text-muted-foreground mt-0.5">
                    {channel === 'Email' ? customer.email : customer.phone}
                  </div>
                </div>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                {channel === 'Email'
                  ? 'Sent by email to the address on file, and recorded in this customer\'s communication history.'
                  : 'Sent by text to the number on file, and recorded in this customer\'s communication history.'}
              </p>
            </div>
          </div>

          {/* RIGHT COLUMN: Message Composition */}
          <div className="lg:col-span-8 flex flex-col space-y-5">
            {/* Channel Selection */}
            <div>
              <label className="block text-[13px] font-semibold text-foreground tracking-wide uppercase mb-3">
                Message
              </label>
              <div className="inline-flex p-1 bg-muted/40 rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setChannel('SMS')}
                  className={`px-5 py-1.5 text-[13px] font-semibold rounded-lg transition cursor-pointer ${
                    channel === 'SMS'
                      ? 'bg-card text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  SMS
                </button>
                <button
                  type="button"
                  onClick={() => setChannel('Email')}
                  className={`px-5 py-1.5 text-[13px] font-medium rounded-lg transition cursor-pointer ${
                    channel === 'Email'
                      ? 'bg-card text-primary shadow-sm font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Email
                </button>
              </div>
              {channel === 'SMS' && (
                <p className="mt-3 max-w-md text-[12px] text-muted-foreground bg-muted/40 border border-border rounded-lg px-3 py-2">
                  Texts send through the platform&apos;s Twilio provider; if it isn&apos;t configured, the send refuses with the reason instead of pretending.
                </p>
              )}
            </div>

            {/* Textarea */}
            <div className="relative flex-1 flex flex-col min-h-[190px]">
              <textarea
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full h-full p-4 text-sm text-foreground bg-card border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition resize-none leading-relaxed"
              ></textarea>
              <div className="absolute bottom-3 right-3.5 flex items-center space-x-1.5 text-muted-foreground/70 pointer-events-none select-none">
                <PawPrint className="w-4 h-4 stroke-[1.75]" />
                <span className="text-[13px] font-medium text-muted-foreground/70 tracking-tight">
                  {message.length}
                </span>
              </div>
            </div>

            {/* Templates Selector */}
            <div>
              <label className="block text-[13px] font-medium text-muted-foreground mb-1.5">Templates</label>
              <div className="relative max-w-sm">
                <select
                  value={template}
                  onChange={handleTemplateChange}
                  className="w-full text-[13px] font-normal text-foreground bg-card border border-border rounded-lg py-2.5 pl-3 pr-10 focus:ring-1 focus:ring-primary focus:border-primary transition"
                >
                  {templates.length === 0 && <option value="">No templates configured</option>}
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons Footer */}
        {sendError && (
          <div className="px-6 py-3 bg-destructive/10 border-t border-destructive/20 text-destructive text-[13px] font-medium">
            {sendError}
          </div>
        )}
        <footer className="px-6 py-4 bg-card border-t border-border flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2 text-[13px] font-medium text-foreground bg-card border border-border hover:bg-muted/40 hover:text-foreground rounded-lg shadow-sm transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSendMessage}
            disabled={sending || !message.trim()}
            className="px-6 py-2 text-[13px] font-semibold text-white bg-primary hover:bg-primary/90 active:bg-primary rounded-lg shadow-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending…' : 'Send Message'}
          </button>
        </footer>
      </section>
    </div>
  );
};

/* =========================================================================
 * 5. UPDATE DOCUMENTS QUICK ACTION
 * ========================================================================= */
type RealDocument = {
  id: string;
  name: string;
  status: string;
  storagePath: string | null;
  uploadedAt: string | null;
  expiresAt: string | null;
};

const docBadgeClass = (status: string): string => {
  const s = status.toLowerCase();
  if (s === 'signed' || s === 'approved') return 'bg-success/10 text-success border border-success/20/70';
  if (s === 'pending' || s === 'submitted') return 'bg-warning/10 text-warning border border-warning/30';
  if (s === 'expired' || s === 'rejected') return 'bg-destructive/10 text-destructive border border-destructive/20';
  return 'bg-muted text-muted-foreground border border-border';
};

const docStatusLabel = (status: string): string =>
  status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ') : '—';

const docDateLabel = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso).slice(0, 10) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Upload policy — mirrors POST /api/admin/crm/documents (10 MB max;
// PDF / image / Word / Excel / text). The server re-validates everything.
const DOC_ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv';
const DOC_MAX_BYTES = 10 * 1024 * 1024;
const docFileOk = (f: File): boolean => {
  const t = (f.type || '').toLowerCase();
  if (
    t === 'application/pdf' ||
    t === 'application/msword' ||
    t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    t === 'application/vnd.ms-excel' ||
    t === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    t === 'text/plain' ||
    t === 'text/csv' ||
    /^image\/(png|jpe?g|gif|webp)$/.test(t)
  ) {
    return true;
  }
  if (!t || t === 'application/octet-stream') return /\.(pdf|png|jpe?g|gif|webp|docx?|xlsx?|txt|csv)$/i.test(f.name);
  return false;
};
const docFileSizeLabel = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export const QuickActionUpdateDocumentsView: React.FC<CustomerQuickActionsProps> = ({
  customer,
  onCancel,
}) => {
  const [docSubTab, setDocSubTab] = useState<'existing' | 'upload'>('existing');

  // Documents live in the CRM (crm_documents), keyed by crm_customers.id.
  // Resolve it from the prop when the directory merged it in; otherwise
  // fall back to an exact-email match against the CRM customer list.
  const [crmId, setCrmId] = useState<string | null>(customer.crmCustomerId || null);
  const [crmChecked, setCrmChecked] = useState<boolean>(!!customer.crmCustomerId);

  const [docs, setDocs] = useState<RealDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [showExpiringOnly, setShowExpiringOnly] = useState(false);

  // Upload form state (Upload New Document tab).
  const [docPets, setDocPets] = useState<{ id: string; name: string }[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadPetId, setUploadPetId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!crmId) return;
    let cancelled = false;
    // The customer's real pets, for the optional pet link on upload.
    fetch(`/api/admin/crm/pets?primary_customer_id=${crmId}&limit=100`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const rows: any[] = j?.data || j?.pets || [];
        setDocPets(rows.map((p) => ({ id: String(p.id), name: p.name || 'Pet' })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [crmId]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    if (!crmId) {
      setUploadError("This customer doesn't have a CRM record, so a document can't be attached to them.");
      return;
    }
    if (!uploadFile) {
      setUploadError('Choose a file to upload.');
      return;
    }
    if (uploadFile.size > DOC_MAX_BYTES) {
      setUploadError('File too large (10 MB max).');
      return;
    }
    if (!docFileOk(uploadFile)) {
      setUploadError('Unsupported file type. Use a PDF, image, Word/Excel document, or text file.');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('customer_id', crmId);
      if (uploadName.trim()) fd.append('name', uploadName.trim());
      if (uploadPetId) fd.append('dependent_id', uploadPetId);
      const res = await fetch('/api/admin/crm/documents', { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.document) {
        setUploadError(j.error || 'Upload failed. Please try again.');
        return;
      }
      // Success is only reported now — the server stored the file and
      // returned the created crm_documents row. It joins the Existing list.
      const d = j.document;
      setDocs((prev) => [
        {
          id: String(d.id),
          name: d.name || 'Document',
          status: d.status || 'submitted',
          storagePath: d.storagePath ?? null,
          uploadedAt: d.uploadedAt ?? null,
          expiresAt: d.expiresAt ?? null,
        },
        ...prev,
      ]);
      setUploadFile(null);
      setUploadName('');
      setUploadPetId('');
      setDocSubTab('existing');
    } catch {
      setUploadError('Upload failed — network error.');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (crmId) {
      setCrmChecked(true);
      return;
    }
    const email = (customer.email || '').trim();
    if (!email) {
      setCrmChecked(true);
      return;
    }
    let cancelled = false;
    fetch(`/api/admin/crm/customers?search=${encodeURIComponent(email)}&limit=10`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const rows: any[] = j?.data || j?.customers || [];
        const match = rows.find((r) => String(r.email || '').toLowerCase() === email.toLowerCase());
        if (match) setCrmId(String(match.id));
        setCrmChecked(true);
      })
      .catch(() => {
        if (!cancelled) setCrmChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [crmId, customer.email]);

  useEffect(() => {
    if (!crmId) return;
    let cancelled = false;
    setDocsLoading(true);
    setDocsError(null);
    fetch(`/api/admin/crm/documents?customerId=${crmId}&limit=200`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) {
          setDocsError(j.error || 'Documents could not be loaded.');
          return;
        }
        const rows: any[] = j.documents || [];
        setDocs(
          rows.map((d) => ({
            id: String(d.id),
            name: d.name || 'Document',
            status: d.status || 'pending',
            storagePath: d.storagePath ?? null,
            uploadedAt: d.uploadedAt ?? null,
            expiresAt: d.expiresAt ?? null,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setDocsError('Documents could not be loaded — network error.');
      })
      .finally(() => {
        if (!cancelled) setDocsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [crmId]);

  // Real expiry math from the loaded rows — nothing is precomputed or faked.
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiringDocs = docs.filter((d) => {
    if (!d.expiresAt) return false;
    const exp = new Date(`${d.expiresAt}T23:59:59`);
    return !Number.isNaN(exp.getTime()) && exp <= in30Days;
  });
  const visibleDocs = showExpiringOnly ? expiringDocs : docs;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto px-6 py-6 md:px-10 lg:px-12 max-w-7xl mx-auto w-full">
      {/* Header Section */}
      <header className="mb-6">
        <div className="flex items-center space-x-2 text-[13px] font-medium text-muted-foreground/70 mb-2">
          <button onClick={onCancel} className="hover:text-muted-foreground transition-colors cursor-pointer">
            Customers
          </button>
          <span className="text-muted-foreground">›</span>
          <button onClick={onCancel} className="text-muted-foreground hover:text-primary font-medium transition-colors cursor-pointer">
            {customer.name}
          </button>
          <span className="text-muted-foreground">›</span>
          <span className="text-primary font-semibold">Update Documents</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">{customer.name}</h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[13px] font-medium bg-success/10 text-success border border-success/20/80">
                Active Customer
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-y-1 gap-x-5 mt-1.5 text-[13px] text-muted-foreground">
              <div className="flex items-center space-x-1.5">
                <Phone className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span>{customer.phone}</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <Mail className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span>{customer.email}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Update Documents Card */}
      <section className="bg-card rounded-2xl border border-border/90 shadow-sm overflow-hidden flex flex-col mb-8">
        {/* Card Title & Sub-tabs */}
        <div className="p-6 pb-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground mb-4">Update Documents</h2>

          <div className="inline-flex p-1 bg-muted/40 rounded-xl space-x-1" role="tablist">
            <button
              onClick={() => setDocSubTab('existing')}
              className={`px-4 py-1.5 text-[13px] font-semibold rounded-lg transition-all cursor-pointer ${
                docSubTab === 'existing'
                  ? 'bg-card text-primary shadow-sm border border-border/60'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card/60'
              }`}
            >
              Existing Documents
            </button>
            <button
              onClick={() => setDocSubTab('upload')}
              className={`px-4 py-1.5 text-[13px] font-medium rounded-lg transition-all cursor-pointer ${
                docSubTab === 'upload'
                  ? 'bg-card text-primary shadow-sm border border-border/60 font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card/60'
              }`}
            >
              Upload New Document
            </button>
          </div>
        </div>

        {docSubTab === 'existing' ? (
          <>
            {/* Document Records Table — real crm_documents rows */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px] border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40/70 text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-6" scope="col">Document</th>
                    <th className="py-3 px-4" scope="col">Uploaded</th>
                    <th className="py-3 px-4" scope="col">Expires</th>
                    <th className="py-3 px-4" scope="col">Status</th>
                    <th className="py-3 px-6 text-right" scope="col">File</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-medium text-foreground">
                  {!crmChecked && (
                    <tr>
                      <td colSpan={5} className="py-6 px-6 text-muted-foreground">Loading documents…</td>
                    </tr>
                  )}
                  {crmChecked && !crmId && (
                    <tr>
                      <td colSpan={5} className="py-6 px-6 text-muted-foreground">
                        This customer doesn&apos;t have a CRM record, so their documents can&apos;t be loaded.
                      </td>
                    </tr>
                  )}
                  {crmId && docsLoading && (
                    <tr>
                      <td colSpan={5} className="py-6 px-6 text-muted-foreground">Loading documents…</td>
                    </tr>
                  )}
                  {crmId && !docsLoading && docsError && (
                    <tr>
                      <td colSpan={5} className="py-6 px-6 text-destructive">{docsError}</td>
                    </tr>
                  )}
                  {crmId && !docsLoading && !docsError && visibleDocs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 px-6 text-muted-foreground">
                        {showExpiringOnly
                          ? 'No documents are expired or expiring within 30 days.'
                          : 'No documents on file for this customer yet.'}
                      </td>
                    </tr>
                  )}
                  {crmId &&
                    !docsLoading &&
                    !docsError &&
                    visibleDocs.map((doc) => (
                      <tr key={doc.id} className="hover:bg-muted/40/70 transition-colors">
                        <td className="py-3.5 px-6 text-foreground font-semibold">{doc.name}</td>
                        <td className="py-3.5 px-4 text-muted-foreground">{docDateLabel(doc.uploadedAt)}</td>
                        <td className="py-3.5 px-4 text-muted-foreground">{docDateLabel(doc.expiresAt)}</td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-semibold ${docBadgeClass(doc.status)}`}>
                            {docStatusLabel(doc.status)}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          {doc.storagePath && /^https?:\/\//.test(doc.storagePath) ? (
                            <a
                              href={doc.storagePath}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[13px] font-semibold text-primary hover:underline"
                            >
                              View
                            </a>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Document Reminders Footer Box — computed from the real rows above */}
            {crmId && !docsLoading && !docsError && expiringDocs.length > 0 && (
              <div className="m-6 p-4 rounded-xl bg-muted/40 border border-border/70 flex flex-col space-y-1">
                <h3 className="text-[13px] font-semibold text-foreground">Document Reminders</h3>
                <p className="text-[13px] text-muted-foreground">
                  {customer.name} has {expiringDocs.length} document{expiringDocs.length === 1 ? '' : 's'} expired or
                  expiring within 30 days.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowExpiringOnly((v) => !v)}
                    className="inline-flex items-center space-x-1.5 text-[13px] font-semibold text-primary hover:text-primary transition-colors cursor-pointer"
                  >
                    <span>{showExpiringOnly ? 'Show All Documents' : 'View Expiring Documents'}</span>
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Upload New Document — real upload: the file posts to
             POST /api/admin/crm/documents, which stores it in the
             customer-documents bucket and writes the crm_documents row.
             Success switches to Existing Documents with the new row in it. */
          <div className="p-6">
            {!crmChecked ? (
              <p className="text-[13px] text-muted-foreground">Loading…</p>
            ) : !crmId ? (
              <div className="rounded-xl border border-border bg-muted/40 p-6 flex gap-4">
                <Upload className="w-6 h-6 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">No CRM record for this customer</h3>
                  <p className="text-[13px] text-muted-foreground mt-1 max-w-xl">
                    Documents attach to a customer&apos;s CRM record, and {customer.name} doesn&apos;t have one
                    yet — so there&apos;s nothing to attach a file to from this screen.
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleUpload} className="max-w-xl space-y-5">
                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-1.5" htmlFor="doc-upload-file">
                    File <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="doc-upload-file"
                    type="file"
                    accept={DOC_ACCEPT}
                    onChange={(e) => {
                      setUploadFile(e.target.files?.[0] || null);
                      setUploadError(null);
                    }}
                    className="block w-full text-[13px] text-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-muted/40 file:px-3 file:py-2 file:text-[13px] file:font-semibold file:text-foreground hover:file:bg-muted/60 cursor-pointer"
                  />
                  <p className="text-[13px] text-muted-foreground mt-1.5">
                    PDF, image, Word/Excel document, or text file — 10 MB max.
                    {uploadFile && (
                      <span className="text-foreground font-medium">
                        {' '}
                        Selected: {uploadFile.name} ({docFileSizeLabel(uploadFile.size)})
                      </span>
                    )}
                  </p>
                </div>

                <div>
                  <label className="block text-[13px] font-medium text-foreground mb-1.5" htmlFor="doc-upload-name">
                    Document name (optional)
                  </label>
                  <input
                    id="doc-upload-name"
                    type="text"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    placeholder={uploadFile ? uploadFile.name : 'e.g. Rabies certificate'}
                    className="block w-full rounded-lg border-border px-3 py-2 text-[13px] font-medium text-foreground focus:border-primary focus:ring-primary bg-card"
                  />
                </div>

                {docPets.length > 0 && (
                  <div>
                    <label className="block text-[13px] font-medium text-foreground mb-1.5" htmlFor="doc-upload-pet">
                      Pet (optional)
                    </label>
                    <select
                      id="doc-upload-pet"
                      value={uploadPetId}
                      onChange={(e) => setUploadPetId(e.target.value)}
                      className="w-full text-[13px] rounded-lg border-border py-2.5 pl-3 pr-8 focus:border-primary focus:ring-1 focus:ring-primary bg-card font-medium text-foreground"
                    >
                      <option value="">No specific pet</option>
                      {docPets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {uploadError && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-[13px] font-medium text-destructive">
                    {uploadError}
                  </div>
                )}

                <div>
                  <button
                    type="submit"
                    disabled={uploading || !uploadFile}
                    className="inline-flex items-center space-x-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{uploading ? 'Uploading…' : 'Upload Document'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
/* =========================================================================
 * 6. ADD NOTE QUICK ACTION
 * ========================================================================= */
// Resolve a profile (shop dog) pet id to its crm_pets id: the id itself
// when it already is a CRM pet, otherwise via the source_pet_id link.
async function resolveCrmPetIdForProfilePet(rawId: string): Promise<string | null> {
  if (!rawId) return null;
  try {
    const byId = await fetch(`/api/admin/crm/pets?id=${rawId}&limit=1`, { cache: 'no-store' });
    const bj = byId.ok ? await byId.json().catch(() => ({})) : {};
    if (Array.isArray(bj.data) && bj.data.length > 0) return String(bj.data[0].id);
    const bySource = await fetch(`/api/admin/crm/pets?source_pet_id=${rawId}&limit=1`, { cache: 'no-store' });
    const sj = bySource.ok ? await bySource.json().catch(() => ({})) : {};
    if (Array.isArray(sj.data) && sj.data.length > 0) return String(sj.data[0].id);
  } catch { /* unresolved */ }
  return null;
}

export const QuickActionAddNoteView: React.FC<CustomerQuickActionsProps> = ({
  customer,
  onCancel,
  onSuccess,
}) => {
  const crmId = useResolvedCrmId(customer);
  // noteFor holds '' for the customer or a real pet id from the profile —
  // the old hardcoded "Buddy/Luna" options named pets this customer may
  // not have, and the prefilled example body was one click away from
  // being saved as a real note. Both are gone; the body starts empty.
  const [noteFor, setNoteFor] = useState('');
  const [relatedTo, setRelatedTo] = useState('General');
  const [noteType, setNoteType] = useState('General Note');
  const [noteBody, setNoteBody] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'customer'>('private');

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteBody.trim()) return;
    if (!crmId) {
      alert('This profile is not linked to a CRM customer record, so the note cannot be saved.');
      return;
    }

    // Real write: POST crm add_note inserts the crm_notes row for this
    // customer. crm_notes keys on the CRM customer id, and dependent_id FKs to
    // crm_pets — the profile's shop ids fail both, so resolve first; an
    // unresolved pet simply leaves the note customer-level.
    const crmPetId = noteFor ? await resolveCrmPetIdForProfilePet(noteFor) : null;
    try {
      const res = await fetch('/api/admin/crm/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'crm_add_note',
          customer_id: crmId,
          dependent_id: crmPetId || undefined,
          body: noteBody.trim(),
          note_type: visibility === 'customer' ? 'customer_visible' : 'internal',
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        alert(j.error || 'Note could not be saved. Please try again.');
        return;
      }
    } catch {
      alert('Note could not be saved — network error.');
      return;
    }

    const noteForLabel = noteFor
      ? `${customer.pets?.find((p: any) => p.id === noteFor)?.name || 'Pet'} (Pet)`
      : `${customer.name} (Customer)`;
    onSuccess(`Note added to ${customer.name}'s profile (${visibility === 'private' ? 'Internal Only' : 'Visible to Customer'})!`, {
      type: 'note',
      noteFor: noteForLabel,
      relatedTo,
      noteType,
      description: noteBody,
      visibility,
    });
  };

  return (
    <div className="flex-1 flex flex-col p-6 sm:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <header className="mb-5">
        <nav aria-label="Breadcrumb" className="flex items-center space-x-1.5 text-[13px] text-muted-foreground/70 font-medium mb-1.5">
          <button onClick={onCancel} className="hover:text-muted-foreground transition cursor-pointer">
            Customers
          </button>
          <span>›</span>
          <button onClick={onCancel} className="text-muted-foreground hover:text-primary font-medium cursor-pointer">
            {customer.name}
          </button>
          <span>›</span>
          <span className="text-primary font-semibold">Add Note</span>
        </nav>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">{customer.name}</h1>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[13px] font-medium bg-success/10 text-success border border-success/20">
            Active Customer
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-5 text-[13px] text-muted-foreground font-normal">
          <div className="flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-muted-foreground/70 stroke-2" />
            <span>{customer.phone}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-muted-foreground/70 stroke-2" />
            <span>{customer.email}</span>
          </div>
        </div>
      </header>

      {/* Add Note Card */}
      <section className="bg-card rounded-xl border border-border shadow-sm overflow-hidden mt-1">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Add Note</h2>
        </div>

        <form onSubmit={handleSaveNote} className="p-6 space-y-6">
          {/* Note Details Group */}
          <fieldset className="space-y-4">
            <legend className="text-[13px] font-semibold text-foreground tracking-wide uppercase">
              Note Details
            </legend>

            {/* Dropdown Row 1: Note For & Related To */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Note For */}
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5" htmlFor="note-for">
                  Note For <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <select
                    id="note-for"
                    value={noteFor}
                    onChange={(e) => setNoteFor(e.target.value)}
                    className="w-full text-[13px] rounded-lg border-border text-foreground bg-card py-2 pl-3 pr-8 shadow-sm focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option value="">{customer.name} (Customer)</option>
                    {(customer.pets || []).map((pet: any) => (
                      <option key={pet.id} value={pet.id}>{pet.name} (Pet)</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Related To */}
              <div>
                <label className="block text-[13px] font-medium text-foreground mb-1.5" htmlFor="related-to">
                  Related To
                </label>
                <div className="relative">
                  <select
                    id="related-to"
                    value={relatedTo}
                    onChange={(e) => setRelatedTo(e.target.value)}
                    className="w-full text-[13px] rounded-lg border-border text-foreground bg-card py-2 pl-3 pr-8 shadow-sm focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option>General</option>
                    <option>Appointment #4821</option>
                    <option>Grooming Preferences</option>
                    <option>Medical &amp; Allergies</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Note Type */}
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1.5" htmlFor="note-type">
                Note Type
              </label>
              <div className="relative">
                <select
                  id="note-type"
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                  className="w-full text-[13px] rounded-lg border-border text-foreground bg-card py-2 pl-3 pr-8 shadow-sm focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option>General Note</option>
                  <option>Behavioral Note</option>
                  <option>Special Instructions</option>
                  <option>Staff Alert</option>
                </select>
              </div>
            </div>

            {/* Note Content Area */}
            <div>
              <label className="block text-[13px] font-medium text-foreground mb-1.5" htmlFor="note-body">
                Note <span className="text-destructive">*</span>
              </label>
              <textarea
                id="note-body"
                rows={4}
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                className="w-full text-[13px] text-foreground rounded-lg border-border shadow-sm p-3 focus:border-primary focus:ring-1 focus:ring-primary leading-relaxed resize-y bg-card"
                required
              ></textarea>
              <div className="mt-1 flex justify-end">
                <span className="text-[11px] text-muted-foreground/70 tabular-nums">{noteBody.length}/2000</span>
              </div>
            </div>
          </fieldset>

          {/* Visibility Section */}
          <fieldset className="pt-1">
            <legend className="text-[13px] font-semibold text-foreground tracking-wide uppercase mb-2.5">
              Visibility
            </legend>
            <div className="flex items-center gap-6">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={visibility === 'private'}
                  onChange={() => setVisibility('private')}
                  className="w-4 h-4 text-primary border-border focus:ring-primary focus:ring-offset-0"
                />
                <span className="text-[13px] text-foreground">Private (Internal Only)</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="radio"
                  name="visibility"
                  value="customer"
                  checked={visibility === 'customer'}
                  onChange={() => setVisibility('customer')}
                  className="w-4 h-4 text-primary border-border focus:ring-primary focus:ring-offset-0"
                />
                <span className="text-[13px] text-foreground">Visible to Customer</span>
              </label>
            </div>
          </fieldset>

          {/* Actions Bar */}
          <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2 text-[13px] font-medium text-muted-foreground bg-card border border-border rounded-lg hover:bg-muted/40 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-[13px] font-medium text-white bg-primary rounded-lg hover:bg-primary/90 shadow-sm transition cursor-pointer font-semibold tracking-wide"
            >
              Save Note
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
