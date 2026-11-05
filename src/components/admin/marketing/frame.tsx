"use client";

// Shared frame for the Marketing domain pages — Sunny's MARKETING.html
// design (clean title standing alone, stat grid, cards, tables, status
// chips). Owner rule (2026-11-02 13:05 CST): NO breadcrumb eyebrow and
// NO description/subtitle paragraph under the title — the title stands
// alone, actions sit at the right of the title row.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import "./marketing.css";

export function MktPage({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mkt">
      <div className="page-head">
        <h1>{title}</h1>
        {actions ? <div className="toolbar">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value, foot }: { label: string; value: string; foot?: string }) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {foot ? <div className="stat-foot">{foot}</div> : null}
    </div>
  );
}

const CHIP: Record<string, { cls: string; label: string }> = {
  active: { cls: "live", label: "Active" },
  published: { cls: "live", label: "Published" },
  approved: { cls: "live", label: "Approved" },
  live: { cls: "live", label: "Live" },
  sent: { cls: "live", label: "Sent" },
  scheduled: { cls: "scheduled", label: "Scheduled" },
  preflight: { cls: "scheduled", label: "Preflight" },
  pending_review: { cls: "scheduled", label: "In review" },
  publishing: { cls: "scheduled", label: "Publishing" },
  draft: { cls: "draft", label: "Draft" },
  ended: { cls: "draft", label: "Ended" },
  inactive: { cls: "draft", label: "Inactive" },
  paused: { cls: "paused", label: "Paused" },
  suspended: { cls: "paused", label: "Suspended" },
  failed: { cls: "error", label: "Failed" },
  rejected: { cls: "error", label: "Rejected" },
  error: { cls: "error", label: "Error" },
};

export function StatusChip({ status }: { status: string }) {
  const m = CHIP[status] ?? { cls: "", label: status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ") };
  return <span className={`status ${m.cls}`}>{m.label}</span>;
}

export function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData((await r.json()) as T);
      setError("");
    } catch {
      setError("This data couldn't be loaded right now.");
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, error, reload };
}

export function useToast() {
  const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(""), 2600);
  }, []);
  const node = <div className={`toast ${msg ? "show" : ""}`}>{msg}</div>;
  return { toast, node };
}

export async function patchJson(url: string, body: Record<string, unknown>) {
  const r = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json().catch(() => ({}));
}

export const money = (cents: string | number) => {
  const n = Number(cents) / 100;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 === 0 ? 0 : 2 });
};
export const moneyExact = (cents: string | number) =>
  (Number(cents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
export const num = (n: string | number) => Number(n).toLocaleString("en-US");
export const fmtWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
