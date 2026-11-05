'use client'

// Social — Oversight (Sunny's MARKETING.html audit-table design).
// Data is the platform-wide social health surface, unchanged:
// GET /api/admin/social/overview — connections across sellers, recent
// publish attempts (the audit table), and the queues that need a human
// (unknown outcomes, failed token refreshes, dead-lettered events).

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { MktPage, fmtWhen } from "@/components/admin/marketing/frame";

type Data = { accounts: any[]; attempts: any[]; unknown: any[]; refreshFailed: any[]; deadOutbox: any[] };

function eventLabel(a: any): string {
  const o = String(a.outcome ?? "");
  if (o.includes("publish") || o === "succeeded" || o === "success") return "Post published";
  if (o.includes("fail") || o === "failed" || o === "error") return "Post failed";
  if (o.includes("schedul")) return "Post scheduled";
  return o ? o.charAt(0).toUpperCase() + o.slice(1).replace(/_/g, " ") : "Publish attempt";
}

export default function SocialOversightPage() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/api/admin/social/overview")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  return (
    <MktPage title="Oversight">
      {!data && !failed ? (
        <div className="card"><div className="empty">Loading…</div></div>
      ) : failed || !data ? (
        <div className="notice error">Oversight data couldn&apos;t be loaded right now.</div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-pad"><strong>Publishing oversight</strong><div className="small muted">Audit recent publishing outcomes across channels.</div></div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Event</th><th>Channel</th><th>Post</th><th>When</th></tr></thead>
                <tbody>
                  {data.attempts.length === 0 ? (
                    <tr><td colSpan={4}><div className="empty">No publish attempts recorded yet.</div></td></tr>
                  ) : data.attempts.map((a: any) => (
                    <tr key={a.id}>
                      <td>{eventLabel(a)}{a.error_message ? <div className="small" style={{ color: "#a83e3b" }}>{a.error_message}</div> : null}</td>
                      <td style={{ textTransform: "capitalize" }}>{a.platform}</td>
                      <td>{(a.body ?? "").slice(0, 80) || "—"}{a.seller_name ? <div className="small muted">{a.seller_name}</div> : null}</td>
                      <td>{fmtWhen(a.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid-2">
            <div className="card card-pad">
              <strong style={{ display: "flex", alignItems: "center", gap: 6 }}><ShieldAlert size={15} /> Needs attention — unknown outcomes</strong>
              <p className="small muted" style={{ margin: "6px 0 12px" }}>The platform may have received these posts. They are never retried automatically; the seller must check the platform and confirm before any retry.</p>
              {data.unknown.length === 0 ? <p className="small muted">None.</p> : data.unknown.map((t: any) => (
                <div key={t.id} className="small" style={{ padding: "6px 0", borderTop: "1px solid #f0f2f3" }}>
                  <span style={{ textTransform: "capitalize" }}>{t.platform}</span> — {t.seller_name ?? "—"} — “{(t.body ?? "").slice(0, 80)}”
                </div>
              ))}
              <strong style={{ display: "block", marginTop: 16 }}>Token refresh failed</strong>
              {data.refreshFailed.length === 0 ? <p className="small muted" style={{ marginTop: 6 }}>None.</p> : data.refreshFailed.map((a: any) => (
                <div key={a.id} className="small" style={{ padding: "6px 0", borderTop: "1px solid #f0f2f3" }}>
                  <span style={{ textTransform: "capitalize" }}>{a.platform}</span> — {a.display_name ?? "—"} ({a.seller_name ?? "—"}): {a.last_refresh_error ?? "refresh failed"}
                </div>
              ))}
              {data.deadOutbox.length > 0 && (
                <>
                  <strong style={{ display: "block", marginTop: 16 }}>Dead-lettered events</strong>
                  {data.deadOutbox.map((e: any) => (
                    <div key={e.id} className="small" style={{ padding: "6px 0", borderTop: "1px solid #f0f2f3" }}>{e.event_type} — {e.attempts} attempts — {fmtWhen(e.created_at)}</div>
                  ))}
                </>
              )}
            </div>
            <div className="card card-pad">
              <strong>Connections</strong>
              <p className="small muted" style={{ margin: "6px 0 12px" }}>Social accounts across sellers.</p>
              {data.accounts.length === 0 ? <p className="small muted">No connected accounts yet.</p> : data.accounts.map((a: any, i: number) => (
                <div key={i} className="small" style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: "1px solid #f0f2f3" }}>
                  <span style={{ textTransform: "capitalize" }}>{a.platform}</span>
                  <span>{a.seller_name ?? "—"}</span>
                  <span className="muted">{a.status} · {a.access_status} · {a.n} account{a.n === 1 ? "" : "s"}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </MktPage>
  );
}
