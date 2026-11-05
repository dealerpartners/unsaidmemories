import type { Metadata } from "next";
import Link from "next/link";
import { tsOverview, listViolations, listInvestigations } from "@/lib/trust/trust";
import { fmtDateTime } from "@/lib/trust/constants";

export const metadata: Metadata = { title: "Trust & Safety — UnSaid Admin" };
export const dynamic = "force-dynamic";

export default async function TrustOverviewPage() {
  const [o, violations, investigations] = await Promise.all([tsOverview(), listViolations(), listInvestigations()]);
  const cards = [
    { label: "Identity & business verification", value: o.pendingVerification, href: "/admin/trust/verification", foot: "tasks waiting for review" },
    { label: "Open violations", value: o.openViolations, href: "/admin/trust/risk", foot: "customer & listing risk" },
    { label: "Disputes & chargebacks", value: o.openChargebacks, href: "/admin/trust/disputes", foot: "open chargeback tickets" },
    { label: "Fraud review", value: o.openInvestigations, href: "/admin/trust/fraud", foot: "open investigations" },
    { label: "Moderation queue", value: o.quarantineOpen, href: "/admin/trust/moderation", foot: "supplier products quarantined" },
    { label: "Pending appeals", value: o.pendingAppeals, href: "/admin/trust/appeals", foot: "waiting on a decision" },
    { label: "DMCA / compliance", value: o.dmcaOpen, href: "/admin/trust/compliance", foot: `notices in flight · ${o.activeStrikes} active strikes` },
    { label: "Audit log", value: "§", href: "/admin/trust/audit", foot: "every decision, on the record" },
  ];
  return (
    <div>
      <div className="fabric-page-head">
        <h1>Trust &amp; Safety</h1>
      </div>
      <div className="ts-kpis">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} style={{ textDecoration: "none", color: "inherit" }} data-tip={`Open ${c.label} — ${c.foot}.`}>
            <div className="ts-kpi"><div className="l">{c.label}</div><div className="v">{c.value}</div><div className="f">{c.foot}</div></div>
          </Link>
        ))}
      </div>
      <div className="ts-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="ts-card">
          <h3>Latest violations</h3>
          {violations.slice(0, 6).map((v: any) => (
            <div key={v.id} style={{ fontSize: 13.5, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <span className={`ts-pill ${v.severity === "critical" || v.severity === "high" ? "red" : "amber"}`}>{v.severity || "medium"}</span>{" "}
              <b>{v.violation_type}</b> — {v.description?.slice(0, 80) || "—"} <span style={{ color: "var(--muted)" }}>({v.status}, {fmtDateTime(v.created_at)})</span>
            </div>
          ))}
          {violations.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>No violations recorded.</p>}
        </div>
        <div className="ts-card">
          <h3>Latest investigations</h3>
          {investigations.slice(0, 6).map((v: any) => (
            <div key={v.id} style={{ fontSize: 13.5, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <span className="ts-pill">{v.investigation_type || "fraud"}</span>{" "}
              {v.notes?.slice(0, 80) || "Investigation"} <span style={{ color: "var(--muted)" }}>({v.status} · {v.priority}, {fmtDateTime(v.created_at)})</span>
            </div>
          ))}
          {investigations.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>No investigations open.</p>}
        </div>
      </div>
    </div>
  );
}
