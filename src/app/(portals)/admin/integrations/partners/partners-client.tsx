"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Portal { id: string; name: string; kind: string; ingest_url: string | null; site_url: string | null; status: string }

export default function PartnersClient({
  portals,
  products,
}: {
  portals: Portal[];
  products: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("storefront");
  const [ingestUrl, setIngestUrl] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [portalId, setPortalId] = useState("");
  const [productId, setProductId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function createPortal() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/integrations/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind, ingestUrl: ingestUrl || undefined, siteUrl: siteUrl || undefined }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage({ kind: "err", text: json.error ?? "Could not create the portal." });
    setName(""); setIngestUrl(""); setSiteUrl("");
    setMessage({ kind: "ok", text: "Portal registered." });
    router.refresh();
  }

  async function push() {
    if (!portalId || !productId) {
      setMessage({ kind: "err", text: "Choose a portal and a product." });
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/integrations/partners/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portalId, productId }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage({ kind: "err", text: json.error ?? "Push failed." });
    setMessage({
      kind: json.status === "failed" ? "err" : "ok",
      text:
        json.status === "pushed"
          ? "Product pushed to the portal."
          : json.status === "recorded"
            ? "Recorded. This portal has no ingest endpoint yet, so nothing was sent — set an ingest URL to deliver pushes."
            : `Push failed: ${json.error ?? "unknown error"}`,
    });
    router.refresh();
  }

  return (
    <div className="int-split">
      <div className="int-card">
        <h3 style={{ marginTop: 0 }}>Push a product</h3>
        <label className="int-label">Partner portal</label>
        <select className="int-select" value={portalId} onChange={(e) => setPortalId(e.target.value)}>
          <option value="">Choose a portal…</option>
          {portals.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.status})</option>
          ))}
        </select>
        <label className="int-label">Published product</label>
        <select className="int-select" value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Choose a product…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {products.length === 0 && (
          <p className="int-muted">No published products yet — publish one from the studio first.</p>
        )}
        {message && (
          <div className={`int-banner ${message.kind === "ok" ? "ok" : "err"}`} style={{ marginTop: 14 }}>
            {message.text}
          </div>
        )}
        <div className="int-actions">
          <button className="adm-btn" disabled={busy} onClick={push}>
            {busy ? "Working…" : "Push product"}
          </button>
        </div>
        <div style={{ marginTop: 18 }}>
          {portals.map((p) => (
            <div className="int-row" key={p.id} style={{ marginBottom: 8 }}>
              <div className="int-grow">
                <b>{p.name}</b>
                <div className="int-muted">
                  {p.kind} · {p.ingest_url ?? "no ingest endpoint"} {p.site_url ? `· ${p.site_url}` : ""}
                </div>
              </div>
              <span className="fabric-pill gray">{p.status}</span>
            </div>
          ))}
          {portals.length === 0 && <p className="int-muted">No portals yet — register the first one.</p>}
        </div>
      </div>

      <div className="int-card">
        <h3 style={{ marginTop: 0 }}>Register a partner portal</h3>
        <label className="int-label">Name</label>
        <input className="int-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Partner storefront name" />
        <label className="int-label">Kind</label>
        <select className="int-select" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="storefront">Storefront</option>
          <option value="showcase">Showcase</option>
          <option value="marketplace">Marketplace</option>
          <option value="affiliate">Affiliate</option>
        </select>
        <label className="int-label">Ingest endpoint URL (receives product pushes)</label>
        <input className="int-input" value={ingestUrl} onChange={(e) => setIngestUrl(e.target.value)} placeholder="https://partner.example/api/products" />
        <label className="int-label">Site URL</label>
        <input className="int-input" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://partner.example" />
        <div className="int-actions">
          <button className="adm-btn" disabled={busy || !name.trim()} onClick={createPortal}>
            Register portal
          </button>
        </div>
      </div>
    </div>
  );
}
