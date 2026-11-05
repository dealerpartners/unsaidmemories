// ---------------------------------------------------------------------------
// Printing — per-tenant printer settings (server side).
//
// Storage: public.tenant_printer_settings, one row per tenant (migration
// 20261022). A tenant with no row gets DEFAULT_PRINTER_SETTINGS. Values
// are validated against the known paper sets on the way in AND on the way
// out, so a malformed row or request body can never produce a broken
// @page rule downstream.
// ---------------------------------------------------------------------------

import { pgExec, pgQuery } from "@/lib/pg";
import {
  DEFAULT_PRINTER_SETTINGS,
  DOCUMENT_PAPERS,
  LABEL_PAPERS,
  RECEIPT_PAPERS,
  type DocumentPaper,
  type LabelPaper,
  type PrinterSettings,
  type ReceiptPaper,
} from "./geometry";

const RECEIPT_IDS = new Set(RECEIPT_PAPERS.map((p) => p.id));
const LABEL_IDS = new Set(LABEL_PAPERS.map((p) => p.id));
const DOCUMENT_IDS = new Set(DOCUMENT_PAPERS.map((p) => p.id));

function pickPaper<T extends string>(v: unknown, allowed: Set<string>, fallback: T): T {
  return typeof v === "string" && allowed.has(v) ? (v as T) : fallback;
}
function pickBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** Sanitize any unknown input (request body or DB row) into valid settings. */
export function coercePrinterSettings(input: any): PrinterSettings {
  const d = DEFAULT_PRINTER_SETTINGS;
  const r = input?.receipt ?? {};
  const l = input?.label ?? {};
  const doc = input?.document ?? {};
  return {
    receipt: {
      paper: pickPaper<ReceiptPaper>(r.paper, RECEIPT_IDS, d.receipt.paper),
      autoPrint: pickBool(r.autoPrint, d.receipt.autoPrint),
    },
    label: {
      paper: pickPaper<LabelPaper>(l.paper, LABEL_IDS, d.label.paper),
      autoPrint: pickBool(l.autoPrint, d.label.autoPrint),
    },
    document: {
      paper: pickPaper<DocumentPaper>(doc.paper, DOCUMENT_IDS, d.document.paper),
      autoPrint: pickBool(doc.autoPrint, d.document.autoPrint),
    },
  };
}

interface SettingsRow {
  receipt_paper: string;
  receipt_auto_print: boolean;
  label_paper: string;
  label_auto_print: boolean;
  document_paper: string;
  document_auto_print: boolean;
}

export async function getPrinterSettings(tenantId: string): Promise<PrinterSettings> {
  const rows = await pgQuery<SettingsRow>(
    `SELECT receipt_paper, receipt_auto_print, label_paper, label_auto_print,
            document_paper, document_auto_print
       FROM public.tenant_printer_settings
      WHERE tenant_id = $1`,
    [tenantId],
  );
  if (!rows.length) return structuredClone(DEFAULT_PRINTER_SETTINGS);
  const r = rows[0];
  return coercePrinterSettings({
    receipt: { paper: r.receipt_paper, autoPrint: r.receipt_auto_print },
    label: { paper: r.label_paper, autoPrint: r.label_auto_print },
    document: { paper: r.document_paper, autoPrint: r.document_auto_print },
  });
}

export async function savePrinterSettings(
  tenantId: string,
  settings: PrinterSettings,
): Promise<boolean> {
  const n = await pgExec(
    `INSERT INTO public.tenant_printer_settings
       (tenant_id, receipt_paper, receipt_auto_print, label_paper, label_auto_print,
        document_paper, document_auto_print, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (tenant_id) DO UPDATE SET
       receipt_paper = EXCLUDED.receipt_paper,
       receipt_auto_print = EXCLUDED.receipt_auto_print,
       label_paper = EXCLUDED.label_paper,
       label_auto_print = EXCLUDED.label_auto_print,
       document_paper = EXCLUDED.document_paper,
       document_auto_print = EXCLUDED.document_auto_print,
       updated_at = now()`,
    [
      tenantId,
      settings.receipt.paper,
      settings.receipt.autoPrint,
      settings.label.paper,
      settings.label.autoPrint,
      settings.document.paper,
      settings.document.autoPrint,
    ],
  );
  return n > 0;
}
