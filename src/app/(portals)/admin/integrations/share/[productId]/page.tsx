import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { TENANT_ID } from "@/lib/admin/gate";
import { listAccounts, listPosts } from "@/lib/integrations/service";
import { appBaseUrl, SOCIAL_PROVIDERS } from "@/lib/integrations/providers";
import Subnav from "../../subnav";
import ShareComposer from "./share-composer";

export const metadata: Metadata = { title: "Share product — Admin" };
export const dynamic = "force-dynamic";

export default async function ShareProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const db = createServerClient();
  const { data: product } = await db
    .from("products")
    .select("id, name, slug, description, status")
    .eq("id", productId)
    .eq("tenant_id", TENANT_ID)
    .single();
  if (!product) notFound();

  // Product image: first fulfillment route → supplier catalog product image.
  let imageUrl: string | null = null;
  const { data: variants } = await db
    .from("product_variants")
    .select("id")
    .eq("product_id", productId)
    .limit(5);
  if (variants?.length) {
    const { data: routes } = await db
      .from("variant_fulfillment_routes")
      .select("supplier_catalog_variant_id")
      .in("product_variant_id", variants.map((v) => v.id))
      .eq("is_active", true)
      .order("priority")
      .limit(5);
    for (const route of routes ?? []) {
      if (imageUrl) break;
      const { data: catVar } = await db
        .from("supplier_catalog_variants")
        .select("supplier_catalog_product_id")
        .eq("id", route.supplier_catalog_variant_id)
        .single();
      if (catVar) {
        const { data: catProd } = await db
          .from("supplier_catalog_products")
          .select("image_url")
          .eq("id", catVar.supplier_catalog_product_id)
          .single();
        imageUrl = catProd?.image_url ?? null;
      }
    }
  }

  const [accounts, previousPosts] = await Promise.all([
    listAccounts(db),
    listPosts(db, { productId }),
  ]);

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
        <h1>Share “{product.name}”</h1>
      </div>
      <Subnav />
      <ShareComposer
        product={{
          id: product.id,
          name: product.name,
          url: `${base}/product/${product.slug}`,
          imageUrl,
        }}
        networks={SOCIAL_PROVIDERS.map((p) => ({ id: p.id, label: p.label, captionLimit: p.captionLimit }))}
        accounts={accounts
          .filter((a) => a.status === "connected")
          .map((a) => ({ id: a.id, network: a.network, handle: a.handle }))}
      />
      <h2 style={{ margin: "28px 0 12px" }}>Posts for this product</h2>
      {previousPosts.length === 0 && <div className="adm-empty">No posts yet for this product.</div>}
      <div className="int-queue">
        {previousPosts.map((p) => (
          <div className="int-queue-item" key={p.id}>
            <b style={{ display: "block" }}>{p.caption}</b>
            <div className="int-muted">
              {p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : "Draft"} ·{" "}
              {p.networks.map((n) => `${n.network} (${n.status})`).join(", ")}
            </div>
            <div className="int-actions">
              <span className={`int-status ${p.status}`}>{p.status.replace("_", " ")}</span>
              <Link href="/admin/integrations/calendar" className="adm-btn adm-btn-sm">Open in calendar</Link>
            </div>
            {p.error && <div className="int-muted" style={{ color: "#9c2222", marginTop: 6 }}>{p.error}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
