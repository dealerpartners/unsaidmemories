'use client';

// ============================================================================
// PromoBuilderScreen — the admin Promo Builder (owner spec §3).
//
// Fields: name, code (unique per tenant, uppercase), type
// (percent_off | dollars_off | free_addon), value, applies-to multi-select,
// eligibility (new/existing/all), start/end date, max total uses, max uses
// per user, stackable (default false per promo rules).
//
// Publish to pages (multi-select): Services, Pricing, Shop, Book, Portal
// dashboard, Checkout. States: draft (invisible) → published (visible on
// selected placements). Advanced catalog rules: qualifying services, min
// subtotal, second-pet rule, birthday-month rule, one-per-pet.
//
// Data: GET/POST /api/admin/promos + PATCH /api/admin/promos/[id] — every
// route is admin-gated server-side (the permission grid owns the deeper
// module grants).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Tag, Plus, Pencil, Power, PowerOff, AlertCircle, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

type PromoType = 'percent_off' | 'dollars_off' | 'free_addon';
type Eligibility = 'new' | 'existing' | 'all';
type Placement = 'services' | 'pricing' | 'shop' | 'book' | 'portal' | 'checkout';
type Scope = 'services' | 'packages' | 'addons' | 'subscriptions';

type Promo = {
  id: string;
  name: string;
  code: string;
  kind: 'standard' | 'cause';
  promo_type: PromoType;
  value: string;
  applies_to: Scope[];
  eligibility: Eligibility;
  starts_at: string | null;
  ends_at: string | null;
  max_total_uses: number | null;
  max_uses_per_user: number;
  one_per_dependent: boolean;
  stackable: boolean;
  placements: Placement[];
  status: 'draft' | 'published';
  description: string | null;
  fine_print: string | null;
  cta_label: string | null;
  qualifying_names: string[] | null;
  min_subtotal_cents: number | null;
  requires_recent_booking: boolean;
  requires_birthday_month: boolean;
  redemptions?: number;
};

type Draft = {
  name: string;
  code: string;
  kind: 'standard' | 'cause';
  promo_type: PromoType;
  value: string;
  applies_to: Scope[];
  eligibility: Eligibility;
  starts_at: string;
  ends_at: string;
  max_total_uses: string;
  max_uses_per_user: string;
  one_per_dependent: boolean;
  stackable: boolean;
  placements: Placement[];
  status: 'draft' | 'published';
  description: string;
  fine_print: string;
  cta_label: string;
  qualifying_names: string;
  min_subtotal_cents: string;
  requires_recent_booking: boolean;
  requires_birthday_month: boolean;
};

const EMPTY_DRAFT: Draft = {
  name: '',
  code: '',
  kind: 'standard',
  promo_type: 'percent_off',
  value: '15',
  applies_to: ['services'],
  eligibility: 'all',
  starts_at: '',
  ends_at: '',
  max_total_uses: '',
  max_uses_per_user: '1',
  one_per_dependent: false,
  stackable: false,
  placements: ['book', 'portal'],
  status: 'draft',
  description: '',
  fine_print: '',
  cta_label: 'Book',
  qualifying_names: '',
  min_subtotal_cents: '',
  requires_recent_booking: false,
  requires_birthday_month: false,
};

const ALL_PLACEMENTS: { id: Placement; label: string }[] = [
  { id: 'services', label: 'Services' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'shop', label: 'Shop' },
  { id: 'book', label: 'Book' },
  { id: 'portal', label: 'Portal dashboard' },
  { id: 'checkout', label: 'Checkout' },
];

const ALL_SCOPES: { id: Scope; label: string }[] = [
  { id: 'services', label: 'Services' },
  { id: 'packages', label: 'Packages' },
  { id: 'addons', label: 'Add-ons' },
  { id: 'subscriptions', label: 'Subscriptions' },
];

const toDateInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '');
const toCentsInput = (cents: number | null) => (cents != null ? String(Math.round(cents / 100)) : '');

export function PromoBuilderScreen() {
  const [promos, setPromos] = useState<Promo[] | null>(null);
  const [editing, setEditing] = useState<Promo | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/promos', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Failed to load promos.');
        setPromos([]);
        return;
      }
      const stats = data?.stats || {};
      setPromos(
        (Array.isArray(data?.promos) ? data.promos : []).map((p: Promo) => ({
          ...p,
          redemptions: stats[p.id]?.total ?? 0,
        })),
      );
    } catch {
      setError('Failed to load promos.');
      setPromos([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startCreate = () => {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setShowForm(true);
    setError('');
    setSaved(false);
  };

  const startEdit = (p: Promo) => {
    setEditing(p);
    setDraft({
      name: p.name,
      code: p.code,
      kind: p.kind,
      promo_type: p.promo_type,
      value: p.value,
      applies_to: p.applies_to || ['services'],
      eligibility: p.eligibility,
      starts_at: toDateInput(p.starts_at),
      ends_at: toDateInput(p.ends_at),
      max_total_uses: p.max_total_uses != null ? String(p.max_total_uses) : '',
      max_uses_per_user: String(p.max_uses_per_user ?? 1),
      one_per_dependent: !!p.one_per_dependent,
      stackable: !!p.stackable,
      placements: p.placements || [],
      status: p.status,
      description: p.description || '',
      fine_print: p.fine_print || '',
      cta_label: p.cta_label || 'Book',
      qualifying_names: (p.qualifying_names || []).join(', '),
      min_subtotal_cents: toCentsInput(p.min_subtotal_cents),
      requires_recent_booking: !!p.requires_recent_booking,
      requires_birthday_month: !!p.requires_birthday_month,
    });
    setShowForm(true);
    setError('');
    setSaved(false);
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const payload: Record<string, unknown> = {
        name: draft.name,
        code: draft.code,
        kind: draft.kind,
        promo_type: draft.promo_type,
        value: draft.value,
        applies_to: draft.applies_to,
        eligibility: draft.eligibility,
        starts_at: draft.starts_at || null,
        ends_at: draft.ends_at || null,
        max_total_uses: draft.max_total_uses === '' ? null : Number(draft.max_total_uses),
        max_uses_per_user: Number(draft.max_uses_per_user) || 1,
        one_per_dependent: draft.one_per_dependent,
        stackable: draft.stackable,
        placements: draft.placements,
        status: draft.status,
        description: draft.description || null,
        fine_print: draft.fine_print || null,
        cta_label: draft.cta_label || null,
        qualifying_names: draft.qualifying_names.trim() === '' ? null : draft.qualifying_names.split(',').map((s) => s.trim()).filter(Boolean),
        min_subtotal_cents: draft.min_subtotal_cents === '' ? null : Math.round(Number(draft.min_subtotal_cents) * 100),
        requires_recent_booking: draft.requires_recent_booking,
        requires_birthday_month: draft.requires_birthday_month,
      };
      const res = await fetch(
        editing ? `/api/admin/promos/${editing.id}` : '/api/admin/promos',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Save failed.');
        return;
      }
      setSaved(true);
      setShowForm(false);
      await load();
    } catch {
      setError('Network problem — try again.');
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async (p: Promo) => {
    const next = p.status === 'published' ? 'draft' : 'published';
    await fetch(`/api/admin/promos/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    }).catch(() => {});
    await load();
  };

  const typeLabel = useMemo(
    () =>
      ({
        percent_off: '% off',
        dollars_off: '$ off',
        free_addon: 'free add-on',
      } as Record<PromoType, string>),
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[18px] font-bold text-foreground">
            <Tag className="h-5 w-5 text-gold-deep" aria-hidden="true" />
            Promo Codes & Offers
          </h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Cause discounts, standing codes, placements, and usage rules — enforced server-side at
            checkout. One code per booking; codes don&apos;t stack.
          </p>
        </div>
        <Button onClick={startCreate} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden="true" />
          New promo
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
          <p className="text-[13px] text-red-700">{error}</p>
        </div>
      )}
      {saved && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
          <Check className="h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
          <p className="text-[13px] text-green-700">Saved.</p>
        </div>
      )}

      {/* ---- the list ---- */}
      {promos === null ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : promos.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
          <p className="text-[14px] font-semibold text-foreground">No promos yet</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Create the first offer — codes validate server-side everywhere they render.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
                <tr className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-3">Promo</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Window</th>
                  <th className="px-4 py-3">Placements</th>
                  <th className="px-4 py-3 text-right">Uses</th>
                  <th className="px-4 py-3 text-right">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {promos.map((p) => (
                  <tr key={p.id} className="text-[13px] text-foreground">
                    <td className="px-4 py-3">
                      <p className="font-semibold">
                        {p.name}
                        {p.kind === 'cause' && (
                          <Badge variant="secondary" className="ml-2 bg-pink-100 text-pink-700">cause</Badge>
                        )}
                      </p>
                      <code className="mt-0.5 block text-[12px] font-bold tracking-[0.08em] text-muted-foreground">{p.code}</code>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {typeLabel[p.promo_type]} · {p.promo_type === 'percent_off' ? `${p.value}%` : p.promo_type === 'dollars_off' ? `$${p.value}` : p.value}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground">
                      {toDateInput(p.starts_at) || '—'} → {toDateInput(p.ends_at) || '∞'}
                      <span className="mt-0.5 block text-[11px]">
                        {p.eligibility === 'all' ? 'everyone' : `${p.eligibility} customers`}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-[220px] flex-wrap gap-1">
                        {(p.placements || []).length === 0 ? (
                          <span className="text-[12px] text-muted-foreground">none</span>
                        ) : (
                          (p.placements || []).map((pl) => (
                            <span key={pl} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                              {pl}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {p.redemptions ?? 0}
                      {p.max_total_uses != null ? ` / ${p.max_total_uses}` : ''}
                      <span className="mt-0.5 block text-[11px]">{p.max_uses_per_user}/user</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em]',
                          p.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500',
                        )}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          aria-label={`Edit ${p.code}`}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => togglePublish(p)}
                          aria-label={p.status === 'published' ? `Unpublish ${p.code}` : `Publish ${p.code}`}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          {p.status === 'published' ? (
                            <PowerOff className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Power className="h-4 w-4 text-green-600" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- the builder form ---- */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
            <p className="text-[14px] font-semibold text-foreground">
              {editing ? `Edit ${editing.code}` : 'New promo'}
            </p>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-[12px] font-semibold text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>

          <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="promo-name">Name</Label>
              <Input
                id="promo-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Pretty in Pink — Breast Cancer Awareness"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="promo-code">Code (unique, uppercase)</Label>
              <Input
                id="promo-code"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                placeholder="PINKPAW"
                disabled={!!editing}
                className="mt-1.5 font-semibold uppercase tracking-[0.06em]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="promo-kind">Kind</Label>
                <select
                  id="promo-kind"
                  value={draft.kind}
                  onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft['kind'] })}
                  className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-[14px]"
                >
                  <option value="standard">Standard</option>
                  <option value="cause">Cause</option>
                </select>
              </div>
              <div>
                <Label htmlFor="promo-type">Type</Label>
                <select
                  id="promo-type"
                  value={draft.promo_type}
                  onChange={(e) => setDraft({ ...draft, promo_type: e.target.value as PromoType, value: e.target.value === 'free_addon' ? 'Teeth Brushing' : '15' })}
                  className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-[14px]"
                >
                  <option value="percent_off">Percent off</option>
                  <option value="dollars_off">Dollars off</option>
                  <option value="free_addon">Free add-on</option>
                </select>
              </div>
            </div>
            <div>
              <Label htmlFor="promo-value">
                Value {draft.promo_type === 'percent_off' ? '(%)' : draft.promo_type === 'dollars_off' ? '($)' : '(add-on name)'}
              </Label>
              <Input
                id="promo-value"
                value={draft.value}
                onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Applies to</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {ALL_SCOPES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={draft.applies_to.includes(s.id)}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        applies_to: draft.applies_to.includes(s.id)
                          ? draft.applies_to.filter((x) => x !== s.id)
                          : [...draft.applies_to, s.id],
                      })
                    }
                    className={cn(
                      'rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors',
                      draft.applies_to.includes(s.id)
                        ? 'border-gold-deep bg-amber-50 text-foreground'
                        : 'border-border bg-white text-muted-foreground hover:border-neutral-300',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="promo-eligibility">Eligibility</Label>
              <select
                id="promo-eligibility"
                value={draft.eligibility}
                onChange={(e) => setDraft({ ...draft, eligibility: e.target.value as Eligibility })}
                className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-[14px]"
              >
                <option value="all">All customers</option>
                <option value="new">New accounts only</option>
                <option value="existing">Existing customers</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="promo-starts">Start date</Label>
                <Input
                  id="promo-starts"
                  type="date"
                  value={draft.starts_at}
                  onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="promo-ends">End date</Label>
                <Input
                  id="promo-ends"
                  type="date"
                  value={draft.ends_at}
                  onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="promo-max-total">Max total uses</Label>
                <Input
                  id="promo-max-total"
                  type="number"
                  min={0}
                  placeholder="∞"
                  value={draft.max_total_uses}
                  onChange={(e) => setDraft({ ...draft, max_total_uses: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="promo-max-user">Max uses per user</Label>
                <Input
                  id="promo-max-user"
                  type="number"
                  min={1}
                  value={draft.max_uses_per_user}
                  onChange={(e) => setDraft({ ...draft, max_uses_per_user: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <Label>Publish to pages</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {ALL_PLACEMENTS.map((pl) => (
                  <button
                    key={pl.id}
                    type="button"
                    aria-pressed={draft.placements.includes(pl.id)}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        placements: draft.placements.includes(pl.id)
                          ? draft.placements.filter((x) => x !== pl.id)
                          : [...draft.placements, pl.id],
                      })
                    }
                    className={cn(
                      'rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors',
                      draft.placements.includes(pl.id)
                        ? 'border-gold-deep bg-amber-50 text-foreground'
                        : 'border-border bg-white text-muted-foreground hover:border-neutral-300',
                    )}
                  >
                    {pl.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                Draft promos are invisible everywhere; published promos show only on the pages you
                pick (subject to each customer&apos;s eligibility).
              </p>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="promo-description">Offer description (what the customer sees)</Label>
              <Input
                id="promo-description"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="All October — 15% off any Bath & Haircut."
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="promo-fine">Fine print</Label>
              <Input
                id="promo-fine"
                value={draft.fine_print}
                onChange={(e) => setDraft({ ...draft, fine_print: e.target.value })}
                placeholder="One per pet, not combinable with other promos."
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="promo-cta">CTA label</Label>
              <Input
                id="promo-cta"
                value={draft.cta_label}
                onChange={(e) => setDraft({ ...draft, cta_label: e.target.value })}
                placeholder="Book"
                className="mt-1.5"
              />
            </div>

            {/* Advanced catalog rules */}
            <div className="sm:col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                Enforcement rules
              </p>
            </div>
            <div>
              <Label htmlFor="promo-qualifying">Qualifying services (comma-separated names)</Label>
              <Input
                id="promo-qualifying"
                value={draft.qualifying_names}
                onChange={(e) => setDraft({ ...draft, qualifying_names: e.target.value })}
                placeholder="Bath & Haircut, Bath Only"
                className="mt-1.5"
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                The booking must include one of these services for the code to apply. Blank = any.
              </p>
            </div>
            <div>
              <Label htmlFor="promo-min">Minimum subtotal ($)</Label>
              <Input
                id="promo-min"
                type="number"
                min={0}
                placeholder="none"
                value={draft.min_subtotal_cents}
                onChange={(e) => setDraft({ ...draft, min_subtotal_cents: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-3 sm:col-span-2">
              {(
                [
                  ['one_per_dependent', 'One per pet'],
                  ['requires_recent_booking', 'Second-pet rule (recent booking required)'],
                  ['requires_birthday_month', 'Birthday-month rule (pet\'s birth month)'],
                  ['stackable', 'Stackable (rare — default off)'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-[13px] text-foreground">
                  <input
                    type="checkbox"
                    checked={draft[key]}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
                    className="h-4 w-4 rounded border-border accent-gold-deep"
                  />
                  {label}
                </label>
              ))}
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="promo-status">Status</Label>
              <div className="mt-1.5 flex gap-2">
                {(['draft', 'published'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={draft.status === s}
                    onClick={() => setDraft({ ...draft, status: s })}
                    className={cn(
                      'rounded-full border px-4 py-1.5 text-[12px] font-bold uppercase tracking-[0.06em] transition-colors',
                      draft.status === s
                        ? s === 'published'
                          ? 'border-green-600 bg-green-50 text-green-700'
                          : 'border-border bg-muted text-foreground'
                        : 'border-border bg-white text-muted-foreground',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border px-5 py-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || !draft.name.trim() || !draft.code.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {editing ? 'Save changes' : 'Create promo'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
