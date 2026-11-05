'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Scale, ScrollText } from 'lucide-react';

// S3 (franchise-authoring spec): this desk is the GOVERNANCE view for
// marketplace seller policies — registry, sign-off queue, precedence,
// acceptance registry, publish. AUTHORING moved to the Document Center's
// Marketplace Policy mode (/admin/docs/marketplace), which drafts through
// this same API — one authoring surface, the enforcement store intact.
// F4 · Policy Management + H1 · Review & Sign-off + H3 · Acceptance Tracking
// — the governance desk for MARKETPLACE SELLER POLICIES: the governance
// rules sellers read and accept. Not the site policies edited at
// /admin/policies (a separate store) and not Document Center articles
// (/admin/docs).
//
// Semantics of the real stores, stated on the surface: the policy row
// carries the current text and the seller read serves it, so editing a
// published policy changes the live text immediately; publishing records
// that text as the next version snapshot and bumps current_version —
// which is what makes earlier acceptances stale for sellers.

type Policy = {
  id: string;
  title: string;
  slug: string | null;
  layer: string | null;
  category: string | null;
  body: string | null;
  status: string | null;
  current_version: number | null;
  review_state: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  signoff_at: string | null;
  acceptance_count?: number;
  body_differs_from_published?: boolean;
  updated_at: string | null;
};



type PrecedenceRow = {
  id: string;
  policy_id: string;
  policy_title: string;
  precedence: number;
  overrides_policy_id: string | null;
  overrides_title: string | null;
};

type AcceptanceRow = {
  id: string;
  policy_id: string;
  policy_title: string;
  policy_version: string;
  seller_id: string;
  seller_display_name: string | null;
  accepted_at: string;
};

const inputCls =
  'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none';
const labelCls = 'mb-1 block text-xs font-semibold tracking-wide text-neutral-500 uppercase';

function StatusBadge({ p }: { p: Policy }) {
  if (p.status === 'published') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
          Published · v{p.current_version ?? 1}
        </span>
        {p.body_differs_from_published ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            Text edited since publish
          </span>
        ) : null}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">
      Draft{(p.current_version ?? 0) > 0 ? ` · was v${p.current_version}` : ''}
    </span>
  );
}

function ReviewBadge({ p }: { p: Policy }) {
  const state = p.review_state || 'draft';
  if (state === 'signed_off') {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        Signed off
      </span>
    );
  }
  if (state === 'in_review') {
    return (
      <span className="rounded-full bg-brand-teal/10 px-2 py-0.5 text-xs font-semibold text-brand-teal">
        In review
      </span>
    );
  }
  if (state === 'changes_requested') {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
        Changes requested
      </span>
    );
  }
  return (
    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-500">
      Not submitted
    </span>
  );
}

export default function AdminMarketplacePoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [precedence, setPrecedence] = useState<PrecedenceRow[]>([]);
  const [acceptances, setAcceptances] = useState<AcceptanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [precForm, setPrecForm] = useState({
    policy_id: '',
    precedence: '0',
    overrides_policy_id: '',
  });
  const [reviewNotes, setReviewNotes] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/policies/marketplace');
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error || 'Could not load marketplace policies');
      setLoading(false);
      return;
    }
    const b = await res.json();
    setPolicies(b.policies || []);
    setPrecedence(b.precedence || []);
    setAcceptances(b.acceptances || []);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (payload: Record<string, unknown>, okMessage: string) => {
      setBusy(true);
      setNotice(null);
      setError(null);
      try {
        const res = await fetch('/api/admin/policies/marketplace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const b = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(b.error || 'Action failed');
          return null;
        }
        setNotice(okMessage);
        await load();
        return b;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  if (loading) {
    return <div className="text-sm text-neutral-500">Loading marketplace policies…</div>;
  }

  return (
    <div className="mx-auto max-w-7xl">
      <Link
        href="/admin/policies"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Policies
      </Link>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-neutral-900">
          <ScrollText className="h-6 w-6" /> Marketplace Policies
        </h1>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <section className="rounded-xl border border-neutral-200 bg-white">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                  F4 · Policy Registry
                </div>
                <h2 className="text-base font-semibold text-neutral-900">Seller policies</h2>
              </div>
              <Link
                href="/admin/docs/marketplace"
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5"
              >
                New policy — in the Document Center
              </Link>
            </div>
            {policies.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No marketplace policies are authored yet. Sellers have nothing to accept
                until the first policy is published.
              </p>
            ) : (
              <div className="space-y-2">
                {policies.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-neutral-900">{p.title}</div>
                      <div className="text-xs text-neutral-500">
                        {p.slug || 'no slug'}
                        {p.category ? ` · ${p.category}` : ''}
                        {p.layer ? ` · ${p.layer}` : ''}
                        {` · ${p.acceptance_count ?? 0} acceptance${(p.acceptance_count ?? 0) === 1 ? '' : 's'}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge p={p} />
                      <ReviewBadge p={p} />
                      <button
                        type="button"
                        onClick={() =>
                          void act(
                            {
                              action: p.status === 'published' ? 'unpublish_policy' : 'publish_policy',
                              id: p.id,
                            },
                            p.status === 'published'
                              ? 'Policy unpublished — it no longer appears for sellers.'
                              : 'Policy published — sellers can now read and accept it.',
                          )
                        }
                        disabled={busy}
                        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-50"
                      >
                        {p.status === 'published' ? 'Unpublish' : 'Publish'}
                      </button>
                      <Link
                        href={`/admin/docs/marketplace?policy=${p.id}`}
                        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700"
                      >
                        Author
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white">
            <div className="mb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
              H1 · Review Queue &amp; Legal Sign-off
            </div>
            <h2 className="mb-2 text-base font-semibold text-neutral-900">Awaiting sign-off</h2>
            <p className="mb-3 text-sm text-neutral-500">
              A policy publishes only after legal sign-off on its current text. Editing the
              body of a signed-off policy sends it back through this queue.
            </p>
            {policies.filter((p) => (p.review_state || 'draft') === 'in_review').length ===
            0 ? (
              <p className="text-sm text-neutral-500">The review queue is empty.</p>
            ) : (
              <div className="space-y-2">
                <div>
                  <label className={labelCls}>Review notes (required to request changes)</label>
                  <input
                    className={inputCls}
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="What legal needs changed, or a note for the record"
                  />
                </div>
                {policies
                  .filter((p) => (p.review_state || 'draft') === 'in_review')
                  .map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-neutral-900">
                          {p.title}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {p.slug || 'no slug'}
                          {p.category ? ` · ${p.category}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void act(
                              { action: 'sign_off', id: p.id },
                              'Policy signed off — it can now be published.',
                            )
                          }
                          disabled={busy}
                          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                        >
                          Sign off
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void act(
                              { action: 'request_changes', id: p.id, review_notes: reviewNotes },
                              'Changes requested — the author sees the review notes on the policy.',
                            )
                          }
                          disabled={busy}
                          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 disabled:opacity-50"
                        >
                          Request changes
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white">
            <div className="mb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
              F4 · Precedence Matrix
            </div>
            <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-neutral-900">
              <Scale className="h-4 w-4" /> Which policy overrides which
            </h2>
            <p className="mb-3 text-sm text-neutral-500">
              Each entry states a policy&apos;s precedence and the policy it overrides.
              Lower precedence numbers rank first. A policy with no entry carries no
              recorded precedence.
            </p>
            {precedence.length === 0 ? (
              <p className="text-sm text-neutral-500">No precedence entries recorded.</p>
            ) : (
              <div className="space-y-2">
                {precedence.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  >
                    <span className="font-semibold text-neutral-900">{r.policy_title}</span>
                    <span className="text-neutral-500">
                      precedence {r.precedence}
                      {r.overrides_title
                        ? ` · overrides ${r.overrides_title}`
                        : ' · overrides nothing recorded'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 grid gap-2 md:grid-cols-4">
              <div>
                <label className={labelCls}>Policy</label>
                <select
                  className={inputCls}
                  value={precForm.policy_id}
                  onChange={(e) => setPrecForm((f) => ({ ...f, policy_id: e.target.value }))}
                >
                  <option value="">Choose a policy…</option>
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Precedence</label>
                <input
                  className={inputCls}
                  type="number"
                  value={precForm.precedence}
                  onChange={(e) => setPrecForm((f) => ({ ...f, precedence: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelCls}>Overrides (optional)</label>
                <select
                  className={inputCls}
                  value={precForm.overrides_policy_id}
                  onChange={(e) =>
                    setPrecForm((f) => ({ ...f, overrides_policy_id: e.target.value }))
                  }
                >
                  <option value="">Overrides nothing</option>
                  {policies
                    .filter((p) => p.id !== precForm.policy_id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void act(
                      {
                        action: 'set_precedence',
                        policy_id: precForm.policy_id,
                        precedence: Number(precForm.precedence),
                        overrides_policy_id: precForm.overrides_policy_id || null,
                      },
                      'Precedence saved.',
                    )
                  }
                  disabled={busy || !precForm.policy_id}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50"
                >
                  Set
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void act(
                      { action: 'delete_precedence', policy_id: precForm.policy_id },
                      'Precedence entry removed.',
                    )
                  }
                  disabled={busy || !precForm.policy_id}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white">
            <div className="mb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
              H3 · Acceptance Tracking
            </div>
            <h2 className="mb-3 text-base font-semibold text-neutral-900">Acceptance registry</h2>
            {acceptances.length === 0 ? (
              <p className="text-sm text-neutral-500">No seller has accepted a policy yet.</p>
            ) : (
              <div className="space-y-2">
                {acceptances.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  >
                    <span className="font-semibold text-neutral-900">
                      {a.policy_title}
                      <span className="ml-2 font-normal text-neutral-500">v{a.policy_version}</span>
                    </span>
                    <span className="text-neutral-500">
                      {a.seller_display_name || a.seller_id} ·{' '}
                      {new Date(a.accepted_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="lg:col-span-2">
          <section className="rounded-xl border border-neutral-200 bg-white">
            <div className="mb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
              H1 · Policy Authoring — Document Center
            </div>
            <h2 className="mb-3 text-base font-semibold text-neutral-900">Authoring lives in the Document Center</h2>
            <p className="text-sm text-neutral-500">
              Marketplace policies are drafted and edited in one surface — the Document Center&rsquo;s
              Marketplace Policy mode — which writes through this same governance API. This desk remains
              the governance view: the registry, the sign-off queue, the precedence matrix, and the
              acceptance registry. Review, sign-off, and publish still happen here; the text is
              authored in exactly one place.
            </p>
            <Link
              href="/admin/docs/marketplace"
              className="mt-3 inline-block rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5"
            >
              Open Marketplace Policy mode
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
