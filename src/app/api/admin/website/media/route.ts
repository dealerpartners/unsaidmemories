import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/gate";
import { getPayloadPool } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/website/media — Payload media rows, newest first.
 * POST /api/admin/website/media — record an already-uploaded image as
 * Payload media (admin only). Body: { url, alt?, filename? }. The
 * upload itself goes through /api/admin/website/image (which stores
 * bytes in the design-files bucket) or the Pollinations generation
 * route — this route records the media row so the Payload media
 * library and the banner/pop-up pickers see the same images. Nothing
 * here is ever hotlinked: the URL must be one of this project's
 * Supabase storage URLs.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const { rows } = await getPayloadPool().query(
      `SELECT id, filename, url, alt, mime_type, width, height, created_at FROM payload.media ORDER BY created_at DESC LIMIT 200`,
    );
    return NextResponse.json({ media: rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Read failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!url || (base && !url.startsWith(base + "/storage/"))) {
    return NextResponse.json({ error: "url must be a Supabase storage URL from this project" }, { status: 400 });
  }
  const filename = typeof body?.filename === "string" && body.filename ? body.filename : url.split("/").pop() ?? "image";
  try {
    const { rows } = await getPayloadPool().query(
      `INSERT INTO payload.media (url, filename, alt) VALUES ($1, $2, $3) RETURNING *`,
      [url, filename, typeof body?.alt === "string" ? body.alt : null],
    );
    return NextResponse.json({ media: rows[0] }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Save failed" }, { status: 500 });
  }
}
