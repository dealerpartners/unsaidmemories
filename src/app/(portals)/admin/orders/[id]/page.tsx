import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderDetail, ORDER_TRANSITIONS } from "@/lib/orders/erp";
import { OrderTransition, OrderNoteForm, SupplierPush } from "@/components/admin/erp-actions";

export const metadata: Metadata = { title: "Order Detail — Admin" };
export const dynamic = "force-dynamic";

const money = (v: unknown) => `$${Number(v || 0).toFixed(2)}`;

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getOrderDetail(id);
  if (!detail) notFound();
  const { order, lines, addresses, fulfillments, shipments, supplierFulfillment, history, notes, returns } = detail;
  const shipTo = addresses.find((a: any) => a.address_type === "shipping") || addresses[0];
  const allowed = ORDER_TRANSITIONS[order.status] || [];

  return (
    <div className="[font-family:Inter,system-ui,sans-serif]">
      <div className="fabric-page-head">
        <h1>Order {order.order_number}</h1>
        <p>
          <span className="adm-badge" data-tip="Where this order is right now in its journey. Use the Actions box (right side) to move it forward.">{order.status}</span>{" "}
          {order.is_rush && <span className="adm-badge adm-badge-red" data-tip="Rush order — the customer paid for speed. Handle this one first.">RUSH</span>}{" "}
          placed {order.order_date ? new Date(order.order_date).toLocaleString() : "—"}
          {order.sla_due_at ? ` · SLA ${new Date(order.sla_due_at).toLocaleString()}` : ""}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <div className="adm-card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="adm-table">
              <thead>
                <tr><th>Item</th><th>SKU</th><th>Qty</th><th>Picked</th><th>Packed</th><th>Shipped</th><th>Unit</th><th>Line total</th><th>Status</th></tr>
              </thead>
              <tbody>
                {lines.map((l: any) => (
                  <tr key={l.id}>
                    <td>{l.description || l.variant?.products?.name || "—"}</td>
                    <td className="font-mono text-xs">{l.variant?.sku || String(l.sku_id || "").slice(0, 8)}</td>
                    <td>{Number(l.quantity)}</td>
                    <td>{Number(l.quantity_picked || 0)}</td>
                    <td>{Number(l.quantity_packed || 0)}</td>
                    <td>{Number(l.quantity_shipped || 0)}</td>
                    <td>{money(l.unit_price)}</td>
                    <td style={{ fontWeight: 600 }}>{money(l.line_total)}</td>
                    <td><span className="adm-badge">{l.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lines.length === 0 && <div className="adm-empty">No lines on this order.</div>}
          </div>

          <div className="adm-card">
            <h2 className="fabric-section-title">Fulfillment</h2>
            {fulfillments.length === 0 && <div className="adm-empty">No ERP fulfillment yet — it is created when the order is released.</div>}
            {fulfillments.map((f: any) => (
              <div key={f.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #eee" }}>
                <span className="font-mono text-xs">{f.fulfillment_number}</span>
                <span className="adm-badge">{f.status}</span>
                <span style={{ fontSize: 13 }}>{(f.method || "ship").replace(/_/g, " ")}</span>
                <span style={{ flex: 1 }} />
                <Link href={`/admin/orders/${order.id}/packing-slip`} className="adm-btn adm-btn-sm adm-btn-ghost" data-tip="Print the packing slip — the paper that goes inside this parcel.">Packing slip</Link>
                <Link href="/admin/fulfillment" className="adm-btn adm-btn-sm adm-btn-ghost" data-tip="Open the packing queue — every order being picked and packed, in one list.">Queue</Link>
              </div>
            ))}
            {shipments.map((s: any) => (
              <div key={s.id} style={{ fontSize: 13, padding: "6px 0" }}>
                Shipment {s.shipment_number} · {s.status}
                {s.tracking_number && (
                  <> · {s.tracking_url
                    ? <a href={s.tracking_url} target="_blank" rel="noreferrer">{s.tracking_number}</a>
                    : s.tracking_number}</>
                )}
              </div>
            ))}
          </div>

          <div className="adm-card">
            <h2 className="fabric-section-title">Supplier fulfillment (POD)</h2>
            {supplierFulfillment.length === 0 && (
              <div className="adm-empty">Not pushed yet. Push sends each line to its routed supplier (Printful draft first — nothing is produced until you confirm).</div>
            )}
            {supplierFulfillment.map((f: any) => (
              <div key={f.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #eee", fontSize: 13 }}>
                <span className="adm-badge">{f.status}</span>
                <span>Provider order: {f.supplier_order_external_id || "—"}</span>
                {f.tracking_number && <span>Tracking: {f.tracking_url ? <a href={f.tracking_url} target="_blank" rel="noreferrer">{f.tracking_number}</a> : f.tracking_number}</span>}
                {f.cost != null && <span>Cost {money(f.cost)}</span>}
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <SupplierPush orderId={order.id} fulfillments={supplierFulfillment} />
            </div>
          </div>

          <div className="adm-card">
            <h2 className="fabric-section-title">Notes & activity</h2>
            <OrderNoteForm orderId={order.id} />
            <div style={{ marginTop: 12 }}>
              {notes.map((n: any) => (
                <div key={n.id} style={{ padding: "6px 0", borderBottom: "1px solid #eee", fontSize: 13 }}>
                  <strong>{n.note_type}</strong> · {new Date(n.created_at).toLocaleString()}
                  <div>{n.body}</div>
                </div>
              ))}
              {history.map((h: any) => (
                <div key={h.id} style={{ padding: "6px 0", borderBottom: "1px solid #eee", fontSize: 13, color: "#555" }}>
                  {h.from_status || "∅"} → <strong>{h.to_status}</strong>
                  {h.reason ? ` — ${h.reason}` : ""} · {new Date(h.changed_at).toLocaleString()}
                </div>
              ))}
              {notes.length === 0 && history.length === 0 && <div className="adm-empty">No activity yet.</div>}
            </div>
          </div>

          {returns.length > 0 && (
            <div className="adm-card">
              <h2 className="fabric-section-title">Returns</h2>
              {returns.map((r: any) => (
                <div key={r.id} style={{ fontSize: 13, padding: "4px 0" }}>
                  {r.rma_number} · <span className="adm-badge adm-badge-amber">{r.status}</span> · {r.reason_code || ""}
                  {" "}<Link href="/admin/returns">Open in Returns</Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div className="adm-card">
            <h2 className="fabric-section-title">Customer</h2>
            <div style={{ fontSize: 14 }}>{order.customer_email || "—"}</div>
            <div style={{ fontSize: 13, color: "#555" }}>{order.customer_phone || ""}</div>
            {shipTo && (
              <div style={{ fontSize: 13, marginTop: 10 }}>
                <strong>Ship to</strong>
                <div>{[shipTo.first_name, shipTo.last_name].filter(Boolean).join(" ")}</div>
                <div>{shipTo.line1}{shipTo.line2 ? `, ${shipTo.line2}` : ""}</div>
                <div>{shipTo.city}, {shipTo.state} {shipTo.postal_code} {shipTo.country_code || ""}</div>
              </div>
            )}
            <div style={{ marginTop: 10, fontSize: 13 }}>
              Method: {(order.fulfillment_method || "ship").replace(/_/g, " ")}
            </div>
          </div>

          <div className="adm-card">
            <h2 className="fabric-section-title">Totals</h2>
            <table className="adm-table">
              <tbody>
                <tr><td>Subtotal</td><td style={{ textAlign: "right" }}>{money(order.subtotal)}</td></tr>
                <tr><td>Discount</td><td style={{ textAlign: "right" }}>−{money(order.discount_total)}</td></tr>
                <tr><td>Tax</td><td style={{ textAlign: "right" }}>{money(order.tax_total)}</td></tr>
                <tr><td>Shipping</td><td style={{ textAlign: "right" }}>{money(order.shipping_total)}</td></tr>
                <tr><td><strong>Total</strong></td><td style={{ textAlign: "right" }}><strong>{money(order.total)}</strong></td></tr>
                <tr><td>Paid</td><td style={{ textAlign: "right" }}>{money(order.amount_paid)}</td></tr>
                <tr><td>Refunded</td><td style={{ textAlign: "right" }}>{money(order.amount_refunded)}</td></tr>
                <tr><td>Balance due</td><td style={{ textAlign: "right" }}>{money(order.balance_due)}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="adm-card">
            <h2 className="fabric-section-title">Actions</h2>
            <OrderTransition orderId={order.id} current={order.status} allowed={allowed} />
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <Link href={`/admin/orders/${order.id}/packing-slip`} className="adm-btn adm-btn-sm adm-btn-ghost" data-tip="Print the packing slip — the paper that goes inside this parcel.">Print packing slip</Link>
              <Link href="/admin/shipping" className="adm-btn adm-btn-sm adm-btn-ghost" data-tip="Go to Shipping to record this parcel's label and tracking number.">Create shipping label</Link>
              <Link href="/admin/returns" className="adm-btn adm-btn-sm adm-btn-ghost" data-tip="Open Returns — handle items customers sent back, and any problems with this order.">Returns & issues</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
