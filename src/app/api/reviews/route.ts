import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/customer-auth";
import { createServerClient } from "@/lib/supabase";
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";
import {
  displayNameFor,
  hasUgcCatalogColumn,
  resolveUgcProduct,
  verifiedPurchase,
} from "@/lib/ugc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/reviews — a product review, posted from the product page.
 *
 * Sunny's model (2026-11-03): reviews are written on the PDP and go
 * LIVE immediately — no moderation, no purchase gate. The author is
 * the signed-in customer's display name, derived server-side (never
 * client-supplied, never an email). Storage is the canonical
 * ugc_posts; verified purchase is a computed badge.
 *
 * Body: { productId, rating, title?, body }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireCustomer();
    if (auth.error) return auth.error;
    const { user } = auth;
    const supabase = createServerClient();
    const payload = await req.json().catch(() => null);

    const productId = String(payload?.productId || "");
    const rating = payload?.rating != null ? Math.round(Number(payload.rating)) : null;
    const title =
      payload?.title != null ? String(payload.title).trim().slice(0, 120) : null;
    const body = payload?.body != null ? String(payload.body).trim() : "";

    if (!productId) {
      return NextResponse.json({ error: "Missing product." }, { status: 400 });
    }
    if (rating == null || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Please choose a rating." }, { status: 400 });
    }
    if (body.length < 10) {
      return NextResponse.json(
        { error: "Please write a few words (at least 10 characters)." },
        { status: 400 },
      );
    }
    if (body.length > 2000) {
      return NextResponse.json({ error: "That review is too long." }, { status: 400 });
    }

    const target = await resolveUgcProduct(supabase, productId);
    if (!target) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const insert: Record<string, any> = {
      tenant_id: PLATFORM_TENANT_ID,
      customer_id: user.id,
      author_display_name: await displayNameFor(supabase, user),
      rating,
      title: title || null,
      body,
      is_verified_purchase: await verifiedPurchase(supabase, user.id, target),
      status: "published",
      published_at: new Date().toISOString(),
    };
    if (target.kind === "native") {
      insert.product_id = target.id;
    } else {
      if (!(await hasUgcCatalogColumn(supabase))) {
        return NextResponse.json(
          {
            error:
              "Reviews for this item switch on with one small catalog-link step that's prepared and waiting for approval.",
          },
          { status: 501 },
        );
      }
      insert.supplier_catalog_product_id = target.id;
    }

    const { data, error } = await supabase
      .from("ugc_posts")
      .insert(insert)
      .select("id, author_display_name, rating, title, body, is_verified_purchase, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      review: {
        id: data.id,
        author: data.author_display_name,
        rating: data.rating,
        title: data.title ?? null,
        body: data.body ?? null,
        createdAt: data.created_at,
        verified: !!data.is_verified_purchase,
      },
    });
  } catch (err: any) {
    console.error("[POST /api/reviews]", err);
    return NextResponse.json(
      { error: err?.message || "Your review couldn't be saved." },
      { status: 500 },
    );
  }
}
