import type { Metadata } from "next";
import { opsReport } from "@/lib/orders/erp";

export const metadata: Metadata = { title: "Operations Report — Admin" };
export const dynamic = "force-dynamic";

export default async function OpsReportPage() {
  const report = await opsReport();
  return (
    <div className="[font-family:Inter,system-ui,sans-serif]">
      <div className="fabric-page-head">
        <h1>Operations Reporting</h1>
      </div>

      <div className="adm-grid adm-grid-4">
        <div className="adm-card">
          <div className="adm-kpi-label">MTD Revenue</div>
          <div className="adm-kpi-value">${report.mtdRevenue.toLocaleString()}</div>
          <div className="adm-kpi-foot">{report.mtdOrders} orders this month</div>
        </div>
        <div className="adm-card">
          <div className="adm-kpi-label">Open Returns</div>
          <div className="adm-kpi-value">{report.openReturns}</div>
          <div className="adm-kpi-foot">RMAs needing action</div>
        </div>
        <div className="adm-card">
          <div className="adm-kpi-label">Low-stock SKUs</div>
          <div className="adm-kpi-value">{report.lowStockSkus}</div>
          <div className="adm-kpi-foot">≤ 5 on hand</div>
        </div>
      </div>

      <div className="adm-card" style={{ marginTop: 16 }}>
        <h2 className="fabric-section-title">Orders by status</h2>
        <table className="adm-table">
          <tbody>
            {Object.entries(report.byStatus).map(([status, count]) => (
              <tr key={status}><td>{status.replace(/_/g, " ")}</td><td style={{ textAlign: "right", fontWeight: 600 }}>{count}</td></tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/api/admin/erp/reports?format=csv" className="adm-btn" style={{ background: "#0a6400", borderColor: "#0a6400", color: "#fff" }}>Export Ledger (CSV)</a>
          <span style={{ fontSize: 12, color: "#55565e" }}>Generated {new Date(report.generatedAt).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
