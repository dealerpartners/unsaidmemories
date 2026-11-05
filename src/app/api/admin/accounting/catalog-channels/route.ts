import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/catalog-channels
//
// Online Sales Channels (owner's online_sales_channels_.html). The
// store's own DTC channel is live and reads real catalog/order data.
// External channels (Shopify, Amazon, Faire, a headless B2B portal)
// are reported from the commerce layer itself — a channel counts as
// connected only when a commerce_order_channels record or real
// channel listings exist for it; otherwise the page says NOT
// CONNECTED and shows no invented numbers. The syndication matrix
// reads commerce_channel_products.

const EXTERNAL_CHANNELS = [
  { key: "shopify", name: "Shopify DTC", match: ["shopify"] },
  { key: "amazon", name: "Amazon Seller (FBM)", match: ["amazon"] },
  { key: "faire", name: "Faire Wholesale", match: ["faire"] },
  { key: "b2b", name: "Headless B2B Portal", match: ["b2b", "headless", "portal"] },
] as const;

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const dtc = await pgQuery<{
      published_products: number; variants: number; paid_orders: number;
      gmv_all: string; gmv_mtd: string; last_order_at: string | null; net_available: string;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM public.products WHERE tenant_id = $1 AND status = 'published') AS published_products,
         (SELECT COUNT(*)::int FROM public.product_variants WHERE tenant_id = $1) AS variants,
         (SELECT COUNT(*)::int FROM public.orders WHERE tenant_id = $1 AND status = 'paid') AS paid_orders,
         (SELECT COALESCE(SUM(total), 0)::text FROM public.orders WHERE tenant_id = $1 AND status = 'paid') AS gmv_all,
         (SELECT COALESCE(SUM(total), 0)::text FROM public.orders WHERE tenant_id = $1 AND status = 'paid'
            AND created_at >= date_trunc('month', now())) AS gmv_mtd,
         (SELECT MAX(created_at)::text FROM public.orders WHERE tenant_id = $1) AS last_order_at,
         (SELECT COALESCE(SUM(on_hand - reserved - allocated), 0)::text FROM public.erp_inventory_balances WHERE tenant_id = $1) AS net_available`,
      [tenant],
    );
    const configured = await pgQuery<{
      id: string; code: string; name: string; channel_type: string | null; active: boolean; listings: number;
    }>(
      `SELECT ch.id::text AS id, ch.code, ch.name, ch.channel_type, ch.active,
              COUNT(ccp.id)::int AS listings
         FROM public.commerce_order_channels ch
         LEFT JOIN public.commerce_channel_products ccp ON ccp.channel_id = ch.id
        WHERE ch.tenant_id = $1
        GROUP BY ch.id
        ORDER BY ch.name ASC`,
      [tenant],
    );
    const matrix = await pgQuery<{
      id: string; product_name: string | null; sku: string | null; channel_name: string | null;
      base_price: string | null; published: boolean; sync_status: string | null; last_synced_at: string | null;
    }>(
      `SELECT ccp.id::text AS id, p.name AS product_name,
              (SELECT pv.sku FROM public.product_variants pv
                WHERE pv.product_id = ccp.catalog_item_id ORDER BY pv.sku ASC NULLS LAST LIMIT 1) AS sku,
              ch.name AS channel_name,
              (SELECT MIN(pv.price)::text FROM public.product_variants pv
                WHERE pv.product_id = ccp.catalog_item_id) AS base_price,
              ccp.published, ccp.sync_status, ccp.last_synced_at::text AS last_synced_at
         FROM public.commerce_channel_products ccp
         LEFT JOIN public.products p ON p.id = ccp.catalog_item_id
         LEFT JOIN public.commerce_order_channels ch ON ch.id = ccp.channel_id
        WHERE ccp.tenant_id = $1
        ORDER BY ch.name ASC, p.name ASC
        LIMIT 200`,
      [tenant],
    );
    const externals = EXTERNAL_CHANNELS.map((ext) => {
      const match = configured.find((c) =>
        ext.match.some((m) => c.code.toLowerCase().includes(m) || c.name.toLowerCase().includes(m)));
      return {
        key: ext.key,
        name: ext.name,
        connected: Boolean(match && match.active),
        listings: match ? Number(match.listings || 0) : 0,
      };
    });
    const d = dtc[0];
    return NextResponse.json({
      dtc: {
        publishedProducts: Number(d?.published_products || 0),
        variants: Number(d?.variants || 0),
        paidOrders: Number(d?.paid_orders || 0),
        gmvAll: Number(d?.gmv_all || 0),
        gmvMtd: Number(d?.gmv_mtd || 0),
        lastOrderAt: d?.last_order_at || null,
        netAvailable: Number(d?.net_available || 0),
      },
      configuredChannels: configured.map((c) => ({ ...c, listings: Number(c.listings || 0) })),
      externals,
      matrix: matrix.map((m) => ({
        id: m.id, productName: m.product_name, sku: m.sku, channelName: m.channel_name,
        basePrice: m.base_price != null ? Number(m.base_price) : null,
        published: m.published, syncStatus: m.sync_status, lastSyncedAt: m.last_synced_at,
      })),
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/catalog-channels]", e);
    return NextResponse.json({ error: e?.message || "Failed to load channels" }, { status: 500 });
  }
}
