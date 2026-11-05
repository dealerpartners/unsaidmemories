import type { Metadata } from "next";
import { auditTrail } from "@/lib/trust/trust";
import { fmtDateTime } from "@/lib/trust/constants";

export const metadata: Metadata = { title: "Audit Log — Trust & Safety" };
export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const rows = await auditTrail();
  return (
    <div>
      <div className="fabric-page-head">
        <h1>Trust &amp; Safety audit log</h1>
      </div>
      <div className="ts-card" style={{ padding: 0, overflow: "hidden" }}>
        {rows.length === 0 ? <div className="ts-empty">No audit entries yet.</div> : (
          <table className="ts-table">
            <thead><tr><th>When</th><th>Source</th><th>Entry</th></tr></thead>
            <tbody>
              {rows.map((r, i) => <tr key={i}><td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(r.at)}</td><td><span className="ts-pill gray">{r.source}</span></td><td>{r.text}</td></tr>)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
