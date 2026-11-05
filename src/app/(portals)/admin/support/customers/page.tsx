import type { Metadata } from "next";
import { db, T, loadTickets } from "../data";
import { SupportSearch, CreateModalButton, type ModalField } from "../SupportControls";

const CUSTOMER_FIELDS: ModalField[] = [
  { name: "first_name", label: "First name", placeholder: "Customer's first name", required: true },
  { name: "last_name", label: "Last name", placeholder: "Customer's last name" },
  { name: "email", label: "Email", placeholder: "name@company.com", required: true },
  { name: "phone", label: "Phone", placeholder: "Phone number" },
  { name: "company_name", label: "Company", placeholder: "Company or organization" },
  // crm_customers requires these four with NO database defaults (a bare
  // create 502s without them — proven against production 2026-11-01).
  // Selects pre-fill their first option, matching the CRM's own form
  // defaults: individual / new_customer / healthy / US.
  { name: "customer_type", label: "Customer type", type: "select", options: ["individual", "business", "breeder", "rescue", "referral_partner", "staff", "other"] },
  { name: "lifecycle_stage", label: "Lifecycle stage", type: "select", options: ["new_customer", "new_lead", "active", "vip", "returning", "lapsed", "at_risk", "lost"] },
  { name: "lifecycle_status", label: "Health", type: "select", options: ["healthy", "at_risk", "inactive"] },
  { name: "country", label: "Country", type: "select", options: ["US", "CA", "MX", "GB", "IE", "AU", "NZ"] },
];
import "../support.css";

export const metadata: Metadata = { title: "Support Desk — Customers" };
export const dynamic = "force-dynamic";

// Customers (owner's v2 comp) — the support view over the ONE customer
// home (crm_customers): directory + each customer's ticket footprint.
export default async function SupportCustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const sb = db();
  let q = sb.from("crm_customers")
    .select("id, first_name, last_name, company_name, email, phone, lifecycle_stage, customer_since, last_activity_at, lifetime_value")
    .eq("tenant_id", T()).eq("is_active", true).order("last_activity_at", { ascending: false }).limit(200);
  const { data: customers } = await q;
  const tickets = await loadTickets(500);

  const byCustomer = new Map<string, { open: number; total: number; csat: number[]; last: string | null }>();
  for (const t of tickets) {
    const key = t.requester_customer_id ?? (t.requester_email ? `email:${t.requester_email}` : null);
    if (!key) continue;
    const e = byCustomer.get(key) ?? { open: 0, total: 0, csat: [], last: null };
    e.total++;
    if (!["resolved", "closed"].includes(t.status)) e.open++;
    if (t.csat_score !== null) e.csat.push(t.csat_score);
    if (!e.last || t.created_at > e.last) e.last = t.created_at;
    byCustomer.set(key, e);
  }

  let rows = (customers ?? []).map((c: any) => {
    const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.company_name || c.email || "Customer";
    const stats = byCustomer.get(c.id) ?? byCustomer.get(`email:${c.email}`) ?? { open: 0, total: 0, csat: [], last: null };
    const csatAvg = stats.csat.length ? stats.csat.reduce((a, b) => a + b, 0) / stats.csat.length : null;
    const health = stats.open >= 3 || (csatAvg !== null && csatAvg <= 2.5) ? { label: "At risk", cls: "amber" } : { label: "Healthy", cls: "green" };
    return { c, name, stats, csatAvg, health };
  });
  if (sp.q) { const needle = sp.q.toLowerCase(); rows = rows.filter((r) => `${r.name} ${r.c.email ?? ""} ${r.c.company_name ?? ""}`.toLowerCase().includes(needle)); }
  if (sp.segment) rows = rows.filter((r) => (r.c.lifecycle_stage ?? "") === sp.segment);
  const segments = [...new Set((customers ?? []).map((c: any) => c.lifecycle_stage).filter(Boolean))];

  return (
    <div className="sup"><div className="content">
      <div className="pagehead"><div><h1>Customers</h1></div>
        <div className="actions"><CreateModalButton label="＋ Create customer" title="Create customer" fields={CUSTOMER_FIELDS} endpoint="/api/admin/crm/customers" /></div>
      </div>
      <form className="toolbar" method="get">
        <SupportSearch placeholder="Search customers, email, company…" defaultValue={sp.q} />
        <select className="select" name="segment" defaultValue={sp.segment ?? ""}>
          <option value="">All lifecycle stages</option>
          {segments.map((s: any) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn" type="submit">Apply</button>
      </form>
      <div className="card">
        <div className="cardhead"><strong>Customer directory</strong><span className="muted tiny" style={{ marginLeft: "auto" }}>{rows.length} records</span></div>
        <div className="tablewrap"><table className="table">
          <thead><tr><th>Customer</th><th>Company</th><th>Stage</th><th>Open tickets</th><th>Last contact</th><th>CSAT</th><th>Health</th></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7}><div className="empty">No customers match. Customers appear here as they buy or write in.</div></td></tr>
            ) : rows.map(({ c, name, stats, csatAvg, health }) => (
              <tr key={c.id}>
                <td><b>{name}</b><div className="tiny muted">{c.email ?? ""}</div></td>
                <td>{c.company_name ?? "—"}</td>
                <td style={{ textTransform: "capitalize" }}>{c.lifecycle_stage ?? "—"}</td>
                <td>{stats.open}</td>
                <td>{stats.last ? new Date(stats.last).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : c.last_activity_at ? new Date(c.last_activity_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</td>
                <td>{csatAvg !== null ? `${csatAvg.toFixed(1)} / 5` : "—"}</td>
                <td><span className={`pill ${health.cls}`}>{health.label}</span></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div></div>
  );
}
