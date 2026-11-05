'use client';

// Data Management (Master Tree 1.22) — in-module surface on the
// Customers directory: duplicate detection with merge, and the
// missing-contact-info list. Everything here runs the SAME handlers
// the Automation Center uses (sys_run_duplicate_detection,
// crm_merge_customer, sys_run_missing_contact_info) — no second
// implementation. Clusters come from the real email-cluster SQL;
// members are resolved through /api/admin/search (real rows), and
// Merge fires the real merge action (pets/appointments/notes/
// messages/documents reassigned, source archived with
// merged_into_customer_id).

import React, { useState } from 'react';
import { CopyCheck, UserX, X } from 'lucide-react';
import {
  useRunDuplicateDetection,
  useDismissDuplicateCandidate,
  useRunMissingContactInfo,
  useMergeCustomer,
} from '@/hooks/admin/useActions';

interface Candidate {
  id: string;
  record_a: string;
  record_b: string;
  a_name: string | null;
  b_name: string | null;
  email: string | null;
  created_at: string;
}

interface ClusterMember {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
}

interface Cluster {
  email: string;
  members: ClusterMember[];
}

export const DataManagementPanel: React.FC = () => {
  const dupDetect = useRunDuplicateDetection();
  const dismissCandidate = useDismissDuplicateCandidate();
  const missingInfo = useRunMissingContactInfo();
  const mergeCustomer = useMergeCustomer();

  const [open, setOpen] = useState(false);
  const [clusters, setClusters] = useState<Cluster[] | null>(null);
  // Persisted candidate worklist (§1.22.1) — crm_duplicate_candidates
  // rows read back from the detection run's response.
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [missing, setMissing] = useState<{ id: string; name: string; missing: string[] }[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const findDuplicates = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res: any = await dupDetect.mutateAsync({});
      const raw: { email: string; cnt: string }[] = Array.isArray(res?.duplicates) ? res.duplicates : [];
      const resolved: Cluster[] = [];
      for (const c of raw) {
        const r = await fetch(`/api/admin/search?q=${encodeURIComponent(c.email)}&type=customers&limit=20`);
        const j = await r.json().catch(() => ({}));
        const members: ClusterMember[] = (Array.isArray(j?.data) ? j.data : [])
          .filter((m: any) => String(m.email || '').toLowerCase() === c.email.toLowerCase())
          .map((m: any) => ({
            id: m.id,
            name: `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || m.id,
            email: m.email,
            createdAt: m.created_at,
          }));
        if (members.length > 1) resolved.push({ email: c.email, members });
      }
      setClusters(resolved);
      setCandidates(Array.isArray(res?.candidates) ? res.candidates : []);
      setStatus(resolved.length ? `Found ${resolved.length} duplicate email cluster(s) — ${res?.persisted ?? 0} new candidate pair(s) saved.` : 'No duplicate customers found.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Duplicate detection failed.');
    } finally {
      setBusy(false);
    }
  };

  const dismiss = (candidateId: string) => {
    dismissCandidate.mutate(
      { candidate_id: candidateId } as never,
      {
        onSuccess: () => {
          setCandidates((prev) => (prev ? prev.filter((c) => c.id !== candidateId) : prev));
          setStatus('Candidate dismissed — detection will not resurface this pair.');
        },
        onError: (err: any) => setStatus(err?.message || 'Dismiss failed — nothing changed.'),
      },
    );
  };

  const findMissing = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res: any = await missingInfo.mutateAsync({});
      setMissing(Array.isArray(res?.customers) ? res.customers : []);
      // The run also persists the worklist as open crm_tasks (§1.22.4).
      if (typeof res?.worklistPersisted === 'number') {
        setStatus(res.worklistPersisted > 0 ? `${res.worklistPersisted} new follow-up task(s) saved to the worklist.` : 'Worklist already up to date — no new tasks.');
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Missing-contact lookup failed.');
    } finally {
      setBusy(false);
    }
  };

  const merge = (cluster: Cluster, sourceId: string, targetId: string) => {
    mergeCustomer.mutate(
      { source_id: sourceId, target_id: targetId } as never,
      {
        onSuccess: () => {
          setStatus('Customers merged — records reassigned to the kept customer.');
          void findDuplicates();
        },
        onError: (err: any) => setStatus(err?.message || 'Merge failed — nothing changed.'),
      },
    );
  };

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background hover:bg-accent h-9 px-3 text-[12px] font-medium text-foreground transition-colors cursor-pointer"
        >
          <CopyCheck className="size-3.5" />
          <span>Data Management</span>
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Data Management</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Close data management">
          <X className="size-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={findDuplicates}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 text-[12px] font-medium disabled:opacity-50 cursor-pointer"
        >
          <CopyCheck className="size-3.5" /> Find Duplicates
        </button>
        <button
          type="button"
          onClick={findMissing}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background hover:bg-accent h-8 px-3 text-[12px] font-medium text-foreground disabled:opacity-50 cursor-pointer"
        >
          <UserX className="size-3.5" /> Missing Contact Info
        </button>
        {status && <span className="text-[12px] text-muted-foreground">{status}</span>}
      </div>

      {clusters !== null && (
        <div className="space-y-3">
          {clusters.map((cluster) => (
            <div key={cluster.email} className="rounded-lg border border-border/70 p-3">
              <div className="text-[12px] font-semibold text-foreground mb-2">
                {cluster.email} — {cluster.members.length} records
              </div>
              <div className="space-y-1.5">
                {cluster.members.map((m, i) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate">
                      <span className="font-medium text-foreground">{m.name}</span>
                      <span className="text-muted-foreground"> · {m.id.slice(0, 8)}…{m.createdAt ? ` · since ${new Date(m.createdAt).toLocaleDateString()}` : ''}</span>
                    </span>
                    {i === 0 ? (
                      <span className="shrink-0 text-[11px] font-semibold text-success">KEPT</span>
                    ) : (
                      <button
                        type="button"
                        disabled={mergeCustomer.isPending}
                        onClick={() => merge(cluster, m.id, cluster.members[0].id)}
                        className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] font-medium hover:bg-accent disabled:opacity-50 cursor-pointer"
                      >
                        Merge into kept
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {candidates !== null && candidates.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[12px] font-semibold text-foreground">Candidate pairs on file ({candidates.length})</div>
          {candidates.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2 py-1.5 text-[12px]">
              <span className="truncate">
                <span className="font-medium text-foreground">{c.a_name || c.record_a.slice(0, 8)}</span>
                <span className="text-muted-foreground"> ↔ </span>
                <span className="font-medium text-foreground">{c.b_name || c.record_b.slice(0, 8)}</span>
                {c.email ? <span className="text-muted-foreground"> · {c.email}</span> : null}
              </span>
              <button
                type="button"
                disabled={dismissCandidate.isPending}
                onClick={() => dismiss(c.id)}
                className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] font-medium hover:bg-accent disabled:opacity-50 cursor-pointer"
              >
                Not duplicates
              </button>
            </div>
          ))}
        </div>
      )}

      {missing !== null && (
        <div className="space-y-1.5">
          <div className="text-[12px] font-semibold text-foreground">{missing.length} customer(s) missing contact info</div>
          {missing.map((r) => (
            <a
              key={r.id}
              href={`/admin/customers?customer_id=${r.id}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2 py-1.5 text-[12px] hover:bg-accent"
            >
              <span className="font-medium truncate">{r.name}</span>
              <span className="text-muted-foreground shrink-0">missing: {r.missing.join(', ')}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
