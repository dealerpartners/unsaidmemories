/**
 * POST /api/admin/publish
 *
 * The publishing API — puts a product live in a category (or subcategory).
 *
 * Body:
 * {
 *   "name": "Kin Keeper Premium Tee",        // required for new products
 *   "description": "...",                    // optional (AI-generate via /api/admin/descriptions/generate)
 *   "price": 29.99,                          // optional
 *   "imageUrl": "https://...",               // optional
 *   "categoryId": "uuid",                    // publish to this category...
 *   "categorySlug": "apparel/hoodies",       // ...or resolve by slug path...
 *   "newCategory": {                         // ...or create a category inline:
 *     "name": "New Sub",                     //     then publish into it
 *     "parentId": "uuid"                     //     (or parentSlug)
 *   },
 *   "supplierCatalogProductId": "uuid",      // optional: recategorize an existing supplier product
 *   "designId": "uuid",                      // optional: link a studio design
 *   "status": "published"                    // or "draft" (default "published")
 * }
 *
 * Steps:
 *   1. Resolve the target category — by id, by slug path, or create it
 *      inline via newCategory (same rules as POST /api/admin/categories).
 *   2a. If supplierCatalogProductId is given → recategorize that supplier
 *       product (UPDATE category_id) — it renders on the category page.
 *   2b. Else → create a `products` row (admin-published) in the category.
 *   3. Optionally link a studio design via design_publications.
 *   4. Return the product URL.
 *
 * Rendering: /shop/[...slug] resolves DB categories, so the product shows
 * on the category page immediately. New categories render without a deploy.
 */

import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createServerClient, fetchCategoryByPath } from "@/lib/supabase";
import { productSlug } from "@/lib/product-slug";
import { getTenantId } from "@/lib/tenant";
import { requireAdminApi } from "@/lib/admin/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM_TENANT_ID = getTenantId();

/**
 * Categories are platform-shared (tenant_id = NULL). Match NULL only.
 */
function categoryFilter(query: any) {
  return query.is("tenant_id", null);
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "product"
  );
}

async function resolveOrCreateCategory(
  supabase: ReturnType<typeof createServerClient>,
  body: Record<string, unknown>,
): Promise<{ id: string; slug: string; name: string }> {
  // 1. Direct id.
  if (typeof body.categoryId === "string" && body.categoryId) {
    const { data, error } = await categoryFilter(
      supabase.from("categories").select("id, slug, name"),
    )
      .eq("id", body.categoryId)
      .single();
    if (error || !data) throw new Error("Category not found");
    return data;
  }

  // 2. Slug path (e.g. "apparel/hoodies-sweatshirts").
  if (typeof body.categorySlug === "string" && body.categorySlug) {
    const slugs = body.categorySlug.split("/").filter(Boolean);
    const result = await fetchCategoryByPath(slugs);
    if (!result) throw new Error(`Category path not found: ${body.categorySlug}`);
    return {
      id: result.category.id,
      slug: result.category.slug,
      name: result.category.name,
    };
  }

  // 3. Inline creation.
  const nc = body.newCategory as
    | { name?: string; parentId?: string; parentSlug?: string; description?: string }
    | undefined;
  if (nc?.name) {
    let parent: { id: string; level: number; slug: string } | null = null;
    if (nc.parentId || nc.parentSlug) {
      const q = categoryFilter(
        supabase.from("categories").select("id, level, slug"),
      );
      const { data, error } = nc.parentId
        ? await q.eq("id", nc.parentId).single()
        : await q.eq("slug", nc.parentSlug!).limit(1).maybeSingle();
      if (error || !data) throw new Error("Parent category not found");
      parent = data;
    }
    const level = parent ? parent.level + 1 : 1;
    if (level > 5) throw new Error("Category depth is limited to 5 levels");

    let slug = slugify(nc.name);
    const { data: taken } = await categoryFilter(
      supabase.from("categories").select("id"),
    )
      .eq("slug", slug)
      .limit(1);
    if (taken?.length) slug = `${slug}-${Date.now().toString(36)}`;

    const { data: created, error } = await supabase
      .from("categories")
      .insert({
        tenant_id: null, // platform-shared (matches existing catalog rows)
        parent_id: parent?.id ?? null,
        level,
        name: nc.name.trim(),
        slug,
        description: nc.description ?? null,
        is_active: true,
      })
      .select("id, slug, name")
      .single();
    if (error) throw error;
    return created;
  }

  throw new Error(
    "Provide categoryId, categorySlug, or newCategory { name, parentId? }",
  );
}

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  try {
    const supabase = createServerClient();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const status = body.status === "draft" ? "draft" : "published";

    // ── Step 1: target category ──
    const category = await resolveOrCreateCategory(supabase, body);

    // ── Step 2a: recategorize an existing supplier product ──
    if (typeof body.supplierCatalogProductId === "string" && body.supplierCatalogProductId) {
      const { data: existing, error: lookupError } = await supabase
        .from("supplier_catalog_products")
        .select("id, name")
        .eq("id", body.supplierCatalogProductId)
        .single();
      if (lookupError || !existing) {
        return NextResponse.json(
          { error: "Supplier catalog product not found" },
          { status: 404 },
        );
      }
      const { error: updateError } = await supabase
        .from("supplier_catalog_products")
        .update({ category_id: category.id })
        .eq("id", existing.id);
      if (updateError) throw updateError;

      return NextResponse.json({
        ok: true,
        action: "recategorized",
        product: { id: existing.id, name: existing.name },
        category: { id: category.id, name: category.name, slug: category.slug },
        url: `/product/${productSlug(existing.name, existing.id)}`,
      });
    }

    // ── Step 2b: create an admin-published product ──
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { error: "name is required (or supplierCatalogProductId to recategorize)" },
        { status: 400 },
      );
    }

    let slug = slugify(name);
    const { data: slugTaken } = await supabase
      .from("products")
      .select("id")
      .eq("slug", slug)
      .limit(1);
    if (slugTaken?.length) slug = `${slug}-${Date.now().toString(36)}`;

    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        id: randomUUID(), // products.id has no DB default
        tenant_id: PLATFORM_TENANT_ID,
        category_id: category.id,
        name,
        slug,
        description:
          typeof body.description === "string" ? body.description : null,
        status,
      })
      .select("id, name, slug, status")
      .single();
    if (productError) {
      return NextResponse.json(
        { error: `Product insert failed: ${productError.message}` },
        { status: 500 },
      );
    }

    // Minimal variant so the product is structurally purchasable.
    // price is NOT NULL — default to 0 when not provided.
    const price =
      typeof body.price === "number" && body.price > 0 ? body.price : 0;
    const { data: variant, error: variantError } = await supabase
      .from("product_variants")
      .insert({
        id: randomUUID(), // product_variants.id has no DB default
        tenant_id: PLATFORM_TENANT_ID,
        product_id: product.id,
        sku: `UNSAID-${product.id.slice(0, 8).toUpperCase()}`,
        price: price,
        is_active: true,
      })
      .select("id")
      .single();
    if (variantError) {
      return NextResponse.json(
        { error: `Variant insert failed: ${variantError.message}` },
        { status: 500 },
      );
    }

    // ── Step 3: link a studio design if given ──
    if (typeof body.designId === "string" && body.designId) {
      await supabase.from("design_publications").insert({
        id: randomUUID(),
        tenant_id: PLATFORM_TENANT_ID,
        design_id: body.designId,
        product_variant_id: variant.id,
        status,
        published_at: status === "published" ? new Date().toISOString() : null,
      });
    }

    return NextResponse.json({
      ok: true,
      action: "created",
      product,
      category: { id: category.id, name: category.name, slug: category.slug },
      url: `/products/${product.slug}`,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Publish failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  const gate = await requireAdminApi();
  if (gate) return gate;
  return NextResponse.json({
    endpoint: "/api/admin/publish",
    method: "POST",
    steps: [
      "1. Resolve target category: categoryId | categorySlug | newCategory { name, parentId? }",
      "2a. supplierCatalogProductId → recategorize existing supplier product",
      "2b. name (+description/price/imageUrl) → create admin product in the category",
      "3. designId (optional) → link studio design via design_publications",
      "4. Returns the product URL — renders on /shop/<category-path> immediately",
    ],
    body: {
      name: "string (required for new products)",
      description: "string (optional — generate via POST /api/admin/descriptions/generate)",
      price: "number (optional)",
      imageUrl: "string (optional)",
      categoryId: "uuid (publish to category)",
      categorySlug: "string path e.g. apparel/hoodies (publish to subcategory)",
      newCategory: "{ name, parentId?, parentSlug?, description? } (create + publish)",
      supplierCatalogProductId: "uuid (recategorize instead of create)",
      designId: "uuid (optional link)",
      status: '"published" | "draft" (default published)',
    },
  });
}
