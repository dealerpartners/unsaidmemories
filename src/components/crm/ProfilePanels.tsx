"use client";

import { useEffect, useState } from "react";
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

export function NotesPanel({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [type, setType] = useState("internal");
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="crm-card">
      <h3>Add a note</h3>
      {error && <div className="crm-error">{error}</div>}
      <div className="crm-formrow">
        <div className="crm-field">
          <label>Type</label>
          <select className="crm-select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="internal">Internal note</option>
            <option value="customer">Customer note</option>
            <option value="system">System activity</option>
          </select>
        </div>
        <div className="crm-field">
          <label>Pinned</label>
          <label className="crm-toggle">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Pin to top
          </label>
        </div>
      </div>
      <div className="crm-field">
        <label>Note</label>
        <textarea className="crm-textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write the note…" />
      </div>
      <button
        className="crm-btn"
        disabled={busy || !body.trim()}
        onClick={async () => {
          setBusy(true); setError(null);
          try {
            await api(`/api/admin/crm/customers/${customerId}/notes`, "POST", { body, note_type: type, is_pinned: pinned });
            setBody("");
            router.refresh();
          } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}
      >
        {busy ? "Saving…" : "Add note"}
      </button>
    </div>
  );
}

type Template = { id: string; name: string; channel: string; subject: string; body: string };

export function ComposerPanel({ customerId, email, phone }: { customerId: string; email: string | null; phone: string | null }) {
  const router = useRouter();
  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/crm/templates")
      .then((r) => r.json())
      .then((j) => setTemplates((j as { templates?: Template[] }).templates || []))
      .catch(() => setTemplates([]));
  }, []);

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setChannel(t.channel);
    setSubject(t.subject || "");
    setBody(t.body || "");
  };

  return (
    <div className="crm-card">
      <h3>Send a message</h3>
      {error && <div className="crm-error">{error}</div>}
      {status && <div className="crm-ok">Last send status: {status}</div>}
      <div className="crm-formrow">
        <div className="crm-field">
          <label>Channel</label>
          <select className="crm-select" value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="email">Email{email ? ` — ${email}` : ""}</option>
            <option value="sms">SMS{phone ? ` — ${phone}` : ""}</option>
          </select>
        </div>
        <div className="crm-field">
          <label>Template</label>
          <select className="crm-select" defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">Choose a template…</option>
            {templates.filter((t) => t.channel === channel).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>
      {channel === "email" && (
        <div className="crm-field"><label>Subject</label><input className="crm-input" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
      )}
      <div className="crm-field"><label>Message</label><textarea className="crm-textarea" value={body} onChange={(e) => setBody(e.target.value)} /></div>
      <button
        className="crm-btn"
        disabled={busy || !body.trim()}
        onClick={async () => {
          setBusy(true); setError(null);
          try {
            const r = await api(`/api/admin/crm/customers/${customerId}/messages`, "POST", { channel, subject: subject || undefined, body });
            setStatus((r as { status: string }).status);
            setBody("");
            router.refresh();
          } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}
      >
        {busy ? "Sending…" : "Send message"}
      </button>
      <span className="crm-muted crm-small" style={{ marginLeft: 10 }}>
        Email sends through Resend when configured; every send is recorded with its real delivery status.
      </span>
    </div>
  );
}

/** Tree 1.3 Communication action: Add to Campaign — enrolls this customer
 *  in an existing campaign/automation (a real crm_campaign_members row). */
export function AddToCampaignControl({
  customerId,
  campaigns,
}: {
  customerId: string;
  campaigns: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (campaigns.length === 0) return null;
  return (
    <div style={{ marginTop: 14 }}>
      {error && <div className="crm-error">{error}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select className="crm-select" id={`campaign-pick-${customerId}`} defaultValue="">
          <option value="">Add to campaign…</option>
          {campaigns.map((cp) => (
            <option key={cp.id} value={cp.id}>{cp.name}</option>
          ))}
        </select>
        <button
          className="crm-btn crm-ghost crm-sm"
          type="button"
          disabled={busy}
          onClick={async () => {
            const sel = document.getElementById(`campaign-pick-${customerId}`) as HTMLSelectElement | null;
            if (!sel?.value) return;
            setBusy(true); setError(null);
            try {
              await api(`/api/admin/crm/customers/${customerId}/campaigns`, "POST", { campaign_id: sel.value });
              router.refresh();
            } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
          }}
        >
          {busy ? "Adding…" : "Add to campaign"}
        </button>
      </div>
    </div>
  );
}

export function DocumentsPanel({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("Design approval");
  const [expires, setExpires] = useState("");
  const [status, setStatus] = useState("active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="crm-card">
      <h3>Register a document</h3>
      {error && <div className="crm-error">{error}</div>}
      <div className="crm-formrow">
        <div className="crm-field"><label>Document name</label><input className="crm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Signed design approval — Order #1042" /></div>
        <div className="crm-field"><label>Type</label>
          <select className="crm-select" value={kind} onChange={(e) => setKind(e.target.value)}>
            {["Design approval", "Consent form", "Contract", "Identification", "Tax form", "Other"].map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="crm-formrow">
        <div className="crm-field"><label>Expires</label><input className="crm-input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></div>
        <div className="crm-field"><label>Status</label>
          <select className="crm-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {["active", "pending_review", "approved", "expired", "rejected"].map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
      </div>
      <button
        className="crm-btn"
        disabled={busy || !name.trim()}
        onClick={async () => {
          setBusy(true); setError(null);
          try {
            await api(`/api/admin/crm/customers/${customerId}/documents`, "POST", { name, document_kind: kind, expires_at: expires || null, status });
            setName("");
            router.refresh();
          } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}
      >
        {busy ? "Saving…" : "Register document"}
      </button>
    </div>
  );
}

export function DocumentStatusSelect({ customerId, documentId, status }: { customerId: string; documentId: string; status: string }) {
  const router = useRouter();
  return (
    <select
      className="crm-select"
      style={{ minHeight: 30, padding: "4px 8px" }}
      value={status}
      onChange={async (e) => {
        await api(`/api/admin/crm/customers/${customerId}/documents`, "PATCH", { document_id: documentId, status: e.target.value });
        router.refresh();
      }}
    >
      {["active", "pending_review", "approved", "expired", "rejected"].map((s) => (
        <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
      ))}
    </select>
  );
}

export function OptInsPanel({
  customerId,
  initial,
}: {
  customerId: string;
  initial: {
    marketing_email_opt_in: boolean; marketing_sms_opt_in: boolean;
    transactional_email_opt_in: boolean; transactional_sms_opt_in: boolean;
    do_not_call: boolean; do_not_contact: boolean;
    preferred_payment_method: string; communication_notes: string; notification_frequency: string;
  };
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flag = (k: keyof typeof initial) => ({
    checked: Boolean(state[k]),
    onChange: async (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = { ...state, [k]: e.target.checked };
      setState(next);
      setBusy(true); setError(null);
      try {
        await api(`/api/admin/crm/customers/${customerId}/preferences`, "PATCH", { [k]: e.target.checked });
        router.refresh();
      } catch (err) { setError((err as Error).message); setState(state); } finally { setBusy(false); }
    },
  });
  const rows: [keyof typeof initial, string][] = [
    ["marketing_email_opt_in", "Marketing email"],
    ["marketing_sms_opt_in", "Marketing SMS"],
    ["transactional_email_opt_in", "Transactional email (orders, receipts)"],
    ["transactional_sms_opt_in", "Transactional SMS"],
    ["do_not_call", "Do not call"],
    ["do_not_contact", "Do not contact (all channels)"],
  ];
  return (
    <div className="crm-card">
      <h3>Opt-in &amp; opt-out settings</h3>
      {error && <div className="crm-error">{error}</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map(([k, label]) => (
          <label key={k} className="crm-toggle">
            <input type="checkbox" disabled={busy} {...flag(k)} /> {label}
          </label>
        ))}
      </div>
      <div className="crm-formrow" style={{ marginTop: 14 }}>
        <div className="crm-field">
          <label>Preferred payment method</label>
          <input
            className="crm-input"
            value={state.preferred_payment_method}
            onChange={(e) => setState({ ...state, preferred_payment_method: e.target.value })}
            onBlur={async () => {
              await api(`/api/admin/crm/customers/${customerId}/preferences`, "PATCH", { preferred_payment_method: state.preferred_payment_method || null });
              router.refresh();
            }}
          />
        </div>
        <div className="crm-field">
          <label>Notification frequency</label>
          <select
            className="crm-select"
            value={state.notification_frequency}
            onChange={async (e) => {
              setState({ ...state, notification_frequency: e.target.value });
              await api(`/api/admin/crm/customers/${customerId}/preferences`, "PATCH", { notification_frequency: e.target.value });
              router.refresh();
            }}
          >
            <option value="">Standard</option>
            <option value="daily">Daily digest</option>
            <option value="weekly">Weekly digest</option>
            <option value="minimal">Minimal</option>
          </select>
        </div>
      </div>
      <div className="crm-field">
        <label>Communication notes</label>
        <textarea
          className="crm-textarea"
          value={state.communication_notes}
          onChange={(e) => setState({ ...state, communication_notes: e.target.value })}
          onBlur={async () => {
            await api(`/api/admin/crm/customers/${customerId}/preferences`, "PATCH", { communication_notes: state.communication_notes || null });
          }}
        />
      </div>
    </div>
  );
}

export function TagsPanel({
  customerId,
  assigned,
  allTags,
}: {
  customerId: string;
  assigned: { id: string; name: string }[];
  allTags: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unassigned = allTags.filter((t) => !assigned.some((a) => a.id === t.id));
  return (
    <div className="crm-card">
      <h3>Tags</h3>
      {error && <div className="crm-error">{error}</div>}
      <div className="crm-chips" style={{ marginBottom: 12 }}>
        {assigned.length === 0 && <span className="crm-muted">No tags yet.</span>}
        {assigned.map((t) => (
          <span key={t.id} className="crm-chip crm-on" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            {t.name}
            <button
              type="button"
              aria-label={`Remove tag ${t.name}`}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", font: "inherit" }}
              onClick={async () => {
                await api(`/api/admin/crm/customers/${customerId}/tags?tag_id=${t.id}`, "DELETE");
                router.refresh();
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select className="crm-select" id={`tag-pick-${customerId}`} defaultValue="">
          <option value="">Add existing tag…</option>
          {unassigned.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <button
          className="crm-btn crm-ghost crm-sm"
          type="button"
          onClick={async () => {
            const sel = document.getElementById(`tag-pick-${customerId}`) as HTMLSelectElement | null;
            if (!sel?.value) return;
            setBusy(true);
            try { await api(`/api/admin/crm/customers/${customerId}/tags`, "POST", { tag_id: sel.value }); router.refresh(); }
            catch (e) { setError((e as Error).message); } finally { setBusy(false); }
          }}
        >
          Add tag
        </button>
        <input className="crm-input" placeholder="New tag name" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="crm-btn crm-sm"
          type="button"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            try { await api(`/api/admin/crm/customers/${customerId}/tags`, "POST", { name }); setName(""); router.refresh(); }
            catch (e) { setError((e as Error).message); } finally { setBusy(false); }
          }}
        >
          Create &amp; assign
        </button>
      </div>
    </div>
  );
}
