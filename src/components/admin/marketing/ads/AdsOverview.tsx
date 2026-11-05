"use client";

// Advertising — Overview (Sunny's MARKETING.html "Advertising overview").
// Stats and the spend series come from the real Ad Center endpoints
// (/api/admin/ads/overview + /api/admin/ads/analytics, last 30 days).
// ROAS has no real source — ad_* carries no revenue attribution — so
// the tile says so instead of inventing a multiple.

import { useEffect, useState } from "react";
import { Stat, money, num } from "../frame";

type Overview = {
  advertisers: { status: string; n: number }[];
  campaigns: { status: string; n: number }[];
  review_queue: { preflight: number; special: number; creatives: number };
  today: { impressions: number; clicks: number; spend_cents: number };
  house: { campaigns: number; active: number };
};
type Daily = { delivery_date: string; impressions: number; clicks: number; spend_cents: number };
type Analytics = { totals: { impressions: number; clicks: number; spend_cents: number }; daily: Daily[] };

export default function AdsOverview() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [an, setAn] = useState<Analytics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [a, b] = await Promise.all([
          fetch("/api/admin/ads/overview", { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
          fetch("/api/admin/ads/analytics", { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
        ]);
        setOv(a); setAn(b);
      } catch { setError("Advertising data couldn't be loaded right now."); }
    })();
  }, []);

  if (error) return <div className="notice error">{error}</div>;
  if (!ov || !an) return <div className="empty">Loading…</div>;

  const byStatus = (s: string) => ov.campaigns.find((c) => c.status === s)?.n ?? 0;
  const active = byStatus("active");
  const ctr = an.totals.impressions > 0 ? ((an.totals.clicks / an.totals.impressions) * 100).toFixed(1) : "0.0";
  const days = an.daily.slice(-14);
  const maxSpend = Math.max(1, ...days.map((d) => Number(d.spend_cents)));

  return (
    <>
      <div className="stat-grid">
        <Stat label="Total spend (30 days)" value={money(an.totals.spend_cents)} foot={`${num(an.totals.impressions)} impressions served`} />
        <Stat label="Return on ad spend" value="—" foot="Revenue attribution isn't connected to ad delivery yet" />
        <Stat label="Active campaigns" value={String(active)} foot={`${byStatus("paused")} paused · ${byStatus("draft")} draft · ${ov.review_queue.preflight + ov.review_queue.creatives} in review`} />
        <Stat label="Total clicks" value={num(an.totals.clicks)} foot={`CTR ${ctr}% · ${money(ov.today.spend_cents)} spent today`} />
      </div>
      <div className="card">
        <div className="card-pad">
          <strong>Spend by day</strong>
          <p className="small muted" style={{ margin: "4px 0 14px" }}>Ad delivery spend, last {days.length} days.</p>
          {days.every((d) => Number(d.spend_cents) === 0) ? (
            <div className="empty">No delivery spend recorded in this window.</div>
          ) : (
            days.map((d) => (
              <div key={d.delivery_date} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                <span className="small muted" style={{ width: 86, flexShrink: 0 }}>
                  {new Date(d.delivery_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                <div className="bar" style={{ flex: 1 }}><span style={{ width: `${Math.max(2, (Number(d.spend_cents) / maxSpend) * 100)}%` }} /></div>
                <span className="small" style={{ width: 70, textAlign: "right" }}>{money(d.spend_cents)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
