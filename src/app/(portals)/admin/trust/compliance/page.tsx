import type { Metadata } from "next";
import Link from "next/link";
import { listDmca } from "@/lib/trust/trust";
import { fmtDateTime } from "@/lib/trust/constants";
import { DecideButtons } from "@/components/trust/admin-widgets";

export const metadata: Metadata = { title: "Compliance / DMCA — Trust & Safety" };
export const dynamic = "force-dynamic";

export default async function CompliancePage() {
  const { notices, counters, strikes, log } = await listDmca();
  return (
    <div>
      <div className="fabric-page-head">
        <h1>Compliance documents — DMCA</h1>
      </div>
      <div className="ts-card" style={{ padding: 0, overflow: "hidden" }}>
        <h3 style={{ padding: "16px 16px 0" }}>Takedown notices ({notices.length})</h3>
        {notices.length === 0 ? <div className="ts-empty">No notices on file.</div> : (
          <table className="ts-table">
            <thead><tr><th>Complainant</th><th>Work</th><th>Target listing</th><th>Elements</th><th>Workflow</th><th>Received</th><th>Ticket</th><th>Work</th></tr></thead>
            <tbody>
              {notices.map((n: any) => (
                <tr key={n.id}>
                  <td>{n.complainant_name || "—"}<br /><span style={{ color: "var(--muted)" }}>{n.complainant_email || ""}{n.complainant_is_agent ? " · agent for owner" : ""}</span></td>
                  <td>{n.copyrighted_work_description?.slice(0, 60) || n.work_type || "—"}</td>
                  <td>{n.target_listing_ref || "—"}</td>
                  <td>{n.elements_complete ? <span className="ts-pill green">complete</span> : <span className="ts-pill amber">missing: {((n.missing_elements as any[]) ?? []).join(", ") || "review"}</span>}</td>
                  <td><span className="ts-pill">{n.workflow_status}</span></td>
                  <td>{fmtDateTime(n.notice_received_at || n.created_at)}</td>
                  <td>{n.ticket_id ? <Link href={`/admin/support/${n.ticket_id}`}>ticket</Link> : "—"}</td>
                  <td><DecideButtons url={`/api/admin/trust/dmca/${n.id}`} current={n.workflow_status} options={[
                    { value: "under_review", label: "Review" }, { value: "actioned", label: "Take down", danger: true }, { value: "restored", label: "Restore" },
                  ]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="ts-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="ts-card">
          <h3>Counter-notices ({counters.length})</h3>
          {counters.map((c: any) => (
            <div key={c.id} style={{ fontSize: 13.5, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <b>{c.submitter_name || "—"}</b> · {c.submitter_email || ""}<br />
              <span style={{ color: "var(--muted)" }}>elements {c.elements_complete ? "complete" : "incomplete"} · jurisdiction consent {c.jurisdiction_consent ? "yes" : "no"} · received {fmtDateTime(c.received_at)}</span>
            </div>
          ))}
          {counters.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>No counter-notices.</p>}
        </div>
        <div className="ts-card">
          <h3>Strikes ({strikes.length})</h3>
          {strikes.map((s: any) => (
            <div key={s.id} style={{ fontSize: 13.5, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              Account {s.seller_id || "—"} — <span className={`ts-pill ${s.status === "active" ? "red" : "gray"}`}>{s.status}</span> · {fmtDateTime(s.strike_at)}
            </div>
          ))}
          {strikes.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>No strikes recorded.</p>}
        </div>
      </div>
      <div className="ts-card">
        <h3>Takedown log</h3>
        {log.map((l: any) => (
          <div key={l.id} style={{ fontSize: 13.5, padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ color: "var(--muted)" }}>{fmtDateTime(l.created_at)}</span> — <b>{l.action}</b> · {l.listing_ref || "listing"} · {(l.detail as any)?.reason || ""}
          </div>
        ))}
        {log.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>No takedown actions yet.</p>}
      </div>
    </div>
  );
}
