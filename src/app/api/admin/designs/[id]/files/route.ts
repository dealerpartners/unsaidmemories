import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/gate";
import { PLATFORM_TENANT_ID } from "@/lib/fabric/publish";
import {
  BUCKETS,
  parseDataUrl,
  signedUrl,
  uploadBytes,
  uploadDataUrl,
  type BucketName,
} from "@/lib/fabric/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/designs/[id]/files
 *
 * The persistence path the old studio never had: every file the studio
 * produces lands in Supabase Storage and is indexed in design_assets.
 *
 * Body (JSON):
 * {
 *   kind: "print" | "mockup" | "artwork" | "svg-source" | "postprocessed" | "print-pdf",
 *   surface?: "Front" | "Back",
 *   dataUrl?: string,   // base64 data URL (PNG exports, artwork uploads)
 *   svgText?: string,   // raw SVG markup (kind "svg-source")
 *   filename?: string,
 *   width?: number, height?: number, printDpi?: number,
 *   provider?: string   // e.g. "fabric-postprocess"
 * }
 *
 * Print/postprocessed files also update designs.print_file_path;
 * mockups update designs.mockup_path.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const body = await req.json();
    const kind: string = body.kind;
    const surface: string | null = body.surface ?? null;

    const db = createServerClient();
    const { data: design, error: dErr } = await db
      .from("designs")
      .select("id, project_id")
      .eq("id", id)
      .single();
    if (dErr || !design) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }

    let bucket: BucketName = BUCKETS.assets;
    let ext = "png";
    let contentType = "image/png";
    let bytes: Buffer;
    let ref: string;

    if (kind === "svg-source") {
      if (typeof body.svgText !== "string" || !body.svgText.includes("<svg")) {
        return NextResponse.json({ error: "svgText with SVG markup is required" }, { status: 400 });
      }
      bucket = BUCKETS.assets;
      ext = "svg";
      contentType = "image/svg+xml";
      bytes = Buffer.from(body.svgText, "utf8");
      ref = await uploadBytes(db, bucket, `designs/${id}/source-${Date.now()}.svg`, bytes, contentType);
    } else {
      if (typeof body.dataUrl !== "string") {
        return NextResponse.json({ error: "dataUrl is required" }, { status: 400 });
      }
      const parsed = parseDataUrl(body.dataUrl);
      bytes = parsed.bytes;
      contentType = parsed.mime;
      // Storage payload verification (Sunny's verifier rules): the
      // declared format must match the file kind's production format,
      // and oversized payloads fail HERE with a named limit instead of
      // dying silently at the serverless body cap.
      const EXPECTED_MIME: Record<string, string[]> = {
        print: ["image/png"],
        postprocessed: ["image/png"],
        mockup: ["image/jpeg", "image/png"],
        "print-pdf": ["application/pdf"],
      };
      const expected = EXPECTED_MIME[kind];
      if (expected && !expected.includes(contentType)) {
        return NextResponse.json(
          { error: `Payload format anomaly: ${kind} files must be ${expected.join(" or ")}, got ${contentType}` },
          { status: 400 },
        );
      }
      const sizeMb = bytes.length / (1024 * 1024);
      const sizeCapMb = kind === "mockup" ? 4.5 : 25;
      if (sizeMb > sizeCapMb) {
        return NextResponse.json(
          { error: `Payload size ${sizeMb.toFixed(2)}MB exceeds the ${sizeCapMb}MB limit for ${kind} files` },
          { status: 413 },
        );
      }
      ext = contentType.includes("jpeg")
        ? "jpg"
        : contentType.includes("svg")
          ? "svg"
          : contentType.includes("pdf")
            ? "pdf"
            : "png";
      if (kind === "print" || kind === "postprocessed") bucket = BUCKETS.print;
      if (kind === "mockup") bucket = BUCKETS.mockups;
      const name =
        kind === "print"
          ? `print-${(surface ?? "front").toLowerCase()}`
          : kind === "print-pdf"
            ? `print-${(surface ?? "front").toLowerCase()}-pdf`
            : kind === "mockup"
            ? `mockup-${(surface ?? "front").toLowerCase()}`
            : kind === "postprocessed"
              ? `print-postprocessed-${(surface ?? "front").toLowerCase()}`
              : `artwork-${Date.now()}`;
      ref = (await uploadDataUrl(db, bucket, `designs/${id}/${name}.${ext}`, body.dataUrl)).ref;
    }

    const { data: asset, error: aErr } = await db
      .from("design_assets")
      .insert({
        tenant_id: PLATFORM_TENANT_ID,
        project_id: design.project_id ?? null,
        design_id: id,
        kind,
        surface,
        storage_path: ref.split("/").slice(1).join("/"),
        bucket,
        mime_type: contentType,
        width: body.width ?? null,
        height: body.height ?? null,
        print_dpi: body.printDpi ?? null,
        provider: body.provider ?? "studio",
        metadata: { filename: body.filename ?? null },
      })
      .select("id")
      .single();
    if (aErr) throw aErr;

    // Mirror print-ready files into the pre-existing design_files table
    // (design_id, placement, file_url, width_px, height_px, dpi, version) —
    // that is the record the order side reads. Version increments per
    // placement so re-exports supersede rather than duplicate.
    let designFileId: string | null = null;
    if (kind === "print" || kind === "postprocessed") {
      await db.from("designs").update({ print_file_path: ref }).eq("id", id);
      const placement = (surface ?? "Front").toLowerCase();
      const { count } = await db
        .from("design_files")
        .select("id", { count: "exact", head: true })
        .eq("design_id", id)
        .eq("placement", placement);
      const { data: df } = await db
        .from("design_files")
        .insert({
          design_id: id,
          placement,
          file_url: ref,
          width_px: body.width ?? null,
          height_px: body.height ?? null,
          dpi: body.printDpi ?? null,
          version: (count ?? 0) + 1,
        })
        .select("id")
        .single();
      designFileId = df?.id ?? null;
    }
    if (kind === "mockup") {
      await db.from("designs").update({ mockup_path: ref }).eq("id", id);
    }

    const url = await signedUrl(db, ref);
    return NextResponse.json({
      ok: true,
      asset_id: asset.id,
      design_file_id: designFileId,
      ref,
      url,
      bytes: bytes.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
