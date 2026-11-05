import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";
import { notifySeller } from "@/lib/sellers/notify";
import {
  RETURNS_CONFIG_SCOPE,
  returnWindowKey,
  legalMinimumKey,
  parseDayCount,
  isUuid,
  readReturnsConfig,
} from "@/lib/catalog/category-admin";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// G · CATALOG ADMIN + B3 · CATEGORIES + D3 remainders (category windows /
// legal minimums) — the canonical category face over public.taxonomy_nodes.
//
// THE UNIFICATION (Sunny's Working Table Order duplicate map — his text
// is the ruling): taxonomy_nodes is THE canonical category store;
// categories (101) / seller_catalog_categories (0) /
// commerce_categories (0) are parallel duplicates that consolidate into
// it under the cleanup program. This face reads and writes ONLY the
// canonical store; the duplicates are counted and named on the face,
// never written, never migrated here. pet_product_categories (the BL-13
// twin) is no longer counted here: its consolidation landed — the
// /admin/categories CRUD writes taxonomy_nodes now.
//
// FIRSTHAND CENSUS (2026-10-14, foreground information_schema/pg reads):
//   taxonomy_nodes — 436 rows, ALL on the master tenant; parent_id
//     hierarchy (FK RESTRICT); node_type CHECK {animal, department,
//     category, subcategory}; status CHECK {draft, published, archived}
//     (published 428 / archived 7 / draft 1); is_gated TRUE on exactly 2
//     department nodes; UNIQUE (tenant_id, path). Its stored
//     product_count column DIVERGES from every computed count (e.g.
//     "Grooming Tools" stored 0 vs 464 product links / 657 items) — the
//     stored counter is never served here; counts are computed live.
//   THE CATEGORY LINKAGE (drawn exactly):
//     - commerce_catalog_items attach via metadata->'taxonomy_node_ids'
//       (17,151 of 18,684 items carry it) — the storefront's own count
//       grain (src/lib/shop/taxonomy-db.ts fans out from it).
//     - erp_products attach via public.product_taxonomy_nodes (12,891
//       links over 12,522 products, 193 nodes; exactly one is_primary
//       link per product). Where an item names its ERP product
//       (metadata->>'erp_product_id', 17,113 items) the two records
//       AGREE as sets (spot-proven firsthand).
//     - seller_listings.category_id (uuid, NO FK — the table carries
//       only its PK) is the listing's own category pointer; in the
//       unified model it names a taxonomy node. 0 listings today.
//     - The other candidate linkages are dead: erp_products.category_id
//       -> erp_product_categories (0 rows) is populated on 0 of 14,057
//       products; commerce_catalog_category_map -> commerce_categories
//       holds 0 rows; taxonomy-db.ts's `products` legs read a dropped
//       table (cleanup program's repoint list, named in the WTO).
//   GATING (B3 "Category gating" / G2 "Gated categories"): the designed
//     stores are taxonomy_nodes.is_gated + public.seller_category_
//     approvals (PK (seller_id, node_id); node_id FK -> taxonomy_nodes;
//     status CHECK {pending, approved, rejected}; reviewed_at; NO
//     tenant_id — tenancy rides the seller). Both had ZERO code
//     references on this lineage before this face.
//   ATTRIBUTE SCHEMAS (B3 / G1 "Attribute dictionaries"): node_filters
//     (490 rows, keyed by node_id) + node_filter_values (1,651) are the
//     designed stores; their admin face already exists (/admin/filters).
//     Read figures only here.
//   GTIN REGISTRY (G1): no GTIN/UPC column exists on the canonical
//     product; erp_product_skus.barcode is the nearest column and is
//     populated on 0 of 18,693 SKUs — the registry is an honest empty,
//     reported as a count, not a face.
//
// REASSIGNMENT (B3, the act B1 deferred): a MOVE, guarded and audited.
//   For a catalog item the write keeps the two live records in exact
//   agreement: the ERP product's primary product_taxonomy_nodes link
//   moves (old primary deleted, target upserted is_primary) and the
//   item's metadata.taxonomy_node_ids is rewritten to the product's
//   resulting link set; metadata-only items move in metadata alone.
//   For a seller listing, seller_listings.category_id moves and the
//   seller is notified with the reason (the B1/B2 idiom).
//
// D3 REMAINDERS ride policy_settings scope "returns" (see
// src/lib/catalog/category-admin.ts) — recorded configuration, empty
// until an admin enters real values; no statutory figure is invented.
// Consumption by seller return-rule evaluation is a named follow-on.
//
// Gate: "products_services" (the categories/catalog module's own code —
// the legacy categories API's gate). Tenancy is a predicate in every
// statement. Supplier names never surface here.
// ---------------------------------------------------------------------------

type Ctx = { tenant: string; actorId: string | null; ipAddress: string | null };

async function nodeById(c: any, tenant: string, nodeId: string) {
  const { rows } = await c.query(
    `SELECT id, name, slug, path, node_type, status, is_gated
       FROM public.taxonomy_nodes
      WHERE tenant_id = $1 AND id = $2::uuid`,
    [tenant, nodeId]
  );
  return rows[0] ?? null;
}

// GET /api/admin/catalog/categories -> the canonical tree with computed
// counts, the gating desk (gated nodes + pending approvals), the D3
// returns-configuration register, and the named duplicate census.
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("products_services", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const { rows: nodes } = await c.query(
        `SELECT id, parent_id, node_type, name, display_name, slug, path,
                depth, sort_order, status, is_gated, is_featured
           FROM public.taxonomy_nodes
          WHERE tenant_id = $1
          ORDER BY depth ASC, sort_order ASC, name ASC`,
        [tenant]
      );
      // Count-source note (2026-10-16, DB Reports follow-up): this unnest
      // census was measured against the product_taxonomy_nodes join and a
      // GIN `?` join — both were SLOWER (217 / 145 ms vs 45 ms here), and
      // the link table is a different grain that this face deliberately
      // reports as its own column (product_links, next query). The items
      // count stays a metadata census; do not merge the two sources.
      const { rows: itemCounts } = await c.query(
        `SELECT node_id, count(*)::int AS n
           FROM (
             SELECT jsonb_array_elements_text(
                      COALESCE(metadata->'taxonomy_node_ids', '[]'::jsonb)
                    ) AS node_id
               FROM public.commerce_catalog_items
              WHERE tenant_id = $1
           ) s
          GROUP BY node_id`,
        [tenant]
      );
      const { rows: linkCounts } = await c.query(
        `SELECT taxonomy_node_id AS node_id, count(*)::int AS n,
                count(*) FILTER (WHERE is_primary)::int AS primary_n
           FROM public.product_taxonomy_nodes
          WHERE tenant_id = $1
          GROUP BY taxonomy_node_id`,
        [tenant]
      );
      const { rows: listingCounts } = await c.query(
        `SELECT category_id AS node_id, count(*)::int AS n
           FROM public.seller_listings
          WHERE tenant_id = $1 AND category_id IS NOT NULL
          GROUP BY category_id`,
        [tenant]
      );
      const items = new Map(itemCounts.map((r: any) => [String(r.node_id), r.n]));
      const links = new Map<string, { n: number; primary: number }>(
        linkCounts.map((r: any): [string, { n: number; primary: number }] => [
          String(r.node_id),
          { n: Number(r.n) || 0, primary: Number(r.primary_n) || 0 },
        ])
      );
      const listings = new Map(
        listingCounts.map((r: any) => [String(r.node_id), r.n])
      );

      const { rows: approvals } = await c.query(
        `SELECT a.seller_id, s.display_name AS seller_name, a.node_id,
                n.name AS node_name, n.path AS node_path, a.status
           FROM public.seller_category_approvals a
           JOIN public.sellers s
             ON s.id = a.seller_id AND s.tenant_id = $1
           JOIN public.taxonomy_nodes n
             ON n.id = a.node_id AND n.tenant_id = $1
          WHERE a.status = 'pending'
          ORDER BY s.display_name ASC, n.name ASC
          LIMIT 200`,
        [tenant]
      );

      const config = await readReturnsConfig(c, tenant);

      const { rows: dup } = await c.query(
        `SELECT (SELECT count(*)::int FROM public.categories) AS categories,
                (SELECT count(*)::int FROM public.seller_catalog_categories WHERE tenant_id = $1) AS seller_catalog_categories,
                (SELECT count(*)::int FROM public.commerce_categories WHERE tenant_id = $1) AS commerce_categories,
                (SELECT count(*)::int FROM public.node_filters) AS node_filters,
                (SELECT count(*)::int FROM public.node_filter_values) AS node_filter_values,
                (SELECT count(*)::int FROM public.erp_product_skus WHERE tenant_id = $1) AS skus,
                (SELECT count(*)::int FROM public.erp_product_skus WHERE tenant_id = $1 AND barcode IS NOT NULL AND barcode <> '') AS skus_with_barcode`,
        [tenant]
      );

      return {
        nodes: nodes.map((n: any) => ({
          id: String(n.id),
          parent_id: n.parent_id ? String(n.parent_id) : null,
          node_type: n.node_type,
          name: n.name,
          display_name: n.display_name,
          slug: n.slug,
          path: n.path,
          depth: n.depth,
          sort_order: n.sort_order,
          status: n.status,
          is_gated: !!n.is_gated,
          is_featured: !!n.is_featured,
          counts: {
            items: items.get(String(n.id)) ?? 0,
            product_links: links.get(String(n.id))?.n ?? 0,
            product_links_primary: links.get(String(n.id))?.primary ?? 0,
            listings: listings.get(String(n.id)) ?? 0,
          },
        })),
        totals: {
          nodes: nodes.length,
          published: nodes.filter((n: any) => n.status === "published").length,
          gated: nodes.filter((n: any) => n.is_gated).length,
        },
        approvals: approvals.map((a: any) => ({
          seller_id: String(a.seller_id),
          seller_name: a.seller_name,
          node_id: String(a.node_id),
          node_name: a.node_name,
          node_path: a.node_path,
          status: a.status,
        })),
        returns_config: {
          default_window_days: config.defaultWindowDays,
          categories: [...config.categories.entries()].map(([nodeId, v]) => ({
            node_id: nodeId,
            window_days: v.windowDays,
            legal_minimum_days: v.legalMinimumDays,
          })),
        },
        sources: {
          canonical: "taxonomy_nodes",
          duplicates: {
            categories: dup[0].categories,
            seller_catalog_categories: dup[0].seller_catalog_categories,
            commerce_categories: dup[0].commerce_categories,
          },
          note: "Parallel category stores named by the Working Table Order duplicate map; they consolidate into taxonomy_nodes under the cleanup program. This face never writes them. pet_product_categories — the BL-13 twin — already consolidated: its admin writer/reader retired onto taxonomy_nodes (the /admin/categories CRUD); its rows remain only as the legacy shop-nav id space until that layer retires.",
        },
        attributes: {
          filters: dup[0].node_filters,
          values: dup[0].node_filter_values,
          managed_at: "/admin/filters",
        },
        gtin: {
          skus: dup[0].skus,
          skus_with_barcode: dup[0].skus_with_barcode,
          note: "No GTIN/UPC column exists on the canonical product; erp_product_skus.barcode is the nearest recorded field and is unpopulated today.",
        },
      };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "catalog categories read failed" }, { status: 500 });
  }
}

// POST /api/admin/catalog/categories { action, ... } ->
//   set_gated               { node_id, is_gated } — B3/G2 gating flag.
//   decide_category_approval{ seller_id, node_id, decision } — the
//                           gating desk's decision (pending only).
//   reassign_item           { item_id, to_node_id, reason } — B3 move
//                           for a catalog item (both live records).
//   reassign_listing        { listing_id, to_node_id, reason } — B3
//                           move for a seller listing + notification.
//   set_return_window       { node_id|null, window_days|null } — D3.
//   set_legal_minimum       { node_id, minimum_days|null } — D3.
//   create_node             { name, slug?, parent_id?, node_type?,
//                           display_name?, sort_order? } — G2 lifecycle:
//                           born 'draft'; path/depth materialized.
//   update_node             { node_id, name?, display_name?, slug?,
//                           sort_order?, is_featured? } — a slug change
//                           rewrites the subtree's path prefixes.
//   reparent_node           { node_id, new_parent_id|null } — cycle-
//                           refused; path + depth rewritten subtree-wide.
//   set_node_status         { node_id, status } — draft|published|archived.
//   delete_node             { node_id } — refused while the node has
//                           children or any product/listing/filter
//                           attachment (archive instead).
// Every action is guarded and audited via writeSellerAudit.
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("products_services", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const ctx: Ctx = {
    tenant: resolveTenantId(req),
    actorId: await getActorIdFromRequest(req),
    ipAddress: requestIp(req),
  };
  const action = String(b.action || "").trim();

  try {
    const out = await withPg(async (c) => {
      // ---------------------------------------------------------------
      if (action === "set_gated") {
        const nodeId = String(b.node_id || "");
        if (!isUuid(nodeId)) return { kind: "bad" as const, error: "node_id must be a uuid" };
        const to = b.is_gated === true;
        const node = await nodeById(c, ctx.tenant, nodeId);
        if (!node) return { kind: "missing" as const, what: "Category node" };
        if (!!node.is_gated === to) {
          return {
            kind: "state" as const,
            error: `Category "${node.name}" is already ${to ? "gated" : "not gated"}.`,
          };
        }
        const { rows: updated } = await c.query(
          `UPDATE public.taxonomy_nodes
              SET is_gated = $3, updated_at = now()
            WHERE tenant_id = $1 AND id = $2::uuid AND is_gated IS DISTINCT FROM $3
            RETURNING id`,
          [ctx.tenant, nodeId, to]
        );
        if (updated.length === 0) return { kind: "state" as const, error: "Category changed underneath — retry." };
        await writeSellerAudit(c, {
          tenantId: ctx.tenant,
          actorId: ctx.actorId,
          ipAddress: ctx.ipAddress,
          action: "catalog.category_gating_set",
          entityType: "taxonomy_node",
          entityId: nodeId,
          beforeState: { is_gated: !!node.is_gated },
          afterState: { is_gated: to },
        });
        return { kind: "ok" as const, node_id: nodeId, is_gated: to };
      }

      // ---------------------------------------------------------------
      if (action === "decide_category_approval") {
        const sellerId = String(b.seller_id || "");
        const nodeId = String(b.node_id || "");
        const decision = String(b.decision || "").trim();
        if (!isUuid(sellerId) || !isUuid(nodeId)) {
          return { kind: "bad" as const, error: "seller_id and node_id must be uuids" };
        }
        const to =
          decision === "approve" ? "approved" : decision === "reject" ? "rejected" : null;
        if (!to) return { kind: "bad" as const, error: 'decision must be "approve" or "reject"' };
        const { rows: sellerRows } = await c.query(
          `SELECT id, display_name FROM public.sellers WHERE tenant_id = $1 AND id = $2::uuid`,
          [ctx.tenant, sellerId]
        );
        if (sellerRows.length === 0) return { kind: "missing" as const, what: "Seller" };
        const node = await nodeById(c, ctx.tenant, nodeId);
        if (!node) return { kind: "missing" as const, what: "Category node" };
        const { rows: updated } = await c.query(
          `UPDATE public.seller_category_approvals
              SET status = $3, reviewed_at = now()
            WHERE seller_id = $1::uuid AND node_id = $2::uuid AND status = 'pending'
            RETURNING seller_id`,
          [sellerId, nodeId, to]
        );
        if (updated.length === 0) {
          const { rows: existing } = await c.query(
            `SELECT status FROM public.seller_category_approvals
              WHERE seller_id = $1::uuid AND node_id = $2::uuid`,
            [sellerId, nodeId]
          );
          if (existing.length === 0) return { kind: "missing" as const, what: "Category approval request" };
          return {
            kind: "state" as const,
            error: `This request was already decided ("${existing[0].status}") — decide-once.`,
          };
        }
        // Through the comms layer (event "listings") — preferences +
        // email leg apply; same type/title/body/link as the raw
        // insert this replaces.
        await notifySeller(
          {
            tenantId: ctx.tenant,
            sellerId,
            event: "listings",
            type: "category_approval",
            title: `Category ${to === "approved" ? "approved" : "rejected"}: ${node.name}`,
            body:
              to === "approved"
                ? `Your request to sell in the category "${node.name}" has been approved.`
                : `Your request to sell in the category "${node.name}" was rejected. You can appeal through your governance surface.`,
            link: "/seller/products",
          },
          c,
        );
        await writeSellerAudit(c, {
          tenantId: ctx.tenant,
          sellerId,
          actorId: ctx.actorId,
          ipAddress: ctx.ipAddress,
          action: "seller.category_approval_decided",
          entityType: "seller_category_approval",
          entityId: nodeId,
          beforeState: { status: "pending" },
          afterState: { status: to, node_path: node.path },
        });
        return { kind: "ok" as const, seller_id: sellerId, node_id: nodeId, status: to };
      }

      // ---------------------------------------------------------------
      if (action === "reassign_item") {
        const itemId = String(b.item_id || "");
        const toNodeId = String(b.to_node_id || "");
        const reason = String(b.reason || "").trim();
        if (!isUuid(itemId) || !isUuid(toNodeId)) {
          return { kind: "bad" as const, error: "item_id and to_node_id must be uuids" };
        }
        if (!reason) return { kind: "bad" as const, error: "A reason is required to reassign a category." };
        const target = await nodeById(c, ctx.tenant, toNodeId);
        if (!target) return { kind: "missing" as const, what: "Target category node" };
        const { rows: itemRows } = await c.query(
          `SELECT id, name, metadata FROM public.commerce_catalog_items
            WHERE tenant_id = $1 AND id = $2::uuid`,
          [ctx.tenant, itemId]
        );
        if (itemRows.length === 0) return { kind: "missing" as const, what: "Catalog item" };
        const item = itemRows[0];
        const metadata = (item.metadata ?? {}) as Record<string, unknown>;
        const metaIds: string[] = Array.isArray(metadata.taxonomy_node_ids)
          ? (metadata.taxonomy_node_ids as unknown[]).map(String)
          : [];
        const erpIdRaw = metadata.erp_product_id;
        const erpId = isUuid(erpIdRaw) ? (erpIdRaw as string) : null;

        let sourceNodeId: string | null = null;
        let linkSet: string[] = [...metaIds];
        if (erpId) {
          const { rows: linkRows } = await c.query(
            `SELECT taxonomy_node_id::text AS node_id, is_primary
               FROM public.product_taxonomy_nodes
              WHERE tenant_id = $1 AND product_id = $2::uuid`,
            [ctx.tenant, erpId]
          );
          linkSet = linkRows.map((r: any) => String(r.node_id));
          const primary = linkRows.find((r: any) => r.is_primary);
          sourceNodeId = primary ? String(primary.node_id) : linkSet[0] ?? metaIds[0] ?? null;
        } else {
          sourceNodeId = metaIds[0] ?? null;
        }
        if (sourceNodeId === toNodeId) {
          return {
            kind: "state" as const,
            error: `Item "${item.name}" is already categorized under "${target.name}".`,
          };
        }

        if (erpId) {
          if (sourceNodeId) {
            await c.query(
              `DELETE FROM public.product_taxonomy_nodes
                WHERE tenant_id = $1 AND product_id = $2::uuid
                  AND taxonomy_node_id = $3::uuid AND is_primary`,
              [ctx.tenant, erpId, sourceNodeId]
            );
          }
          await c.query(
            `INSERT INTO public.product_taxonomy_nodes
               (tenant_id, product_id, taxonomy_node_id, is_primary)
             VALUES ($1, $2::uuid, $3::uuid, true)
             ON CONFLICT (product_id, taxonomy_node_id)
             DO UPDATE SET is_primary = true`,
            [ctx.tenant, erpId, toNodeId]
          );
          const { rows: after } = await c.query(
            `SELECT taxonomy_node_id::text AS node_id
               FROM public.product_taxonomy_nodes
              WHERE tenant_id = $1 AND product_id = $2::uuid`,
            [ctx.tenant, erpId]
          );
          linkSet = after.map((r: any) => String(r.node_id));
        } else {
          linkSet = [toNodeId, ...metaIds.filter((x) => x !== toNodeId && x !== sourceNodeId)];
        }

        await c.query(
          `UPDATE public.commerce_catalog_items
              SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb),
                                       '{taxonomy_node_ids}', $3::jsonb),
                  updated_at = now()
            WHERE tenant_id = $1 AND id = $2::uuid`,
          [ctx.tenant, itemId, JSON.stringify(linkSet)]
        );

        const sellerIdRaw = metadata.seller_id;
        if (isUuid(sellerIdRaw)) {
          const { rows: s } = await c.query(
            `SELECT id FROM public.sellers WHERE tenant_id = $1 AND id = $2::uuid`,
            [ctx.tenant, sellerIdRaw]
          );
          if (s.length > 0) {
            const source = sourceNodeId ? await nodeById(c, ctx.tenant, sourceNodeId) : null;
            await notifySeller(
              {
                tenantId: ctx.tenant,
                sellerId: sellerIdRaw,
                event: "listings",
                type: "catalog_category",
                title: `Product category changed: ${item.name}`,
                body: `Your product "${item.name}" was moved from category "${source?.name ?? "—"}" to "${target.name}". Reason: ${reason}`,
                link: "/seller/products",
              },
              c,
            );
          }
        }

        await writeSellerAudit(c, {
          tenantId: ctx.tenant,
          actorId: ctx.actorId,
          ipAddress: ctx.ipAddress,
          action: "catalog.item_category_reassigned",
          entityType: "commerce_catalog_item",
          entityId: itemId,
          beforeState: { category_node_id: sourceNodeId, taxonomy_node_ids: metaIds },
          afterState: {
            category_node_id: toNodeId,
            taxonomy_node_ids: linkSet,
            erp_product_id: erpId,
            reason,
          },
        });
        return {
          kind: "ok" as const,
          item_id: itemId,
          from_node_id: sourceNodeId,
          to_node_id: toNodeId,
          taxonomy_node_ids: linkSet,
        };
      }

      // ---------------------------------------------------------------
      if (action === "reassign_listing") {
        const listingId = String(b.listing_id || "");
        const toNodeId = String(b.to_node_id || "");
        const reason = String(b.reason || "").trim();
        if (!isUuid(listingId) || !isUuid(toNodeId)) {
          return { kind: "bad" as const, error: "listing_id and to_node_id must be uuids" };
        }
        if (!reason) return { kind: "bad" as const, error: "A reason is required to reassign a category." };
        const target = await nodeById(c, ctx.tenant, toNodeId);
        if (!target) return { kind: "missing" as const, what: "Target category node" };
        const { rows: rows0 } = await c.query(
          `SELECT id, seller_id, title, category_id
             FROM public.seller_listings
            WHERE tenant_id = $1 AND id = $2::uuid`,
          [ctx.tenant, listingId]
        );
        if (rows0.length === 0) return { kind: "missing" as const, what: "Seller listing" };
        const listing = rows0[0];
        const current = listing.category_id ? String(listing.category_id) : null;
        if (current === toNodeId) {
          return {
            kind: "state" as const,
            error: `Listing "${listing.title}" is already categorized under "${target.name}".`,
          };
        }
        const { rows: updated } = await c.query(
          `UPDATE public.seller_listings
              SET category_id = $3::uuid, updated_at = now()
            WHERE tenant_id = $1 AND id = $2::uuid
              AND category_id IS NOT DISTINCT FROM $4::uuid
            RETURNING id`,
          [ctx.tenant, listingId, toNodeId, current]
        );
        if (updated.length === 0) return { kind: "state" as const, error: "Listing changed underneath — retry." };
        const source = current ? await nodeById(c, ctx.tenant, current) : null;
        await notifySeller(
          {
            tenantId: ctx.tenant,
            sellerId: String(listing.seller_id),
            event: "listings",
            type: "listing_category",
            title: `Listing category changed: ${listing.title}`,
            body: `Your listing "${listing.title}" was moved from category "${source?.name ?? "—"}" to "${target.name}". Reason: ${reason}`,
            link: "/seller/products",
          },
          c,
        );
        await writeSellerAudit(c, {
          tenantId: ctx.tenant,
          sellerId: String(listing.seller_id),
          actorId: ctx.actorId,
          ipAddress: ctx.ipAddress,
          action: "seller.listing_category_reassigned",
          entityType: "seller_listing",
          entityId: listingId,
          beforeState: { category_node_id: current },
          afterState: { category_node_id: toNodeId, reason },
        });
        return {
          kind: "ok" as const,
          listing_id: listingId,
          from_node_id: current,
          to_node_id: toNodeId,
        };
      }

      // ---------------------------------------------------------------
      if (action === "set_return_window" || action === "set_legal_minimum") {
        const isWindow = action === "set_return_window";
        const rawNode = b.node_id;
        const nodeId =
          rawNode === null || rawNode === undefined || rawNode === "" ? null : String(rawNode);
        if (!isWindow && !nodeId) {
          return { kind: "bad" as const, error: "A legal minimum is recorded per category — node_id is required." };
        }
        if (nodeId !== null) {
          if (!isUuid(nodeId)) return { kind: "bad" as const, error: "node_id must be a uuid" };
          const node = await nodeById(c, ctx.tenant, nodeId);
          if (!node) return { kind: "missing" as const, what: "Category node" };
        }
        const rawDays = isWindow ? b.window_days : b.minimum_days;
        const clear = rawDays === null || rawDays === undefined || rawDays === "";
        const days = clear ? null : parseDayCount(rawDays);
        if (!clear && days === null) {
          return { kind: "bad" as const, error: "Days must be a non-negative integer (0–3650), or null to clear." };
        }
        const key = isWindow ? returnWindowKey(nodeId) : legalMinimumKey(nodeId as string);
        const { rows: before } = await c.query(
          `SELECT value FROM public.policy_settings
            WHERE tenant_id = $1 AND scope = $2 AND key = $3`,
          [ctx.tenant, RETURNS_CONFIG_SCOPE, key]
        );
        if (clear) {
          await c.query(
            `DELETE FROM public.policy_settings
              WHERE tenant_id = $1 AND scope = $2 AND key = $3`,
            [ctx.tenant, RETURNS_CONFIG_SCOPE, key]
          );
        } else {
          await c.query(
            `INSERT INTO public.policy_settings (tenant_id, scope, key, value, updated_at, updated_by)
             VALUES ($1, $2, $3, $4, now(), $5::uuid)
             ON CONFLICT (tenant_id, scope, key)
             DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
            [ctx.tenant, RETURNS_CONFIG_SCOPE, key, String(days), ctx.actorId]
          );
        }
        await writeSellerAudit(c, {
          tenantId: ctx.tenant,
          actorId: ctx.actorId,
          ipAddress: ctx.ipAddress,
          action: isWindow ? "catalog.return_window_set" : "catalog.return_legal_minimum_set",
          entityType: "policy_settings",
          beforeState: { key, days: before[0] ? parseDayCount(before[0].value) : null },
          afterState: { key, days },
        });
        return {
          kind: "ok" as const,
          key,
          days,
          config: await readReturnsConfig(c, ctx.tenant).then((cfg) => ({
            default_window_days: cfg.defaultWindowDays,
            categories: [...cfg.categories.entries()].map(([id, v]) => ({
              node_id: id,
              window_days: v.windowDays,
              legal_minimum_days: v.legalMinimumDays,
            })),
          })),
        };
      }

      // ---------------------------------------------------------------
      // TREE LIFECYCLE (G2 · Category tree + route-tree /admin/categories):
      // the canonical taxonomy_nodes tree is created / renamed /
      // reparented / statused / deleted HERE — previously the only
      // full-CRUD editor in admin edited the parallel pet_product_
      // categories store, so an operator could "manage categories" and
      // change nothing on the storefront. Path + depth are materialized
      // on every node; a slug change or a reparent rewrites the whole
      // subtree's path prefix (and depth, for reparents) in the same
      // transaction, so the storefront's path reads never see a torn
      // tree. Deletes are guarded: a node with children or with any
      // product/listing attachment is refused (archive it instead) —
      // a delete can never orphan a live attachment.
      if (action === "create_node") {
        const name = String(b.name || "").trim();
        if (!name) return { kind: "bad" as const, error: "name is required" };
        const slugifyLocal = (s: string) =>
          s.toLowerCase().trim().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
        const slug = slugifyLocal(String(b.slug || name));
        if (!slug) return { kind: "bad" as const, error: "slug is required" };
        const nodeType = ["animal", "category", "subcategory"].includes(String(b.node_type))
          ? String(b.node_type)
          : "category";
        const parentId = b.parent_id ? String(b.parent_id) : null;
        if (parentId && !isUuid(parentId)) return { kind: "bad" as const, error: "parent_id must be a uuid" };
        let parent: any = null;
        if (parentId) {
          parent = await nodeById(c, ctx.tenant, parentId);
          if (!parent) return { kind: "missing" as const, what: "Parent category node" };
        }
        const { rows: sib } = await c.query(
          `SELECT id FROM public.taxonomy_nodes
            WHERE tenant_id = $1 AND slug = $2 AND parent_id IS NOT DISTINCT FROM $3::uuid
            LIMIT 1`,
          [ctx.tenant, slug, parentId],
        );
        if (sib.length) {
          return { kind: "state" as const, error: `A sibling category with slug "${slug}" already exists.` };
        }
        const path = parent ? `${parent.path}/${slug}` : slug;
        // depth is carried by the GET; nodeById does not select it — read it.
        let parentDepth = 0;
        if (parent) {
          const { rows: pd } = await c.query(
            `SELECT depth FROM public.taxonomy_nodes WHERE tenant_id = $1 AND id = $2::uuid`,
            [ctx.tenant, parentId],
          );
          parentDepth = Number(pd[0]?.depth ?? 0);
        }
        const { rows: created } = await c.query(
          `INSERT INTO public.taxonomy_nodes
             (tenant_id, parent_id, node_type, name, display_name, slug, path, depth, sort_order, status, is_gated, is_featured)
           VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, 'draft', false, false)
           RETURNING id`,
          [
            ctx.tenant,
            parentId,
            nodeType,
            name,
            String(b.display_name || name),
            slug,
            path,
            parent ? parentDepth + 1 : 0,
            Number.isFinite(Number(b.sort_order)) ? Math.trunc(Number(b.sort_order)) : 0,
          ],
        );
        const newId = String(created[0].id);
        await writeSellerAudit(c, {
          tenantId: ctx.tenant,
          actorId: ctx.actorId,
          ipAddress: ctx.ipAddress,
          action: "catalog.category_created",
          entityType: "taxonomy_node",
          entityId: newId,
          afterState: { name, slug, path, parent_id: parentId, node_type: nodeType, status: "draft" },
        });
        return { kind: "ok" as const, node_id: newId, path, status: "draft" };
      }

      if (action === "update_node") {
        const nodeId = String(b.node_id || "");
        if (!isUuid(nodeId)) return { kind: "bad" as const, error: "node_id must be a uuid" };
        const node = await nodeById(c, ctx.tenant, nodeId);
        if (!node) return { kind: "missing" as const, what: "Category node" };
        const sets: string[] = [];
        const params: unknown[] = [ctx.tenant, nodeId];
        const push = (col: string, v: unknown) => {
          params.push(v);
          sets.push(`${col} = $${params.length}`);
        };
        if (typeof b.name === "string" && b.name.trim()) push("name", b.name.trim());
        if (typeof b.display_name === "string") push("display_name", b.display_name.trim() || null);
        if (b.sort_order !== undefined && Number.isFinite(Number(b.sort_order))) push("sort_order", Math.trunc(Number(b.sort_order)));
        if (b.is_featured !== undefined) push("is_featured", b.is_featured === true);
        // Slug change: rewrite this node's path and every descendant's
        // path prefix in the same transaction.
        let slugChange: { from: string; to: string } | null = null;
        if (typeof b.slug === "string" && b.slug.trim()) {
          const slugifyLocal = (s: string) =>
            s.toLowerCase().trim().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
          const newSlug = slugifyLocal(b.slug);
          if (newSlug && newSlug !== node.slug) {
            const { rows: sib } = await c.query(
              `SELECT id FROM public.taxonomy_nodes
                WHERE tenant_id = $1 AND slug = $2 AND parent_id IS NOT DISTINCT FROM (
                  SELECT parent_id FROM public.taxonomy_nodes WHERE tenant_id = $1 AND id = $3::uuid)
                AND id <> $3::uuid LIMIT 1`,
              [ctx.tenant, newSlug, nodeId],
            );
            if (sib.length) return { kind: "state" as const, error: `A sibling category with slug "${newSlug}" already exists.` };
            slugChange = { from: String(node.slug), to: newSlug };
            push("slug", newSlug);
          }
        }
        if (sets.length === 0) return { kind: "bad" as const, error: "Nothing to update" };
        const beforePath = String(node.path);
        const beforeSlug = String(node.slug);
        await c.query(
          `UPDATE public.taxonomy_nodes SET ${sets.join(", ")}, updated_at = now()
            WHERE tenant_id = $1 AND id = $2::uuid`,
          params,
        );
        if (slugChange) {
          const oldPath = beforePath;
          const newPath = oldPath.slice(0, oldPath.length - slugChange.from.length) + slugChange.to;
          await c.query(
            `UPDATE public.taxonomy_nodes SET path = $3, updated_at = now()
              WHERE tenant_id = $1 AND id = $2::uuid`,
            [ctx.tenant, nodeId, newPath],
          );
          await c.query(
            `UPDATE public.taxonomy_nodes
                SET path = $3 || substr(path, $4), updated_at = now()
              WHERE tenant_id = $1 AND path LIKE $2`,
            [ctx.tenant, `${oldPath}/%`, newPath, oldPath.length + 1],
          );
          node.path = newPath;
        }
        await writeSellerAudit(c, {
          tenantId: ctx.tenant,
          actorId: ctx.actorId,
          ipAddress: ctx.ipAddress,
          action: "catalog.category_updated",
          entityType: "taxonomy_node",
          entityId: nodeId,
          beforeState: { name: node.name, slug: beforeSlug, path: beforePath },
          afterState: { fields: sets.map((s) => s.split(" ")[0]), slug_change: slugChange },
        });
        return { kind: "ok" as const, node_id: nodeId, path: node.path };
      }

      if (action === "reparent_node") {
        const nodeId = String(b.node_id || "");
        const newParentId = b.new_parent_id ? String(b.new_parent_id) : null;
        if (!isUuid(nodeId)) return { kind: "bad" as const, error: "node_id must be a uuid" };
        if (newParentId && !isUuid(newParentId)) return { kind: "bad" as const, error: "new_parent_id must be a uuid" };
        if (newParentId === nodeId) return { kind: "bad" as const, error: "A category cannot be its own parent." };
        const node = await nodeById(c, ctx.tenant, nodeId);
        if (!node) return { kind: "missing" as const, what: "Category node" };
        let parent: any = null;
        let parentDepth = -1;
        if (newParentId) {
          parent = await nodeById(c, ctx.tenant, newParentId);
          if (!parent) return { kind: "missing" as const, what: "New parent category node" };
          // Cycle refusal: the new parent must not live inside the
          // moved subtree.
          if (String(parent.path) === String(node.path) || String(parent.path).startsWith(`${node.path}/`)) {
            return { kind: "state" as const, error: "Cannot move a category under its own descendant." };
          }
          const { rows: pd } = await c.query(
            `SELECT depth FROM public.taxonomy_nodes WHERE tenant_id = $1 AND id = $2::uuid`,
            [ctx.tenant, newParentId],
          );
          parentDepth = Number(pd[0]?.depth ?? 0);
        }
        const { rows: nd } = await c.query(
          `SELECT depth FROM public.taxonomy_nodes WHERE tenant_id = $1 AND id = $2::uuid`,
          [ctx.tenant, nodeId],
        );
        const oldDepth = Number(nd[0]?.depth ?? 0);
        const newDepth = parentDepth + 1;
        const delta = newDepth - oldDepth;
        const oldPath = String(node.path);
        const newPath = parent ? `${parent.path}/${node.slug}` : String(node.slug);
        await c.query(
          `UPDATE public.taxonomy_nodes
              SET parent_id = $3::uuid, path = $4, depth = $5, updated_at = now()
            WHERE tenant_id = $1 AND id = $2::uuid`,
          [ctx.tenant, nodeId, newParentId, newPath, newDepth],
        );
        await c.query(
          `UPDATE public.taxonomy_nodes
              SET path = $3 || substr(path, $4), depth = depth + $5, updated_at = now()
            WHERE tenant_id = $1 AND path LIKE $2`,
          [ctx.tenant, `${oldPath}/%`, newPath, oldPath.length + 1, delta],
        );
        await writeSellerAudit(c, {
          tenantId: ctx.tenant,
          actorId: ctx.actorId,
          ipAddress: ctx.ipAddress,
          action: "catalog.category_reparented",
          entityType: "taxonomy_node",
          entityId: nodeId,
          beforeState: { path: oldPath, depth: oldDepth },
          afterState: { path: newPath, depth: newDepth, parent_id: newParentId },
        });
        return { kind: "ok" as const, node_id: nodeId, path: newPath, depth: newDepth };
      }

      if (action === "set_node_status") {
        const nodeId = String(b.node_id || "");
        const status = String(b.status || "").trim();
        if (!isUuid(nodeId)) return { kind: "bad" as const, error: "node_id must be a uuid" };
        if (!["draft", "published", "archived"].includes(status)) {
          return { kind: "bad" as const, error: "status must be draft, published or archived (the store's CHECK vocabulary)" };
        }
        const node = await nodeById(c, ctx.tenant, nodeId);
        if (!node) return { kind: "missing" as const, what: "Category node" };
        await c.query(
          `UPDATE public.taxonomy_nodes SET status = $3, updated_at = now()
            WHERE tenant_id = $1 AND id = $2::uuid`,
          [ctx.tenant, nodeId, status],
        );
        await writeSellerAudit(c, {
          tenantId: ctx.tenant,
          actorId: ctx.actorId,
          ipAddress: ctx.ipAddress,
          action: "catalog.category_status_set",
          entityType: "taxonomy_node",
          entityId: nodeId,
          beforeState: { status: node.status },
          afterState: { status },
        });
        return { kind: "ok" as const, node_id: nodeId, status };
      }

      if (action === "delete_node") {
        const nodeId = String(b.node_id || "");
        if (!isUuid(nodeId)) return { kind: "bad" as const, error: "node_id must be a uuid" };
        const node = await nodeById(c, ctx.tenant, nodeId);
        if (!node) return { kind: "missing" as const, what: "Category node" };
        const { rows: usage } = await c.query(
          `SELECT
             (SELECT count(*)::int FROM public.taxonomy_nodes WHERE tenant_id = $1 AND parent_id = $2::uuid) AS children,
             (SELECT count(*)::int FROM public.product_taxonomy_nodes WHERE tenant_id = $1 AND taxonomy_node_id = $2::uuid) AS product_links,
             (SELECT count(*)::int FROM public.seller_listings WHERE tenant_id = $1 AND category_id = $2::uuid) AS listings,
             (SELECT count(*)::int FROM public.node_filters WHERE node_id = $2::uuid) AS filters`,
          [ctx.tenant, nodeId],
        );
        const u = usage[0] ?? {};
        const blockers = [
          Number(u.children ?? 0) > 0 ? `${u.children} child categories` : null,
          Number(u.product_links ?? 0) > 0 ? `${u.product_links} product links` : null,
          Number(u.listings ?? 0) > 0 ? `${u.listings} seller listings` : null,
          Number(u.filters ?? 0) > 0 ? `${u.filters} attribute filters` : null,
        ].filter(Boolean);
        if (blockers.length) {
          return {
            kind: "state" as const,
            error: `Category "${node.name}" is in use (${blockers.join(", ")}) — reassign or archive it instead of deleting.`,
          };
        }
        await c.query(
          `DELETE FROM public.seller_category_approvals WHERE node_id = $1::uuid`,
          [nodeId],
        ).catch(() => undefined);
        await c.query(
          `DELETE FROM public.taxonomy_nodes WHERE tenant_id = $1 AND id = $2::uuid`,
          [ctx.tenant, nodeId],
        );
        await writeSellerAudit(c, {
          tenantId: ctx.tenant,
          actorId: ctx.actorId,
          ipAddress: ctx.ipAddress,
          action: "catalog.category_deleted",
          entityType: "taxonomy_node",
          entityId: nodeId,
          beforeState: { name: node.name, slug: node.slug, path: node.path, status: node.status },
        });
        return { kind: "ok" as const, node_id: nodeId, deleted: true };
      }

      return {
        kind: "bad" as const,
        error: `Unknown action "${action}". Actions: set_gated, decide_category_approval, reassign_item, reassign_listing, set_return_window, set_legal_minimum, create_node, update_node, reparent_node, set_node_status, delete_node.`,
      };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (out.kind === "bad") return NextResponse.json({ error: out.error }, { status: 400 });
    if (out.kind === "missing") return NextResponse.json({ error: `${out.what} not found in this tenant` }, { status: 404 });
    if (out.kind === "state") return NextResponse.json({ error: out.error }, { status: 409 });
    const { kind: _kind, ...rest } = out;
    return NextResponse.json(rest);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "catalog category action failed" }, { status: 500 });
  }
}
