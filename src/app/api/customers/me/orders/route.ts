import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/customer-auth";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/customers/me/orders — order history for the signed-in customer.
//
// Identity spine: the storefront `orders` rows (customer_id = auth user id)
// — checkout writes those, so they are the rows a customer can never lose
// even when the best-effort ERP twin failed to create. Every order is then
// enriched with its ERP twin (erp_orders, linked by source_order_id): the
// UNS-… order number, the admin ledger status, warehouse fulfillment and
// carrier shipments, and the status timeline. ERP rows matched by the
// signed-in user's email with no storefront order of theirs (manual/admin
// orders, or rows whose storefront source is gone) are listed as ERP-only
// rows with their erp_order_lines.
// commerce_orders is never read here: it is the empty transplant, 0 rows
// live, written by no Unsaid flow.
//
// Reads use the service-role client AFTER requireCustomer() has verified
// the session: the orders/order_items tables expose no customer read policy
// to the auth-scoped client (verified — the owner got zero rows for their
// own paid order), while checkout and the order-status endpoint already
// read them with the service role. Identity is enforced by the session
// check plus the explicit customer_id filter (and the email match, which
// uses the session user's own email) on every query.
export async function GET(req: NextRequest) {
  try {
    const auth = await requireCustomer();
    if (auth.error) return auth.error;
    const { user } = auth;
    const supabase = createServerClient();
    const userEmail = String(user.email || "").toLowerCase();

    const { data: orders, error } = await supabase
      .from("orders")
      .select(
        "id, status, total, shipping_method, shipping_cost, shipping_address, created_at"
      )
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const orderIds = (orders || []).map((o: any) => o.id);
    let itemsByOrder: Record<string, any[]> = {};
    if (orderIds.length) {
      const { data: items } = await supabase
        .from("order_items")
        .select(
          `id, order_id, quantity, unit_price, supplier_catalog_variant_id, design_publication_id,
           product_variants (sku, size, color, products (name, slug))`
        )
        .in("order_id", orderIds);
      // NOTE: order_items has no created_at column — ordering by it makes
      // PostgREST fail the whole query (42703), which used to surface here
      // as silently empty item lists.

      const catalogIds = [
        ...new Set(
          ((items || []) as any[])
            .map((it) => it.supplier_catalog_variant_id)
            .filter(Boolean)
        ),
      ] as string[];
      const catalogNames = new Map<string, string>();
      const catalogImages = new Map<string, string>();
      const catalogProductByVariant = new Map<string, string>();
      if (catalogIds.length) {
        const { data: variants } = await supabase
          .from("supplier_catalog_variants")
          .select("id, name, supplier_catalog_product_id")
          .in("id", catalogIds);
        for (const v of variants ?? []) catalogNames.set(v.id, v.name);
        const productIds = [
          ...new Set(
            ((variants ?? []) as any[])
              .map((v) => v.supplier_catalog_product_id)
              .filter(Boolean)
          ),
        ] as string[];
        if (productIds.length) {
          const variantToProduct = new Map<string, string>();
          for (const v of (variants ?? []) as any[]) {
            if (v.supplier_catalog_product_id) {
              variantToProduct.set(v.id, v.supplier_catalog_product_id);
              catalogProductByVariant.set(v.id, v.supplier_catalog_product_id);
            }
          }
          const { data: catalogProducts } = await supabase
            .from("supplier_catalog_products")
            .select("id, image_url, images")
            .in("id", productIds);
          const imageByProduct = new Map<string, string>();
          for (const p of (catalogProducts ?? []) as any[]) {
            const images = Array.isArray(p.images) ? p.images : [];
            const first =
              images.find((x: any) => typeof x === "string") ||
              images.find((x: any) => x?.url)?.url ||
              null;
            const url = p.image_url || first;
            if (url) imageByProduct.set(p.id, url);
          }
          for (const [variantId, productId] of variantToProduct) {
            const url = imageByProduct.get(productId);
            if (url) catalogImages.set(variantId, url);
          }
        }
      }

      for (const it of (items || []) as any[]) {
        const v = it.product_variants as any;
        const p = v?.products as any;
        const key = String(it.order_id);
        (itemsByOrder[key] = itemsByOrder[key] || []).push({
          id: it.id,
          product_name:
            p?.name ??
            (it.supplier_catalog_variant_id
              ? catalogNames.get(it.supplier_catalog_variant_id) ?? null
              : null),
          product_slug: p?.slug ?? null,
          sku: v?.sku ?? null,
          size: v?.size ?? null,
          color: v?.color ?? null,
          design_publication_id: it.design_publication_id ?? null,
          catalog_product_id: it.supplier_catalog_variant_id
            ? catalogProductByVariant.get(it.supplier_catalog_variant_id) ?? null
            : null,
          image_url: it.supplier_catalog_variant_id
            ? catalogImages.get(it.supplier_catalog_variant_id) ?? null
            : null,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
        });
      }
    }

    // Shipments: fulfillment rows per order, with tracking once the
    // supplier has shipped (tracking_number is written back by the
    // fulfillment push when the carrier label exists).
    const shipmentsByOrder: Record<string, any[]> = {};
    if (orderIds.length) {
      const { data: shipments } = await supabase
        .from("fulfillment_orders")
        .select("id, order_id, status, tracking_number, tracking_url, supplier_id")
        .in("order_id", orderIds);
      const supplierIds = [...new Set(((shipments || []) as any[]).map((sh) => sh.supplier_id).filter(Boolean))];
      const supplierNames = new Map<string, string>();
      if (supplierIds.length) {
        const { data: suppliers } = await supabase.from("suppliers").select("id, name").in("id", supplierIds);
        for (const sup of suppliers ?? []) supplierNames.set(sup.id, sup.name);
      }
      for (const sh of (shipments || []) as any[]) {
        const key = String(sh.order_id);
        (shipmentsByOrder[key] = shipmentsByOrder[key] || []).push({
          id: sh.id,
          status: sh.status,
          supplier: sh.supplier_id ? supplierNames.get(sh.supplier_id) ?? null : null,
          tracking_number: sh.tracking_number ?? null,
          tracking_url: sh.tracking_url ?? null,
        });
      }
    }

    // ERP twins for the storefront orders, plus ERP-only orders for this
    // email (manual/admin orders, and ERP rows whose storefront source is
    // gone or belongs to no order of this customer). The email match is
    // filtered DB-side with an escaped ilike (so a % or _ in an address
    // can never widen the match) AND re-checked exactly in code against
    // the session user's own email. Rows already shown via their twin
    // are skipped so no order appears twice.
    const twinBySource = new Map<string, any>();
    const erpOnly: any[] = [];
    if (orderIds.length) {
      const { data: twins } = await supabase
        .from("erp_orders")
        .select("id, order_number, status, fulfillment_method, total, shipping_total, order_date, source_order_id, customer_email")
        .in("source_order_id", orderIds);
      for (const t of twins ?? []) twinBySource.set(String(t.source_order_id), t);
    }
    if (userEmail) {
      const escapedEmail = userEmail.replace(/[\\%_]/g, (c) => `\\${c}`);
      const { data: emailRows } = await supabase
        .from("erp_orders")
        .select("id, order_number, status, fulfillment_method, total, shipping_total, order_date, source_order_id, customer_email")
        .ilike("customer_email", escapedEmail)
        .order("order_date", { ascending: false })
        .limit(50);
      const ownOrderIds = new Set(orderIds.map((id: any) => String(id)));
      for (const t of emailRows ?? []) {
        if (String(t.customer_email || "").toLowerCase() !== userEmail) continue;
        if (t.source_order_id && ownOrderIds.has(String(t.source_order_id))) continue;
        erpOnly.push(t);
      }
    }
    const erpIds = [
      ...new Set([
        ...[...twinBySource.values()].map((t: any) => String(t.id)),
        ...erpOnly.map((t: any) => String(t.id)),
      ]),
    ];

    // ERP fulfillment + warehouse shipments + status timeline, keyed by
    // erp order id, then re-keyed to the storefront order for the response.
    const erpShipmentsByErp: Record<string, any[]> = {};
    const erpFulfillByErp: Record<string, any[]> = {};
    const timelineByErp: Record<string, any[]> = {};
    if (erpIds.length) {
      const { data: erpFuls } = await supabase
        .from("erp_fulfillment_orders")
        .select("id, order_id, fulfillment_number, method, status, dispatched_at, completed_at")
        .in("order_id", erpIds);
      const fulIds = ((erpFuls || []) as any[]).map((f) => String(f.id));
      for (const f of (erpFuls || []) as any[]) {
        const key = String(f.order_id);
        (erpFulfillByErp[key] = erpFulfillByErp[key] || []).push({
          id: f.id,
          fulfillment_number: f.fulfillment_number ?? null,
          method: f.method ?? null,
          status: f.status,
          dispatched_at: f.dispatched_at ?? null,
          completed_at: f.completed_at ?? null,
        });
      }
      if (fulIds.length) {
        const { data: erpShips } = await supabase
          .from("erp_shipments")
          .select("id, fulfillment_id, shipment_number, status, tracking_number, tracking_url, shipped_at, delivered_at")
          .in("fulfillment_id", fulIds);
        const fulById = new Map(((erpFuls || []) as any[]).map((f: any) => [String(f.id), f]));
        for (const s of (erpShips || []) as any[]) {
          const ful = fulById.get(String(s.fulfillment_id));
          if (!ful) continue;
          const key = String(ful.order_id);
          (erpShipmentsByErp[key] = erpShipmentsByErp[key] || []).push({
            id: s.id,
            shipment_number: s.shipment_number ?? null,
            status: s.status,
            tracking_number: s.tracking_number ?? null,
            tracking_url: s.tracking_url ?? null,
            shipped_at: s.shipped_at ?? null,
            delivered_at: s.delivered_at ?? null,
          });
        }
      }
      const { data: hist } = await supabase
        .from("erp_order_status_history")
        .select("order_id, from_status, to_status, changed_at")
        .in("order_id", erpIds)
        .order("changed_at", { ascending: false })
        .limit(500);
      for (const h of (hist || []) as any[]) {
        const key = String(h.order_id);
        const list = (timelineByErp[key] = timelineByErp[key] || []);
        // Customer-safe: status + date only — no internal reasons or actors.
        if (list.length < 20) {
          list.push({
            from_status: h.from_status ?? null,
            to_status: h.to_status,
            changed_at: h.changed_at,
          });
        }
      }
    }

    // ERP-only order lines (description is the product name for these).
    const erpItemsByErp: Record<string, any[]> = {};
    if (erpOnly.length) {
      const { data: lines } = await supabase
        .from("erp_order_lines")
        .select("id, order_id, description, quantity, unit_price, line_total")
        .in("order_id", erpOnly.map((t: any) => t.id));
      for (const l of (lines || []) as any[]) {
        const key = String(l.order_id);
        (erpItemsByErp[key] = erpItemsByErp[key] || []).push({
          id: l.id,
          product_name: l.description ?? null,
          product_slug: null,
          sku: null,
          size: null,
          color: null,
          design_publication_id: null,
          image_url: null,
          quantity: Number(l.quantity) || 0,
          unit_price: Number(l.unit_price) || 0,
        });
      }
    }

    const storefrontRows = (orders || []).map((o: any) => {
      const twin = twinBySource.get(String(o.id));
      return {
        id: o.id,
        source: "storefront",
        order_number: twin?.order_number ?? null,
        erp_status: twin?.status ?? null,
        fulfillment_method: twin?.fulfillment_method ?? null,
        status: o.status,
        total: Number(o.total) || 0,
        shipping_method: o.shipping_method ?? null,
        shipping_cost: Number(o.shipping_cost) || 0,
        shipping_address: o.shipping_address ?? null,
        created_at: o.created_at,
        items: itemsByOrder[String(o.id)] || [],
        shipments: shipmentsByOrder[String(o.id)] || [],
        erp_shipments: twin ? erpShipmentsByErp[String(twin.id)] || [] : [],
        erp_fulfillments: twin ? erpFulfillByErp[String(twin.id)] || [] : [],
        timeline: twin ? timelineByErp[String(twin.id)] || [] : [],
      };
    });

    const erpOnlyRows = erpOnly.map((t: any) => ({
      id: t.id,
      source: "erp",
      order_number: t.order_number ?? null,
      erp_status: t.status ?? null,
      fulfillment_method: t.fulfillment_method ?? null,
      status: t.status,
      total: Number(t.total) || 0,
      shipping_method: t.fulfillment_method ?? null,
      shipping_cost: Number(t.shipping_total) || 0,
      shipping_address: null,
      created_at: t.order_date,
      items: erpItemsByErp[String(t.id)] || [],
      shipments: [],
      erp_shipments: erpShipmentsByErp[String(t.id)] || [],
      erp_fulfillments: erpFulfillByErp[String(t.id)] || [],
      timeline: timelineByErp[String(t.id)] || [],
    }));

    const merged = [...storefrontRows, ...erpOnlyRows].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    return NextResponse.json({ orders: merged, total: merged.length });
  } catch (err: any) {
    console.error("[GET /api/customers/me/orders]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load orders." },
      { status: 500 }
    );
  }
}
