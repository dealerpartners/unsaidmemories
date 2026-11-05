// ---------------------------------------------------------------------------
// Printing — paper geometry + settings types (pure, shared client/server).
//
// Every print surface in the app renders a document for one of three
// document types and hands it to the device's own print path
// (window.print() → the OS print dialog → the printer attached to THIS
// device). A web app cannot detect or list printers; what it controls is
// the paper geometry the document is formatted for (@page size) and
// whether the dialog fires automatically when the document opens. Those
// two preferences per type are the tenant's printer settings.
// ---------------------------------------------------------------------------

export type PrintDocType = "receipt" | "label" | "document";

export type ReceiptPaper = "80mm" | "58mm" | "letter";
export type LabelPaper = "4x6" | "letter";
export type DocumentPaper = "letter" | "a4";

export interface PrinterDocSetting<P extends string> {
  paper: P;
  autoPrint: boolean;
}

export interface PrinterSettings {
  receipt: PrinterDocSetting<ReceiptPaper>;
  label: PrinterDocSetting<LabelPaper>;
  document: PrinterDocSetting<DocumentPaper>;
}

export const RECEIPT_PAPERS: { id: ReceiptPaper; label: string }[] = [
  { id: "80mm", label: "Receipt roll — 80mm" },
  { id: "58mm", label: "Receipt roll — 58mm" },
  { id: "letter", label: "Letter sheet" },
];

export const LABEL_PAPERS: { id: LabelPaper; label: string }[] = [
  { id: "4x6", label: "Label — 4 × 6 in" },
  { id: "letter", label: "Letter sheet (label centered)" },
];

export const DOCUMENT_PAPERS: { id: DocumentPaper; label: string }[] = [
  { id: "letter", label: "Letter" },
  { id: "a4", label: "A4" },
];

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  receipt: { paper: "80mm", autoPrint: true },
  label: { paper: "4x6", autoPrint: true },
  document: { paper: "letter", autoPrint: true },
};

export function paperLabel(docType: PrintDocType, settings: PrinterSettings): string {
  if (docType === "receipt") {
    return RECEIPT_PAPERS.find((p) => p.id === settings.receipt.paper)?.label || settings.receipt.paper;
  }
  if (docType === "label") {
    return LABEL_PAPERS.find((p) => p.id === settings.label.paper)?.label || settings.label.paper;
  }
  return DOCUMENT_PAPERS.find((p) => p.id === settings.document.paper)?.label || settings.document.paper;
}

/**
 * CSS for a print document of the given type: the @page rule (what the
 * print dialog offers as the paper size) plus the on-screen sheet sizing.
 * The sheet element is <main class="print-sheet">.
 */
export function pageCssFor(docType: PrintDocType, settings: PrinterSettings): string {
  if (docType === "receipt") {
    const p = settings.receipt.paper;
    if (p === "letter") {
      return `
        @page { size: letter; margin: 12mm; }
        .print-sheet { width: 400px; max-width: 100%; padding: 8px 4px; }
      `;
    }
    const w = p === "58mm" ? "58mm" : "80mm";
    return `
      @page { size: ${w} auto; margin: 0; }
      .print-sheet { width: ${w}; padding: 4mm 3mm; }
    `;
  }
  if (docType === "label") {
    const p = settings.label.paper;
    if (p === "letter") {
      return `
        @page { size: letter; margin: 0; }
        .print-sheet { width: 100%; padding: 12mm 0; display: flex; justify-content: center; }
      `;
    }
    return `
      @page { size: 4in 6in; margin: 0; }
      .print-sheet { width: 4in; height: 6in; padding: 0; }
    `;
  }
  const size = settings.document.paper === "a4" ? "A4" : "letter";
  return `
    @page { size: ${size}; margin: 12mm; }
    .print-sheet { width: 100%; max-width: 760px; padding: 4px 8px; }
  `;
}

/** Inline style for the carrier label image inside a label document. */
export function labelImgStyle(settings: PrinterSettings): string {
  if (settings.label.paper === "letter") {
    return "width:4in;height:6in;object-fit:contain;display:block;";
  }
  return "width:4in;height:6in;object-fit:contain;display:block;";
}
