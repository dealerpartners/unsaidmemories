'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Tag, X, ExternalLink } from 'lucide-react';

// ============================================================================
// B4 · Brand Registry — the registry face over public.brands (401 rows).
// Authorization decisions are recorded at the verification desk
// (/admin/sellers/verification); this page is where a reviewer sees a
// brand's whole recorded state — registry fields, who holds (or has
// requested) authorization to sell it, and its live footprint — before
// deciding or while verifying an opt-out claim.
//
// The opt-out list IS established (public.brand_opt_outs, LIVE via
// migration 20261060): claims filed on the public page (/brand-opt-out)
// are recorded in the registry, and the claims queue below is where they
// are verified and applied. An applied opt-out is enforced at the seller
// brand gate and outranks every seller authorization for the brand.
// ============================================================================

type RegistryRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  pricingTier: string | null;
  wholesaleConfirmed: boolean;
  website: string | null;
  authorizations: { total: number; pending: number; approved: number; rejected: number; expired: number };
  footprint: { listings: number; catalogItems: number };
  optOut: { applied: boolean; strength: string | null; pending: number; recorded: number };
};

type OptOutClaim = {
  id: string;
  brandId: string;
  brandName: string;
  brandSlug: string;
  strength: string;
  status: string;
  claimant: {
    name: string; email: string; phone: string | null; company: string | null;
    isAgent: boolean; representedOwner: string | null;
  };
  trademarkRegistration: string | null;
  attestation: { authority: boolean; accuracy: boolean; signed: boolean };
  claimTicketRef: string | null;
  details: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  appliedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
};

type BrandDetail = {
  brand: {
    id: string; name: string; slug: string; description: string | null;
    website: string | null; pricingTier: string | null; wholesaleConfirmed: boolean;
    status: string; publishedAt: string | null; createdAt: string; updatedAt: string;
  };
  authorizations: {
    id: string; seller: string; sellerStatus: string; sellerType: string;
    authorizationType: string; evidenceUrl: string | null; status: string;
    validFrom: string | null; validUntil: string | null;
    reviewedBy: string | null; reviewedAt: string | null; createdAt: string;
  }[];
  footprint: {
    attribution: string; sameNameBrands: number;
    listings: { id: string; title: string; sku: string; status: string; suppressionReason: string | null; seller: string }[];
    catalogItems: number;
    catalogSample: { name: string; sku: string; active: boolean }[];
  };
  optOut: {
    established: boolean;
    recordedState: string;
    appliedStrength: string | null;
    claims: {
      id: string; strength: string; status: string;
      claimantName: string; claimantEmail: string; claimantCompany: string | null;
      isAgent: boolean; representedOwner: string | null;
      trademarkRegistration: string | null;
      attestation: { authority: boolean; accuracy: boolean; signed: boolean };
      claimTicketRef: string | null;
      verifiedBy: string | null; verifiedAt: string | null;
      appliedAt: string | null; decisionReason: string | null;
      createdAt: string;
    }[];
    note: string;
  };
  decisionsSeat: string;
};

type Any = Record<string, any>;

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300' },
  published: { label: 'Published', cls: 'adm-badge adm-badge-green' },
  suspended: { label: 'Suspended', cls: 'adm-badge adm-badge-red' },
  pending: { label: 'Pending', cls: 'adm-badge adm-badge-amber' },
  approved: { label: 'Approved', cls: 'adm-badge adm-badge-green' },
  rejected: { label: 'Rejected', cls: 'adm-badge adm-badge-red' },
  expired: { label: 'Expired', cls: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
  filed: { label: 'Filed', cls: 'adm-badge adm-badge-amber' },
  pending_review: { label: 'Pending review', cls: 'adm-badge adm-badge-amber' },
  not_submitted: { label: 'Not submitted', cls: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
  verified: { label: 'Verified', cls: 'bg-brand-teal/10 text-brand-teal dark:bg-brand-teal/20 dark:text-brand-teal' },
  applied: { label: 'Applied', cls: 'adm-badge adm-badge-red' },
  withdrawn: { label: 'Withdrawn', cls: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
};

const STRENGTH_LABEL: Record<string, string> = {
  ever: 'Never sell',
  by_approval: 'By approval only',
};

const chip = (status: string) => {
  const m = STATUS_META[status] || STATUS_META.draft;
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
};

const FILTERS = [
  { key: '', label: 'All brands' },
  { key: 'draft', label: 'Draft' },
  { key: 'published', label: 'Published' },
  { key: 'suspended', label: 'Suspended' },
];

export default function BrandRegistryPage() {
  const [rows, setRows] = useState<RegistryRow[]>([]);
  const [summary, setSummary] = useState<{ total: number; byStatus: Record<string, number>; distinctNames: number; duplicateNames: number } | null>(null);
  const [optOutNote, setOptOutNote] = useState<string>('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<BrandDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [claims, setClaims] = useState<OptOutClaim[]>([]);
  const [claimCounts, setClaimCounts] = useState<Record<string, number> | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [claimBusy, setClaimBusy] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  // B4 · Trademark verification (recorded review — no USPTO/external call)
  const [tmData, setTmData] = useState<{ brands: Any[]; claims: Any[]; counts: Record<string, number>; method: string; note: string | null } | null>(null);
  const [tmNotes, setTmNotes] = useState<Record<string, string>>({});
  const [tmRegistrations, setTmRegistrations] = useState<Record<string, string>>({});
  const [tmBusy, setTmBusy] = useState<string | null>(null);
  const [tmError, setTmError] = useState<string | null>(null);
  const [tmBrandPick, setTmBrandPick] = useState('');
  const [tmBrandRegistration, setTmBrandRegistration] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (debounced) params.set('q', debounced);
      const res = await fetch(`/api/admin/brand-registry?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load the registry');
      setRows(json.rows || []);
      setSummary(json.summary || null);
      setOptOutNote(json.optOut?.note || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debounced]);

  useEffect(() => { load(); }, [load]);

  const loadClaims = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/brand-registry/opt-outs');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load opt-out claims');
      setClaims(json.claims || []);
      setClaimCounts(json.counts || null);
    } catch (e) {
      setClaimError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { loadClaims(); }, [loadClaims]);

  const loadTrademark = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/brand-registry/trademark');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load trademark verifications');
      setTmData(json);
    } catch (e) {
      setTmError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { loadTrademark(); }, [loadTrademark]);

  const decideTrademark = async (kind: 'brand' | 'claim', id: string, decision: 'verify' | 'reject') => {
    const notes = (tmNotes[id] || '').trim();
    if (decision === 'reject' && !notes) {
      setTmError('Rejecting a trademark verification requires reviewer notes recording why.');
      return;
    }
    const body: Record<string, string> = {
      action: decision === 'verify' ? (kind === 'brand' ? 'verify_brand' : 'verify_claim') : (kind === 'brand' ? 'reject_brand' : 'reject_claim'),
      id,
    };
    if (notes) body.notes = notes;
    const reg = (tmRegistrations[id] || '').trim();
    if (kind === 'brand' && reg) body.registration = reg;
    setTmBusy(id);
    setTmError(null);
    try {
      const res = await fetch('/api/admin/brand-registry/trademark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Decision failed');
      await loadTrademark();
      await load();
    } catch (e) {
      setTmError(e instanceof Error ? e.message : String(e));
    } finally {
      setTmBusy(null);
    }
  };

  const recordBrandTrademark = async () => {
    if (!tmBrandPick) { setTmError('Choose the brand to record the registration on.'); return; }
    if (!tmBrandRegistration.trim()) { setTmError('A trademark registration number is required before recording.'); return; }
    setTmBusy('brand-record');
    setTmError(null);
    try {
      const res = await fetch('/api/admin/brand-registry/trademark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_brand', id: tmBrandPick, registration: tmBrandRegistration.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Decision failed');
      setTmBrandPick('');
      setTmBrandRegistration('');
      await loadTrademark();
    } catch (e) {
      setTmError(e instanceof Error ? e.message : String(e));
    } finally {
      setTmBusy(null);
    }
  };

  const decideClaim = async (claim: OptOutClaim, action: 'verify' | 'apply' | 'reject' | 'withdraw') => {
    const reason = (rejectReasons[claim.id] || '').trim();
    if (action === 'reject' && !reason) {
      setClaimError('Rejecting a claim requires a decision reason.');
      return;
    }
    setClaimBusy(claim.id);
    setClaimError(null);
    try {
      const res = await fetch('/api/admin/brand-registry/opt-outs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, claim_id: claim.id, reason: reason || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Decision failed');
      await loadClaims();
      await load();
    } catch (e) {
      setClaimError(e instanceof Error ? e.message : String(e));
    } finally {
      setClaimBusy(null);
    }
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/admin/brand-registry/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load brand detail');
      setDetail(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-1 flex items-center gap-2">
        <Tag className="h-5 w-5 text-orange-600" />
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Brand Registry</h1>
      </div>

      <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200">
        <strong>Brand opt-out list: established.</strong> {optOutNote}
      </div>

      <div className="mb-6 rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="mb-1 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
          Opt-out claims queue
          {claimCounts && (
            <span className="ml-2 font-normal text-neutral-500">
              {claimCounts.filed} filed · {claimCounts.verified} verified · {claimCounts.applied} applied
            </span>
          )}
        </h2>
        <p className="mb-3 text-sm text-neutral-500">
          Claims are recorded from the public page and decided here. Applying an opt-out notifies every seller
          holding an approved authorization for the brand — the authorization itself is never altered; the
          brand gate enforces the opt-out above it.
        </p>
        {claimError && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{claimError}</div>}
        {claims.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No claims recorded. A claim whose brand does not resolve against the registry is worked as a
            Support Desk case instead and never appears here.
          </p>
        ) : (
          <div className="space-y-3">
            {claims.map((cl) => (
              <div key={cl.id} className="rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-neutral-900 dark:text-neutral-100">{cl.brandName}</span>
                  <span className="text-xs text-neutral-400">/{cl.brandSlug}</span>
                  {chip(cl.status)}
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                    {STRENGTH_LABEL[cl.strength] || cl.strength}
                  </span>
                  <span className="text-xs text-neutral-400">
                    filed {cl.createdAt.slice(0, 10)}
                    {cl.claimTicketRef && <> · case {cl.claimTicketRef}</>}
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                  {cl.claimant.name} &lt;{cl.claimant.email}&gt;
                  {cl.claimant.company && <> · {cl.claimant.company}</>}
                  {cl.claimant.isAgent && <> · agent for {cl.claimant.representedOwner || 'the brand owner'}</>}
                  {cl.trademarkRegistration && <> · TM {cl.trademarkRegistration}</>}
                </p>
                <p className="mt-0.5 text-xs text-neutral-400">
                  Attested: authority {cl.attestation.authority ? 'yes' : 'NO'} · accuracy {cl.attestation.accuracy ? 'yes' : 'NO'} · signed {cl.attestation.signed ? 'yes' : 'NO'}
                  {cl.verifiedAt && <> · verified {cl.verifiedAt.slice(0, 10)}</>}
                  {cl.appliedAt && <> · applied {cl.appliedAt.slice(0, 10)}</>}
                  {cl.decisionReason && <> · decision: {cl.decisionReason}</>}
                </p>
                {(cl.status === 'filed' || cl.status === 'verified') && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {cl.status === 'filed' && (
                      <button
                        onClick={() => decideClaim(cl, 'verify')}
                        disabled={claimBusy === cl.id}
                        className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
                      >
                        Verify
                      </button>
                    )}
                    {cl.status === 'verified' && (
                      <button
                        onClick={() => decideClaim(cl, 'apply')}
                        disabled={claimBusy === cl.id}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                      >
                        Apply opt-out
                      </button>
                    )}
                    <button
                      onClick={() => decideClaim(cl, 'withdraw')}
                      disabled={claimBusy === cl.id}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
                    >
                      Withdraw
                    </button>
                    <input
                      value={rejectReasons[cl.id] || ''}
                      onChange={(e) => setRejectReasons((r) => ({ ...r, [cl.id]: e.target.value }))}
                      placeholder="Reason (required to reject)"
                      className="w-56 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                    />
                    <button
                      onClick={() => decideClaim(cl, 'reject')}
                      disabled={claimBusy === cl.id}
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-6 rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="mb-1 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
          Trademark verification — recorded review
          {tmData && (
            <span className="ml-2 font-normal text-neutral-500">
              {tmData.counts.pendingReview} awaiting review · {tmData.counts.verified} verified · {tmData.counts.rejected} rejected
            </span>
          )}
        </h2>
        <p className="mb-3 text-sm text-neutral-500">
          A reviewer checks the recorded registration number against the evidence on file and records the decision
          (registration number + reviewer + date) on the brand or claim. <strong>This is a recorded review — no
          USPTO or external registry call is made or implied.</strong>
        </p>
        {tmError && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{tmError}</div>}
        {!tmData ? (
          <p className="text-sm text-neutral-500">Loading trademark verifications… (if this section stays empty, the trademark columns from migration 20261083 may not be applied yet.)</p>
        ) : (
          <>
            {tmData.note && <p className="mb-3 text-sm text-neutral-500">{tmData.note}</p>}
            <div className="space-y-3">
              {tmData.claims.map((cl: Any) => (
                <div key={cl.id} className="rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">{cl.brand_name}</span>
                    <span className="text-xs text-neutral-400">opt-out claim · TM {cl.trademark_registration}</span>
                    {chip(cl.trademark_verification_status)}
                    {cl.trademark_verified_at && (
                      <span className="text-xs text-neutral-400">by {cl.trademark_verified_by || 'reviewer'} · {String(cl.trademark_verified_at).slice(0, 10)}</span>
                    )}
                  </div>
                  {cl.trademark_verification_notes && <p className="mt-1 text-xs text-neutral-500">Reviewer notes: {cl.trademark_verification_notes}</p>}
                  {(cl.trademark_verification_status === 'pending_review' || cl.trademark_verification_status === 'not_submitted') && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input value={tmNotes[cl.id] || ''} onChange={(e) => setTmNotes((n) => ({ ...n, [cl.id]: e.target.value }))}
                        placeholder="Reviewer notes (required to reject)"
                        className="w-64 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
                      <button onClick={() => decideTrademark('claim', cl.id, 'verify')} disabled={tmBusy === cl.id}
                        className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">Mark verified</button>
                      <button onClick={() => decideTrademark('claim', cl.id, 'reject')} disabled={tmBusy === cl.id}
                        className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50">Reject</button>
                    </div>
                  )}
                </div>
              ))}
              {tmData.brands.map((br: Any) => (
                <div key={br.id} className="rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">{br.name}</span>
                    <span className="text-xs text-neutral-400">brand record · TM {br.trademark_registration}</span>
                    {chip(br.trademark_verification_status)}
                    {br.trademark_verified_at && (
                      <span className="text-xs text-neutral-400">by {br.trademark_verified_by || 'reviewer'} · {String(br.trademark_verified_at).slice(0, 10)}</span>
                    )}
                  </div>
                  {br.trademark_verification_notes && <p className="mt-1 text-xs text-neutral-500">Reviewer notes: {br.trademark_verification_notes}</p>}
                  {(br.trademark_verification_status === 'pending_review' || br.trademark_verification_status === 'not_submitted') && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input value={tmNotes[br.id] || ''} onChange={(e) => setTmNotes((n) => ({ ...n, [br.id]: e.target.value }))}
                        placeholder="Reviewer notes (required to reject)"
                        className="w-64 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
                      <button onClick={() => decideTrademark('brand', br.id, 'verify')} disabled={tmBusy === br.id}
                        className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">Mark verified</button>
                      <button onClick={() => decideTrademark('brand', br.id, 'reject')} disabled={tmBusy === br.id}
                        className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50">Reject</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-900">
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Record &amp; verify a registration on a brand:</span>
              <select value={tmBrandPick} onChange={(e) => setTmBrandPick(e.target.value)}
                className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900">
                <option value="">Choose a brand…</option>
                {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <input value={tmBrandRegistration} onChange={(e) => setTmBrandRegistration(e.target.value)}
                placeholder="Trademark registration no."
                className="w-52 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
              <button onClick={recordBrandTrademark} disabled={tmBusy === 'brand-record'}
                className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900">Record &amp; mark verified</button>
            </div>
          </>
        )}
      </div>

      {summary && (
        <div className="mb-4 flex flex-wrap gap-4 text-sm text-neutral-600 dark:text-neutral-300">
          <span><strong className="text-neutral-900 dark:text-neutral-100">{summary.total}</strong> brands registered</span>
          <span>Draft <strong>{summary.byStatus.draft ?? 0}</strong></span>
          <span>Published <strong>{summary.byStatus.published ?? 0}</strong></span>
          <span>Suspended <strong>{summary.byStatus.suspended ?? 0}</strong></span>
          {summary.duplicateNames > 0 && (
            <span>{summary.duplicateNames} rows share a name with another registered brand (footprint below is attributed by brand-name text)</span>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or slug…"
            className="w-64 rounded-lg border border-neutral-300 py-2 pl-9 pr-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`rounded-full px-3 py-1.5 text-sm ${statusFilter === f.key ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'border border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <div className="adm-table-wrap"><table className="adm-table">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-400 dark:border-neutral-800">
              <th className="px-4 py-3">Brand</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Authorizations</th>
              <th className="px-4 py-3">Listings</th>
              <th className="px-4 py-3">Catalog items</th>
              <th className="px-4 py-3">Opt-out</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">Loading the registry…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">No brands match.</td></tr>
            ) : rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => openDetail(r.id)}
                className="cursor-pointer border-b border-neutral-100 hover:bg-neutral-50 dark:border-neutral-900 dark:hover:bg-neutral-900/50"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-neutral-900 dark:text-neutral-100">{r.name}</div>
                  <div className="text-xs text-neutral-400">/{r.slug}{r.pricingTier ? ` · ${r.pricingTier}` : ''}{r.wholesaleConfirmed ? ' · wholesale confirmed' : ''}</div>
                </td>
                <td className="px-4 py-3">{chip(r.status)}</td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">
                  {r.authorizations.total === 0 ? '—' : (
                    <span>
                      {r.authorizations.approved} approved
                      {r.authorizations.pending > 0 && <span className="text-amber-700"> · {r.authorizations.pending} pending</span>}
                      {r.authorizations.rejected > 0 && <span> · {r.authorizations.rejected} rejected</span>}
                      {r.authorizations.expired > 0 && <span> · {r.authorizations.expired} expired</span>}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">{r.footprint.listings || '—'}</td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">{r.footprint.catalogItems || '—'}</td>
                <td className="px-4 py-3 text-neutral-500">
                  {r.optOut.applied
                    ? <span className="font-medium text-red-700">{STRENGTH_LABEL[r.optOut.strength || ''] || r.optOut.strength}</span>
                    : r.optOut.pending > 0
                      ? <span className="text-amber-700">In verification ({r.optOut.pending})</span>
                      : 'None recorded'}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <p className="mt-3 text-xs text-neutral-400">
        Listings and catalog items are attributed by exact brand-name text — neither store carries a brand_id, and
        brands that share a name share the attributed footprint. The registry's stored product_count field is not
        maintained by any writer and is not shown.
      </p>

      {detailLoading && <div className="mt-6 text-sm text-neutral-400">Loading brand record…</div>}

      {detail && (
        <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{detail.brand.name}</h2>
              <p className="text-sm text-neutral-500">
                /{detail.brand.slug} · {chip(detail.brand.status)}
                {detail.brand.website && (
                  <a className="ml-2 inline-flex items-center gap-1 text-orange-700 underline" href={detail.brand.website} target="_blank" rel="noreferrer">
                    website <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </p>
            </div>
            <button onClick={() => setDetail(null)} className="rounded-lg border border-neutral-300 p-1.5 text-neutral-500 dark:border-neutral-700" aria-label="Close brand detail">
              <X className="h-4 w-4" />
            </button>
          </div>

          {detail.brand.description && <p className="mb-4 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{detail.brand.description}</p>}

          <h3 className="mb-2 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            Authorizations ({detail.authorizations.length})
          </h3>
          {detail.authorizations.length === 0 ? (
            <p className="mb-4 text-sm text-neutral-500">
              No seller has declared this brand. Sellers declare brands during onboarding; decisions are recorded at the{' '}
              <a className="text-orange-700 underline" href="/admin/sellers/verification">verification desk</a>.
            </p>
          ) : (
            <div className="mb-4 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
              <div className="adm-table-wrap"><table className="adm-table">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-400 dark:border-neutral-800">
                    <th className="px-3 py-2">Seller</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Validity</th>
                    <th className="px-3 py-2">Reviewed</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.authorizations.map((a) => (
                    <tr key={a.id} className="border-b border-neutral-100 dark:border-neutral-900">
                      <td className="px-3 py-2">
                        <div className="font-medium text-neutral-800 dark:text-neutral-200">{a.seller}</div>
                        <div className="text-xs text-neutral-400">{a.sellerType} · seller {a.sellerStatus}</div>
                      </td>
                      <td className="px-3 py-2 text-neutral-600 dark:text-neutral-300">{a.authorizationType}</td>
                      <td className="px-3 py-2">{chip(a.status)}</td>
                      <td className="px-3 py-2 text-neutral-600 dark:text-neutral-300">
                        {a.validFrom ? `${a.validFrom} → ${a.validUntil || 'open'}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-neutral-600 dark:text-neutral-300">
                        {a.reviewedAt ? `${a.reviewedBy || 'reviewer'} · ${a.reviewedAt.slice(0, 10)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}

          <h3 className="mb-2 text-sm font-semibold text-neutral-800 dark:text-neutral-200">Footprint</h3>
          <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-300">
            {detail.footprint.catalogItems} catalog items and {detail.footprint.listings.length} seller listings carry
            this brand name.
            {detail.footprint.sameNameBrands > 1 && (
              <span> {detail.footprint.sameNameBrands} registered brands share this name, so this footprint is shared between them.</span>
            )}
          </p>
          {detail.footprint.catalogSample.length > 0 && (
            <ul className="mb-4 list-inside list-disc text-sm text-neutral-600 dark:text-neutral-300">
              {detail.footprint.catalogSample.map((ci, i) => (
                <li key={i}>{ci.name} <span className="text-xs text-neutral-400">SKU {ci.sku} · {ci.active ? 'active' : 'inactive'}</span></li>
              ))}
            </ul>
          )}
          {detail.footprint.listings.length > 0 && (
            <ul className="mb-4 list-inside list-disc text-sm text-neutral-600 dark:text-neutral-300">
              {detail.footprint.listings.map((l) => (
                <li key={l.id}>
                  {l.title} <span className="text-xs text-neutral-400">{l.sku} · {l.status} · {l.seller}{l.suppressionReason ? ` · suppressed: ${l.suppressionReason}` : ''}</span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mb-2 text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            Brand opt-out ({detail.optOut.claims.length} recorded)
          </h3>
          <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-300">{detail.optOut.note}</p>
          {detail.optOut.claims.length > 0 && (
            <ul className="mb-4 space-y-1.5 text-sm text-neutral-600 dark:text-neutral-300">
              {detail.optOut.claims.map((cl) => (
                <li key={cl.id}>
                  {chip(cl.status)}{' '}
                  <span className="font-medium">{STRENGTH_LABEL[cl.strength] || cl.strength}</span>
                  {' '}— {cl.claimantName} &lt;{cl.claimantEmail}&gt;
                  {cl.isAgent && <> · agent for {cl.representedOwner || 'the brand owner'}</>}
                  <span className="text-xs text-neutral-400">
                    {' '}· filed {cl.createdAt.slice(0, 10)}
                    {cl.claimTicketRef && <> · case {cl.claimTicketRef}</>}
                    {cl.appliedAt && <> · applied {cl.appliedAt.slice(0, 10)}</>}
                    {cl.decisionReason && <> · {cl.decisionReason}</>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
