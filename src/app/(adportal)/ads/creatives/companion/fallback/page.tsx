"use client";

import { useEffect, useState } from "react";

type Field =
  | { key: string; label: string; type: "text"; placeholder?: string }
  | { key: string; label: string; type: "select"; options: string[] }
  | { key: string; label: string; type: "toggle"; desc?: string }
  | { key: string; label: string; type: "textarea"; placeholder?: string };

const KIND = "companion";
const TITLE = "Fallback";
const DESC = "The fallback image is the visual that serves when an audio or video ad has no companion creative of its own. These are the account’s stored companion settings — the same document the companion behavior form edits.";
const FIELDS: Field[] = [{"key": "enabled", "label": "Companions enabled", "type": "toggle", "desc": "Allow companion visuals to serve with audio and video ads"}, {"key": "fallback_image_url", "label": "Fallback image URL", "type": "text", "placeholder": "https://\u2026"}];

export default function Page() {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/ads/settings?kind=${KIND}`).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.settings) setValues(d.settings); }).catch(() => {});
  }, []);

  const save = () => {
    setNote("");
    setSaving(true);
    fetch("/api/ads/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: KIND, settings: values }) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "save_failed"); setNote("Saved."); })
      .catch((e) => setNote("Couldn't save: " + String(e?.message || "unknown error")))
      .finally(() => setSaving(false));
  };

  const inputCls = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none";
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{TITLE}</h1>
        <p className="mt-1 text-sm text-neutral-500">{DESC}</p>
      </div>
      {note && <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{note}</div>}
      <div className="space-y-5 rounded-xl border border-neutral-100 bg-white p-6">
        {FIELDS.map((f) => (
          <div key={f.key}>
            {f.type === "toggle" ? (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-neutral-700">{f.label}</p>
                  {f.desc && <p className="text-xs text-neutral-500">{f.desc}</p>}
                </div>
                <button onClick={() => setValues({ ...values, [f.key]: !values[f.key] })} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${values[f.key] ? "bg-emerald-500" : "bg-neutral-200"}`}>
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${values[f.key] ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
            ) : (
              <>
                <label className="mb-1 block text-sm font-medium text-neutral-700">{f.label}</label>
                {f.type === "text" && <input value={String(values[f.key] ?? "")} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} placeholder={f.placeholder} className={inputCls} />}
                {f.type === "textarea" && <textarea value={String(values[f.key] ?? "")} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} placeholder={f.placeholder} rows={5} className={inputCls} />}
                {f.type === "select" && (
                  <select value={String(values[f.key] ?? f.options[0])} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} className={inputCls}>
                    {f.options.map((o) => (<option key={o} value={o}>{o}</option>))}
                  </select>
                )}
              </>
            )}
          </div>
        ))}
        <div className="flex justify-end pt-2">
          <button onClick={save} disabled={saving} className="rounded-lg bg-[#f2eafe] px-5 py-2 text-sm font-medium text-[#6942c2] disabled:opacity-50">Save changes</button>
        </div>
      </div>
    </div>
  );
}
