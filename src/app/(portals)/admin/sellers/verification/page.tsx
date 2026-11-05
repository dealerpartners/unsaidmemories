'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BadgeCheck, Landmark, ShieldCheck } from 'lucide-react';

type SellerSnippet = {
  seller_id: string;
  seller_display_name: string;
  seller_legal_name: string | null;
  seller_email: string | null;
  seller_type: string | null;
  seller_status: string;
};

type VerificationTask = SellerSnippet & {
  id: string;
  task_type: string;
  status: string;
  evidence_url: string | null;
  notes: string | null;
  created_at: string;
  reviewed_at?: string | null;
};

type BrandAuthorization = SellerSnippet & {
  id: string;
  brand_id: string;
  brand_name: string;
  authorization_type: string;
  status: string;
  evidence_url: string | null;
  created_at: string;
  reviewed_at?: string | null;
};

// The task_type vocabulary is filed by seller onboarding: Step 4 files
// 'business_verification' (the bank-grade packet — license, insurance,
// resale certificate ride in its notes), Step 9 files 'tax_verification'.
const TASK_LABELS: Record<string, string> = {
  business_verification: 'Business verification',
  tax_verification: 'Tax verification',
  background_check: 'Background check',
};

const AUTH_TYPE_LABELS: Record<string, string> = {
  brand_owner: 'Brand owner',
  authorized_reseller: 'Authorized reseller',
  distributor: 'Distributor',
};

const TYPE_LABELS: Record<string, string> = {
  first_party: 'First party (house)',
  manufacturer_brand: 'Manufacturer brand',
  supplier: 'Supplier',
  reseller: 'Reseller',
  drop_shipper: 'Drop shipper',
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'adm-badge adm-badge-amber',
    approved: 'adm-badge adm-badge-green',
    rejected: 'adm-badge adm-badge-red',
    expired: 'adm-badge',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${styles[status] || styles.expired}`}>
      {status}
    </span>
  );
}

function sellerLine(s: SellerSnippet) {
  return (
    <div>
      <div className="text-[14px] font-medium">{s.seller_display_name || s.seller_legal_name || 'Seller'}</div>
      <div className="text-[12px] text-muted-foreground">
        {s.seller_email || '—'}
        {s.seller_type ? ` · ${TYPE_LABELS[s.seller_type] || s.seller_type}` : ''}
        {` · seller ${s.seller_status}`}
      </div>
    </div>
  );
}

export default function SellerVerificationPage() {
  const [tasks, setTasks] = useState<VerificationTask[]>([]);
  const [brands, setBrands] = useState<BrandAuthorization[]>([]);
  const [decidedTasks, setDecidedTasks] = useState<VerificationTask[]>([]);
  const [decidedBrands, setDecidedBrands] = useState<BrandAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/admin/sellers/verification')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setTasks(d.tasks || []);
        setBrands(d.brands || []);
        setDecidedTasks(d.decidedTasks || []);
        setDecidedBrands(d.decidedBrands || []);
        setError(null);
      })
      .catch(() => setError('Failed to load the verification desk'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const decide = async (kind: 'task' | 'brand', id: string, decision: 'approve' | 'reject') => {
    setActing(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/sellers/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          kind === 'task'
            ? { action: 'decide_task', task_id: id, decision, reason }
            : { action: 'decide_brand', authorization_id: id, decision, reason },
        ),
      });
      const d = await res.json();
      if (!res.ok || d.error) {
        setError(d.error || 'Decision failed');
      } else {
        setRejecting(null);
        setReason('');
        load();
      }
    } catch {
      setError('Decision failed');
    } finally {
      setActing(false);
    }
  };

  const decisionControls = (kind: 'task' | 'brand', id: string) =>
    rejecting === id ? (
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={kind === 'task' ? 'Reason for rejection (the seller sees it on the task)' : 'Reason for rejection (sent to the seller)'}
          className="flex-1 min-w-[240px] border border-border rounded-lg px-3 py-2 text-[13px] bg-card"
        />
        <button disabled={acting} onClick={() => decide(kind, id, 'reject')}
          className="px-3.5 py-2 bg-red-600 text-white rounded-lg text-[13px] font-semibold hover:bg-red-700 cursor-pointer disabled:opacity-50">
          Confirm rejection
        </button>
        <button disabled={acting} onClick={() => { setRejecting(null); setReason(''); }}
          className="px-3.5 py-2 border border-border rounded-lg text-[13px] font-semibold hover:bg-muted cursor-pointer disabled:opacity-50">
          Cancel
        </button>
      </div>
    ) : (
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={acting} onClick={() => decide(kind, id, 'approve')}
          className="px-3.5 py-2 bg-emerald-600 text-white rounded-lg text-[13px] font-semibold hover:bg-emerald-700 cursor-pointer disabled:opacity-50">
          Approve
        </button>
        <button disabled={acting} onClick={() => { setRejecting(id); setReason(''); }}
          className="px-3.5 py-2 border border-border rounded-lg text-[13px] font-semibold hover:bg-muted cursor-pointer disabled:opacity-50">
          Reject…
        </button>
      </div>
    );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/sellers" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Seller Management
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2 mt-2">
          <ShieldCheck className="size-6" /> Seller Verification
        </h1>
      </div>

      {error && <div className="text-[13px] text-red-600">{error}</div>}

      {/* A2 · Seller Verification — KYC filings from seller onboarding */}
      <section className="bg-card border border-border rounded-xl">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Landmark className="size-4 text-muted-foreground" />
          <h2 className="text-[14px] font-semibold">Verification Tasks</h2>
          <span className="text-[12px] text-muted-foreground">{tasks.length} awaiting a decision</span>
        </div>
        {loading ? (
          <div className="px-5 py-6 text-muted-foreground text-[13px]">Loading…</div>
        ) : tasks.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-muted-foreground">
            No verification tasks are waiting. Business verification packets (onboarding Step 4), tax filings (Step 9), and background check authorizations (filed from Health & Compliance) appear here when a seller files them.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {tasks.map(t => (
              <li key={t.id} className="px-5 py-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {sellerLine(t)}
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium">{TASK_LABELS[t.task_type] || t.task_type}</span>
                    <StatusBadge status={t.status} />
                  </div>
                </div>
                <div className="text-[12px] text-muted-foreground">
                  Filed {t.created_at ? new Date(t.created_at).toLocaleString() : '—'}
                  {t.evidence_url && (
                    <>
                      {' · '}
                      <a href={t.evidence_url} target="_blank" rel="noreferrer" className="underline underline-offset-2">Evidence</a>
                    </>
                  )}
                </div>
                {t.notes && (
                  <p className="text-[12px] text-muted-foreground whitespace-pre-line bg-muted/50 rounded-lg px-3 py-2">
                    {t.notes}
                  </p>
                )}
                {decisionControls('task', t.id)}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* B4 · Brand Registry — brand authorization declarations */}
      <section className="bg-card border border-border rounded-xl">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <BadgeCheck className="size-4 text-muted-foreground" />
          <h2 className="text-[14px] font-semibold">Brand Authorizations</h2>
          <span className="text-[12px] text-muted-foreground">{brands.length} awaiting a decision</span>
        </div>
        {loading ? (
          <div className="px-5 py-6 text-muted-foreground text-[13px]">Loading…</div>
        ) : brands.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-muted-foreground">
            No brand authorizations are waiting. When a seller declares a brand they want to sell, the declaration appears here; an approved authorization is what lets them list under that brand.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {brands.map(a => (
              <li key={a.id} className="px-5 py-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {sellerLine(a)}
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium">{a.brand_name}</span>
                    <StatusBadge status={a.status} />
                  </div>
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {AUTH_TYPE_LABELS[a.authorization_type] || a.authorization_type}
                  {' · declared '}
                  {a.created_at ? new Date(a.created_at).toLocaleString() : '—'}
                  {a.evidence_url && (
                    <>
                      {' · '}
                      <a href={a.evidence_url} target="_blank" rel="noreferrer" className="underline underline-offset-2">Evidence</a>
                    </>
                  )}
                </div>
                {decisionControls('brand', a.id)}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recently decided — the desk's own trail (audit rows carry the rest) */}
      {(decidedTasks.length > 0 || decidedBrands.length > 0) && (
        <section className="bg-card border border-border rounded-xl">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold">Recently Decided</h2>
          </div>
          <ul className="divide-y divide-border">
            {decidedTasks.map(t => (
              <li key={`t-${t.id}`} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-[13px]">
                  <span className="font-medium">{TASK_LABELS[t.task_type] || t.task_type}</span>
                  {' — '}
                  {t.seller_display_name || t.seller_legal_name || 'Seller'}
                </div>
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  {t.reviewed_at ? new Date(t.reviewed_at).toLocaleString() : ''}
                  <StatusBadge status={t.status} />
                </div>
              </li>
            ))}
            {decidedBrands.map(a => (
              <li key={`b-${a.id}`} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-[13px]">
                  <span className="font-medium">{a.brand_name}</span>
                  {' — '}
                  {a.seller_display_name || a.seller_legal_name || 'Seller'}
                </div>
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  {a.reviewed_at ? new Date(a.reviewed_at).toLocaleString() : ''}
                  <StatusBadge status={a.status} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
