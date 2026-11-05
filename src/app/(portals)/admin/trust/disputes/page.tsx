import type { Metadata } from "next";
import Link from "next/link";
import { db, T } from "@/lib/trust/support";
import { fmtDateTime, fmtMoney } from "@/lib/trust/constants";

export const metadata: Metadata = { title: "Disputes & Chargebacks — Trust & Safety" };
export const dynamic = "force-dynamic";

export default async function DisputesPage() {
  const sb = db();
  const { data: tickets } = await sb.from("support_tickets")
    .select("id, ticket_ref, subject, status, priority, requester_name, requester_email, created_at, category")
    .eq("tenant_id", T()).is("deleted_at", null).in("category", ["chargeback", "payments"])
    .order("created_at", { ascending: false }).limit(100);
  const ids = (tickets ?? []).map((t: any) => t.id);
  const { data: actions } = ids.length
    ? await sb.from("support_actions").select("*").in("ticket_id", ids).order("created_at", { ascending: false })
    : { data: [] as any[] };
  const exposure = (actions ?? []).filter((a: any) => a.action_type === "refund" && a.status !== "rejected").reduce((s: number, a: any) => s + Number(a.amount ?? 0), 0);
  return (
    <div>
      <div className="fabric-page-head">
        <h1>Disputes &amp; chargebacks</h1>
      </div>
      <div className="ts-card" style={{ padding: 0, overflow: "hidden" }}>
        {(tickets ?? []).length === 0 ? <div className="ts-empty">No open dispute cases.</div> : (
          <table className="ts-table">
            <thead><tr><th>Case</th><th>Kind</th><th>Customer</th><th>Status</th><th>Priority</th><th>Opened</th><th>Actions on case</th></tr></thead>
            <tbody>
              {(tickets ?? []).map((t: any) => {
                const mine = (actions ?? []).filter((a: any) => a.ticket_id === t.id);
                return (
                  <tr key={t.id}>
                    <td><Link href={`/admin/support/${t.id}`}><b>{t.ticket_ref}</b></Link><br /><span style={{ color: "var(--muted)" }}>{t.subject}</span></td>
                    <td><span className={`ts-pill ${t.category === "chargeback" ? "red" : "amber"}`}>{t.category}</span></td>
                    <td>{t.requester_name || t.requester_email || "—"}</td>
                    <td>{t.status}</td>
                    <td>{t.priority}</td>
                    <td>{fmtDateTime(t.created_at)}</td>
                    <td>{mine.length === 0 ? "—" : mine.map((a: any) => <div key={a.id} style={{ fontSize: 12.5 }}>{a.action_type} {fmtMoney(a.amount)} · {a.status}</div>)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ fontSize: 13, color: "var(--muted)" }}>Open a case to work it: replies, evidence attachments, side conversations, and refund actions (≥ $100 needs an approver) all live on the ticket.</p>
    </div>
  );
}
