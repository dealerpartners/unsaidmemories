import type { Metadata } from "next";
import { queueHealth } from "@/lib/trust/support";
import { fmtDateTime } from "@/lib/trust/constants";

export const metadata: Metadata = { title: "Support Operations — UnSaid Admin" };
export const dynamic = "force-dynamic";

export default async function OpsPage() {
  const h = await queueHealth();
  return (
    <div>
      <div className="fabric-page-head">
        <h1>Operations — queue health</h1>
      </div>
      <div className="ts-kpis">
        <div className="ts-kpi"><div className="l">Open tickets</div><div className="v">{h.openTotal}</div><div className="f">open + pending</div></div>
        <div className="ts-kpi"><div className="l">Unassigned</div><div className="v">{h.unassigned}</div><div className="f">waiting for an owner</div></div>
        <div className="ts-kpi"><div className="l">Urgent</div><div className="v">{h.urgent}</div><div className="f">open urgent tickets</div></div>
        <div className="ts-kpi"><div className="l">SLA breached</div><div className="v">{h.breached}</div><div className="f">of the open queue</div></div>
        <div className="ts-kpi"><div className="l">Oldest open</div><div className="v" style={{ fontSize: 18 }}>{h.oldestOpenAt ? fmtDateTime(h.oldestOpenAt) : "—"}</div><div className="f">created at</div></div>
      </div>
      <div className="ts-card">
        <h3>Failed jobs &amp; dead letters</h3>
        {h.failedJobs.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13.5 }}>No failed delivery, automation, or webhook events recorded. The failed-ingest quarantine is empty.</p>
        ) : (
          <table className="ts-table">
            <thead><tr><th>When</th><th>Event</th><th>ID</th></tr></thead>
            <tbody>{h.failedJobs.map((j: any) => <tr key={j.id}><td>{fmtDateTime(j.created_at)}</td><td>{j.event_type}</td><td>{j.id}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
