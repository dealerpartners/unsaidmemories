import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// G3 · International variants — admin catalog surface.
// Grounding (schema read from the live write paths, 2026-10-16):
//   erp_product_variants — id, tenant_id, product_id, name, attributes
//     (jsonb — the variant extension point every sync writes: option_size,
//     option_color, in_stock, stock_quantity, …), is_active, updated_at.
//   erp_product_skus — variant_id → the sellable SKU; commerce_catalog_items
//     .sku_id → the catalog item a price attaches to.
//   commerce_price_lists / commerce_prices — the real price machinery:
//     one list per currency (RETAIL/USD is the base); an international
//     price is a commerce_prices row on a list with code 'INTL-<CUR>'.
// International attributes live under attributes.international:
//   { countries: string[], localized_title: string|null,
//     localized_description: string|null }
// — written by merging into the existing attributes jsonb, never replacing
// the sync-owned keys. No disconnected silo, no new variant table.
//
// Gate: "products_services" (the catalog module, like /api/admin/products).
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUR_RE = /^[A-Z]{3}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;

type IntlAttrs = {
  countries: string[];
  localized_title: string | null;
  localized_description: string | null;
};

function readIntl(attributes: unknown): IntlAttrs {
  const a = (attributes && typeof attributes === "object" ? attributes : {}) as Record<string, unknown>;
  const raw = (a.international && typeof a.international === "object" ? a.international : {}) as Record<string, unknown>;
  return {
    countries: Array.isArray(raw.countries) ? raw.countries.map(String) : [],
    localized_title: raw.localized_title ? String(raw.localized_title) : null,
    localized_description: raw.localized_description ? String(raw.localized_description) : null,
  };
}

// GET /api/admin/catalog/variants?q=&limit= — variants with product, SKUs,
// catalog items, international attributes, and international prices.
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("products_services", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const q = (req.nextUrl.searchParams.get("q") || "").trim().replace(/[%_]/g, "");
  const limit = Math.max(1, Math.min(200, Number(req.nextUrl.searchParams.get("limit") || 100) || 100));
  try {
    const out = await withPg(async (c) => {
      const params: unknown[] = [tenant];
      let where = `v.tenant_id = $1`;
      if (q) {
        params.push(`%${q}%`);
        where += ` AND (v.name ILIKE $2 OR p.name ILIKE $2)`;
      }
      params.push(limit);
      const { rows } = await c.query(
        `SELECT v.id, v.name, v.attributes, v.is_active, v.updated_at,
                p.id AS product_id, p.name AS product_name,
                COALESCE(json_agg(DISTINCT jsonb_build_object(
                  'sku_id', s.id, 'sku', s.sku, 'catalog_item_id', ci.id
                )) FILTER (WHERE s.id IS NOT NULL), '[]'::json) AS skus,
                COALESCE(json_agg(DISTINCT jsonb_build_object(
                  'currency', pl.currency, 'price_list_code', pl.code,
                  'price', cp.price::float, 'catalog_item_id', cp.catalog_item_id
                )) FILTER (WHERE cp.id IS NOT NULL), '[]'::json) AS intl_prices
           FROM public.erp_product_variants v
           JOIN public.erp_products p ON p.id = v.product_id AND p.tenant_id = v.tenant_id
           LEFT JOIN public.erp_product_skus s ON s.variant_id = v.id AND s.tenant_id = v.tenant_id
           LEFT JOIN public.commerce_catalog_items ci ON ci.sku_id = s.id AND ci.tenant_id = v.tenant_id
           LEFT JOIN public.commerce_prices cp ON cp.catalog_item_id = ci.id
             AND cp.price_list_id IN (SELECT id FROM public.commerce_price_lists
                                       WHERE tenant_id = v.tenant_id AND code LIKE 'INTL-%' AND active = true)
             AND (cp.valid_to IS NULL OR cp.valid_to >= now())
           LEFT JOIN public.commerce_price_lists pl ON pl.id = cp.price_list_id
          WHERE ${where}
          GROUP BY v.id, p.id
          ORDER BY p.name, v.name
          LIMIT $${params.length}`,
        params
      );
      const { rows: lists } = await c.query(
        `SELECT code, currency, name FROM public.commerce_price_lists
          WHERE tenant_id = $1 AND code LIKE 'INTL-%' AND active = true ORDER BY currency`,
        [tenant]
      );
      return {
        variants: rows.map((r: Record<string, unknown>) => ({
          id: r.id, name: r.name, is_active: r.is_active, updated_at: r.updated_at,
          product_id: r.product_id, product_name: r.product_name,
          skus: r.skus, international: readIntl(r.attributes), intl_prices: r.intl_prices,
        })),
        intl_price_lists: lists,
      };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: "variants list failed" }, { status: 500 });
  }
}

// PATCH { variant_id, international: { countries, localized_title,
// localized_description } } — merge into attributes.international.
export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("products_services", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const variantId = String(b.variant_id || "");
  if (!UUID_RE.test(variantId)) return NextResponse.json({ error: "variant_id must be a uuid" }, { status: 400 });
  const intl = (b.international || {}) as Record<string, unknown>;
  const countriesRaw = Array.isArray(intl.countries) ? intl.countries.map((x) => String(x).trim().toUpperCase()) : [];
  if (countriesRaw.some((x) => !COUNTRY_RE.test(x))) {
    return NextResponse.json({ error: "countries must be ISO 3166-1 alpha-2 codes (e.g. CA, GB, DE)" }, { status: 400 });
  }
  const countries = [...new Set(countriesRaw)];
  const localizedTitle = intl.localized_title ? String(intl.localized_title).slice(0, 300) : null;
  const localizedDescription = intl.localized_description ? String(intl.localized_description).slice(0, 4000) : null;
  try {
    const out = await withPg(async (c) => {
      const { rows: before } = await c.query(
        `SELECT attributes FROM public.erp_product_variants WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, variantId]
      );
      if (before.length === 0) return { kind: "missing" as const };
      const patch = { countries, localized_title: localizedTitle, localized_description: localizedDescription };
      await c.query(
        `UPDATE public.erp_product_variants
            SET attributes = jsonb_set(COALESCE(attributes, '{}'::jsonb), '{international}', $3::jsonb, true),
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, variantId, JSON.stringify(patch)]
      );
      return { kind: "ok" as const, international: patch };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (out.kind === "missing") return NextResponse.json({ error: "Variant not found in this tenant" }, { status: 404 });
    return NextResponse.json({ international: out.international });
  } catch (e: any) {
    return NextResponse.json({ error: "variant update failed" }, { status: 500 });
  }
}

// POST { action: "set_price", variant_id, currency, price } — write a real
// commerce_prices row on the variant's catalog item under the currency's
// INTL-<CUR> price list (created on first use, in the real machinery).
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("products_services", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  if (String(b.action || "") !== "set_price") {
    return NextResponse.json({ error: "action must be 'set_price'" }, { status: 400 });
  }
  const tenant = resolveTenantId(req);
  const variantId = String(b.variant_id || "");
  const currency = String(b.currency || "").trim().toUpperCase();
  const price = b.price === "" || b.price == null ? null : Number(b.price);
  if (!UUID_RE.test(variantId)) return NextResponse.json({ error: "variant_id must be a uuid" }, { status: 400 });
  if (!CUR_RE.test(currency) || currency === "USD") {
    return NextResponse.json({ error: "currency must be a non-USD ISO 4217 code (USD is the RETAIL base list)" }, { status: 400 });
  }
  if (price === null || !Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: "price must be a non-negative number" }, { status: 400 });
  }
  try {
    const out = await withPg(async (c) => {
      const { rows: items } = await c.query(
        `SELECT ci.id AS catalog_item_id
           FROM public.erp_product_skus s
           JOIN public.commerce_catalog_items ci ON ci.sku_id = s.id AND ci.tenant_id = s.tenant_id
          WHERE s.tenant_id = $1 AND s.variant_id = $2::uuid
          ORDER BY ci.created_at LIMIT 1`,
        [tenant, variantId]
      );
      if (items.length === 0) {
        return {
          kind: "no_item" as const,
          error: "This variant has no catalog item (no SKU is bridged to commerce_catalog_items), so there is nothing a price can attach to. International attributes can still be set; pricing needs the catalog bridge first.",
        };
      }
      const catalogItemId = items[0].catalog_item_id;
      const code = `INTL-${currency}`;
      const { rows: listRows } = await c.query(
        `INSERT INTO public.commerce_price_lists (tenant_id, code, name, currency, list_type, active)
         VALUES ($1, $2, $3, $4, 'retail', true)
         ON CONFLICT (tenant_id, code) DO UPDATE SET active = true, currency = EXCLUDED.currency
         RETURNING id`,
        [tenant, code, `International — ${currency}`, currency]
      );
      const priceListId = listRows[0].id;
      // Close any current row for this item+list, then insert the new price
      // (commerce_prices is valid_from/valid_to versioned everywhere else).
      await c.query(
        `UPDATE public.commerce_prices SET valid_to = now()
          WHERE tenant_id = $1 AND catalog_item_id = $2::uuid AND price_list_id = $3::uuid
            AND (valid_to IS NULL OR valid_to >= now())`,
        [tenant, catalogItemId, priceListId]
      );
      const { rows } = await c.query(
        `INSERT INTO public.commerce_prices (tenant_id, price_list_id, catalog_item_id, price, valid_from)
         VALUES ($1, $2::uuid, $3::uuid, $4, now()) RETURNING id`,
        [tenant, priceListId, catalogItemId, price]
      );
      return { kind: "ok" as const, price_id: rows[0].id, catalog_item_id: catalogItemId, price_list_code: code, currency, price };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (out.kind === "no_item") return NextResponse.json({ error: out.error }, { status: 400 });
    return NextResponse.json(out, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: "international price write failed" }, { status: 500 });
  }
}
