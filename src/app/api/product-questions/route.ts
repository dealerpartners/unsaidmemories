import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/customer-auth";
import { createServerClient } from "@/lib/supabase";
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";
import {
  displayNameFor,
  hasUgcCatalogColumn,
  resolveUgcProduct,
} from "@/lib/ugc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/product-questions — a question about a product, asked from
 * the product page's "Questions & conversation" composer.
 *
 * Sunny's model (2026-11-03): questions are asked on the PDP and are
 * LIVE immediately — no moderation, no approval. Answers are comments
 * threaded under the question (ugc_comments.parent_id); staff answers
 * carry author_role "staff". Storage is the canonical ugc_comments
 * (kind = "question"); the old self-provisioning product_questions
 * table is retired by this rewrite.
 *
 * Body: { productId, body }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireCustomer();
    if (auth.error) return auth.error;
    const { user } = auth;
    const supabase = createServerClient();
    const payload = await req.json().catch(() => null);

    const productId = String(payload?.productId || "");
    const parentId = payload?.parentId ? String(payload.parentId) : null;
    const body = payload?.body != null ? String(payload.body).trim() : "";

    if (!productId) {
      return NextResponse.json({ error: "Missing product." }, { status: 400 });
    }
    if (!body) {
      return NextResponse.json(
        { error: "Write a question or comment first." },
        { status: 400 },
      );
    }
    if (body.length > 1500) {
      return NextResponse.json({ error: "That question is too long." }, { status: 400 });
    }

    const target = await resolveUgcProduct(supabase, productId);
    if (!target) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    const insert: Record<string, any> = {
      tenant_id: PLATFORM_TENANT_ID,
      customer_id: user.id,
      author_display_name: await displayNameFor(supabase, user),
      author_role: "customer",
      kind: parentId ? "answer" : "question",
      body,
      status: "published",
    };
    if (parentId) {
      // A reply threads under its question and inherits the
      // question's product link, so the thread stays on the product
      // it was asked about. The parent must be a published question
      // on this same product.
      const { data: parent } = await supabase
        .from("ugc_comments")
        .select("id, kind, status, product_id, supplier_catalog_product_id")
        .eq("id", parentId)
        .maybeSingle();
      if (!parent || parent.kind !== "question" || parent.status !== "published") {
        return NextResponse.json({ error: "That question is no longer open." }, { status: 404 });
      }
      insert.parent_id = parent.id;
      if (parent.product_id) insert.product_id = parent.product_id;
      if (parent.supplier_catalog_product_id) {
        insert.supplier_catalog_product_id = parent.supplier_catalog_product_id;
      }
    } else if (target.kind === "native") {
      insert.product_id = target.id;
    } else {
      if (!(await hasUgcCatalogColumn(supabase))) {
        return NextResponse.json(
          {
            error:
              "Questions for this item switch on with one small catalog-link step that's prepared and waiting for approval.",
          },
          { status: 501 },
        );
      }
      insert.supplier_catalog_product_id = target.id;
    }

    const { data, error } = await supabase
      .from("ugc_comments")
      .insert(insert)
      .select("id, author_display_name, body, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (parentId) {
      return NextResponse.json({
        ok: true,
        answer: {
          id: data.id,
          author: data.author_display_name,
          role: "customer",
          body: data.body,
          createdAt: data.created_at,
        },
      });
    }
    return NextResponse.json({
      ok: true,
      question: {
        id: data.id,
        author: data.author_display_name,
        body: data.body,
        createdAt: data.created_at,
        answers: [],
      },
    });
  } catch (err: any) {
    console.error("[POST /api/product-questions]", err);
    return NextResponse.json(
      { error: err?.message || "Your message couldn't be sent." },
      { status: 500 },
    );
  }
}
