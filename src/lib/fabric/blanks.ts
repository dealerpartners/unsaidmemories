/**
 * Blanks — the POD spine reads for the admin Catalog surfaces
 * (Sunny's POD Rendering & Publish Play, slice 2).
 *
 * A blank is a canonical product. Its readiness is computed from what
 * the database actually holds: persisted assets with a supplier-measured
 * print-area box, and test renders the worker has executed. Nothing
 * here invents state — a blank with no box is "Missing assets", a box
 * without a test render is "Ready for test", a rendered test is
 * "Test rendered", and only an approved blank is render_ready.
 */
import { createServerClient } from "@/lib/supabase";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";

export function renderAssetUrl(storagePath: string | null): string | null {
  if (!storagePath) return null;
  if (storagePath.startsWith("http")) return storagePath;
  return `${SUPABASE_URL}/storage/v1/object/public/renders/${storagePath}`;
}

/** The standard graphic every Test Render uses (stored fixture). */
export const TEST_ARTWORK_REF = "renders:test/test-artwork.png";

export type BlankReadiness =
  | "missing-assets"
  | "ready-for-test"
  | "test-rendered"
  | "render-ready";

export interface BlankRow {
  id: string;
  sku_slug: string;
  name: string;
  lifecycle: string;
  visibility: string;
  render_ready: boolean;
  viewsWithBox: string[];
  assetCount: number;
  testRenders: number;
  readiness: BlankReadiness;
}

interface AssetRow {
  view: string;
  kind: string;
  box_w_in: number | null;
  verified: boolean | null;
}

function readinessOf(
  renderReady: boolean,
  viewsWithBox: string[],
  testRenders: number
): BlankReadiness {
  if (renderReady) return "render-ready";
  if (testRenders > 0) return "test-rendered";
  if (viewsWithBox.length > 0) return "ready-for-test";
  return "missing-assets";
}

export async function listBlanks(): Promise<BlankRow[]> {
  const sb = createServerClient();
  const { data: blanks } = await sb
    .from("canonical_products")
    .select("id, sku_slug, name, lifecycle, visibility, render_ready")
    .order("name");
  if (!blanks) return [];
  const { data: assets } = await sb
    .from("blank_assets")
    .select("blank_id, view, kind, box_w_in, verified");
  const { data: renders } = await sb
    .from("renders")
    .select("blank_id, status, purpose")
    .eq("purpose", "test")
    .eq("status", "rendered");
  const byBlank = new Map<string, { views: Set<string>; count: number; tests: number }>();
  for (const b of blanks) byBlank.set(b.id, { views: new Set(), count: 0, tests: 0 });
  for (const a of (assets ?? []) as Array<AssetRow & { blank_id: string }>) {
    const e = byBlank.get(a.blank_id);
    if (!e) continue;
    e.count++;
    if (a.kind === "shading" && a.box_w_in != null) e.views.add(a.view);
  }
  for (const r of (renders ?? []) as Array<{ blank_id: string }>) {
    const e = byBlank.get(r.blank_id);
    if (e) e.tests++;
  }
  return blanks.map((b) => {
    const e = byBlank.get(b.id) ?? { views: new Set<string>(), count: 0, tests: 0 };
    return {
      id: b.id,
      sku_slug: b.sku_slug,
      name: b.name,
      lifecycle: b.lifecycle,
      visibility: b.visibility,
      render_ready: !!b.render_ready,
      viewsWithBox: [...e.views],
      assetCount: e.count,
      testRenders: e.tests,
      readiness: readinessOf(!!b.render_ready, [...e.views], e.tests),
    };
  });
}

export interface BlankWorkspace {
  blank: {
    id: string;
    sku_slug: string;
    name: string;
    lifecycle: string;
    visibility: string;
    render_ready: boolean;
  };
  assets: Array<{
    id: string;
    view: string;
    kind: string;
    source: string;
    storage_path: string | null;
    url: string | null;
    width: number | null;
    height: number | null;
    px_per_inch: number | null;
    box: { xIn: number; yIn: number; wIn: number; hIn: number } | null;
    verified: boolean;
  }>;
  suppliers: Array<{ name: string; supplier: string; variants: number }>;
  renders: Array<{
    id: string;
    view: string;
    color: string | null;
    status: string;
    purpose: string;
    url: string | null;
    created_at: string;
  }>;
  designs: Array<{ id: string; name: string; status: string }>;
  readiness: BlankReadiness;
}

export async function getBlankWorkspace(id: string): Promise<BlankWorkspace | null> {
  const sb = createServerClient();
  const { data: blank } = await sb
    .from("canonical_products")
    .select("id, sku_slug, name, lifecycle, visibility, render_ready")
    .eq("id", id)
    .single();
  if (!blank) return null;
  const { data: assets } = await sb
    .from("blank_assets")
    .select("id, view, kind, source, storage_path, width, height, px_per_inch, box_x_in, box_y_in, box_w_in, box_h_in, verified")
    .eq("blank_id", id)
    .order("view")
    .order("kind");
  const { data: products } = await sb
    .from("supplier_catalog_products")
    .select("id, name, supplier_id")
    .eq("canonical_product_id", id);
  const supplierNames = new Map<string, string>();
  if (products?.length) {
    const { data: sups } = await sb
      .from("suppliers")
      .select("id, name")
      .in("id", [...new Set(products.map((p) => p.supplier_id))]);
    for (const s of sups ?? []) supplierNames.set(s.id, s.name);
  }
  const suppliers: BlankWorkspace["suppliers"] = [];
  for (const p of products ?? []) {
    const { count } = await sb
      .from("supplier_catalog_variants")
      .select("id", { count: "exact", head: true })
      .eq("supplier_catalog_product_id", p.id);
    suppliers.push({ name: p.name, supplier: supplierNames.get(p.supplier_id) ?? "", variants: count ?? 0 });
  }
  const { data: renders } = await sb
    .from("renders")
    .select("id, view, color, status, purpose, storage_path, created_at")
    .eq("blank_id", id)
    .order("created_at", { ascending: false })
    .limit(24);
  const assetList = (assets ?? []).map((a) => ({
    id: a.id,
    view: a.view,
    kind: a.kind,
    source: a.source,
    storage_path: a.storage_path,
    url: renderAssetUrl(a.storage_path),
    width: a.width,
    height: a.height,
    px_per_inch: a.px_per_inch != null ? Number(a.px_per_inch) : null,
    box:
      a.box_w_in != null
        ? {
            xIn: Number(a.box_x_in),
            yIn: Number(a.box_y_in),
            wIn: Number(a.box_w_in),
            hIn: Number(a.box_h_in),
          }
        : null,
    verified: !!a.verified,
  }));
  const renderList = (renders ?? []).map((r) => ({
    id: r.id,
    view: r.view,
    color: r.color,
    status: r.status,
    purpose: r.purpose,
    url: renderAssetUrl(r.storage_path),
    created_at: r.created_at,
  }));
  const { data: designs } = await sb
    .from("designs")
    .select("id, name, status")
    .order("created_at", { ascending: false })
    .limit(50);
  const viewsWithBox = assetList.filter((a) => a.kind === "shading" && a.box).map((a) => a.view);
  const testRenders = renderList.filter((r) => r.purpose === "test" && r.status === "rendered").length;
  return {
    blank: { ...blank, render_ready: !!blank.render_ready },
    assets: assetList,
    suppliers,
    renders: renderList,
    designs: (designs ?? []).map((d) => ({ id: d.id, name: d.name, status: d.status })),
    readiness: readinessOf(!!blank.render_ready, viewsWithBox, testRenders),
  };
}
