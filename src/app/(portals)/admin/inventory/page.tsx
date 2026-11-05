import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";
import { listInventory, listWarehouses, listWarehouseLocations, listSupplierCatalog } from "@/lib/orders/erp";
import { InventoryRowActions, ReceiveStockForm, TransferForm } from "@/components/admin/erp-actions";
import { PageHead } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/**
 * Inventory — the real ERP inventory module (owner order, 2026-10-31).
 * Formerly pushed to /admin/inventory/stock because the (portals)
 * tabbed Products & Inventory placeholder occupied /admin/inventory;
 * that placeholder is retired and the native ERP surface lives here,
 * on the teal .adm-* system. Stock balances, reorder recommendations,
 * the full supplier catalog, receive/transfer forms, bin locations,
 * and recent movements — every change writes a movement record.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cq?: string; cpage?: string }>;
}) {
  const { q, cq, cpage } = await searchParams;
  const catalogPage = Math.max(1, Number(cpage || 1) || 1);
  const [rows, warehouses, locations, catalog] = await Promise.all([
    listInventory(q), listWarehouses(), listWarehouseLocations(),
    listSupplierCatalog({ search: cq || undefined, page: catalogPage }),
  ]);
  const sb = createServerClient();
  const [{ data: variants }, { data: movements }] = await Promise.all([
    sb.from("product_variants").select("id, sku, size, color, products(name)")
      .eq("tenant_id", PLATFORM_TENANT_ID).eq("is_active", true).order("sku").limit(200),
    sb.from("erp_inventory_movements").select("*").eq("tenant_id", PLATFORM_TENANT_ID)
      .order("created_at", { ascending: false }).limit(20),
  ]);
  const variantOptions = (variants || []).map((v: any) => ({
    id: v.id, label: `${v.products?.name || "Product"} — ${v.sku}${v.size ? ` / ${v.size}` : ""}${v.color ? ` / ${v.color}` : ""}`,
  }));
  const warehouseOptions = warehouses.map((w: any) => ({ id: w.id, label: `${w.name} (${w.code})` }));
  const recommendations = rows.filter((r: any) => r.rule && Number(r.on_hand) <= Number(r.rule.reorder_point));

  // ── Stock joins for the catalog section (best effort, never fatal) ──
  const stockByCatalog = new Map<string, string>();
  const designByCatalog = new Map<string, string>();
  try {
    const catalogIds = (catalog.products || []).map((p: any) => String(p.id));
    if (catalogIds.length) {
      const { data: linked } = await sb.from("products").select("id, source_product_id").in("source_product_id", catalogIds);
      const bySource = new Map<string, string>();
      for (const p of linked || []) {
        if (p.source_product_id != null) bySource.set(String(p.source_product_id), String(p.id));
      }
      if (bySource.size) {
        const storefrontIds = [...bySource.values()];
        const { data: vars } = await sb.from("product_variants").select("id, product_id, stock_quantity").in("product_id", storefrontIds);
        const variantIds = (vars || []).map((v: any) => String(v.id));
        const qtyByProduct = new Map<string, number>();
        for (const v of vars || []) {
          if (v.stock_quantity != null) qtyByProduct.set(String(v.product_id), (qtyByProduct.get(String(v.product_id)) || 0) + Number(v.stock_quantity));
        }
        const balByVariant = new Map<string, number>();
        if (variantIds.length) {
          const { data: bals } = await sb.from("erp_inventory_balances").select("sku_id, on_hand, reserved").in("sku_id", variantIds);
          for (const b of bals || []) {
            balByVariant.set(String(b.sku_id), Number(b.on_hand || 0) - Number(b.reserved || 0));
          }
        }
        const varProduct = new Map<string, string>();
        for (const v of vars || []) varProduct.set(String(v.id), String(v.product_id));
        const balByProduct = new Map<string, number>();
        for (const [vid, avail] of balByVariant) {
          const pid = varProduct.get(vid);
          if (pid) balByProduct.set(pid, (balByProduct.get(pid) || 0) + avail);
        }
        for (const [sourceId, pid] of bySource) {
          if (balByProduct.has(pid)) stockByCatalog.set(sourceId, `${balByProduct.get(pid)} on hand`);
          else if (qtyByProduct.has(pid)) stockByCatalog.set(sourceId, `${qtyByProduct.get(pid)} in variant stock`);
          designByCatalog.set(sourceId, pid);
        }
      }
    }
  } catch { /* no linked storefront stock — columns render "—" honestly */ }

  const designByVariantProduct = new Map<string, string>();
  try {
    const productIds = [...new Set(rows.map((r: any) => r.variant?.product_id).filter(Boolean))].map(String);
    if (productIds.length) {
      const { data: prods } = await sb.from("products").select("id, source_product_id").in("id", productIds);
      for (const p of prods || []) {
        if (p.source_product_id != null) designByVariantProduct.set(String(p.id), String(p.source_product_id));
      }
    }
  } catch { /* balance rows fall back to the studio picker link */ }

  const catalogTotalPages = Math.max(1, Math.ceil((catalog.total || 0) / (catalog.perPage || 48)));
  const catalogHref = (over: { cq?: string; cpage?: number }) => {
    const merged: Record<string, string> = {};
    if (q) merged.q = q;
    const nextCq = over.cq !== undefined ? over.cq : cq;
    if (nextCq) merged.cq = nextCq;
    if (over.cpage !== undefined && over.cpage > 1) merged.cpage = String(over.cpage);
    const qs = new URLSearchParams(merged).toString();
    return qs ? `/admin/inventory?${qs}` : "/admin/inventory";
  };

  return (
    <div>
      <PageHead
        title="Inventory"
      />

      {/* Stock balances search */}
      <form method="get" className="adm-page-head" style={{ marginBottom: 16, gap: 10 }}>
        <input className="adm-input" name="q" defaultValue={q || ""} placeholder="Search SKU, product, or bin…" style={{ maxWidth: 320 }} />
        <button className="adm-btn adm-btn-sm" type="submit">Search</button>
      </form>

      {/* Stock balances table */}
      <div className="adm-table-wrap" style={{ marginBottom: 16 }}>
        <table className="adm-table">
          <thead>
            <tr><th>Item</th><th>SKU</th><th>Variant</th><th>Warehouse</th><th>Bin</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Reorder</th><th>Unit cost</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {rows.map((r: any) => {
              const low = r.rule && Number(r.on_hand) <= Number(r.rule.reorder_point);
              const catalogId = r.variant?.product_id ? designByVariantProduct.get(String(r.variant.product_id)) : undefined;
              const designHref = catalogId
                ? `/admin/studio/new-design?catalogProduct=${encodeURIComponent(catalogId)}&name=${encodeURIComponent(r.variant?.products?.name || r.variant?.sku || "")}`
                : "/admin/studio";
              return (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.variant?.products?.name || "—"}</td>
                  <td><code style={{ fontSize: 12 }}>{r.variant?.sku || String(r.sku_id).slice(0, 8)}</code></td>
                  <td>{r.variant?.size || ""}{r.variant?.color ? ` / ${r.variant.color}` : ""}</td>
                  <td>{r.warehouse?.name || "—"}</td>
                  <td>{r.bin_location || "—"}</td>
                  <td style={{ fontWeight: 600 }}>{Number(r.on_hand)}</td>
                  <td>{Number(r.reserved || 0)}</td>
                  <td>{r.available}</td>
                  <td>{r.rule ? Number(r.rule.reorder_point) : "—"}</td>
                  <td>{r.unit_cost != null ? `$${Number(r.unit_cost).toFixed(2)}` : "—"}</td>
                  <td>
                    <span className={`adm-badge ${low ? "adm-badge-red" : r.inventory_status === "available" ? "adm-badge-green" : ""}`}>
                      {low ? "reorder" : r.inventory_status}
                    </span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <InventoryRowActions skuId={r.sku_id} warehouseId={r.warehouse_id} skuLabel={r.variant?.sku || ""} />
                    {" "}
                    <a className="adm-btn adm-btn-ghost adm-btn-sm" href={designHref} data-tip="Start the guided design flow with this item's product already picked — supplier, project name, and price come first, then the studio opens ready.">Design</a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="adm-empty">No stock balances yet — receive stock below to create the first one.</div>}
      </div>

      {/* Reorder recommendations */}
      {recommendations.length > 0 && (
        <div className="adm-card" style={{ marginBottom: 16 }}>
          <h2>Reorder recommendations</h2>
          {recommendations.map((r: any) => (
            <div key={r.id} style={{ fontSize: 13, padding: "4px 0" }}>
              <strong>{r.variant?.sku || String(r.sku_id).slice(0, 8)}</strong> — {Number(r.on_hand)} on hand vs reorder point {Number(r.rule.reorder_point)}.
              Suggested order: {Math.max(0, Number(r.rule.maximum_stock || r.rule.economic_order_quantity || 0) - Number(r.on_hand))} units
              {r.rule.lead_time_days ? ` · lead time ${r.rule.lead_time_days}d` : ""}. Create it from Purchasing.
            </div>
          ))}
        </div>
      )}

      {/* Full catalog inventory */}
      <div className="adm-card" style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 16px 0" }}>
          <h2>Full catalog inventory — all {catalog.total} supplier products</h2>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", margin: "0 0 12px" }}>
            Supplier variants carry no stock column of their own: “Warehouse stock” sums erp_inventory_balances
            (and falls back to variant stock_quantity) only where a storefront product links back to the catalog
            product — otherwise it honestly shows “—”, never a guessed zero.
          </p>
          <form method="get" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            {q ? <input type="hidden" name="q" value={q} /> : null}
            <input className="adm-input" name="cq" defaultValue={cq || ""} placeholder="Search the full catalog…" style={{ maxWidth: 320 }} />
            <button className="adm-btn adm-btn-sm" type="submit">Search catalog</button>
          </form>
        </div>
        <div className="adm-table-wrap" style={{ border: 0, borderRadius: 0 }}>
          <table className="adm-table">
            <thead>
              <tr><th>Product</th><th>Brand</th><th>Variants</th><th>Warehouse stock</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {(catalog.products || []).map((p: any) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.name || "—"}</td>
                  <td>{p.brand_name || "—"}</td>
                  <td>{p.variant_count ?? "—"}</td>
                  <td>{stockByCatalog.get(String(p.id)) || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <a className="adm-btn adm-btn-sm" href={`/admin/studio/new-design?catalogProduct=${encodeURIComponent(String(p.id))}&name=${encodeURIComponent(p.name || "")}`} data-tip="Start the guided design flow with this product already picked — choose the supplier, name the project, set the price, then the studio opens ready.">Design</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(catalog.products || []).length === 0 && <div className="adm-empty">No catalog products match this search.</div>}
        <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 16, fontSize: 13 }}>
          <span>Page {catalogPage} of {catalogTotalPages}</span>
          {catalogPage > 1 && <Link className="adm-btn adm-btn-ghost adm-btn-sm" href={catalogHref({ cpage: catalogPage - 1 })}>← Previous</Link>}
          {catalogPage < catalogTotalPages && <Link className="adm-btn adm-btn-ghost adm-btn-sm" href={catalogHref({ cpage: catalogPage + 1 })}>Next →</Link>}
        </div>
      </div>

      {/* Receive + Transfer */}
      <div className="adm-grid adm-grid-2" style={{ marginBottom: 16 }}>
        <div className="adm-card">
          <h2>Restock / add inventory</h2>
          <ReceiveStockForm variants={variantOptions} warehouses={warehouseOptions} />
        </div>
        <div className="adm-card">
          <h2>Transfer between warehouses</h2>
          <TransferForm variants={variantOptions} warehouses={warehouseOptions} />
        </div>
      </div>

      {/* Bin locations + Recent movements */}
      <div className="adm-grid adm-grid-2">
        <div className="adm-card">
          <h2>Bin locations</h2>
          {locations.length === 0 && <div className="adm-empty">No locations defined.</div>}
          {locations.map((l: any) => (
            <div key={l.id} style={{ fontSize: 13, padding: "3px 0" }}>
              <strong>{l.code}</strong> — {l.name} ({l.location_type}){l.bin ? ` · bin ${l.bin}` : ""}{l.is_pickable ? " · pickable" : ""}
            </div>
          ))}
        </div>
        <div className="adm-card">
          <h2>Recent stock movements</h2>
          {(movements || []).length === 0 && <div className="adm-empty">No movements recorded yet.</div>}
          {(movements || []).map((m: any) => (
            <div key={m.id} style={{ fontSize: 13, padding: "3px 0" }}>
              {m.movement_type} · {Number(m.quantity) > 0 ? "+" : ""}{Number(m.quantity)} · {m.reason || m.source_type || ""}
              {" "}<span style={{ color: "var(--muted-foreground)" }}>{new Date(m.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
