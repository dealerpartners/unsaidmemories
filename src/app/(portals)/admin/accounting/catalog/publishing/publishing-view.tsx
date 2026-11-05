'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Calculator, FolderArchive, Plus } from 'lucide-react';

// /admin/accounting/catalog/publishing — Product Design & Publishing
// (owner's product_design_publishing.html), the accounting view: what
// the studio has published, what each design sells for, what the
// supplier charges for it, and the margin between the two.
//
// CP2 adds the pre-publish pipeline above the publications table:
// design projects with a stage derived server-side by
// GET /api/admin/accounting/catalog-publishing. The stage tabs are
// REAL ROUTES (this index = All Projects; /publishing/[stage] for
// each stage) — never query-param view switching.
//
// CP3 adds the Publishing Inspector: selecting a project row opens a
// panel fed by GET /api/admin/designs/[id]/review (the real
// preflight result — the readiness checklist renders the issues the
// preflight actually returns, nothing invented) and
// GET /api/admin/designs/[id] (print files of record, publications).
// Lifecycle actions (submit / approve / publish / unpublish) POST to
// the review endpoint one at a time — never chained — and the
// endpoint's error responses surface verbatim. After a successful
// action the pipeline is re-fetched: server state is the truth.
//
// CP4 adds the header actions: New Product Design (link to the
// existing Studio wizard at /admin/studio/new-design — no duplicate
// create form), CAD Spec Vault and BOM Cost Rollup (real routes
// under this page: /publishing/vault, /publishing/costing).

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

type Pub = {
  id: string; status: string; publishedAt: string | null; designName: string;
  productName: string | null; variantSku: string | null; collectionName: string | null;
  supplierName: string | null; catalogName: string | null;
  retail: number | null; supplierCost: number | null; margin: number | null;
};

type Project = {
  id: string; name: string; status: string; stage: StageKey | 'published' | null;
  supplierName: string | null; catalogName: string | null; collectionName: string | null;
  retail: number | null; supplierCost: number | null; margin: number | null;
  hasPrintFile: boolean; printDpi: number | null; updatedAt: string | null;
};

// — Publishing Inspector payloads (mirror the server shapes) —
// PreflightResult from src/lib/fabric/preflight.ts: the preflight
// returns issues (errors/warnings), not a named pass/fail checklist;
// the inspector renders exactly what it returns.
type PreflightIssue = { level: 'error' | 'warning'; surface: string | null; message: string };
type Preflight = { ok: boolean; errors: PreflightIssue[]; warnings: PreflightIssue[] };
type ReviewData = { status: string; preflight: Preflight };
type PrintFile = {
  id: string; placement: string; file_url: string;
  width_px: number; height_px: number; dpi: number; version: number;
};
type DesignPublication = {
  id: string; product_variant_id: string | null; collection_id: string | null;
  status: string; published_at: string | null;
};
type DesignDetailData = {
  design: {
    product_title: string | null; retail_price: number | null;
    print_file_path: string | null; supplier_catalog_product_id: string | null;
  };
  publications: DesignPublication[];
  printFiles: PrintFile[];
};
type ActionError = { status: number; message: string; preflight: Preflight | null };
type LifecycleAction = 'submit' | 'approve' | 'publish' | 'unpublish';

export type StageKey = 'concept' | 'sourcing' | 'prototype' | 'ready';
export type StageFilter = 'all' | StageKey;
export const STAGE_KEYS: StageKey[] = ['concept', 'sourcing', 'prototype', 'ready'];

const STAGE_TABS: { key: StageFilter; label: string; href: string }[] = [
  { key: 'all', label: 'All Projects', href: '/admin/accounting/catalog/publishing' },
  { key: 'concept', label: 'Concept & CAD', href: '/admin/accounting/catalog/publishing/concept' },
  { key: 'sourcing', label: 'Material Sourcing', href: '/admin/accounting/catalog/publishing/sourcing' },
  { key: 'prototype', label: 'Prototype Testing', href: '/admin/accounting/catalog/publishing/prototype' },
  { key: 'ready', label: 'Ready to Publish', href: '/admin/accounting/catalog/publishing/ready' },
];

const STAGE_LABELS: Record<string, string> = {
  concept: 'Concept & CAD',
  sourcing: 'Material Sourcing',
  prototype: 'Prototype Testing',
  ready: 'Ready to Publish',
  published: 'Published',
};

type StageCounts = { all: number; concept: number; sourcing: number; prototype: number; ready: number };
const EMPTY_COUNTS: StageCounts = { all: 0, concept: 0, sourcing: 0, prototype: 0, ready: 0 };

const TABS = [
  { key: 'all', label: 'All Publications' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Drafts' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function PublishingView({ stage }: { stage: StageFilter }) {
  const [pubs, setPubs] = useState<Pub[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stageCounts, setStageCounts] = useState<StageCounts>(EMPTY_COUNTS);
  const [totals, setTotals] = useState({ designs: 0, withPrintFile: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<TabKey>('all');

  // — Publishing Inspector state —
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [detail, setDetail] = useState<DesignDetailData | null>(null);
  const [inspLoading, setInspLoading] = useState(false);
  const [inspError, setInspError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<LifecycleAction | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);

  const fetchInspector = useCallback(async (id: string) => {
    setInspLoading(true);
    setInspError(null);
    try {
      const [rr, dr] = await Promise.all([
        fetch(`/api/admin/designs/${id}/review`, { cache: 'no-store' }),
        fetch(`/api/admin/designs/${id}`, { cache: 'no-store' }),
      ]);
      const rBody = await rr.json().catch(() => null);
      const dBody = await dr.json().catch(() => null);
      if (!rr.ok) throw new Error(rBody?.error ?? `Review check failed (${rr.status})`);
      if (!dr.ok) throw new Error(dBody?.error ?? `Design load failed (${dr.status})`);
      setReview(rBody);
      setDetail(dBody);
    } catch (e: any) {
      setInspError(e?.message ?? 'The inspector could not be loaded.');
    } finally {
      setInspLoading(false);
    }
  }, []);

  const selectProject = useCallback((id: string) => {
    if (actionBusy) return; // don't swap designs mid-action
    setActionError(null);
    if (selectedId === id) {
      setSelectedId(null);
      return;
    }
    setSelectedId(id);
    setReview(null);
    setDetail(null);
    void fetchInspector(id);
  }, [actionBusy, selectedId, fetchInspector]);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/accounting/catalog-publishing', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setPubs(d.publications || []);
        setProjects(d.projects || []);
        setStageCounts(d.stageCounts || EMPTY_COUNTS);
        setTotals(d.totals || { designs: 0, withPrintFile: 0 });
      })
      .catch(() => setError('Publishing records could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // One lifecycle action per click — never chained. On success the
  // pipeline and the inspector are re-fetched from the server; on
  // failure the endpoint's response body is shown verbatim.
  const runAction = useCallback(async (action: LifecycleAction) => {
    if (!selectedId || actionBusy) return;
    const id = selectedId;
    setActionBusy(action);
    setActionError(null);
    try {
      const r = await fetch(`/api/admin/designs/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setActionError({
          status: r.status,
          message: body?.error ?? `Request failed (${r.status})`,
          preflight: body?.preflight ?? null,
        });
        return;
      }
      load();
      await fetchInspector(id);
    } catch {
      setActionError({ status: 0, message: 'The request did not reach the server.', preflight: null });
    } finally {
      setActionBusy(null);
    }
  }, [selectedId, actionBusy, load, fetchInspector]);

  const shown = useMemo(() => {
    let rows = pubs;
    if (tab !== 'all') rows = rows.filter((p) => p.status === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((p) => [p.designName, p.productName || '', p.variantSku || '', p.supplierName || '', p.collectionName || ''].join(' ').toLowerCase().includes(q));
    }
    return rows;
  }, [pubs, tab, search]);

  const shownProjects = useMemo(
    () => (stage === 'all' ? projects : projects.filter((p) => p.stage === stage)),
    [projects, stage],
  );

  const selectedProject = useMemo(
    () => (selectedId ? projects.find((p) => p.id === selectedId) ?? null : null),
    [projects, selectedId],
  );

  const published = pubs.filter((p) => p.status === 'published').length;
  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <div className="border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Product Design &amp; Publishing</h1>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <Link href="/admin/studio/new-design"
            data-tip="Start a new design in the Design Studio wizard — the draft then appears in this pipeline"
            className="h-9 px-3 rounded-lg text-[13px] font-medium inline-flex items-center justify-center gap-1.5 bg-[#7258e8] text-white whitespace-nowrap">
            <Plus size={14} /> New Product Design
          </Link>
          <Link href="/admin/accounting/catalog/publishing/vault"
            data-tip="Open the vault: every design's print-spec files of record"
            className="h-9 px-3 rounded-lg text-[13px] font-medium inline-flex items-center justify-center gap-1.5 border border-border bg-card text-foreground whitespace-nowrap">
            <FolderArchive size={14} /> CAD Spec Vault
          </Link>
          <Link href="/admin/accounting/catalog/publishing/costing"
            data-tip="Open the supplier cost rollup for every design"
            className="h-9 px-3 rounded-lg text-[13px] font-medium inline-flex items-center justify-center gap-1.5 border border-border bg-card text-foreground whitespace-nowrap">
            <Calculator size={14} /> BOM Cost Rollup
          </Link>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search design, product, supplier…"
            className="bg-background border border-input rounded-lg px-3 h-9 text-[13px] w-full md:w-64" type="text" />
        </div>
      </div>

      <div className="mt-6">
        <h2 className="font-display text-lg font-semibold tracking-tight">Design Pipeline</h2>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          Select a project to open its Publishing Inspector — readiness checks and the lifecycle actions live there.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {STAGE_TABS.map((t) => (
            <Link key={t.key} href={t.href}
              className={`h-8 px-3 rounded-full border text-[12.5px] font-medium inline-flex items-center ${stage === t.key ? 'bg-[#7258e8] text-white border-[#7258e8]' : 'border-border bg-card text-foreground'}`}>
              {t.label} ({stageCounts[t.key]})
            </Link>
          ))}
        </div>
        <div className="border border-border rounded-xl overflow-x-auto bg-card mt-4">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Design</th>
              <th className={thCls}>Stage</th>
              <th className={thCls}>Status</th>
              <th className={thCls}>Supplier</th>
              <th className={thCls}>Collection</th>
              <th className={`${thCls} text-right`}>Retail</th>
              <th className={`${thCls} text-right`}>Supplier Cost</th>
              <th className={`${thCls} text-right`}>Margin</th>
              <th className={thCls}>Print File</th>
              <th className="p-3">Updated</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={10} className="text-center text-muted-foreground">Loading projects…</td></tr>
              ) : shownProjects.length === 0 ? (
                <tr><td colSpan={10} className="text-center text-muted-foreground">
                  {projects.length === 0
                    ? 'No design projects yet. Designs created in the Design Studio appear here as they move toward publishing.'
                    : 'No designs are in this stage yet.'}
                </td></tr>
              ) : shownProjects.map((p) => (
                <tr key={p.id} onClick={() => selectProject(p.id)}
                  className={`hover:bg-accent/50 cursor-pointer ${selectedId === p.id ? 'bg-accent/60' : ''}`}>
                  <td className="p-3 border-r border-border"><div className="font-medium">{p.name}</div></td>
                  <td className="p-3 border-r border-border">{p.stage ? STAGE_LABELS[p.stage] : '—'}</td>
                  <td className="p-3 border-r border-border capitalize">{p.status}</td>
                  <td className="p-3 border-r border-border">
                    <div>{p.supplierName || '—'}</div>
                    <div className="text-[11px] text-muted-foreground">{p.catalogName || ''}</div>
                  </td>
                  <td className="p-3 border-r border-border text-muted-foreground">{p.collectionName || '—'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{p.retail != null ? fmt(p.retail) : '—'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{p.supplierCost != null ? fmt(p.supplierCost) : <span className="text-muted-foreground">not snapshotted</span>}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{p.margin != null ? pct(p.margin) : '—'}</td>
                  <td className="p-3 border-r border-border">
                    {p.hasPrintFile
                      ? <>Print file{p.printDpi != null ? <span className="text-muted-foreground"> · {p.printDpi} DPI</span> : null}</>
                      : <span className="text-muted-foreground">No print file</span>}
                  </td>
                  <td className="p-3">{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
        {selectedProject && (
          <PublishingInspector
            project={selectedProject}
            review={review}
            detail={detail}
            loading={inspLoading}
            error={inspError}
            actionBusy={actionBusy}
            actionError={actionError}
            onAction={runAction}
            onClose={() => { setSelectedId(null); setActionError(null); }}
            onRetry={() => { if (selectedId) void fetchInspector(selectedId); }}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-8">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`h-8 px-3 rounded-full border text-[12.5px] font-medium ${tab === t.key ? 'bg-[#7258e8] text-white border-[#7258e8]' : 'border-border bg-card text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mb-4">{error}</div>}
        <div className="border border-border rounded-xl overflow-x-auto bg-card">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr className={headRow}>
              <th className={thCls}>Design</th>
              <th className={thCls}>Sells As</th>
              <th className={thCls}>Collection</th>
              <th className={thCls}>Supplier</th>
              <th className={`${thCls} text-right`}>Retail</th>
              <th className={`${thCls} text-right`}>Supplier Cost</th>
              <th className={`${thCls} text-right`}>Margin</th>
              <th className={thCls}>Status</th>
              <th className="p-3">Published</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={9} className="text-center text-muted-foreground">Loading publications…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-muted-foreground">
                  {pubs.length === 0
                    ? 'Nothing has been published yet. Designs published from the Design Studio appear here with their prices and supplier costs.'
                    : 'No publications match this view.'}
                </td></tr>
              ) : shown.map((p) => (
                <tr key={p.id} className="hover:bg-accent/50">
                  <td className="p-3 border-r border-border"><div className="font-medium">{p.designName}</div></td>
                  <td className="p-3 border-r border-border">
                    <div>{p.productName || '—'}</div>
                    <div className="text-[11px] text-muted-foreground">{p.variantSku || ''}</div>
                  </td>
                  <td className="p-3 border-r border-border text-muted-foreground">{p.collectionName || '—'}</td>
                  <td className="p-3 border-r border-border">
                    <div>{p.supplierName || '—'}</div>
                    <div className="text-[11px] text-muted-foreground">{p.catalogName || ''}</div>
                  </td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{p.retail != null ? fmt(p.retail) : '—'}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{p.supplierCost != null ? fmt(p.supplierCost) : <span className="text-muted-foreground">not snapshotted</span>}</td>
                  <td className="p-3 border-r border-border text-right tabular-nums">{p.margin != null ? pct(p.margin) : '—'}</td>
                  <td className="p-3 border-r border-border capitalize">{p.status}</td>
                  <td className="p-3">{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
        <p className="text-[12.5px] text-muted-foreground mt-3">
          Supplier cost is the average catalog price snapshot recorded for the supplier product the design was built on; where a supplier has not snapshotted prices, the margin is honestly left blank rather than estimated.
        </p>
      </div>
    </div>
  );
}

// — Publishing Inspector (CP3) —
// Opens under the pipeline table for the selected project. Readiness
// is the server's real preflight (GET review); facts come from
// GET /api/admin/designs/[id] plus the pipeline feed row. Lifecycle
// buttons POST one action at a time to the review endpoint.

const statusLabel = (s: string) => s.replace(/_/g, ' ');

const LIFECYCLE_STATUSES = ['draft', 'publish_failed', 'needs_review', 'ready_to_publish', 'published'];

function publishBlockReason(status: string): string | null {
  switch (status) {
    case 'ready_to_publish':
      return null;
    case 'draft':
      return 'This design is still a draft — submit it for review and approve it first. Publishing unlocks at Ready to Publish.';
    case 'publish_failed':
      return 'The last publish attempt failed — submit the design for review again and approve it. Publishing unlocks at Ready to Publish.';
    case 'needs_review':
      return 'This design is waiting in review — approve it first. Publishing unlocks at Ready to Publish.';
    case 'published':
      return 'This design is already published. Unpublish it to return it to Ready to Publish.';
    default:
      return `Publishing is not available from status "${status}".`;
  }
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium mt-0.5">{children}</dd>
    </div>
  );
}

function PublishingInspector(props: {
  project: Project;
  review: ReviewData | null;
  detail: DesignDetailData | null;
  loading: boolean;
  error: string | null;
  actionBusy: LifecycleAction | null;
  actionError: ActionError | null;
  onAction: (a: LifecycleAction) => void;
  onClose: () => void;
  onRetry: () => void;
}) {
  const { project, review, detail } = props;
  const status = review?.status ?? project.status;
  const preflight = review?.preflight ?? null;
  const design = detail?.design ?? null;
  const busy = props.actionBusy !== null;
  const known = LIFECYCLE_STATUSES.includes(status);
  const blockReason = publishBlockReason(status);

  const primaryCls = 'h-9 px-4 rounded-lg text-[13px] font-medium inline-flex items-center justify-center bg-[#7258e8] text-white disabled:cursor-not-allowed';
  const secondaryCls = 'h-9 px-4 rounded-lg text-[13px] font-medium inline-flex items-center justify-center border border-border bg-card text-foreground disabled:cursor-not-allowed';
  const publishCls = status === 'ready_to_publish'
    ? primaryCls
    : 'h-9 px-4 rounded-lg text-[13px] font-medium inline-flex items-center justify-center border border-border bg-card text-foreground cursor-not-allowed';

  return (
    <div className="border border-border rounded-xl bg-card mt-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-semibold tracking-tight">Publishing Inspector</h3>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {project.name} · status: <span className="capitalize">{statusLabel(status)}</span>
          </p>
        </div>
        <button type="button" onClick={props.onClose} data-tip="Close the inspector"
          className="h-8 px-3 rounded-lg border border-border bg-card text-foreground text-[12.5px] font-medium">
          Close
        </button>
      </div>

      {props.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mt-4">
          {props.error}
          <button type="button" onClick={props.onRetry} className="ml-3 underline font-medium">Retry</button>
        </div>
      ) : !review || !detail ? (
        <p className="text-[13px] text-muted-foreground mt-4">Loading inspector…</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-[13px] mt-5">
            <Fact label="Status"><span className="capitalize">{statusLabel(status)}</span></Fact>
            <Fact label="Supplier product">
              {project.supplierName
                ? <>{project.supplierName}{project.catalogName ? <span className="text-muted-foreground font-normal"> — {project.catalogName}</span> : null}</>
                : 'No supplier product chosen'}
            </Fact>
            <Fact label="Sells as">{design?.product_title || '—'}</Fact>
            <Fact label="Retail price">
              {design?.retail_price != null ? fmt(design.retail_price) : project.retail != null ? fmt(project.retail) : 'Not set'}
            </Fact>
            <Fact label="Collection">{project.collectionName || '—'}</Fact>
            <Fact label="Print file">
              {project.hasPrintFile
                ? <>On record{project.printDpi != null ? <span className="text-muted-foreground font-normal"> · {project.printDpi} DPI</span> : null}</>
                : 'No print file'}
            </Fact>
          </dl>

          <div className="mt-5">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Print-ready files of record</h4>
            {detail.printFiles.length === 0 ? (
              <p className="text-[13px] mt-2">No print-ready files of record for this design.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-[13px]">
                {detail.printFiles.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-x-3">
                    <span className="font-medium">{f.placement}</span>
                    <span>{f.width_px} × {f.height_px} px</span>
                    <span>{f.dpi} DPI</span>
                    <span className="text-muted-foreground">v{f.version}</span>
                    <a className="text-[#7258e8] underline" href={f.file_url} target="_blank" rel="noreferrer">View file</a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-5">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Publications</h4>
            {detail.publications.length === 0 ? (
              <p className="text-[13px] mt-2">No publications yet — publishing creates the storefront product and its publication record.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-[13px]">
                {detail.publications.map((pub) => (
                  <li key={pub.id}>
                    <span className="font-medium capitalize">{statusLabel(pub.status)}</span>
                    {pub.published_at ? <span className="text-muted-foreground"> · {new Date(pub.published_at).toLocaleDateString()}</span> : null}
                    {pub.product_variant_id ? <span className="text-muted-foreground"> · variant {pub.product_variant_id.slice(0, 8)}…</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {preflight && (
            <div className="mt-5">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Publication readiness — preflight</h4>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className={`inline-flex items-center h-5 px-2 rounded-full text-[11px] font-semibold ${preflight.ok ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}>
                  {preflight.ok ? 'Preflight passing' : 'Preflight blocked'}
                </span>
                <span className="text-[12.5px] text-muted-foreground">
                  Run just now by the server against this design and its real supplier template. Errors block the lifecycle; warnings do not.
                </span>
              </div>
              {preflight.errors.length === 0 && preflight.warnings.length === 0 ? (
                <p className="text-[13px] mt-2">Preflight returned no errors or warnings for this design.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {preflight.errors.map((i, n) => (
                    <li key={`e${n}`} className="text-[13px] text-red-800">
                      <span className="font-semibold">Error{i.surface ? ` · ${i.surface}` : ''}:</span> {i.message}
                    </li>
                  ))}
                  {preflight.warnings.map((i, n) => (
                    <li key={`w${n}`} className="text-[13px] text-amber-800">
                      <span className="font-semibold">Warning{i.surface ? ` · ${i.surface}` : ''}:</span> {i.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="border-t border-border pt-4 mt-6">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Lifecycle</h4>
            <p className="text-[12.5px] text-muted-foreground mt-1.5">
              Publishing posts this design to Unsaid&rsquo;s own storefront — there are no external sales channels, and nothing is syndicated to Shopify or any other marketplace.
            </p>

            {props.actionError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mt-3">
                <div className="font-medium">
                  {props.actionError.message}
                  {props.actionError.status ? <span className="font-normal"> (HTTP {props.actionError.status})</span> : null}
                </div>
                {props.actionError.preflight && props.actionError.preflight.errors.length > 0 && (
                  <ul className="mt-1.5 space-y-1 text-[13px]">
                    {props.actionError.preflight.errors.map((i, n) => (
                      <li key={n}>{i.surface ? `${i.surface}: ` : ''}{i.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {known ? (
              <>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {(status === 'draft' || status === 'publish_failed') && (
                    <button type="button" disabled={busy} onClick={() => props.onAction('submit')}
                      data-tip="Send this design into review. The server runs the preflight checks again before it can move."
                      className={primaryCls}>
                      {props.actionBusy === 'submit' ? 'Submitting…' : 'Submit for review'}
                    </button>
                  )}
                  {status === 'needs_review' && (
                    <button type="button" disabled={busy} onClick={() => props.onAction('approve')}
                      data-tip="Approve this design so it can be published. Preflight must pass."
                      className={primaryCls}>
                      {props.actionBusy === 'approve' ? 'Approving…' : 'Approve'}
                    </button>
                  )}
                  <button type="button" disabled={busy || status !== 'ready_to_publish'} onClick={() => props.onAction('publish')}
                    data-tip="Publish this design to Unsaid's own storefront. Only available at Ready to Publish, after the preflight gate."
                    className={publishCls}>
                    {props.actionBusy === 'publish' ? 'Publishing…' : 'Publish to Commerce Channels'}
                  </button>
                  {status === 'published' && (
                    <button type="button" disabled={busy} onClick={() => props.onAction('unpublish')}
                      data-tip="Remove this design's product from the storefront and return the design to Ready to Publish."
                      className={secondaryCls}>
                      {props.actionBusy === 'unpublish' ? 'Unpublishing…' : 'Unpublish'}
                    </button>
                  )}
                </div>
                {blockReason && (
                  <p className="text-[12.5px] text-muted-foreground mt-2">{blockReason}</p>
                )}
              </>
            ) : (
              <p className="text-[13px] mt-3">
                This design&rsquo;s stored status is &ldquo;{status}&rdquo; — a status the current lifecycle
                (draft → needs review → ready to publish → published) never produces and defines no action from,
                so no lifecycle buttons are offered for it. Changing the stored status is a data decision for the owner.
              </p>
            )}
            {props.loading && <p className="text-[12px] text-muted-foreground mt-2">Refreshing from the server…</p>}
          </div>
        </>
      )}
    </div>
  );
}
