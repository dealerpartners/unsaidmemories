import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { quoteShipping, publicQuote, freeShippingPromo } from "@/lib/commerce/shipping";
import type { CommerceLineRef } from "@/lib/commerce/supplier-routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM_TENANT_ID = getTenantId();

// POST /api/shipping/estimates — shared shipping quote for PDP, cart, checkout.
// Body: {
//   lines: [{ product_variant_id?, supplier_catalog_variant_id?, design_publication_id?, quantity?, label? }],
//   country: "US", postal_code?: "38122"
// }
// Returns per-PACKAGE method options (each cart line ships as its own
// package), the cheapest combined total, and any unrouted labels. The
// shape is anonymous by construction: no supplier ids or names. The
// PDP calls this with a single line; checkout calls it with the cart.
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawLines: any[] = Array.isArray(body?.lines) ? body.lines : [];
  if (!rawLines.length) {
    return NextResponse.json({ error: "lines required" }, { status: 400 });
  }
  const country = String(body?.country || "US").toUpperCase();
  const lines: CommerceLineRef[] = rawLines.map((l) => ({
    product_variant_id: l.product_variant_id ?? null,
    supplier_catalog_variant_id: l.supplier_catalog_variant_id ?? null,
    design_publication_id: l.design_publication_id ?? null,
    quantity: Math.max(1, parseInt(l.quantity ?? "1", 10) || 1),
    label: l.label ?? null,
  }));

  const sb = createServerClient();
  try {
    const quote = await quoteShipping(sb, {
      tenantId: PLATFORM_TENANT_ID,
      lines,
      country,
      region: body?.region ?? null,
      postalCode: body?.postal_code ?? null,
    });
    const pub = publicQuote(quote) as any;
    const subtotal = Number(body?.subtotal);
    if (Number.isFinite(subtotal) && subtotal > 0) {
      pub.promo = await freeShippingPromo(sb, PLATFORM_TENANT_ID, subtotal, quote.cheapest_total);
    }
    return NextResponse.json(pub);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
