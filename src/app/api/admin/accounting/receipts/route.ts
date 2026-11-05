import { NextRequest, NextResponse } from "next/server";
import { guard, ctx, body } from "../_shared";
import { resolveTenantId, adminAuthorIdFromSession } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/receipts — Purchases & Payables →
// Receipt Capture: the receipt inbox. One row per
// acct_receipt_extractions record joined to its acct_attachments
// file registration, plus the tenant's bank transactions for the
// match picker. There is NO OCR behind this yet — extractions are
// created empty (status "pending") and a person types the vendor,
// total, tax and date in the UI and confirms them by hand; the
// status flow (pending → confirmed → matched) records exactly
// that, nothing more.
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const rows = await pgQuery<any>(
      `SELECT x.id::text AS id, x.status, x.vendor_name, x.extracted_total::text, x.tax_amount::text,
              x.receipt_date::text, x.ocr_score::text, x.matched_bank_transaction_id::text AS matched_txn_id,
              x.created_at::text AS created_at,
              a.file_name, a.mime_type, a.size_bytes::text AS size_bytes, a.sha256,
              t.transaction_date::text AS matched_date, t.description AS matched_description,
              t.amount::text AS matched_amount, t.payee AS matched_payee
         FROM public.acct_receipt_extractions x
         LEFT JOIN public.acct_attachments a ON a.id = x.attachment_id
         LEFT JOIN public.acct_bank_transactions t ON t.id = x.matched_bank_transaction_id
        WHERE x.tenant_id = $1
        ORDER BY x.created_at DESC
        LIMIT 300`,
      [tenant],
    );
    const bankTxns = await pgQuery<any>(
      `SELECT id::text AS id, transaction_date::text AS txn_date, description, payee, amount::text
         FROM public.acct_bank_transactions
        WHERE tenant_id = $1
        ORDER BY transaction_date DESC
        LIMIT 300`,
      [tenant],
    );
    return NextResponse.json({
      receipts: rows.map((r) => ({
        id: r.id, status: r.status, vendorName: r.vendor_name,
        extractedTotal: r.extracted_total === null ? null : Number(r.extracted_total),
        taxAmount: r.tax_amount === null ? null : Number(r.tax_amount),
        receiptDate: r.receipt_date, ocrScore: r.ocr_score === null ? null : Number(r.ocr_score),
        matchedTxnId: r.matched_txn_id, createdAt: r.created_at,
        fileName: r.file_name, mimeType: r.mime_type,
        sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes), sha256: r.sha256,
        matched: r.matched_txn_id ? {
          date: r.matched_date, description: r.matched_description,
          amount: r.matched_amount === null ? null : Number(r.matched_amount), payee: r.matched_payee,
        } : null,
      })),
      bankTransactions: bankTxns.map((t) => ({
        id: t.id, date: t.txn_date, description: t.description, payee: t.payee, amount: Number(t.amount),
      })),
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/receipts]", e);
    return NextResponse.json({ error: e?.message || "Failed to load receipts" }, { status: 500 });
  }
}

// POST /api/admin/accounting/receipts — register an uploaded file:
// inserts the acct_attachments row (entity_type 'receipt') and a
// pending acct_receipt_extractions row linked to it. The file's
// SHA-256 is computed in the browser and stored as the integrity
// fingerprint.
export async function POST(req: NextRequest) {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const b = await body(req);
    if (!b.file_name) throw new Error("file_name is required");
    const uploadedBy = await adminAuthorIdFromSession().catch(() => null);
    const { data: extraction, error: xErr } = await db.from("acct_receipt_extractions").insert({
      tenant_id: tenant, status: "pending",
    }).select("id").single();
    if (xErr) throw new Error(xErr.message);
    const { data: att, error: aErr } = await db.from("acct_attachments").insert({
      tenant_id: tenant, entity_type: "receipt", entity_id: extraction.id,
      file_name: String(b.file_name), storage_path: `receipts/${extraction.id}/${String(b.file_name)}`,
      mime_type: b.mime_type || null, size_bytes: Number(b.size_bytes) || null,
      sha256: b.sha256 || null, uploaded_by: uploadedBy,
    }).select("id").single();
    if (aErr) throw new Error(aErr.message);
    const { error: linkErr } = await db.from("acct_receipt_extractions")
      .update({ attachment_id: att.id }).eq("id", extraction.id).eq("tenant_id", tenant);
    if (linkErr) throw new Error(linkErr.message);
    return NextResponse.json({ ok: true, id: extraction.id, attachment_id: att.id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Receipt could not be registered" }, { status: 400 });
  }
}

// PATCH /api/admin/accounting/receipts — hand-confirmation + matching:
//  { id, vendor_name, extracted_total, tax_amount, receipt_date }
//    → saves the typed-in fields and marks the extraction confirmed.
//  { id, action: "match", bank_transaction_id }
//    → writes matched_bank_transaction_id and marks it matched.
//  { id, action: "unmatch" } → clears the match, back to confirmed.
export async function PATCH(req: NextRequest) {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const b = await body(req);
    if (!b.id) throw new Error("id is required");
    if (b.action === "match") {
      if (!b.bank_transaction_id) throw new Error("Pick the bank transaction to match");
      const { error } = await db.from("acct_receipt_extractions").update({
        matched_bank_transaction_id: b.bank_transaction_id, status: "matched",
      }).eq("id", b.id).eq("tenant_id", tenant);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "unmatch") {
      const { error } = await db.from("acct_receipt_extractions").update({
        matched_bank_transaction_id: null, status: "confirmed",
      }).eq("id", b.id).eq("tenant_id", tenant);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }
    const patch: Record<string, unknown> = { status: "confirmed" };
    if (b.vendor_name !== undefined) patch.vendor_name = b.vendor_name || null;
    if (b.extracted_total !== undefined) patch.extracted_total = b.extracted_total === "" || b.extracted_total === null ? null : Number(b.extracted_total);
    if (b.tax_amount !== undefined) patch.tax_amount = b.tax_amount === "" || b.tax_amount === null ? null : Number(b.tax_amount);
    if (b.receipt_date !== undefined) patch.receipt_date = b.receipt_date || null;
    const { error } = await db.from("acct_receipt_extractions").update(patch).eq("id", b.id).eq("tenant_id", tenant);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Receipt could not be updated" }, { status: 400 });
  }
}
