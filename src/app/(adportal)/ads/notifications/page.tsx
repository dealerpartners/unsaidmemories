"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Page() {
  const [rows, setRows] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const load = () => { fetch("/api/ads/notifications").then((r) => (r.ok ? r.json() : { notifications: [], unread: 0 })).then((d) => { setRows(d.notifications ?? []); setUnread(d.unread ?? 0); }).catch(() => {}); };
  useEffect(load, []);
  const markAll = () => { fetch("/api/ads/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }).then(() => load()).catch(() => {}); };
  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Notifications</h1>
          <p className="mt-1 text-sm text-neutral-500">{unread} unread of {rows.length} on this account.</p>
        </div>
        <button onClick={markAll} className="rounded-lg bg-[#f2eafe] px-4 py-2 text-sm font-medium text-[#6942c2]">Mark all read</button>
      </div>
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-neutral-500">No notifications yet.</p>}
        {rows.map((n) => (
          <div key={n.id} className={`rounded-xl border bg-white p-4 ${n.read_at ? "border-neutral-100" : "border-neutral-300"}`}>
            <p className="text-sm font-medium text-neutral-900">{n.title ?? n.type ?? "Notification"}</p>
            <p className="mt-0.5 text-sm text-neutral-600">{n.body ?? n.message ?? ""}</p>
            <p className="mt-1 text-xs text-neutral-400">{n.type ?? ""}{n.created_at ? ` · ${new Date(n.created_at).toLocaleString("en-US")}` : ""}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
