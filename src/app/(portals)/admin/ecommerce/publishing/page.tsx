import { getAdminContext } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { PageHead, StaffDenied, StatusBadge, fmtDate } from "@/components/admin/ui";
import { PublishToggle } from "@/components/admin/EcommerceWidgets";

export const dynamic = "force-dynamic";

/** Ecommerce → Product Publishing: every storefront product by status,
 *  with publish / unpublish actions wired to the gated product routes. */
export default async function PublishingPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;

  const db = createServerClient();
  const { data: products } = await db
    .from("products")
    .select("id, name, slug, status, category_id, created_at")
    .eq("tenant_id", getTenantId())
    .order("created_at", { ascending: false })
    .limit(200);
  const { data: categories } = await db.from("categories").select("id, name").eq("tenant_id", getTenantId());
  const catName = new Map((categories ?? []).map((c) => [c.id as string, c.name as string]));

  const counts = { published: 0, draft: 0, other: 0 };
  for (const p of products ?? []) {
    if (p.status === "published") counts.published++;
    else if (p.status === "draft") counts.draft++;
    else counts.other++;
  }

  return (
    <div>
      <PageHead title="Product Publishing" />
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr><th>Product</th><th>Category</th><th>Status</th><th>Created</th><th>Action</th></tr>
          </thead>
          <tbody>
            {(products ?? []).map((p) => (
              <tr key={p.id as string}>
                <td>
                  <strong>{p.name as string}</strong>
                  <br />
                  <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>/products/{p.slug as string}</span>
                </td>
                <td>{p.category_id ? catName.get(p.category_id as string) ?? "—" : "—"}</td>
                <td><StatusBadge value={p.status as string} /></td>
                <td>{fmtDate(p.created_at as string)}</td>
                <td><PublishToggle id={p.id as string} status={p.status as string} /></td>
              </tr>
            ))}
            {(products ?? []).length === 0 && (
              <tr><td colSpan={5} style={{ color: "var(--muted-foreground)" }}>No products yet — designed products appear here as drafts first.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
