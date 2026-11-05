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

import { TRIGGERS } from "@/lib/crm/constants";

export function AutomationForm({ segments, templates }: { segments: { id: string; name: string }[]; templates: { id: string; name: string; subject: string; body: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", trigger: "cart_abandoned", action: "send_message", channel: "email",
    segment_id: "", template_campaign_id: "", message_subject: "", message_body: "", delay_days: 1,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  if (!open) return <button className="crm-btn" type="button" onClick={() => setOpen(true)}>New automation</button>;
  return (
    <div className="crm-modal-backdrop" onClick={() => setOpen(false)}>
      <div className="crm-modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <h2>New automation</h2>
        {error && <div className="crm-error">{error}</div>}
        <div className="crm-field"><label>Name</label><input className="crm-input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Cart reminder — 24h" /></div>
        <div className="crm-formrow">
          <div className="crm-field"><label>Trigger</label>
            <select className="crm-select" value={form.trigger} onChange={(e) => set("trigger", e.target.value)}>
              {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="crm-field"><label>Action</label>
            <select className="crm-select" value={form.action} onChange={(e) => set("action", e.target.value)}>
              <option value="send_message">Send message</option>
              <option value="create_task">Create follow-up task</option>
              <option value="enroll">Enroll only (record membership)</option>
            </select>
          </div>
        </div>
        <div className="crm-formrow">
          <div className="crm-field"><label>Audience segment</label>
            <select className="crm-select" value={form.segment_id} onChange={(e) => set("segment_id", e.target.value)}>
              <option value="">Choose a segment…</option>
              {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="crm-field"><label>Delay (days)</label>
            <input className="crm-input" type="number" min="0" value={form.delay_days} onChange={(e) => set("delay_days", Number(e.target.value))} />
          </div>
        </div>
        <div className="crm-formrow">
          <div className="crm-field"><label>Channel</label>
            <select className="crm-select" value={form.channel} onChange={(e) => set("channel", e.target.value)}>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>
          </div>
          <div className="crm-field"><label>Template</label>
            <select
              className="crm-select"
              value={form.template_campaign_id}
              onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value);
                set("template_campaign_id", e.target.value);
                if (t) { set("message_subject", t.subject); set("message_body", t.body); }
              }}
            >
              <option value="">Write inline…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div className="crm-field"><label>Subject</label><input className="crm-input" value={form.message_subject} onChange={(e) => set("message_subject", e.target.value)} /></div>
        <div className="crm-field"><label>Message body</label><textarea className="crm-textarea" value={form.message_body} onChange={(e) => set("message_body", e.target.value)} /></div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="crm-btn crm-ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
          <button
            className="crm-btn"
            type="button"
            disabled={busy || !form.name.trim()}
            onClick={async () => {
              setBusy(true); setError(null);
              try {
                await api("/api/admin/crm/automations", "POST", { ...form, segment_id: form.segment_id || null, template_campaign_id: form.template_campaign_id || null });
                setOpen(false);
                router.refresh();
              } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
            }}
          >
            {busy ? "Saving…" : "Create automation"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AutomationRowControls({ automation }: { automation: { id: string; status: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <button
        className="crm-btn crm-ghost crm-sm"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api(`/api/admin/crm/automations/${automation.id}`, "PATCH", { status: automation.status === "active" ? "paused" : "active" });
            router.refresh();
          } finally { setBusy(false); }
        }}
      >
        {automation.status === "active" ? "Pause" : "Activate"}
      </button>
      <button
        className="crm-btn crm-sm"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true); setError(null); setMsg(null);
          try {
            const r = await api(`/api/admin/crm/automations/${automation.id}/run`, "POST");
            const R = r as { audience: number; processed: number; failed: number };
            setMsg(`Ran: ${R.processed}/${R.audience} processed${R.failed ? `, ${R.failed} skipped` : ""}`);
            router.refresh();
          } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}
      >
        {busy ? "Running…" : "Run now"}
      </button>
      <button
        className="crm-btn crm-danger crm-sm"
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!confirm("Delete this automation?")) return;
          await api(`/api/admin/crm/automations/${automation.id}`, "DELETE");
          router.refresh();
        }}
      >
        Delete
      </button>
      {msg && <span className="crm-small" style={{ color: "#178a50" }}>{msg}</span>}
      {error && <span className="crm-small" style={{ color: "#c62f3b" }}>{error}</span>}
    </span>
  );
}
