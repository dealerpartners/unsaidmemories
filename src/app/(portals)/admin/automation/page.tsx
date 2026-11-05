"use client";

// /admin/automation — Automation · Workflows (owner's feature tree;
// Sunny's MARKETING.html table). Real rows from the automations engine:
// GET /api/admin/crm/automations — crm_campaigns with
// campaign_type='automation', trigger/action configuration riding in
// segment_definition. "New workflow" goes to the automations builder
// surface in CRM, where workflows are created and run.

import { Plus } from "lucide-react";
import { MktPage, StatusChip, useFetch } from "@/components/admin/marketing/frame";

type Automation = {
  id: string;
  name: string;
  status?: string | null;
  segment_definition?: {
    trigger?: string;
    action?: string;
    delay_days?: number;
  } | null;
  created_at?: string;
};

function triggerLabel(a: Automation): string {
  const t = a.segment_definition?.trigger;
  return t ? t.replace(/_/g, " ") : "—";
}
function actionLabel(a: Automation): string {
  const d = a.segment_definition;
  if (!d?.action) return "—";
  const base = d.action.replace(/_/g, " ");
  return d.delay_days ? `${base} · after ${d.delay_days}d` : base;
}

export default function AutomationPage() {
  const { data, loading, error } = useFetch<{ automations: Automation[] }>("/api/admin/crm/automations");
  const rows = data?.automations ?? [];

  return (
    <MktPage
      title="Workflows"
      actions={
        <a className="btn primary" href="/admin/crm/automations">
          <Plus size={15} /> New workflow
        </a>
      }
    >
      <div className="card">
        <div className="card-pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><strong>Marketing workflows</strong><div className="small muted">Trigger-based journeys across email, ads, and social</div></div>
          <a className="btn primary" href="/admin/crm/automations"><Plus size={15} /> New workflow</a>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Workflow</th><th>Trigger</th><th>Actions</th><th>Status</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4}><div className="empty">Loading…</div></td></tr>
              ) : error ? (
                <tr><td colSpan={4}><div className="empty">{error}</div></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4}><div className="empty">No workflows yet. Create the first one in the automations builder.</div></td></tr>
              ) : rows.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.name}</strong></td>
                  <td>{triggerLabel(a)}</td>
                  <td>{actionLabel(a)}</td>
                  <td><StatusChip status={a.status ?? "draft"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </MktPage>
  );
}
