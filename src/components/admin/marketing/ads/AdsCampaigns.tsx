"use client";

// Advertising — Campaigns (Sunny's MARKETING.html table + status tabs).
// Real rows from GET /api/admin/ads/campaigns; status actions PATCH the
// same endpoint family the Ad Center console uses. The Ad Center is a
// first-party platform — there is no Meta/TikTok "Platform" column in
// the real model, so the tier takes that column's place.

import { useMemo, useState } from "react";
import { StatusChip, moneyExact, num, patchJson, useFetch, useToast } from "../frame";

type Campaign = {
  id: string;
  name: string;
  status: string;
  tier_code: string;
  advertiser_name: string | null;
  lifetime_spend_cents: string;
  impressions_today: number;
};

const TABS = ["all", "active", "paused", "draft"] as const;

export default function AdsCampaigns() {
  const { data, loading, error, reload } = useFetch<{ campaigns: Campaign[] }>("/api/admin/ads/campaigns");
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const { toast, node } = useToast();

  const rows = useMemo(() => {
    const all = data?.campaigns ?? [];
    return tab === "all" ? all : all.filter((c) => c.status === tab);
  }, [data, tab]);
  const count = (s: string) => (data?.campaigns ?? []).filter((c) => c.status === s).length;

  async function setStatus(c: Campaign, to: string, verb: string) {
    setBusy(c.id);
    try {
      await patchJson(`/api/admin/ads/campaigns/${c.id}`, { status: to });
      toast(`${c.name}: ${verb}.`);
      await reload();
    } catch {
      toast("That action didn't go through — the list has been refreshed.");
      await reload();
    } finally { setBusy(null); }
  }

  return (
    <div className="card">
      {node}
      <div className="card-pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong>All campaigns</strong>
          <div className="small muted">{count("active")} active · {count("draft")} draft · {count("paused")} paused</div>
        </div>
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Campaign</th><th>Tier</th><th>Status</th><th>Spend</th><th>Impressions today</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}><div className="empty">Loading…</div></td></tr>
            ) : error ? (
              <tr><td colSpan={6}><div className="empty">{error}</div></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6}><div className="empty">No campaigns in this view.</div></td></tr>
            ) : rows.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong><div className="small muted">{c.advertiser_name ?? "—"}</div></td>
                <td>{c.tier_code}</td>
                <td><StatusChip status={c.status} /></td>
                <td>{moneyExact(c.lifetime_spend_cents)}</td>
                <td>{num(c.impressions_today)}</td>
                <td>
                  {c.status === "active" && <button className="btn" disabled={busy === c.id} onClick={() => setStatus(c, "paused", "Paused")}>Pause</button>}
                  {c.status === "paused" && <button className="btn" disabled={busy === c.id} onClick={() => setStatus(c, "active", "Resumed")}>Resume</button>}
                  {c.status === "approved" && <button className="btn" disabled={busy === c.id} onClick={() => setStatus(c, "active", "Activated")}>Activate</button>}
                  {(c.status === "draft" || c.status === "preflight" || c.status === "scheduled") && (
                    <button className="btn" disabled={busy === c.id} onClick={() => setStatus(c, "approved", "Approved")}>Approve</button>
                  )}
                  {c.status === "ended" && <span className="muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
