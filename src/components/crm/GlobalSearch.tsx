"use client";

import { useState } from "react";
import Link from "next/link";

type Results = {
  customers: { id: string; first_name: string | null; last_name: string | null; company_name: string | null; email: string | null; phone: string | null; lifecycle_stage: string | null }[];
  orders: { id: string; order_number: string; crm_customer_id: string | null; customer_email: string | null; total: number; status: string }[];
  payments: { id: string; receipt_number: string; customer_id: string | null; amount: number; status: string }[];
  invoices: { id: string; invoice_number: string; source_customer_id: string | null; total: number; status: string }[];
  documents: { id: string; name: string; customer_id: string; status: string }[];
  messages: { id: string; customer_id: string; channel: string; direction: string; subject: string | null; body: string | null; created_at: string }[];
};

const name = (c: Results["customers"][number]) =>
  [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company_name || c.email || "Unnamed";

export default function GlobalSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (q.trim().length < 2) { setError("Type at least 2 characters."); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/admin/crm/search?q=${encodeURIComponent(q.trim())}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || "Search failed");
      setResults(json as Results);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const empty = results && !results.customers.length && !results.orders.length && !results.payments.length && !results.invoices.length && !results.documents.length && !results.messages.length;

  return (
    <div>
      <div className="crm-toolbar">
        <input
          className="crm-input"
          style={{ flex: "1 1 320px" }}
          placeholder="Search customers, orders, payments, invoices, documents, messages…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") run(); }}
        />
        <button className="crm-btn" type="button" disabled={busy} onClick={run}>{busy ? "Searching…" : "Search"}</button>
      </div>
      {error && <div className="crm-error">{error}</div>}
      {empty && <div className="crm-card crm-empty">No matches for “{q}” anywhere in the CRM.</div>}
      {results && results.customers.length > 0 && (
        <div className="crm-card">
          <h3>Customers</h3>
          <div className="crm-tablewrap"><table className="crm-table"><tbody>
            {results.customers.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/admin/crm/customers/${c.id}`}>{name(c)}</Link></td>
                <td>{c.email || "—"}</td>
                <td>{c.phone || "—"}</td>
                <td><span className="crm-pill">{(c.lifecycle_stage || "—").replace(/_/g, " ")}</span></td>
              </tr>
            ))}
          </tbody></table></div>
        </div>
      )}
      {results && results.orders.length > 0 && (
        <div className="crm-card">
          <h3>Orders</h3>
          <div className="crm-tablewrap"><table className="crm-table"><tbody>
            {results.orders.map((o) => (
              <tr key={o.id}>
                <td>{o.crm_customer_id ? <Link href={`/admin/crm/customers/${o.crm_customer_id}`}>{o.order_number}</Link> : o.order_number}</td>
                <td>{o.customer_email || "—"}</td>
                <td>${Number(o.total).toFixed(2)}</td>
                <td><span className="crm-pill">{o.status}</span></td>
              </tr>
            ))}
          </tbody></table></div>
        </div>
      )}
      {results && results.payments.length > 0 && (
        <div className="crm-card">
          <h3>Payments</h3>
          <div className="crm-tablewrap"><table className="crm-table"><tbody>
            {results.payments.map((p) => (
              <tr key={p.id}>
                <td>{p.customer_id ? <Link href={`/admin/crm/customers/${p.customer_id}`}>{p.receipt_number}</Link> : p.receipt_number}</td>
                <td>${Number(p.amount).toFixed(2)}</td>
                <td><span className="crm-pill">{p.status}</span></td>
              </tr>
            ))}
          </tbody></table></div>
        </div>
      )}
      {results && results.invoices.length > 0 && (
        <div className="crm-card">
          <h3>Invoices</h3>
          <div className="crm-tablewrap"><table className="crm-table"><tbody>
            {results.invoices.map((i) => (
              <tr key={i.id}>
                <td>{i.source_customer_id ? <Link href={`/admin/crm/customers/${i.source_customer_id}`}>{i.invoice_number}</Link> : i.invoice_number}</td>
                <td>${Number(i.total).toFixed(2)}</td>
                <td><span className="crm-pill">{i.status}</span></td>
              </tr>
            ))}
          </tbody></table></div>
        </div>
      )}
      {results && results.documents.length > 0 && (
        <div className="crm-card">
          <h3>Documents</h3>
          <div className="crm-tablewrap"><table className="crm-table"><tbody>
            {results.documents.map((d) => (
              <tr key={d.id}>
                <td><Link href={`/admin/crm/customers/${d.customer_id}?tab=documents`}>{d.name}</Link></td>
                <td><span className="crm-pill">{d.status.replace(/_/g, " ")}</span></td>
              </tr>
            ))}
          </tbody></table></div>
        </div>
      )}
      {results && results.messages.length > 0 && (
        <div className="crm-card">
          <h3>Messages</h3>
          <div className="crm-tablewrap"><table className="crm-table"><tbody>
            {results.messages.map((m) => (
              <tr key={m.id}>
                <td><Link href={`/admin/crm/customers/${m.customer_id}?tab=communication`}>{m.subject || (m.body || "").slice(0, 60) || "(no subject)"}</Link></td>
                <td>{m.channel}</td>
                <td>{m.direction}</td>
                <td>{new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
              </tr>
            ))}
          </tbody></table></div>
        </div>
      )}
    </div>
  );
}
