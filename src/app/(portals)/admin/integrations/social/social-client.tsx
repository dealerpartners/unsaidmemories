"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ProviderInfo {
  id: string;
  label: string;
  blurb: string;
  color: string;
  scopes: string[];
  configured: boolean;
  credentialSource: "env" | "settings" | null;
  envKeys: string[];
  callbackUrl: string;
}

interface AccountInfo {
  id: string;
  network: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: string;
  token_expires_at: string | null;
  created_at: string;
}

export default function SocialClient({
  providers,
  accounts,
}: {
  providers: ProviderInfo[];
  accounts: AccountInfo[];
}) {
  const router = useRouter();
  const [openConfig, setOpenConfig] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function saveConfig(network: string) {
    setBusy(network);
    setMessage(null);
    const res = await fetch("/api/admin/integrations/social/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network, clientId, clientSecret }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setMessage(json.error ?? "Saving the credentials failed.");
      return;
    }
    setClientId("");
    setClientSecret("");
    setOpenConfig(null);
    setMessage("Credentials saved. You can connect accounts now.");
    router.refresh();
  }

  async function disconnect(id: string, label: string) {
    if (!confirm(`Disconnect ${label}? Scheduled posts to it will fail until you reconnect.`)) return;
    setBusy(id);
    const res = await fetch(`/api/admin/integrations/social/accounts?id=${id}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) router.refresh();
    else setMessage("Disconnect failed.");
  }

  return (
    <div>
      {message && <div className="int-banner warn">{message}</div>}
      <div className="int-grid">
        {providers.map((p) => {
          const mine = accounts.filter((a) => a.network === p.id);
          const connected = mine.filter((a) => a.status === "connected");
          return (
            <div className="int-card" key={p.id}>
              <h3>
                <span className="int-dot" style={{ background: p.color }} />
                {p.label}
                <span className="int-grow" />
                {connected.length > 0 ? (
                  <span className="fabric-pill green">Connected</span>
                ) : p.configured ? (
                  <span className="fabric-pill">Ready</span>
                ) : (
                  <span className="fabric-pill gray">Not configured</span>
                )}
              </h3>
              <p className="int-muted" style={{ margin: "2px 0 10px" }}>{p.blurb}</p>

              {connected.map((a) => (
                <div className="int-row" key={a.id} style={{ marginBottom: 8 }}>
                  {a.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.avatar_url} alt="" className="int-avatar" />
                  ) : (
                    <span className="int-avatar" />
                  )}
                  <div className="int-grow">
                    <b>{a.handle ?? a.display_name ?? "Account"}</b>
                    <div className="int-muted">
                      connected {new Date(a.created_at).toLocaleDateString()}
                      {a.token_expires_at
                        ? ` · token renews by ${new Date(a.token_expires_at).toLocaleDateString()}`
                        : ""}
                    </div>
                  </div>
                  <button
                    className="adm-btn adm-btn-sm int-danger"
                    disabled={busy === a.id}
                    onClick={() => disconnect(a.id, `${p.label} ${a.handle ?? ""}`)}
                  >
                    Disconnect
                  </button>
                </div>
              ))}

              {p.configured ? (
                <div className="int-actions">
                  <a
                    className="adm-btn adm-btn-sm"
                    href={`/api/admin/integrations/social/connect/${p.id}`}
                  >
                    {connected.length ? "Connect another account" : `Connect ${p.label}`}
                  </a>
                  <span className="int-muted" style={{ alignSelf: "center" }}>
                    credentials from {p.credentialSource === "env" ? "environment" : "settings"}
                  </span>
                </div>
              ) : (
                <div>
                  <p className="int-muted" style={{ margin: "6px 0" }}>
                    Register an OAuth app on {p.label} with callback{" "}
                    <code>{p.callbackUrl}</code>, then add its credentials here or set{" "}
                    <code>{p.envKeys.join(" / ")}</code> in the environment.
                  </p>
                  {openConfig === p.id ? (
                    <div>
                      <label className="int-label">Client ID</label>
                      <input className="int-input" value={clientId} onChange={(e) => setClientId(e.target.value)} />
                      <label className="int-label">Client Secret</label>
                      <input
                        className="int-input"
                        type="password"
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                      />
                      <div className="int-actions">
                        <button
                          className="adm-btn adm-btn-sm"
                          disabled={busy === p.id || !clientId || !clientSecret}
                          onClick={() => saveConfig(p.id)}
                        >
                          Save credentials
                        </button>
                        <button className="adm-btn adm-btn-sm" onClick={() => setOpenConfig(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="adm-btn adm-btn-sm" onClick={() => setOpenConfig(p.id)}>
                      Add credentials
                    </button>
                  )}
                </div>
              )}
              <div className="int-muted" style={{ marginTop: 10, fontSize: 12 }}>
                Scopes requested: {p.scopes.join(", ")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
