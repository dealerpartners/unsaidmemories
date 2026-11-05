// ---------------------------------------------------------------------------
// Printing — client helper. Client-side print surfaces (modals, views)
// build their document body from data they already hold, then hand it to
// openPrintDocument: it opens a window immediately (inside the click's
// user-activation window, so popup blockers stay quiet), loads the
// tenant's printer settings, writes the shared print document shell with
// the right @page geometry, and the shell fires the device print dialog
// when the tenant's auto-print setting for the type is on.
// ---------------------------------------------------------------------------

import { buildPrintDocument } from "./document";
import {
  DEFAULT_PRINTER_SETTINGS,
  type PrinterSettings,
  type PrintDocType,
} from "./geometry";

let cached: Promise<PrinterSettings> | null = null;

export function getClientPrinterSettings(): Promise<PrinterSettings> {
  if (!cached) {
    cached = fetch("/api/admin/settings/printing")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.settings as PrinterSettings) || DEFAULT_PRINTER_SETTINGS)
      .catch(() => DEFAULT_PRINTER_SETTINGS);
  }
  return cached;
}

export function invalidateClientPrinterSettings() {
  cached = null;
}

/**
 * Open a print document in a new tab/window. Returns false when the
 * popup was blocked so the caller can tell the user.
 */
export async function openPrintDocument(opts: {
  docType: PrintDocType;
  title: string;
  bodyHtml: string;
  extraCss?: string;
}): Promise<boolean> {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(
    `<!doctype html><html><head><title>Preparing…</title></head>` +
      `<body style="font-family:system-ui,sans-serif;padding:24px;color:#555;">Preparing print document…</body></html>`,
  );
  w.document.close();
  const settings = await getClientPrinterSettings();
  const html = buildPrintDocument({
    title: opts.title,
    docType: opts.docType,
    settings,
    bodyHtml: opts.bodyHtml,
    extraCss: opts.extraCss,
  });
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  return true;
}

export function escapeHtmlClient(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c] || c));
}
