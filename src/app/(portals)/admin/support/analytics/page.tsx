import type { Metadata } from "next";
import Link from "next/link";
import { loadTickets, median, fmtDuration } from "../data";
import "../support.css";

export const metadata: Metadata = { title: "Support Desk — Analytics & reports" };
export const dynamic = "force-dynamic";

// Analytics & reports (owner's v2 comp) — computed live from the ticket
// book (the daily rollup table is empty today, so nothing here pretends
// to read it).
export default async function SupportAnalyticsPage() {
  const tickets = await loadTickets(1000);
  const now = Date.now();
  const solved = tickets.filter((t) => t.resolved_at);
  const frt = median(tickets.filter((t) => t.first_public_reply_at).map((t) => (new Date(t.first_public_reply_at!).getTime() - new Date(t.created_at).getTime()) / 60000));
  const resT = median(solved.map((t) => (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()) / 60000));
  const duePassed = tickets.filter((t) => (t.resolution_due_at && new Date(t.resolution_due_at).getTime() <= now) || t.resolved_at);
  const breached = duePassed.filter((t) => t.resolution_breached_at);
  const sla = duePassed.length ? Math.round(((duePassed.length - breached.length) / duePassed.length) * 1000) / 10 : null;
  const csatRows = tickets.filter((t) => t.csat_score !== null);
  const csatAvg = csatRows.length ? csatRows.reduce((a, t) => a + (t.csat_score ?? 0), 0) / csatRows.length : null;
  const reopened = tickets.filter((t) => (t.reopened_count ?? 0) > 0).length;
  const reopenPct = tickets.length ? Math.round((reopened / tickets.length) * 1000) / 10 : 0;

  // Service level by channel: share of due tickets not breached, per channel
  const channelMap = new Map<string, { due: number; breached: number }>();
  for (const t of tickets) {
    const ch = t.source_channel ?? "email";
    const e = channelMap.get(ch) ?? { due: 0, breached: 0 };
    if ((t.resolution_due_at && new Date(t.resolution_due_at).getTime() <= now) || t.resolved_at) {
      e.due++; if (t.resolution_breached_at) e.breached++;
    }
    channelMap.set(ch, e);
  }
  const channelRows = [...channelMap.entries()].filter(([, e]) => e.due > 0);

  const metrics = [
    { label: "Tickets solved", value: String(solved.length), foot: `of ${tickets.length} total` },
    { label: "First response", value: fmtDuration(frt), foot: "Median" },
    { label: "Resolution time", value: fmtDuration(resT), foot: "Median" },
    { label: "SLA compliance", value: sla === null ? "—" : `${sla}%`, foot: duePassed.length ? `${duePassed.length} due tickets` : "Nothing due yet" },
    { label: "CSAT", value: csatAvg === null ? "—" : `${csatAvg.toFixed(1)} / 5`, foot: `${csatRows.length} responses` },
    { label: "Reopens", value: `${reopenPct}%`, foot: `${reopened} tickets reopened` },
  ];

  return (
    <div className="sup"><div className="content">
      <div className="pagehead">
        <div><h1>Analytics &amp; reports</h1><div className="sub">Explore service performance — every figure computed from the live ticket book.</div></div>
        <div className="actions"><Link className="btn" href="/admin/support/reporting">Detailed reporting →</Link></div>
      </div>
      <div className="metric-grid">
        {metrics.map((m) => (
          <div className="card metric" key={m.label}><div className="eyebrow">{m.label}</div><div className="value">{m.value}</div><div className="delta" style={{ color: "#647789", fontWeight: 600 }}>{m.foot}</div></div>
        ))}
      </div>
      <div className="split">
        <div className="card">
          <div className="cardhead"><strong>Service level by channel</strong></div>
          <div className="cardbody">
            {channelRows.length === 0 ? <div className="empty">No due tickets yet — channel service levels appear as tickets come due.</div> : channelRows.map(([ch, e], i) => {
              const pct = Math.round(((e.due - e.breached) / e.due) * 100);
              return <div className="progressrow" key={ch}><span style={{ textTransform: "capitalize" }}>{ch}</span><div className="track"><div className={`fill ${i % 2 ? "blue" : ""}`} style={{ width: `${pct}%` }} /></div><b>{pct}%</b></div>;
            })}
          </div>
        </div>
        <div className="card">
          <div className="cardhead"><strong>Go deeper</strong></div>
          <div className="cardbody">
            <div className="data-pair"><span>Full reporting &amp; exports</span><Link href="/admin/support/reporting"><b style={{ color: "#087b73" }}>Open reporting →</b></Link></div>
            <div className="data-pair"><span>Operations &amp; jobs</span><Link href="/admin/support/ops"><b style={{ color: "#087b73" }}>Open operations →</b></Link></div>
            <div className="data-pair"><span>Live queues</span><Link href="/admin/support/queues"><b style={{ color: "#087b73" }}>Open queues →</b></Link></div>
            <div className="data-pair"><span>Dashboard</span><Link href="/admin/support"><b style={{ color: "#087b73" }}>Open dashboard →</b></Link></div>
          </div>
        </div>
      </div>
    </div></div>
  );
}
