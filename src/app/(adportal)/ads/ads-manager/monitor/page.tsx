"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
const fmtN = (n: unknown) => (Number(n) || 0).toLocaleString("en-US");

export default function Page() {
  const [notifs, setNotifs] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [byCampaign, setByCampaign] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/notifications").then((r) => (r.ok ? r.json() : { notifications: [] })).then((d) => setNotifs(d.notifications ?? [])).catch(() => {});
    fetch("/api/ads/campaigns").then((r) => (r.ok ? r.json() : { campaigns: [] })).then((d) => setCampaigns(d.campaigns ?? [])).catch(() => {});
    fetch("/api/ads/analytics?days=30").then((r) => (r.ok ? r.json() : null)).then((d) => setByCampaign(d?.byCampaign ?? [])).catch(() => {});
  }, []);
  const perf = new Map(byCampaign.map((c: any) => [String(c.id), c]));
  const health = campaigns.map((c) => {
    const a = perf.get(String(c.id));
    const imps = a?.impressions ?? 0;
    return { id: c.id, name: c.name, status: c.status, imps, delivery: c.status !== "active" ? c.status : imps > 0 ? "Delivering" : "Active — no delivery in 30d" };
  });
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Monitor</h1>
        <p className="mt-1 text-sm text-neutral-500">Delivery health and account alerts, from the live records.</p>
      </div>
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">Alerts</h2>
      <div className="mb-8 space-y-2">
        {notifs.length === 0 && <p className="text-sm text-neutral-500">No notifications on this account.</p>}
        {notifs.slice(0, 10).map((n) => (
          <div key={n.id} className="rounded-xl border border-neutral-100 bg-white p-4">
            <p className="text-sm font-medium text-neutral-900">{n.title ?? n.type ?? "Notification"}</p>
            <p className="mt-0.5 text-sm text-neutral-600">{n.body ?? n.message ?? ""}</p>
            <p className="mt-1 text-xs text-neutral-400">{n.created_at ? new Date(n.created_at).toLocaleString("en-US") : ""}</p>
          </div>
        ))}
      </div>
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">Campaign health — last 30 days</h2>
      <div className="rounded-xl border border-neutral-100 bg-white">
        <table className="w-full">
          <thead><tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400"><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Impressions</th><th className="px-4 py-3">Delivery</th></tr></thead>
          <tbody>
            {health.map((h) => (
              <tr key={h.id} className="border-b border-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-700"><Link href={`/ads/campaigns/${h.id}`} className="font-medium text-neutral-900 hover:underline">{h.name}</Link></td>
                <td className="px-4 py-3 text-sm text-neutral-700">{h.status}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{fmtN(h.imps)}</td>
                <td className="px-4 py-3 text-sm text-neutral-700">{h.delivery}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-neutral-400">Pacing percentages and threshold alerts aren't computed by this system — health here is status plus recorded delivery, nothing invented.</p>
    </div>
  );
}
