'use client';

import { useCallback, useEffect, useState } from 'react';
import { Megaphone, RefreshCw } from 'lucide-react';

// ============================================================================
// /admin/advertising — the W9 Advertising Operations console over the
// v2 subsystem (Sunny's Production Ad Architecture, 2026-10-23). One
// engine, one console: the review desk (preflight campaigns + the Y3
// special-category declarations riding on them, and creatives waiting
// in pending_review), campaign status control, advertiser suspension,
// creative approval, rate cards, placements, and the house inventory.
// Every read and write goes to /api/admin/ads/* — the same v2 tables
// the advertiser portal and serve use. There is no auction, bid, or
// pacing control here because the engine has none.
// ============================================================================

type Overview = {
  advertisers: { status: string; n: number }[];
  campaigns: { status: string; n: number }[];
  review_queue: { preflight: number; special: number; creatives: number };
  today: { impressions: number; clicks: number; spend_cents: number };
  house: { campaigns: number; active: number };
};

type QueueCampaign = {
  id: string;
  name: string;
  status: string;
  tier_code: string;
  advertiser_name: string | null;
  advertiser_status: string;
  special_category: string | null;
  special_category_declared: boolean;
  starts_at: string;
  ends_at: string;
  checks: { key: string; ok: boolean; detail: string }[];
};

type QueueCreative = {
  id: string;
  name: string;
  status: string;
  headline: string | null;
  asset_url: string;
  campaign_name: string;
  advertiser_name: string | null;
};

type Campaign = {
  id: string;
  name: string;
  status: string;
  tier_code: string;
  advertiser_name: string | null;
  advertiser_status: string;
  is_system: boolean;
  special_category: string | null;
  lifetime_spend_cents: string;
  impressions_today: number;
};

type Advertiser = {
  id: string;
  display_name: string | null;
  is_system: boolean;
  status: string;
  campaigns: number;
  active_campaigns: number;
  lifetime_spend_cents: string;
};

type Creative = QueueCreative & { campaign_id: string; asset_count: number };

type RateCard = { id: number; name: string; active: boolean };
type RateItem = {
  id: string;
  rate_card_id: number;
  tier_id: number;
  tier_code: string;
  placement_id: number;
  placement_code: string;
  cpm_cents: number;
  active: boolean;
};

type Placement = {
  id: number;
  code: string;
  name: string;
  max_per_page: number;
  active: boolean;
  campaigns: number;
  impressions_today: number;
};

type HouseData = {
  advertiser: { id: string; display_name: string | null; status: string } | null;
  campaigns: {
    id: string;
    name: string;
    status: string;
    active_creatives: number;
    placements: { code: string; cpm_cents: number | null }[] | null;
  }[];
};

const TABS = ['Review', 'Campaigns', 'Advertisers', 'Creatives', 'Rate Cards', 'Placements', 'House'] as const;
type Tab = (typeof TABS)[number];

const money = (cents: string | number) => `$${(Number(cents) / 100).toFixed(2)}`;
const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error('request_failed');
  return res.json();
}
const patch = (url: string, body: Record<string, unknown>) =>
  call(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const post = (url: string, body: Record<string, unknown>) =>
  call(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

export default function AdvertisingConsolePage() {
  const [tab, setTab] = useState<Tab>('Review');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [queue, setQueue] = useState<{ campaigns: QueueCampaign[]; creatives: QueueCreative[] } | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [advertisers, setAdvertisers] = useState<Advertiser[] | null>(null);
  const [creatives, setCreatives] = useState<Creative[] | null>(null);
  const [cards, setCards] = useState<{ cards: RateCard[]; items: RateItem[] } | null>(null);
  const [placements, setPlacements] = useState<Placement[] | null>(null);
  const [house, setHouse] = useState<HouseData | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const [ov, q] = await Promise.all([
        call('/api/admin/ads/overview'),
        call('/api/admin/ads/review-queue'),
      ]);
      setOverview(ov);
      setQueue(q);
      setError('');
    } catch {
      setError("The advertising console couldn't be loaded — refresh to try again.");
    }
  }, []);

  const loadTab = useCallback(
    async (t: Tab) => {
      try {
        if (t === 'Campaigns') {
          const d = await call(`/api/admin/ads/campaigns${statusFilter ? `?status=${statusFilter}` : ''}`);
          setCampaigns(d.campaigns ?? []);
        } else if (t === 'Advertisers') {
          const d = await call('/api/admin/ads/advertisers');
          setAdvertisers(d.advertisers ?? []);
        } else if (t === 'Creatives') {
          const d = await call('/api/admin/ads/creatives');
          setCreatives(d.creatives ?? []);
        } else if (t === 'Rate Cards') {
          setCards(await call('/api/admin/ads/rate-cards'));
        } else if (t === 'Placements') {
          const d = await call('/api/admin/ads/placements');
          setPlacements(d.placements ?? []);
        } else if (t === 'House') {
          setHouse(await call('/api/admin/ads/house'));
        }
      } catch {
        setError("That section couldn't be loaded — refresh to try again.");
      }
    },
    [statusFilter],
  );

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadTab(tab);
  }, [tab, loadTab]);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    setNotice('');
    try {
      await fn();
      setNotice(ok);
      await load();
      await loadTab(tab);
    } catch {
      setError('That action did not go through — the lists have been refreshed.');
      await load();
      await loadTab(tab);
    } finally {
      setBusy(null);
    }
  };

  const campaignStatus = (c: { id: string; name: string }, to: string, verb: string) =>
    act(`campaign-${c.id}-${to}`, () => patch(`/api/admin/ads/campaigns/${c.id}`, { status: to }), `${c.name}: ${verb}.`);
  const creativeStatus = (c: { id: string; name: string }, to: string, verb: string) =>
    act(`creative-${c.id}-${to}`, () => patch(`/api/admin/ads/creatives/${c.id}`, { status: to }), `${c.name}: ${verb}.`);
  const advertiserStatus = (a: Advertiser, to: string, verb: string) =>
    act(`advertiser-${a.id}-${to}`, () => patch(`/api/admin/ads/advertisers/${a.id}`, { status: to }), `${a.display_name ?? 'Advertiser'}: ${verb}.`);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <Megaphone className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Advertising Operations</h1>
        <button
          type="button"
          onClick={() => {
            load();
            loadTab(tab);
          }}
          className="ml-auto flex h-9 items-center gap-2 rounded-lg border px-3 text-sm"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        The operator console over the direct-sold ad engine: review and approve what advertisers submit, control
        campaign status, suspend advertisers, price the rate card, manage placements, and keep house inventory
        filling every page.
      </p>

      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {notice && <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}

      {overview && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border">
            <div className="text-2xl font-semibold">{overview.review_queue.preflight}</div>
            <div className="text-xs text-muted-foreground">
              Campaigns in review{overview.review_queue.special > 0 ? ` · ${overview.review_queue.special} with a special-category declaration` : ''}
            </div>
          </div>
          <div className="rounded-xl border">
            <div className="text-2xl font-semibold">{overview.review_queue.creatives}</div>
            <div className="text-xs text-muted-foreground">Creatives awaiting approval</div>
          </div>
          <div className="rounded-xl border">
            <div className="text-2xl font-semibold">{Number(overview.today.impressions).toLocaleString('en-US')}</div>
            <div className="text-xs text-muted-foreground">
              Impressions today · {money(Number(overview.today.spend_cents))} spent
            </div>
          </div>
          <div className="rounded-xl border">
            <div className="text-2xl font-semibold">
              {overview.house.active}/{overview.house.campaigns}
            </div>
            <div className="text-xs text-muted-foreground">House campaigns active</div>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`h-9 rounded-lg px-4 text-sm font-medium ${tab === t ? 'bg-brand-teal/10 text-brand-teal border border-brand-teal/40' : 'border'}`}
          >
            {t}
            {t === 'Review' && overview ? ` (${overview.review_queue.preflight + overview.review_queue.creatives})` : ''}
          </button>
        ))}
      </div>

      {tab === 'Review' && (
        <div className="mt-6 space-y-8">
          <section>
            <h2 className="text-lg font-semibold">Campaigns awaiting review</h2>
            <p className="text-sm text-muted-foreground">
              Approving moves a campaign to Approved; the advertiser (or this console) then launches it, which
              snapshots its rate-card prices. Returning sends it back to Draft with nothing approved.
            </p>
            {queue?.campaigns.length === 0 && <p className="mt-3 text-sm">Nothing is waiting. </p>}
            <div className="mt-3 space-y-3">
              {queue?.campaigns.map((c) => (
                <div key={c.id} className="rounded-xl border">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    <span className="rounded-full border px-2 py-0.5 text-xs">{c.tier_code}</span>
                    {c.special_category_declared && (
                      <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                        Special ad category: {c.special_category}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {c.advertiser_name ?? 'Advertiser'} · {when(c.starts_at)} → {when(c.ends_at)}
                    </span>
                    <span className="ml-auto flex gap-2">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => campaignStatus(c, 'approved', 'Approved')}
                        className="h-8 rounded-lg border border-border bg-card px-3 text-sm text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => campaignStatus(c, 'draft', 'Returned to draft')}
                        className="h-8 rounded-lg border px-3 text-sm disabled:opacity-50"
                      >
                        Return
                      </button>
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {c.checks.map((ch) => (
                      <li key={ch.key} className={ch.ok ? 'text-emerald-700' : 'text-red-700'}>
                        {ch.ok ? '✓' : '✗'} {ch.key}: {ch.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2 className="text-lg font-semibold">Creatives awaiting approval</h2>
            <p className="text-sm text-muted-foreground">
              A creative serves only after approval. Rejection keeps the record and stops it from ever serving in
              this form.
            </p>
            {queue?.creatives.length === 0 && <p className="mt-3 text-sm">Nothing is waiting.</p>}
            <div className="mt-3 space-y-3">
              {queue?.creatives.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border">
                  {c.asset_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.asset_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{c.headline || c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.campaign_name} · {c.advertiser_name ?? 'Advertiser'}
                    </div>
                  </div>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => creativeStatus(c, 'active', 'Approved')}
                      className="h-8 rounded-lg border border-border bg-card px-3 text-sm text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => creativeStatus(c, 'rejected', 'Rejected')}
                      className="h-8 rounded-lg border px-3 text-sm disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === 'Campaigns' && (
        <div className="mt-6">
          <label className="text-sm">
            Status{' '}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-lg border px-2"
            >
              <option value="">All</option>
              {['draft', 'scheduled', 'preflight', 'approved', 'active', 'paused', 'ended'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3 space-y-3">
            {campaigns?.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border">
                <span className="font-medium">{c.name}</span>
                <span className="rounded-full border px-2 py-0.5 text-xs">{c.status}</span>
                <span className="rounded-full border px-2 py-0.5 text-xs">{c.tier_code}</span>
                {c.special_category && (
                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                    Special: {c.special_category}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {c.advertiser_name ?? 'Advertiser'} · spent {money(c.lifetime_spend_cents)} ·{' '}
                  {Number(c.impressions_today).toLocaleString('en-US')} impressions today
                </span>
                <span className="ml-auto flex gap-2">
                  {c.status === 'preflight' && (
                    <button type="button" disabled={busy !== null} onClick={() => campaignStatus(c, 'approved', 'Approved')} className="h-8 rounded-lg border border-border bg-card px-3 text-sm text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50">
                      Approve
                    </button>
                  )}
                  {c.status === 'approved' && (
                    <button type="button" disabled={busy !== null} onClick={() => campaignStatus(c, 'active', 'Activated')} className="h-8 rounded-lg border border-border bg-card px-3 text-sm text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50">
                      Activate
                    </button>
                  )}
                  {c.status === 'active' && (
                    <button type="button" disabled={busy !== null} onClick={() => campaignStatus(c, 'paused', 'Paused')} className="h-8 rounded-lg border px-3 text-sm disabled:opacity-50">
                      Pause
                    </button>
                  )}
                  {c.status === 'paused' && (
                    <button type="button" disabled={busy !== null} onClick={() => campaignStatus(c, 'active', 'Resumed')} className="h-8 rounded-lg border px-3 text-sm disabled:opacity-50">
                      Resume
                    </button>
                  )}
                  {c.status !== 'ended' && (
                    <button type="button" disabled={busy !== null} onClick={() => campaignStatus(c, 'ended', 'Ended')} className="h-8 rounded-lg border px-3 text-sm text-red-700 disabled:opacity-50">
                      End
                    </button>
                  )}
                </span>
              </div>
            ))}
            {campaigns?.length === 0 && <p className="text-sm">No campaigns match.</p>}
          </div>
        </div>
      )}

      {tab === 'Advertisers' && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-muted-foreground">
            Suspending an advertiser stops their campaigns at the serving gate immediately and blocks launches;
            nothing is deleted, and reactivation restores them.
          </p>
          {advertisers?.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border">
              <span className="font-medium">{a.display_name ?? 'Advertiser'}</span>
              {a.is_system && <span className="rounded-full border px-2 py-0.5 text-xs">House</span>}
              <span className="rounded-full border px-2 py-0.5 text-xs">{a.status}</span>
              <span className="text-xs text-muted-foreground">
                {a.active_campaigns}/{a.campaigns} campaigns active · lifetime spend {money(a.lifetime_spend_cents)}
              </span>
              {!a.is_system && (
                <span className="ml-auto flex gap-2">
                  {a.status === 'active' && (
                    <button type="button" disabled={busy !== null} onClick={() => advertiserStatus(a, 'suspended', 'Suspended')} className="h-8 rounded-lg border px-3 text-sm text-red-700 disabled:opacity-50">
                      Suspend
                    </button>
                  )}
                  {a.status !== 'active' && (
                    <button type="button" disabled={busy !== null} onClick={() => advertiserStatus(a, 'active', 'Reactivated')} className="h-8 rounded-lg border border-border bg-card px-3 text-sm text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50">
                      Reactivate
                    </button>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'Creatives' && (
        <div className="mt-6 space-y-3">
          {creatives?.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border">
              {c.asset_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.asset_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium">{c.headline || c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.campaign_name} · {c.advertiser_name ?? 'Advertiser'} · {c.asset_count} companion asset(s)
                </div>
              </div>
              <span className="rounded-full border px-2 py-0.5 text-xs">{c.status}</span>
              <span className="flex gap-2">
                {c.status === 'pending_review' && (
                  <>
                    <button type="button" disabled={busy !== null} onClick={() => creativeStatus(c, 'active', 'Approved')} className="h-8 rounded-lg border border-border bg-card px-3 text-sm text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50">
                      Approve
                    </button>
                    <button type="button" disabled={busy !== null} onClick={() => creativeStatus(c, 'rejected', 'Rejected')} className="h-8 rounded-lg border px-3 text-sm disabled:opacity-50">
                      Reject
                    </button>
                  </>
                )}
                {c.status === 'active' && (
                  <button type="button" disabled={busy !== null} onClick={() => creativeStatus(c, 'paused', 'Paused')} className="h-8 rounded-lg border px-3 text-sm disabled:opacity-50">
                    Pause
                  </button>
                )}
              </span>
            </div>
          ))}
          {creatives?.length === 0 && <p className="text-sm">No creatives yet.</p>}
        </div>
      )}

      {tab === 'Rate Cards' && (
        <div className="mt-6 space-y-6">
          <p className="text-sm text-muted-foreground">
            Prices are per placement and tier (CPM, cents per 1,000 impressions). Editing a card changes future
            launches only — a launched campaign bills at the snapshot taken when it launched.
          </p>
          {cards?.cards.map((card) => (
            <section key={card.id}>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{card.name}</h3>
                <span className="rounded-full border px-2 py-0.5 text-xs">{card.active ? 'active' : 'inactive'}</span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    act(`card-${card.id}`, () => patch('/api/admin/ads/rate-cards', { id: card.id, active: !card.active }), `Card ${card.active ? 'deactivated' : 'activated'}.`)
                  }
                  className="h-8 rounded-lg border px-3 text-sm disabled:opacity-50"
                >
                  {card.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
              <div className="mt-2 overflow-x-auto">
                <div className="adm-table-wrap"><table className="adm-table">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="py-1 pr-3">Tier</th>
                      <th className="py-1 pr-3">Placement</th>
                      <th className="py-1 pr-3">CPM (cents)</th>
                      <th className="py-1">Save</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cards.items
                      .filter((i) => i.rate_card_id === card.id)
                      .map((i) => (
                        <RateItemRow key={i.id} item={i} busy={busy !== null} act={act} />
                      ))}
                  </tbody>
                </table></div>
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === 'Placements' && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-muted-foreground">
            The serving inventory. A deactivated placement serves nothing. Max per page caps how many ads the
            placement renders on one page.
          </p>
          {placements?.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border">
              <span className="font-medium">{p.name}</span>
              <span className="rounded-full border px-2 py-0.5 text-xs">{p.code}</span>
              <span className="rounded-full border px-2 py-0.5 text-xs">{p.active ? 'active' : 'inactive'}</span>
              <span className="text-xs text-muted-foreground">
                {p.campaigns} campaigns · {Number(p.impressions_today).toLocaleString('en-US')} impressions today ·
                max {p.max_per_page}/page
              </span>
              <span className="ml-auto flex gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    act(`placement-${p.id}`, () => patch('/api/admin/ads/placements', { id: p.id, active: !p.active }), `${p.name} ${p.active ? 'deactivated' : 'activated'}.`)
                  }
                  className="h-8 rounded-lg border px-3 text-sm disabled:opacity-50"
                >
                  {p.active ? 'Deactivate' : 'Activate'}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'House' && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-muted-foreground">
            House inventory is the platform&apos;s own fill: it serves whenever no paid campaign is eligible, so a
            page never renders an empty slot. House campaigns are priced at 0 and never billed.
          </p>
          {house?.campaigns.map((c) => (
            <div key={c.id} className="rounded-xl border">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.name}</span>
                <span className="rounded-full border px-2 py-0.5 text-xs">{c.status}</span>
                <span className="text-xs text-muted-foreground">{c.active_creatives} active creative(s)</span>
                <span className="ml-auto flex gap-2">
                  {c.status === 'active' && (
                    <button type="button" disabled={busy !== null} onClick={() => campaignStatus(c, 'paused', 'Paused')} className="h-8 rounded-lg border px-3 text-sm disabled:opacity-50">
                      Pause
                    </button>
                  )}
                  {c.status === 'paused' && (
                    <button type="button" disabled={busy !== null} onClick={() => campaignStatus(c, 'active', 'Resumed')} className="h-8 rounded-lg border px-3 text-sm disabled:opacity-50">
                      Resume
                    </button>
                  )}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(c.placements ?? []).map((pl) => (
                  <span key={pl.code} className="rounded-full border px-2 py-0.5 text-xs">
                    {pl.code}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {house?.campaigns.length === 0 && <p className="text-sm">No house campaign exists yet.</p>}
        </div>
      )}
    </div>
  );
}

function RateItemRow({
  item,
  busy,
  act,
}: {
  item: RateItem;
  busy: boolean;
  act: (key: string, fn: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
  const [cpm, setCpm] = useState(String(item.cpm_cents));
  return (
    <tr className="border-t">
      <td className="py-2 pr-3">{item.tier_code}</td>
      <td className="py-2 pr-3">{item.placement_code}</td>
      <td className="py-2 pr-3">
        <input
          value={cpm}
          onChange={(e) => setCpm(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          className="h-8 w-24 rounded-lg border px-2"
          aria-label={`CPM for ${item.tier_code} on ${item.placement_code}`}
        />
      </td>
      <td className="py-2">
        <button
          type="button"
          disabled={busy || Number(cpm) === item.cpm_cents}
          onClick={() =>
            act(
              `item-${item.id}`,
              () =>
                post('/api/admin/ads/rate-cards', {
                  rate_card_id: item.rate_card_id,
                  tier_id: item.tier_id,
                  placement_id: item.placement_id,
                  cpm_cents: Number(cpm),
                }),
              'Price saved for future launches.',
            )
          }
          className="h-8 rounded-lg border px-3 text-sm disabled:opacity-50"
        >
          Save
        </button>
      </td>
    </tr>
  );
}
