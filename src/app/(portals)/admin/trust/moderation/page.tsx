import type { Metadata } from "next";
import { listQuarantine } from "@/lib/trust/trust";
import { fmtDateTime } from "@/lib/trust/constants";
import { DecideButtons } from "@/components/trust/admin-widgets";

export const metadata: Metadata = { title: "Moderation — Trust & Safety" };
export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  const [open, resolved] = await Promise.all([listQuarantine(false), listQuarantine(true)]);
  const render = (rows: any[], withActions: boolean) => rows.length === 0 ? <div className="ts-empty">Nothing here.</div> : (
    <table className="ts-table">
      <thead><tr><th>Product</th><th>Supplier</th><th>Reason quarantined</th><th>Flagged</th>{withActions && <th>Resolution</th>}{withActions && <th>Decide</th>}</tr></thead>
      <tbody>
        {rows.map((r: any) => (
          <tr key={r.id}>
            <td><b>{r.title || r.source_product_id}</b><br /><span style={{ color: "var(--muted)" }}>{r.brand || ""} · {r.source_product_id}</span></td>
            <td>{r.supplier || "—"}<br /><span style={{ color: "var(--muted)" }}>{r.supplier_product_type || ""}</span></td>
            <td>{r.reason || "—"}</td>
            <td>{fmtDateTime(r.created_at)}</td>
            {withActions && <td>{r.resolved ? `${r.resolved_category || "resolved"} by ${r.resolved_by || "—"}` : "open"}</td>}
            {withActions && <td>{!r.resolved && (
              <DecideButtons url={`/api/admin/trust/moderation/${r.id}`} options={[
                { value: "released_ok", label: "Release — fine" }, { value: "removed_policy", label: "Remove — policy", danger: true }, { value: "recategorized", label: "Recategorize" },
              ]} />
            )}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <div>
      <div className="fabric-page-head">
        <h1>Moderation</h1>
      </div>
      <div className="ts-card" style={{ padding: 0, overflow: "hidden" }}><h3 style={{ padding: "16px 16px 0" }}>Awaiting review ({open.length})</h3>{render(open, true)}</div>
      <div className="ts-card" style={{ padding: 0, overflow: "hidden" }}><h3 style={{ padding: "16px 16px 0" }}>Resolved ({resolved.length})</h3>{render(resolved, true)}</div>
    </div>
  );
}
