// ---------------------------------------------------------------------------
// Printing — the shared print document shell (pure string building, used by
// server print routes and by the client print helper alike).
//
// A print document is a standalone HTML page: an on-screen-only toolbar
// (hidden when printed) with honest copy about how printing works, the
// document body, the @page geometry for its type, and — when the tenant's
// setting for the type says so — a script that fires the device print
// dialog as soon as the document loads.
// ---------------------------------------------------------------------------

import {
  pageCssFor,
  paperLabel,
  type PrinterSettings,
  type PrintDocType,
} from "./geometry";

export function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c] || c));
}

export function buildPrintDocument(opts: {
  title: string;
  docType: PrintDocType;
  settings: PrinterSettings;
  bodyHtml: string;
  extraCss?: string;
}): string {
  const { title, docType, settings, bodyHtml, extraCss } = opts;
  const autoPrint = settings[docType].autoPrint;
  const paper = paperLabel(docType, settings);
  const autoNote = autoPrint
    ? "The print dialog opens automatically."
    : "Auto-print is off for this document type (Settings → Printing), so press Print when you're ready.";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 0; }
  ${pageCssFor(docType, settings)}
  @media screen {
    body { background: #e5e7eb; }
    .print-sheet { background: #fff; margin: 20px auto; box-shadow: 0 2px 12px rgba(0,0,0,.25); }
    .print-toolbar { max-width: 760px; margin: 16px auto 0; background: #fff; border: 1px solid #d1d5db; border-radius: 8px; padding: 12px 16px; font-size: 13px; line-height: 1.5; }
    .print-toolbar button { padding: 8px 18px; background: #111; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
  }
  @media print {
    .no-print { display: none !important; }
    .print-sheet { margin: 0 auto; box-shadow: none; }
  }
  ${extraCss || ""}
</style></head><body>
  <div class="print-toolbar no-print">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
      <p style="margin:0;color:#374151;">
        <strong style="color:#111;">Printing on this device's printer.</strong>
        This page is formatted for ${escapeHtml(paper)}. A web app can't detect or list
        printers — printing goes through this device's print dialog, where you pick the
        printer attached to this device. ${autoNote}
      </p>
      <button onclick="window.print()">Print</button>
    </div>
  </div>
  <main class="print-sheet">
${bodyHtml}
  </main>
  ${autoPrint ? `<script>window.addEventListener('load', () => setTimeout(() => window.print(), 60));</script>` : ""}
</body></html>`;
}
