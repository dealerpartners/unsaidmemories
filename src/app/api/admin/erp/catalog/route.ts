import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { categoryTree, listCatalogProducts, listSupplierCatalog, setProductStatus } from "@/lib/orders/erp";
import { revalidateShop } from "@/lib/admin/revalidate-shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/erp/catalog?source=storefront|supplier&categoryId=&supplierId=&q=&page=
// The catalog admin shares the public shop's category tree (same `categories`
// structure the storefront sidebar renders) — one tree, two surfaces.
export async function GET(req: NextRequest) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  const sp = req.nextUrl.searchParams;
  try {
    const [tree, result] = await Promise.all([
      categoryTree(),
      sp.get("source") === "supplier"
        ? listSupplierCatalog({ search: sp.get("q") || undefined, supplierId: sp.get("supplierId") || undefined, page: Number(sp.get("page") || 1) })
        : listCatalogProducts({ categoryId: sp.get("categoryId") || undefined, search: sp.get("q") || undefined, page: Number(sp.get("page") || 1) }),
    ]);
    return NextResponse.json({ tree, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/admin/erp/catalog { productId, status: "published"|"draft"|"archived" } — publish / hide.
export async function POST(req: NextRequest) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  const body = await req.json().catch(() => null);
  if (!body?.productId || !["published", "draft", "archived"].includes(body.status)) {
    return NextResponse.json({ error: "productId and a valid status are required" }, { status: 400 });
  }
  try {
    // Supplier-catalog products have no status column — their
    // publish/hide is the is_hidden flag the storefront reads.
    const sb = createServerClient();
    const { data: catalogRow } = await sb
      .from("supplier_catalog_products")
      .select("id")
      .eq("id", body.productId)
      .maybeSingle();
    if (catalogRow) {
      const hidden = body.status !== "published";
      const { error } = await sb
        .from("supplier_catalog_products")
        .update({ is_hidden: hidden })
        .eq("id", body.productId);
      if (error) throw new Error(error.message);
      try { revalidatePath(`/product/${body.productId}`); } catch { /* non-request context */ }
      revalidateShop();
      return NextResponse.json({ ok: true, kind: "catalog", is_hidden: hidden });
    }
    await setProductStatus(body.productId, body.status);
    revalidateShop();
    return NextResponse.json({ ok: true, kind: "storefront" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
