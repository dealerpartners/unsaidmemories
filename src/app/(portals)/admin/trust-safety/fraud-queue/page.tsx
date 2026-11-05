'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Radar, ArrowLeft, ExternalLink } from 'lucide-react';
import TrustSafetyNav from '@/components/admin/TrustSafetyNav';

// F1 · Fraud queue — the operator's fraud detections (ai_tasks,
// function='fraud_scan') homed inside Trust & Safety, with the
// governance cases their responses opened. The records are the SAME
// ones the AI Ops operator desk reads — this page forks nothing.
// Governed responses (open case, freeze, notify, suspend) are applied
// at the operator desk; this queue links there.
type Detection = {
  id: string;
  signal: string | null;
  severity: string | null;
  state: string;
  subject_type: string;
  seller_name: string | null;
  evidence: Record<string, unknown> | null;
  citation: { title?: string } | null;
  responses_applied: number;
  cases: Array<{ id: string; status: string; dispute_type: string | null }>;
  created_at: string;
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'adm-badge adm-badge-red',
  high: 'bg-orange-100 text-orange-700',
  medium: 'adm-badge adm-badge-amber',
  low: 'bg-green-100 text-green-700',
};

const STATE_STYLES: Record<string, string> = {
  proposed: 'adm-badge adm-badge-amber',
  applied: 'bg-green-100 text-green-700',
  dismissed: 'bg-muted text-muted-foreground',
  recorded: 'bg-muted text-muted-foreground',
};

export default function FraudQueuePage() {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState<string>('open');

  useEffect(() => {
    fetch('/api/admin/trust-safety/fraud-queue')
      .then((r) => (r.ok ? r.json() : { detections: [] }))
      .then((j) => setDetections((j.detections || []) as Detection[]))
      .catch(() => setDetections([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = detections.filter((d) => {
    if (stateFilter === 'open') return d.state === 'proposed' || d.state === 'applied';
    if (stateFilter !== 'all') return d.state === stateFilter;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/trust-safety" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="size-3.5" /> Trust & Safety
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Radar className="size-6" /> Fraud Queue
        </h1>
      </div>

      <TrustSafetyNav />

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-[13px] bg-card cursor-pointer"
        >
          <option value="open">Open (proposed + applied)</option>
          <option value="proposed">Proposed</option>
          <option value="applied">Applied</option>
          <option value="dismissed">Dismissed</option>
          <option value="all">All states</option>
        </select>
        <Link
          href="/admin/ai-ops/operator"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"
        >
          Open the operator desk <ExternalLink className="size-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Radar className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground mt-3">No fraud detections in this view</p>
          <p className="text-[13px] text-muted-foreground mt-1">
            When the operator&apos;s scanner finds fraud signals — fraud-coded refunds, DMCA repeats,
            review bursts, seller-risk composites — they will queue here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => (
            <div key={d.id} className="bg-card border border-border rounded-xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-foreground">
                      {(d.signal || 'fraud_signal').replace(/_/g, ' ')}
                    </span>
                    {d.severity && (
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${SEVERITY_STYLES[d.severity] || 'bg-muted text-muted-foreground'}`}>
                        {d.severity}
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${STATE_STYLES[d.state] || 'bg-muted text-muted-foreground'}`}>
                      {d.state}
                    </span>
                  </div>
                  <p className="text-[13px] text-muted-foreground mt-1.5">
                    {d.subject_type}
                    {d.seller_name ? ` · Seller: ${d.seller_name}` : ''}
                    {' · '}Detected {new Date(d.created_at).toLocaleDateString()}
                    {d.citation?.title ? ` · Cites: ${d.citation.title}` : ''}
                  </p>
                  {d.evidence && (
                    <p className="text-[12px] text-muted-foreground mt-2 font-mono break-all">
                      {JSON.stringify(d.evidence).slice(0, 280)}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12px] text-muted-foreground">
                    {d.responses_applied} response{d.responses_applied === 1 ? '' : 's'} applied
                  </p>
                  {d.cases.length > 0 ? (
                    <ul className="mt-1 space-y-0.5">
                      {d.cases.map((cs) => (
                        <li key={cs.id} className="text-[12px]">
                          Case <span className="font-mono">{cs.id.slice(0, 8)}…</span>{' '}
                          <span className="capitalize">{(cs.dispute_type || 'case').replace(/_/g, ' ')}</span>{' '}
                          · {cs.status}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[12px] text-muted-foreground mt-1">No case opened yet</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
