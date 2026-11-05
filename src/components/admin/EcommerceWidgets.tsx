"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Create a storefront collection. */
export function CollectionCreateForm() {
  const router = useRouter();
  const [values, setValues] = useState({ name: "", type: "evergreen", framing_copy: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/ecommerce/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Create failed");
      setValues({ name: "", type: "evergreen", framing_copy: "" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      {error && <div className="adm-alert adm-alert-error">{error}</div>}
      <div className="adm-field"><label className="adm-label">Name</label><input className="adm-input" required value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} placeholder="All UnSaid Holidays" data-tip="The collection’s name, exactly as shoppers will see it — like “All UnSaid Holidays”." /></div>
      <div className="adm-field"><label className="adm-label">Type</label>
        <select className="adm-select" value={values.type} onChange={(e) => setValues((v) => ({ ...v, type: e.target.value }))} data-tip="What kind of collection this is: evergreen means always on; seasonal, occasion and relationship collections are for a time or a person; curated means hand-picked.">
          {["evergreen", "seasonal", "occasion", "relationship", "curated"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="adm-field"><label className="adm-label">Framing copy</label><textarea className="adm-textarea" rows={3} value={values.framing_copy} onChange={(e) => setValues((v) => ({ ...v, framing_copy: e.target.value }))} placeholder="The line shoppers read at the top of the collection…" data-tip="A welcome line shoppers read at the top of this collection’s page — a sentence about who it’s for." /></div>
      <button className="adm-btn" type="submit" disabled={busy} data-tip="Create this collection. It starts empty — you add products to it afterwards, from the catalog or the Design Studio.">{busy ? "Creating…" : "Create collection"}</button>
    </form>
  );
}

export function CollectionActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    await fetch("/api/admin/ecommerce/collections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_active: !isActive }),
    }).catch(() => null);
    setBusy(false);
    router.refresh();
  }
  return (
    <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" disabled={busy} onClick={toggle} data-tip={isActive ? "Take this collection off the shop. Shoppers stop seeing it, but nothing is deleted — you can switch it back on any time." : "Put this collection back on the shop, so shoppers can browse and buy from it again."}>
      {isActive ? "Deactivate" : "Activate"}
    </button>
  );
}

/** Publish / unpublish a product via the existing gated product routes. */
export function PublishToggle({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const published = status === "published";
  async function toggle() {
    setBusy(true);
    await fetch(`/api/admin/products/${id}/${published ? "unpublish" : "publish"}`, { method: "POST" }).catch(() => null);
    setBusy(false);
    router.refresh();
  }
  return (
    <button type="button" className={`adm-btn adm-btn-sm ${published ? "adm-btn-ghost" : ""}`} disabled={busy} onClick={toggle} data-tip={published ? "Take this product off sale. It disappears from the shop but stays safely in your list as a draft." : "Put this product on sale in the shop, exactly as it looks now."}>
      {published ? "Unpublish" : "Publish"}
    </button>
  );
}

/** Edit a shipping profile's rates inline. */
export function ShippingProfileEditor({
  id, first, additional, minDays, maxDays, isDefault,
}: {
  id: string; first: number; additional: number; minDays: number | null; maxDays: number | null; isDefault: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState({ first: String(first), additional: String(additional), min: String(minDays ?? ""), max: String(maxDays ?? "") });
  const [busy, setBusy] = useState(false);
  async function save(makeDefault = false) {
    setBusy(true);
    await fetch("/api/admin/ecommerce/shipping", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        first_item_cost: v.first, additional_item_cost: v.additional,
        min_days: v.min, max_days: v.max,
        ...(makeDefault ? { is_default: true } : {}),
      }),
    }).catch(() => null);
    setBusy(false);
    router.refresh();
  }
  const num = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input className="adm-input" style={{ width: 76 }} value={v.first} onChange={num("first")} aria-label="First item cost" data-tip="What shipping costs for the first item in a parcel on this route." />
      <input className="adm-input" style={{ width: 76 }} value={v.additional} onChange={num("additional")} aria-label="Additional item cost" data-tip="What each extra item added to the same parcel costs on top." />
      <input className="adm-input" style={{ width: 56 }} value={v.min} onChange={num("min")} aria-label="Min days" data-tip="The fastest delivery time you promise on this route, in days." />
      <input className="adm-input" style={{ width: 56 }} value={v.max} onChange={num("max")} aria-label="Max days" data-tip="The slowest delivery time you promise on this route, in days." />
      <button type="button" className="adm-btn adm-btn-sm" disabled={busy} onClick={() => save(false)} data-tip="Save these shipping costs and delivery times. Checkout starts quoting them right away.">Save</button>
      {!isDefault && (
        <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" disabled={busy} onClick={() => save(true)} data-tip="Save, and make this the standard rate card — the one checkout uses when no other profile fits the order.">Make default</button>
      )}
    </span>
  );
}

/** Reports Explorer — fetch a daily series from /api/admin/analytics. */
export function ReportExplorer() {
  const [report, setReport] = useState("revenue");
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Array<{ day: string; value: number }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/analytics?report=${report}&days=${days}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Report failed");
      setRows(data.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report failed");
    } finally {
      setBusy(false);
    }
  }
  const max = rows ? Math.max(...rows.map((r) => r.value), 0) : 0;
  const total = rows ? rows.reduce((s, r) => s + r.value, 0) : 0;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <select className="adm-select" style={{ width: 200 }} value={report} onChange={(e) => setReport(e.target.value)} data-tip="Pick what to count, day by day: money in, orders placed, new customers, or new accounts.">
          <option value="revenue">Revenue</option>
          <option value="orders">Orders</option>
          <option value="customers">New customers (CRM)</option>
          <option value="accounts">Accounts created</option>
        </select>
        <select className="adm-select" style={{ width: 130 }} value={days} onChange={(e) => setDays(Number(e.target.value))} data-tip="How many days back the report should reach.">
          {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
        </select>
        <button type="button" className="adm-btn" disabled={busy} onClick={run} data-tip="Work out the numbers from your real records and show the day-by-day table below.">{busy ? "Running…" : "Run report"}</button>
        {rows && (
          <a className="adm-btn adm-btn-ghost" href={`/api/admin/analytics?report=${report}&days=${days}&format=csv`} data-tip="Download this report as a spreadsheet file (CSV) that opens in Excel or Google Sheets.">Export CSV</a>
        )}
      </div>
      {error && <div className="adm-alert adm-alert-error">{error}</div>}
      {rows && (
        <>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
            Total over {days} days: <strong style={{ color: "var(--foreground)" }}>{report === "revenue" ? `$${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : total.toLocaleString()}</strong>
          </p>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Day</th><th style={{ width: "45%" }}>Volume</th><th>{report === "revenue" ? "Revenue" : "Count"}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.day}>
                    <td style={{ whiteSpace: "nowrap" }}>{r.day}</td>
                    <td>
                      <div style={{ height: 10, borderRadius: 5, background: "var(--muted)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: max > 0 ? `${Math.round((r.value / max) * 100)}%` : "0%", background: "var(--primary)" }} />
                      </div>
                    </td>
                    <td>{report === "revenue" ? `$${r.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!rows && !error && <div className="adm-empty">Choose a report and run it — series are computed from live order, customer and account records.</div>}
    </div>
  );
}
