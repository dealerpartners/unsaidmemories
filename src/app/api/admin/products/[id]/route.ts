import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { revalidateShop } from "@/lib/admin/revalidate-shop"
import {
  updateCatalogProduct,
  deleteCatalogProduct,
  type CatalogProductInput,
} from "@/lib/enterprise/catalog"

// ============================================================================
// /api/admin/products/[id] — admin-gated PATCH + DELETE for a single catalog
// product. Writes across the NORMALIZED schema (erp_products +
// erp_product_skus + commerce_catalog_items + commerce_prices +
// commerce_product_media). The `id` is the commerce_catalog_items.id (uuid).
// ============================================================================

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function parsePriceToDollars(v: any): number | null {
  if (v == null) return null
  if (typeof v === "number") return v
  const m = String(v).replace(/[$,\s]/g, "")
  const n = Number.parseFloat(m)
  return Number.isFinite(n) ? n : null
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate

  const { id } = await ctx.params

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // Map the flat admin form fields → the enterprise CatalogProductInput.
  const patch: Partial<CatalogProductInput> & { visible?: boolean; isHidden?: boolean } = {}
  if (body.name != null) patch.name = body.name
  if (body.slug != null) patch.slug = body.slug
  if (body.description != null) patch.description = body.description
  if (body.short_description != null) patch.shortDescription = body.short_description
  if (body.shortDescription != null) patch.shortDescription = body.shortDescription
  if (body.brand != null) patch.brand = body.brand
  if (body.brand_id != null) patch.brandId = body.brand_id
  if (body.brandId != null) patch.brandId = body.brandId
  if (body.base_price != null) {
    const p = parsePriceToDollars(body.base_price)
    if (p != null) patch.price = p
  }
  if (body.price != null) {
    const p = parsePriceToDollars(body.price)
    if (p != null) patch.price = p
  }
  // sale_price (Discount Price): becomes the selling price; the regular
  // base_price becomes the compare-at ("was") price so the storefront
  // renders the discount. Takes precedence over base_price → price above.
  if (body.sale_price != null && String(body.sale_price).trim() !== "") {
    const s = parsePriceToDollars(body.sale_price)
    if (s != null) {
      patch.price = s
      if (body.base_price != null) {
        const b = parsePriceToDollars(body.base_price)
        if (b != null && b > s) patch.compareAtPrice = b
      }
    }
  }
  if (body.compare_at_price !== undefined) {
    patch.compareAtPrice = parsePriceToDollars(body.compare_at_price)
  }
  if (body.compareAtPrice !== undefined) {
    patch.compareAtPrice = parsePriceToDollars(body.compareAtPrice)
  }
  if (Array.isArray(body.media)) {
    patch.media = body.media
  } else if (body.image !== undefined) {
    patch.media = body.image
      ? [{ url: body.image, altText: body.alt || body.name, isPrimary: true }]
      : []
  }
  if (body.featured !== undefined) patch.featured = body.featured === true
  if (body.badge != null) patch.badge = body.badge
  if (body.category_id !== undefined) patch.categoryId = body.category_id
  if (body.categoryId !== undefined) patch.categoryId = body.categoryId
  if (body.category != null) patch.category = body.category
  if (body.specs != null) patch.specs = body.specs
  if (body.materials != null) patch.materials = body.materials
  if (body.ingredients != null) patch.ingredients = body.ingredients
  if (body.directions != null) patch.directions = body.directions
  if (body.warranty != null) patch.warranty = body.warranty
  if (body.stripe_product_id != null) patch.stripeProductId = body.stripe_product_id
  if (body.stripe_price_id != null) patch.stripePriceId = body.stripe_price_id
  if (body.sort_order != null) patch.sortOrder = Number(body.sort_order) || 99
  // visibility flags
  if (body.visible !== undefined) patch.visible = body.visible === true
  if (body.is_hidden !== undefined) patch.isHidden = body.is_hidden === true

  try {
    const updated = await updateCatalogProduct(id, patch)
    revalidateShop()
    return NextResponse.json({ product: updated })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Update failed: ${msg}` }, { status: 502 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("products_services", "write")
  if (gate) return gate

  const { id } = await ctx.params

  try {
    const ok = await deleteCatalogProduct(id)
    if (!ok) return NextResponse.json({ error: "Product not found" }, { status: 404 })
    revalidateShop()
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Delete failed: ${msg}` }, { status: 502 })
  }
}
