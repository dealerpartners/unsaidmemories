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

export function TemplateForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", channel: "email", subject: "", body: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  if (!open) return <button className="crm-btn" type="button" onClick={() => setOpen(true)}>New template</button>;
  return (
    <div className="crm-modal-backdrop" onClick={() => setOpen(false)}>
      <div className="crm-modal" onClick={(e) => e.stopPropagation()}>
        <h2>New message template</h2>
        {error && <div className="crm-error">{error}</div>}
        <div className="crm-formrow">
          <div className="crm-field"><label>Name</label><input className="crm-input" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="crm-field"><label>Channel</label>
            <select className="crm-select" value={form.channel} onChange={(e) => set("channel", e.target.value)}>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>
          </div>
        </div>
        {form.channel === "email" && (
          <div className="crm-field"><label>Subject</label><input className="crm-input" value={form.subject} onChange={(e) => set("subject", e.target.value)} /></div>
        )}
        <div className="crm-field"><label>Body</label><textarea className="crm-textarea" value={form.body} onChange={(e) => set("body", e.target.value)} placeholder="Use the customer's name naturally — sends are personalised in the composer." /></div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="crm-btn crm-ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
          <button
            className="crm-btn"
            type="button"
            disabled={busy || !form.name.trim() || !form.body.trim()}
            onClick={async () => {
              setBusy(true); setError(null);
              try { await api("/api/admin/crm/templates", "POST", form); setOpen(false); router.refresh(); }
              catch (e) { setError((e as Error).message); } finally { setBusy(false); }
            }}
          >
            {busy ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeleteTemplateButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      className="crm-btn crm-danger crm-sm"
      type="button"
      onClick={async () => {
        if (!confirm("Delete this template?")) return;
        await api(`/api/admin/crm/templates?id=${id}`, "DELETE");
        router.refresh();
      }}
    >
      Delete
    </button>
  );
}
