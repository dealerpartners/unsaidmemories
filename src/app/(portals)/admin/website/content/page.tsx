import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import { ContentAddForms } from "@/components/admin/website/ContentForms";
import { getPayloadPool } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

/** Website → Content: the Payload-owned website content, read live
 *  from the `payload` schema — pages, header/footer nav, redirects,
 *  forms and media. Redirects and nav items can be added here (real
 *  endpoints); page and form editing stays in the Payload
 *  admin, which owns their block and version tables. */
export default async function WebsiteContentPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  const pool = getPayloadPool();
  let loadFailed = false;
  const safe = async (sql: string) => {
    try {
      const r = await pool.query(sql);
      return r.rows as Record<string, unknown>[];
    } catch {
      loadFailed = true;
      return [];
    }
  };
  const [pagesData, headerNavData, footerNavData, redirectsData, formsData, mediaData] = await Promise.all([
    safe(`SELECT id, title, slug, _status, updated_at FROM payload.pages ORDER BY updated_at DESC LIMIT 200`),
    safe(`SELECT id, link_label, link_url FROM payload.header_nav_items ORDER BY _order LIMIT 200`),
    safe(`SELECT id, link_label, link_url FROM payload.footer_nav_items ORDER BY _order LIMIT 200`),
    safe(`SELECT id, "from", to_url, updated_at FROM payload.redirects ORDER BY updated_at DESC LIMIT 200`),
    safe(`SELECT id, title, submit_button_label, updated_at FROM payload.forms ORDER BY updated_at DESC LIMIT 200`),
    safe(`SELECT id, filename, url, alt, created_at FROM payload.media ORDER BY created_at DESC LIMIT 100`),
  ]);
  const table = (rows: Record<string, unknown>[], cols: [string, string][]) => (
    <div className="adm-table-wrap"><table className="adm-table">
      <thead><tr>{cols.map(([h]) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={String(r.id ?? i)}>
            {cols.map(([, k]) => <td key={k}>{String(r[k] ?? "—")}</td>)}
          </tr>
        ))}
      </tbody>
    </table></div>
  );
  const section = (title: string, node: React.ReactNode, empty: string) => (
    <div className="adm-card">
      <h2>{title}</h2>
      {node}
      {empty === "empty" && <div className="adm-empty">Nothing here yet.</div>}
    </div>
  );
  return (
    <div>
      <PageHead title="Content" />
      {loadFailed && <div className="adm-card"><p className="adm-help">Some sections could not be loaded from the database right now — empty tables below may mean the database was unreachable, not that the content is missing.</p></div>}
      <div style={{ display: "grid", gap: 16, marginBottom: 16 }}>
        <ContentAddForms />
      </div>
      <div className="adm-grid adm-grid-2" style={{ alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          {section("Pages (Payload)", pagesData.length ? table(pagesData as Record<string, unknown>[], [["Title", "title"], ["Slug", "slug"], ["Status", "_status"]]) : <></>, pagesData.length ? "" : "empty")}
          {section("Redirects", redirectsData.length ? table(redirectsData as Record<string, unknown>[], [["From", "from"], ["To", "to_url"]]) : <></>, redirectsData.length ? "" : "empty")}
          {section("Forms (Payload)", formsData.length ? table(formsData as Record<string, unknown>[], [["Title", "title"], ["Button", "submit_button_label"]]) : <></>, formsData.length ? "" : "empty")}
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          {section("Header menu", headerNavData.length ? table(headerNavData as Record<string, unknown>[], [["Words", "link_label"], ["Goes to", "link_url"]]) : <></>, headerNavData.length ? "" : "empty")}
          {section("Footer menu", footerNavData.length ? table(footerNavData as Record<string, unknown>[], [["Words", "link_label"], ["Goes to", "link_url"]]) : <></>, footerNavData.length ? "" : "empty")}
          {section("Media (Payload)", mediaData.length ? table(mediaData as Record<string, unknown>[], [["File", "filename"], ["Alt", "alt"]]) : <></>, mediaData.length ? "" : "empty")}
        </div>
      </div>
      <p className="adm-help">Pages and forms are edited in the Payload admin (unsaid-cms), which owns their block and version tables — this page shows them live so you can see what shoppers get.</p>
    </div>
  );
}
