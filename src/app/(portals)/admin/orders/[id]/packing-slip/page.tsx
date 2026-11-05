import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";
import { PrintButton } from "@/components/admin/erp-actions";

export const metadata: Metadata = { title: "Packing Slip — Admin" };
export const dynamic = "force-dynamic";

// Print-ready packing slip for one order (batch: open several orders' slips
// from the Shipping station). Bin locations come from inventory balances so
// the picker walks to the right shelf.
export default async function PackingSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = createServerClient();
  const { data: order } = await sb.from("erp_orders").select("*").eq("id", id).eq("tenant_id", PLATFORM_TENANT_ID).maybeSingle();
  if (!order) notFound();
  const [{ data: lines }, { data: addresses }] = await Promise.all([
    sb.from("erp_order_lines").select("*").eq("order_id", id).order("created_at"),
    sb.from("erp_order_addresses").select("*").eq("order_id", id),
  ]);
  const skuIds = (lines || []).map((l: any) => l.sku_id).filter(Boolean);
  let bins: Record<string, string> = {};
  let names: Record<string, string> = {};
  if (skuIds.length) {
    const [{ data: balances }, { data: variants }] = await Promise.all([
      sb.from("erp_inventory_balances").select("sku_id, bin_location").in("sku_id", skuIds),
      sb.from("product_variants").select("id, sku").in("id", skuIds),
    ]);
    for (const b of balances || []) if (b.bin_location) bins[b.sku_id] = b.bin_location;
    for (const v of variants || []) names[v.id] = v.sku;
  }
  const shipTo = (addresses || []).find((a: any) => a.address_type === "shipping") || (addresses || [])[0];

  return (
    <div className="[font-family:Inter,system-ui,sans-serif]">
      <div className="fabric-page-head fabric-no-print">
        <h1>Packing Slip — {order.order_number}</h1>
        <p><PrintButton /></p>
      </div>
      <div className="adm-card">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>UnSaid Memories</div>
            <div style={{ fontSize: 13 }}>Packing slip · {order.order_number}</div>
            <div style={{ fontSize: 13 }}>{order.order_date ? new Date(order.order_date).toLocaleString() : ""}</div>
            {order.is_rush && <div><span className="adm-badge adm-badge-red">RUSH</span></div>}
          </div>
          {shipTo && (
            <div style={{ fontSize: 13, textAlign: "right" }}>
              <strong>Ship to</strong>
              <div>{[shipTo.first_name, shipTo.last_name].filter(Boolean).join(" ")}</div>
              <div>{shipTo.line1}</div>
              <div>{shipTo.city}, {shipTo.state} {shipTo.postal_code}</div>
            </div>
          )}
        </div>
        <table className="adm-table" style={{ marginTop: 16 }}>
          <thead><tr><th>Item</th><th>SKU</th><th>Bin</th><th>Qty</th><th>Picked ✓</th></tr></thead>
          <tbody>
            {(lines || []).map((l: any) => (
              <tr key={l.id}>
                <td>{l.description || "—"}</td>
                <td className="font-mono text-xs">{names[l.sku_id] || String(l.sku_id || "").slice(0, 8)}</td>
                <td>{bins[l.sku_id] || "—"}</td>
                <td>{Number(l.quantity)}</td>
                <td>☐</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 13, marginTop: 12 }}>
          Method: {(order.fulfillment_method || "ship").replace(/_/g, " ")} · Customer: {order.customer_email || "—"}
        </div>
      </div>
    </div>
  );
}
