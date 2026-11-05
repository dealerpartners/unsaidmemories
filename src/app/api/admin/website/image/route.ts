import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/gate";
import { BUCKETS, parseDataUrl, uploadDataUrl } from "@/lib/fabric/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/website/image
 *
 * The upload path behind the Website image settings (Website Settings'
 * social share image, CMS & Content's home hero image). The admin picks
 * a file; the bytes land in the shared `design-files` bucket through the
 * same storage machinery the studio uses (lib/fabric/storage), under
 * website/<slot>-<timestamp>.<ext>. Returns the public object URL,
 * which the caller merges into the tenant setting — the stored value
 * stays the plain URL string the setting has always held; only the
 * editing UX changed (upload + preview instead of a pasted URL).
 *
 * Body (JSON): { dataUrl: string, slot?: string }
 */

const MAX_BYTES = 5 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const body = await req.json();
    if (typeof body.dataUrl !== "string") {
      return NextResponse.json({ error: "dataUrl is required" }, { status: 400 });
    }
    const { mime, bytes } = parseDataUrl(body.dataUrl);
    const ext = EXT_BY_MIME[mime];
    if (!ext) {
      return NextResponse.json(
        { error: "That file is not a picture we can use — please choose a PNG, JPG, WebP, GIF, SVG or AVIF image." },
        { status: 400 },
      );
    }
    if (bytes.length > MAX_BYTES) {
      return NextResponse.json(
        { error: "That image is too large — please choose one under 5 MB." },
        { status: 400 },
      );
    }
    const slot =
      typeof body.slot === "string" && /^[a-z0-9-]{1,40}$/.test(body.slot) ? body.slot : "image";
    const path = `website/${slot}-${Date.now()}.${ext}`;
    const db = createServerClient();
    await uploadDataUrl(db, BUCKETS.assets, path, body.dataUrl);
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const url = `${base}/storage/v1/object/public/${BUCKETS.assets}/${path}`;
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 },
    );
  }
}
