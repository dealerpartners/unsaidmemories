"use client";

import { useCallback, useEffect, useState } from "react";

// The customer's address book — a first-class place in the portal
// (owner order, 2026-11-04: the record holds the customer's basics;
// an address is never re-asked once it is on the record). Backed by
// /api/customers/me/addresses, the same rows checkout saves and
// pre-fills from.

async function jfetch(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const emptyAddress = {
  first_name: "",
  last_name: "",
  company: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postal_code: "",
  country_code: "US",
  phone: "",
  is_default: false,
};

export function AddressesSection() {
  const [toast, setToast] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState(emptyAddress);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const showToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await jfetch("/api/customers/me/addresses");
      setAddresses(data.addresses ?? []);
    } catch {
      // An empty book renders the same as a failed load here — the
      // add form is the recovery path either way.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addAddress() {
    setBusy(true);
    try {
      await jfetch("/api/customers/me/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      setDraft(emptyAddress);
      setShowForm(false);
      showToast("Address saved");
      await load();
    } catch (e: any) {
      showToast(e.message || "Could not save that address.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAddress(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/customers/me/addresses/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const set = (k: string) => (e: any) =>
    setDraft((a) => ({ ...a, [k]: e.target.value }));

  return (
    <>
      <section className="ua-blk">
        <h2 className="ua-h2">Addresses</h2>
        <p className="ua-sub">
          The addresses on your record. Checkout fills from here — you
          should never have to type one twice.
        </p>
        {loaded && addresses.length ? (
          <div style={{ marginBottom: 14 }}>
            {addresses.map((a) => (
              <div className="ua-item" key={a.id}>
                <div className="nm">
                  <div>
                    {[a.first_name, a.last_name].filter(Boolean).join(" ") ||
                      a.label ||
                      "Address"}
                    {a.is_default ? " · Default" : ""}
                  </div>
                  <div className="ua-mut">
                    {a.company ? `${a.company} · ` : ""}
                    {a.line1}
                    {a.line2 ? `, ${a.line2}` : ""} · {a.city}, {a.state}{" "}
                    {a.postal_code} · {a.country_code}
                    {a.phone ? ` · ${a.phone}` : ""}
                  </div>
                </div>
                <button
                  className="ua-btn ghost sm"
                  onClick={() => deleteAddress(a.id)}
                  disabled={busy}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : loaded ? (
          <p className="ua-sub">No saved addresses yet.</p>
        ) : null}
        {showForm ? (
          <div>
            <div className="ua-cols" style={{ gap: 14 }}>
              <div className="ua-f">
                <label>First name</label>
                <input className="ua-input" value={draft.first_name} onChange={set("first_name")} />
              </div>
              <div className="ua-f">
                <label>Last name</label>
                <input className="ua-input" value={draft.last_name} onChange={set("last_name")} />
              </div>
            </div>
            <div className="ua-f">
              <label>Company (optional)</label>
              <input className="ua-input" value={draft.company} onChange={set("company")} />
            </div>
            <div className="ua-f">
              <label>Street address</label>
              <input className="ua-input" value={draft.line1} onChange={set("line1")} />
            </div>
            <div className="ua-f">
              <label>Apartment, suite (optional)</label>
              <input className="ua-input" value={draft.line2} onChange={set("line2")} />
            </div>
            <div className="ua-cols" style={{ gap: 14 }}>
              <div className="ua-f">
                <label>City</label>
                <input className="ua-input" value={draft.city} onChange={set("city")} />
              </div>
              <div className="ua-f">
                <label>State</label>
                <input className="ua-input" value={draft.state} onChange={set("state")} />
              </div>
            </div>
            <div className="ua-cols" style={{ gap: 14 }}>
              <div className="ua-f">
                <label>Postal code</label>
                <input className="ua-input" value={draft.postal_code} onChange={set("postal_code")} />
              </div>
              <div className="ua-f">
                <label>Country</label>
                <input
                  className="ua-input"
                  value={draft.country_code}
                  onChange={(e) =>
                    setDraft((a) => ({ ...a, country_code: e.target.value.toUpperCase() }))
                  }
                  maxLength={2}
                />
              </div>
            </div>
            <div className="ua-f">
              <label>Phone (optional)</label>
              <input className="ua-input" value={draft.phone} onChange={set("phone")} />
            </div>
            <div className="ua-f">
              <label>
                <input
                  type="checkbox"
                  checked={draft.is_default}
                  onChange={(e) => setDraft((a) => ({ ...a, is_default: e.target.checked }))}
                />{" "}
                Make this my default address
              </label>
            </div>
            <div className="ua-row">
              <button className="ua-btn" onClick={addAddress} disabled={busy}>
                Save address
              </button>
              <button className="ua-btn ghost" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="ua-btn ghost" onClick={() => setShowForm(true)}>
            Add an address
          </button>
        )}
      </section>
      {toast ? (
        <div className="ua-toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}
