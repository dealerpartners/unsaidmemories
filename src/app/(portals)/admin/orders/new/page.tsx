import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";
import { CreateOrderForm } from "@/components/admin/erp-actions";

export const metadata: Metadata = { title: "Create Order — Admin" };
export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const sb = createServerClient();
  const { data: variants } = await sb.from("product_variants")
    .select("id, sku, size, color, price, products(name)")
    .eq("tenant_id", PLATFORM_TENANT_ID).eq("is_active", true).order("sku").limit(200);
  const options = (variants || []).map((v: any) => ({
    id: v.id,
    label: `${v.products?.name || "Product"} — ${v.sku}${v.size ? ` / ${v.size}` : ""}${v.color ? ` / ${v.color}` : ""}`,
    price: Number(v.price || 0),
  }));
  return (
    <div className="[font-family:Inter,system-ui,sans-serif]">
      <div className="fabric-page-head">
        <h1>Create Order</h1>
      </div>
      <div className="adm-card">
        <CreateOrderForm variants={options} />
      </div>
    </div>
  );
}
