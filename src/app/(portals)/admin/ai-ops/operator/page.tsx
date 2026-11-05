'use client';

import { useCallback, useEffect, useState } from 'react';
import { Radar, Play, FolderPlus, ShieldAlert, Eye, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ---------------------------------------------------------------------------
// /admin/ai-ops/operator — the AI operator's surface (§J's deepening).
//
// Sunny's doctrine: the AI is "more than a chat bot" — it scans, detects,
// and responds, and a click executes a governed act. This page is where
// that work happens:
//   · the fraud scanner (run it; detections land with evidence + the
//     policy each one cites),
//   · the governed responses applied BY A HUMAN from a detection (open
//     case, freeze payout, notify, temporary suspension) — consequential
//     acts refuse without a cited policy + reason, enforced server-side,
//   · directed actions: build a category + subcategory, and the
//     high-risk seller file with its acts attached,
//   · the watch: reviews are live scanner signals; social comments are
//     NOT connected — stated plainly, never faked.
// ---------------------------------------------------------------------------

type Citation = { source: string; id: string | null; title: string | null; version: number | null };
type Detection = {
  id: string; subject_type: string | null; subject_id: string | null; state: string;
  created_at: string; signal: string | null; severity: string | null;
  evidence: any; citation: Citation | null; recommended_responses: string[] | null;
  responses_applied: number; seller_name: string | null;
};
type Overview = {
  last_run: { id: string; output: any; created_at: string } | null;
  detections: Detection[];
  counts_by_signal: Array<{ signal: string; state: string; n: number }>;
  citations: { seller_policies: Citation[]; site_policies: Citation[] };
  taxonomy_parents: Array<{ id: string; name: string; path: string; node_type: string; depth: number }>;
  sellers: Array<{ id: string; display_name: string; status: string }>;
  watch: {
    reviews: { state: string; note: string; reviews_last_24h: number };
    social_comments: { state: string; note: string };
  };
};

const SIGNAL_LABELS: Record<string, string> = {
  refund_fraud: 'Fraud-coded refund',
  dispute_open: 'Open dispute / chargeback',
  order_sla: 'Order SLA / stuck',
  dmca_repeat: 'Repeat DMCA subject (3 strikes)',
  optout_listing: 'Listing under an applied brand opt-out',
  review_burst: 'Review burst pattern',
  seller_risk: 'Seller risk composite',
};

const RESPONSE_LABELS: Record<string, string> = {
  open_case: 'Open a case',
  freeze_payout: 'Freeze the payout (via the case)',
  notify: 'Send a notification',
  suspend_seller_temporary: 'Temporarily suspend the seller',
};

function severityVariant(s: string | null): 'destructive' | 'secondary' | 'outline' {
  if (s === 'high') return 'destructive';
  if (s === 'medium') return 'secondary';
  return 'outline';
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}

function post(path: string, body: unknown) {
  return api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export default function AiOpsOperatorPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api('/api/admin/ai-ops/operator')
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const allCitations: Citation[] = data
    ? [...data.citations.seller_policies, ...data.citations.site_policies]
    : [];

  async function runScan() {
    setScanning(true);
    setNotice(null);
    try {
      const r = await post('/api/admin/ai-ops/operator', { act: 'run_scan' });
      const errs = r.detector_errors ? Object.entries(r.detector_errors) : [];
      setNotice(
        `Scan complete: ${r.detections_created} new detection(s), ${r.skipped_duplicates} already open.` +
          (errs.length ? ` Detector errors: ${errs.map(([k, v]) => `${k}: ${v}`).join('; ')}` : ''),
      );
      load();
    } catch (e: any) {
      setNotice(`Scan failed: ${e.message}`);
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Radar className="size-6" /> The Operator
          </h1>
        </div>
        <Button onClick={runScan} disabled={scanning || loading}>
          <Play className="size-4 mr-2" /> {scanning ? 'Scanning…' : 'Run fraud scan'}
        </Button>
      </div>

      {notice && (
        <div className="bg-card border border-border rounded-xl px-4 py-3 text-[13px] text-foreground">{notice}</div>
      )}
      {error && (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <p className="text-[14px] font-medium text-foreground">Could not load the operator.</p>
          <p className="text-[13px] text-muted-foreground mt-1">{error}</p>
        </div>
      )}

      {loading && !data ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : data ? (
        <>
          {/* ---- last run + watch ---- */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <Radar className="size-4" /> Last scan run
              </p>
              {data.last_run ? (
                <div className="mt-2 text-[13px] space-y-1">
                  <p>{new Date(data.last_run.created_at).toLocaleString()}</p>
                  <p className="text-muted-foreground">
                    {data.last_run.output?.detections_created ?? 0} new · {data.last_run.output?.skipped_duplicates ?? 0} already open
                  </p>
                  {data.last_run.output?.by_signal && (
                    <p className="text-muted-foreground">
                      {Object.entries(data.last_run.output.by_signal).map(([k, v]) => `${SIGNAL_LABELS[k] ?? k}: ${v}`).join(' · ')}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-[13px] text-muted-foreground">No scan has run yet. Run one — detections land below.</p>
              )}
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <Eye className="size-4" /> Watch — reviews
              </p>
              <p className="mt-2 text-[13px]">
                <Badge variant="secondary">live</Badge>{' '}
                <span className="text-muted-foreground">{data.watch.reviews.reviews_last_24h} review(s) in the last 24h.</span>
              </p>
              <p className="text-[13px] text-muted-foreground mt-1">{data.watch.reviews.note}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <Eye className="size-4" /> Watch — social comments
              </p>
              <p className="mt-2 text-[13px]">
                <Badge variant="outline">not connected</Badge>
              </p>
              <p className="text-[13px] text-muted-foreground mt-1">{data.watch.social_comments.note}</p>
            </div>
          </div>

          {/* ---- detections ---- */}
          <section className="space-y-3">
            <h2 className="text-[15px] font-semibold text-foreground flex items-center gap-2">
              <ShieldAlert className="size-4" /> Detections
              <span className="text-muted-foreground font-normal text-[13px]">
                ({data.detections.length} open — each rests on the evidence shown; nothing here is inferred)
              </span>
            </h2>
            {data.detections.length === 0 ? (
              <div className="bg-card border border-border rounded-xl text-center text-[13px] text-muted-foreground">
                No open detections. The scanner finds what the recorded facts support — an empty list here means
                the current facts raise no signal, not that the scanner is off.
              </div>
            ) : (
              data.detections.map((d) => (
                <DetectionCard key={d.id} d={d} citations={allCitations} onDone={load} setNotice={setNotice} />
              ))
            )}
          </section>

          {/* ---- directed actions ---- */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CategoryBuilder parents={data.taxonomy_parents} onDone={load} setNotice={setNotice} />
          </section>

          {/* ---- seller risk files ---- */}
          <SellerRiskFiles sellers={data.sellers} citations={allCitations} setNotice={setNotice} />
        </>
      ) : null}
    </div>
  );
}

function DetectionCard({
  d, citations, onDone, setNotice,
}: {
  d: Detection;
  citations: Citation[];
  onDone: () => void;
  setNotice: (s: string) => void;
}) {
  const recommended = d.recommended_responses ?? [];
  const kinds = Array.from(new Set([...recommended, 'freeze_payout', 'notify']));
  const [kind, setKind] = useState(kinds[0] ?? 'notify');
  const [audience, setAudience] = useState('seller');
  const [reason, setReason] = useState('');
  const [caseId, setCaseId] = useState('');
  const ownCitation = d.citation && d.citation.id ? JSON.stringify(d.citation) : '';
  const [citation, setCitation] = useState(ownCitation);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const subjectLabel =
    d.subject_type === 'seller'
      ? `Seller — ${d.seller_name ?? d.subject_id}`
      : d.subject_type === 'order'
        ? `Order ${d.evidence?.order_number ?? d.evidence?.order_id ?? ''}`
        : d.subject_type === 'refund'
          ? `Refund ${d.subject_id ?? ''}`
          : d.subject_type === 'dispute'
            ? `Dispute ${d.evidence?.dispute_number ?? d.subject_id ?? ''}`
            : d.subject_type === 'listing'
              ? `Listing — ${d.evidence?.title ?? d.subject_id ?? ''}`
              : `${d.subject_type ?? 'subject'} ${d.subject_id ?? ''}`;

  async function apply() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await post('/api/admin/ai-ops/operator/respond', {
        task_id: d.id,
        response: kind,
        reason,
        citation: citation ? JSON.parse(citation) : undefined,
        case_id: caseId || undefined,
        audience: kind === 'notify' ? audience : undefined,
      });
      setMsg(
        `Applied: ${RESPONSE_LABELS[kind] ?? kind}` +
          (r.case_id ? ` · case ${r.case_id}` : '') +
          (typeof r.notified === 'number' ? ` · ${r.notified} notification(s)` : '') +
          (r.seller_status ? ` · seller now ${r.seller_status}` : ''),
      );
      setNotice('');
      onDone();
    } catch (e: any) {
      setMsg(`Refused: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[14px] font-semibold text-foreground">{SIGNAL_LABELS[d.signal ?? ''] ?? d.signal}</p>
        <Badge variant={severityVariant(d.severity)}>{d.severity ?? '—'}</Badge>
        <Badge variant="outline">{d.state}</Badge>
        {d.responses_applied > 0 && <Badge variant="secondary">{d.responses_applied} response(s) applied</Badge>}
        <span className="text-[12px] text-muted-foreground ml-auto">{new Date(d.created_at).toLocaleString()}</span>
      </div>
      <p className="text-[13px] text-foreground">{subjectLabel}</p>
      <p className="text-[13px] text-muted-foreground">
        Cites: {d.citation?.title ?? d.citation?.source ?? '—'}
        {d.citation?.version ? ` (v${d.citation.version})` : ''}
        {d.citation?.id ? '' : ' — no recorded policy resolved for this signal yet; a consequential response needs one selected below.'}
      </p>
      <details>
        <summary className="text-[12px] text-muted-foreground cursor-pointer">Evidence (the recorded facts this detection rests on)</summary>
        <pre className="mt-2 text-[11px] bg-muted/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(d.evidence ?? {}, null, 2)}
        </pre>
      </details>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[12px]">Response</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {kinds.map((k) => (
                <SelectItem key={k} value={k}>{RESPONSE_LABELS[k] ?? k}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[12px]">Cited policy (required for case / freeze / suspension)</Label>
          <Select value={citation || 'none'} onValueChange={(v) => setCitation(v === 'none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Select a recorded policy" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— none —</SelectItem>
              {citations.map((c) => (
                <SelectItem key={`${c.source}:${c.id}`} value={JSON.stringify(c)}>
                  {c.title} ({c.source === 'seller_policies' ? 'seller policy' : 'site policy'}{c.version ? ` v${c.version}` : ''})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {kind === 'notify' && (
          <div className="space-y-1">
            <Label className="text-[12px]">Notify audience</Label>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="seller">The seller</SelectItem>
                <SelectItem value="staff">Owner / staff</SelectItem>
                <SelectItem value="customer">The customer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {kind === 'freeze_payout' && (
          <div className="space-y-1">
            <Label className="text-[12px]">Case id (blank = the case this detection opened)</Label>
            <Input value={caseId} onChange={(e) => setCaseId(e.target.value)} placeholder="seller_disputes id" />
          </div>
        )}
        <div className="space-y-1 md:col-span-2">
          <Label className="text-[12px]">Reason (required — recorded on the act)</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Why this response, in the record's words" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={apply} disabled={busy}>{busy ? 'Applying…' : 'Apply response'}</Button>
        {msg && <p className="text-[12px] text-muted-foreground">{msg}</p>}
      </div>
    </div>
  );
}

function CategoryBuilder({
  parents, onDone, setNotice,
}: {
  parents: Overview['taxonomy_parents'];
  onDone: () => void;
  setNotice: (s: string) => void;
}) {
  const [parentId, setParentId] = useState('');
  const [name, setName] = useState('');
  const [sub, setSub] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function build() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await post('/api/admin/ai-ops/operator/actions', {
        act: 'create_category', name, parent_id: parentId, subcategory_name: sub || undefined,
      });
      setMsg(`Built ${r.category.path}${r.subcategory ? ` + ${r.subcategory.path}` : ''} (task ${r.task_id}).`);
      setName('');
      setSub('');
      onDone();
    } catch (e: any) {
      setMsg(`Refused: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-3">
      <p className="text-[14px] font-semibold text-foreground flex items-center gap-2">
        <FolderPlus className="size-4" /> Directed action — build a category
      </p>
      <p className="text-[13px] text-muted-foreground">
        Builds on the canonical taxonomy (taxonomy_nodes). Pick a department to land a category — add the
        subcategory name and both are built in the same act. The act is recorded and audited.
      </p>
      <div className="space-y-1">
        <Label className="text-[12px]">Build under</Label>
        <Select value={parentId} onValueChange={setParentId}>
          <SelectTrigger><SelectValue placeholder="Animal, department, or category" /></SelectTrigger>
          <SelectContent>
            {parents.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.path} ({p.node_type})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[12px]">New node name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Probiotics" />
        </div>
        <div className="space-y-1">
          <Label className="text-[12px]">Subcategory name (optional)</Label>
          <Input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="e.g. Digestive chews" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={build} disabled={busy || !parentId || !name.trim()}>{busy ? 'Building…' : 'Build it'}</Button>
        {msg && <p className="text-[12px] text-muted-foreground">{msg}</p>}
      </div>
    </div>
  );
}

function SellerRiskFiles({
  sellers, citations, setNotice,
}: {
  sellers: Overview['sellers'];
  citations: Citation[];
  setNotice: (s: string) => void;
}) {
  const [sellerId, setSellerId] = useState('');
  const [file, setFile] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [act, setAct] = useState('open_case');
  const [reason, setReason] = useState('');
  const [citation, setCitation] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function loadFile(id: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api(`/api/admin/ai-ops/operator/sellers/${id}`);
      setFile(r.risk_file);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function applyAct() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await post(`/api/admin/ai-ops/operator/sellers/${sellerId}`, {
        act, reason, citation: citation ? JSON.parse(citation) : undefined,
      });
      setMsg(`Applied: ${act}${r.case_id ? ` · case ${r.case_id}` : ''}${r.seller_status ? ` · seller now ${r.seller_status}` : ''}.`);
      loadFile(sellerId);
    } catch (e: any) {
      setMsg(`Refused: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function reinstate(caseId: string) {
    setBusy(true);
    setMsg(null);
    try {
      await post(`/api/admin/ai-ops/operator/sellers/${sellerId}`, {
        act: 'reinstate', case_id: caseId, reason: reason || 'Reviewed — temporary suspension lifted from the risk file.',
      });
      setMsg('Suspension lifted; the seller is approved again and was notified.');
      loadFile(sellerId);
    } catch (e: any) {
      setMsg(`Refused: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  const s = file?.seller;

  return (
    <section className="space-y-3">
      <h2 className="text-[15px] font-semibold text-foreground flex items-center gap-2">
        <ShieldAlert className="size-4" /> High-risk seller files
        <span className="text-muted-foreground font-normal text-[13px]">(one assembled view — cases, violations, KPI facts, opt-out attempts — with the governed acts attached)</span>
      </h2>
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 min-w-64">
            <Label className="text-[12px]">Seller</Label>
            <Select value={sellerId} onValueChange={(v) => { setSellerId(v); setFile(null); }}>
              <SelectTrigger><SelectValue placeholder="Choose a seller" /></SelectTrigger>
              <SelectContent>
                {sellers.map((x) => (
                  <SelectItem key={x.id} value={x.id}>{x.display_name} — {x.status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={() => sellerId && loadFile(sellerId)} disabled={busy || !sellerId}>
            <RefreshCw className="size-4 mr-2" /> Open the file
          </Button>
          {msg && <p className="text-[12px] text-muted-foreground">{msg}</p>}
        </div>

        {file && s && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <p className="text-[14px] font-semibold">{s.display_name}</p>
              <Badge variant={s.status === 'suspended' ? 'destructive' : 'secondary'}>{s.status}</Badge>
              <Badge variant="outline">{s.seller_type}</Badge>
              {file.capabilities?.pro_tier && <Badge variant="outline">pro tier: {file.capabilities.pro_tier}</Badge>}
              <span className="text-[12px] text-muted-foreground">
                payout delay policy: {file.payout_delay_policy?.length ? file.payout_delay_policy.map((p: any) => `${p.key}=${p.value}`).join(' · ') : 'not configured'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[13px]">
              <FactBlock title="Cases (seller_disputes)" empty="No cases on record.">
                {file.cases.map((k: any) => (
                  <div key={k.id} className="border-b border-border/60 pb-2 mb-2 last:border-0">
                    <p>{k.dispute_type} — <span className="font-medium">{k.status ?? 'open'}</span></p>
                    {k.temporary_suspension && (
                      <p className="text-muted-foreground">
                        Temporary suspension: {k.temporary_suspension.state}
                        {k.temporary_suspension.state === 'active' && (
                          <Button size="sm" variant="outline" className="ml-2" disabled={busy} onClick={() => reinstate(k.id)}>
                            Lift suspension
                          </Button>
                        )}
                      </p>
                    )}
                  </div>
                ))}
              </FactBlock>
              <FactBlock title="Violations" empty="No violations on record.">
                {file.violations.map((v: any) => (
                  <p key={v.id}>{v.violation_type} · {v.severity} · {v.status}</p>
                ))}
                <p className="text-muted-foreground mt-1">
                  Appeals: {file.appeals_by_status.map((a: any) => `${a.status} ${a.n}`).join(' · ') || 'none'} ·
                  Investigations: {file.investigations_by_status.map((a: any) => `${a.status} ${a.n}`).join(' · ') || 'none'}
                </p>
              </FactBlock>
              <FactBlock title="Money & catalog facts" empty="No recorded facts.">
                <p>Returns: {file.returns_by_status.map((a: any) => `${a.status} ${a.n}`).join(' · ') || 'none'}</p>
                <p>Refunds: {file.refunds_by_status.map((a: any) => `${a.status} ${a.n} ($${Number(a.total).toFixed(2)})`).join(' · ') || 'none'}</p>
                <p>Listings: {file.listings_by_status.map((a: any) => `${a.status} ${a.n}`).join(' · ') || 'none'}</p>
                <p>Brand authorizations: {file.brand_authorizations_by_status.map((a: any) => `${a.status} ${a.n}`).join(' · ') || 'none'}</p>
                {file.optout_flagged_listings.length > 0 && (
                  <p className="text-destructive">
                    {file.optout_flagged_listings.length} listing(s) live under an applied brand opt-out.
                  </p>
                )}
              </FactBlock>
              <FactBlock title="KPI facts (latest per key)" empty="No KPI facts recorded.">
                {file.kpi_facts.map((f: any) => (
                  <p key={f.metric_key}>{f.metric_key}: {f.value}</p>
                ))}
                {file.kpi_snapshots.map((f: any) => (
                  <p key={f.kpi_key} className="text-muted-foreground">{f.kpi_key}: {f.value} ({f.snapshot_date})</p>
                ))}
              </FactBlock>
              <FactBlock title="Operator detections" empty="No detections for this seller.">
                {file.operator_detections.map((t: any) => (
                  <p key={t.id}>{t.signal ?? '—'} · {t.severity ?? '—'} · {t.state}</p>
                ))}
              </FactBlock>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-border pt-4">
              <div className="space-y-1">
                <Label className="text-[12px]">Governed act</Label>
                <Select value={act} onValueChange={setAct}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open_case">Open a case</SelectItem>
                    <SelectItem value="suspend_seller_temporary">Temporarily suspend</SelectItem>
                    <SelectItem value="notify">Notify the seller</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[12px]">Cited policy (required for case / suspension)</Label>
                <Select value={citation || 'none'} onValueChange={(v) => setCitation(v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select a recorded policy" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— none —</SelectItem>
                    {citations.map((c) => (
                      <SelectItem key={`${c.source}:${c.id}`} value={JSON.stringify(c)}>
                        {c.title} ({c.source === 'seller_policies' ? 'seller policy' : 'site policy'}{c.version ? ` v${c.version}` : ''})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[12px]">Reason (required)</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Recorded on the act" />
              </div>
            </div>
            <Button size="sm" onClick={applyAct} disabled={busy}>Apply the act</Button>
          </div>
        )}
      </div>
    </section>
  );
}

function FactBlock({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const isEmpty = !children || (Array.isArray(children) && children.every((x) => !x || (Array.isArray(x) && x.length === 0)));
  return (
    <div className="border border-border rounded-lg p-3">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</p>
      {isEmpty ? <p className="text-muted-foreground">{empty}</p> : children}
    </div>
  );
}
