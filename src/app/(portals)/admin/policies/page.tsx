'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Pencil, ScrollText } from 'lucide-react';
import { useEditLegalWaivers } from '@/hooks/admin/useActions';

type Policy = {
  id: string;
  title: string;
  body: string;
  order: number | null;
  createdAt: string;
  updatedAt: string;
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function PoliciesPage() {
  const router = useRouter();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const editLegalWaivers = useEditLegalWaivers();

  useEffect(() => {
    fetch('/api/admin/policies')
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `Request failed (${r.status})`);
        }
        return r.json();
      })
      .then((j) => setPolicies(j.policies || []))
      .catch((e) => setError(e.message || 'Failed to load policies'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <ScrollText className="size-6" /> Policies
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const content = window.prompt('Legal & waivers content:');
              // The handler upserts into `policies` by title and reads
              // payload.title / payload.body — the old { content } payload
              // silently created an empty-titled row (or nothing).
              if (content) editLegalWaivers.mutate({ title: 'Legal & Waivers & Liability Release', body: content });
            }}
            className="px-4 py-2 border border-border rounded-lg text-[13px] font-semibold hover:bg-muted cursor-pointer">
            Edit Legal & Waivers
          </button>
          <Link href="/admin/policies/marketplace"
            className="px-4 py-2 border border-border rounded-lg text-[13px] font-semibold hover:bg-muted cursor-pointer">
            Marketplace policies
          </Link>
          <Link href="/admin/policies/versions"
            className="px-4 py-2 border border-border rounded-lg text-[13px] font-semibold hover:bg-muted cursor-pointer">
            Version history
          </Link>
          <Link href="/admin/policies/acceptances"
            className="px-4 py-2 border border-border rounded-lg text-[13px] font-semibold hover:bg-muted cursor-pointer">
            Acceptance tracking
          </Link>
          <Link href="/admin/docs"
            className="px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-[13px] font-semibold flex items-center gap-2 cursor-pointer">
            <Plus className="size-4" /> New Policy
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-[13px]">Loading…</div>
      ) : error ? (
        <div className="bg-card border border-border rounded-xl text-center">
          <p className="text-[14px] font-medium text-foreground">Couldn't load policies</p>
          <p className="text-[13px] text-muted-foreground mt-1">{error}</p>
        </div>
      ) : policies.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <ScrollText className="size-10 mx-auto text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground mt-3">No policies yet</p>
          <p className="text-[13px] text-muted-foreground mt-1">Create the first policy to publish terms, returns, or shipping rules.</p>
          <Link href="/admin/docs"
            className="mt-4 inline-block px-4 py-2 border border-border bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 rounded-lg text-[13px] font-semibold cursor-pointer">
            Create Your First Policy
          </Link>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead>
              <tr>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Title</th>
                <th className="p-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Last updated</th>
                <th className="p-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-muted/50">
                  <td className="p-3 font-medium">
                    <button
                      onClick={() => router.push(`/admin/docs/article/${p.id}`)}
                      className="text-left hover:underline cursor-pointer">
                      {p.title}
                    </button>
                  </td>
                  <td className="p-3 text-muted-foreground">{fmtDate(p.updatedAt)}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => router.push(`/admin/docs/article/${p.id}`)}
                      className="text-primary hover:underline text-[11px] inline-flex items-center gap-1 cursor-pointer">
                      <Pencil className="size-3" /> Edit
                    </button>
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
