import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";
import { listVendors, listPurchaseBills, listWarehouses } from "@/lib/orders/erp";
import { VendorForm, PurchaseOrderForm, ReceivePoButton } from "@/components/admin/erp-actions";

export const metadata: Metadata = { title: "Purchasing — Admin" };
export const dynamic = "force-dynamic";

const VIEW_LABEL: Record<string, string> = {
  open: "Ordered", received: "Received / Closed", paid: "Received / Closed", partial: "In Transit",
};

export default async function PurchasingPage() {
  const [vendors, bills] = await Promise.all([listVendors(), listPurchaseBills()]);
  const sb = createServerClient();
  const [{ data: variants }, warehouses] = await Promise.all([
    sb.from("product_variants").select("id, sku, size, color, products(name)")
      .eq("tenant_id", PLATFORM_TENANT_ID).eq("is_active", true).order("sku").limit(200),
    listWarehouses(),
  ]);
  const variantOptions = (variants || []).map((v: any) => ({
    id: v.id, label: `${v.products?.name || "Product"} — ${v.sku}`,
  }));
  const vendorName = (id: string) => vendors.find((v: any) => v.id === id)?.legal_name || "—";
  const groups: Record<string, any[]> = { Ordered: [], "In Transit": [], "Received / Closed": [] };
  for (const b of bills) groups[VIEW_LABEL[b.status] || "Ordered"].push(b);

  return (
    <div>
      <div className="fabric-page-head">
        <h1>Purchasing</h1>
      </div>

      <div className="adm-card" style={{ marginBottom: 16 }}>
        <h2 className="fabric-section-title">Create purchase order</h2>
        <PurchaseOrderForm vendors={vendors.map((v: any) => ({ id: v.id, label: v.legal_name }))} variants={variantOptions} />
      </div>

      {Object.entries(groups).map(([label, rows]) => (
        <div key={label} style={{ marginBottom: 16 }}>
          <h2 className="fabric-section-title">{label}</h2>
          <div className="adm-card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="adm-table">
              <thead><tr><th>PO / Bill #</th><th>Vendor</th><th>Total</th><th>Paid</th><th>Balance</th><th>Due</th><th>Status</th><th>Receiving</th></tr></thead>
              <tbody>
                {rows.map((b: any) => (
                  <tr key={b.id}>
                    <td className="font-mono text-xs">{b.bill_number || String(b.id).slice(0, 8)}</td>
                    <td>{vendorName(b.vendor_id)}</td>
                    <td>${Number(b.total || 0).toFixed(2)}</td>
                    <td>${Number(b.amount_paid || 0).toFixed(2)}</td>
                    <td>${(Number(b.total || 0) - Number(b.amount_paid || 0)).toFixed(2)}</td>
                    <td>{b.due_date ? new Date(b.due_date).toLocaleDateString() : "—"}</td>
                    <td><span className="fabric-pill blue">{b.status}</span></td>
                    <td>{b.status !== "received"
                      ? <ReceivePoButton billId={b.id} warehouses={warehouses.map((w: any) => ({ id: w.id, label: w.name }))} />
                      : "✓ received"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div className="adm-empty">None in this stage.</div>}
          </div>
        </div>
      ))}

      <div className="adm-card">
        <h2 className="fabric-section-title">Vendors</h2>
        <VendorForm />
        <table className="adm-table" style={{ marginTop: 12 }}>
          <thead><tr><th>Vendor #</th><th>Legal name</th><th>Email</th><th>Phone</th><th>Terms (days)</th><th>Active</th></tr></thead>
          <tbody>
            {vendors.map((v: any) => (
              <tr key={v.id}>
                <td className="font-mono text-xs">{v.vendor_number || "—"}</td>
                <td>{v.legal_name}</td>
                <td>{v.email || "—"}</td>
                <td>{v.phone || "—"}</td>
                <td>{v.payment_terms_days ?? "—"}</td>
                <td><span className={`fabric-pill ${v.is_active ? "green" : "gray"}`}>{v.is_active ? "active" : "inactive"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {vendors.length === 0 && <div className="adm-empty">No vendors yet — add the first one above.</div>}
      </div>
    </div>
  );
}
