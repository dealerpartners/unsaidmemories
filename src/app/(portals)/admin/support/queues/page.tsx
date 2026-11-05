import type { Metadata } from "next";
import Link from "next/link";
import { loadTickets, loadStaff, loadTeams, isOpen, dueLabel, priorityPill, statusPill, channelLabel, T, db } from "../data";
import { CreateModalButton, NEW_TICKET_FIELDS, SupportSearch } from "../SupportControls";
import "../support.css";

export const metadata: Metadata = { title: "Support Desk — Queues & workload" };
export const dynamic = "force-dynamic";

// Queues & workload (owner's v2 comp): the desk's incoming work, sorted
// by priority & SLA risk, filtered by real GET params.
export default async function SupportQueuesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [all, staff, teams] = await Promise.all([loadTickets(), loadStaff(), loadTeams()]);
  const teamName = new Map(teams.map((t: any) => [t.id, t.name]));
  const open = all.filter(isOpen);
  const unassigned = open.filter((t) => !t.assigned_staff_id);
  const atRisk = open.filter((t) => { const d = dueLabel(t); return d.cls === "amber" || d.cls === "red"; });
  const { data: members } = await db().from("support_team_members").select("is_available").eq("tenant_id", T());
  const online = (members ?? []).filter((m: any) => m.is_available).length;
  const oldest = open.length ? Math.max(...open.map((t) => (Date.now() - new Date(t.created_at).getTime()) / 3600000)) : 0;

  let rows = open;
  if (sp.q) { const q = sp.q.toLowerCase(); rows = rows.filter((t) => `${t.subject} ${t.requester_name ?? ""} ${t.ticket_ref ?? ""}`.toLowerCase().includes(q)); }
  if (sp.priority) rows = rows.filter((t) => t.priority === sp.priority);
  if (sp.status) rows = rows.filter((t) => t.status === sp.status);
  if (sp.team) rows = rows.filter((t) => t.assigned_team_id === sp.team);
  const prioRank = (p: string) => (p === "urgent" ? 0 : p === "high" ? 1 : p === "normal" ? 2 : 3);
  rows = [...rows].sort((a, b) => prioRank(a.priority) - prioRank(b.priority)
    || (new Date(a.resolution_due_at ?? a.first_response_due_at ?? "2999").getTime() - new Date(b.resolution_due_at ?? b.first_response_due_at ?? "2999").getTime()));

  const metrics = [
    { label: "Total waiting", value: String(open.length), foot: "Open right now" },
    { label: "Unassigned", value: String(unassigned.length), foot: `${unassigned.filter((t) => t.priority === "high" || t.priority === "urgent").length} high priority` },
    { label: "SLA at risk", value: String(atRisk.length), foot: "Due soon or breached" },
    { label: "Agents online", value: String(online), foot: `${members?.length ?? 0} team members` },
    { label: "Oldest ticket", value: open.length ? `${Math.floor(oldest)}h` : "—", foot: "Time waiting" },
    { label: "Avg. load / agent", value: members?.length ? (open.length / members.length).toFixed(1) : "—", foot: "Open per member" },
  ];

  return (
    <div className="sup"><div className="content">
      <div className="pagehead">
        <div><h1>Queues &amp; workload</h1></div>
        <div className="actions"><CreateModalButton label="＋ Create ticket" title="New ticket" fields={NEW_TICKET_FIELDS} endpoint="/api/admin/support/tickets" /></div>
      </div>
      <div className="metric-grid">
        {metrics.map((m) => (
          <div className="card metric" key={m.label}><div className="eyebrow">{m.label}</div><div className="value">{m.value}</div><div className="delta" style={{ color: "#647789", fontWeight: 600 }}>{m.foot}</div></div>
        ))}
      </div>
      <form className="toolbar" method="get">
        <SupportSearch placeholder="Search by ticket, customer or subject" defaultValue={sp.q} />
        <select className="select" name="team" defaultValue={sp.team ?? ""}>
          <option value="">All queues</option>
          {teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="select" name="priority" defaultValue={sp.priority ?? ""}>
          <option value="">All priorities</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
        </select>
        <select className="select" name="status" defaultValue={sp.status ?? ""}>
          <option value="">All statuses</option><option value="open">Open</option><option value="pending">Pending</option>
        </select>
        <button className="btn" type="submit">Apply filters</button>
        <Link className="btn" href="/admin/support/queues">Clear</Link>
      </form>
      <div className="card">
        <div className="cardhead"><strong>Incoming work</strong><span className="muted tiny">Sorted by priority &amp; SLA risk</span>{atRisk.length > 0 && <span className="pill red" style={{ marginLeft: "auto" }}>{atRisk.length} at risk</span>}</div>
        <div className="tablewrap"><table className="table">
          <thead><tr><th>Ticket</th><th>Customer</th><th>Subject</th><th>Channel</th><th>Priority</th><th>Assignee / team</th><th>SLA</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8}><div className="empty">No open tickets match. When customers write in, their tickets land here.</div></td></tr>
            ) : rows.map((t) => {
              const pr = priorityPill(t.priority); const st = statusPill(t.status); const due = dueLabel(t);
              return (
                <tr key={t.id}>
                  <td className="ticketid"><Link href={`/admin/support/${t.id}`}>{t.ticket_ref ?? `#${t.id.slice(0, 8)}`}</Link></td>
                  <td>{t.requester_name ?? t.requester_email ?? "—"}</td>
                  <td><Link href={`/admin/support/${t.id}`}>{t.subject}</Link></td>
                  <td>{channelLabel(t.source_channel)}</td>
                  <td><span className={`pill ${pr.cls}`}>{pr.label}</span></td>
                  <td>{t.assigned_staff_id ? staff.get(t.assigned_staff_id) ?? "Assigned" : "Unassigned"}{t.assigned_team_id ? ` · ${teamName.get(t.assigned_team_id) ?? ""}` : ""}</td>
                  <td><span className={`pill ${due.cls}`}>{due.text}</span></td>
                  <td><span className={`pill ${st.cls}`}>{st.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </div></div>
  );
}
