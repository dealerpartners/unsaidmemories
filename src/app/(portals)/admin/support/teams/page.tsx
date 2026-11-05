import type { Metadata } from "next";
import { db, T } from "../data";
import { CreateModalButton, Toggle } from "../SupportControls";
import "../support.css";

export const metadata: Metadata = { title: "Support Desk — Teams & routing" };
export const dynamic = "force-dynamic";

// Teams & routing (owner's v2 comp) — real teams, real membership and
// availability, real routing rules from support_routing_rules.
export default async function SupportTeamsPage() {
  const sb = db();
  const [{ data: teams }, { data: members }, { data: rules }] = await Promise.all([
    sb.from("support_teams").select("*").eq("tenant_id", T()).order("name"),
    sb.from("support_team_members").select("team_id, staff_id, is_available").eq("tenant_id", T()),
    sb.from("support_routing_rules").select("*").eq("tenant_id", T()).order("rule_order"),
  ]);
  const teamRows = teams ?? [];
  const memberRows = members ?? [];
  const ruleRows = rules ?? [];

  return (
    <div className="sup"><div className="content">
      <div className="pagehead">
        <div><h1>Teams &amp; routing</h1></div>
        <div className="actions">
          <CreateModalButton label="＋ Add team" title="Create team" endpoint="/api/admin/support/teams" fields={[
            { name: "name", label: "Team name", placeholder: "Team name", required: true },
            { name: "description", label: "Description", placeholder: "Team purpose" },
          ]} />
        </div>
      </div>
      <div className="split">
        <div className="card">
          <div className="cardhead"><strong>Teams</strong></div>
          <div className="cardbody">
            {teamRows.length === 0 ? <div className="empty">No teams yet.</div> : teamRows.map((team: any) => {
              const ms = memberRows.filter((m: any) => m.team_id === team.id);
              const on = ms.filter((m: any) => m.is_available).length;
              return (
                <div className="data-pair" key={team.id}>
                  <span><b>{team.name}</b><div className="tiny muted">{team.description ?? ""} · {ms.length} agents</div></span>
                  <span className={`pill ${on > 0 ? "green" : "amber"}`}>{on} online</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card">
          <div className="cardhead"><strong>Routing rules</strong><span className="muted tiny" style={{ marginLeft: "auto" }}>In order</span></div>
          <div className="cardbody settings-list">
            {ruleRows.length === 0 ? (
              <div className="empty">No routing rules yet — tickets are assigned by hand from the queue. Add a rule to route by skill, capacity, or round-robin.</div>
            ) : ruleRows.map((r: any) => (
              <div className="setting" key={r.id}>
                <div><b>{r.name}</b><div className="tiny muted">{r.strategy ?? "assignment"}{r.set_priority ? ` · sets priority ${r.set_priority}` : ""}</div></div>
                <Toggle endpoint={`/api/admin/support/routing-rules/${r.id}`} field="is_active" initial={!!r.is_active} label={r.name} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div></div>
  );
}
