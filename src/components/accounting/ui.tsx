import Link from "next/link";
import { money, fmtDate } from "@/lib/accounting";

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="fabric-page-head acct-head">
      <div>
        <h1>{title}</h1>
        {sub ? <p>{sub}</p> : null}
      </div>
      {children ? <div className="fabric-actions">{children}</div> : null}
    </div>
  );
}

export function Kpis({ items }: { items: { label: string; value: string; foot?: string }[] }) {
  return (
    <div className="fabric-kpi-grid">
      {items.map((k) => (
        <div className="fabric-kpi" key={k.label}>
          <div className="fabric-kpi-label">{k.label}</div>
          <div className="fabric-kpi-value">{k.value}</div>
          {k.foot ? <div className="fabric-kpi-foot">{k.foot}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function Pill({ tone, children }: { tone?: "green" | "red" | "amber" | "gray" | "purple"; children: React.ReactNode }) {
  return <span className={`fabric-pill acct-pill-${tone || "gray"}`}>{children}</span>;
}

export function statusTone(status: string): "green" | "red" | "amber" | "gray" | "purple" {
  const s = String(status || "").toLowerCase();
  if (["paid", "posted", "active", "filed", "issued", "won", "converted", "accepted", "matched", "reconciled"].includes(s)) return "green";
  if (["overdue", "voided", "lost", "rejected", "expired", "declined"].includes(s)) return "red";
  if (["sent", "partial", "partially_paid", "open", "requested", "evidence_submitted", "unmatched"].includes(s)) return "amber";
  if (["draft", "paused"].includes(s)) return "gray";
  return "purple";
}

export interface Col { key: string; label: string; align?: "right" | "left"; render?: (row: any) => React.ReactNode }

export function DataTable({ cols, rows, empty }: { cols: Col[]; rows: any[]; empty: string }) {
  if (!rows.length) return <div className="fabric-empty">{empty}</div>;
  return (
    <div className="acct-tablewrap">
      <table className="fabric-table acct-table">
        <thead>
          <tr>{cols.map((c) => <th key={c.key} style={{ textAlign: c.align || "left" }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i}>
              {cols.map((c) => (
                <td key={c.key} style={{ textAlign: c.align || "left" }}>
                  {c.render ? c.render(r) : c.key === "__money" ? money(r.amount) : c.key.endsWith("_date") || c.key === "date" ? fmtDate(r[c.key]) : String(r[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Card({ title, children, href }: { title: string; children: React.ReactNode; href?: string }) {
  return (
    <section className="fabric-card acct-card">
      <div className="acct-card-head">
        <h3>{title}</h3>
        {href ? <Link href={href} className="acct-link" data-tip="Open the full list on its own page.">View all →</Link> : null}
      </div>
      {children}
    </section>
  );
}

export { money, fmtDate };
