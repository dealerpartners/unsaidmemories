"use client";

// Ad creative designer — INSIDE the Ad Center, not the product studio.
// Journey: pick a finished product → design the ad → build (or pick)
// the campaign → choose the page + the direct cost → publish → the ad
// serves on that shop page and counts. Every step calls the licensee
// API; the product itself is never designed here, only featured.

import { useEffect, useState } from "react";

const LS_KEY = "unsaid_licensee_key";

type Product = {
  id: string;
  name: string;
  brand_name: string | null;
  image_url: string | null;
};
type Campaign = { id: string; name: string; status: string };
type Placement = { id: number; code: string; name: string };
type RateItem = {
  id: number;
  tier_code: string;
  placement_code: string;
  placement_name: string;
  cpm_cents: number;
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d4d4d4",
  borderRadius: 8,
  padding: "8px 12px",
  boxSizing: "border-box",
};

export function DesignerClient() {
  const [key, setKey] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [cta, setCta] = useState("Shop now");
  const [background, setBackground] = useState("#ffffff");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [newCampaign, setNewCampaign] = useState("");
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [placementCode, setPlacementCode] = useState("plp_in_grid");
  const [tierCode, setTierCode] = useState("silver");
  const [rateItems, setRateItems] = useState<RateItem[]>([]);
  const [rateItemId, setRateItemId] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{
    campaign_id: string;
    creative_id: string;
    placement_code: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const k = localStorage.getItem(LS_KEY) ?? "";
    setKey(k);
    if (k) {
      void api("/api/v1/licensee/campaigns", k).then(({ ok, data }) => {
        if (ok) setCampaigns(data.campaigns ?? []);
      });
      void api("/api/v1/licensee/placements", k).then(({ ok, data }) => {
        if (ok) setPlacements(data.placements ?? []);
      });
      void api("/api/v1/licensee/rate-card", k).then(({ ok, data }) => {
        if (ok) setRateItems(data.items ?? []);
      });
    }
  }, []);

  const searchProducts = async () => {
    if (!key) return;
    const { ok, data } = await api(
      `/api/v1/licensee/products?q=${encodeURIComponent(productQuery)}&limit=20`,
      key,
    );
    if (ok) setProducts(data.products ?? []);
  };

  const publish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key) {
      setNotice("Save your API key first (Developer portal, /developers).");
      return;
    }
    setBusy(true);
    setNotice("");
    setResult(null);
    try {
      let cid = campaignId;
      if (!cid) {
        if (!newCampaign.trim()) {
          setNotice("Pick an existing campaign or name a new one.");
          setBusy(false);
          return;
        }
        const now = new Date();
        const ends = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
        const created = await api("/api/v1/licensee/campaigns", key, {
          method: "POST",
          body: JSON.stringify({
            name: newCampaign.trim(),
            tier_code: tierCode,
            placement_code: placementCode,
            rate_card_item_id: rateItemId ? Number(rateItemId) : undefined,
            starts_at: now.toISOString(),
            ends_at: ends.toISOString(),
            daily_budget_cents: 5000,
            lifetime_budget_cents: 100000,
          }),
        });
        if (!created.ok) {
          setNotice(created.data.error ?? "Could not build the campaign.");
          setBusy(false);
          return;
        }
        cid = created.data.id as string;
      }
      const creative = await api("/api/v1/licensee/creatives", key, {
        method: "POST",
        body: JSON.stringify({
          campaign_id: cid,
          headline: headline || product?.name || "A gift worth saying",
          body,
          cta,
          product_id: product?.id ?? undefined,
          background,
          layout: "card",
        }),
      });
      if (!creative.ok) {
        setNotice(creative.data.error ?? "Could not design the creative.");
        setBusy(false);
        return;
      }
      // Publish to the chosen page: the campaign goes active, so the
      // deterministic serve path can pick it up for that placement.
      const published = await api(`/api/v1/licensee/campaigns/${cid}`, key, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
      });
      if (!published.ok) {
        setNotice(
          "Creative saved, but publishing needs a flight window — set starts/ends on the campaign.",
        );
        setBusy(false);
        return;
      }
      const camp = campaigns.find((c) => c.id === cid);
      const placed =
        placements.find((p) => p.id === Number(campaignId))?.code ??
        placementCode;
      setResult({
        campaign_id: cid,
        creative_id: creative.data.id as string,
        placement_code: camp ? placementCode : placed,
      });
      setNotice(
        "Published. The ad now serves on the chosen shop page and every view counts.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!key) {
    return (
      <p style={{ color: "#525252" }}>
        Save your advertiser API key first — get one from the{" "}
        <a href="/developers">Developer portal</a>, then return here.
      </p>
    );
  }

  const visibleRates = rateItems.filter(
    (r) => r.placement_code === placementCode && r.tier_code === tierCode,
  );

  return (
    <form
      onSubmit={publish}
      style={{ display: "grid", gap: 24, maxWidth: 720 }}
    >
      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 12px" }}>
          1. Design a product for the ad
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            placeholder="Search finished products…"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            type="button"
            onClick={() => void searchProducts()}
            style={{ background: "#171717", color: "#fff", borderRadius: 999, padding: "8px 18px", fontWeight: 600, border: 0, cursor: "pointer" }}
          >
            Search
          </button>
        </div>
        {products.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 6 }}>
            {products.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setProduct(p);
                    if (!headline) setHeadline(p.name);
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: product?.id === p.id ? "2px solid #171717" : "1px solid #e5e5e5",
                    background: "#fff",
                    borderRadius: 8,
                    padding: "8px 12px",
                    cursor: "pointer",
                  }}
                >
                  {p.name}
                  {p.brand_name ? ` — ${p.brand_name}` : ""}
                </button>
              </li>
            ))}
          </ul>
        )}
        {product && (
          <p style={{ color: "#525252", fontSize: 14, marginTop: 8 }}>
            Featuring: {product.name} (finished product — design lives in
            the studio, this ad only features it).
          </p>
        )}
      </section>

      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 12px" }}>
          2. Design the ad
        </h2>
        <div style={{ display: "grid", gap: 10 }}>
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Headline" style={inputStyle} required />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body copy" rows={3} style={inputStyle} />
          <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Call to action" style={inputStyle} />
          <label style={{ fontSize: 14, color: "#525252" }}>
            Background{" "}
            <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} style={{ marginLeft: 8 }} />
          </label>
        </div>
        <div
          style={{
            marginTop: 16,
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            background,
            padding: 16,
            display: "flex",
            gap: 16,
            alignItems: "center",
          }}
        >
          {product?.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image_url} alt="" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8 }} />
          )}
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#737373", border: "1px solid #e5e5e5", borderRadius: 999, padding: "2px 8px" }}>Ad</span>
            <div style={{ fontSize: 17, fontWeight: 600, marginTop: 8 }}>{headline || "Your headline"}</div>
            {body && <div style={{ fontSize: 14, color: "#525252", marginTop: 4 }}>{body}</div>}
            <div style={{ display: "inline-block", marginTop: 10, background: "#171717", color: "#fff", borderRadius: 999, padding: "8px 16px", fontSize: 14, fontWeight: 600 }}>{cta || "Shop now"}</div>
          </div>
        </div>
      </section>

      <section style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 12px" }}>
          3. Build the campaign, choose the page and the direct cost
        </h2>
        <div style={{ display: "grid", gap: 10 }}>
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} style={inputStyle}>
            <option value="">— or build a new campaign below —</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
            ))}
          </select>
          {!campaignId && (
            <>
              <input value={newCampaign} onChange={(e) => setNewCampaign(e.target.value)} placeholder="New campaign name" style={inputStyle} />
              <label style={{ fontSize: 14, color: "#525252" }}>
                Page (placement){" "}
                <select value={placementCode} onChange={(e) => setPlacementCode(e.target.value)} style={{ ...inputStyle, marginTop: 4 }}>
                  {placements.map((p) => (
                    <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 14, color: "#525252" }}>
                Tier{" "}
                <select value={tierCode} onChange={(e) => setTierCode(e.target.value)} style={{ ...inputStyle, marginTop: 4 }}>
                  <option value="platinum">Platinum (first fill)</option>
                  <option value="gold">Gold</option>
                  <option value="silver">Silver</option>
                </select>
              </label>
              <label style={{ fontSize: 14, color: "#525252" }}>
                Direct cost (rate card){" "}
                <select value={rateItemId} onChange={(e) => setRateItemId(e.target.value)} style={{ ...inputStyle, marginTop: 4 }}>
                  <option value="">— pick a rate —</option>
                  {visibleRates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.placement_name} · {r.tier_code} · {r.cpm_cents}¢ CPM
                    </option>
                  ))}
                </select>
              </label>
              <p style={{ color: "#737373", fontSize: 13, margin: 0 }}>
                No auction: the cost you pick is snapshotted onto the
                campaign. Publishing activates a 30-day flight starting
                now, with a $50/day and $1,000 lifetime budget.
              </p>
            </>
          )}
        </div>
      </section>

      <button
        type="submit"
        disabled={busy}
        style={{ background: "#171717", color: "#fff", borderRadius: 999, padding: "12px 24px", fontWeight: 700, fontSize: 16, border: 0, cursor: "pointer" }}
      >
        {busy ? "Publishing…" : "Publish ad to the chosen page"}
      </button>
      {notice && <p style={{ color: "#525252" }}>{notice}</p>}
      {result && (
        <div style={{ border: "1px solid #bbf7d0", background: "#f0fdf4", borderRadius: 12, padding: 16, fontSize: 14 }}>
          <div>Campaign: {result.campaign_id}</div>
          <div>Creative: {result.creative_id}</div>
          <div>Placement: {result.placement_code}</div>
          <div style={{ marginTop: 8 }}>
            Verify it serves:{" "}
            <a href={`/api/v1/licensee/serve?placement=${result.placement_code}`}>
              /api/v1/licensee/serve?placement={result.placement_code}
            </a>
          </div>
        </div>
      )}
    </form>
  );
}
