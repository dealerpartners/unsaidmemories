"use client";

// Developer portal key manager — self-serve signup + key list/revoke.
// This UI calls the SAME licensee API integrators use; there is no
// separate portal code path. The raw key is shown once at creation
// and stored only in this browser's localStorage afterwards.

import { useEffect, useState } from "react";

const LS_KEY = "unsaid_licensee_key";

type ApiKeyRow = {
  id: string;
  key_prefix: string;
  name: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

async function api(path: string, key: string | null, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function DevelopersClient() {
  const [key, setKey] = useState<string>("");
  const [savedKey, setSavedKey] = useState<string>("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [newKey, setNewKey] = useState<string>("");
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [notice, setNotice] = useState<string>("");

  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY) ?? "";
    setSavedKey(stored);
    setKey(stored);
  }, []);

  const refreshKeys = async (k: string) => {
    const { ok, data } = await api("/api/v1/licensee/keys", k);
    if (ok) setKeys(data.keys ?? []);
  };

  useEffect(() => {
    if (savedKey) void refreshKeys(savedKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const signup = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice("");
    setNewKey("");
    const res = await fetch("/api/v1/licensee/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: name, contact_email: email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNotice(data.error ?? "Signup failed.");
      return;
    }
    setNewKey(data.api_key as string);
    localStorage.setItem(LS_KEY, data.api_key as string);
    setSavedKey(data.api_key as string);
    setNotice("Account created. Copy the key below — it is never shown again.");
    void refreshKeys(data.api_key as string);
  };

  const saveKey = () => {
    localStorage.setItem(LS_KEY, key.trim());
    setSavedKey(key.trim());
    setNotice("Key saved in this browser.");
  };

  const revoke = async (id: string) => {
    const { ok } = await api("/api/v1/licensee/keys", savedKey, {
      method: "DELETE",
      body: JSON.stringify({ id }),
    });
    if (ok) {
      setNotice("Key revoked.");
      void refreshKeys(savedKey);
    }
  };

  const mint = async () => {
    const { ok, data } = await api("/api/v1/licensee/keys", savedKey, {
      method: "POST",
      body: JSON.stringify({ name: "Additional key" }),
    });
    if (ok) {
      setNewKey(data.api_key as string);
      setNotice("New key minted — copy it now, it is never shown again.");
      void refreshKeys(savedKey);
    } else {
      setNotice(data.error ?? "Could not mint a key.");
    }
  };

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>
          1. Create your advertiser account
        </h2>
        <p style={{ color: "#525252", fontSize: 14, margin: "0 0 12px" }}>
          Self-serve: an account plus its first API key. No sales call, no
          affiliate setup — this is a licensee API, not an affiliate system.
        </p>
        <form
          onSubmit={signup}
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Business / display name"
            required
            style={{
              flex: "1 1 200px",
              border: "1px solid #d4d4d4",
              borderRadius: 8,
              padding: "8px 12px",
            }}
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Contact email"
            type="email"
            required
            style={{
              flex: "1 1 200px",
              border: "1px solid #d4d4d4",
              borderRadius: 8,
              padding: "8px 12px",
            }}
          />
          <button
            type="submit"
            style={{
              background: "#171717",
              color: "#fff",
              borderRadius: 999,
              padding: "8px 18px",
              fontWeight: 600,
              border: 0,
              cursor: "pointer",
            }}
          >
            Create account + key
          </button>
        </form>
      </section>

      <section
        style={{
          border: "1px solid #e5e5e5",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>
          2. Use an existing key
        </h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="lk_…"
            style={{
              flex: "1 1 280px",
              border: "1px solid #d4d4d4",
              borderRadius: 8,
              padding: "8px 12px",
              fontFamily: "monospace",
            }}
          />
          <button
            onClick={saveKey}
            style={{
              background: "#171717",
              color: "#fff",
              borderRadius: 999,
              padding: "8px 18px",
              fontWeight: 600,
              border: 0,
              cursor: "pointer",
            }}
          >
            Save key in browser
          </button>
          {savedKey && (
            <button
              onClick={mint}
              style={{
                border: "1px solid #171717",
                background: "#fff",
                borderRadius: 999,
                padding: "8px 18px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Mint another key
            </button>
          )}
        </div>
        {newKey && (
          <p
            style={{
              marginTop: 12,
              padding: 12,
              background: "#fef9c3",
              borderRadius: 8,
              fontFamily: "monospace",
              wordBreak: "break-all",
              fontSize: 14,
            }}
          >
            {newKey}
          </p>
        )}
        {notice && (
          <p style={{ color: "#525252", fontSize: 14, marginTop: 8 }}>
            {notice}
          </p>
        )}
        {keys.length > 0 && (
          <table style={{ marginTop: 16, fontSize: 14, width: "100%" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th>Prefix</th>
                <th>Name</th>
                <th>Last used</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td style={{ fontFamily: "monospace" }}>{k.key_prefix}…</td>
                  <td>{k.name}</td>
                  <td>{k.last_used_at ?? "never"}</td>
                  <td>{k.revoked_at ? "revoked" : "active"}</td>
                  <td>
                    {!k.revoked_at && (
                      <button
                        onClick={() => void revoke(k.id)}
                        style={{
                          border: 0,
                          background: "none",
                          color: "#dc2626",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
