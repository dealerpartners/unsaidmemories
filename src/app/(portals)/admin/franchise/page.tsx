'use client';

// Franchise Management Portal — the network list (owner spec,
// 2026-10-17). The platform admin manages franchises here: who they
// are, their owner, their domain, their template, their agreement.
// Data comes from GET /api/admin/franchise (master-only — a franchise
// tenant session gets a 403 and the error below, never the network).
// Provisioning a new franchise stays on the existing signup page.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Store, Plus } from 'lucide-react';

type FranchiseRow = {
  id: string;
  name: string;
  slug: string;
  status: string | null;
  custom_domain: string | null;
  primary_domain: string | null;
  template_key: string | null;
  created_at: string | null;
  owner: { id: string; name: string | null; email: string | null; is_active: boolean; auth_linked: boolean } | null;
  locations: number;
  agreement_status: string | null;
};

export default function FranchiseListPage() {
  const [rows, setRows] = useState<FranchiseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/franchise');
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
      setRows(j.data || []);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to load franchises');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Store className="size-6" /> Franchises
          </h1>
        </div>
        <Link
          href="/admin/franchise/signup"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" /> New franchise
        </Link>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>}

      {loading ? (
        <p className="text-[13px] text-muted-foreground">Loading franchises…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <p className="text-[13px] text-muted-foreground">
            No franchise tenants yet. Use <span className="font-medium text-foreground">New franchise</span> to
            provision the first one — it creates the tenant, its owner, its module entitlements,
            and its first location in one step.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Franchise</th>
                <th className="px-4 py-2 font-medium">Owner</th>
                <th className="px-4 py-2 font-medium">Domain</th>
                <th className="px-4 py-2 font-medium">Template</th>
                <th className="px-4 py-2 font-medium">Agreement</th>
                <th className="px-4 py-2 font-medium">Locations</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-2">
                    <Link href={`/admin/franchise/${t.id}`} className="font-medium text-foreground hover:underline">
                      {t.name}
                    </Link>
                    <span className="block text-[11px] text-muted-foreground">{t.slug}</span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {t.owner ? (
                      <>
                        <span className="text-foreground">{t.owner.name || t.owner.email || '—'}</span>
                        <span className="block text-[11px]">
                          {t.owner.email || ''}
                          {t.owner.auth_linked ? '' : ' · sign-in not linked yet'}
                        </span>
                      </>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{t.primary_domain || t.custom_domain || '—'}</td>
                  <td className="px-4 py-2 text-muted-foreground">{t.template_key || 'House (default)'}</td>
                  <td className="px-4 py-2 text-muted-foreground">{t.agreement_status || '—'}</td>
                  <td className="px-4 py-2 text-muted-foreground">{t.locations}</td>
                  <td className="px-4 py-2">
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground">
                      {t.status || '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
