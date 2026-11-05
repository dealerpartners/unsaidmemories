import { NextRequest, NextResponse } from "next/server";
import { getReachablePgPool } from "@/lib/pg-ctor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/ensure-indexes — idempotent provisioning of the catalog's
 * hot-path indexes over the Supabase pooler (the same pooled-DDL technique
 * as /api/product-questions' table self-provision).
 *
 * WHY THIS EXISTS: a single `.eq('supplier_catalog_product_id', id)` count on
 * the 177k-row supplier_catalog_variants table measured 8.9s — a full table
 * scan on every PDP render, repeated per leg (variants → fallback batch →
 * recommendations enrichment → picks enrichment), which is what turned the
 * product page into a multi-minute load. One btree on the FK column makes
 * every one of those queries an index probe.
 *
 * Connection discovery lives in @/lib/pg-ctor (the configured pooler
 * hostname is stale/unresolvable — corrected candidates are tried in order
 * and the first that completes a handshake runs the DDL).
 *
 * Guarded: the caller must present the Supabase service-role key as a Bearer
 * token. Unknown callers get 401 — the statements are idempotent, but DDL is
 * not a public surface.
 *
 * Every statement is CREATE INDEX IF NOT EXISTS — calling this on an already
 * indexed database is a no-op (best case: a few catalog lookups per statement).
 */
const INDEX_STATEMENTS: { name: string; sql: string; why: string }[] = [
  {
    name: "idx_sc_variants_product_id",
    sql: "CREATE INDEX IF NOT EXISTS idx_sc_variants_product_id ON public.supplier_catalog_variants (supplier_catalog_product_id)",
    why: "PDP variants + grid pricing batch (.in) + rail enrichment — the 8.9s full-scan offender",
  },
  {
    name: "idx_sc_products_category_id",
    sql: "CREATE INDEX IF NOT EXISTS idx_sc_products_category_id ON public.supplier_catalog_products (category_id)",
    why: "department/category pages and PDP same-category recommendations",
  },
  {
    name: "idx_sc_products_image_url",
    sql: "CREATE INDEX IF NOT EXISTS idx_sc_products_image_url ON public.supplier_catalog_products (image_url DESC NULLS LAST)",
    why: "shop grid ORDER BY image_url — index scan instead of scan+sort",
  },
  {
    name: "idx_product_reviews_product_id",
    sql: "CREATE INDEX IF NOT EXISTS idx_product_reviews_product_id ON public.product_reviews (product_id)",
    why: "PDP published-reviews query",
  },
];

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let reachable: Awaited<ReturnType<typeof getReachablePgPool>>;
  try {
    reachable = await getReachablePgPool();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[ensure-indexes] pg driver failed:", detail);
    return NextResponse.json(
      { error: "pg driver failed.", pgError: detail },
      { status: 500 },
    );
  }

  if (!reachable.pool) {
    return NextResponse.json(
      {
        error: "No candidate database connection was reachable.",
        attempts: reachable.attempts,
      },
      { status: 503 },
    );
  }

  const results: { name: string; ok: boolean; detail: string }[] = [];
  try {
    for (const item of INDEX_STATEMENTS) {
      try {
        await reachable.pool.query(item.sql);
        results.push({ name: item.name, ok: true, detail: "present" });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error(`[ensure-indexes] ${item.name} failed:`, detail);
        results.push({ name: item.name, ok: false, detail });
      }
    }
  } finally {
    await reachable.pool.end().catch(() => {});
  }

  const allOk = results.every((r) => r.ok);
  return NextResponse.json(
    {
      ok: allOk,
      connection: reachable.label,
      attempts: reachable.attempts,
      results,
    },
    { status: allOk ? 200 : 500 },
  );
}

/** GET — a harmless status probe so the endpoint is introspectable. */
export async function GET() {
  return NextResponse.json({
    endpoint: "ensure-indexes",
    method: "POST (service-role bearer required)",
    indexes: INDEX_STATEMENTS.map((i) => ({ name: i.name, why: i.why })),
  });
}
