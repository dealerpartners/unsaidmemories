import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { buildPrintDocument } from "@/lib/printing/document";
import { getPrinterSettings } from "@/lib/printing/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// POST /api/admin/reports/pdf — Generate printable HTML for PDF export.
// Body: { title, data } — returns a print document through the shared
// shell (tenant printer settings geometry + auto-print; the device print
// dialog is also where "Save as PDF" lives).
// ============================================================================

const REPORT_CSS = `
  h1 { font-size: 24px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 24px; border-bottom: 2px solid #111; padding-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th { text-align: left; padding: 10px; background: #f5f5f5; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #ddd; }
  td { padding: 10px; border-bottom: 1px solid #eee; font-size: 14px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  pre { background: #f9f9f9; padding: 16px; border-radius: 6px; font-size: 12px; overflow-x: auto; }
`;

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("reports", "read");
  if (gate) return gate;

  const body = await req.json();
  const title = String(body.title || "Report");
  const data = body.data || {};

  const date = new Date().toLocaleDateString();
  const dataHtml = renderData(data);
  const settings = await getPrinterSettings(resolveTenantId(req));

  const html = buildPrintDocument({
    title,
    docType: "document",
    settings,
    bodyHtml: `
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">UnSaid Memories &bull; Generated ${date}</div>
  ${dataHtml}`,
    extraCss: REPORT_CSS,
  });

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}

function renderData(data: any): string {
  if (!data || typeof data !== "object") {
    return `<p style="color:#999;">No data available.</p>`;
  }

  // If it's an array, render as table
  if (Array.isArray(data)) {
    if (data.length === 0) return `<p style="color:#999;">No rows.</p>`;
    const keys = Object.keys(data[0]);
    const header = keys.map(k => `<th>${escapeHtml(k)}</th>`).join("");
    const rows = data.map((row: any) =>
      `<tr>${keys.map(k => {
        const v = row[k];
        const isNum = typeof v === "number";
        return `<td class="${isNum ? "num" : ""}">${escapeHtml(formatValue(v))}</td>`;
      }).join("")}</tr>`
    ).join("");
    return `<table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  // If it's an object, render key-value or nested
  const entries = Object.entries(data);
  if (entries.length === 0) return `<p style="color:#999;">No data.</p>`;

  // Check if values are arrays (grouped report)
  let html = "";
  for (const [key, value] of entries) {
    html += `<h3 style="margin-top:24px;font-size:16px;">${escapeHtml(key)}</h3>`;
    html += renderData(value);
  }
  return html;
}

function formatValue(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function escapeHtml(s: string): string {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] || c));
}
