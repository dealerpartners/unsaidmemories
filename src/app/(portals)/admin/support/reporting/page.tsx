import type { Metadata } from "next";
import { reportingRollups } from "@/lib/trust/support";
import { DEPARTMENT_LABELS, REQUESTER_LABELS } from "@/lib/trust/constants";

export const metadata: Metadata = { title: "Support Reporting — UnSaid Admin" };
export const dynamic = "force-dynamic";

function Bars({ rows, labels }: { rows: { key: string; count: number }[]; labels?: Record<string, string> }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <table className="ts-table">
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td style={{ width: 180 }}>{labels?.[r.key] || r.key}</td>
            <td><div style={{ background: "var(--purple)", height: 10, borderRadius: 5, width: `${(r.count / max) * 100}%`, minWidth: 4 }} /></td>
            <td style={{ width: 60, textAlign: "right" }}>{r.count}</td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td style={{ color: "var(--muted)" }}>No data in window.</td></tr>}
      </tbody>
    </table>
  );
}

export default async function ReportingPage() {
  const r = await reportingRollups();
  return (
    <div>
      <div className="fabric-page-head">
        <h1>Reporting — last {r.windowDays} days</h1>
      </div>
      <div className="ts-kpis">
        <div className="ts-kpi"><div className="l">Ticket volume</div><div className="v">{r.volume}</div><div className="f">created in window</div></div>
        <div className="ts-kpi"><div className="l">Avg first response</div><div className="v">{r.avgFirstResponseHours != null ? `${r.avgFirstResponseHours}h` : "—"}</div><div className="f">to first public reply</div></div>
        <div className="ts-kpi"><div className="l">Avg resolution</div><div className="v">{r.avgResolutionHours != null ? `${r.avgResolutionHours}h` : "—"}</div><div className="f">create → resolved</div></div>
        <div className="ts-kpi"><div className="l">SLA attainment</div><div className="v">{r.slaAttainmentPct != null ? `${r.slaAttainmentPct}%` : "—"}</div><div className="f">of SLA-stamped tickets</div></div>
        <div className="ts-kpi"><div className="l">CSAT</div><div className="v">{r.csatAvg != null ? `${r.csatAvg}/5` : "—"}</div><div className="f">{r.csatResponses} responses</div></div>
      </div>
      <div className="ts-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="ts-card"><h3>By status</h3><Bars rows={r.byStatus} /></div>
        <div className="ts-card"><h3>By priority</h3><Bars rows={r.byPriority} /></div>
        <div className="ts-card"><h3>By department</h3><Bars rows={r.byDepartment} labels={DEPARTMENT_LABELS} /></div>
        <div className="ts-card"><h3>By user type</h3><Bars rows={r.byRequesterType} labels={REQUESTER_LABELS} /></div>
      </div>
    </div>
  );
}
