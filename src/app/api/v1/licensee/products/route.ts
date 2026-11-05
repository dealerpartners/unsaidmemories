import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { authenticateLicensee } from "@/lib/licensee/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — finished products for designing an ad in the Ad Center.
// FINISHED ONLY (is_hidden = false): the product itself is designed in
// this studio; the licensee side only picks a finished product to
// feature. ?q= matches names, ?limit= (max 100), ?offset=.
export async function GET(req: Request) {
  const auth = await authenticateLicensee(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  const totalRows = await pgQueryStrict<{ n: string }>(
    `SELECT count(*)::text AS n FROM public.supplier_catalog_products
      WHERE is_hidden = false AND ($1 = '' OR name ILIKE '%' || $1 || '%')`,
    [q],
  );
  const rows = await pgQueryStrict(
    `SELECT id::text AS id, name, slug, brand_name, image_url, variant_count
       FROM public.supplier_catalog_products
      WHERE is_hidden = false AND ($1 = '' OR name ILIKE '%' || $1 || '%')
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
    [q, limit, offset],
  );
  return NextResponse.json({
    products: rows,
    total: Number(totalRows[0]?.n ?? 0),
    limit,
    offset,
  });
}
