/**
 * Fabric studio — Supabase Storage helpers (server-side only).
 *
 * Buckets (created by supabase/migrations/20261030010000_fabric_studio.sql):
 *  - design-assets : uploaded artwork, AI inspiration, SVG sources
 *  - print-files   : exported print-ready PNGs + post-processed files
 *  - mockups       : rendered product mockups
 *
 * All buckets are private; reads go through signed URLs. Rows in
 * design_assets index every object; designs.print_file_path /
 * designs.mockup_path store `bucket/path` references.
 */

import type { createServerClient } from "@/lib/supabase";

type Db = ReturnType<typeof createServerClient>;

// The live project has exactly one storage bucket — `design-files` —
// which is also where the pre-existing design_files.file_url records
// point. All studio files live there under kind prefixes
// (designs/<id>/print-..., artwork/..., mockups/..., inspiration/...).
// The migration still provisions dedicated buckets for a future split,
// but the code only depends on the bucket that exists.
export const BUCKETS = {
  assets: "design-files",
  print: "design-files",
  mockups: "design-files",
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

export function parseDataUrl(dataUrl: string): { mime: string; bytes: Buffer } {
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!m) throw new Error("Invalid data URL");
  const mime = m[1] || "application/octet-stream";
  const bytes = m[2]
    ? Buffer.from(m[3], "base64")
    : Buffer.from(decodeURIComponent(m[3]), "utf8");
  return { mime, bytes };
}

export async function uploadBytes(
  db: Db,
  bucket: BucketName,
  path: string,
  bytes: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const { error } = await db.storage
    .from(bucket)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed (${bucket}/${path}): ${error.message}`);
  return `${bucket}/${path}`;
}

/** Upload a base64 data URL (what the Konva export produces). */
export async function uploadDataUrl(
  db: Db,
  bucket: BucketName,
  path: string,
  dataUrl: string,
): Promise<{ ref: string; mime: string; bytes: Buffer }> {
  const { mime, bytes } = parseDataUrl(dataUrl);
  const ref = await uploadBytes(db, bucket, path, bytes, mime);
  return { ref, mime, bytes };
}

/** Split a stored `bucket/path` reference. */
export function splitRef(ref: string): { bucket: string; path: string } {
  const i = ref.indexOf("/");
  return { bucket: ref.slice(0, i), path: ref.slice(i + 1) };
}

export async function signedUrl(
  db: Db,
  ref: string,
  expiresIn = 3600,
): Promise<string | null> {
  const { bucket, path } = splitRef(ref);
  const { data, error } = await db.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}
