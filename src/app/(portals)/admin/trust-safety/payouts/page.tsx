'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Hourglass, Snowflake, ArrowLeft, ShieldAlert } from 'lucide-react';
import TrustSafetyNav from '@/components/admin/TrustSafetyNav';

// Trust Center · Payout Delay & Cases — the control pane for the decided
// Connect model (agency model, destination charges, delay_days 3/5/7 by
// tier; buyer Cases freeze the transaction's payout; platform intervenes
// release / refund / reverse). All data is real records from
// /api/admin/trust-safety/payout-delay. No live Stripe calls happen from
// here — actions are recorded with their payload descriptors in the
// seller audit log, and execution is production-side only.

type Policy = { tiers: Array<{ tier: string; delay_days: number }>; default_tier: string | null };
type SellerRow = {
  id: string;
  display_name: string;
  legal_name: string;
  status: string;
  seller_type: string;
  commission_rate: number | null;
  recorded_tier: string | null;
  capabilities_status: string | null;
  delay_days: number | null;
  delay_source: 'tier' | 'default_tier' | 'unconfigured';
  connected_account: { recorded: boolean; note: string };
  open_cases: number;
  frozen_cases: number;
};
type CaseRow = {
  id: string;
  seller_id: string;
  seller_name: string;
  order_id: string | null;
  status: string | null;
  dispute_type: string | null;
  notes: string | null;
  created_at: string;
  order_payment_intent_id: string | null;
};
type Pane = {
  policy: Policy;
  sellers: SellerRow[];
  cases: CaseRow[];
  model: { scenario_a: string; scenario_b: string; execution: string; connected_account_gap: string };
};

const DAY_OPTIONS = [3, 5, 7];
const TERMINAL = new Set(['released', 'refunded', 'reversed']);

export default function PayoutDelayPage() {
  const [pane, setPane] = useState<Pane | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newTier, setNewTier] = useState('');
  const [newDays, setNewDays] = useState(7);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/trust-safety/payout-delay');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to load');
      setPane(j);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      try {
        const r = await fetch('/api/admin/trust-safety/payout-delay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Action failed');
        await load();
      } catch (e: any) {
        setError(e?.message || 'Action failed');
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/trust-safety" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Trust & Safety
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2 mt-2">
          <Hourglass className="size-6" /> Payout Delay & Cases
        </h1>
      </div>

      <TrustSafetyNav />

      {error && (
        <div className="bg-card border border-destructive/40 rounded-xl px-5 py-3 text-[13px] text-destructive">
          {error}
        </div>
      )}

      {pane && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-[15px] font-semibold">Scenario A — smooth order</h2>
            <p className="text-[13px] text-muted-foreground mt-1">{pane.model.scenario_a}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-[15px] font-semibold flex items-center gap-2">
              <Snowflake className="size-4" /> Scenario B — dispute filed
            </h2>
            <p className="text-[13px] text-muted-foreground mt-1">{pane.model.scenario_b}</p>
            <p className="text-[12px] text-muted-foreground mt-2">{pane.model.execution}</p>
          </div>
        </div>
      )}

      {/* ---- Tier -> delay policy ---- */}
      <div className="bg-card border border-border rounded-xl">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-[15px] font-semibold">Tier → payout delay policy</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Per-tenant configuration. Delay values are the ruling&apos;s three: 3, 5, or 7 days. A seller with
            no recorded tier falls under the default band; with no default, their delay is unconfigured —
            never silently assumed.
          </p>
        </div>
        <div className="p-5 space-y-3">
          {loading ? (
            <p className="text-[13px] text-muted-foreground">Loading…</p>
          ) : !pane?.policy.tiers.length ? (
            <p className="text-[13px] text-muted-foreground">
              No bands configured for this tenant yet. Add the first band below.
            </p>
          ) : (
            pane.policy.tiers.map((t) => (
              <div key={t.tier} className="flex flex-wrap items-center gap-3 text-[13px]">
                <span className="font-medium text-foreground min-w-40">{t.tier}</span>
                <select
                  className="border border-border rounded-lg px-2 py-1.5 bg-background"
                  value={t.delay_days}
                  disabled={busy}
                  onChange={(e) => act({ action: 'set_tier_band', tier: t.tier, delay_days: Number(e.target.value) })}
                >
                  {DAY_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d} days</option>
                  ))}
                </select>
                {pane.policy.default_tier === t.tier && (
                  <span className="px-2 py-0.5 rounded-full bg-muted text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    default band
                  </span>
                )}
              </div>
            ))
          )}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border text-[13px]">
            <input
              className="border border-border rounded-lg px-3 py-1.5 bg-background min-w-40"
              placeholder="New band name (e.g. Trusted)"
              value={newTier}
              onChange={(e) => setNewTier(e.target.value)}
            />
            <select
              className="border border-border rounded-lg px-2 py-1.5 bg-background"
              value={newDays}
              onChange={(e) => setNewDays(Number(e.target.value))}
            >
              {DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>{d} days</option>
              ))}
            </select>
            <button
              className="px-3 py-1.5 border border-border rounded-lg font-semibold hover:bg-muted disabled:opacity-50"
              disabled={busy || !newTier.trim()}
              onClick={async () => {
                await act({ action: 'set_tier_band', tier: newTier.trim(), delay_days: newDays });
                setNewTier('');
              }}
            >
              Add band
            </button>
            <span className="text-muted-foreground">Default band:</span>
            <select
              className="border border-border rounded-lg px-2 py-1.5 bg-background"
              value={pane?.policy.default_tier ?? ''}
              disabled={busy}
              onChange={(e) => act({ action: 'set_default_tier', tier: e.target.value || null })}
            >
              <option value="">— none —</option>
              {pane?.policy.tiers.map((t) => (
                <option key={t.tier} value={t.tier}>{t.tier}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ---- Sellers ---- */}
      <div className="bg-card border border-border rounded-xl">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-[15px] font-semibold">Sellers — tier, derived delay, connected account</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            The tier is an admin-assigned record on the seller&apos;s capabilities until the performance-score
            machinery (KPI snapshots) is wired — no score is computed or invented here.
          </p>
        </div>
        {loading ? (
          <div className="p-12 text-center text-[13px] text-muted-foreground">Loading…</div>
        ) : !pane?.sellers.length ? (
          <div className="p-12 text-center text-[13px] text-muted-foreground">No sellers in this tenant.</div>
        ) : (
          <ul className="divide-y divide-border">
            {pane.sellers.map((s) => (
              <li key={s.id} className="px-5 py-4 space-y-2">
                <div className="flex flex-wrap items-center gap-3 text-[13px]">
                  <span className="font-semibold text-foreground">{s.display_name}</span>
                  <span className="px-2 py-0.5 rounded-full bg-muted text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {s.status}
                  </span>
                  <span className="text-muted-foreground">{s.seller_type.replace(/_/g, ' ')}</span>
                  {s.frozen_cases > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-[11px] font-semibold uppercase tracking-wider">
                      <Snowflake className="size-3" /> {s.frozen_cases} frozen
                    </span>
                  )}
                  {s.open_cases > 0 && (
                    <span className="text-muted-foreground">{s.open_cases} open case{s.open_cases === 1 ? '' : 's'}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[13px]">
                  <span className="text-muted-foreground">Tier:</span>
                  <select
                    className="border border-border rounded-lg px-2 py-1.5 bg-background"
                    value={s.recorded_tier ?? ''}
                    disabled={busy}
                    onChange={(e) => act({ action: 'assign_tier', seller_id: s.id, tier: e.target.value || null })}
                  >
                    <option value="">— none recorded —</option>
                    {pane.policy.tiers.map((t) => (
                      <option key={t.tier} value={t.tier}>{t.tier}</option>
                    ))}
                    {s.recorded_tier && !pane.policy.tiers.some((t) => t.tier === s.recorded_tier) && (
                      <option value={s.recorded_tier}>{s.recorded_tier} (not in policy)</option>
                    )}
                  </select>
                  <span className="text-muted-foreground">Payout delay:</span>
                  <span className="font-medium text-foreground">
                    {s.delay_days
                      ? `${s.delay_days} days (${s.delay_source === 'tier' ? 'by tier' : 'default band'})`
                      : 'Not configured'}
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
                  <ShieldAlert className="size-3.5 shrink-0" />
                  Connected account: {s.connected_account.note}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- Cases (Scenario B) ---- */}
      <div className="bg-card border border-border rounded-xl">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-[15px] font-semibold">Cases — payout locks & platform interventions</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Freezing locks the case transaction&apos;s payout. Interventions apply only to a frozen case and
            are recorded against it with the Stripe call production-side execution will send.
          </p>
        </div>
        {loading ? (
          <div className="p-12 text-center text-[13px] text-muted-foreground">Loading…</div>
        ) : !pane?.cases.length ? (
          <div className="p-12 text-center">
            <p className="text-[14px] font-medium text-foreground">No cases</p>
            <p className="text-[13px] text-muted-foreground mt-1">
              Buyer-filed cases against sellers will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {pane.cases.map((cs) => {
              const frozen = cs.status === 'frozen';
              const terminal = cs.status != null && TERMINAL.has(cs.status);
              return (
                <li key={cs.id} className="px-5 py-4 flex flex-wrap items-center gap-3 text-[13px]">
                  <span className="font-medium text-foreground">{cs.seller_name}</span>
                  <span className="text-muted-foreground">{cs.dispute_type || 'case'}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider ${ frozen ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground' }`}
                  >
                    {cs.status || 'open'}
                  </span>
                  <span className="text-muted-foreground/60 text-[12px]">
                    {new Date(cs.created_at).toLocaleDateString()}
                  </span>
                  <span className="ml-auto flex gap-2">
                    {!frozen && !terminal && (
                      <button
                        className="px-3 py-1.5 border border-border rounded-lg font-semibold hover:bg-muted disabled:opacity-50"
                        disabled={busy}
                        onClick={() => act({ action: 'case_freeze', dispute_id: cs.id })}
                      >
                        Freeze payout
                      </button>
                    )}
                    {frozen && (
                      <>
                        <button
                          className="px-3 py-1.5 border border-border rounded-lg font-semibold hover:bg-muted disabled:opacity-50"
                          disabled={busy}
                          onClick={() => act({ action: 'case_intervene', dispute_id: cs.id, intervention: 'release' })}
                        >
                          Release
                        </button>
                        <button
                          className="px-3 py-1.5 border border-border rounded-lg font-semibold hover:bg-muted disabled:opacity-50"
                          disabled={busy}
                          onClick={() => act({ action: 'case_intervene', dispute_id: cs.id, intervention: 'refund' })}
                        >
                          Refund buyer
                        </button>
                        <button
                          className="px-3 py-1.5 border border-border rounded-lg font-semibold hover:bg-muted disabled:opacity-50"
                          disabled={busy}
                          onClick={() => act({ action: 'case_intervene', dispute_id: cs.id, intervention: 'reverse' })}
                        >
                          Reverse
                        </button>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
