"use client";

// Ad Center dashboard — runs entirely on the licensee API
// (/api/v1/licensee/*), the same API integrators use. The key lives
// only in this browser's localStorage (set from the Developer portal
// at /developers or pasted here).

import { useEffect, useState } from "react";

const LS_KEY = "unsaid_licensee_key";

type Campaign = {
  id: string;
  name: string;
  status: string;
  tier_code: string;
  placement_code: string | null;
  cpm_cents: number | null;
  daily_budget_cents: number;
  lifetime_spend_millicents: number;
};

async function api(path: string, key: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${key}`,
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export function AdCenterClient() {
  const [key, setKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [totals, setTotals] = useState<{
    impressions: number;
    clicks: number;
    conversions: number;
  } | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setSavedKey(localStorage.getItem(LS_KEY) ?? "");
    setKey(localStorage.getItem(LS_KEY) ?? "");
  }, []);

  const load = async (k: string) => {
    const c = await api("/api/v1/licensee/campaigns", k);
    if (c.ok) setCampaigns(c.data.campaigns ?? []);
    const r = await api("/api/v1/licensee/report", k);
    if (r.ok) setTotals(r.data.totals ?? null);
  };

  useEffect(() => {
    if (savedKey) void load(savedKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const saveKey = () => {
    localStorage.setItem(LS_KEY, key.trim());
    setSavedKey(key.trim());
    setNotice("Key saved in this browser.");
    void load(key.trim());
  };

  const setStatus = async (id: string, status: string) => {
    const { ok, data } = await api(`/api/v1/licensee/campaigns/${id}`, savedKey, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (ok) {
      setNotice(`Campaign ${status}.`);
      void load(savedKey);
    } else {
      setNotice(data.error ?? "Could not update the campaign.");
    }
  };

  if (!savedKey) {
    return (
      <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
        <p style={{ color: "#525252" }}>
          Paste your advertiser API key to open your Ad Center. Get one
          from the <a href="/developers">Developer portal</a>, or start
          at <a href="/advertise">/advertise</a>.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="lk_…"
            style={{
              flex: 1,
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
            Open Ad Center
          </button>
        </div>
        {notice && <p style={{ color: "#525252", fontSize: 14 }}>{notice}</p>}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {totals && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {(
            [
              ["Impressions", totals.impressions],
              ["Clicks", totals.clicks],
              ["Conversions", totals.conversions],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 12,
                padding: "16px 20px",
                minWidth: 140,
              }}
            >
              <div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>
              <div style={{ color: "#737373", fontSize: 13 }}>{label}</div>
            </div>
          ))}
        </div>
      )}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Your campaigns</h2>
          <a
            href="/ad-center/designer"
            style={{
              background: "#171717",
              color: "#fff",
              borderRadius: 999,
              padding: "8px 18px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Design an ad
          </a>
        </div>
        {campaigns.length === 0 ? (
          <p style={{ color: "#525252" }}>
            No campaigns yet — design your first ad in the designer.
          </p>
        ) : (
          <table style={{ fontSize: 14, width: "100%", marginTop: 12 }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th>Name</th>
                <th>Status</th>
                <th>Tier</th>
                <th>Placement</th>
                <th>CPM (¢)</th>
                <th>Spent (¢)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "8px 8px 8px 0" }}>{c.name}</td>
                  <td>{c.status}</td>
                  <td>{c.tier_code}</td>
                  <td>{c.placement_code ?? "—"}</td>
                  <td>{c.cpm_cents ?? "—"}</td>
                  <td>
                    {Math.round(Number(c.lifetime_spend_millicents ?? 0) / 1000)}
                  </td>
                  <td>
                    {c.status === "draft" && (
                      <button
                        onClick={() => void setStatus(c.id, "active")}
                        style={{ border: 0, background: "none", color: "#166534", fontWeight: 700, cursor: "pointer" }}
                      >
                        Publish
                      </button>
                    )}
                    {c.status === "active" && (
                      <button
                        onClick={() => void setStatus(c.id, "paused")}
                        style={{ border: 0, background: "none", color: "#92400e", fontWeight: 700, cursor: "pointer" }}
                      >
                        Pause
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {notice && <p style={{ color: "#525252", fontSize: 14 }}>{notice}</p>}
      </div>
    </div>
  );
}
