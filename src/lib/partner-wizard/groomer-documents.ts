import { createHash, randomUUID } from "node:crypto"
import { pgQueryStrict } from "@/lib/pg"
import { supabaseConfig, supabaseReady } from "@/lib/repo"
import type { PartnerKind } from "./groomer-draft"
import { isWizardSchemaMissing } from "./vet-draft"

// ============================================================================
// Partner wizard documents — upload/list/sign for partner_application_
// documents (Crew D, ship/onb-groomer; implements the pipeline the task
// assigns to src/lib/partner-wizard/documents.ts, which Crew A had not
// landed when this crew built).
//
// Storage follows the app's standing pattern (src/lib/support/
// attachments.ts): a PRIVATE Supabase Storage bucket, objects written
// through the storage REST API with the service key, the metadata row
// inserted first and deleted again if the object write fails, storage
// keys shaped {tenant_id}/{kind}/{application_id}/{doc_type}-{uuid}.{ext}
// — first segment the tenant, matching the storage.objects convention.
// Downloads are short-lived signed URLs, minted server-side only.
// ============================================================================

export const PARTNER_DOCUMENTS_BUCKET = "partner-documents"
export const MAX_PARTNER_DOC_BYTES = 10 * 1024 * 1024 // app upload precedent
export const SIGNED_URL_TTL_SECONDS = 900

export class PartnerDocError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface PartnerDocument {
  id: string
  applicationKind: PartnerKind
  applicationId: string
  step: number
  docType: string
  filename: string
  mimeType: string | null
  sizeBytes: number | null
  status: string
  createdAt: string
}

const DOC_COLS = `id, application_kind, application_id, step, doc_type, filename,
  mime_type, size_bytes, status, created_at::text as created_at`

function mapRow(r: Record<string, unknown>): PartnerDocument {
  return {
    id: String(r.id),
    applicationKind: r.application_kind as PartnerKind,
    applicationId: String(r.application_id),
    step: Number(r.step),
    docType: String(r.doc_type),
    filename: String(r.filename),
    mimeType: (r.mime_type as string | null) ?? null,
    sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes),
    status: String(r.status),
    createdAt: String(r.created_at),
  }
}

function storageHeaders(extra: Record<string, string> = {}): Headers {
  const h = new Headers(extra)
  h.set("apikey", supabaseConfig.key ?? "")
  h.set("Authorization", `Bearer ${supabaseConfig.key ?? ""}`)
  return h
}

function extOf(filename: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(filename.trim())
  return m ? m[1].toLowerCase() : "bin"
}

const BLOCKED_EXT = new Set(["exe", "bat", "cmd", "sh", "js", "html", "htm", "svg"])

export async function uploadPartnerDocument(opts: {
  tenantId: string
  kind: PartnerKind
  applicationId: string
  step: number
  docType: string
  filename: string
  mimeType: string | null
  bytes: Buffer
}): Promise<PartnerDocument> {
  if (!supabaseReady) {
    throw new PartnerDocError(503, "Document storage is not configured yet. Please contact us directly.")
  }
  if (opts.bytes.length === 0) throw new PartnerDocError(400, "The file is empty.")
  if (opts.bytes.length > MAX_PARTNER_DOC_BYTES) {
    throw new PartnerDocError(400, "Files are limited to 10 MB.")
  }
  const ext = extOf(opts.filename)
  if (BLOCKED_EXT.has(ext)) throw new PartnerDocError(400, "That file type is not accepted.")

  const sha256 = createHash("sha256").update(opts.bytes).digest("hex")
  const docId = randomUUID()
  const storageKey = `${opts.tenantId}/${opts.kind}/${opts.applicationId}/${opts.docType}-${docId}.${ext}`

  const rows = await pgQueryStrict<Record<string, unknown>>(
    `insert into public.partner_application_documents
       (id, tenant_id, application_kind, application_id, step, doc_type,
        filename, mime_type, size_bytes, storage_bucket, storage_key, sha256)
     values ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8, $9, $10, $11, $12)
     returning ${DOC_COLS}`,
    [
      docId, opts.tenantId, opts.kind, opts.applicationId, opts.step, opts.docType,
      opts.filename.slice(0, 200), opts.mimeType, opts.bytes.length,
      PARTNER_DOCUMENTS_BUCKET, storageKey, sha256,
    ],
  )

  const res = await fetch(
    `${supabaseConfig.url}/storage/v1/object/${PARTNER_DOCUMENTS_BUCKET}/${storageKey}`,
    {
      method: "POST",
      headers: storageHeaders({ "Content-Type": opts.mimeType || "application/octet-stream", "x-upsert": "false" }),
      body: new Uint8Array(opts.bytes),
    },
  )
  if (!res.ok) {
    await pgQueryStrict(`delete from public.partner_application_documents where id = $1::uuid`, [docId]).catch(() => {})
    throw new PartnerDocError(502, "The upload could not be stored. Please try again.")
  }
  return mapRow(rows[0])
}

export async function listPartnerDocuments(
  kind: PartnerKind,
  applicationId: string,
): Promise<PartnerDocument[]> {
  const rows = await pgQueryStrict<Record<string, unknown>>(
    `select ${DOC_COLS} from public.partner_application_documents
      where application_kind = $1 and application_id = $2::uuid
      order by step, created_at`,
    [kind, applicationId],
  )
  return rows.map(mapRow)
}

/** List that treats a not-yet-applied documents table as an honest empty
 *  list. ONLY a schema-missing failure (the table/columns are not applied
 *  yet) reads as empty — every other failure throws to the caller instead
 *  of masquerading as "no documents". */
export async function listPartnerDocumentsSoft(
  kind: PartnerKind,
  applicationId: string,
): Promise<PartnerDocument[]> {
  try {
    return await listPartnerDocuments(kind, applicationId)
  } catch (e) {
    if (isWizardSchemaMissing(e)) return []
    throw e
  }
}

export async function signedPartnerDocumentUrl(documentId: string): Promise<string | null> {
  if (!supabaseReady) return null
  const rows = await pgQueryStrict<{ storage_bucket: string; storage_key: string }>(
    `select storage_bucket, storage_key from public.partner_application_documents where id = $1::uuid limit 1`,
    [documentId],
  )
  const row = rows[0]
  if (!row) return null
  const res = await fetch(
    `${supabaseConfig.url}/storage/v1/object/sign/${row.storage_bucket}`,
    {
      method: "POST",
      headers: storageHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS, paths: [row.storage_key] }),
    },
  )
  if (!res.ok) return null
  const body = (await res.json().catch(() => null)) as { signedURL?: string }[] | null
  const signed = Array.isArray(body) ? body[0]?.signedURL : null
  return signed ? `${supabaseConfig.url}/storage/v1${signed}` : null
}
