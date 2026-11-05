import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/customer-auth";
import { createServerClient } from "@/lib/supabase";
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/customers/me/posts — the customer's reviews & shared posts
// (ugc_posts, customer_id = auth user id). Posts wait for moderation:
// a submission lands as status "pending" and only appears publicly
// once an admin approves it ("published"); a rejection carries the
// moderator's reason back to the customer (moderation_reason).
//
// The account mockup's rule is enforced server-side: only DELIVERED
// items the customer actually bought can be reviewed — the order item
// must belong to one of their orders and that order must have a
// delivered fulfillment (or a delivered ERP shipment on its twin).

async function productNames(supabase: any, ids: string[]) {
  const names = new Map<string, string>();
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) return names;
  const { data: native } = await supabase
    .from("products")
    .select("id, name")
    .in("id", wanted);
  for (const p of native || []) names.set(p.id, p.name);
  const missing = wanted.filter((id) => !names.has(id));
  if (missing.length) {
    const { data: catalog } = await supabase
      .from("supplier_catalog_products")
      .select("id, name")
      .in("id", missing);
    for (const p of catalog || []) names.set(p.id, p.name);
  }
  return names;
}

// GET — my posts, newest first.
export async function GET() {
  try {
    const auth = await requireCustomer();
    if (auth.error) return auth.error;
    const { user } = auth;
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from("ugc_posts")
      .select(
        "id, product_id, order_item_id, rating, title, body, status, moderation_reason, published_at, created_at"
      )
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const posts = (data || []) as any[];
    const names = await productNames(
      supabase,
      posts.map((p) => p.product_id)
    );
    // Posts whose product lives in the supplier catalog store
    // product_id null (its FK covers only native products) — resolve
    // their names through the order item instead.
    const orphanItems = posts
      .filter((p) => !p.product_id && p.order_item_id)
      .map((p) => p.order_item_id);
    if (orphanItems.length) {
      const { data: items } = await supabase
        .from("order_items")
        .select(
          "id, product_variant_id, supplier_catalog_variant_id, product_variants (products (name))"
        )
        .in("id", orphanItems);
      const catalogVariantIds = [
        ...new Set(
          ((items || []) as any[])
            .map((it) => it.supplier_catalog_variant_id)
            .filter(Boolean)
        ),
      ] as string[];
      const catalogNames = new Map<string, string>();
      if (catalogVariantIds.length) {
        const { data: variants } = await supabase
          .from("supplier_catalog_variants")
          .select("id, name")
          .in("id", catalogVariantIds);
        for (const v of variants ?? []) catalogNames.set(v.id, v.name);
      }
      for (const it of (items || []) as any[]) {
        const name =
          (it.product_variants as any)?.products?.name ??
          (it.supplier_catalog_variant_id
            ? catalogNames.get(it.supplier_catalog_variant_id) ?? null
            : null);
        if (name) names.set(`item:${it.id}`, name);
      }
    }
    // The customer's questions (ugc_comments, kind = "question") ride
    // the same response — the portal shows reviews & questions together.
    const { data: questionRows } = await supabase
      .from("ugc_comments")
      .select("id, product_id, body, status, created_at")
      .eq("customer_id", user.id)
      .eq("kind", "question")
      .order("created_at", { ascending: false })
      .limit(100);
    const questions = (questionRows || []) as any[];
    const qNames = await productNames(
      supabase,
      questions.map((q) => q.product_id)
    );
    const answerCounts = new Map<string, number>();
    if (questions.length) {
      const { data: answers } = await supabase
        .from("ugc_comments")
        .select("parent_id")
        .in("parent_id", questions.map((q) => q.id))
        .eq("status", "published");
      for (const a of (answers || []) as any[]) {
        answerCounts.set(a.parent_id, (answerCounts.get(a.parent_id) || 0) + 1);
      }
    }

    return NextResponse.json({
      questions: questions.map((q) => ({
        id: q.id,
        product_id: q.product_id ?? null,
        product_name: q.product_id ? qNames.get(q.product_id) ?? null : null,
        body: q.body ?? null,
        status: q.status,
        answers: answerCounts.get(q.id) || 0,
        created_at: q.created_at,
      })),
      posts: posts.map((p) => ({
        id: p.id,
        product_id: p.product_id ?? null,
        product_name: p.product_id
          ? names.get(p.product_id) ?? null
          : p.order_item_id
            ? names.get(`item:${p.order_item_id}`) ?? null
            : null,
        order_item_id: p.order_item_id ?? null,
        rating: p.rating ?? null,
        title: p.title ?? null,
        body: p.body ?? null,
        status: p.status,
        moderation_reason: p.moderation_reason ?? null,
        published_at: p.published_at ?? null,
        created_at: p.created_at,
      })),
      total: posts.length + questions.length,
    });
  } catch (err: any) {
    console.error("[GET /api/customers/me/posts]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load posts." },
      { status: 500 }
    );
  }
}

// POST — retired. Posting happens on the product page now
// (POST /api/reviews for reviews, POST /api/product-questions for
// questions; both publish immediately). This route is read-only: the
// portal collects what the customer posted, it is not where they post.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Reviews and questions are posted from the product page — they go live right away.",
    },
    { status: 410 }
  );
}
