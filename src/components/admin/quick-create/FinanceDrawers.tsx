'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { DrawerShell, qcLabelCls, qcLabelStyle, qcInputCls, qcSaveBtnCls, qcCancelBtnCls, QcError, QcSuccess } from './surfaces';

// ============================================================================
// Bank Deposit + Product Design drawers (owner's QUICK_ACTIONS.html).
//
// Bank Deposit — the brief named POST /api/admin/deposits as the wire
// target; censused 2026-11-02, that route is GET-ONLY (the
// commerce_deposits escrow registry — booking deposits, a different
// thing). The accounting deposits route's POST covers collecting a
// CUSTOMER deposit (GL 2350) and batch-marking receipts deposited —
// neither is this drawer's bank deposit of funds. So, per the brief's
// own fallback: "Deposit to" options come from real accounting data
// (GET /api/admin/accounting/bank-accounts), the form renders exactly
// as drawn, and Save reports the gap in-drawer instead of posting
// somewhere wrong (gap list #10). Nothing is faked.
//
// Product Design — "Open Studio →" first creates the product through
// the real catalog path (POST /api/admin/products {name, base_price})
// and then routes to /admin/studio, per his note under the form. The
// create API takes no supplier or product-type fields, so those two
// selects render per his design and are chosen for the operator's
// intent only (gap list #14). Supplier options are Printful /
// Printify / Cloudprinter — his file lists Gelato, which his
// 2026-11-01 ruling dropped from the supplier set; the ruling
// governs and the deviation is reported.
// ============================================================================

const todayISO = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

type BankAccount = { id: string; label: string };

/* ── Bank Deposit ────────────────────────────────────────────────── */
type FundLine = { key: number; source: string; amount: string };
let fundKey = 0;
const blankFund = (): FundLine => ({ key: ++fundKey, source: 'Cash on hand', amount: '' });

export function DepositDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [depositTo, setDepositTo] = useState('');
  const [date, setDate] = useState(todayISO());
  const [reference, setReference] = useState('');
  const [funds, setFunds] = useState<FundLine[]>([blankFund()]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await fetch('/api/admin/accounting/bank-accounts', { cache: 'no-store' });
        const j = await res.json().catch(() => ({}));
        const rows: any[] = j.accounts ?? j.data ?? j.rows ?? (Array.isArray(j) ? j : []);
        const mapped = rows.map((r: any) => {
          const masked = r.masked_account_number ?? r.maskedAccountNumber ?? null;
          const last4 = masked ? String(masked).replace(/\D/g, '').slice(-4) : '';
          return { id: String(r.id), label: `${r.name}${last4 ? ` ...${last4}` : ''}` };
        });
        setAccounts(mapped);
        if (mapped.length > 0) setDepositTo((cur) => cur || mapped[0].id);
      } catch { /* the empty state below is the honest render */ }
    })();
  }, [open ]);

  const total = funds.reduce((s, f) => s + (Number(f.amount) || 0), 0);

  const save = (e: FormEvent) => {
    e.preventDefault();
    setNotice(
      'Bank deposits can\'t be recorded yet — there is no bank-deposit create endpoint: ' +
        '/api/admin/deposits is a read-only escrow registry, and the accounting deposits path covers ' +
        'customer deposits and batch deposit-marking, not this form. The drawer is ready to wire the ' +
        'day that endpoint exists (gap list #10).',
    );
  };

  return (
    <form onSubmit={save}>
      <DrawerShell
        open={open}
        onClose={onClose}
        title="Bank Deposit"
        footer={
          <>
            <button type="button" onClick={onClose} className={qcCancelBtnCls}>Cancel</button>
            <button type="submit" className={qcSaveBtnCls}>Save deposit</button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {notice ? (
            <p className="text-[13px] border border-[#e5e7eb] rounded-md px-3 py-2.5 bg-[#faf9fc] flex items-start gap-2">
              <span>{notice}</span>
            </p>
          ) : null}
          <div>
            <label className={qcLabelCls} style={qcLabelStyle}>Deposit to</label>
            <select className={qcInputCls} value={depositTo} onChange={(e) => setDepositTo(e.target.value)}>
              {accounts.length === 0 ? (
                <option value="">No bank accounts on file</option>
              ) : (
                accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)
              )}
            </select>
          </div>
          <div>
            <label className={qcLabelCls} style={qcLabelStyle}>Date</label>
            <input type="date" className={qcInputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className={qcLabelCls} style={qcLabelStyle}>Reference no.</label>
            <input type="text" className={qcInputCls} placeholder="e.g. 1024" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="border-t border-[#e5e7eb] pt-4 mt-4">
            <p className="text-sm font-semibold text-[#1f2937] mb-2">Add funds</p>
            <div className="flex flex-col gap-2">
              {funds.map((f, i) => (
                <div key={f.key} className="flex items-center gap-3">
                  <span className="text-[#9ca3af] text-sm">{i + 1}</span>
                  <select
                    className={`${qcInputCls} flex-1`}
                    value={f.source}
                    onChange={(e) => setFunds((fs) => fs.map((x) => (x.key === f.key ? { ...x, source: e.target.value } : x)))}
                  >
                    <option>Cash on hand</option>
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={`${qcInputCls} w-28 text-right`}
                    placeholder="0.00"
                    value={f.amount}
                    onChange={(e) => setFunds((fs) => fs.map((x) => (x.key === f.key ? { ...x, amount: e.target.value } : x)))}
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              className="text-sm font-semibold hover:underline mt-2"
              style={{ color: '#0a6400' }}
              onClick={() => setFunds((fs) => [...fs, blankFund()])}
            >
              + Add another line
            </button>
            {total > 0 ? <p className="text-xs text-[#6b7280] mt-2">Total: ${total.toFixed(2)}</p> : null}
          </div>
        </div>
      </DrawerShell>
    </form>
  );
}

/* ── Product Design ──────────────────────────────────────────────── */
export function ProductDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [type, setType] = useState('Apparel');
  const [supplier, setSupplier] = useState('Printful');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!name.trim()) {
      setError('Product name is required.');
      return;
    }
    if (!(Number(String(price).replace(/[^0-9.]/g, '')) > 0)) {
      setError('A base price above $0 is required.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), base_price: price }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || 'The product could not be created');
      setSuccess('Product created — opening the Design Studio…');
      onClose();
      router.push('/admin/studio');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The product could not be created');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <DrawerShell
        open={open}
        onClose={onClose}
        title="Add a new product"
        footer={
          <>
            <button type="button" onClick={onClose} className={qcCancelBtnCls}>Cancel</button>
            <button type="submit" disabled={busy} className={qcSaveBtnCls}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : null}
              Open Studio →
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <QcError text={error} />
          <QcSuccess text={success} />
          <div>
            <label className={qcLabelCls} style={qcLabelStyle}>Product type</label>
            <select className={qcInputCls} value={type} onChange={(e) => setType(e.target.value)}>
              <option>Apparel</option>
              <option>Poster</option>
              <option>Mug</option>
            </select>
          </div>
          <div>
            <label className={qcLabelCls} style={qcLabelStyle}>Supplier</label>
            <select className={qcInputCls} value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              <option>Printful</option>
              <option>Printify</option>
              <option>Cloudprinter</option>
            </select>
          </div>
          <div>
            <label className={qcLabelCls} style={qcLabelStyle}>Product name</label>
            <input type="text" className={qcInputCls} placeholder="e.g. Heavyweight Tee" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={qcLabelCls} style={qcLabelStyle}>Base price</label>
            <input type="text" inputMode="decimal" className={qcInputCls} placeholder="$0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="bg-[#f9fafb] border border-[#e5e7eb] rounded-lg p-4 text-sm text-[#4b5563]">
            Once created, you&apos;ll be taken directly to the Konva Design Studio to upload your artwork and
            place it on the product.
          </div>
        </div>
      </DrawerShell>
    </form>
  );
}
