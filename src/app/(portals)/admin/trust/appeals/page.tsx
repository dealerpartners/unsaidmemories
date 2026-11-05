import type { Metadata } from "next";
import { listAppeals, listViolations } from "@/lib/trust/trust";
import { fmtDateTime } from "@/lib/trust/constants";
import { DecideButtons } from "@/components/trust/admin-widgets";

export const metadata: Metadata = { title: "Appeals — Trust & Safety" };
export const dynamic = "force-dynamic";

export default async function AppealsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [appeals, violations] = await Promise.all([listAppeals(sp.status || undefined), listViolations()]);
  const vById = new Map(violations.map((v: any) => [v.id, v]));
  return (
    <div>
      <div className="fabric-page-head">
        <h1>Appeals</h1>
      </div>
      <form className="ts-row" method="get" style={{ marginBottom: 12 }}>
        <select className="ts-select" name="status" defaultValue={sp.status ?? ""} style={{ width: 200 }}>
          <option value="">All statuses</option>
          {["pending", "granted", "denied"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="ts-btn sm" type="submit">Filter</button>
      </form>
      <div className="ts-card" style={{ padding: 0, overflow: "hidden" }}>
        {appeals.length === 0 ? <div className="ts-empty">No appeals in this state.</div> : (
          <table className="ts-table">
            <thead><tr><th>Appeal</th><th>Against violation</th><th>Account</th><th>Grounds</th><th>Status</th><th>Filed</th><th>Decide</th></tr></thead>
            <tbody>
              {appeals.map((a: any) => {
                const v = a.violation_id ? vById.get(a.violation_id) : null;
                return (
                  <tr key={a.id}>
                    <td><b>{a.appeal_type || "violation appeal"}</b></td>
                    <td>{v ? `${v.violation_type} (${v.status})` : a.violation_id || "—"}</td>
                    <td>{a.seller_id || "—"}</td>
                    <td>{a.appeal_text || "—"}</td>
                    <td><span className={`ts-pill ${a.status === "granted" ? "green" : a.status === "denied" ? "red" : "amber"}`}>{a.status}</span>{a.decided_at ? <><br /><span style={{ color: "var(--muted)", fontSize: 12 }}>{fmtDateTime(a.decided_at)}</span></> : null}</td>
                    <td>{fmtDateTime(a.created_at)}</td>
                    <td>{a.status === "pending" ? (
                      <DecideButtons url={`/api/admin/trust/appeals/${a.id}`} current={a.status} options={[
                        { value: "granted", label: "Grant" }, { value: "denied", label: "Deny", danger: true },
                      ]} />
                    ) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
