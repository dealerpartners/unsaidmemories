import Link from "next/link";
import { getAdminContext } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { PageHead, StaffDenied, StatusBadge, fmtDate, fmtMoney } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/** Ecommerce → Ecommerce Orders: the storefront order stream (the
 *  `orders` table) — the Orders module works the ERP queue; this view
 *  is the storefront-facing cut. */
export default async function EcommerceOrdersPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;

  const db = createServerClient();
  const { data: orders } = await db
    .from("orders")
    .select("id, status, total, shipping_cost, shipping_method, created_at")
    .eq("tenant_id", getTenantId())
    .order("created_at", { ascending: false })
    .limit(100);
  const gross = (orders ?? []).reduce((s, o) => s + Number(o.total ?? 0), 0);

  return (
    <div>
      <PageHead title="Ecommerce Orders" >
        <Link className="adm-btn" href="/admin/orders" data-tip="Go to the Orders module — the working queue where orders are packed, sent to printers, and tracked.">Open Orders Module</Link>
      </PageHead>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr><th>Order</th><th>Date</th><th>Status</th><th>Shipping method</th><th style={{ textAlign: "right" }}>Shipping</th><th style={{ textAlign: "right" }}>Total</th></tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o) => (
              <tr key={o.id as string}>
                <td>{(o.id as string).slice(0, 8)}</td>
                <td>{fmtDate(o.created_at as string)}</td>
                <td><StatusBadge value={o.status as string} /></td>
                <td>{(o.shipping_method as string) ?? "—"}</td>
                <td style={{ textAlign: "right" }}>{fmtMoney(Number(o.shipping_cost ?? 0))}</td>
                <td style={{ textAlign: "right" }}><strong>{fmtMoney(Number(o.total ?? 0))}</strong></td>
              </tr>
            ))}
            {(orders ?? []).length === 0 && (
              <tr><td colSpan={6} style={{ color: "var(--muted-foreground)" }}>No storefront orders yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
