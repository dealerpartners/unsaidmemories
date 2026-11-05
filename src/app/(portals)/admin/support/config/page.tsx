import type { Metadata } from "next";
import { db } from "@/lib/trust/support";
import { ConfigSection } from "@/components/trust/admin-widgets";

export const metadata: Metadata = { title: "Support Configuration — UnSaid Admin" };
export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const sb = db();
  const [teams, members, sla, rules, cats, macros, canned, channels, staff] = await Promise.all([
    sb.from("support_teams").select("*").order("name"),
    sb.from("support_team_members").select("*, support_teams(name)").order("created_at"),
    sb.from("support_sla_policies").select("*").order("name"),
    sb.from("support_escalation_rules").select("*").order("name"),
    sb.from("support_categories").select("*").order("sort_order"),
    sb.from("support_macros").select("*").order("name"),
    sb.from("support_canned_replies").select("*").order("title"),
    sb.from("support_channels").select("*").order("name"),
    sb.from("portal_users").select("id, display_name, email").eq("is_active", true).order("display_name"),
  ]);
  const memberRows = (members.data ?? []).map((m: any) => ({
    ...m,
    name: `${(staff.data ?? []).find((s: any) => s.id === m.staff_id)?.display_name || m.staff_id} → ${m.support_teams?.name || m.team_id}`,
    description: `${m.role || "agent"} · max ${m.max_concurrent ?? "—"} concurrent · ${m.is_available ? "available" : "unavailable"}`,
    is_active: m.is_available,
  }));
  return (
    <div>
      <div className="fabric-page-head">
        <h1>Configuration</h1>
      </div>
      <ConfigSection resource="teams" title="Teams" rows={teams.data ?? []} fields={[
        { key: "code", label: "Code" }, { key: "name", label: "Name" }, { key: "description", label: "Description" },
      ]} />
      <ConfigSection resource="team_members" title="Team members" rows={memberRows} fields={[
        { key: "team_id", label: "Team ID" }, { key: "staff_id", label: "Staff (portal user) ID" }, { key: "role", label: "Role (lead/agent)" }, { key: "max_concurrent", label: "Max concurrent", type: "number" },
      ]} />
      <ConfigSection resource="sla_policies" title="SLA policies" rows={(sla.data ?? []).map((p: any) => ({ ...p, description: `first response ${p.first_response_minutes ?? "—"}m · next reply ${p.next_reply_minutes ?? "—"}m · resolution ${p.resolution_minutes ?? "—"}m${p.is_default ? " · default" : ""}` }))} fields={[
        { key: "name", label: "Name" }, { key: "first_response_minutes", label: "First response (minutes)", type: "number" },
        { key: "next_reply_minutes", label: "Next reply (minutes)", type: "number" }, { key: "resolution_minutes", label: "Resolution (minutes)", type: "number" },
        { key: "is_default", label: "Default policy", type: "checkbox" },
      ]} />
      <ConfigSection resource="escalation_rules" title="Escalation & routing rules" rows={(rules.data ?? []).map((r: any) => ({ ...r, description: `${r.trigger_type} → ${r.action}` }))} fields={[
        { key: "name", label: "Name" }, { key: "trigger_type", label: "Trigger (sla_breach / no_reply / priority)" },
        { key: "condition", label: "Condition (JSON)", type: "json", placeholder: '{"priority":"urgent"}' },
        { key: "action", label: "Action (escalate / assign_team / notify)" }, { key: "action_config", label: "Action config (JSON)", type: "json" },
      ]} />
      <ConfigSection resource="categories" title="Departments (categories)" rows={(cats.data ?? []).map((c: any) => ({ ...c, name: `${c.name} (${c.code})`, description: c.parent_code ? `under ${c.parent_code}` : "top level" }))} fields={[
        { key: "code", label: "Code" }, { key: "name", label: "Name" }, { key: "parent_code", label: "Parent code" }, { key: "sort_order", label: "Sort order", type: "number" },
      ]} />
      <ConfigSection resource="macros" title="Macros" rows={macros.data ?? []} fields={[
        { key: "name", label: "Name" }, { key: "description", label: "Description" }, { key: "actions", label: "Actions (JSON)", type: "json", placeholder: '[{"set_status":"pending"}]' },
      ]} />
      <ConfigSection resource="canned_replies" title="Canned replies & templates" rows={canned.data ?? []} fields={[
        { key: "title", label: "Title" }, { key: "body", label: "Body", type: "textarea" }, { key: "category_code", label: "Category code" },
      ]} />
      <ConfigSection resource="channels" title="Channels" rows={(channels.data ?? []).map((c: any) => ({ ...c, description: `reopen window ${c.reopen_window_days ?? "—"}d · max attachment ${c.max_attachment_bytes ? `${Math.round(c.max_attachment_bytes / 1048576)} MB` : "—"}` }))} fields={[
        { key: "code", label: "Code" }, { key: "name", label: "Name" }, { key: "sending_domain", label: "Sending domain" },
        { key: "reopen_window_days", label: "Reopen window (days)", type: "number" }, { key: "spam_quarantine", label: "Spam quarantine", type: "checkbox" },
      ]} />
    </div>
  );
}
