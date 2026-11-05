import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/customer-auth";
import { createServerClient } from "@/lib/supabase";
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";
import { resolvePartyCustomerId } from "@/lib/customers/party";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/customers/me/wishlist — the customer's Saved list.
// customer_wishlist_items.customer_id carries a FOREIGN KEY into
// crm_customers, so rows are keyed by the canonical party record
// (lib/customers/party resolves the session to it, creating the
// minimal row on first use). product_id has no FK and may reference
// either product universe — the native `products` rows or the
// supplier catalog — so reads resolve against both and answer with
// whichever owns the id.

async function resolveProducts(supabase: any, ids: string[]) {
  const found = new Map<string, any>();
  if (!ids.length) return found;
  // The catalog universe wins where an id exists in both tables (a
  // published product shares its id with its catalog row — the
  // catalog row carries the imagery). Native rows fill the rest.
  const { data: catalog } = await supabase
    .from("supplier_catalog_products")
    .select("id, name, slug, image_url, images")
    .in("id", ids);
  for (const p of catalog || []) {
    const images = Array.isArray(p.images) ? p.images : [];
    const first =
      images.find((x: any) => typeof x === "string") ||
      images.find((x: any) => x?.url)?.url ||
      null;
    found.set(p.id, {
      name: p.name,
      slug: p.slug,
      image_url: p.image_url || first,
      // No customer price here on purpose: the catalog's stored
      // variant price is supplier COST, and the selling price is
      // computed on the product page (landed-cost + margin). The
      // card links there rather than printing a wrong number; the
      // stored retail price from the catalog reprice will fill this.
      price: null as number | null,
      catalog: true,
    });
  }
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    const { data: native } = await supabase
      .from("products")
      .select("id, name, slug")
      .in("id", missing);
    for (const p of native || []) {
      found.set(p.id, {
        name: p.name,
        slug: p.slug,
        image_url: null as string | null,
        price: null as number | null,
        catalog: false,
      });
    }
    // Native listing prices ARE customer-facing (product_variants).
    const nativeIds = (native || []).map((p: any) => p.id);
    if (nativeIds.length) {
      const { data: variants } = await supabase
        .from("product_variants")
        .select("product_id, price")
        .in("product_id", nativeIds);
      for (const v of variants || []) {
        const entry = found.get(v.product_id);
        const price = Number((v as any).price);
        if (entry && Number.isFinite(price) && price > 0) {
          entry.price = entry.price == null ? price : Math.min(entry.price, price);
        }
      }
    }
  }
  return found;
}

// GET — my saved items, newest first.
export async function GET() {
  try {
    const auth = await requireCustomer();
    if (auth.error) return auth.error;
    const { user } = auth;
    const supabase = createServerClient();
    const partyId = await resolvePartyCustomerId(supabase, user);
    if (!partyId) {
      return NextResponse.json(
        { error: "Could not resolve your customer record." },
        { status: 500 }
      );
    }

    const { data: rows, error } = await supabase
      .from("customer_wishlist_items")
      .select("id, product_id, created_at")
      .eq("customer_id", partyId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const list = (rows || []) as any[];
    const resolved = await resolveProducts(
      supabase,
      list.map((r) => String(r.product_id))
    );
    const items = list.map((r) => {
      const p = resolved.get(String(r.product_id));
      return {
        id: r.id,
        product_id: r.product_id,
        name: p?.name ?? null,
        slug: p?.slug ?? null,
        image_url: p?.image_url ?? null,
        price: p?.price ?? null,
        created_at: r.created_at,
      };
    });
    return NextResponse.json({ items, total: items.length });
  } catch (err: any) {
    console.error("[GET /api/customers/me/wishlist]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load saved items." },
      { status: 500 }
    );
  }
}

// POST { product_id } — save a product (idempotent).
export async function POST(req: NextRequest) {
  try {
    const auth = await requireCustomer();
    if (auth.error) return auth.error;
    const { user } = auth;
    const supabase = createServerClient();
    const body = await req.json().catch(() => null);
    const productId = String(body?.product_id || "");
    if (!productId) {
      return NextResponse.json({ error: "product_id is required." }, { status: 400 });
    }
    const resolved = await resolveProducts(supabase, [productId]);
    if (!resolved.has(productId)) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }
    const partyId = await resolvePartyCustomerId(supabase, user);
    if (!partyId) {
      return NextResponse.json(
        { error: "Could not resolve your customer record." },
        { status: 500 }
      );
    }
    const { data: existing } = await supabase
      .from("customer_wishlist_items")
      .select("id")
      .eq("customer_id", partyId)
      .eq("product_id", productId)
      .limit(1);
    if (existing?.length) {
      return NextResponse.json({ ok: true, already: true });
    }
    const { error } = await supabase.from("customer_wishlist_items").insert({
      tenant_id: PLATFORM_TENANT_ID,
      customer_id: partyId,
      product_id: productId,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[POST /api/customers/me/wishlist]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to save item." },
      { status: 500 }
    );
  }
}

// DELETE ?product_id= — remove from Saved.
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireCustomer();
    if (auth.error) return auth.error;
    const { user } = auth;
    const supabase = createServerClient();
    const productId = req.nextUrl.searchParams.get("product_id") || "";
    if (!productId) {
      return NextResponse.json({ error: "product_id is required." }, { status: 400 });
    }
    const partyId = await resolvePartyCustomerId(supabase, user);
    if (!partyId) {
      return NextResponse.json(
        { error: "Could not resolve your customer record." },
        { status: 500 }
      );
    }
    const { error } = await supabase
      .from("customer_wishlist_items")
      .delete()
      .eq("customer_id", partyId)
      .eq("product_id", productId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[DELETE /api/customers/me/wishlist]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to remove item." },
      { status: 500 }
    );
  }
}
