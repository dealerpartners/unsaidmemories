"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Content forms (client): the writes on Website → Content that this
 * repo owns — add a redirect, add a header/footer nav item. Each
 * button calls its real endpoint; failures print the endpoint's own
 * message. Page and form editing stays in the Payload admin (it owns
 * their block/version tables). There are no delete buttons here, by
 * the owner's no-delete rule.
 */
export function ContentAddForms() {
  const router = useRouter();
  const [from, setFrom] = useState("");
  const [toUrl, setToUrl] = useState("");
  const [navSection, setNavSection] = useState("header");
  const [navLabel, setNavLabel] = useState("");
  const [navUrl, setNavUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function addRedirect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/website/redirects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to_url: toUrl }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setMsg(d.error ?? "Could not add redirect.");
    else {
      setMsg(`Redirect added: ${from} → ${toUrl}`);
      setFrom("");
      setToUrl("");
      router.refresh();
    }
  }

  async function addNav(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/website/nav", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: navSection, label: navLabel, url: navUrl }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setMsg(d.error ?? "Could not add nav item.");
    else {
      setMsg(`Nav item added to the ${navSection}.`);
      setNavLabel("");
      setNavUrl("");
      router.refresh();
    }
  }

  return (
    <div className="adm-grid adm-grid-2" style={{ alignItems: "start" }}>
      <div className="adm-card">
        <h2>Add a redirect</h2>
        <form onSubmit={addRedirect}>
          <div className="adm-field">
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Old address</label>
            <input className="adm-input" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="/old-page" required style={{ width: "100%" }} />
          </div>
          <div className="adm-field">
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Send visitors to</label>
            <input className="adm-input" value={toUrl} onChange={(e) => setToUrl(e.target.value)} placeholder="/new-page" required style={{ width: "100%" }} />
          </div>
          <button className="adm-btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Add redirect"}</button>
        </form>
      </div>
      <div className="adm-card">
        <h2>Add a nav item</h2>
        <form onSubmit={addNav}>
          <div className="adm-field">
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Menu</label>
            <select className="adm-select" value={navSection} onChange={(e) => setNavSection(e.target.value)} style={{ width: "100%" }}>
              <option value="header">Header</option>
              <option value="footer">Footer</option>
            </select>
          </div>
          <div className="adm-field">
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Words</label>
            <input className="adm-input" value={navLabel} onChange={(e) => setNavLabel(e.target.value)} required style={{ width: "100%" }} />
          </div>
          <div className="adm-field">
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Goes to</label>
            <input className="adm-input" value={navUrl} onChange={(e) => setNavUrl(e.target.value)} placeholder="/shop" required style={{ width: "100%" }} />
          </div>
          <button className="adm-btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Add nav item"}</button>
        </form>
      </div>
      {msg && <p className="adm-help">{msg}</p>}
    </div>
  );
}
