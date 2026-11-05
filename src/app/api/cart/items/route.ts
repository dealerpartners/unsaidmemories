import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM_TENANT_ID = getTenantId();

// POST /api/cart/items — add item to cart (creates cart if none active).
// Body: { session_id?, customer_id?, product_variant_id?, supplier_catalog_variant_id?, design_publication_id?, quantity?, unit_price? }
// Petstore checkout pattern: validate inputs early, fail fast on bad data.
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { session_id, customer_id, product_variant_id, supplier_catalog_variant_id, design_publication_id } = body;
  const supplier_catalog_product_id = body.supplier_catalog_product_id ?? body.supplier_product_id;
  const quantity = Math.max(1, parseInt(body.quantity ?? "1", 10) || 1);
  if (!session_id && !customer_id) {
    return NextResponse.json({ error: "session_id or customer_id required" }, { status: 400 });
  }
  if (!product_variant_id && !supplier_catalog_variant_id && !design_publication_id && !supplier_catalog_product_id) {
    return NextResponse.json({ error: "product_variant_id, supplier_catalog_variant_id, supplier_catalog_product_id, or design_publication_id required" }, { status: 400 });
  }

  const sb = createServerClient();

  // If a product ID was passed (no variant), resolve a variant of the
  // product: the shopper's chosen size when one was sent, otherwise the
  // first available (cheapest) variant.
  let resolvedVariantId = supplier_catalog_variant_id;
  if (!resolvedVariantId && !product_variant_id && !design_publication_id && supplier_catalog_product_id) {
    const wantedSize = typeof body.size === "string" && body.size.trim() ? body.size.trim() : null;
    let firstVariant: { id: string } | null = null;
    if (wantedSize) {
      const { data } = await sb
        .from("supplier_catalog_variants")
        .select("id, price_snapshot")
        .eq("supplier_catalog_product_id", supplier_catalog_product_id)
        .eq("size", wantedSize)
        .order("price_snapshot", { ascending: true })
        .limit(1)
        .maybeSingle();
      firstVariant = data;
    }
    if (!firstVariant) {
      const { data } = await sb
        .from("supplier_catalog_variants")
        .select("id, price_snapshot")
        .eq("supplier_catalog_product_id", supplier_catalog_product_id)
        .order("price_snapshot", { ascending: true })
        .limit(1)
        .maybeSingle();
      firstVariant = data;
    }
    if (!firstVariant) {
      return NextResponse.json({ error: "no variants found for this product" }, { status: 404 });
    }
    resolvedVariantId = firstVariant.id;
  }

  // Resolve price from DB — never trust client amounts (petstore money-as-numbers discipline).
  let unitPrice: number | null = null;
  if (resolvedVariantId) {
    const { data: v } = await sb.from("supplier_catalog_variants").select("price_snapshot").eq("id", resolvedVariantId).maybeSingle();
    if (!v) return NextResponse.json({ error: "variant not found" }, { status: 404 });
    unitPrice = v.price_snapshot != null ? Number(v.price_snapshot) : null;
    if (unitPrice == null) return NextResponse.json({ error: "variant has no price" }, { status: 400 });
  } else if (product_variant_id) {
    const { data: v } = await sb.from("product_variants").select("price").eq("id", product_variant_id).maybeSingle();
    if (!v) return NextResponse.json({ error: "variant not found" }, { status: 404 });
    unitPrice = v.price != null ? Number(v.price) : null;
  }

  // Find or create active cart.
  let q = sb.from("carts").select("id").eq("tenant_id", PLATFORM_TENANT_ID).eq("status", "active").order("created_at", { ascending: false }).limit(1);
  if (customer_id) q = q.eq("customer_id", customer_id);
  else q = q.eq("session_id", session_id);
  let { data: cart } = await q.maybeSingle();

  if (!cart) {
    const { data: created, error: ce } = await sb.from("carts").insert({
      tenant_id: PLATFORM_TENANT_ID,
      customer_id: customer_id ?? null,
      session_id: session_id ?? null,
      status: "active",
    }).select("id").single();
    if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });
    cart = created;
  }

  // Upsert: bump quantity if same variant already in cart.
  const match: any = { cart_id: cart.id, tenant_id: PLATFORM_TENANT_ID };
  if (product_variant_id) match.product_variant_id = product_variant_id;
  if (resolvedVariantId) match.supplier_catalog_variant_id = resolvedVariantId;
  if (design_publication_id) match.design_publication_id = design_publication_id;

  const { data: existing } = await sb.from("cart_items").select("id, quantity").match(match).maybeSingle();
  if (existing) {
    const { data: updated, error } = await sb.from("cart_items")
      .update({ quantity: existing.quantity + quantity })
      .eq("id", existing.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: updated, cart_id: cart.id });
  }

  const { data: item, error } = await sb.from("cart_items").insert({
    ...match,
    quantity,
    unit_price: unitPrice,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item, cart_id: cart.id }, { status: 201 });
}
