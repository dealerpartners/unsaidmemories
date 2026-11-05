"use client";

// Advertising — Creatives (Sunny's MARKETING.html tile grid). Real rows
// from GET /api/admin/ads/creatives; pending-review creatives carry the
// console's Approve / Reject actions (PATCH status). Per-creative CTR
// isn't tracked by the delivery engine, so tiles carry status and
// campaign instead of an invented click rate.

import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { StatusChip, patchJson, useFetch, useToast } from "../frame";

type Creative = {
  id: string;
  name: string;
  status: string;
  headline: string | null;
  asset_url: string;
  campaign_name: string;
  advertiser_name: string | null;
  asset_count: number;
};

export default function AdsCreatives() {
  const { data, loading, error, reload } = useFetch<{ creatives: Creative[] }>("/api/admin/ads/creatives");
  const [busy, setBusy] = useState<string | null>(null);
  const { toast, node } = useToast();
  const rows = data?.creatives ?? [];

  async function setStatus(c: Creative, to: string, verb: string) {
    setBusy(c.id);
    try {
      await patchJson(`/api/admin/ads/creatives/${c.id}`, { status: to });
      toast(`${c.name}: ${verb}.`);
      await reload();
    } catch {
      toast("That action didn't go through — the list has been refreshed.");
      await reload();
    } finally { setBusy(null); }
  }

  if (loading) return <div className="card"><div className="empty">Loading…</div></div>;
  if (error) return <div className="notice error">{error}</div>;
  if (rows.length === 0) return <div className="card"><div className="empty"><ImageIcon />No creatives yet. Approved creatives from advertiser campaigns will appear here.</div></div>;

  return (
    <div className="grid-3">
      {node}
      {rows.map((c) => (
        <div className="card card-pad" key={c.id}>
          {c.asset_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="thumb" src={c.asset_url} alt="" />
          ) : (
            <div className="thumb" style={{ display: "grid", placeItems: "center", color: "#7d8a90" }}><ImageIcon /></div>
          )}
          <div className="metric-tile" style={{ border: 0, padding: "10px 0 0" }}>
            <div className="label">{c.name}</div>
            <div style={{ marginTop: 6 }}><StatusChip status={c.status} /></div>
            <div className="small muted" style={{ marginTop: 6 }}>
              {c.headline ?? c.campaign_name} · {c.asset_count} asset{c.asset_count === 1 ? "" : "s"}
              {c.advertiser_name ? ` · ${c.advertiser_name}` : ""}
            </div>
            {c.status === "pending_review" && (
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <button className="btn primary" disabled={busy === c.id} onClick={() => setStatus(c, "active", "Approved")}>Approve</button>
                <button className="btn danger" disabled={busy === c.id} onClick={() => setStatus(c, "rejected", "Rejected")}>Reject</button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
