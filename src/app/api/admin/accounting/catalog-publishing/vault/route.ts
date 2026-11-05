import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";
import { createServerClient } from "@/lib/supabase";
import { signedUrl } from "@/lib/fabric/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/catalog-publishing/vault
//
// CAD Spec Vault — the read side. There are no CAD files anywhere in
// this data (no DXF/STEP/DWG has ever been uploaded); what exists is
// the print-spec files of record, and that is what this endpoint
// serves, labeled as what they are:
//   - design_files  — print-ready files of record (placement,
//     dimensions, DPI, version; file_url is a storage ref or URL)
//   - design_assets — every file the studio produced or ingested for
//     the design (print / mockup / artwork / svg-source / inspiration
//     / post-processed), binaries in Supabase Storage.
// Signed URLs are minted server-side through the studio's existing
// signing path (src/lib/fabric/storage.ts). Read-only: no writes.

// design_files.file_url rows written by the current studio code hold
// a `bucket/path` ref; the pre-existing records point into the one
// live bucket, `design-files`. Resolve either shape to a usable URL.
async function resolveSpecFileUrl(
  db: ReturnType<typeof createServerClient>,
  raw: string | null,
): Promise<string | null> {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const ref = raw.includes("/") && !raw.startsWith("/")
    ? raw
    : `design-files/${raw.replace(/^\//, "")}`;
  return signedUrl(db, ref);
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);

    const designRows = await pgQuery<{
      id: string; name: string | null; status: string | null;
    }>(
      `SELECT d.id::text AS id,
              COALESCE(d.product_title, d.name) AS name,
              d.status
         FROM public.designs d
        WHERE d.tenant_id = $1 AND COALESCE(d.status, 'draft') <> 'archived'
        ORDER BY d.updated_at DESC NULLS LAST
        LIMIT 500`,
      [tenant],
    );

    const specRows = await pgQuery<{
      id: string; design_id: string; placement: string | null;
      file_url: string | null; width_px: number | null; height_px: number | null;
      dpi: number | null; version: number | null; created_at: string | null;
    }>(
      `SELECT df.id::text AS id, df.design_id::text AS design_id,
              df.placement, df.file_url, df.width_px, df.height_px,
              df.dpi, df.version, df.created_at::text AS created_at
         FROM public.design_files df
         JOIN public.designs d ON d.id = df.design_id
        WHERE d.tenant_id = $1 AND COALESCE(d.status, 'draft') <> 'archived'
        ORDER BY df.version DESC NULLS LAST, df.created_at DESC`,
      [tenant],
    );

    const assetRows = await pgQuery<{
      id: string; design_id: string; kind: string; surface: string | null;
      storage_path: string; bucket: string; mime_type: string | null;
      width: number | null; height: number | null; print_dpi: number | null;
      provider: string | null; created_at: string | null;
    }>(
      `SELECT da.id::text AS id, da.design_id::text AS design_id,
              da.kind, da.surface, da.storage_path, da.bucket,
              da.mime_type, da.width, da.height, da.print_dpi,
              da.provider, da.created_at::text AS created_at
         FROM public.design_assets da
         JOIN public.designs d ON d.id = da.design_id
        WHERE d.tenant_id = $1 AND COALESCE(d.status, 'draft') <> 'archived'
        ORDER BY da.created_at DESC`,
      [tenant],
    );

    const db = createServerClient();

    const specByDesign = new Map<string, any[]>();
    for (const r of specRows) {
      const url = await resolveSpecFileUrl(db, r.file_url);
      const list = specByDesign.get(r.design_id) ?? [];
      list.push({
        id: r.id,
        placement: r.placement,
        widthPx: r.width_px,
        heightPx: r.height_px,
        dpi: r.dpi,
        version: r.version,
        createdAt: r.created_at,
        url,
      });
      specByDesign.set(r.design_id, list);
    }

    const assetsByDesign = new Map<string, any[]>();
    for (const r of assetRows) {
      const url = await signedUrl(db, `${r.bucket}/${r.storage_path}`);
      const list = assetsByDesign.get(r.design_id) ?? [];
      list.push({
        id: r.id,
        kind: r.kind,
        surface: r.surface,
        mimeType: r.mime_type,
        width: r.width,
        height: r.height,
        printDpi: r.print_dpi,
        provider: r.provider,
        createdAt: r.created_at,
        fileName: r.storage_path.split("/").pop() ?? r.storage_path,
        url,
      });
      assetsByDesign.set(r.design_id, list);
    }

    const designs = designRows.map((d) => ({
      id: d.id,
      name: d.name || "Untitled design",
      status: d.status || "draft",
      printFiles: specByDesign.get(d.id) ?? [],
      assets: assetsByDesign.get(d.id) ?? [],
    }));

    return NextResponse.json({
      designs,
      totals: {
        designs: designs.length,
        printFiles: specRows.length,
        assets: assetRows.length,
      },
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/catalog-publishing/vault]", e);
    return NextResponse.json({ error: e?.message || "Failed to load the spec vault" }, { status: 500 });
  }
}
