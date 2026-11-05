"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface SettingsField {
  key: string;
  label: string;
  /** Plain-language tooltip for this field's control (data-tip). */
  tip?: string;
  type?: "text" | "email" | "number" | "select" | "textarea";
  options?: string[];
  help?: string;
  placeholder?: string;
}

/** Generic settings form — PUTs { section, values } to
 *  /api/admin/system/settings and refreshes the page on success. */
export default function SettingsForm({
  section,
  fields,
  initial,
  submitLabel = "Save changes",
}: {
  section: string;
  fields: SettingsField[];
  initial: Record<string, unknown>;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of fields) v[f.key] = initial[f.key] == null ? "" : String(initial[f.key]);
    return v;
  });
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string>("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setError("");
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      payload[f.key] = f.type === "number" ? (values[f.key] === "" ? null : Number(values[f.key])) : values[f.key];
    }
    try {
      const res = await fetch("/api/admin/system/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, values: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      setState("saved");
      router.refresh();
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <form onSubmit={submit}>
      {state === "error" && <div className="adm-alert adm-alert-error">{error}</div>}
      {state === "saved" && <div className="adm-alert adm-alert-ok">Saved.</div>}
      {fields.map((f) => (
        <div className="adm-field" key={f.key}>
          <label className="adm-label" htmlFor={`sf-${section}-${f.key}`}>{f.label}</label>
          {f.type === "select" ? (
            <select
              id={`sf-${section}-${f.key}`}
              className="adm-select"
              data-tip={f.tip}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            >
              <option value="">—</option>
              {(f.options ?? []).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              id={`sf-${section}-${f.key}`}
              className="adm-textarea"
              data-tip={f.tip}
              rows={4}
              value={values[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          ) : (
            <input
              id={`sf-${section}-${f.key}`}
              className="adm-input"
              data-tip={f.tip}
              type={f.type ?? "text"}
              value={values[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          )}
          {f.help && <div className="adm-help">{f.help}</div>}
        </div>
      ))}
      <button type="submit" className="adm-btn" disabled={state === "saving"} data-tip="Save these settings — the store starts using them right away.">
        {state === "saving" ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
