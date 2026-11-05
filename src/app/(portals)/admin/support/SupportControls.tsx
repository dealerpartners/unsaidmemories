"use client";

// Support Desk — shared client controls (owner's directives 2026-10-31:
// ONE unified search bar treatment on every page, real Lucide icons,
// dialogs on real pages calling real APIs).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

export function SupportSearch({ name = "q", placeholder, defaultValue }: { name?: string; placeholder: string; defaultValue?: string }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <Search size={14} style={{ position: "absolute", left: 10, color: "#758695", pointerEvents: "none" }} />
      <input className="search" style={{ paddingLeft: 30 }} name={name} placeholder={placeholder} defaultValue={defaultValue ?? ""} aria-label={placeholder} />
    </span>
  );
}

function firstValOf(f: ModalField): string {
  const o = f.options?.[0];
  return typeof o === "string" ? o : o?.value ?? "";
}

export type ModalField = {
  name: string; label: string; type?: "input" | "select" | "textarea" | "number";
  options?: (string | { value: string; label: string })[]; placeholder?: string; required?: boolean;
};

export function CreateModalButton({ label, title, fields, endpoint, primary = true, onCreated }: {
  label: string; title: string; fields: ModalField[]; endpoint: string; primary?: boolean;
  onCreated?: (row: any) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true); setError("");
    try {
      const payload: Record<string, unknown> = {};
      for (const f of fields) {
        // An untouched select still submits its shown (first) option —
        // several tables have NOT NULL columns those selects feed.
        const firstOpt = f.options?.[0];
        const firstVal = typeof firstOpt === "string" ? firstOpt : firstOpt?.value ?? "";
        const raw = f.type === "select" ? (values[f.name] ?? firstVal) : (values[f.name] ?? "");
        const v = raw.trim();
        if (f.required && !v) throw new Error(`${f.label} is required`);
        if (v) payload[f.name] = f.type === "number" ? Number(v) : v;
      }
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error || data.ok === false) throw new Error(data.error ?? `Request failed (${res.status})`);
      setOpen(false); setValues({});
      if (onCreated) onCreated(data.row ?? data.ticket);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
    setBusy(false);
  }

  return (
    <>
      <button className={`btn ${primary ? "primary" : ""}`} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <div className="modalback show" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="modal">
            <div className="modalhead"><b>{title}</b><button className="btn" aria-label="Close" onClick={() => setOpen(false)}><X size={14} /></button></div>
            <div className="modalbody">
              {fields.map((f) => (
                <div className="formrow" key={f.name}>
                  <label htmlFor={`m-${f.name}`}>{f.label}</label>
                  {f.type === "select" ? (
                    <select id={`m-${f.name}`} value={values[f.name] ?? firstValOf(f)} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
                      {(f.options ?? []).map((o) => typeof o === "string"
                        ? <option key={o} value={o}>{o}</option>
                        : <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea id={`m-${f.name}`} placeholder={f.placeholder} value={values[f.name] ?? ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
                  ) : (
                    <input id={`m-${f.name}`} type={f.type === "number" ? "number" : "text"} placeholder={f.placeholder} value={values[f.name] ?? ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
                  )}
                </div>
              ))}
              {error && <div style={{ color: "#b84747", fontSize: 12 }}>{error}</div>}
            </div>
            <div className="modalfoot">
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Create"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Toggle({ endpoint, field, initial, label }: { endpoint: string; field: string; initial: boolean; label: string }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function flip() {
    if (busy) return;
    setBusy(true);
    const next = !on; setOn(next);
    try {
      const res = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: next }) });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch { setOn(!next); }
    setBusy(false);
  }
  return <button className={`switch ${on ? "on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={flip} />;
}

export const NEW_TICKET_FIELDS: ModalField[] = [
  { name: "subject", label: "Subject", placeholder: "What does the customer need?", required: true },
  { name: "requesterName", label: "Customer name", placeholder: "Search or enter customer" },
  { name: "requesterEmail", label: "Customer email", placeholder: "name@company.com" },
  { name: "channel", label: "Channel", type: "select", options: ["email", "chat", "whatsapp", "phone", "social", "sms"] },
  { name: "priority", label: "Priority", type: "select", options: ["normal", "high", "urgent", "low"] },
];

// Toggle for one boolean key inside a channel's config jsonb — PATCHes
// the MERGED config object so sibling keys survive.
export function ConfigToggle({ endpoint, config, configKey, label }: {
  endpoint: string; config: Record<string, unknown>; configKey: string; label: string;
}) {
  const router = useRouter();
  const [on, setOn] = useState(!!config[configKey]);
  const [busy, setBusy] = useState(false);
  async function flip() {
    if (busy) return;
    setBusy(true);
    const next = !on; setOn(next);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: { ...config, [configKey]: next } }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch { setOn(!next); }
    setBusy(false);
  }
  return <button className={`switch ${on ? "on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={flip} />;
}
