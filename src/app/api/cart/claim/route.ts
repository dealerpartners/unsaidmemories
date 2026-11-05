import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/customer-auth";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM_TENANT_ID = getTenantId();

// POST /api/cart/claim — attach the guest (session) cart to the
// signed-in customer. Body: { session_id }
//
// Why this exists: carts live in the database, keyed by customer id
// for signed-in shoppers and by a browser session id for guests
// (the session id itself is kept in localStorage). Without a claim,
// a guest who fills a bag and then signs in would face an empty
// customer cart at checkout — the bag would look lost even though
// every row still exists. The account flyout calls this right after
// a successful sign-in, so signing in never costs anyone their bag.
export async function POST(req: NextRequest) {
  const auth = await requireCustomer();
  if (auth.error) return auth.error;
  const { user } = auth;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const sessionId = String(body?.session_id || "").trim();
  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const sb = createServerClient();

  const { data: guestCart } = await sb
    .from("carts")
    .select("id")
    .eq("tenant_id", PLATFORM_TENANT_ID)
    .eq("status", "active")
    .eq("session_id", sessionId)
    .is("customer_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!guestCart) {
    return NextResponse.json({ claimed: false, reason: "no guest cart to claim" });
  }

  const { data: guestItems } = await sb
    .from("cart_items")
    .select("id, product_variant_id, supplier_catalog_variant_id, design_publication_id, quantity, unit_price")
    .eq("cart_id", guestCart.id);
  if (!guestItems?.length) {
    return NextResponse.json({ claimed: false, reason: "guest cart is empty" });
  }

  const { data: customerCart } = await sb
    .from("carts")
    .select("id")
    .eq("tenant_id", PLATFORM_TENANT_ID)
    .eq("status", "active")
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // No customer cart yet — the guest cart simply becomes theirs.
  if (!customerCart) {
    const { error } = await sb
      .from("carts")
      .update({ customer_id: user.id, session_id: null })
      .eq("id", guestCart.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ claimed: true, merged: false, items: guestItems.length });
  }

  // Both exist — merge line by line (same variant = quantity sum),
  // then retire the guest cart.
  const { data: existingItems } = await sb
    .from("cart_items")
    .select("id, product_variant_id, supplier_catalog_variant_id, design_publication_id, quantity")
    .eq("cart_id", customerCart.id);
  const keyOf = (i: any) =>
    `${i.product_variant_id ?? ""}|${i.supplier_catalog_variant_id ?? ""}|${i.design_publication_id ?? ""}`;
  const existingByKey = new Map((existingItems ?? []).map((i: any) => [keyOf(i), i]));

  for (const item of guestItems) {
    const match = existingByKey.get(keyOf(item));
    if (match) {
      await sb
        .from("cart_items")
        .update({ quantity: Number(match.quantity) + Number(item.quantity) })
        .eq("id", match.id);
    } else {
      await sb.from("cart_items").insert({
        cart_id: customerCart.id,
        tenant_id: PLATFORM_TENANT_ID,
        product_variant_id: item.product_variant_id,
        supplier_catalog_variant_id: item.supplier_catalog_variant_id,
        design_publication_id: item.design_publication_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
      });
    }
  }
  await sb.from("cart_items").delete().eq("cart_id", guestCart.id);
  await sb.from("carts").update({ status: "abandoned" }).eq("id", guestCart.id);

  return NextResponse.json({ claimed: true, merged: true, items: guestItems.length });
}
