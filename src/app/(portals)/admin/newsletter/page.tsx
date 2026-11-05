"use client";

// /admin/newsletter — Newsletter (owner's feature tree). Two views from
// Sunny's MARKETING.html: Campaigns and Subscribers.
// Subscribers is real: public.newsletter_subscribers, read through
// GET /api/admin/newsletter (admin-gated, up to the 500 most recent) —
// that endpoint replaces the page's former /api/cms/newsletter fetch,
// which named an endpoint that does not exist in this codebase.
// Campaigns is a GAP: no email-campaign store or send endpoint exists
// yet, so his table renders with an honest empty state — the mock's
// open/click figures are not reproduced. His Subscribers stat labels
// (open rate / click rate / unsubscribes) likewise have no tracking
// source; the tiles below are the real list-health numbers the
// subscriber rows themselves carry.

import { useEffect, useMemo, useState } from "react";
import { Mail, Plus, Search } from "lucide-react";
import { MktPage, Stat, useToast } from "@/components/admin/marketing/frame";

type Subscriber = {
  id: string;
  email: string;
  source: string;
  confirmed: boolean;
  created_at: string;
};

export default function NewsletterPage() {
  const [view, setView] = useState<"campaigns" | "subscribers">("campaigns");
  const [rows, setRows] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const { toast, node } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/newsletter", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        setRows(Array.isArray(data) ? data : []);
      } catch {
        setError("Could not load the subscriber list right now.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    return {
      total: rows.length,
      confirmed: rows.filter((s) => s.confirmed).length,
      newWeek: rows.filter((s) => new Date(s.created_at).getTime() >= weekAgo).length,
      sources: new Set(rows.map((s) => s.source || "site")).size,
    };
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((s) => s.email.toLowerCase().includes(needle) || (s.source || "").toLowerCase().includes(needle));
  }, [rows, q]);

  return (
    <MktPage
      title={view === "campaigns" ? "Newsletter campaigns" : "Subscribers"}
      actions={
        view === "campaigns" ? (
          <button className="btn primary" onClick={() => toast("Campaign sending isn't connected yet — the subscriber list is real, the campaign engine is the gap.")}>
            <Plus size={15} /> New campaign
          </button>
        ) : (
          <button className="btn" onClick={() => toast("List export isn't wired yet.")}>Export list</button>
        )
      }
    >
      {node}
      <div className="viewtabs">
        <button className={`viewtab ${view === "campaigns" ? "active" : ""}`} onClick={() => setView("campaigns")}>Campaigns</button>
        <button className={`viewtab ${view === "subscribers" ? "active" : ""}`} onClick={() => setView("subscribers")}>Subscribers</button>
      </div>

      {view === "campaigns" && (
        <div className="card">
          <div className="card-pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><strong>Newsletter campaigns</strong><div className="small muted">Email blasts and their delivery</div></div>
            <button className="btn primary" onClick={() => toast("Campaign sending isn't connected yet — the subscriber list is real, the campaign engine is the gap.")}>
              <Plus size={15} /> New campaign
            </button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Subject</th><th>Status</th><th>Sent</th><th>Opens</th><th>Clicks</th></tr></thead>
              <tbody>
                <tr>
                  <td colSpan={5}>
                    <div className="empty">
                      <Mail />
                      No newsletter campaigns yet — there is no campaign store or send endpoint behind this view yet.
                      The subscriber list under the Subscribers tab is live.
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "subscribers" && (
        <>
          <div className="stat-grid">
            <Stat label="Total subscribers" value={String(stats.total)} foot="Most recent 500 shown below" />
            <Stat label="Confirmed" value={String(stats.confirmed)} foot="Double opt-in confirmed" />
            <Stat label="New this week" value={String(stats.newWeek)} foot="Signups in the last 7 days" />
            <Stat label="Signup sources" value={String(stats.sources)} foot="Footer band and site forms" />
          </div>
          <div className="card">
            <div className="card-head">
              <div><strong>Subscribers</strong><div className="small muted">Every signup from the footer band and the site forms, newest first</div></div>
              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#68747b" }} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search email, source…"
                  style={{ border: "1px solid var(--line-2)", borderRadius: 8, padding: "8px 10px 8px 30px", fontSize: 12, background: "#fff" }}
                />
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Email</th><th>Source</th><th>Confirmed</th><th>Subscribed</th></tr></thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={4}><div className="empty">Loading…</div></td></tr>
                  ) : error ? (
                    <tr><td colSpan={4}><div className="empty">{error}</div></td></tr>
                  ) : shown.length === 0 ? (
                    <tr><td colSpan={4}><div className="empty">No subscribers match.</div></td></tr>
                  ) : shown.map((s) => (
                    <tr key={s.id}>
                      <td><strong>{s.email}</strong></td>
                      <td>{s.source || "site"}</td>
                      <td>{s.confirmed ? "Yes" : "—"}</td>
                      <td>{new Date(s.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </MktPage>
  );
}
