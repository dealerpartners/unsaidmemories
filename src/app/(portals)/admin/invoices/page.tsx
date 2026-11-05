'use client';

// /admin/invoices — the owner's invoice-editor design (the INVOICE
// OVERLAY from GLONALSHELLREVAMP2.html) installed as the page, per his
// 2026-11-02 direction: his design replaces this route's presentation.
// The transplanted InvoicesView table is no longer rendered here (its
// file stays on disk, unmounted). All data flows through the existing
// /api/admin/invoices + /send endpoints — see components/admin/
// InvoiceEditor.tsx.
import InvoiceEditor from '@/components/admin/InvoiceEditor';

export default function InvoicesPage() {
  return <InvoiceEditor />;
}
