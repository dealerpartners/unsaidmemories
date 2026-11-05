"use client";

import { useEffect, useState } from "react";

type Notif = { id: string; type: string; title: string; body: string | null; read_at: string | null; created_at: string };

export default function Page() {
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState<string>("");
  const load = () => {
    fetch("/api/ads/notifications").then((r) => (r.ok ? r.json() : { notifications: [], unread: 0 }))
      .then((d) => { setItems(d.notifications ?? []); setUnread(d.unread ?? 0); }).catch(() => {});
  };
  useEffect(load, []);
  const markAll = () => {
    fetch("/api/ads/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) })
      .then(() => load()).catch(() => {});
  };
  const types = [...new Set(items.map((n) => n.type))];
  const shown = items;
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Account Notifications</h1>
          <p className="mt-1 text-sm text-neutral-500">{unread} unread of {items.length} notifications on this account.</p>
        </div>
        <button onClick={markAll} disabled={unread === 0} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-40">Mark all read</button>
      </div>
      
      <div className="space-y-3">
        {shown.length === 0 && <div className="rounded-xl border border-neutral-100 bg-white p-6 text-sm text-neutral-500">No notifications.</div>}
        {shown.map((n) => (
          <div key={n.id} className={`rounded-xl border border-neutral-100 bg-white p-5 ${n.read_at ? "" : "border-l-4 border-l-neutral-900"}`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-neutral-900">{n.title}</p>
              <span className="text-xs text-neutral-400">{new Date(n.created_at).toLocaleString("en-US")}</span>
            </div>
            {n.body && <p className="mt-1 text-sm text-neutral-600">{n.body}</p>}
            <p className="mt-2 text-xs text-neutral-400">{n.type}{n.read_at ? " · read" : " · unread"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
