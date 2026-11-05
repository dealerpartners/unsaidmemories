import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { TENANT_ID } from "@/lib/admin/gate";
import { listPortals, listPushes } from "@/lib/integrations/service";
import Subnav from "../subnav";
import PartnersClient from "./partners-client";

export const metadata: Metadata = { title: "Partner portals — Admin" };
export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  const db = createServerClient();
  const [portals, pushes] = await Promise.all([listPortals(db), listPushes(db)]);
  const { data: products } = await db
    .from("products")
    .select("id, name, status")
    .eq("tenant_id", TENANT_ID)
    .eq("status", "published")
    .order("name");
  const portalName = new Map(portals.map((p) => [p.id, p.name]));
  const productName = new Map((products ?? []).map((p) => [p.id, p.name]));
  return (
    <div>
      <div className="fabric-page-head">
        <h1>Partner portals</h1>
      </div>
      <Subnav />
      <PartnersClient
        portals={portals}
        products={(products ?? []).map((p) => ({ id: p.id, name: p.name }))}
      />
      <h2 style={{ margin: "28px 0 12px" }}>Push history</h2>
      <div className="adm-card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="adm-table">
          <thead>
            <tr><th>When</th><th>Portal</th><th>Product</th><th>Status</th><th>Result</th></tr>
          </thead>
          <tbody>
            {pushes.map((push) => (
              <tr key={push.id}>
                <td>{new Date(push.created_at).toLocaleString()}</td>
                <td>{portalName.get(push.portal_id) ?? push.portal_id}</td>
                <td>{productName.get(push.product_id) ?? push.product_id}</td>
                <td><span className={`int-status ${push.status === "pushed" ? "published" : push.status === "failed" ? "failed" : "scheduled"}`}>{push.status}</span></td>
                <td>
                  {push.external_url ? (
                    <a href={push.external_url} target="_blank" rel="noreferrer">{push.external_url}</a>
                  ) : (
                    <span className="int-muted">{push.error ?? push.external_id ?? "—"}</span>
                  )}
                </td>
              </tr>
            ))}
            {pushes.length === 0 && (
              <tr><td colSpan={5}><div className="adm-empty">No pushes yet.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
