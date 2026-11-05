import type { Metadata } from "next";
import Link from "next/link";
import { loadTickets, loadStaff, loadTeams, isOpen, dueLabel, median, fmtDuration, initials, T, db } from "./data";
import { CreateModalButton, NEW_TICKET_FIELDS } from "./SupportControls";
import "./support.css";

export const metadata: Metadata = { title: "Support Desk — Operations dashboard" };
export const dynamic = "force-dynamic";

// Operations dashboard (owner's v2 comp) — every number computed live
// from support_tickets: the rollup table (support_report_daily) is
// empty, so the page aggregates the real rows itself.
export default async function SupportDashboardPage() {
  const [tickets, staff, teams] = await Promise.all([loadTickets(), loadStaff(), loadTeams()]);
  const open = tickets.filter(isOpen);
  const unassigned = open.filter((t) => !t.assigned_staff_id);
  const highOpen = open.filter((t) => t.priority === "high" || t.priority === "urgent");
  const pending = open.filter((t) => t.status === "pending");
  const now = Date.now();
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const resolvedToday = tickets.filter((t) => t.resolved_at && new Date(t.resolved_at).getTime() >= startToday.getTime());
  const duePassed = tickets.filter((t) => (t.resolution_due_at && new Date(t.resolution_due_at).getTime() <= now) || t.resolved_at);
  const breached = duePassed.filter((t) => t.resolution_breached_at);
  const slaMet = duePassed.length ? Math.round(((duePassed.length - breached.length) / duePassed.length) * 1000) / 10 : null;

  const days: { label: string; created: number; resolved: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const key = d.toDateString();
    days.push({
      label: d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 3),
      created: tickets.filter((t) => new Date(t.created_at).toDateString() === key).length,
      resolved: tickets.filter((t) => t.resolved_at && new Date(t.resolved_at).toDateString() === key).length,
    });
  }
  const maxBar = Math.max(1, ...days.map((d) => Math.max(d.created, d.resolved)));

  const csatRows = tickets.filter((t) => t.csat_score !== null);
  const csatAvg = csatRows.length ? csatRows.reduce((a, t) => a + (t.csat_score ?? 0), 0) / csatRows.length : null;
  const csatPos = csatRows.length ? Math.round((csatRows.filter((t) => (t.csat_score ?? 0) >= 4).length / csatRows.length) * 1000) / 10 : null;
  const csatNeu = csatRows.length ? Math.round((csatRows.filter((t) => t.csat_score === 3).length / csatRows.length) * 100) : 0;
  const csatNeg = csatRows.length ? Math.round((csatRows.filter((t) => (t.csat_score ?? 0) <= 2).length / csatRows.length) * 100) : 0;

  const channels = new Map<string, number>();
  for (const t of open) channels.set(t.source_channel ?? "email", (channels.get(t.source_channel ?? "email") ?? 0) + 1);
  const channelRows = [...channels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxChannel = Math.max(1, ...channelRows.map(([, n]) => n));

  const frt = median(tickets.filter((t) => t.first_public_reply_at).map((t) => (new Date(t.first_public_reply_at!).getTime() - new Date(t.created_at).getTime()) / 60000));
  const resMedian = median(tickets.filter((t) => t.resolved_at).map((t) => (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()) / 60000));

  const teamName = new Map(teams.map((t: any) => [t.id, t.name]));
  const byTeam = new Map<string, number>();
  for (const t of open) byTeam.set(t.assigned_team_id ?? "unassigned", (byTeam.get(t.assigned_team_id ?? "unassigned") ?? 0) + 1);
  const teamRows = [...byTeam.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const maxTeam = Math.max(1, ...teamRows.map(([, n]) => n));

  const solvedBy = new Map<string, { n: number; csat: number[] }>();
  for (const t of tickets) {
    if (!t.resolved_at || !t.assigned_staff_id) continue;
    const e = solvedBy.get(t.assigned_staff_id) ?? { n: 0, csat: [] };
    e.n++; if (t.csat_score !== null) e.csat.push(t.csat_score);
    solvedBy.set(t.assigned_staff_id, e);
  }
  const performers = [...solvedBy.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 4);

  const { data: members } = await db().from("support_team_members").select("is_available").eq("tenant_id", T());
  const memberCount = members?.length ?? 0;
  const online = (members ?? []).filter((m: any) => m.is_available).length;

  const breachSoon = open.filter((t) => { const d = dueLabel(t); return d.cls === "amber" || d.cls === "red"; });
  const reopened = tickets.filter((t) => (t.reopened_count ?? 0) > 0);
  const negCsat = csatRows.filter((t) => (t.csat_score ?? 0) <= 2);

  const metrics = [
    { label: "Tickets · Open", value: String(open.length), foot: `${tickets.length} all time` },
    { label: "Tickets · Unassigned", value: String(unassigned.length), foot: "Waiting for an owner" },
    { label: "High priority · Open", value: String(highOpen.length), foot: "High + urgent" },
    { label: "Tickets · Pending", value: String(pending.length), foot: "Waiting on the customer" },
    { label: "Resolved · Today", value: String(resolvedToday.length), foot: "Since midnight" },
    { label: "SLA · Met", value: slaMet === null ? "—" : `${slaMet}%`, foot: duePassed.length ? `Across ${duePassed.length} due tickets` : "No tickets due yet" },
  ];

  return (
    <div className="sup"><div className="content">
      <div className="pagehead">
        <div><h1>Operations dashboard</h1></div>
        <div className="actions">
          <Link className="btn" href="/admin/support/queues">Review queues</Link>
          <CreateModalButton label="＋ New ticket" title="New ticket" fields={NEW_TICKET_FIELDS} endpoint="/api/admin/support/tickets" />
        </div>
      </div>

      <div className="metric-grid">
        {metrics.map((m) => (
          <div className="card metric" key={m.label}><div className="eyebrow">{m.label}</div><div className="value">{m.value}</div><div className="delta" style={{ color: "#647789", fontWeight: 600 }}>{m.foot}</div></div>
        ))}
      </div>

      <div className="dashgrid">
        <div className="card span2">
          <div className="cardhead"><strong>Ticket volume &amp; resolution</strong><span className="muted tiny">Last 7 days</span><span style={{ marginLeft: "auto" }} className="pill teal">Live</span></div>
          <div className="cardbody">
            <div className="chart">
              {days.map((d) => (
                <div className="barcol" key={d.label}>
                  <div className="bar" style={{ height: `${Math.max(4, (d.created / maxBar) * 100)}%` }} />
                  <div className="bar alt" style={{ height: `${Math.max(4, (d.resolved / maxBar) * 100)}%` }} />
                  <span className="barlabel">{d.label}</span>
                </div>
              ))}
            </div>
            <div className="legend"><span><i className="dot" />Created</span><span><i className="dot blue" />Resolved</span><span className="muted" style={{ marginLeft: "auto" }}>Created {days.reduce((a, d) => a + d.created, 0)} · resolved {days.reduce((a, d) => a + d.resolved, 0)} this week</span></div>
          </div>
        </div>
        <div className="card">
          <div className="cardhead"><strong>Customer satisfaction</strong><span className="muted tiny" style={{ marginLeft: "auto" }}>All recorded</span></div>
          <div className="cardbody">
            {csatAvg === null ? <div className="empty">No CSAT responses recorded yet. Ratings land here when customers answer the after-resolution survey.</div> : (<>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{csatAvg.toFixed(1)} / 5</div>
              <div className="muted tiny">Average score · {csatRows.length} responses</div>
              <div className="delta" style={{ marginTop: 7 }}>{csatPos}% positive</div>
              <div className="progressrow"><span>Positive</span><div className="track"><div className="fill" style={{ width: `${csatPos}%` }} /></div><b>{csatPos}%</b></div>
              <div className="progressrow"><span>Neutral</span><div className="track"><div className="fill amber" style={{ width: `${csatNeu}%` }} /></div><b>{csatNeu}%</b></div>
              <div className="progressrow"><span>Negative</span><div className="track"><div className="fill" style={{ width: `${csatNeg}%`, background: "#d97878" }} /></div><b>{csatNeg}%</b></div>
            </>)}
          </div>
        </div>
        <div className="card">
          <div className="cardhead"><strong>Channel health</strong><span className="muted tiny" style={{ marginLeft: "auto" }}>Open tickets</span></div>
          <div className="cardbody">
            {channelRows.length === 0 ? <div className="empty">No open tickets right now.</div> : channelRows.map(([ch, n], i) => (
              <div className="progressrow" key={ch}><span style={{ textTransform: "capitalize" }}>{ch}</span><div className="track"><div className={`fill ${i % 2 ? "" : "blue"}`} style={{ width: `${(n / maxChannel) * 100}%` }} /></div><b>{n}</b></div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="cardhead"><strong>First response &amp; resolution</strong><span className="muted tiny" style={{ marginLeft: "auto" }}>Median</span></div>
          <div className="cardbody">
            <div style={{ display: "flex", justifyContent: "space-between", margin: "8px 0 16px" }}>
              <div><div className="eyebrow">First response</div><div style={{ fontSize: 24, fontWeight: 800 }}>{fmtDuration(frt)}</div></div>
              <div><div className="eyebrow">Full resolution</div><div style={{ fontSize: 24, fontWeight: 800 }}>{fmtDuration(resMedian)}</div></div>
            </div>
            <div className="progressrow"><span>SLA target met</span><div className="track"><div className="fill" style={{ width: `${slaMet ?? 0}%` }} /></div><b>{slaMet === null ? "—" : `${slaMet}%`}</b></div>
          </div>
        </div>
        <div className="card">
          <div className="cardhead"><strong>Queue distribution</strong><span className="muted tiny" style={{ marginLeft: "auto" }}>Open tickets</span></div>
          <div className="cardbody">
            {teamRows.length === 0 ? <div className="empty">No open tickets.</div> : teamRows.map(([teamId, n], i) => (
              <div className="progressrow" key={teamId}><span>{teamId === "unassigned" ? "Unassigned" : teamName.get(teamId) ?? "Team"}</span><div className="track"><div className={`fill ${i === 1 ? "blue" : i === 2 ? "amber" : ""}`} style={{ width: `${(n / maxTeam) * 100}%` }} /></div><b>{n}</b></div>
            ))}
          </div>
        </div>
      </div>

      <div className="dashbottom">
        <div className="card">
          <div className="cardhead"><strong>Team performance</strong><Link className="tiny" style={{ marginLeft: "auto", color: "#167c76" }} href="/admin/support/analytics">View report →</Link></div>
          <div className="cardbody">
            {performers.length === 0 ? <div className="empty">No resolved tickets yet — performance appears as the team solves work.</div> : performers.map(([staffId, e]) => (
              <div className="agent" key={staffId}>
                <div className="avatar">{initials(staff.get(staffId))}</div>
                <div><strong>{staff.get(staffId) ?? "Staff"}</strong><small>{e.n} solved</small></div>
                <span className="score">{e.csat.length ? `${(e.csat.reduce((a, b) => a + b, 0) / e.csat.length).toFixed(1)} / 5` : "—"}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="cardhead"><strong>Workload &amp; availability</strong><span className="pill green" style={{ marginLeft: "auto" }}>{online} online</span></div>
          <div className="cardbody">
            <div className="progressrow"><span>Available</span><div className="track"><div className="fill" style={{ width: `${memberCount ? (online / memberCount) * 100 : 0}%` }} /></div><b>{online}</b></div>
            <div className="progressrow"><span>Team members</span><div className="track"><div className="fill blue" style={{ width: "100%" }} /></div><b>{memberCount}</b></div>
            <div className="progressrow"><span>Open per member</span><div className="track"><div className="fill amber" style={{ width: `${Math.min(100, memberCount ? (open.length / memberCount) * 10 : 0)}%` }} /></div><b>{memberCount ? (open.length / memberCount).toFixed(1) : "—"}</b></div>
          </div>
        </div>
        <div className="card">
          <div className="cardhead"><strong>Needs attention</strong>{breachSoon.length > 0 && <span className="pill red" style={{ marginLeft: "auto" }}>{breachSoon.length} at risk</span>}</div>
          <div className="cardbody">
            <div className="data-pair"><span>Breaching SLA within 30 min</span><b style={{ color: "#bd4c4c" }}>{breachSoon.length}</b></div>
            <div className="data-pair"><span>Unassigned high priority</span><b>{unassigned.filter((t) => t.priority === "high" || t.priority === "urgent").length}</b></div>
            <div className="data-pair"><span>Reopened tickets</span><b>{reopened.length}</b></div>
            <div className="data-pair"><span>Negative CSAT follow-ups</span><b>{negCsat.length}</b></div>
            <Link className="btn soft" style={{ display: "block", textAlign: "center", marginTop: 10 }} href="/admin/support/queues">Review attention queue →</Link>
          </div>
        </div>
      </div>
    </div></div>
  );
}
