import type { Metadata } from "next";
import { listInvestigations } from "@/lib/trust/trust";
import { fmtDateTime } from "@/lib/trust/constants";
import { DecideButtons, CreateCaseForm } from "@/components/trust/admin-widgets";

export const metadata: Metadata = { title: "Fraud Review — Trust & Safety" };
export const dynamic = "force-dynamic";

export default async function FraudPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const rows = await listInvestigations(sp.status || undefined);
  return (
    <div>
      <div className="fabric-page-head">
        <h1>Fraud review</h1>
      </div>
      <CreateCaseForm kind="investigation" />
      <form className="ts-row" method="get" style={{ margin: "12px 0" }}>
        <select className="ts-select" name="status" defaultValue={sp.status ?? ""} style={{ width: 200 }}>
          <option value="">All statuses</option>
          {["open", "in_progress", "closed"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="ts-btn sm" type="submit">Filter</button>
      </form>
      <div className="ts-card" style={{ padding: 0, overflow: "hidden" }}>
        {rows.length === 0 ? <div className="ts-empty">No investigations in this state.</div> : (
          <table className="ts-table">
            <thead><tr><th>Type</th><th>Subject</th><th>Order</th><th>Priority</th><th>Notes</th><th>Findings</th><th>Status</th><th>Opened</th><th>Work</th></tr></thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id}>
                  <td><b>{r.investigation_type || "fraud"}</b></td>
                  <td>{r.seller_id || "—"}</td>
                  <td>{r.order_id || "—"}</td>
                  <td><span className={`ts-pill ${r.priority === "urgent" || r.priority === "high" ? "red" : ""}`}>{r.priority || "normal"}</span></td>
                  <td>{r.notes || "—"}</td>
                  <td>{r.findings || "—"}</td>
                  <td>{r.status}</td>
                  <td>{fmtDateTime(r.created_at)}</td>
                  <td><DecideButtons url={`/api/admin/trust/investigations/${r.id}`} current={r.status} options={[
                    { value: "in_progress", label: "Start work" }, { value: "closed", label: "Close case" },
                  ]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
