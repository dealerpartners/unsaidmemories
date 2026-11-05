"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { INTEGRATION_SERVICES } from "@/lib/integrations/catalog";

interface KeyStatus {
  keyName: string;
  source: "saved" | "server" | null;
  lastFour: string | null;
}

/** Step 4 test answer from POST /api/admin/integrations/test-connection —
 *  mirrors ConnectionTestResult in lib/integrations/test-connection.
 *  Proof values only; never a key (last four at most). */
interface TestResult {
  serviceId: string;
  serviceName: string;
  status: "connected" | "failed" | "untestable";
  proofLine: string | null;
  detail: string;
  fix: string | null;
  verified: string[];
  testedAt: string;
}

/** Same browser store the Connect wizard writes after a successful
 *  test, so this page's card shows the same proof line. */
const proofStorageKey = (serviceId: string) => `unsaid-connection-proof:${serviceId}`;

export default function ConnectionsClient() {
  const [statuses, setStatuses] = useState<Record<string, KeyStatus>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [storeKey, setStoreKey] = useState<{ exists: boolean; updatedAt: string | null }>({ exists: false, updatedAt: null });
  const [newStoreKey, setNewStoreKey] = useState<string | null>(null);
  /** Connection tests run from a card (or proved earlier by the
   *  Connect wizard in this browser): serviceId → latest result, and
   *  proof lines restored from the browser store on load. Additive —
   *  the cards themselves are unchanged. */
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [storedProofs, setStoredProofs] = useState<Record<string, { proofLine: string; testedAt: string }>>({});

  useEffect(() => {
    const restored: Record<string, { proofLine: string; testedAt: string }> = {};
    for (const svc of INTEGRATION_SERVICES) {
      try {
        const raw = window.localStorage.getItem(proofStorageKey(svc.id));
        if (raw) {
          const parsed = JSON.parse(raw) as { proofLine?: string; testedAt?: string };
          if (parsed.proofLine) restored[svc.id] = { proofLine: parsed.proofLine, testedAt: parsed.testedAt ?? "" };
        }
      } catch {
        // Storage unavailable — cards simply show no remembered proof.
      }
    }
    setStoredProofs(restored);
  }, []);

  const testConnection = async (serviceId: string) => {
    setTestingId(serviceId);
    try {
      const res = await fetch("/api/admin/integrations/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "test failed");
      const result = d as TestResult;
      setTestResults((prev) => ({ ...prev, [serviceId]: result }));
      if (result.status === "connected" && result.proofLine) {
        const proof = { proofLine: result.proofLine, testedAt: result.testedAt };
        setStoredProofs((prev) => ({ ...prev, [serviceId]: proof }));
        try {
          window.localStorage.setItem(proofStorageKey(serviceId), JSON.stringify(proof));
        } catch {
          // The line still shows for this visit.
        }
      }
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [serviceId]: {
          serviceId,
          serviceName: serviceId,
          status: "failed",
          proofLine: null,
          detail: "The test itself could not be run just now — the shop's own test page did not answer. Your key is still saved.",
          fix: "Press “Test connection” again in a moment.",
          verified: [],
          testedAt: new Date().toISOString(),
        },
      }));
    }
    setTestingId(null);
  };

  const load = useCallback(async () => {
    const [keysRes, storeRes] = await Promise.all([
      fetch("/api/admin/integrations/keys"),
      fetch("/api/admin/integrations/store-api-key"),
    ]);
    if (keysRes.ok) {
      const d = await keysRes.json();
      const map: Record<string, KeyStatus> = {};
      for (const s of d.statuses as KeyStatus[]) map[s.keyName] = s;
      setStatuses(map);
    }
    if (storeRes.ok) setStoreKey(await storeRes.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const s of INTEGRATION_SERVICES) if (!seen.includes(s.category)) seen.push(s.category);
    return seen;
  }, []);

  const save = async (keyName: string, label: string) => {
    const value = (drafts[keyName] ?? "").trim();
    if (!value) {
      setNotice(`Paste the ${label} into its box first, then press Save.`);
      return;
    }
    setBusy(keyName);
    setNotice(null);
    const res = await fetch("/api/admin/integrations/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyName, value }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setNotice(d.error ?? "That did not save — please try again.");
      return;
    }
    const map: Record<string, KeyStatus> = {};
    for (const s of d.statuses as KeyStatus[]) map[s.keyName] = s;
    setStatuses(map);
    setDrafts((prev) => ({ ...prev, [keyName]: "" }));
    setNotice(`Saved. ${label} is connected.`);
  };

  const remove = async (keyName: string, label: string) => {
    setBusy(keyName);
    const res = await fetch(`/api/admin/integrations/keys?keyName=${encodeURIComponent(keyName)}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) {
      const map: Record<string, KeyStatus> = {};
      for (const s of d.statuses as KeyStatus[]) map[s.keyName] = s;
      setStatuses(map);
      setNotice(`${label} removed.`);
    }
  };

  const createStoreKey = async () => {
    setBusy("store-api");
    const res = await fetch("/api/admin/integrations/store-api-key", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok && d.apiKey) {
      setNewStoreKey(d.apiKey);
      setStoreKey({ exists: true, updatedAt: new Date().toISOString() });
    }
  };

  const revokeStoreKey = async () => {
    setBusy("store-api");
    await fetch("/api/admin/integrations/store-api-key", { method: "DELETE" });
    setBusy(null);
    setStoreKey({ exists: false, updatedAt: null });
    setNewStoreKey(null);
    setNotice("Store API key turned off. Your other app will no longer be able to read products until you create a new key.");
  };

  const serviceConnected = (fields: { keyName: string }[]) =>
    fields.some((f) => statuses[f.keyName]?.source);

  return (
    <div style={{ maxWidth: 860 }}>
      {notice && (
        <div style={{ background: "#eef7ee", border: "1px solid #bfe3bf", color: "#205c20", borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 14 }}>
          {notice}
        </div>
      )}

      {categories.map((cat) => (
        <div key={cat} style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: 17, marginBottom: 12 }}>{cat}</h2>
          <div style={{ display: "grid", gap: 14 }}>
            {INTEGRATION_SERVICES.filter((s) => s.category === cat).map((svc) => (
              <section key={svc.id} style={{ border: "1px solid #e4e4ea", borderRadius: 14, padding: "16px 18px", background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ maxWidth: 560 }}>
                    <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>{svc.name}</h3>
                    <p className="small-muted" style={{ margin: 0 }}>{svc.blurb}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span
                      data-tip={serviceConnected(svc.fields) ? "Connected — at least one key for this service is saved, so the shop can use it." : "Not connected yet — paste a key below and press Save, and this turns green."}
                      style={{
                        fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999,
                        background: serviceConnected(svc.fields) ? "#e5f4e5" : "#f3f0e9",
                        color: serviceConnected(svc.fields) ? "#22754a" : "#8a6d1d",
                      }}
                    >
                      {serviceConnected(svc.fields) ? "✓ Connected" : "Not connected yet"}
                    </span>
                    {svc.dashboardUrl && (
                      <a className="btn btn-ghost btn-sm" href={svc.dashboardUrl} target="_blank" rel="noreferrer"
                        data-tip={`Open ${svc.name} in a new tab. That's their own website — it's where you find your key, and where you manage your account with them.`}>
                        {svc.dashboardLabel} ↗
                      </a>
                    )}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
                  {svc.fields.map((f) => {
                    const st = statuses[f.keyName];
                    return (
                      <div key={f.keyName}>
                        <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                          {f.label}
                          {st?.source && (
                            <span style={{ fontWeight: 400, color: "#22754a", marginLeft: 8 }}
                              data-tip={st.source === "saved" ? "A key is saved here, in the locked store on this page. Only its last four characters ever show — the full key is never displayed again, even to you." : "This key lives on the server itself, set up behind the scenes. You can still paste a new one here — yours would be used first."}>
                              {st.source === "saved" ? `Saved here (ends in ${st.lastFour ?? "••••"})` : `Set on the server (ends in ${st.lastFour ?? "••••"})`}
                            </span>
                          )}
                        </label>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <input
                            type={f.secret ? "password" : "text"}
                            autoComplete="off"
                            spellCheck={false}
                            placeholder={st?.source ? "Paste a new value to replace it" : f.placeholder}
                            value={drafts[f.keyName] ?? ""}
                            onChange={(e) => setDrafts((p) => ({ ...p, [f.keyName]: e.target.value }))}
                            style={{ flex: "1 1 320px", padding: "9px 11px", borderRadius: 9, border: "1px solid #d8d8e0", fontSize: 14 }}
                            data-tip={f.secret ? "Paste your key here. For your safety it is never shown again after you save — the page will only ever show its last four characters." : "Type or paste the value here, then press Save."}
                          />
                          <button className="btn btn-primary btn-sm" disabled={busy === f.keyName} onClick={() => save(f.keyName, `${svc.name} ${f.label}`)}
                            data-tip="Save this key. It is stored locked away (encrypted), and your shop starts using it right away.">
                            {busy === f.keyName ? "Saving…" : "Save"}
                          </button>
                          {st?.source === "saved" && (
                            <button className="btn btn-ghost btn-sm" disabled={busy === f.keyName} onClick={() => remove(f.keyName, `${svc.name} ${f.label}`)}
                              data-tip="Remove the key saved on this page. If the same key also lives on the server, the server's copy will be used instead.">
                              Remove
                            </button>
                          )}
                        </div>
                        <p className="small-muted" style={{ margin: "4px 0 0" }}>{f.help}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Additive (Connect wizard CP2): the same Step 4 test
                    and proof line, on the card. Nothing above changed. */}
                <div style={{ marginTop: 14, borderTop: "1px solid #eeeef2", paddingTop: 12 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={testingId === svc.id}
                    onClick={() => void testConnection(svc.id)}
                    data-tip={`Test ${svc.name} for real: the shop connects with the saved key and reads something back from your account. The line it shows is the proof — saving a key alone never counts as connected.`}
                  >
                    {testingId === svc.id ? "Testing…" : "Test connection"}
                  </button>
                  {(() => {
                    const r = testResults[svc.id];
                    if (r?.status === "connected" && r.proofLine) {
                      return (
                        <p style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 700, color: "#205c20", background: "#eef7ee", border: "1px solid #bfe3bf", borderRadius: 10, padding: "10px 12px" }}>
                          {r.proofLine}
                        </p>
                      );
                    }
                    if (r?.status === "failed") {
                      return (
                        <div style={{ margin: "10px 0 0", fontSize: 13, color: "#8f1d18", background: "#fdecea", border: "1px solid #e5a49f", borderRadius: 10, padding: "10px 12px" }}>
                          <p style={{ margin: 0 }}>{r.detail}</p>
                          {r.fix && <p style={{ margin: "6px 0 0" }}>{r.fix}</p>}
                        </div>
                      );
                    }
                    if (r?.status === "untestable") {
                      return (
                        <div style={{ margin: "10px 0 0", fontSize: 13, color: "#202126", background: "#f4f2ff", border: "1px solid #d9d2fa", borderRadius: 10, padding: "10px 12px" }}>
                          <p style={{ margin: 0 }}>{r.detail}</p>
                          {r.verified.length > 0 && (
                            <p style={{ margin: "6px 0 0" }}>Checked instead: {r.verified.join(" · ")}</p>
                          )}
                        </div>
                      );
                    }
                    const proof = storedProofs[svc.id];
                    if (proof) {
                      return (
                        <p style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 700, color: "#205c20" }}
                          data-tip="This line was read back from the service by the connection test (here or in the Connect a service guide) in this browser. Press Test connection to run it again fresh.">
                          {proof.proofLine}
                          {proof.testedAt ? ` (tested ${new Date(proof.testedAt).toLocaleString()})` : ""}
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
              </section>
            ))}
          </div>
        </div>
      ))}

      <h2 style={{ fontSize: 17, marginBottom: 12 }}>Your Store API (for your other app)</h2>
      <section style={{ border: "1px solid #e4e4ea", borderRadius: 14, padding: "16px 18px", background: "#fff" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Product feed for another app</h3>
        <p className="small-muted" style={{ maxWidth: 620 }}>
          If you have another app or website that should show this store&apos;s products, give it this
          special key. It can <b>read</b> the product list only — it cannot change anything, see orders,
          or see customers. Create a key, copy it into the other app, and you are done. Creating a new
          key switches the old one off.
        </p>
        <p className="small-muted">
          Address the other app should read: <code>GET /api/store/v1/products</code> with header{" "}
          <code>x-store-api-key</code>.
        </p>
        {newStoreKey ? (
          <div style={{ background: "#fff8e6", border: "1px solid #ecd28a", borderRadius: 10, padding: "12px 14px", marginTop: 10 }}>
            <p style={{ margin: "0 0 6px", fontWeight: 700 }}>Your new key — copy it now, it will not be shown again:</p>
            <code style={{ fontSize: 15, wordBreak: "break-all" }}>{newStoreKey}</code>
          </div>
        ) : (
          <p style={{ marginTop: 10 }}>
            {storeKey.exists ? (
              <>A key is switched on{storeKey.updatedAt ? ` (created ${new Date(storeKey.updatedAt).toLocaleDateString()})` : ""}.</>
            ) : (
              "No key yet."
            )}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="btn btn-primary btn-sm" disabled={busy === "store-api"} onClick={createStoreKey}
            data-tip="Make a brand-new key for your other app. Copy it straight away — it is shown only once. Any old key stops working the moment you create a new one.">
            {storeKey.exists ? "Create a new key" : "Create my key"}
          </button>
          {storeKey.exists && (
            <button className="btn btn-ghost btn-sm" disabled={busy === "store-api"} onClick={revokeStoreKey}
              data-tip="Switch the Store API off completely. Your other app will not be able to read products until you create a new key.">
              Turn off
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
