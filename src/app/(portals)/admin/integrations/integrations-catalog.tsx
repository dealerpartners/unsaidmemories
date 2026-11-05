"use client";

// Integrations hub — Sunny's design (unsaid-integrations spec) as a real
// page on a real route. Every status is computed from the Connections
// vault (listKeyStatuses via /api/admin/integrations/keys); Connect /
// Test / Disconnect call the real keys + test-connection APIs. Nothing
// here is demo data, and secret values are never shown — only last-four.

import { useMemo, useState } from "react";
import Link from "next/link";
import type { IntegrationService } from "@/lib/integrations/catalog";
import "./integrations-hub.css";

export type KeyStatusLite = { keyName: string; source: "saved" | "env" | null; lastFour: string | null };
export type ServiceStatus = "connected" | "attention" | "available";

const GROUPS: { name: string; desc: string; ids: string[] }[] = [
  { name: "Infrastructure & observability", desc: "Hosting, database, product analytics and platform health", ids: ["vercel", "supabase", "posthog", "ga4"] },
  { name: "E-commerce & supplier network", desc: "Catalog imports, product sync and supplier operations", ids: ["printful", "printify", "gelato", "gooten", "cj-dropshipping", "apliiq", "dropcommerce", "prodigi", "spocket", "spreadconnect", "syncee", "teemill", "shippo"] },
  { name: "Payments & commerce", desc: "Payments, billing and transaction infrastructure", ids: ["stripe"] },
  { name: "Content & communications", desc: "Publishing, transactional email and content delivery", ids: ["payload", "resend"] },
  { name: "Search & discovery", desc: "Search indexing, catalog discovery and autocomplete", ids: ["algolia"] },
  { name: "AI & model providers", desc: "Model access, coding agents, image generation and AI routing", ids: ["vercel-ai-gateway", "openai", "codex", "anthropic", "google-ai", "pollinations"] },
  { name: "Marketing & social publishing", desc: "Social scheduling and cross-channel publishing", ids: ["metricool", "whatsapp", "line"] },
];

const LOGOS: Record<string, { mark: string; cls: string }> = {
  vercel: { mark: "▲", cls: "dark" }, supabase: { mark: "S", cls: "teal" }, posthog: { mark: "P", cls: "orange" }, ga4: { mark: "G", cls: "orange" },
  printful: { mark: "P", cls: "dark" }, printify: { mark: "P", cls: "teal" }, gelato: { mark: "G", cls: "dark" }, gooten: { mark: "G", cls: "purple" },
  "cj-dropshipping": { mark: "CJ", cls: "orange" }, apliiq: { mark: "A", cls: "dark" }, dropcommerce: { mark: "D", cls: "teal" },
  prodigi: { mark: "Pr", cls: "purple" }, spocket: { mark: "S", cls: "orange" }, spreadconnect: { mark: "SC", cls: "dark" },
  syncee: { mark: "Sy", cls: "teal" }, teemill: { mark: "T", cls: "teal" }, stripe: { mark: "S", cls: "purple" },
  payload: { mark: "Py", cls: "dark" }, resend: { mark: "R", cls: "teal" }, algolia: { mark: "A", cls: "purple" },
  "vercel-ai-gateway": { mark: "✳", cls: "dark" }, openai: { mark: "◎", cls: "dark" }, codex: { mark: "C", cls: "teal" },
  anthropic: { mark: "A", cls: "orange" }, "google-ai": { mark: "G", cls: "purple" }, pollinations: { mark: "✿", cls: "teal" },
  metricool: { mark: "M", cls: "purple" },
  shippo: { mark: "S", cls: "dark" }, whatsapp: { mark: "W", cls: "teal" }, line: { mark: "L", cls: "teal" },
};

type TestResult = { status: "connected" | "failed" | "untestable"; proofLine: string | null; detail: string; fix: string | null };

export default function IntegrationsCatalog({ services, initialStatuses, supplierCount }: {
  services: IntegrationService[];
  initialStatuses: KeyStatusLite[];
  supplierCount: number;
}) {
  const [statuses, setStatuses] = useState<KeyStatusLite[]>(initialStatuses);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"All" | "Connected" | "Available" | "Attention">("All");
  const [active, setActive] = useState<IntegrationService | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [activity, setActivity] = useState<{ event: string; name: string; time: string; result: string }[]>([]);

  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const statusOf = (svc: IntegrationService): ServiceStatus => {
    const present = svc.fields.filter((f) => statuses.find((s) => s.keyName === f.keyName)?.source).length;
    if (present === 0) return "available";
    if (present === svc.fields.length) return "connected";
    return "attention";
  };
  const connectedCount = services.filter((s) => statusOf(s) === "connected").length;
  const attentionCount = services.filter((s) => statusOf(s) === "attention").length;

  const toast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(""), 3800); };
  const log = (event: string, name: string, result: string) =>
    setActivity((a) => [{ event, name, result, time: new Date().toLocaleString() }, ...a].slice(0, 30));

  async function runTest(svc: IntegrationService) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/integrations/test-connection", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceId: svc.id }),
      });
      const data: TestResult & { error?: string } = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setTestResult(data);
      log("Connection test", svc.name, data.status === "connected" ? (data.proofLine ?? "Passed") : data.status === "failed" ? "Failed" : "No live test wired");
      if (data.status === "connected") toast(data.proofLine ?? `${svc.name} test passed.`);
      else if (data.status === "failed") toast(`${svc.name}: ${data.fix ?? data.detail}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Test failed");
    }
    setBusy(false);
  }

  async function saveAndConnect() {
    if (!active) return;
    setBusy(true);
    try {
      for (const f of active.fields) {
        const v = (fieldValues[f.keyName] ?? "").trim();
        if (!v) continue;
        const res = await fetch("/api/admin/integrations/keys", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyName: f.keyName, value: v }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Could not save ${f.label}`);
        if (data.statuses) setStatuses(data.statuses);
      }
      log("Connection enabled", active.name, "Credentials saved to the vault");
      toast(`${active.name} credentials saved.`);
      setActive(null); setFieldValues({}); setTestResult(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed");
    }
    setBusy(false);
  }

  async function disconnect() {
    if (!active) return;
    setBusy(true);
    try {
      for (const f of active.fields) {
        const st = statuses.find((s) => s.keyName === f.keyName);
        if (st?.source !== "saved") continue;
        const res = await fetch(`/api/admin/integrations/keys?keyName=${encodeURIComponent(f.keyName)}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (data.statuses) setStatuses(data.statuses);
      }
      log("Disconnected", active.name, "Saved credentials removed");
      toast(`${active.name} disconnected.`);
      setActive(null); setFieldValues({}); setTestResult(null);
    } catch { toast("Disconnect failed"); }
    setBusy(false);
  }

  const visibleGroups = GROUPS.map((g) => ({
    ...g,
    items: g.ids.map((id) => byId.get(id)).filter((s): s is IntegrationService => !!s).filter((s) => {
      const st = statusOf(s);
      if (filter === "Connected" && st !== "connected") return false;
      if (filter === "Available" && st !== "available") return false;
      if (filter === "Attention" && st !== "attention") return false;
      if (query && !`${s.name} ${s.blurb} ${g.name}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    }),
  })).filter((g) => g.items.length > 0);
  const visibleCount = visibleGroups.reduce((n, g) => n + g.items.length, 0);

  const statusLabel = (st: ServiceStatus) => st === "connected" ? "Connected" : st === "attention" ? "Needs attention" : "Not connected";
  const statusClass = (st: ServiceStatus) => st === "connected" ? "connected" : st === "attention" ? "attention" : "available";

  return (
    <div className="intg">
      <main className="shell">
        <div className="heading">
          <div>
            <h1>Integrations</h1>
          </div>
          <div className="heading-actions">
            <button className="btn" onClick={() => window.location.reload()}>↻ Refresh status</button>
            <Link className="btn" href="/admin/integrations/connect" data-tip="The guided way to connect a service — one step at a time, with a live test at the end so you know it worked.">Guided setup</Link>
            <button className="btn primary" onClick={() => document.querySelector<HTMLInputElement>(".intg .search")?.focus()}>＋ Add integration</button>
          </div>
        </div>
        <nav className="tabs" aria-label="Integration sections">
          <span className="tab active">Overview</span>
          <Link className="tab" href="/admin/integrations/connections">Connections &amp; Keys</Link>
          <Link className="tab" href="/admin/integrations/activity">Activity log</Link>
        </nav>
        <section className="stats">
          <div className="stat"><div className="stat-label">Connected services</div><div className="stat-value">{connectedCount} <span style={{ fontSize: 13, color: "#91a0a8", fontWeight: 600 }}>/ {services.length}</span></div><div className="stat-foot">Credentials verified</div></div>
          <div className="stat"><div className="stat-label">Needs attention</div><div className="stat-value">{attentionCount}</div><div className="stat-foot">Partial credentials or errors</div></div>
          <div className="stat"><div className="stat-label">Supplier catalogs</div><div className="stat-value">{supplierCount.toLocaleString()}</div><div className="stat-foot">Products across connected suppliers</div></div>
          <div className="stat"><div className="stat-label">Last health check</div><div className="stat-value" style={{ fontSize: 19 }}>On demand</div><div className="stat-foot">Press Test connection on any card</div></div>
        </section>
        <div className="toolbar">
          <h2>All integrations <span style={{ color: "#8a9aa3", fontWeight: 500 }}>{visibleCount} services</span></h2>
          <div className="toolbar-right">
            <input className="search" placeholder="⌕  Search integrations..." aria-label="Search integrations" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="btn" onClick={() => setQuery("")}>Clear</button>
          </div>
        </div>
        <div className="filters">
          {(["All", "Connected", "Available", "Attention"] as const).map((f) => (
            <button key={f} className={`filter ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {f === "All" ? "All services" : f === "Available" ? "Not connected" : f === "Connected" ? "Connected" : "Needs attention"}
            </button>
          ))}
        </div>
        <div>
          {visibleGroups.length === 0 && <div className="empty">No integrations match your search.</div>}
          {visibleGroups.map((g) => (
            <section key={g.name}>
              <div className="section-title"><h3>{g.name}</h3><span>{g.items.length} service{g.items.length === 1 ? "" : "s"} · {g.desc}</span></div>
              <div className="grid">
                {g.items.map((svc) => {
                  const st = statusOf(svc);
                  const logo = LOGOS[svc.id] ?? { mark: svc.name[0] ?? "?", cls: "dark" };
                  const savedLine = svc.fields.map((f) => statuses.find((s) => s.keyName === f.keyName)).find((s) => s?.source);
                  return (
                    <article className="integration-card" key={svc.id}>
                      <div className="card-top">
                        <div className="provider"><div className={`logo ${logo.cls}`}>{logo.mark}</div><div><h4>{svc.name}</h4><p>{svc.blurb}</p></div></div>
                        <span className={`status ${statusClass(st)}`}><i className="dot" />{statusLabel(st)}</span>
                      </div>
                      <div className="card-desc">{st === "connected" ? "Credentials are stored securely. Connection is enabled." : st === "attention" ? "Some credentials are saved — finish connecting to enable this service." : "Connect this provider to enable its features across Unsaid."}</div>
                      <div className="meta"><span>{savedLine ? (savedLine.source === "saved" ? "Saved key" : "Server key") : "Last checked"}</span><strong>{savedLine ? `ends in ${savedLine.lastFour ?? "••••"}` : "—"}</strong></div>
                      <div className="card-actions">
                        <button className={`btn ${st === "connected" ? "" : "primary"}`} onClick={() => { setActive(svc); setFieldValues({}); setTestResult(null); }}>{st === "connected" ? "Manage connection" : "Connect"}</button>
                        <button className="text-btn" disabled={busy} onClick={() => { setActive(svc); setTestResult(null); runTest(svc); }}>Test connection</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <section className="panel">
          <div className="panel-head"><div><h3>Recent integration activity</h3><p>Connection and synchronization events</p></div><Link className="text-btn" href="/admin/integrations/activity">Full log</Link></div>
          <table className="activity">
            <thead><tr><th>Event</th><th>Integration</th><th>Time</th><th>Result</th></tr></thead>
            <tbody>
              {activity.length === 0 ? (
                <tr><td colSpan={4} className="empty">No activity yet this session. Connection tests and saves will appear here — the full history is under Activity log.</td></tr>
              ) : activity.slice(0, 8).map((a, i) => (
                <tr key={i}><td className="event">{a.event}</td><td>{a.name}</td><td>{a.time}</td><td>{a.result}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
        <div className="notice"><strong>How this works:</strong> keys are encrypted in the Connections vault and resolved by the services themselves — the browser only ever sees status and last-four digits. The full key-by-key page lives under Connections &amp; Keys.</div>
      </main>

      {active && (
        <div className="modal-backdrop open" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) { setActive(null); setTestResult(null); } }}>
          <div className="modal">
            <div className="modal-head">
              <div><h3>{statusOf(active) === "connected" ? "Manage " : "Connect "}{active.name}</h3><p>{statusOf(active) === "connected" ? "Review credentials and verify this connection." : "Add credentials to connect this service."}</p></div>
              <button className="close" aria-label="Close" onClick={() => { setActive(null); setTestResult(null); }}>×</button>
            </div>
            <div className="modal-body">
              {active.fields.map((f) => {
                const st = statuses.find((s) => s.keyName === f.keyName);
                return (
                  <div className="field" key={f.keyName}>
                    <label htmlFor={`cred-${f.keyName}`}>{f.label}</label>
                    <input id={`cred-${f.keyName}`} type={f.secret ? "password" : "text"} placeholder={f.placeholder} autoComplete="off"
                      value={fieldValues[f.keyName] ?? ""} onChange={(e) => setFieldValues({ ...fieldValues, [f.keyName]: e.target.value })} />
                    <div className="help">{st?.source ? `Currently ${st.source === "saved" ? "saved in the vault" : "set on the server"} · ends in ${st.lastFour ?? "••••"}. Leave blank to keep it. ` : ""}{f.help}</div>
                  </div>
                );
              })}
              <div className="help">Secrets are encrypted server-side and never shown again. For OAuth-based providers, the connection completes on the provider&apos;s own sign-in page.</div>
              {testResult && (
                <div className={`test-result ${testResult.status === "connected" ? "ok" : testResult.status === "failed" ? "bad" : "plain"}`}>
                  {testResult.status === "connected" ? (testResult.proofLine ?? testResult.detail) : testResult.detail}
                  {testResult.fix && <div style={{ marginTop: 4 }}>{testResult.fix}</div>}
                </div>
              )}
            </div>
            <div className="modal-foot">
              {statusOf(active) === "connected"
                ? <button className="btn ghost" disabled={busy} onClick={disconnect}>Disconnect</button>
                : <span />}
              <div className="modal-foot-right">
                <button className="btn" onClick={() => { setActive(null); setTestResult(null); }}>Cancel</button>
                <button className="btn" disabled={busy} onClick={() => runTest(active)}>Test connection</button>
                <button className="btn primary" disabled={busy} onClick={saveAndConnect}>Save &amp; connect</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className={`toast ${toastMsg ? "show" : ""}`}>{toastMsg}</div>
    </div>
  );
}
