import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { resolveCartRouting, mixedSupplierCopy } from "@/lib/commerce/supplier-routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM_TENANT_ID = getTenantId();

// GET /api/cart?session_id=xxx — get active cart with items.
// Adapted from petstore order-detail pattern: single fetch with joined items.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  const customerId = req.nextUrl.searchParams.get("customer_id");
  if (!sessionId && !customerId) {
    return NextResponse.json({ error: "session_id or customer_id required" }, { status: 400 });
  }

  const sb = createServerClient();
  let q = sb.from("carts").select("*").eq("tenant_id", PLATFORM_TENANT_ID).eq("status", "active").order("created_at", { ascending: false }).limit(1);
  if (customerId) q = q.eq("customer_id", customerId);
  else q = q.eq("session_id", sessionId);

  const { data: cart, error } = await q.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!cart) return NextResponse.json({ cart: null, items: [] });

  const { data: items } = await sb.from("cart_items").select("*").eq("cart_id", cart.id).order("created_at");
  const rows = items ?? [];

  // Enrich: display label + thumbnail per line. Supplier identity is
  // resolved server-side for routing only — it never leaves this API.
  const detailLines: any[] = [];
  for (const item of rows) {
    let label: string | null = null;
    let imageUrl: string | null = null;
    if (item.supplier_catalog_variant_id) {
      const { data: v } = await sb.from("supplier_catalog_variants").select("name, supplier_catalog_product_id").eq("id", item.supplier_catalog_variant_id).maybeSingle();
      label = v?.name ?? null;
      if ((v as any)?.supplier_catalog_product_id) {
        const { data: p } = await sb.from("supplier_catalog_products").select("image_url, images").eq("id", (v as any).supplier_catalog_product_id).maybeSingle();
        const imgs: any = (p as any)?.images;
        imageUrl = (p as any)?.image_url ?? (Array.isArray(imgs) ? imgs[0] : null) ?? null;
      }
    } else if (item.product_variant_id) {
      const { data: v } = await sb.from("product_variants").select("sku, size, color, products(name)").eq("id", item.product_variant_id).maybeSingle();
      const pname = (v as any)?.products?.name ?? null;
      label = [pname, v?.size, v?.color].filter(Boolean).join(" · ") || v?.sku || null;
    }
    if (!imageUrl && item.design_publication_id) {
      const { data: pub } = await sb.from("design_publications").select("mockup_url").eq("id", item.design_publication_id).maybeSingle();
      imageUrl = (pub as any)?.mockup_url ?? null;
    }
    detailLines.push({ ...item, label: label ?? "Item", image_url: imageUrl });
  }
  const routing = await resolveCartRouting(sb, detailLines);
  const resolvedByKey = new Map(
    routing.lines.map((l) => [
      `${l.product_variant_id ?? ""}|${l.supplier_catalog_variant_id ?? ""}|${l.design_publication_id ?? ""}`,
      l,
    ])
  );
  const detailed = detailLines.map((item) => {
    const r = resolvedByKey.get(
      `${item.product_variant_id ?? ""}|${item.supplier_catalog_variant_id ?? ""}|${item.design_publication_id ?? ""}`
    );
    return {
      ...item,
      lead_time_days: r?.lead_time_days ?? null,
    };
  });
  const subtotal = Math.round(
    detailed.reduce((sum, i) => sum + Number(i.unit_price ?? 0) * i.quantity, 0) * 100
  ) / 100;

  return NextResponse.json({
    cart,
    items: rows,
    detail: {
      lines: detailed,
      subtotal,
      unrouted_count: routing.unrouted.length,
      mixed_supplier: mixedSupplierCopy(routing),
    },
  });
}

// DELETE /api/cart?session_id=xxx — clear cart (abandon).
// Petstore cancel pattern: guarded state change, never deletes rows.
export async function DELETE(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  const customerId = req.nextUrl.searchParams.get("customer_id");
  if (!sessionId && !customerId) {
    return NextResponse.json({ error: "session_id or customer_id required" }, { status: 400 });
  }

  const sb = createServerClient();
  let q = sb.from("carts").select("id").eq("tenant_id", PLATFORM_TENANT_ID).eq("status", "active").order("created_at", { ascending: false }).limit(1);
  if (customerId) q = q.eq("customer_id", customerId);
  else q = q.eq("session_id", sessionId);

  const { data: cart } = await q.maybeSingle();
  if (!cart) return NextResponse.json({ cleared: false, message: "no active cart" });

  const { error } = await sb.from("carts").update({ status: "abandoned", updated_at: new Date().toISOString() }).eq("id", cart.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cleared: true, cart_id: cart.id });
}
