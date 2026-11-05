import Link from "next/link";
import { getAdminContext } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { getTenantRow } from "@/lib/admin/data";
import { PageHead, Kpi, StaffDenied, fmtMoney } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/** Ecommerce (tree 9.4) — overview of the storefront operation:
 *  collections, publishing, orders, shipping, taxes, returns. */
export default async function EcommerceOverviewPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  const db = createServerClient();
  const tenantId = getTenantId();
  const tenant = await getTenantRow();
  const eco = (tenant?.settings.ecommerce as Record<string, unknown>) ?? {};

  const [collections, products, orders, returns, profiles] = await Promise.all([
    db.from("collections").select("id, is_active"),
    db.from("products").select("id, status").eq("tenant_id", tenantId).limit(2000),
    db.from("orders").select("id, total, status").eq("tenant_id", tenantId).limit(1000),
    db.from("erp_return_authorizations").select("id, status").eq("tenant_id", tenantId).limit(500),
    db.from("shipping_profiles").select("id, is_default"),
  ]);
  const published = (products.data ?? []).filter((p) => p.status === "published").length;
  const drafts = (products.data ?? []).filter((p) => p.status === "draft").length;
  const revenue = (orders.data ?? []).reduce((s, o) => s + Number(o.total ?? 0), 0);
  const openReturns = (returns.data ?? []).filter((r) => !["completed", "closed", "rejected"].includes(String(r.status ?? "").toLowerCase())).length;

  const cards = [
    { href: "/admin/ecommerce/collections", tip: "Open your collections — the grouped shelves shoppers browse, like gifts for mothers or new babies.", title: "Product Collections", desc: `${(collections.data ?? []).length} collections, ${(collections.data ?? []).filter((c) => c.is_active).length} active` },
    { href: "/admin/ecommerce/publishing", tip: "Open publishing — put products on sale or take them off, one by one.", title: "Product Publishing", desc: `${published} published · ${drafts} drafts` },
    { href: "/admin/ecommerce/orders", tip: "Open the shop’s order stream — every order the website has taken.", title: "Ecommerce Orders", desc: `${(orders.data ?? []).length} orders · ${fmtMoney(revenue)} gross` },
    { href: "/admin/ecommerce/shipping", tip: "Open shipping settings — what customers are charged for delivery, and how long it takes.", title: "Shipping Settings", desc: `${(profiles.data ?? []).length} shipping profiles` },
    { href: "/admin/ecommerce/taxes", tip: "Open tax settings — how the shop works out sales tax at checkout.", title: "Ecommerce Taxes", desc: String(eco.tax_mode ?? "Tax mode not set") },
    { href: "/admin/ecommerce/returns", tip: "Open returns — the returns waiting on you, and the policy shoppers read.", title: "Ecommerce Returns", desc: `${openReturns} open return authorizations` },
  ];

  return (
    <div>
      <PageHead title="Ecommerce" />
      <div className="adm-grid adm-grid-4" style={{ marginBottom: 16 }}>
        <Kpi label="Collections" value={(collections.data ?? []).length} foot="Storefront groupings" tip="How many collections your shop has — the grouped shelves shoppers browse." />
        <Kpi label="Published Products" value={published} foot={`${drafts} drafts waiting`} tip="Products live in the shop right now, ready for shoppers to buy." />
        <Kpi label="Orders" value={(orders.data ?? []).length} foot={`${fmtMoney(revenue)} gross volume`} tip="Every order the shop has taken, and the total money they add up to before costs." />
        <Kpi label="Open Returns" value={openReturns} foot="RMAs needing action" tip="Returns that still need something from you — a decision, a parcel, or a refund." />
      </div>
      <div className="adm-grid adm-grid-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="adm-card" style={{ textDecoration: "none" }} data-tip={(c as any).tip}>
            <h3>{c.title}</h3>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)" }}>{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
