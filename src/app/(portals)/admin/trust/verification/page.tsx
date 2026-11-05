import type { Metadata } from "next";
import { listVerification } from "@/lib/trust/trust";
import { fmtDateTime } from "@/lib/trust/constants";
import { DecideButtons } from "@/components/trust/admin-widgets";

export const metadata: Metadata = { title: "Verification — Trust & Safety" };
export const dynamic = "force-dynamic";

const PILL: Record<string, string> = { pending: "amber", in_review: "", approved: "green", rejected: "red", needs_info: "amber" };

export default async function VerificationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const rows = await listVerification(sp.status || undefined);
  return (
    <div>
      <div className="fabric-page-head">
        <h1>Identity &amp; business verification</h1>
      </div>
      <form className="ts-row" method="get" style={{ marginBottom: 12 }}>
        <select className="ts-select" name="status" defaultValue={sp.status ?? ""} style={{ width: 200 }}>
          <option value="">All statuses</option>
          {["pending", "in_review", "approved", "rejected", "needs_info"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="ts-btn sm" type="submit">Filter</button>
      </form>
      <div className="ts-card" style={{ padding: 0, overflow: "hidden" }}>
        {rows.length === 0 ? <div className="ts-empty">No verification tasks in this state.</div> : (
          <table className="ts-table">
            <thead><tr><th>Task</th><th>Subject account</th><th>Evidence</th><th>Status</th><th>Notes</th><th>Submitted</th><th>Decision</th></tr></thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id}>
                  <td><b>{r.task_type}</b></td>
                  <td>{r.seller_id}</td>
                  <td>{r.evidence_url ? <a href={r.evidence_url} target="_blank" rel="noreferrer">View evidence</a> : "—"}</td>
                  <td><span className={`ts-pill ${PILL[r.status] ?? ""}`}>{r.status}</span></td>
                  <td>{r.notes || "—"}</td>
                  <td>{fmtDateTime(r.created_at)}</td>
                  <td>{r.status === "pending" || r.status === "in_review" || r.status === "needs_info" ? (
                    <DecideButtons url={`/api/admin/trust/verification/${r.id}`} current={r.status} options={[
                      { value: "approved", label: "Approve" }, { value: "needs_info", label: "Needs info" }, { value: "rejected", label: "Reject", danger: true },
                    ]} />
                  ) : <span style={{ color: "var(--muted)", fontSize: 12.5 }}>{r.reviewed_at ? `reviewed ${fmtDateTime(r.reviewed_at)}` : ""}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
