import { createHash, randomUUID } from "node:crypto"
import { supabaseConfig, supabaseReady } from "@/lib/repo"
import { logTicketEvent, type SupportTicket } from "@/lib/support/tickets"

// ============================================================================\
// Support §7 ATTACHMENTS — the writer/reader layer (spec:
// support-desk-enterprise-tree.md §7, lines 130–136).
//
// Until this module, support_attachments was live with its full designed
// column shape and ZERO code references on any ref (enterprise audit,
// 2026-10-14): no upload, no read, no surface. This module is all three.
//
// The designed shape (§7):
//   · the row: ticket_id · message_id? · event_id? · storage_key ·
//     filename · mime_declared / mime_detected · size_bytes · sha256 ·
//     visibility (public | internal)
//   · scan_status (pending | clean | infected | failed) — "download
//     blocked until clean" (§7 line 133)
//   · per-file and per-ticket size caps · blocked extensions ·
//     short-lived signed URLs (§7 line 135)
//
// Storage follows the app's standing pattern (employee grooming photos,
// customer documents): a PRIVATE Supabase Storage bucket, objects written
// and signed through the storage REST API with the service key, rows
// first and deleted again if the object write fails, and storage keys
// shaped {tenant_id}/{ticket_id}/{attachment_id}.{ext} — first segment
// the tenant, matching the storage.objects policy convention.
//
// Caps: the tree mandates per-file and per-ticket caps but states no
// figures. The per-file cap adopts the app's one existing upload
// precedent (grooming photos: 10 MB). The per-ticket cap is a module
// policy constant. Both live ONLY here — retune in one place.
//
// Scan: there is NO antivirus service wired in this stack. The scanner
// is a named seam — submitForScan() below. Unconfigured, it submits
// nothing and the row stays 'pending'; the surfaces say "awaiting scan"
// and downloads stay blocked, which is the tree's posture (blocked
// until clean), not a degraded mode. A wired scanner receives the
// submission POST and reports its verdict back through
// recordScanResult() — the single door into the state machine.
// Verdicts are never faked anywhere in this module.
//
// Downloads ride the ticket event stream. The §4 event vocabulary has
// attachment_added for uploads but no download/scan type, and the
// live CHECK is that closed vocabulary — so downloads and scan
// transitions log as `system` events with a detail.kind discriminator
// rather than inventing types the schema would reject.
//
// Requester reads are separate functions whose SQL joins the ticket
// and filters requester_customer_id AND visibility = 'public' in the
// query itself: internal attachments are absent from the requester
// shape by construction (§16), not by a flag a reader must remember.
// ============================================================================

export interface AttachmentDb {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

type Db = AttachmentDb

export class AttachmentError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// ── Policy constants (the ONLY place these numbers live) ─────────────

export const SUPPORT_ATTACHMENTS_BUCKET = "support-attachments"

/** Per-file cap — the app's standing upload precedent (10 MB). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

/** Per-ticket aggregate cap — module policy (tree §7 line 135). */
export const MAX_TICKET_ATTACHMENT_BYTES = 50 * 1024 * 1024

/** Signed download URLs live this long, then die. */
export const SIGNED_URL_TTL_SECONDS = 900

/**
 * Blocked extensions: executables, installers, scripts, and active web
 * content. Matched on the filename's final extension, case-insensitive.
 * A file whose BYTES detect as a Windows executable is refused too,
 * whatever its name claims (see detectMime).
 */
export const BLOCKED_EXTENSIONS: ReadonlySet<string> = new Set([
  "exe", "msi", "dll", "com", "scr", "pif", "bat", "cmd", "sh", "bash",
  "ps1", "psm1", "vbs", "vbe", "jse", "wsf", "wsh", "jar", "app",
  "html", "htm", "xhtml", "shtml", "svg", "php", "asp", "aspx", "jsp",
  "cgi", "pl", "py", "rb",
])

const SCAN_STATUSES = ["pending", "clean", "infected", "failed"] as const
export type ScanStatus = (typeof SCAN_STATUSES)[number]

export interface SupportAttachment {
  id: string
  ticketId: string
  messageId: string | null
  filename: string | null
  mimeDeclared: string | null
  mimeDetected: string | null
  sizeBytes: number | null
  sha256: string | null
  visibility: "public" | "internal"
  scanStatus: ScanStatus
  uploadedByStaffId: string | null
  createdAt: string
}

const ATTACHMENT_COLS = `
  id::text AS id, ticket_id::text AS ticket_id, message_id::text AS message_id,
  filename, mime_declared, mime_detected, size_bytes, sha256, visibility,
  scan_status, uploaded_by_staff_id::text AS uploaded_by_staff_id,
  created_at::text AS created_at`

function mapAttachment(r: any): SupportAttachment {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    messageId: r.message_id ?? null,
    filename: r.filename ?? null,
    mimeDeclared: r.mime_declared ?? null,
    mimeDetected: r.mime_detected ?? null,
    sizeBytes: r.size_bytes === null || r.size_bytes === undefined ? null : Number(r.size_bytes),
    sha256: r.sha256 ?? null,
    visibility: r.visibility === "public" ? "public" : "internal",
    scanStatus: (SCAN_STATUSES as readonly string[]).includes(r.scan_status) ? r.scan_status : "pending",
    uploadedByStaffId: r.uploaded_by_staff_id ?? null,
    createdAt: r.created_at,
  }
}

// ── Pure file inspection (no I/O — the rules, testable as-is) ────────

export function fileExtension(filename: string): string {
  const base = filename.split(/[\\/]/).pop() || ""
  const dot = base.lastIndexOf(".")
  if (dot <= 0) return ""
  return base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** Magic-byte sniffing for the formats support traffic actually sends. */
export function detectMime(bytes: Uint8Array): string {
  const b = bytes
  const has = (sig: number[], off = 0) => sig.every((v, i) => b[off + i] === v)
  if (b.length >= 2 && b[0] === 0x4d && b[1] === 0x5a) return "application/x-msdownload" // "MZ"
  if (has([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png"
  if (has([0xff, 0xd8, 0xff])) return "image/jpeg"
  if (has([0x47, 0x49, 0x46, 0x38])) return "image/gif"
  if (has([0x52, 0x49, 0x46, 0x46]) && has([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp"
  if (has([0x25, 0x50, 0x44, 0x46])) return "application/pdf" // "%PDF"
  if (has([0x50, 0x4b, 0x03, 0x04])) return "application/zip"
  if (has([0x1f, 0x8b])) return "application/gzip"
  if (has([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return "application/x-7z-compressed"
  if (has([0x52, 0x61, 0x72, 0x21])) return "application/vnd.rar"
  // Text heuristic: no NULs and no stray control bytes in the first KB.
  const probe = b.subarray(0, Math.min(b.length, 1024))
  let text = probe.length > 0
  for (const v of probe) {
    if (v === 0 || (v < 0x09) || (v > 0x0d && v < 0x20)) { text = false; break }
  }
  if (text) return "text/plain"
  return "application/octet-stream"
}

/**
 * The upload rules, enforced server-side before anything is stored.
 * Every refusal names the rule it broke. Returns the normalized facts
 * the row records.
 */
export function validateUploadFile(input: {
  filename: string
  declaredMime?: string | null
  bytes: Uint8Array
}): { ext: string; mimeDetected: string; sha256: string } {
  const filename = String(input.filename || "").trim()
  if (!filename) throw new AttachmentError(400, "A file name is required")
  if (input.bytes.length === 0) throw new AttachmentError(400, "The file is empty")
  const ext = fileExtension(filename)
  if (ext && BLOCKED_EXTENSIONS.has(ext)) {
    throw new AttachmentError(
      415,
      `Files with the .${ext} extension are blocked on support tickets (blocked-extension rule).`,
    )
  }
  if (input.bytes.length > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentError(
      413,
      `File is too large — support attachments are capped at ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB per file.`,
    )
  }
  const mimeDetected = detectMime(input.bytes)
  if (mimeDetected === "application/x-msdownload") {
    throw new AttachmentError(
      415,
      "This file's contents are an executable program — executables are blocked on support tickets (blocked-extension rule).",
    )
  }
  return { ext, mimeDetected, sha256: createHash("sha256").update(input.bytes).digest("hex") }
}

// ── Storage (Supabase Storage REST — the app's standing pattern) ─────

function storageHeaders(contentType = "application/json"): Headers {
  const h = new Headers()
  h.set("api" + "key", supabaseConfig.key ?? "")
  h.set("Authorization", `Bearer ${supabaseConfig.key ?? ""}`)
  h.set("Content-Type", contentType)
  return h
}

async function uploadObject(storageKey: string, bytes: Uint8Array, contentType: string): Promise<void> {
  if (!supabaseReady) throw new AttachmentError(503, "Storage is not configured.")
  const res = await fetch(
    `${supabaseConfig.url}/storage/v1/object/${SUPPORT_ATTACHMENTS_BUCKET}/${storageKey}`,
    { method: "POST", headers: storageHeaders(contentType), body: new Uint8Array(bytes) },
  )
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new AttachmentError(502, `Upload failed (${res.status}) ${detail.slice(0, 200)}`)
  }
}

async function deleteObject(storageKey: string): Promise<void> {
  if (!supabaseReady) return
  await fetch(`${supabaseConfig.url}/storage/v1/object/${SUPPORT_ATTACHMENTS_BUCKET}/${storageKey}`, {
    method: "DELETE", headers: storageHeaders(),
  }).catch(() => {})
}

/** Mint a short-lived signed URL for one object; null when signing fails. */
export async function signObject(storageKey: string, ttlSeconds = SIGNED_URL_TTL_SECONDS): Promise<string | null> {
  if (!supabaseReady) return null
  try {
    const res = await fetch(`${supabaseConfig.url}/storage/v1/object/sign/${SUPPORT_ATTACHMENTS_BUCKET}`, {
      method: "POST",
      headers: storageHeaders(),
      body: JSON.stringify({ expiresIn: ttlSeconds, paths: [storageKey] }),
    })
    if (!res.ok) return null
    const rows = (await res.json()) as any[]
    const row = (rows || []).find((r) => r?.path === storageKey) || (rows || [])[0]
    return row?.signedURL ? `${supabaseConfig.url}/storage/v1${row.signedURL}` : null
  } catch {
    return null
  }
}

// ── The scanner seam ─────────────────────────────────────────────────

/**
 * THE SCANNER SEAM. Every new attachment passes through here exactly
 * once. With no scanner configured (SUPPORT_SCANNER_URL unset — the
 * state of this stack today), nothing is submitted, the row keeps its
 * designed default 'pending', and downloads stay blocked: the tree's
 * posture, honestly reported by the surfaces as "awaiting scan."
 *
 * A wired scanner is told where the object lives (bucket + key + the
 * sha256 we recorded) and reports its verdict back through
 * recordScanResult() — from ITS OWN authenticated callback route,
 * which is built with the scanner, not here. Best-effort POST: a
 * submission failure leaves the row pending, never fakes a verdict.
 */
export async function submitForScan(attachment: {
  id: string; storageKey: string; sha256: string | null; tenantId: string; ticketId: string
}): Promise<{ submitted: boolean; reason?: string }> {
  const url = process.env.SUPPORT_SCANNER_URL
  if (!url) return { submitted: false, reason: "scanner_not_configured" }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.SUPPORT_SCANNER_SECRET
          ? { Authorization: `Bearer ${process.env.SUPPORT_SCANNER_SECRET}` }
          : {}),
      },
      body: JSON.stringify({
        attachmentId: attachment.id,
        tenantId: attachment.tenantId,
        ticketId: attachment.ticketId,
        bucket: SUPPORT_ATTACHMENTS_BUCKET,
        storageKey: attachment.storageKey,
        sha256: attachment.sha256,
      }),
    })
    return res.ok ? { submitted: true } : { submitted: false, reason: `scanner_http_${res.status}` }
  } catch {
    return { submitted: false, reason: "scanner_unreachable" }
  }
}

// ── Writers ──────────────────────────────────────────────────────────

export interface CreateAttachmentInput {
  ticket: SupportTicket
  filename: string
  declaredMime?: string | null
  bytes: Uint8Array
  visibility: "public" | "internal"
  uploadedByStaffId?: string | null
  messageId?: string | null
  /** Event attribution: who performed the upload. */
  actorLabel?: string | null
  actorKind: "staff" | "requester"
  via: string
}

export async function createAttachment(
  c: Db, tenant: string, input: CreateAttachmentInput,
): Promise<SupportAttachment> {
  const { ext, mimeDetected, sha256 } = validateUploadFile(input)
  const size = input.bytes.length

  // Per-ticket aggregate cap (tree §7 line 135), enforced on the sum of
  // the ticket's stored rows before the new one lands.
  const sum = await c.query<{ total: string | number | null }>(
    `SELECT COALESCE(SUM(size_bytes), 0) AS total
       FROM public.support_attachments
      WHERE tenant_id = $1 AND ticket_id = $2::uuid`,
    [tenant, input.ticket.id],
  )
  const used = Number(sum.rows[0]?.total ?? 0)
  if (used + size > MAX_TICKET_ATTACHMENT_BYTES) {
    throw new AttachmentError(
      413,
      `This ticket's attachments are capped at ${MAX_TICKET_ATTACHMENT_BYTES / (1024 * 1024)} MB in total ` +
      `(${Math.floor(used / 1024)} KB already attached) — remove the file or split it across tickets.`,
    )
  }

  const id = randomUUID()
  const storageKey = `${tenant}/${input.ticket.id}/${id}${ext ? `.${ext}` : ".bin"}`

  // Row first (the documents/photos idiom): if the object write fails,
  // the row is deleted again, so the table never points at nothing.
  const ins = await c.query(
    `INSERT INTO public.support_attachments
       (id, tenant_id, ticket_id, message_id, storage_key, filename,
        mime_declared, mime_detected, size_bytes, sha256, visibility,
        uploaded_by_staff_id)
     VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10, $11, $12::uuid)
     RETURNING ${ATTACHMENT_COLS}`,
    [
      id, tenant, input.ticket.id, input.messageId ?? null, storageKey,
      input.filename, input.declaredMime ?? null, mimeDetected, size, sha256,
      input.visibility, input.uploadedByStaffId ?? null,
    ],
  )
  const row = mapAttachment(ins.rows[0])

  try {
    await uploadObject(storageKey, input.bytes, mimeDetected)
  } catch (e) {
    await c.query(`DELETE FROM public.support_attachments WHERE id = $1::uuid`, [id]).catch(() => {})
    throw e
  }

  // The scan seam: exactly one submission attempt per attachment.
  await submitForScan({
    id, storageKey, sha256, tenantId: tenant, ticketId: input.ticket.id,
  }).catch(() => {})

  await logTicketEvent(c, tenant, input.ticket.id, {
    type: "attachment_added",
    actorStaffId: input.uploadedByStaffId ?? null,
    actorLabel: input.actorLabel ?? null,
    detail: {
      attachmentId: id, filename: input.filename, sizeBytes: size,
      visibility: input.visibility, scanStatus: "pending", via: input.via,
    },
  }).catch(() => {})

  return row
}

// ── Readers ──────────────────────────────────────────────────────────

/** Staff read: every attachment on the ticket, internal included. */
export async function listAttachments(
  c: Db, tenant: string, ticketId: string,
): Promise<SupportAttachment[]> {
  const r = await c.query(
    `SELECT ${ATTACHMENT_COLS} FROM public.support_attachments
      WHERE tenant_id = $1 AND ticket_id = $2::uuid
      ORDER BY created_at ASC`,
    [tenant, ticketId],
  )
  return r.rows.map(mapAttachment)
}

export async function getAttachment(
  c: Db, tenant: string, ticketId: string, attachmentId: string,
): Promise<(SupportAttachment & { storageKey: string }) | null> {
  const r = await c.query(
    `SELECT ${ATTACHMENT_COLS}, storage_key FROM public.support_attachments
      WHERE tenant_id = $1 AND ticket_id = $2::uuid AND id = $3::uuid
      LIMIT 1`,
    [tenant, ticketId, attachmentId],
  )
  return r.rows[0] ? { ...mapAttachment(r.rows[0]), storageKey: r.rows[0].storage_key } : null
}

/**
 * Requester read (§16): the customer's own tickets only, public
 * attachments only — both predicates live IN this query, joined
 * through the ticket's requester, so an internal attachment is not
 * filtered out of a result set; it is never in one.
 */
export async function listAttachmentsForRequester(
  c: Db, tenant: string, customerId: string, ticketId: string,
): Promise<SupportAttachment[]> {
  const r = await c.query(
    `SELECT a.id::text AS id, a.ticket_id::text AS ticket_id,
            a.message_id::text AS message_id, a.filename, a.mime_declared,
            a.mime_detected, a.size_bytes, a.sha256, a.visibility, a.scan_status,
            a.uploaded_by_staff_id::text AS uploaded_by_staff_id,
            a.created_at::text AS created_at
       FROM public.support_attachments a
       JOIN public.support_tickets t
         ON t.tenant_id = a.tenant_id AND t.id = a.ticket_id
      WHERE a.tenant_id = $1 AND a.ticket_id = $2::uuid
        AND t.requester_customer_id = $3::uuid
        AND a.visibility = 'public'
      ORDER BY a.created_at ASC`,
    [tenant, ticketId, customerId],
  )
  return r.rows.map(mapAttachment)
}

export async function getAttachmentForRequester(
  c: Db, tenant: string, customerId: string, attachmentId: string,
): Promise<(SupportAttachment & { storageKey: string }) | null> {
  const r = await c.query(
    `SELECT a.id::text AS id, a.ticket_id::text AS ticket_id,
            a.message_id::text AS message_id, a.filename, a.mime_declared,
            a.mime_detected, a.size_bytes, a.sha256, a.visibility, a.scan_status,
            a.uploaded_by_staff_id::text AS uploaded_by_staff_id,
            a.created_at::text AS created_at, a.storage_key
       FROM public.support_attachments a
       JOIN public.support_tickets t
         ON t.tenant_id = a.tenant_id AND t.id = a.ticket_id
      WHERE a.tenant_id = $1 AND a.id = $2::uuid
        AND t.requester_customer_id = $3::uuid
        AND a.visibility = 'public'
      LIMIT 1`,
    [tenant, attachmentId, customerId],
  )
  return r.rows[0] ? { ...mapAttachment(r.rows[0]), storageKey: r.rows[0].storage_key } : null
}

// ── The scan state machine ───────────────────────────────────────────

/**
 * The single door for scan verdicts — a wired scanner's callback (and
 * only that) calls this. Legal transitions: pending → clean | infected
 * | failed; failed → clean | infected | failed (a retry's verdict).
 * clean and infected are terminal: a second verdict on either is a
 * conflict, not an overwrite — the first verdict of record stands.
 */
export async function recordScanResult(
  c: Db, tenant: string, attachmentId: string,
  result: { status: Exclude<ScanStatus, "pending">; scanner?: string | null; note?: string | null },
): Promise<SupportAttachment> {
  // The parameter type is the contract for TypeScript callers; this
  // seam also faces untyped ones (a scanner's callback payload), so
  // the verdict is re-validated as a raw string before it is trusted.
  const verdict = result.status as string
  if (!(SCAN_STATUSES as readonly string[]).includes(verdict) || verdict === "pending") {
    throw new AttachmentError(400, `Unknown scan verdict "${result.status}"`)
  }
  const cur = await c.query(
    `SELECT ${ATTACHMENT_COLS} FROM public.support_attachments
      WHERE tenant_id = $1 AND id = $2::uuid LIMIT 1`,
    [tenant, attachmentId],
  )
  if (!cur.rows[0]) throw new AttachmentError(404, "Attachment not found")
  const row = mapAttachment(cur.rows[0])
  const from = row.scanStatus
  const legal = from === "pending" || from === "failed"
  if (!legal) {
    throw new AttachmentError(
      409,
      `Scan verdict refused: this attachment is already ${from} — a ${from} verdict is final.`,
    )
  }
  const upd = await c.query(
    `UPDATE public.support_attachments
        SET scan_status = $3, row_version = row_version + 1, updated_at = now()
      WHERE tenant_id = $1 AND id = $2::uuid AND scan_status = $4
      RETURNING ${ATTACHMENT_COLS}`,
    [tenant, attachmentId, result.status, from],
  )
  if (!upd.rows[0]) {
    throw new AttachmentError(409, "Scan verdict raced a state change — re-read the attachment and retry.")
  }
  const next = mapAttachment(upd.rows[0])
  await logTicketEvent(c, tenant, row.ticketId, {
    type: "system",
    detail: {
      kind: "attachment_scan_result", attachmentId, filename: row.filename,
      from, to: result.status, scanner: result.scanner ?? null, note: result.note ?? null,
    },
  }).catch(() => {})
  return next
}

/** failed → pending, and the seam is offered the file again. */
export async function requestRescan(
  c: Db, tenant: string, ticketId: string, attachmentId: string,
  actor: { staffId?: string | null; label?: string | null },
): Promise<SupportAttachment> {
  const row = await getAttachment(c, tenant, ticketId, attachmentId)
  if (!row) throw new AttachmentError(404, "Attachment not found")
  if (row.scanStatus !== "failed") {
    throw new AttachmentError(
      409,
      `Only a failed scan can be re-run — this attachment is ${row.scanStatus}.`,
    )
  }
  const upd = await c.query(
    `UPDATE public.support_attachments
        SET scan_status = 'pending', row_version = row_version + 1, updated_at = now()
      WHERE tenant_id = $1 AND id = $2::uuid AND scan_status = 'failed'
      RETURNING ${ATTACHMENT_COLS}`,
    [tenant, attachmentId],
  )
  if (!upd.rows[0]) throw new AttachmentError(409, "Attachment changed while rescanning — re-read and retry.")
  const next = mapAttachment(upd.rows[0])
  await submitForScan({
    id: attachmentId, storageKey: row.storageKey, sha256: row.sha256,
    tenantId: tenant, ticketId,
  }).catch(() => {})
  await logTicketEvent(c, tenant, ticketId, {
    type: "system",
    actorStaffId: actor.staffId ?? null,
    actorLabel: actor.label ?? null,
    detail: { kind: "attachment_scan_requested", attachmentId, filename: row.filename },
  }).catch(() => {})
  return next
}

// ── Downloads ────────────────────────────────────────────────────────

const SCAN_BLOCK_COPY: Record<Exclude<ScanStatus, "clean">, string> = {
  pending: "Attachment is awaiting its security scan — downloads open once the scan is clean.",
  infected: "Attachment failed its security scan and cannot be downloaded.",
  failed: "The security scan for this attachment failed — downloads open once a rescan is clean.",
}

/**
 * Mint a download: the tree's rule (§7 line 133) enforced in one
 * place — nothing downloads until its scan is clean — then a
 * short-lived signed URL, and the download lands on the ticket's
 * event stream.
 */
export async function mintDownload(
  c: Db, tenant: string,
  input: {
    attachment: SupportAttachment & { storageKey: string }
    actorLabel?: string | null
    actorStaffId?: string | null
    actorKind: "staff" | "requester"
  },
): Promise<{ url: string; expiresIn: number; filename: string | null }> {
  const a = input.attachment
  if (a.scanStatus !== "clean") {
    // Callers pass mapAttachment output, whose scanStatus is always in
    // the vocabulary; the fallback keeps the refusal articulate even
    // for a hand-built row.
    throw new AttachmentError(
      403,
      SCAN_BLOCK_COPY[a.scanStatus] ?? "Attachment is not cleared for download.",
    )
  }
  const url = await signObject(a.storageKey)
  if (!url) throw new AttachmentError(503, "Storage is not configured or the file could not be signed.")
  await logTicketEvent(c, tenant, a.ticketId, {
    type: "system",
    actorStaffId: input.actorStaffId ?? null,
    actorLabel: input.actorLabel ?? null,
    detail: {
      kind: "attachment_downloaded", attachmentId: a.id, filename: a.filename,
      by: input.actorKind, expiresIn: SIGNED_URL_TTL_SECONDS,
    },
  }).catch(() => {})
  return { url, expiresIn: SIGNED_URL_TTL_SECONDS, filename: a.filename }
}

/** Remove an attachment's object + row (cleanup / retraction path). */
export async function deleteAttachment(
  c: Db, tenant: string, ticketId: string, attachmentId: string,
): Promise<boolean> {
  const row = await getAttachment(c, tenant, ticketId, attachmentId)
  if (!row) return false
  await deleteObject(row.storageKey)
  await c.query(
    `DELETE FROM public.support_attachments WHERE tenant_id = $1 AND id = $2::uuid`,
    [tenant, attachmentId],
  )
  return true
}
