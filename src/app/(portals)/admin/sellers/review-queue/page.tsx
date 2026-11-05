'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck, ExternalLink, Inbox, ListChecks, ShieldCheck } from 'lucide-react';

// ============================================================================
// §14.15 · Seller Review Queue — the single surface aggregating the three
// pending queues (applications · verification · listing reviews) that
// previously lived only in their separate seats. Counts and items come
// from /api/admin/sellers/review-queue over the real stores. Decisions
// stay on their existing surfaces (deep links per section); application
// approve/reject is offered inline ONLY because the existing
// POST /api/admin/sellers actions already support deciding an
// application from a list — this page calls that route, it does not
// re-implement the decision.
// ============================================================================

type Any = Record<string, any>;

const TYPE_OPTIONS = [
  { value: 'manufacturer_brand', label: 'Manufacturer brand' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'reseller', label: 'Reseller' },
  { value: 'drop_shipper', label: 'Drop shipper' },
];

function Section({
  icon, title, count, href, linkLabel, children,
}: {
  icon: React.ReactNode; title: string; count: number; href: string; linkLabel: string; children: React.ReactNode;
}) {
  return (
    <section className="bg-card border border-border rounded-xl">
      <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-b border-border">
        {icon}
        <h2 className="text-[14px] font-semibold">{title}</h2>
        <span className="text-[12px] text-muted-foreground">{count} pending</span>
        <Link href={href} className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium underline underline-offset-2">
          {linkLabel} <ExternalLink className="size-3.5" />
        </Link>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[13px] text-muted-foreground">{children}</p>
);

export default function SellerReviewQueuePage() {
  const [data, setData] = useState<Any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [appTypes, setAppTypes] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/sellers/review-queue');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load the review queue');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (applicationId: string, action: 'approve_application' | 'reject_application') => {
    setActing(true);
    setNotice(null);
    try {
      const body: Record<string, string> = { action, application_id: applicationId };
      if (action === 'approve_application') {
        const t = appTypes[applicationId];
        if (t) body.seller_type = t;
      } else if (reason.trim()) {
        body.reason = reason.trim();
      }
      const r = await fetch('/api/admin/sellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Decision failed');
      setNotice(action === 'approve_application' ? 'Application approved via the sellers desk decision.' : 'Application rejected via the sellers desk decision.');
      setRejecting(null);
      setReason('');
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Decision failed');
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ClipboardCheck className="size-6" /> Seller Review Queue
        </h1>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
          <Link href="/admin/sellers" className="text-[13px] font-medium underline underline-offset-2">Seller Management</Link>
          <Link href="/admin/sellers/reinstatements" className="text-[13px] font-medium underline underline-offset-2">Reinstatements (A3)</Link>
          <Link href="/admin/trust-safety/appeals" className="text-[13px] font-medium underline underline-offset-2">Trust &amp; Safety appeals</Link>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{notice}</div>}

      {loading ? (
        <p className="text-[13px] text-muted-foreground">Loading the three queues…</p>
      ) : !data ? (
        <Empty>The queue could not be loaded.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Total pending', data.counts.total],
              ['Applications', data.counts.applications],
              ['Verification', data.counts.verification],
              ['Listing reviews', data.counts.listings],
            ].map(([label, v]) => (
              <div key={label as string} className="bg-card border border-border rounded-xl px-4 py-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
                <div className="text-xl font-bold">{v as number}</div>
              </div>
            ))}
          </div>
          {data.note && <Empty>{data.note}</Empty>}

          <Section icon={<Inbox className="size-4 text-muted-foreground" />} title="Applications awaiting a decision"
            count={data.counts.applications} href="/admin/sellers" linkLabel="Open the sellers desk">
            {data.applications.length === 0 ? (
              <Empty>No seller applications are waiting.</Empty>
            ) : (
              <ul className="divide-y divide-border">
                {data.applications.map((a: Any) => (
                  <li key={a.id} className="py-3 space-y-2">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <div className="text-[14px] font-medium">{a.business_name}</div>
                        <div className="text-[12px] text-muted-foreground">
                          {a.contact_name} · {a.email} · filed {a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold capitalize">{a.status}</span>
                    </div>
                    {(a.wizard_steps && Object.keys(a.wizard_steps).length > 0) || (a.documents && a.documents.length > 0) ? (
                      <details className="rounded-lg border border-border px-3 py-2">
                        <summary className="cursor-pointer text-[12px] font-semibold">
                          Wizard packet — {a.documents?.length ?? 0} document{(a.documents?.length ?? 0) === 1 ? '' : 's'}
                        </summary>
                        <div className="mt-2 space-y-2">
                          {Object.entries(a.wizard_steps ?? {}).map(([n, payload]) => (
                            <div key={n} className="text-[12px]">
                              <span className="font-semibold">Step {n}: </span>
                              <span className="text-muted-foreground">
                                {Object.entries(payload as Any)
                                  .filter(([, v]) => v !== '' && v != null)
                                  .map(([k, v]) => `${k}: ${typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v)}`)
                                  .join(' · ') || 'no data'}
                              </span>
                            </div>
                          ))}
                          {(a.documents ?? []).map((d: Any) => (
                            <div key={d.id} className="text-[12px] text-muted-foreground">
                              Document · step {d.step} · {d.doc_type} · {d.filename}
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                    {rejecting === a.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input value={reason} onChange={(e) => setReason(e.target.value)}
                          placeholder="Reason for rejection (recorded on the application)"
                          className="flex-1 min-w-[240px] border border-border rounded-lg px-3 py-2 text-[13px] bg-card" />
                        <button disabled={acting} onClick={() => decide(a.id, 'reject_application')}
                          className="px-3.5 py-2 bg-red-600 text-white rounded-lg text-[13px] font-semibold disabled:opacity-50 cursor-pointer">Confirm rejection</button>
                        <button disabled={acting} onClick={() => { setRejecting(null); setReason(''); }}
                          className="px-3.5 py-2 border border-border rounded-lg text-[13px] font-semibold disabled:opacity-50 cursor-pointer">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <select value={appTypes[a.id] ?? ''} disabled={acting}
                          onChange={(e) => setAppTypes((t) => ({ ...t, [a.id]: e.target.value }))}
                          className="border border-border rounded-lg px-2 py-2 text-[13px] bg-card" title="Seller type to approve under">
                          <option value="">Seller type…</option>
                          {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <button disabled={acting || !appTypes[a.id]} onClick={() => decide(a.id, 'approve_application')}
                          className="px-3.5 py-2 bg-emerald-600 text-white rounded-lg text-[13px] font-semibold disabled:opacity-50 cursor-pointer">Approve</button>
                        <button disabled={acting} onClick={() => setRejecting(a.id)}
                          className="px-3.5 py-2 border border-border rounded-lg text-[13px] font-semibold disabled:opacity-50 cursor-pointer">Reject</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section icon={<ShieldCheck className="size-4 text-muted-foreground" />} title="Verification awaiting a decision"
            count={data.counts.verification} href="/admin/sellers/verification" linkLabel="Open the verification desk">
            {data.counts.verification === 0 ? (
              <Empty>No KYC tasks or brand authorizations are waiting.</Empty>
            ) : (
              <ul className="divide-y divide-border text-[13px]">
                {data.verification.tasks.map((t: Any) => (
                  <li key={t.id} className="py-2 flex flex-wrap justify-between gap-2">
                    <span><strong>{t.task_type}</strong> — {t.seller_name || t.seller_id}</span>
                    <span className="text-muted-foreground">filed {t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}</span>
                  </li>
                ))}
                {data.verification.brandAuthorizations.map((a: Any) => (
                  <li key={a.id} className="py-2 flex flex-wrap justify-between gap-2">
                    <span><strong>Brand authorization</strong> — {a.brand_name} · {a.seller_name || a.seller_id}</span>
                    <span className="text-muted-foreground">filed {a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[12px] text-muted-foreground mt-2">
              Verification decisions stamp the task/authorization row at the verification desk — they are not duplicated here.
            </p>
          </Section>

          <Section icon={<ListChecks className="size-4 text-muted-foreground" />} title="Listing reviews awaiting a decision"
            count={data.counts.listings} href="/admin/catalog-review" linkLabel="Open catalog review">
            {data.counts.listings === 0 ? (
              <Empty>No seller listings or catalog items are in pending review.</Empty>
            ) : (
              <ul className="divide-y divide-border text-[13px]">
                {data.listings.sellerListings.map((l: Any) => (
                  <li key={l.id} className="py-2 flex flex-wrap justify-between gap-2">
                    <span><strong>{l.title}</strong>{l.sku ? ` · ${l.sku}` : ''} — {l.seller_name || 'unattributed'}</span>
                    <Link href="/admin/listings" className="underline underline-offset-2">Decide in Listings Review</Link>
                  </li>
                ))}
                {data.listings.catalogItems.map((l: Any) => (
                  <li key={l.id} className="py-2 flex flex-wrap justify-between gap-2">
                    <span><strong>{l.title}</strong> — {l.seller_name || 'unattributed'}</span>
                    <Link href="/admin/catalog-review" className="underline underline-offset-2">Decide in Catalog Review</Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
