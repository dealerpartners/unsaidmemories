"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SavedView = { name: string; query: string };
const KEY = "unsaid.crm.savedViews";

/**
 * Saved list views (Sunny tree 1.2 Filters > Saved Views) — persisted per
 * signed-in admin in crm_saved_views via /api/admin/crm/saved-views, so a
 * view follows the admin across devices. If that table is not available
 * yet (migration 20261030090000 not applied), falls back to the previous
 * per-browser localStorage copy so the feature never hard-breaks.
 */
export default function SavedViews({ currentQuery }: { currentQuery: string }) {
  const router = useRouter();
  const [views, setViews] = useState<SavedView[]>([]);
  const [name, setName] = useState("");
  const [serverBacked, setServerBacked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/crm/saved-views");
        if (!res.ok) throw new Error("unavailable");
        const j = (await res.json()) as { views?: SavedView[] };
        if (cancelled) return;
        setViews(j.views || []);
        setServerBacked(true);
      } catch {
        if (cancelled) return;
        try {
          setViews(JSON.parse(localStorage.getItem(KEY) || "[]") as SavedView[]);
        } catch {
          setViews([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const persistLocal = (next: SavedView[]) => {
    setViews(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };

  const save = async (viewName: string) => {
    const next = [...views.filter((v) => v.name !== viewName), { name: viewName, query: currentQuery }];
    if (serverBacked) {
      try {
        const res = await fetch("/api/admin/crm/saved-views", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: viewName, query: currentQuery }),
        });
        if (!res.ok) throw new Error("save failed");
        setViews(next);
        return;
      } catch { /* fall through to local copy */ }
    }
    persistLocal(next);
  };

  const remove = async (viewName: string) => {
    const next = views.filter((x) => x.name !== viewName);
    if (serverBacked) {
      try {
        const res = await fetch(`/api/admin/crm/saved-views?name=${encodeURIComponent(viewName)}`, { method: "DELETE" });
        if (!res.ok) throw new Error("delete failed");
        setViews(next);
        return;
      } catch { /* fall through to local copy */ }
    }
    persistLocal(next);
  };

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {views.map((v) => (
        <span key={v.name} className="crm-chip" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <button type="button" style={{ background: "none", border: "none", font: "inherit", cursor: "pointer", color: "inherit" }} onClick={() => router.push(`/admin/crm?${v.query}`)} data-tip="Jump back to this saved list — the same filters you saved.">
            {v.name}
          </button>
          <button
            type="button"
            aria-label={`Delete saved view ${v.name}`}
            data-tip="Delete this saved view. No customers are affected."
            style={{ background: "none", border: "none", font: "inherit", cursor: "pointer", color: "inherit" }}
            onClick={() => remove(v.name)}
          >
            ×
          </button>
        </span>
      ))}
      <input className="crm-input" style={{ minHeight: 30, width: 150 }} placeholder="Name this view" value={name} onChange={(e) => setName(e.target.value)} data-tip="Type a name for the filters you've set — like “VIPs who owe money” — then press Save view." />
      <button
        className="crm-btn crm-ghost crm-sm"
        type="button"
        data-tip="Save the current filters under that name, so you can jump back to this exact list in one click."
        disabled={!name.trim()}
        onClick={() => {
          const n = name.trim();
          setName("");
          void save(n);
        }}
      >
        Save view
      </button>
    </span>
  );
}
