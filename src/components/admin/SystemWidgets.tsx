"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { HealthCheck } from "@/lib/admin/health";

/** Create-warehouse form + active toggle for Locations & Branches. */
export function LocationCreateForm() {
  const router = useRouter();
  const [values, setValues] = useState({ name: "", code: "", warehouse_type: "fulfillment", city: "", state: "", country_code: "US", timezone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/system/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Create failed");
      setValues({ name: "", code: "", warehouse_type: "fulfillment", city: "", state: "", country_code: "US", timezone: "" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));
  return (
    <form onSubmit={submit}>
      {error && <div className="adm-alert adm-alert-error">{error}</div>}
      <div className="adm-field"><label className="adm-label">Name</label><input className="adm-input" required value={values.name} onChange={set("name")} placeholder="Memphis Fulfillment Center" /></div>
      <div className="adm-field"><label className="adm-label">Code</label><input className="adm-input" value={values.code} onChange={set("code")} placeholder="WH-002" /></div>
      <div className="adm-field"><label className="adm-label">Type</label>
        <select className="adm-select" value={values.warehouse_type} onChange={set("warehouse_type")}>
          {["fulfillment", "returns", "storage", "branch"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="adm-field"><label className="adm-label">City / State</label>
        <span style={{ display: "flex", gap: 8 }}>
          <input className="adm-input" value={values.city} onChange={set("city")} placeholder="City" />
          <input className="adm-input" value={values.state} onChange={set("state")} placeholder="ST" style={{ maxWidth: 90 }} />
        </span>
      </div>
      <div className="adm-field"><label className="adm-label">Timezone</label><input className="adm-input" value={values.timezone} onChange={set("timezone")} placeholder="America/Chicago" /></div>
      <button className="adm-btn" type="submit" disabled={busy}>{busy ? "Adding…" : "Add location"}</button>
    </form>
  );
}

export function LocationActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    await fetch("/api/admin/system/locations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: !isActive }),
    }).catch(() => null);
    setBusy(false);
    router.refresh();
  }
  return (
    <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" disabled={busy} onClick={toggle}>
      {isActive ? "Deactivate" : "Activate"}
    </button>
  );
}

/** Live system-health panel — runs the real probes via the API. */
export function HealthPanel() {
  const [checks, setChecks] = useState<HealthCheck[] | null>(null);
  const [at, setAt] = useState<string>("");
  const [error, setError] = useState("");
  async function run() {
    setError("");
    try {
      const res = await fetch("/api/admin/system/health");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Health check failed");
      setChecks(data.checks);
      setAt(data.at);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Health check failed");
    }
  }
  useEffect(() => {
    void run();
  }, []);
  const badge = (s: HealthCheck["status"]) =>
    s === "ok" ? <span className="adm-badge adm-badge-green">Operational</span>
    : s === "warn" ? <span className="adm-badge adm-badge-amber">Attention</span>
    : <span className="adm-badge adm-badge-red">Down</span>;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button type="button" className="adm-btn adm-btn-sm" onClick={run}>Re-run checks</button>
        {at && <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Last run {new Date(at).toLocaleString()}</span>}
      </div>
      {error && <div className="adm-alert adm-alert-error">{error}</div>}
      {!checks && !error && <div className="adm-empty">Running live probes…</div>}
      {checks && (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Service</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.label}</strong></td>
                  <td>{badge(c.status)}</td>
                  <td style={{ color: "var(--muted-foreground)" }}>{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Supplier ordering editor for the Integrations page. */
export function SupplierEditor({ id, orderingStatus, apiBaseUrl }: { id: string; orderingStatus: string | null; apiBaseUrl: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState(orderingStatus ?? "");
  const [base, setBase] = useState(apiBaseUrl ?? "");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    await fetch("/api/admin/system/integrations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ordering_status: status || null, api_base_url: base }),
    }).catch(() => null);
    setBusy(false);
    router.refresh();
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <select className="adm-select" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Ordering status">
        <option value="">— status —</option>
        {["live", "active", "paused", "disabled", "sandbox"].map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <input className="adm-input" style={{ width: 230 }} value={base} onChange={(e) => setBase(e.target.value)} placeholder="API base URL" aria-label="API base URL" />
      <button type="button" className="adm-btn adm-btn-sm" disabled={busy} onClick={save}>Save</button>
    </span>
  );
}

/** Document Center editor — sections of {title, body} entries persisted
 *  in tenants.settings.documents. */
export function DocumentCenterEditor({ initial }: { initial: Record<string, Array<{ title: string; body: string }>> }) {
  const router = useRouter();
  const [docs, setDocs] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const sections = ["guides", "policies", "disclaimers"];
  function update(section: string, idx: number, field: "title" | "body", value: string) {
    setDocs((d) => ({ ...d, [section]: (d[section] ?? []).map((e, i) => (i === idx ? { ...e, [field]: value } : e)) }));
    setSaved(false);
  }
  function add(section: string) {
    setDocs((d) => ({ ...d, [section]: [...(d[section] ?? []), { title: "", body: "" }] }));
    setSaved(false);
  }
  function remove(section: string, idx: number) {
    setDocs((d) => ({ ...d, [section]: (d[section] ?? []).filter((_, i) => i !== idx) }));
    setSaved(false);
  }
  async function save() {
    setBusy(true);
    const res = await fetch("/api/admin/system/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "documents", values: docs }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setSaved(true);
      router.refresh();
    }
  }
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {saved && <div className="adm-alert adm-alert-ok">Document center saved.</div>}
      {sections.map((section) => (
        <div className="adm-card" key={section}>
          <h2 style={{ textTransform: "capitalize" }}>{section}</h2>
          {(docs[section] ?? []).map((entry, i) => (
            <div key={i} style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 12 }}>
              <div className="adm-field">
                <label className="adm-label">Title</label>
                <input className="adm-input" value={entry.title} onChange={(e) => update(section, i, "title", e.target.value)} placeholder="Document title" />
              </div>
              <div className="adm-field">
                <label className="adm-label">Body</label>
                <textarea className="adm-textarea" rows={4} value={entry.body} onChange={(e) => update(section, i, "body", e.target.value)} placeholder="Document text…" />
              </div>
              <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => remove(section, i)}>Remove</button>
            </div>
          ))}
          <div style={{ marginTop: 12 }}>
            <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => add(section)}>+ Add {section.slice(0, -1)}</button>
          </div>
        </div>
      ))}
      <div>
        <button type="button" className="adm-btn" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save document center"}</button>
      </div>
    </div>
  );
}
