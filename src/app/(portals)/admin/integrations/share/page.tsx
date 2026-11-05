import type { Metadata } from "next";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import { TENANT_ID } from "@/lib/admin/gate";
import Subnav from "../subnav";

export const metadata: Metadata = { title: "Share a product — Admin" };
export const dynamic = "force-dynamic";

export default async function ShareIndexPage() {
  const db = createServerClient();
  const { data: products } = await db
    .from("products")
    .select("id, name, slug, status, created_at")
    .eq("tenant_id", TENANT_ID)
    .order("created_at", { ascending: false })
    .limit(200);
  return (
    <div>
      <div className="fabric-page-head">
        <h1>Share a product</h1>
      </div>
      <Subnav />
      <div style={{ margin: "0 0 16px" }}>
        <Link
          href="/admin/integrations/social-post"
          className="adm-btn"
          data-tip="The guided way to write one social post — pick what you're sharing, write it once with a preview per network, then choose where it goes."
        >
          Create a social post — step by step
        </Link>
      </div>
      <div className="adm-card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="adm-table">
          <thead>
            <tr><th>Product</th><th>Status</th><th>Created</th><th></th></tr>
          </thead>
          <tbody>
            {(products ?? []).map((p) => (
              <tr key={p.id}>
                <td><b>{p.name}</b><div className="int-muted">/product/{p.slug}</div></td>
                <td><span className="fabric-pill gray">{p.status}</span></td>
                <td>{new Date(p.created_at).toLocaleDateString()}</td>
                <td>
                  {p.status === "published" ? (
                    <Link href={`/admin/integrations/share/${p.id}`} className="adm-btn adm-btn-sm">
                      Share
                    </Link>
                  ) : (
                    <span className="int-muted">Publish it first — only published products can be shared.</span>
                  )}
                </td>
              </tr>
            ))}
            {(products ?? []).length === 0 && (
              <tr><td colSpan={4}><div className="adm-empty">No products yet.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
