'use client';

/* Admin → Settings → Printing: per-tenant station printer preferences.
 *
 * Printing happens on the device running the app: every print surface
 * (register receipts, shipping labels, packing slips, invoices…)
 * renders a document formatted for a paper size and hands it to the
 * device's own print dialog, where staff pick the printer attached to
 * that device. A web app cannot detect, list, or select printers — so
 * this page deliberately has NO printer picker. What it controls is
 * what the app legitimately owns: the paper format per document type,
 * and whether the print dialog opens automatically. */

import { useEffect, useState } from 'react';
import {
  DEFAULT_PRINTER_SETTINGS,
  DOCUMENT_PAPERS,
  LABEL_PAPERS,
  RECEIPT_PAPERS,
  type PrinterSettings,
} from '@/lib/printing/geometry';
import { invalidateClientPrinterSettings } from '@/lib/printing/client';

function DocSection({
  title, hint, papers, paper, autoPrint, onPaper, onAutoPrint,
}: {
  title: string;
  hint: string;
  papers: { id: string; label: string }[];
  paper: string;
  autoPrint: boolean;
  onPaper: (v: string) => void;
  onAutoPrint: (v: boolean) => void;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-1">{title}</h2>
      <p className="text-xs text-muted-foreground mb-3">{hint}</p>
      <div className="flex flex-wrap gap-2 max-w-lg">
        {papers.map((p) => (
          <button
            key={p.id}
            onClick={() => onPaper(p.id)}
            className={`px-3 py-2 text-sm font-medium rounded border ${ paper === p.id ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground hover:bg-muted' }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm mt-3">
        <input type="checkbox" checked={autoPrint} onChange={(e) => onAutoPrint(e.target.checked)} />
        Open the print dialog automatically
      </label>
    </section>
  );
}

export default function PrintingSettingsPage() {
  const [settings, setSettings] = useState<PrinterSettings>(DEFAULT_PRINTER_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings/printing');
      const j = await res.json();
      if (j?.ok && j.settings) setSettings(j.settings);
      else setMsg(j?.error || 'Failed to load printing settings.');
    } catch { setMsg('Failed to load printing settings.'); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const res = await fetch('/api/admin/settings/printing', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
      });
      const j = await res.json();
      if (j?.ok) {
        setSettings(j.settings);
        invalidateClientPrinterSettings();
        setMsg('Printing settings saved.');
      } else setMsg(j?.error || 'Save failed.');
    } catch { setMsg('Save failed.'); }
    setSaving(false);
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading printing settings…</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Printing Settings</h1>

      {msg && <p className="text-sm mb-4 p-2 border border-border rounded bg-muted">{msg}</p>}

      <DocSection
        title="Receipts"
        hint="Register receipts (POS print / reprint) and payment & deposit receipts."
        papers={RECEIPT_PAPERS}
        paper={settings.receipt.paper}
        autoPrint={settings.receipt.autoPrint}
        onPaper={(v) => setSettings((s) => ({ ...s, receipt: { ...s.receipt, paper: v as PrinterSettings['receipt']['paper'] } }))}
        onAutoPrint={(v) => setSettings((s) => ({ ...s, receipt: { ...s.receipt, autoPrint: v } }))}
      />

      <DocSection
        title="Shipping labels"
        hint="Carrier label files print at true label size. The letter option centers the 4 × 6 label on a letter sheet for offices without a label printer."
        papers={LABEL_PAPERS}
        paper={settings.label.paper}
        autoPrint={settings.label.autoPrint}
        onPaper={(v) => setSettings((s) => ({ ...s, label: { ...s.label, paper: v as PrinterSettings['label']['paper'] } }))}
        onAutoPrint={(v) => setSettings((s) => ({ ...s, label: { ...s.label, autoPrint: v } }))}
      />

      <DocSection
        title="Documents"
        hint="Packing slips, pick lists, invoices, reports, and customer history documents."
        papers={DOCUMENT_PAPERS}
        paper={settings.document.paper}
        autoPrint={settings.document.autoPrint}
        onPaper={(v) => setSettings((s) => ({ ...s, document: { ...s.document, paper: v as PrinterSettings['document']['paper'] } }))}
        onAutoPrint={(v) => setSettings((s) => ({ ...s, document: { ...s.document, autoPrint: v } }))}
      />

      <button
        onClick={save} disabled={saving}
        className="px-5 py-2.5 border border-border bg-card text-brand-teal text-sm font-semibold rounded hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save printing settings'}
      </button>
    </div>
  );
}
