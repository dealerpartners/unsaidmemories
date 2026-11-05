import { getAdminContext } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { PageHead, StaffDenied, StatusBadge, fmtDate } from "@/components/admin/ui";
import { CollectionCreateForm, CollectionActiveToggle } from "@/components/admin/EcommerceWidgets";

export const dynamic = "force-dynamic";

/** Ecommerce → Product Collections: the storefront's collections with
 *  linked product counts (product_collections). Design collections —
 *  a design saved into a folder in the Studio — publish into these. */
export default async function EcommerceCollectionsPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;

  const db = createServerClient();
  const { data: collections } = await db
    .from("collections")
    .select("id, type, name, slug, framing_copy, starts_on, ends_on, is_active, created_at")
    .order("created_at", { ascending: true });
  const counts = new Map<string, number>();
  const { data: links } = await db.from("product_collections").select("collection_id");
  for (const l of links ?? []) counts.set(l.collection_id as string, (counts.get(l.collection_id as string) ?? 0) + 1);

  return (
    <div>
      <PageHead title="Product Collections" />
      <div className="adm-grid adm-grid-2" style={{ alignItems: "start" }}>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr><th>Collection</th><th>Type</th><th>Products</th><th>Window</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {(collections ?? []).map((c) => (
                <tr key={c.id as string}>
                  <td>
                    <strong>{c.name as string}</strong>
                    <br />
                    <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
                      /collections/{c.slug as string}
                      {c.framing_copy ? ` · ${String(c.framing_copy).slice(0, 60)}…` : ""}
                    </span>
                  </td>
                  <td>{c.type as string}</td>
                  <td>{counts.get(c.id as string) ?? 0}</td>
                  <td style={{ fontSize: 12 }}>
                    {c.starts_on || c.ends_on ? `${c.starts_on ? fmtDate(c.starts_on as string) : "…"} → ${c.ends_on ? fmtDate(c.ends_on as string) : "…"}` : "Always on"}
                  </td>
                  <td><StatusBadge value={c.is_active ? "active" : "inactive"} /></td>
                  <td><CollectionActiveToggle id={c.id as string} isActive={Boolean(c.is_active)} /></td>
                </tr>
              ))}
              {(collections ?? []).length === 0 && (
                <tr><td colSpan={6} style={{ color: "var(--muted-foreground)" }}>No collections yet — create the first one.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="adm-card">
          <h2>Create collection</h2>
          <CollectionCreateForm />
          <p className="adm-help">
            Products are linked to a collection from the product catalog and from the Design
            Studio&apos;s collection builder; publishing a studio collection lands its products here.
          </p>
        </div>
      </div>
    </div>
  );
}
