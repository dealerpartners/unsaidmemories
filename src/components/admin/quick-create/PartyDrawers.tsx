'use client';

import { useState, type FormEvent } from 'react';
import { User, Building2, Package, Contact, Landmark, Loader2 } from 'lucide-react';
import { DrawerShell, qcLabelCls, qcLabelStyle, qcInputCls, qcSaveBtnCls, qcCancelBtnCls, QcError, QcSuccess } from './surfaces';

// ============================================================================
// The four party drawers behind the + Customer split button (owner's
// QUICK_ACTIONS.html): Retail Customer, Vendor (Supplier), Blank
// Supplier, General Contact — his fields, labels, and order exactly,
// converted to native components with Lucide icons.
//
// Wiring (censused 2026-11-02):
//   Retail Customer → POST /api/admin/crm/actions {action:
//     'crm_add_customer', first_name, last_name, email, phone} — a real
//     crm_customers write. The action's insert carries NO address
//     columns, so the drawer's shipping-address fields render per his
//     design but are not persisted yet (gap list #11) — the save note
//     says so whenever they were filled.
//   General Contact → the same action with customer_type 'other' (a
//     value its CHECK constraint accepts) — a real crm_customers row.
//     Company / role have no columns on that insert (gap #11).
//   Vendor → POST /api/admin/accounting/vendors {legal_name, email,
//     phone, payment_terms_days} — a real acct_vendors write. The
//     table HAS ACH columns (ach_routing_number, ach_account_last4)
//     but the create route doesn't accept them, and it has no address
//     or display-name columns — those fields render per his design
//     and are gap-listed (#12), with the same in-drawer honesty note.
//   Blank Supplier → the same acct_vendors create (a blank supplier
//     is a payables vendor in this schema), terms mapped to
//     payment_terms_days. Account number / catalog URL have no
//     columns (gap #12).
// ============================================================================

type SaveState = { busy: boolean; error: string | null; success: string | null };
const idle: SaveState = { busy: false, error: null, success: null };

async function postJson(url: string, payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(j.error || `Request failed (${res.status})`);
  return j;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={qcLabelCls} style={qcLabelStyle}>{label}</label>
      {children}
    </div>
  );
}

function DrawerFooter({
  state,
  onClose,
  saveLabel,
}: {
  state: SaveState;
  onClose: () => void;
  saveLabel: string;
}) {
  return (
    <>
      <button type="button" onClick={onClose} className={qcCancelBtnCls}>Cancel</button>
      <button type="submit" disabled={state.busy} className={qcSaveBtnCls}>
        {state.busy ? <Loader2 size={15} className="animate-spin" /> : null}
        {saveLabel}
      </button>
    </>
  );
}

/* ── Retail Customer ─────────────────────────────────────────────── */
export function RetailCustomerDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ first: '', last: '', email: '', phone: '', street: '', city: '', state: '', zip: '' });
  const [s, setS] = useState<SaveState>(idle);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setS({ busy: true, error: null, success: null });
    try {
      await postJson('/api/admin/crm/actions', {
        action: 'crm_add_customer',
        first_name: f.first.trim() || undefined,
        last_name: f.last.trim() || undefined,
        email: f.email.trim() || undefined,
        phone: f.phone.trim() || undefined,
      });
      const addressFilled = f.street || f.city || f.state || f.zip;
      setS({
        busy: false,
        error: null,
        success:
          'Customer saved.' +
          (addressFilled ? ' The shipping address is not stored yet — the customer create path has no address fields (gap list #11).' : ''),
      });
      setF({ first: '', last: '', email: '', phone: '', street: '', city: '', state: '', zip: '' });
    } catch (err) {
      setS({ busy: false, error: err instanceof Error ? err.message : 'Save failed', success: null });
    }
  };

  return (
    <form onSubmit={save}>
      <DrawerShell
        open={open}
        onClose={onClose}
        icon={<User size={22} style={{ color: '#0a6400' }} />}
        title="Add Retail Customer"
        footer={<DrawerFooter state={s} onClose={onClose} saveLabel="Save customer" />}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[#6b7280] mb-0">Create a profile for a direct consumer (B2C).</p>
          <QcError text={s.error} />
          <QcSuccess text={s.success} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name"><input className={qcInputCls} value={f.first} onChange={set('first')} /></Field>
            <Field label="Last name"><input className={qcInputCls} value={f.last} onChange={set('last')} /></Field>
          </div>
          <Field label="Email"><input type="email" className={qcInputCls} placeholder="name@email.com" value={f.email} onChange={set('email')} /></Field>
          <Field label="Phone"><input type="tel" className={qcInputCls} placeholder="(555) 000-0000" value={f.phone} onChange={set('phone')} /></Field>
          <div className="pt-2 flex flex-col gap-2">
            <span className={qcLabelCls} style={qcLabelStyle}>Shipping address</span>
            <input className={qcInputCls} placeholder="Street address" value={f.street} onChange={set('street')} />
            <div className="grid grid-cols-3 gap-2">
              <input className={qcInputCls} placeholder="City" value={f.city} onChange={set('city')} />
              <input className={qcInputCls} placeholder="State" value={f.state} onChange={set('state')} />
              <input className={qcInputCls} placeholder="ZIP" value={f.zip} onChange={set('zip')} />
            </div>
          </div>
        </div>
      </DrawerShell>
    </form>
  );
}

/* ── Vendor (Supplier) ───────────────────────────────────────────── */
export function VendorDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ company: '', display: '', email: '', phone: '', street: '', city: '', state: '', zip: '', achAccount: '', achRouting: '' });
  const [s, setS] = useState<SaveState>(idle);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.company.trim()) {
      setS({ busy: false, error: 'Company name is required.', success: null });
      return;
    }
    setS({ busy: true, error: null, success: null });
    try {
      await postJson('/api/admin/accounting/vendors', {
        legal_name: f.company.trim(),
        email: f.email.trim() || undefined,
        phone: f.phone.trim() || undefined,
        payment_terms_days: 30,
      });
      const extraFilled = f.display || f.street || f.city || f.achAccount || f.achRouting;
      setS({
        busy: false,
        error: null,
        success:
          'Vendor saved.' +
          (extraFilled ? ' Display name, address, and ACH details are not stored yet — the vendor create path does not accept them (gap list #12).' : ''),
      });
      setF({ company: '', display: '', email: '', phone: '', street: '', city: '', state: '', zip: '', achAccount: '', achRouting: '' });
    } catch (err) {
      setS({ busy: false, error: err instanceof Error ? err.message : 'Save failed', success: null });
    }
  };

  return (
    <form onSubmit={save}>
      <DrawerShell
        open={open}
        onClose={onClose}
        icon={<Building2 size={22} style={{ color: '#0a6400' }} />}
        title="Add Vendor"
        footer={<DrawerFooter state={s} onClose={onClose} saveLabel="Save vendor" />}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[#6b7280]">Track a company or independent contractor you pay for goods or services.</p>
          <QcError text={s.error} />
          <QcSuccess text={s.success} />
          <Field label="Company name"><input className={qcInputCls} placeholder="e.g. Acme Corp" value={f.company} onChange={set('company')} /></Field>
          <Field label="Display name (as it appears on checks)"><input className={qcInputCls} value={f.display} onChange={set('display')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email"><input type="email" className={qcInputCls} value={f.email} onChange={set('email')} /></Field>
            <Field label="Phone"><input type="tel" className={qcInputCls} value={f.phone} onChange={set('phone')} /></Field>
          </div>
          <div className="border-t border-[#e5e7eb] pt-4 mt-2 flex flex-col gap-2">
            <span className={qcLabelCls} style={qcLabelStyle}>Address</span>
            <input className={qcInputCls} placeholder="Street address" value={f.street} onChange={set('street')} />
            <div className="grid grid-cols-3 gap-2">
              <input className={qcInputCls} placeholder="City" value={f.city} onChange={set('city')} />
              <input className={qcInputCls} placeholder="State" value={f.state} onChange={set('state')} />
              <input className={qcInputCls} placeholder="ZIP" value={f.zip} onChange={set('zip')} />
            </div>
          </div>
          <div className="border-t border-[#e5e7eb] pt-4 mt-2">
            <h3 className="text-sm font-semibold text-[#1f2937] mb-2 flex items-center gap-1.5">
              <Landmark size={16} /> Bill Pay ACH Info
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bank account number"><input type="password" className={qcInputCls} value={f.achAccount} onChange={set('achAccount')} /></Field>
              <Field label="Routing number"><input className={qcInputCls} value={f.achRouting} onChange={set('achRouting')} /></Field>
            </div>
          </div>
        </div>
      </DrawerShell>
    </form>
  );
}

/* ── Blank Supplier ──────────────────────────────────────────────── */
const TERMS_DAYS: Record<string, number> = { 'Net 30': 30, 'Net 60': 60, 'Due on receipt': 0 };

export function SupplierDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ name: '', account: '', terms: 'Net 30', email: '', url: '' });
  const [s, setS] = useState<SaveState>(idle);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) {
      setS({ busy: false, error: 'Supplier name is required.', success: null });
      return;
    }
    setS({ busy: true, error: null, success: null });
    try {
      await postJson('/api/admin/accounting/vendors', {
        legal_name: f.name.trim(),
        email: f.email.trim() || undefined,
        payment_terms_days: TERMS_DAYS[f.terms] ?? 30,
      });
      const extraFilled = f.account || f.url;
      setS({
        busy: false,
        error: null,
        success:
          'Supplier saved.' +
          (extraFilled ? ' Account number and catalog URL are not stored yet — the vendor create path has no fields for them (gap list #12).' : ''),
      });
      setF({ name: '', account: '', terms: 'Net 30', email: '', url: '' });
    } catch (err) {
      setS({ busy: false, error: err instanceof Error ? err.message : 'Save failed', success: null });
    }
  };

  return (
    <form onSubmit={save}>
      <DrawerShell
        open={open}
        onClose={onClose}
        icon={<Package size={22} style={{ color: '#0a6400' }} />}
        title="Add Blank Supplier"
        footer={<DrawerFooter state={s} onClose={onClose} saveLabel="Save supplier" />}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[#6b7280]">Add a provider of blank garments or raw materials for production.</p>
          <QcError text={s.error} />
          <QcSuccess text={s.success} />
          <Field label="Supplier name">
            <input className={qcInputCls} placeholder="e.g. Bella+Canvas" value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account number">
              <input className={qcInputCls} value={f.account} onChange={(e) => setF((p) => ({ ...p, account: e.target.value }))} />
            </Field>
            <Field label="Terms">
              <select className={qcInputCls} value={f.terms} onChange={(e) => setF((p) => ({ ...p, terms: e.target.value }))}>
                <option>Net 30</option>
                <option>Net 60</option>
                <option>Due on receipt</option>
              </select>
            </Field>
          </div>
          <Field label="Primary contact email">
            <input type="email" className={qcInputCls} value={f.email} onChange={(e) => setF((p) => ({ ...p, email: e.target.value }))} />
          </Field>
          <Field label="Catalog/API URL (optional)">
            <input type="url" className={qcInputCls} placeholder="https://" value={f.url} onChange={(e) => setF((p) => ({ ...p, url: e.target.value }))} />
          </Field>
        </div>
      </DrawerShell>
    </form>
  );
}

/* ── General Contact ─────────────────────────────────────────────── */
export function ContactDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ first: '', last: '', company: '', role: '', email: '', phone: '' });
  const [s, setS] = useState<SaveState>(idle);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setS({ busy: true, error: null, success: null });
    try {
      await postJson('/api/admin/crm/actions', {
        action: 'crm_add_customer',
        customer_type: 'other',
        first_name: f.first.trim() || undefined,
        last_name: f.last.trim() || undefined,
        email: f.email.trim() || undefined,
        phone: f.phone.trim() || undefined,
      });
      const extraFilled = f.company || f.role;
      setS({
        busy: false,
        error: null,
        success:
          'Contact saved.' +
          (extraFilled ? ' Company and role are not stored yet — the contact create path has no fields for them (gap list #11).' : ''),
      });
      setF({ first: '', last: '', company: '', role: '', email: '', phone: '' });
    } catch (err) {
      setS({ busy: false, error: err instanceof Error ? err.message : 'Save failed', success: null });
    }
  };

  return (
    <form onSubmit={save}>
      <DrawerShell
        open={open}
        onClose={onClose}
        icon={<Contact size={22} style={{ color: '#0a6400' }} />}
        title="Add General Contact"
        footer={<DrawerFooter state={s} onClose={onClose} saveLabel="Save contact" />}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[#6b7280]">Add a non-transactional contact (e.g., a partner, accountant, or internal team member).</p>
          <QcError text={s.error} />
          <QcSuccess text={s.success} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name"><input className={qcInputCls} value={f.first} onChange={set('first')} /></Field>
            <Field label="Last name"><input className={qcInputCls} value={f.last} onChange={set('last')} /></Field>
          </div>
          <Field label="Company / Organization"><input className={qcInputCls} value={f.company} onChange={set('company')} /></Field>
          <Field label="Role / Title"><input className={qcInputCls} placeholder="e.g. Accountant" value={f.role} onChange={set('role')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email"><input type="email" className={qcInputCls} value={f.email} onChange={set('email')} /></Field>
            <Field label="Phone"><input type="tel" className={qcInputCls} value={f.phone} onChange={set('phone')} /></Field>
          </div>
        </div>
      </DrawerShell>
    </form>
  );
}
