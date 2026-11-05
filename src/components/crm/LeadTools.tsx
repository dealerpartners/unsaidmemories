"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Request failed (${res.status})`);
  return json;
}

import { LEAD_SOURCES, LOST_REASONS } from "@/lib/crm/constants";

export function NewLeadButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ contact_name: "", email: "", phone: "", lead_source: "website", lead_type: "custom_order", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  if (!open) return <button className="crm-btn" type="button" onClick={() => setOpen(true)}>New lead</button>;
  return (
    <div className="crm-modal-backdrop" onClick={() => setOpen(false)}>
      <div className="crm-modal" onClick={(e) => e.stopPropagation()}>
        <h2>New lead</h2>
        {error && <div className="crm-error">{error}</div>}
        <div className="crm-field"><label>Contact name</label><input className="crm-input" value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} /></div>
        <div className="crm-formrow">
          <div className="crm-field"><label>Email</label><input className="crm-input" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div className="crm-field"><label>Phone</label><input className="crm-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        </div>
        <div className="crm-formrow">
          <div className="crm-field"><label>Source</label>
            <select className="crm-select" value={form.lead_source} onChange={(e) => set("lead_source", e.target.value)}>
              {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div className="crm-field"><label>Type</label>
            <select className="crm-select" value={form.lead_type} onChange={(e) => set("lead_type", e.target.value)}>
              <option value="custom_order">Custom order</option>
              <option value="bulk_order">Bulk / business order</option>
              <option value="design_help">Design help</option>
              <option value="general">General enquiry</option>
            </select>
          </div>
        </div>
        <div className="crm-field"><label>Notes</label><textarea className="crm-textarea" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="crm-btn crm-ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
          <button
            className="crm-btn"
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true); setError(null);
              try { await api("/api/admin/crm/leads", "POST", form); setOpen(false); router.refresh(); }
              catch (e) { setError((e as Error).message); } finally { setBusy(false); }
            }}
          >
            {busy ? "Saving…" : "Create lead"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LeadRowControls({ lead }: { lead: { id: string; status: string; booking_outcome: string | null; customer_id: string | null } }) {
  const router = useRouter();
  const [status, setStatus] = useState(lead.status || "new");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true); setError(null);
    try { await api(`/api/admin/crm/leads/${lead.id}`, "PATCH", body); router.refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <select
        className="crm-select"
        style={{ minHeight: 30, padding: "4px 8px" }}
        value={status}
        disabled={busy}
        onChange={(e) => { setStatus(e.target.value); patch({ status: e.target.value }); }}
      >
        {["new", "contacted", "working", "qualified", "converted", "lost"].map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <select
        className="crm-select"
        style={{ minHeight: 30, padding: "4px 8px" }}
        defaultValue=""
        disabled={busy}
        onChange={(e) => { if (e.target.value) patch({ booking_outcome: e.target.value }); }}
      >
        <option value="">Outcome…</option>
        {["booked", "pending", "canceled", "lost", "no_response"].map((s) => (
          <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
        ))}
      </select>
      <select
        className="crm-select"
        style={{ minHeight: 30, padding: "4px 8px" }}
        defaultValue=""
        disabled={busy}
        onChange={(e) => { if (e.target.value) patch({ lost_reason: e.target.value }); }}
      >
        <option value="">Lost reason…</option>
        {LOST_REASONS.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      {!lead.customer_id ? (
        <button
          className="crm-btn crm-sm"
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true); setError(null);
            try {
              const r = await api(`/api/admin/crm/leads/${lead.id}/convert`, "POST");
              router.push(`/admin/crm/customers/${(r as { customer_id: string }).customer_id}`);
            } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
          }}
        >
          Convert to customer
        </button>
      ) : (
        <a className="crm-btn crm-ghost crm-sm" href={`/admin/crm/customers/${lead.customer_id}`}>View customer</a>
      )}
      {error && <span className="crm-small" style={{ color: "#c62f3b" }}>{error}</span>}
    </div>
  );
}
