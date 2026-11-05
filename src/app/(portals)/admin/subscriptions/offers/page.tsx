'use client';

// ============================================================================
// Admin — Subscription Offers (Sunny, 2026-10-14): the authoring seat
// for My Subscriptions. "Any subscription I put on the platform" is
// created here: platform services (shipping, AI services, gift cards,
// the UnSaid Memories subscription, anything else) as per-tenant offer
// records the admin defines — the platform invents no names, prices,
// or cadences. Offers are born inactive; activating one publishes it
// to the My Account catalog of the user types it applies to.
// Wired to /api/admin/subscriptions/offers (module gate: subscriptions).
//
// This seat is distinct from /admin/subscriptions, which manages the
// POS catalog's subscription items (grooming memberships, supply
// boxes — the commerce domain). Platform offers live here.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface Offer {
  id: string;
  name: string;
  category: string;
  description: string | null;
  priceCents: number;
  cadence: string;
  applicableUserTypes: string[];
  isActive: boolean;
  stripeProductId: string | null;
  stripePriceId: string | null;
}

const CATEGORIES = [
  { id: 'shipping', label: 'Shipping' },
  { id: 'ai_services', label: 'AI Services' },
  { id: 'gift_cards', label: 'Gift Cards' },
  { id: 'platform', label: 'UnSaid Memories' },
  { id: 'other', label: 'Other' },
];
const CADENCES = ['day', 'week', 'month', 'year'];
const USER_TYPES = ['customer', 'seller', 'healthcare', 'employee'];

const emptyForm = {
  name: '',
  category: 'platform',
  description: '',
  priceDollars: '',
  cadence: 'month',
  applicableUserTypes: ['customer'] as string[],
  stripeProductId: '',
  stripePriceId: '',
};

export default function AdminSubscriptionOffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/subscriptions/offers', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load offers');
      setOffers(data.offers ?? []);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Could not load offers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleType(t: string) {
    setForm((f) => ({
      ...f,
      applicableUserTypes: f.applicableUserTypes.includes(t)
        ? f.applicableUserTypes.filter((x) => x !== t)
        : [...f.applicableUserTypes, t],
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    const priceCents = Math.round(parseFloat(form.priceDollars || '0') * 100);
    const payload = {
      name: form.name,
      category: form.category,
      description: form.description || null,
      priceCents,
      cadence: form.cadence,
      applicableUserTypes: form.applicableUserTypes,
      stripeProductId: form.stripeProductId || null,
      stripePriceId: form.stripePriceId || null,
    };
    try {
      const res = await fetch('/api/admin/subscriptions/offers', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save the offer');
      setNotice(editingId ? 'Offer updated.' : 'Offer created. It is inactive until you activate it.');
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not save the offer');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(offer: Offer) {
    setError(null);
    try {
      const res = await fetch('/api/admin/subscriptions/offers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: offer.id, isActive: !offer.isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not update the offer');
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not update the offer');
    }
  }

  function startEdit(offer: Offer) {
    setEditingId(offer.id);
    setForm({
      name: offer.name,
      category: offer.category,
      description: offer.description ?? '',
      priceDollars: (offer.priceCents / 100).toFixed(2),
      cadence: offer.cadence,
      applicableUserTypes: offer.applicableUserTypes,
      stripeProductId: offer.stripeProductId ?? '',
      stripePriceId: offer.stripePriceId ?? '',
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Subscription Offers</h1>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">{notice}</div>
      )}

      <section>
        <h2 className="text-lg font-semibold">Offers</h2>
        {loading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading offers…</p>
        ) : offers.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No subscription offers yet. Create the first one below — until an offer is created and
            activated, every My Account catalog reads empty.
          </p>
        ) : (
          <ul className="mt-3 divide-y rounded-lg border">
            {offers.map((offer) => (
              <li key={offer.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">{offer.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {CATEGORIES.find((c) => c.id === offer.category)?.label ?? offer.category} · $
                    {(offer.priceCents / 100).toFixed(2)}/{offer.cadence} · for{' '}
                    {offer.applicableUserTypes.join(', ')}
                  </p>
                  {offer.description && <p className="mt-1 max-w-xl text-sm">{offer.description}</p>}
                </div>
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-2 text-sm">
                    <Switch checked={offer.isActive} onCheckedChange={() => toggleActive(offer)} />
                    {offer.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => startEdit(offer)}>
                    Edit
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border">
        <h2 className="text-lg font-semibold">{editingId ? 'Edit offer' : 'New offer'}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="sub-name">Name</Label>
            <Input
              id="sub-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Free Shipping Club"
            />
          </div>
          <div>
            <Label htmlFor="sub-category">Category</Label>
            <select
              id="sub-category"
              className="mt-1 block h-9 w-full rounded-lg border bg-background px-3 text-sm"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="sub-price">Price (USD)</Label>
            <Input
              id="sub-price"
              inputMode="decimal"
              value={form.priceDollars}
              onChange={(e) => setForm({ ...form, priceDollars: e.target.value })}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="sub-cadence">Cadence</Label>
            <select
              id="sub-cadence"
              className="mt-1 block h-9 w-full rounded-lg border bg-background px-3 text-sm"
              value={form.cadence}
              onChange={(e) => setForm({ ...form, cadence: e.target.value })}
            >
              {CADENCES.map((c) => (
                <option key={c} value={c}>per {c}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="sub-desc">Description</Label>
            <Input
              id="sub-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Available to</Label>
            <div className="mt-2 flex flex-wrap gap-4">
              {USER_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.applicableUserTypes.includes(t)}
                    onChange={() => toggleType(t)}
                  />
                  {t}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="sub-sp">Stripe product ID (optional)</Label>
            <Input
              id="sub-sp"
              value={form.stripeProductId}
              onChange={(e) => setForm({ ...form, stripeProductId: e.target.value })}
              placeholder="prod_…"
            />
          </div>
          <div>
            <Label htmlFor="sub-spr">Stripe price ID (optional)</Label>
            <Input
              id="sub-spr"
              value={form.stripePriceId}
              onChange={(e) => setForm({ ...form, stripePriceId: e.target.value })}
              placeholder="price_…"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={save} disabled={saving || !form.name || form.applicableUserTypes.length === 0}>
            {editingId ? 'Save changes' : 'Create offer'}
          </Button>
          {editingId && (
            <Button
              variant="outline"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
            >
              Cancel edit
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
