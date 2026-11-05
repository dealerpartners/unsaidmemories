"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

async function send(url: string, body: unknown, method = "POST") {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}
function useBusy(): [boolean, (fn: () => Promise<void>) => Promise<void>, string] {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr("");
    try { await fn(); } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return [busy, run, err];
}

/** Generic status/decision buttons that PATCH a trust resource, then refresh. */
export function DecideButtons({ url, options, current }: { url: string; options: { value: string; label: string; danger?: boolean }[]; current?: string }) {
  const router = useRouter();
  const [busy, run, err] = useBusy();
  return (
    <span className="ts-row" style={{ gap: 6 }}>
      {options.filter((o) => o.value !== current).map((o) => (
        <button key={o.value} type="button" className={`ts-btn sm ${o.danger ? "red" : "gray"}`} disabled={busy}
          data-tip={`Record this decision: “${o.label}”. The change is saved and written into the history.`}
          onClick={() => run(async () => { await send(url, { status: o.value }, "PATCH"); router.refresh(); })}>
          {o.label}
        </button>
      ))}
      {err && <span className="ts-err" style={{ margin: 0 }}>{err}</span>}
    </span>
  );
}

/** Save the current queue filters as a named saved view. */
export function SaveViewForm({ filter }: { filter: Record<string, unknown> }) {
  const router = useRouter();
  const [busy, run, err] = useBusy();
  const [name, setName] = useState("");
  return (
    <div>
      <label className="ts-label">Save current view</label>
      <div className="ts-row">
        <input className="ts-input" style={{ flex: 1 }} placeholder="View name" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="button" className="ts-btn sm" disabled={busy || !name.trim()} data-tip="Save the filters you've set as a named view, listed in the sidebar for one-click return."
          onClick={() => run(async () => { await send("/api/admin/support/queues", { name, filter }); setName(""); router.refresh(); })}>Save</button>
      </div>
      {err && <div className="ts-err" style={{ marginTop: 6 }}>{err}</div>}
    </div>
  );
}

export function DeleteViewButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, run] = useBusy();
  return (
    <button type="button" className="ts-btn sm gray" disabled={busy} data-tip="Delete this saved view from the sidebar. The tickets themselves are not affected."
      onClick={() => run(async () => { await send(`/api/admin/support/queues/${id}`, undefined, "DELETE"); router.refresh(); })}>Delete</button>
  );
}

/** Create a support ticket from the desk. */
export function NewTicketForm({ staff, teams }: { staff: any[]; teams: any[] }) {
  const router = useRouter();
  const [busy, run, err] = useBusy();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ subject: "", body: "", requester_name: "", requester_email: "", requester_type: "customer", category: "general", priority: "normal", assigned_staff_id: "", assigned_team_id: "" });
  if (!open) return <button type="button" className="ts-btn" onClick={() => setOpen(true)} data-tip="Start a support ticket by hand — for a phone call, a walk-in question, or anything that didn't arrive by email.">+ New ticket</button>;
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  return (
    <div className="ts-card">
      <h3>New ticket</h3>
      <div className="ts-filters">
        <input className="ts-input" placeholder="Requester name" value={f.requester_name} onChange={(e) => set("requester_name", e.target.value)} />
        <input className="ts-input" placeholder="Requester email" value={f.requester_email} onChange={(e) => set("requester_email", e.target.value)} />
        <select className="ts-select" value={f.requester_type} onChange={(e) => set("requester_type", e.target.value)}>
          {["customer", "employee", "partner", "franchise", "external"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="ts-select" value={f.category} onChange={(e) => set("category", e.target.value)}>
          {["general", "billing", "technical", "seller_support", "payments", "dmca", "chargeback", "privacy_request", "trust_safety", "legal", "feedback", "contact"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="ts-select" value={f.priority} onChange={(e) => set("priority", e.target.value)}>
          {["low", "normal", "high", "urgent"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="ts-select" value={f.assigned_staff_id} onChange={(e) => set("assigned_staff_id", e.target.value)}>
          <option value="">Unassigned</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.display_name || s.email}</option>)}
        </select>
        <select className="ts-select" value={f.assigned_team_id} onChange={(e) => set("assigned_team_id", e.target.value)}>
          <option value="">No team</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <input className="ts-input" style={{ marginTop: 8 }} placeholder="Subject" value={f.subject} onChange={(e) => set("subject", e.target.value)} />
      <textarea className="ts-textarea" style={{ marginTop: 8 }} rows={3} placeholder="First message…" value={f.body} onChange={(e) => set("body", e.target.value)} />
      {err && <div className="ts-err" style={{ marginTop: 8 }}>{err}</div>}
      <div className="ts-row" style={{ marginTop: 8 }}>
        <button type="button" className="ts-btn" disabled={busy || !f.subject.trim()} data-tip="Create the ticket. It appears in the queue right away, and you'll be taken straight to it."
          onClick={() => run(async () => {
            const j = await send("/api/admin/support/tickets", { ...f, assigned_staff_id: f.assigned_staff_id || null, assigned_team_id: f.assigned_team_id || null });
            router.push(`/admin/support/${j.ticket.id}`);
          })}>Create ticket</button>
        <button type="button" className="ts-btn gray" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

/** Configuration manager: one resource at a time (teams, SLA policies, rules, categories, macros, canned replies, channels). */
export function ConfigSection({ resource, title, rows, fields }: {
  resource: string;
  title: string;
  rows: any[];
  fields: { key: string; label: string; type?: "text" | "number" | "checkbox" | "textarea" | "json"; placeholder?: string }[];
}) {
  const router = useRouter();
  const [busy, run, err] = useBusy();
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setForm({ ...form, [k]: v });
  const coerce = (vals: Record<string, string>) => {
    const out: Record<string, unknown> = {};
    fields.forEach((fd) => {
      const v = vals[fd.key];
      if (v === undefined || v === "") return;
      if (fd.type === "number") out[fd.key] = Number(v);
      else if (fd.type === "checkbox") out[fd.key] = v === "on";
      else if (fd.type === "json") { try { out[fd.key] = JSON.parse(v); } catch { out[fd.key] = v; } }
      else out[fd.key] = v;
    });
    return out;
  };
  return (
    <div className="ts-card">
      <h3>{title}</h3>
      {rows.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>None yet — create the first one below.</p>}
      {rows.map((r) => (
        <div key={r.id} className="ts-row" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--line)", padding: "6px 0", fontSize: 13 }}>
          <span><b>{r.name || r.title || r.code}</b> <span style={{ color: "var(--muted)" }}>{r.description || r.body?.slice(0, 60) || ""}</span></span>
          <span className="ts-row">
            <span className={`ts-pill ${r.is_active === false ? "gray" : "green"}`}>{r.is_active === false ? "inactive" : "active"}</span>
            <button type="button" className="ts-btn sm gray" disabled={busy}
              onClick={() => run(async () => { await send("/api/admin/support/config", { resource, id: r.id, patch: { is_active: r.is_active === false } }, "PATCH"); router.refresh(); })}>
              {r.is_active === false ? "Activate" : "Deactivate"}
            </button>
            <button type="button" className="ts-btn sm red" disabled={busy}
              onClick={() => run(async () => { await send("/api/admin/support/config", { resource, id: r.id }, "DELETE"); router.refresh(); })}>Delete</button>
          </span>
        </div>
      ))}
      <label className="ts-label">Add {title.toLowerCase().replace(/s$/, "")}</label>
      <div className="ts-filters">
        {fields.map((fd) => fd.type === "checkbox" ? (
          <label key={fd.key} style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" onChange={(e) => set(fd.key, e.target.checked ? "on" : "")} /> {fd.label}
          </label>
        ) : fd.type === "textarea" || fd.type === "json" ? (
          <textarea key={fd.key} className="ts-textarea" rows={2} placeholder={fd.placeholder || fd.label} value={form[fd.key] ?? ""} onChange={(e) => set(fd.key, e.target.value)} />
        ) : (
          <input key={fd.key} className="ts-input" type={fd.type === "number" ? "number" : "text"} placeholder={fd.placeholder || fd.label} value={form[fd.key] ?? ""} onChange={(e) => set(fd.key, e.target.value)} />
        ))}
      </div>
      {err && <div className="ts-err" style={{ marginTop: 8 }}>{err}</div>}
      <button type="button" className="ts-btn sm" style={{ marginTop: 8 }} disabled={busy}
        onClick={() => run(async () => { await send("/api/admin/support/config", { resource, values: coerce(form) }); setForm({}); router.refresh(); })}>Create</button>
    </div>
  );
}

/** Policy manager for Trust & Safety policies (trust_policies table). */
export function PolicyManager({ policies, migrationPending }: { policies: any[]; migrationPending: boolean }) {
  const router = useRouter();
  const [busy, run, err] = useBusy();
  const [form, setForm] = useState({ code: "", title: "", body: "", status: "active" });
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div>
      {migrationPending && <div className="ts-err">The trust_policies table is not applied yet — migration 20261029_trust_policies.sql ships with this build and is applied at merge. Policies below will persist once applied.</div>}
      {policies.map((p) => (
        <div key={p.id} className="ts-card">
          <div className="ts-row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>{p.title} <span className="ts-pill gray">{p.code}</span> <span className={`ts-pill ${p.status === "active" ? "green" : "amber"}`}>{p.status}</span> <span style={{ color: "var(--muted)", fontSize: 12 }}>v{p.version}</span></h3>
            <span className="ts-row">
              <button type="button" className="ts-btn sm gray" onClick={() => { setEditing(p.id); setForm({ code: p.code, title: p.title, body: p.body, status: p.status }); }}>Edit</button>
              <button type="button" className="ts-btn sm red" disabled={busy} onClick={() => run(async () => { await send(`/api/admin/trust/policies/${p.id}`, undefined, "DELETE"); router.refresh(); })}>Delete</button>
            </span>
          </div>
          <p style={{ whiteSpace: "pre-wrap", fontSize: 13.5 }}>{p.body}</p>
        </div>
      ))}
      <div className="ts-card">
        <h3>{editing ? "Edit policy" : "New policy"}</h3>
        <div className="ts-filters">
          <input className="ts-input" placeholder="Code (e.g. counterfeit)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!editing} />
          <input className="ts-input" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <select className="ts-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="active">active</option><option value="draft">draft</option><option value="archived">archived</option>
          </select>
        </div>
        <textarea className="ts-textarea" rows={5} style={{ marginTop: 8 }} placeholder="Policy text — what is prohibited, what evidence counts, what enforcement follows…" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        {err && <div className="ts-err" style={{ marginTop: 8 }}>{err}</div>}
        <div className="ts-row" style={{ marginTop: 8 }}>
          <button type="button" className="ts-btn sm" disabled={busy || !form.title.trim() || !form.body.trim()}
            onClick={() => run(async () => {
              if (editing) await send(`/api/admin/trust/policies/${editing}`, form, "PATCH");
              else await send("/api/admin/trust/policies", form);
              setForm({ code: "", title: "", body: "", status: "active" }); setEditing(null); router.refresh();
            })}>{editing ? "Save changes" : "Create policy"}</button>
          {editing && <button type="button" className="ts-btn sm gray" onClick={() => { setEditing(null); setForm({ code: "", title: "", body: "", status: "active" }); }}>Cancel</button>}
        </div>
      </div>
    </div>
  );
}

/** Create forms for violations / investigations. */
export function CreateCaseForm({ kind }: { kind: "violation" | "investigation" }) {
  const router = useRouter();
  const [busy, run, err] = useBusy();
  const [f, setF] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  const fields = kind === "violation"
    ? [["subject_ref", "Subject account / customer ref"], ["violation_type", "Violation type (e.g. counterfeit_design)"], ["severity", "Severity (low/medium/high/critical)"], ["listing_ref", "Listing / product ref"], ["order_ref", "Order ref"], ["description", "Description"]]
    : [["subject_ref", "Subject account ref"], ["investigation_type", "Type (fraud / chargeback_pattern / account_takeover)"], ["priority", "Priority (low/normal/high/urgent)"], ["order_ref", "Order ref"], ["notes", "Opening notes"]];
  return (
    <div className="ts-card">
      <h3>Open a {kind}</h3>
      <div className="ts-filters">
        {fields.map(([k, label]) => (
          <input key={k} className="ts-input" placeholder={label} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
        ))}
      </div>
      {err && <div className="ts-err" style={{ marginTop: 8 }}>{err}</div>}
      <button type="button" className="ts-btn sm" style={{ marginTop: 8 }} disabled={busy}
        onClick={() => run(async () => { await send(`/api/admin/trust/${kind === "violation" ? "violations" : "investigations"}`, f); setF({}); router.refresh(); })}>
        Open {kind}
      </button>
    </div>
  );
}
