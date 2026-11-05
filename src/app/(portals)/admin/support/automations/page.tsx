import type { Metadata } from "next";
import { db, T } from "../data";
import { CreateModalButton, Toggle } from "../SupportControls";
import "../support.css";

export const metadata: Metadata = { title: "Support Desk — Automations" };
export const dynamic = "force-dynamic";

// Automations (owner's v2 comp) — rules in support_automations; the
// toggle writes is_active through the real API.
export default async function SupportAutomationsPage() {
  const { data } = await db().from("support_automations").select("*").eq("tenant_id", T()).order("created_at", { ascending: false });
  const rows = data ?? [];
  const enabled = rows.filter((r: any) => r.is_active).length;

  return (
    <div className="sup"><div className="content">
      <div className="pagehead">
        <div><h1>Automations</h1></div>
        <div className="actions">
          <CreateModalButton label="＋ Create automation" title="Create automation" endpoint="/api/admin/support/automations" fields={[
            { name: "name", label: "Name", placeholder: "Automation name", required: true },
            { name: "trigger_event", label: "Trigger", type: "select", options: [{ value: "ticket_created", label: "Ticket created" }, { value: "ticket_updated", label: "Ticket updated" }, { value: "message_received", label: "Message received" }, { value: "time_based", label: "Time based (SLA checks)" }] },
          ]} />
        </div>
      </div>
      <div className="card">
        <div className="cardhead"><strong>Active rules</strong>{rows.length > 0 && <span className="pill green" style={{ marginLeft: "auto" }}>{enabled} enabled</span>}</div>
        <div className="cardbody settings-list">
          {rows.length === 0 ? (
            <div className="empty">No automations yet. Create the first rule — for example, escalate tickets nearing an SLA breach, or send the CSAT survey after a ticket is solved.</div>
          ) : rows.map((r: any) => (
            <div className="setting" key={r.id}>
              <div>
                <b>{r.name}</b>
                <div className="tiny muted">
                  Trigger: {String(r.trigger_event ?? "—").replace(/_/g, " ")}
                  {Array.isArray(r.actions) && r.actions.length > 0 ? ` · ${r.actions.length} action${r.actions.length === 1 ? "" : "s"}` : typeof r.actions === "string" && r.actions ? ` · Actions: ${r.actions}` : ""}
                  {r.kill_switch ? " · Kill switch on" : ""}{r.dry_run ? " · Dry run" : ""}
                </div>
              </div>
              <Toggle endpoint={`/api/admin/support/automations/${r.id}`} field="is_active" initial={!!r.is_active} label={r.name} />
            </div>
          ))}
        </div>
      </div>
    </div></div>
  );
}
