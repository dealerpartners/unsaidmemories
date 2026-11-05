import type { Metadata } from "next";
import { headers } from "next/headers";
import { createServerClient } from "@/lib/supabase";
import { TENANT_ID } from "@/lib/admin/gate";
import { listAccounts } from "@/lib/integrations/service";
import { appBaseUrl, SOCIAL_PROVIDERS } from "@/lib/integrations/providers";
import Subnav from "../subnav";
import SocialPostWizard from "./social-post-wizard";

export const metadata: Metadata = { title: "Create a social post — Admin" };
export const dynamic = "force-dynamic";

/**
 * Create a Social Post wizard (Wizard #4 in notes/wizard-catalog.md) —
 * CHECKPOINT 1: Steps 1–3 work; Steps 4 (When) and 5 (Review & send)
 * are honest placeholders and nothing in this checkpoint posts
 * anything anywhere.
 *
 * Every read on this page is the social engine's own — no parallel
 * data paths:
 *   - Published products: the `products` table (tenant-scoped,
 *     status = "published"), the same read the Share a product index
 *     makes; each photo resolved through the exact chain the Share
 *     composer page uses (product_variants → variant_fulfillment_
 *     routes → supplier_catalog_variants → supplier_catalog_
 *     products.image_url), batched across the picker.
 *   - Networks + caption limits: SOCIAL_PROVIDERS, the registry the
 *     providers API and the Share composer both read.
 *   - Connected accounts: listAccounts() from lib/integrations/
 *     service — the same read behind GET /api/admin/integrations/
 *     social/accounts. Only status = "connected" accounts are
 *     offered; when none exist the wizard says so plainly and points
 *     at the Connect a Service wizard.
 */
export default async function SocialPostWizardPage() {
  const db = createServerClient();

  const { data: productRows } = await db
    .from("products")
    .select("id, name, slug, status, created_at")
    .eq("tenant_id", TENANT_ID)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(100);
  const products = productRows ?? [];

  // First catalog photo per product, via the Share composer's chain,
  // batched: variants → active fulfillment routes → catalog variants
  // → catalog products.
  const imageByProduct = new Map<string, string>();
  if (products.length > 0) {
    const { data: variants } = await db
      .from("product_variants")
      .select("id, product_id")
      .in("product_id", products.map((p) => p.id));
    const variantProduct = new Map((variants ?? []).map((v) => [v.id, v.product_id]));
    if (variantProduct.size > 0) {
      const { data: routes } = await db
        .from("variant_fulfillment_routes")
        .select("product_variant_id, supplier_catalog_variant_id")
        .in("product_variant_id", [...variantProduct.keys()])
        .eq("is_active", true)
        .order("priority");
      const routeCatalogVariant = new Map(
        (routes ?? []).map((r) => [r.product_variant_id, r.supplier_catalog_variant_id])
      );
      const catalogVariantIds = [...new Set(routeCatalogVariant.values())];
      if (catalogVariantIds.length > 0) {
        const { data: catVars } = await db
          .from("supplier_catalog_variants")
          .select("id, supplier_catalog_product_id")
          .in("id", catalogVariantIds);
        const catVarProduct = new Map(
          (catVars ?? []).map((v) => [v.id, v.supplier_catalog_product_id])
        );
        const catalogProductIds = [...new Set(catVarProduct.values())];
        if (catalogProductIds.length > 0) {
          const { data: catProds } = await db
            .from("supplier_catalog_products")
            .select("id, image_url")
            .in("id", catalogProductIds);
          const imageByCatalog = new Map(
            (catProds ?? []).map((c) => [c.id, c.image_url as string | null])
          );
          for (const [variantId, productId] of variantProduct) {
            if (imageByProduct.has(productId)) continue;
            const catVarId = routeCatalogVariant.get(variantId);
            const catProdId = catVarId ? catVarProduct.get(catVarId) : undefined;
            const url = catProdId ? imageByCatalog.get(catProdId) : undefined;
            if (url) imageByProduct.set(productId, url);
          }
        }
      }
    }
  }

  const accounts = await listAccounts(db);
  // Product links must point at the site the admin is actually on —
  // derive the origin from the request, and only fall back to
  // appBaseUrl() (which defaults to localhost) when no host came in.
  const reqHeaders = await headers();
  const host = reqHeaders.get("x-forwarded-host") ?? reqHeaders.get("host");
  const proto = reqHeaders.get("x-forwarded-proto") ?? "https";
  const base = host ? `${proto}://${host}` : appBaseUrl();

  return (
    <div>
      <div className="fabric-page-head">
        <h1>Create a social post</h1>
      </div>
      <Subnav />
      <SocialPostWizard
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          url: `${base}/product/${p.slug}`,
          imageUrl: imageByProduct.get(p.id) ?? null,
        }))}
        networks={SOCIAL_PROVIDERS.map((p) => ({
          id: p.id,
          label: p.label,
          captionLimit: p.captionLimit,
          color: p.color,
        }))}
        accounts={accounts
          .filter((a) => a.status === "connected")
          .map((a) => ({
            id: a.id,
            network: a.network,
            handle: a.handle,
            display_name: a.display_name,
          }))}
      />
    </div>
  );
}
