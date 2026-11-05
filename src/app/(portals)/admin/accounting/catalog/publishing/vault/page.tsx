'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

// /admin/accounting/catalog/publishing/vault — CAD Spec Vault.
// The header button keeps the owner's label; the view itself is
// titled truthfully: there are no CAD files in this data (no DXF /
// STEP / DWG has ever been uploaded). What the vault holds is the
// print-spec files of record — design_files (placement, dimensions,
// DPI, version) and the studio's design_assets — each labeled as
// what it is, each linking to the file itself via a signed URL
// minted by GET /api/admin/accounting/catalog-publishing/vault.
// Read-only: no edit controls.

type SpecFile = {
  id: string; placement: string | null; widthPx: number | null; heightPx: number | null;
  dpi: number | null; version: number | null; createdAt: string | null; url: string | null;
};
type Asset = {
  id: string; kind: string; surface: string | null; mimeType: string | null;
  width: number | null; height: number | null; printDpi: number | null;
  provider: string | null; createdAt: string | null; fileName: string; url: string | null;
};
type VaultDesign = {
  id: string; name: string; status: string; printFiles: SpecFile[]; assets: Asset[];
};

// design_assets.kind values, labeled as what they are.
const KIND_LABELS: Record<string, string> = {
  print: 'Print file',
  postprocessed: 'Post-processed print file',
  mockup: 'Mockup',
  artwork: 'Artwork',
  'svg-source': 'SVG source',
  inspiration: 'Inspiration',
  sketch: 'Sketch',
};

export default function SpecVaultPage() {
  const [designs, setDesigns] = useState<VaultDesign[]>([]);
  const [totals, setTotals] = useState({ designs: 0, printFiles: 0, assets: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch('/api/admin/accounting/catalog-publishing/vault', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then((d) => {
        setDesigns(d.designs || []);
        setTotals(d.totals || { designs: 0, printFiles: 0, assets: 0 });
      })
      .catch(() => setError('The spec vault could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(
    () => (filter === 'all' ? designs : designs.filter((d) => d.id === filter)),
    [designs, filter],
  );

  const thCls = 'p-3 border-r border-border';
  const headRow = 'bg-muted/40 border-b border-border font-semibold uppercase text-[11px] tracking-wider text-muted-foreground';

  return (
    <div className="flex flex-col w-full bg-background text-foreground">
      <Link href="/admin/accounting/catalog/publishing"
        data-tip="Back to Product Design & Publishing"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground w-fit">
        <ArrowLeft size={14} /> Product Design &amp; Publishing
      </Link>

      <div className="border-b border-border mt-3 pb-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">CAD Spec Vault — print-spec files of record</h1>
        <p className="text-[12.5px] text-muted-foreground mt-2">
          {totals.designs} design(s) · {totals.printFiles} print file(s) of record · {totals.assets} studio asset(s).
        </p>
      </div>

      <div className="flex items-center gap-2 mt-5">
        <label htmlFor="vault-design-filter" className="text-[12.5px] font-medium">Design</label>
        <select id="vault-design-filter" value={filter} onChange={(e) => setFilter(e.target.value)}
          data-tip="Show the files of one design, or of every design"
          className="bg-background border border-input rounded-lg px-2 h-9 text-[13px]">
          <option value="all">All designs</option>
          {designs.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive mt-4">{error}</div>}

      {loading ? (
        <p className="text-[13px] text-muted-foreground mt-6">Loading the vault…</p>
      ) : shown.length === 0 ? (
        <p className="text-[13px] text-muted-foreground mt-6">No designs in the studio yet, so the vault is empty.</p>
      ) : shown.map((d) => (
        <section key={d.id} className="mt-8">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {d.name} <span className="text-[12.5px] font-normal text-muted-foreground capitalize">· {d.status.replace(/_/g, ' ')}</span>
          </h2>

          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-4">Print files of record</h3>
          <div className="border border-border rounded-xl overflow-x-auto bg-card mt-2">
            <div className="adm-table-wrap"><table className="adm-table">
              <thead><tr className={headRow}>
                <th className={thCls}>Placement</th>
                <th className={thCls}>Dimensions</th>
                <th className={thCls}>DPI</th>
                <th className={thCls}>Version</th>
                <th className={thCls}>Recorded</th>
                <th className="p-3">File</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {d.printFiles.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-muted-foreground">No print files of record for this design.</td></tr>
                ) : d.printFiles.map((f) => (
                  <tr key={f.id} className="hover:bg-accent/50">
                    <td className="p-3 border-r border-border font-medium capitalize">{f.placement || '—'}</td>
                    <td className="p-3 border-r border-border tabular-nums">
                      {f.widthPx != null && f.heightPx != null ? `${f.widthPx} × ${f.heightPx} px` : '—'}
                    </td>
                    <td className="p-3 border-r border-border tabular-nums">{f.dpi != null ? f.dpi : '—'}</td>
                    <td className="p-3 border-r border-border tabular-nums">{f.version != null ? `v${f.version}` : '—'}</td>
                    <td className="p-3 border-r border-border">{f.createdAt ? new Date(f.createdAt).toLocaleDateString() : '—'}</td>
                    <td className="p-3">
                      {f.url
                        ? <a className="text-[#7258e8] underline" href={f.url} target="_blank" rel="noreferrer" data-tip="Open this print file">View file</a>
                        : <span className="text-muted-foreground">No live link</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>

          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mt-5">Studio assets</h3>
          <div className="border border-border rounded-xl overflow-x-auto bg-card mt-2">
            <div className="adm-table-wrap"><table className="adm-table">
              <thead><tr className={headRow}>
                <th className={thCls}>File</th>
                <th className={thCls}>Kind</th>
                <th className={thCls}>Surface</th>
                <th className={thCls}>Dimensions</th>
                <th className={thCls}>DPI</th>
                <th className={thCls}>Stored</th>
                <th className="p-3">File</th>
              </tr></thead>
              <tbody className="divide-y divide-border">
                {d.assets.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-muted-foreground">No studio assets stored for this design.</td></tr>
                ) : d.assets.map((a) => (
                  <tr key={a.id} className="hover:bg-accent/50">
                    <td className="p-3 border-r border-border font-medium">{a.fileName}</td>
                    <td className="p-3 border-r border-border">{KIND_LABELS[a.kind] ?? a.kind}</td>
                    <td className="p-3 border-r border-border">{a.surface || '—'}</td>
                    <td className="p-3 border-r border-border tabular-nums">
                      {a.width != null && a.height != null ? `${a.width} × ${a.height} px` : '—'}
                    </td>
                    <td className="p-3 border-r border-border tabular-nums">{a.printDpi != null ? a.printDpi : '—'}</td>
                    <td className="p-3 border-r border-border">{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '—'}</td>
                    <td className="p-3">
                      {a.url
                        ? <a className="text-[#7258e8] underline" href={a.url} target="_blank" rel="noreferrer" data-tip="Open this stored file">View file</a>
                        : <span className="text-muted-foreground">No live link</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </section>
      ))}
    </div>
  );
}
