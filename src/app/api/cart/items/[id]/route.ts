import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM_TENANT_ID = getTenantId();

// PATCH /api/cart/items/[id] — update quantity.
// Body: { quantity }
// Petstore guard pattern: 404 if missing, 400 on invalid quantity.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const quantity = parseInt(body.quantity, 10);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return NextResponse.json({ error: "quantity must be a positive integer" }, { status: 400 });
  }

  const sb = createServerClient();
  const { data: item } = await sb.from("cart_items").select("id").eq("id", id).eq("tenant_id", PLATFORM_TENANT_ID).maybeSingle();
  if (!item) return NextResponse.json({ error: "cart item not found" }, { status: 404 });

  const { data: updated, error } = await sb.from("cart_items").update({ quantity }).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: updated });
}

// DELETE /api/cart/items/[id] — remove item from cart.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createServerClient();
  const { data: item } = await sb.from("cart_items").select("id").eq("id", id).eq("tenant_id", PLATFORM_TENANT_ID).maybeSingle();
  if (!item) return NextResponse.json({ error: "cart item not found" }, { status: 404 });

  const { error } = await sb.from("cart_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ removed: true, id });
}
