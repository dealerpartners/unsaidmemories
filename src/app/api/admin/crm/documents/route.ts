import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { supabaseConfig, supabaseReady } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Customer documents live in the private `customer-documents` storage bucket.
// crm_documents.storage_path stores the object path inside that bucket
// (<tenant>/<customer>/<docId>-<filename>); reads resolve it to a signed URL.
const BUCKET = "customer-documents";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);
const ALLOWED_EXT = new Set(["pdf", "png", "jpg", "jpeg", "gif", "webp", "doc", "docx", "xls", "xlsx", "txt", "csv"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toIso(v: any): string | null { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toISOString(); }

function fileExt(name: string): string {
  return (name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function fileAllowed(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (ALLOWED_MIME.has(t) || /^image\/(png|jpe?g|gif|webp)$/.test(t)) return true;
  // Some browsers report generic/empty types — fall back to the extension.
  if (!t || t === "application/octet-stream") return ALLOWED_EXT.has(fileExt(file.name));
  return false;
}

// Batch-sign object paths in the private bucket. Returns path → signed URL;
// paths that fail to sign are simply absent from the map.
async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!supabaseReady || paths.length === 0) return out;
  try {
    const res = await fetch(`${supabaseConfig.url}/storage/v1/object/sign/${BUCKET}`, {
      method: "POST",
      headers: {
        apikey: supabaseConfig.key!,
        Authorization: `Bearer ${supabaseConfig.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 3600, paths }),
    });
    if (!res.ok) return out;
    const rows = (await res.json()) as any[];
    for (const r of rows || []) {
      if (r?.path && r?.signedURL) out.set(String(r.path), `${supabaseConfig.url}/storage/v1${r.signedURL}`);
    }
  } catch { /* signing is best-effort; callers fall back to no link */ }
  return out;
}

function presentRow(row: any, signed: Map<string, string>) {
  const raw = row.storage_path ?? null;
  return {
    id: String(row.id),
    name: row.name ?? "—",
    status: row.status ?? "pending",
    storagePath: raw ? (/^https?:\/\//.test(raw) ? raw : (signed.get(raw) ?? null)) : null,
    mimeType: row.mime_type ?? null,
    petId: row.dependent_id ? String(row.dependent_id) : null,
    petName: row.pet_name ?? null,
    typeName: row.document_type_name ?? null,
    uploadedAt: toIso(row.uploaded_at),
    expiresAt: row.expires_at ? String(row.expires_at).slice(0, 10) : null,
  };
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("customers", "read"); if (gate) return gate;
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId") || "";
  const petId = searchParams.get("petId") || "";
  if (!customerId && !petId) return NextResponse.json({ error: "customerId or petId required" }, { status: 400 });
  const limit = Math.min(parseInt(searchParams.get("limit") || "200") || 200, 500);
  return withPg(async (client) => {
    const tenant = resolveTenantId(req);
    const where = ["d.tenant_id = $1"]; const params: any[] = [tenant]; let pi = 2;
    if (customerId) { where.push(`d.customer_id = $${pi}::uuid`); params.push(customerId); pi++; }
    if (petId) { where.push(`d.dependent_id = $${pi}::uuid`); params.push(petId); pi++; }
    const r = await client.query(`SELECT d.*, p.name AS pet_name, dt.name AS document_type_name FROM public.crm_documents d LEFT JOIN public.crm_pets p ON p.id = d.dependent_id AND p.tenant_id = d.tenant_id LEFT JOIN public.crm_document_types dt ON dt.id = d.document_type_id AND dt.tenant_id = d.tenant_id WHERE ${where.join(" AND ")} ORDER BY d.uploaded_at DESC NULLS LAST, d.created_at DESC LIMIT $${pi}`, [...params, limit]);
    const paths = r.rows.map((row: any) => row.storage_path).filter((p: any) => p && !/^https?:\/\//.test(p));
    const signed = await signPaths(paths);
    return NextResponse.json({ documents: r.rows.map((row: any) => presentRow(row, signed)), total: r.rows.length });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 })).catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}

// POST /api/admin/crm/documents — multipart upload of a real customer document.
//   file              (required; pdf/image/office/text, <= 10 MB)
//   customer_id       (required; crm_customers.id)
//   dependent_id            (optional; must belong to the customer)
//   name              (optional; defaults to the file name)
//   document_type_id  (optional; crm_document_types.id for this tenant)
// The file lands in the private customer-documents bucket and the
// crm_documents row is written with the table's real columns
// (name / status 'submitted' / storage_path / mime_type / file_size_bytes).
export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("customers", "write"); if (gate) return gate;
  if (!supabaseReady) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No 'file' field provided" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "File is empty" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (10 MB max)" }, { status: 413 });
  if (!fileAllowed(file)) return NextResponse.json({ error: "Unsupported file type. Use a PDF, image, Word/Excel document, or text file." }, { status: 415 });

  const customerId = String(form.get("customer_id") || "");
  const petId = String(form.get("dependent_id") || "");
  const documentTypeId = String(form.get("document_type_id") || "");
  if (!customerId || !UUID_RE.test(customerId)) return NextResponse.json({ error: "customer_id (uuid) required" }, { status: 400 });
  if (petId && !UUID_RE.test(petId)) return NextResponse.json({ error: "dependent_id must be a uuid" }, { status: 400 });
  if (documentTypeId && !UUID_RE.test(documentTypeId)) return NextResponse.json({ error: "document_type_id must be a uuid" }, { status: 400 });

  const name = String(form.get("name") || "").trim() || file.name;
  const tenant = resolveTenantId(req);
  const docId = randomUUID();
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/-+/g, "-").slice(0, 80) || `document.${fileExt(file.name) || "pdf"}`;
  const storagePath = `${tenant}/${customerId}/${docId}-${safeName}`;

  // Verify the customer (and pet, when given) really belong to this tenant
  // before anything is stored — the FKs would catch it, but with a worse error.
  const verified = await withPg(async (client) => {
    const c = await client.query(`SELECT id FROM public.crm_customers WHERE id = $1::uuid AND tenant_id = $2::uuid`, [customerId, tenant]);
    if (c.rows.length === 0) return { customer: false, pet: false };
    if (!petId) return { customer: true, pet: true };
    const p = await client.query(`SELECT id FROM public.crm_pets WHERE id = $1::uuid AND tenant_id = $2::uuid AND primary_customer_id = $3::uuid`, [petId, tenant, customerId]);
    return { customer: true, pet: p.rows.length > 0 };
  });
  if (!verified) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  if (!verified.customer) return NextResponse.json({ error: "Customer not found for this tenant" }, { status: 404 });
  if (!verified.pet) return NextResponse.json({ error: "Pet not found for this customer" }, { status: 400 });

  // Insert the row first (with the planned storage path) so a failed upload
  // never leaves an orphaned file behind.
  const inserted = await withPg(async (client) => {
    const r = await client.query(
      `INSERT INTO public.crm_documents
         (id, tenant_id, customer_id, dependent_id, document_type_id, name, status, storage_path, mime_type, file_size_bytes, uploaded_at, metadata)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, 'submitted', $7, $8, $9, now(), $10::jsonb)
       RETURNING *`,
      [docId, tenant, customerId, petId || null, documentTypeId || null, name, storagePath, file.type || null, file.size,
       JSON.stringify({ original_filename: file.name, source: "admin_upload" })],
    );
    return r.rows[0];
  });
  if (!inserted) return NextResponse.json({ error: "Document record could not be created" }, { status: 503 });

  const buf = Buffer.from(await file.arrayBuffer());
  const upRes = await fetch(`${supabaseConfig.url}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: "POST",
    headers: {
      apikey: supabaseConfig.key!,
      Authorization: `Bearer ${supabaseConfig.key}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: buf,
  });
  if (!upRes.ok) {
    const t = await upRes.text().catch(() => upRes.statusText);
    // Roll the row back so the record never points at a file that isn't there.
    await withPg(async (client) => { await client.query(`DELETE FROM public.crm_documents WHERE id = $1::uuid AND tenant_id = $2::uuid`, [docId, tenant]); });
    return NextResponse.json({ error: `Upload failed (${upRes.status}): ${t}` }, { status: 502 });
  }

  const signed = await signPaths([storagePath]);
  return NextResponse.json({ ok: true, document: presentRow(inserted, signed) }, { status: 201 });
}
