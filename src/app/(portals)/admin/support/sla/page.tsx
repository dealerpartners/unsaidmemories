import type { Metadata } from "next";
import { db, T } from "../data";
import { CreateModalButton } from "../SupportControls";
import "../support.css";

export const metadata: Metadata = { title: "Support Desk — SLA policies" };
export const dynamic = "force-dynamic";

// SLA policies (owner's v2 comp) — the real policy matrix from
// support_sla_policies.
export default async function SupportSlaPage() {
  const { data } = await db().from("support_sla_policies").select("*").eq("tenant_id", T()).order("created_at");
  const rows = data ?? [];
  const fmt = (mins: number | null) => mins === null || mins === undefined ? "—" : mins < 60 ? `${mins} min` : mins % 60 === 0 ? `${mins / 60} hours` : `${Math.floor(mins / 60)}h ${mins % 60}m`;

  return (
    <div className="sup"><div className="content">
      <div className="pagehead">
        <div><h1>SLA policies</h1></div>
        <div className="actions">
          <CreateModalButton label="＋ New policy" title="Create SLA policy" endpoint="/api/admin/support/sla-policies" fields={[
            { name: "name", label: "Policy name", placeholder: "Policy name", required: true },
            { name: "scope", label: "Applies to", type: "select", options: ["all", "enterprise", "urgent", "chat"] },
            { name: "first_response_minutes", label: "First response target (minutes)", type: "number", placeholder: "15" },
            { name: "next_reply_minutes", label: "Next response target (minutes)", type: "number", placeholder: "30" },
            { name: "resolution_minutes", label: "Resolution target (minutes)", type: "number", placeholder: "240" },
          ]} />
        </div>
      </div>
      <div className="card">
        <div className="cardhead"><strong>Policy matrix</strong></div>
        <div className="tablewrap"><table className="table">
          <thead><tr><th>Policy</th><th>Applies to</th><th>First response</th><th>Next response</th><th>Resolution</th><th>Business hours</th><th>Status</th></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7}><div className="empty">No SLA policies yet — tickets carry no response targets until the first policy exists.</div></td></tr>
            ) : rows.map((p: any) => (
              <tr key={p.id}>
                <td><b>{p.name}</b>{p.is_default && <span className="pill teal" style={{ marginLeft: 8 }}>Default</span>}</td>
                <td style={{ textTransform: "capitalize" }}>{p.scope ?? "All customers"}</td>
                <td>{fmt(p.first_response_minutes)}</td>
                <td>{fmt(p.next_reply_minutes)}</td>
                <td>{fmt(p.resolution_minutes)}</td>
                <td>{p.uses_business_hours ? "Business hours" : "24 × 7"}</td>
                <td><span className={`pill ${p.is_active ? "green" : ""}`}>{p.is_active ? "Active" : "Inactive"}</span></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div></div>
  );
}
