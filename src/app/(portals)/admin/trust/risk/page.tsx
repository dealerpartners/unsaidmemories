import type { Metadata } from "next";
import { listViolations, riskBoard } from "@/lib/trust/trust";
import { fmtDateTime } from "@/lib/trust/constants";
import { DecideButtons, CreateCaseForm } from "@/components/trust/admin-widgets";

export const metadata: Metadata = { title: "Risk — Trust & Safety" };
export const dynamic = "force-dynamic";

export default async function RiskPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [violations, contacts] = await Promise.all([listViolations(sp.status || undefined), riskBoard()]);
  return (
    <div>
      <div className="fabric-page-head">
        <h1>Customer &amp; listing risk</h1>
      </div>
      <CreateCaseForm kind="violation" />
      <form className="ts-row" method="get" style={{ margin: "12px 0" }}>
        <select className="ts-select" name="status" defaultValue={sp.status ?? ""} style={{ width: 200 }}>
          <option value="">All violation statuses</option>
          {["open", "under_review", "upheld", "dismissed", "action_taken"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="ts-btn sm" type="submit">Filter</button>
      </form>
      <div className="ts-card" style={{ padding: 0, overflow: "hidden" }}>
        {violations.length === 0 ? <div className="ts-empty">No violations in this state.</div> : (
          <table className="ts-table">
            <thead><tr><th>Type</th><th>Severity</th><th>Subject</th><th>Listing / order</th><th>Description</th><th>Status</th><th>Opened</th><th>Decide</th></tr></thead>
            <tbody>
              {violations.map((v: any) => (
                <tr key={v.id}>
                  <td><b>{v.violation_type}</b></td>
                  <td><span className={`ts-pill ${v.severity === "critical" || v.severity === "high" ? "red" : "amber"}`}>{v.severity || "medium"}</span></td>
                  <td>{(v.evidence as any)?.subject_ref || v.seller_id}</td>
                  <td>{(v.evidence as any)?.listing_ref || v.listing_id || (v.evidence as any)?.order_ref || v.order_id || "—"}</td>
                  <td>{v.description || "—"}</td>
                  <td><span className="ts-pill">{v.status}</span></td>
                  <td>{fmtDateTime(v.created_at)}</td>
                  <td><DecideButtons url={`/api/admin/trust/violations/${v.id}`} current={v.status} options={[
                    { value: "under_review", label: "Review" }, { value: "upheld", label: "Uphold" }, { value: "action_taken", label: "Action taken" }, { value: "dismissed", label: "Dismiss", danger: true },
                  ]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="ts-card">
        <h3>Contact risk board — abuse scores</h3>
        {contacts.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 13 }}>No contacts scored yet.</p> : (
          <table className="ts-table">
            <thead><tr><th>Contact</th><th>Abuse score</th><th>Blocked</th><th>VIP</th><th>Linked customer</th></tr></thead>
            <tbody>
              {contacts.map((c: any) => (
                <tr key={c.id}>
                  <td>{c.display_name || "—"}<br /><span style={{ color: "var(--muted)" }}>{c.email_normalized || ""}</span></td>
                  <td><span className={`ts-pill ${Number(c.abuse_score) >= 50 ? "red" : Number(c.abuse_score) >= 20 ? "amber" : "green"}`}>{c.abuse_score}</span></td>
                  <td>{c.is_blocked ? <span className="ts-pill red">blocked</span> : "no"}</td>
                  <td>{c.is_vip ? "VIP" : "—"}</td>
                  <td>{c.customer_id || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
