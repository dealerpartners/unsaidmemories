import type { Metadata } from "next";
import Link from "next/link";
import { db, T, timeAgo } from "../data";
import { CreateModalButton, SupportSearch } from "../SupportControls";
import "../support.css";

export const metadata: Metadata = { title: "Support Desk — Knowledge base" };
export const dynamic = "force-dynamic";

// Knowledge base (owner's v2 comp) — articles live in the generated
// support_kb_articles table; the agent workspace suggests published
// ones against open tickets.
export default async function SupportKnowledgePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const sb = db();
  let q = sb.from("support_kb_articles").select("*").eq("tenant_id", T()).order("updated_at", { ascending: false }).limit(200);
  if (sp.status) q = q.eq("status", sp.status);
  const { data } = await q;
  let rows = data ?? [];
  if (sp.q) { const n = sp.q.toLowerCase(); rows = rows.filter((a: any) => `${a.title} ${a.summary ?? ""}`.toLowerCase().includes(n)); }

  const statusPill = (s: string) => s === "published" ? { label: "Published", cls: "green" } : s === "in_review" ? { label: "In review", cls: "blue" } : { label: "Draft", cls: "amber" };
  const tabs: [string, string][] = [["", "All articles"], ["published", "Published"], ["draft", "Drafts"], ["in_review", "Needs review"]];

  return (
    <div className="sup"><div className="content">
      <div className="pagehead">
        <div><h1>Knowledge base</h1></div>
        <div className="actions">
          <Link className="btn" href="/admin/help">Help center preview</Link>
          <CreateModalButton label="＋ New article" title="New knowledge article" endpoint="/api/admin/support/kb" fields={[
            { name: "title", label: "Title", placeholder: "Article title", required: true },
            { name: "summary", label: "Summary", placeholder: "One line — what this answers" },
            { name: "body", label: "Body", type: "textarea", placeholder: "The full answer…" },
            { name: "collection", label: "Collection", type: "select", options: ["Customer support", "Getting started", "Billing ops", "Integrations", "Voice", "Internal handbook"] },
            { name: "audience", label: "Audience", type: "select", options: ["public", "agents", "internal"] },
            { name: "status", label: "Status", type: "select", options: ["draft", "in_review", "published"] },
            { name: "owner_name", label: "Owner", placeholder: "Article owner" },
          ]} />
        </div>
      </div>
      <div className="tabs">
        {tabs.map(([value, label]) => (
          <Link key={value} className={`tab ${(sp.status ?? "") === value ? "active" : ""}`} href={value ? `/admin/support/knowledge?status=${value}` : "/admin/support/knowledge"}>{label}</Link>
        ))}
      </div>
      <form className="toolbar" method="get">
        <SupportSearch placeholder="Search knowledge…" defaultValue={sp.q} />
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <button className="btn" type="submit">Search</button>
      </form>
      <div className="card">
        <div className="cardhead"><strong>Article library</strong><span className="muted tiny" style={{ marginLeft: "auto" }}>{rows.length} articles</span></div>
        <div className="tablewrap"><table className="table">
          <thead><tr><th>Article</th><th>Collection</th><th>Audience</th><th>Owner</th><th>Updated</th><th>Status</th><th>Usage</th></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7}><div className="empty">No articles yet. Write the first one — published articles are suggested to agents inside matching tickets.</div></td></tr>
            ) : rows.map((a: any) => {
              const p = statusPill(a.status);
              return (
                <tr key={a.id}>
                  <td><b>{a.title}</b>{a.summary && <div className="tiny muted">{a.summary}</div>}</td>
                  <td>{a.collection}</td>
                  <td style={{ textTransform: "capitalize" }}>{a.audience}</td>
                  <td>{a.owner_name ?? "—"}</td>
                  <td>{timeAgo(a.updated_at)}</td>
                  <td><span className={`pill ${p.cls}`}>{p.label}</span></td>
                  <td>{a.usage_count ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </div></div>
  );
}
