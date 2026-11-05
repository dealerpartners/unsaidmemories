// ---------------------------------------------------------------------------
// partner-wizard/documents.ts — the partner document pipeline contract.
//
// Crew A's canonical pipeline lives on branch ship/onb-core; until the
// parent merges it, this module carries the SAME contract so seller
// Step 4 uploads land in the same shape:
//
//   · the file itself goes to PRIVATE Supabase Storage (bucket
//     `seller-documents`, pattern from src/lib/support/attachments.ts:
//     service-key REST upload, object path recorded on the row, a row
//     never points at a file that isn't there);
//   · a partner_application_documents row records it with
//     application_kind 'seller' and application_id = the seller's
//     seller_partner_applications id (matched by email — that table has
//     no seller_id column);
//   · a verification_tasks row (task_type 'business_verification',
//     evidence_url = storage path) makes it visible to the admin
//     verification desk, which reads verification_tasks.
//
// The server half is documents-server.ts (recordPartnerDocument); this
// file is client-safe and holds the types + the browser upload helper
// the wizard uses.
// ---------------------------------------------------------------------------

export const PARTNER_DOCUMENTS_BUCKET = "seller-documents";

/** The Step 4 (§1.2) document kinds, in filing order. */
export const SELLER_DOCUMENT_KINDS = [
  "tax-id-document",
  "government-id",
  "resale-certificate",
  "business-registration",
  // A2 · Insurance certificate — the seller's certificate of insurance,
  // filed as an 'insurance_verification' task and decided at the admin
  // verification desk like every other A2 check.
  "insurance-certificate",
] as const;

export type SellerDocumentKind = (typeof SELLER_DOCUMENT_KINDS)[number];

export interface PartnerApplicationDocument {
  id: string;
  applicationKind: string;
  applicationId: string | null;
  documentKind: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  bucket: string;
  storagePath: string;
  verificationTaskId: string | null;
  createdAt: string;
}

export interface UploadedPartnerDocument {
  document_id: string;
  storagePath: string;
  bucket: string;
  taskId: string;
  /** The partner_application_documents row id, when that store is live. */
  documentRecordId?: string | null;
}

/**
 * Upload one Step 4 document for real: POSTs the file to
 * /api/seller/onboarding/documents, which stores it and records the
 * partner_application_documents + verification_tasks rows. Throws with
 * the API's own message on failure — callers surface it, never swallow.
 */
export async function uploadSellerDocument(
  documentId: SellerDocumentKind,
  file: File,
): Promise<UploadedPartnerDocument> {
  const form = new FormData();
  form.set("file", file);
  form.set("document_id", documentId);
  const r = await fetch("/api/seller/onboarding/documents", { method: "POST", body: form });
  const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : `Upload failed (${r.status})`);
  return {
    document_id: String(d.document_id || documentId),
    storagePath: String(d.storagePath || ""),
    bucket: String(d.bucket || PARTNER_DOCUMENTS_BUCKET),
    taskId: String(d.taskId || ""),
    documentRecordId: typeof d.documentRecordId === "string" ? d.documentRecordId : null,
  };
}
