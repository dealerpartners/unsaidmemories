import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import Link from "next/link";

export const metadata: Metadata = { title: "Collections — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminCollectionsPage() {
  const db = createServerClient();
  const { data: collections, count } = await db
    .from("collections")
    .select("id, name, slug, type, is_active, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <div className="fabric-page-head">
        <h1>Collections</h1>
      </div>

      <div className="fabric-toolbar">
        <Link href="/admin/studio/collection-builder" className="adm-btn adm-btn-sm">
          + Build Collection
        </Link>
      </div>

      <div className="adm-card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="adm-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(collections || []).map((c: any) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td>
                  <span className="fabric-pill gray">{c.type || "theme"}</span>
                </td>
                <td>
                  <span className={`fabric-pill ${c.is_active ? "green" : "amber"}`}>
                    {c.is_active ? "active" : "hidden"}
                  </span>
                </td>
                <td>{new Date(c.created_at).toLocaleDateString()}</td>
                <td>
                  <div className="fabric-actions">
                    {c.slug && (
                      <Link href={`/collections/${c.slug}`} className="adm-btn adm-btn-sm">
                        View
                      </Link>
                    )}
                    <Link
                      href={`/admin/studio/collection-builder?collection=${c.id}`}
                      className="adm-btn adm-btn-sm"
                    >
                      Edit
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!collections || collections.length === 0) && (
          <div className="adm-empty">No collections yet. Build one from the studio.</div>
        )}
      </div>
    </div>
  );
}
